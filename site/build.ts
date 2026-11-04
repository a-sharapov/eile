// Собирает промо-сайт Eile в отдельную базу: `bun run site [--db eile.db] [--url https://eile.site] [--force]`.
// Сайт сделан на самой Eile: каркас из site/index.ts, шрифты и скриншоты — в медиатеку.
import { resolve } from 'node:path';
import { createApp } from '../src/app.ts';
import { VERSION } from '../src/cli/version.ts';
import { applyScaffold } from '../src/scaffolds/scaffold.ts';
import { SITE, translations } from './index.ts';

const _ROOT = resolve(import.meta.dir, '..');

type Options = {
  readonly db: string;
  readonly url: string;
  readonly force: boolean;
};

const _value = (args: readonly string[], flag: string): string | undefined =>
  ((index) => (index < 0 ? undefined : args[index + 1]))(args.indexOf(flag));

const _options = (args: readonly string[]): Options => ({
  db: resolve(_value(args, '--db') ?? 'eile.db'),
  url: (_value(args, '--url') ?? 'https://eile.site').replace(/\/+$/, ''),
  force: args.includes('--force'),
});

type Asset = {
  readonly path: string;
  readonly from: string;
  /** Уменьшенные копии `name@960.webp` для srcset. */
  readonly widths?: readonly number[];
  readonly alt?: string;
};

// Снимки менеджера над сайтом студии «Фасад» из кукбука — на языке главной, светлый и тёмный. Для
// телефона — крупные кадры из них (site/assets/screens): весь менеджер на 390 px не прочитать.
const _SCREENS: readonly Asset[] = (['ru', 'en'] as const).flatMap((lang) =>
  (['editor', 'overview'] as const).flatMap((name) =>
    (['light', 'dark'] as const).flatMap((scheme) => [
      {
        path: `screens/${name}-${lang}-${scheme}.webp`,
        from: `site/assets/screens/${name}-${lang}-${scheme}.webp`,
        widths: [960, 1440],
      },
      {
        path: `screens/${name}-${lang}-m-${scheme}.webp`,
        from: `site/assets/screens/${name}-${lang}-m-${scheme}.webp`,
      },
    ])
  )
);

// Снимки кукбука: экраны менеджера (светлый и тёмный) и страницы сайта кухонной студии (только светлые).
const _COOKBOOK: readonly Asset[] = Array.from(
  new Bun.Glob('*.webp').scanSync(resolve(_ROOT, 'site/assets/cookbook'))
).map((file) => ({
  path: `screens/cook-${file}`,
  from: `site/assets/cookbook/${file}`,
  widths: [960, 1440],
}));

const _FONTS: readonly Asset[] = [
  'geologica-cyrillic',
  'geologica-latin',
  'onest-cyrillic',
  'onest-latin',
  'jetbrains-mono-cyrillic',
  'jetbrains-mono-latin',
].map((name) => ({
  path: `fonts/${name}.woff2`,
  from: `site/assets/fonts/${name}.woff2`,
}));

const _ASSETS: readonly Asset[] = [
  ..._SCREENS,
  ..._COOKBOOK,
  ..._FONTS,
  { path: 'brand/favicon.svg', from: 'manager/static/favicon.svg' },
  ...(['ai', 'ai-en'] as const).flatMap((name) =>
    (['light', 'dark'] as const).map((scheme) => ({
      path: `screens/${name}-${scheme}.webp`,
      from: `site/assets/screens/${name}-${scheme}.webp`,
      widths: [960, 1440],
    }))
  ),
  ...(['ru', 'en'] as const).flatMap((lang) =>
    (['mp4', 'webm', 'webp'] as const).map((ext) => ({
      path: `video/howto-${lang}.${ext}`,
      from: `site/assets/video/howto-${lang}.${ext}`,
    }))
  ),
  {
    path: 'brand/og.png',
    from: 'site/assets/og.png',
    alt: 'Знак Eile, заголовок «Весь сайт в двух файлах» и скриншот менеджера',
  },
];

type Upload = {
  readonly path: string;
  readonly data: Uint8Array;
  readonly width: number | null;
  readonly height: number | null;
};

const _IMAGE = /\.(webp|png|jpe?g)$/;

const _uploads = (asset: Asset): Promise<Upload[]> =>
  Bun.file(resolve(_ROOT, asset.from))
    .bytes()
    .then((data) =>
      _IMAGE.test(asset.path)
        ? new Bun.Image(data).metadata().then(({ width, height }) =>
            Promise.all(
              (asset.widths ?? []).map((size) =>
                new Bun.Image(data)
                  .resize(size, undefined, { fit: 'inside' })
                  .webp({ quality: 86 })
                  .bytes()
                  .then((variant) => ({
                    path: asset.path.replace(/\.\w+$/, `@${size}.webp`),
                    data: variant,
                    width: size,
                    height: Math.round((height * size) / width),
                  }))
              )
            ).then((variants) => [
              { path: asset.path, data, width, height },
              ...variants,
            ])
          )
        : [{ path: asset.path, data, width: null, height: null }]
    );

const _clear = (db: string): Promise<unknown> =>
  Promise.all(
    ['', '-wal', '-shm'].map((suffix) =>
      Bun.file(`${db}${suffix}`)
        .exists()
        .then((found) =>
          found ? Bun.file(`${db}${suffix}`).delete() : undefined
        )
    )
  );

const _build = (options: Options): Promise<string> =>
  Promise.all(_ASSETS.map(_uploads)).then((uploads) => {
    const app = createApp({ databasePath: options.db, updateCheck: false });
    return Promise.resolve()
      .then(() => {
        const report = applyScaffold(SITE, app);
        uploads.flat().forEach((_) => void app.media.files.save(_));
        _ASSETS.forEach(
          (_) => void (_.alt && app.media.files.describe(_.path, _.alt))
        );
        translations().forEach(
          ({ 0: key, 1: values }) =>
            void app.site.translations.save(key, values)
        );
        app.site.customSettings.save('version', VERSION);
        app.site.settings.update({
          languages: ['en'],
          siteUrl: options.url,
          socialImage: 'brand/og.png',
        });
        return `Сайт Eile — в ${options.db}: страниц ${report.pages}, компонентов ${report.components}, файлов ${uploads.flat().length}, переводов ${translations().length}.\nЗапуск: cms --db ${options.db}`;
      })
      .finally(() => app.close());
  });

const _main = (args: readonly string[]): Promise<void> =>
  ((options) =>
    Bun.file(options.db)
      .exists()
      .then((found) =>
        found && !options.force
          ? Promise.reject(
              new Error(
                `${options.db} уже есть. Пересобрать заново: bun run site --force`
              )
            )
          : _clear(options.db)
      )
      .then(() => _build(options))
      .then((_) => void console.log(_)))(_options(args));

_main(Bun.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
