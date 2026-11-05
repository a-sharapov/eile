import { afterAll, describe, expect, it } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { VERSION } from '../src/cli/version.ts';
import { zip } from '../src/platform/zip.ts';
import {
  applyScaffold,
  SCAFFOLDS,
  SCAFFOLDS_EN,
} from '../src/scaffolds/index.ts';
import {
  type BuiltPackage,
  buildPackage,
  checkPackage,
  localized,
  type PackageFiles,
  packageScaffold,
  packFiles,
  parseManifest,
  readPackageFolder,
  readPackageZip,
  scaffoldPackage,
  sha256,
  textOf,
} from '../src/scaffolds/package/index.ts';

// Пакеты каркасов (ADR 0056): формат, безопасность архива, проверка до записи, установка из папки, файла,
// по адресу и из выпуска, сборка архива и путь встроенный каркас → пакет → сайт.

const ROOT = resolve(import.meta.dir, '..');
const SAMPLE = join(ROOT, 'packages/beispiel');
const dir = mkdtempSync(join(tmpdir(), 'cms-packages-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const _bytes = (text: string) => new TextEncoder().encode(text);

const sample = (): Map<string, Uint8Array> =>
  new Map(readPackageFolder(SAMPLE).files);

const manifestOf = (files: PackageFiles) =>
  JSON.parse(textOf(files, 'manifest.json')) as Record<string, unknown>;

const withManifest = (
  files: Map<string, Uint8Array>,
  change: (manifest: Record<string, unknown>) => Record<string, unknown>
) => (
  files.set('manifest.json', _bytes(JSON.stringify(change(manifestOf(files))))),
  files
);

const codes = (problems: readonly { code: string }[]) =>
  problems.map((_) => _.code).sort();

const check = (files: PackageFiles, allowPlugins = false) =>
  checkPackage(files, { language: 'ru', allowPlugins });

const archiveOf = (files: PackageFiles) =>
  zip([...files].map(({ 0: name, 1: data }) => ({ name, data })));

// Смещение записи каталога номер `index`: подпись 0x02014b50.
const central = (archive: Uint8Array, index: number): number =>
  [...archive.keys()].filter(
    (at) =>
      at + 4 <= archive.byteLength &&
      new DataView(archive.buffer).getUint32(at, true) === 0x02014b50
  )[index]!;

type Fake = {
  readonly asked: string[];
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
};

// Лента выпусков и файлы — без сети, как зеркало GitHub: выпуск этой версии и его файлы.
const feed = (
  assets: Readonly<Record<string, Uint8Array | string>>,
  version = VERSION
): Fake => {
  const asked: string[] = [];
  return {
    asked,
    fetch: (url) => (
      asked.push(url),
      Promise.resolve(
        url.endsWith('/releases?per_page=30')
          ? Response.json([
              {
                tag_name: `v${version}`,
                html_url: 'https://mirror.example/notes',
                draft: false,
                assets: Object.keys(assets).map((name) => ({
                  name,
                  browser_download_url: `https://mirror.example/files/${name}`,
                })),
              },
            ])
          : ((name) =>
              name in assets
                ? new Response(assets[name])
                : new Response('Not Found', { status: 404 }))(
              url.split('/').at(-1) ?? ''
            )
      )
    ),
  };
};

const output: string[] = [];

const _thrown = (message: string): never => {
  throw new Error(message);
};

const context = (
  argv: readonly string[],
  extra: { fetch?: Fake['fetch']; env?: Record<string, string> } = {}
): Context =>
  ((parsed) =>
    'error' in parsed
      ? _thrown(parsed.error)
      : {
          args: parsed.args,
          options: parsed.options,
          paint: definePaint(false),
          language: 'ru' as const,
          tty: false,
          out: (_: string) => void output.push(_),
          ...(extra.fetch ? { fetch: extra.fetch } : {}),
        })(parseInvocation([...argv], extra.env ?? {}));

// Собранный пакет; проблемы сборки — провал теста с их списком.
const built = (folder: string, language = 'ru') =>
  ((result) => (
    expect('problems' in result ? result.problems : []).toEqual([]),
    result as Extract<BuiltPackage, { bytes: Uint8Array }>
  ))(buildPackage(folder, { language, plugins: false }));

const run = (
  argv: readonly string[],
  extra: Parameters<typeof context>[1] = {}
) => ((ctx) => RUN[argv[0]!]!(ctx))(context(argv, extra));

const db = (name: string) => join(dir, `${name}.db`);

const tree = (app: App) =>
  app.content.drafts.tree().map((_) => ({
    title: _.title,
    path: app.content.drafts.view(_.id)?.path,
    template: app.content.drafts.page(_.id).template,
    content: app.content.drafts
      .page(_.id)
      .content.replace(/\[~\d+~\]/g, '[~id~]'),
    hidden: app.content.drafts.page(_.id).hiddenFromMenu,
    published: _.published,
  }));

const open = <T>(path: string, read: (app: App) => T): T => {
  const app = createApp({ databasePath: path });
  try {
    return read(app);
  } finally {
    app.close();
  }
};

describe('манифест', () => {
  it('образец читается; заголовок — на языке CLI, иначе на языке пакета', () => {
    const { manifest, problems } = parseManifest(
      textOf(sample(), 'manifest.json')
    );
    expect(problems).toEqual([]);
    expect(manifest?.name).toBe('beispiel');
    expect(localized(manifest!.title, 'en', manifest!.language)).toBe(
      'Example'
    );
    expect(localized(manifest!.title, 'fr', manifest!.language)).toBe(
      'Beispiel'
    );
    expect(localized('Одной строкой', 'en', 'de')).toBe('Одной строкой');
  });

  it('ошибки схемы — все сразу и с местом', () => {
    const { manifest, problems } = parseManifest(
      JSON.stringify({
        format: 1,
        name: 'cms-linux',
        title: 'T',
        summary: { de: 1 },
        language: 'de',
        siteName: 'S',
        kit: 'Menu',
        theme: 'dunkel',
        pages: [
          { title: 'Start' },
          { title: 'X', template: 'Y', key: 'Kaputt' },
        ],
      })
    );
    expect(manifest).toBeNull();
    expect(problems.map((_) => _.message)).toEqual(
      expect.arrayContaining([
        'home is required',
        'pages[0].template is required',
        'theme is not part of the package format',
        'kit must be a list',
        expect.stringContaining('name must be'),
        expect.stringContaining('summary must be'),
        expect.stringContaining('pages[1].key must be'),
      ])
    );
    expect(new Set(problems.map((_) => _.file))).toEqual(
      new Set(['manifest.json'])
    );
  });

  it('переводы — с формата 2: строкой на языке пакета или по языкам; формат 1 читается по-прежнему', () => {
    const base = manifestOf(sample());
    expect(base.format).toBe(1);
    expect(parseManifest(JSON.stringify(base)).problems).toEqual([]);
    const translations = {
      fussKontakt: 'Kontakt',
      themen: { de: 'Küche\nBad' },
    };
    expect(
      parseManifest(JSON.stringify({ ...base, format: 2, translations }))
        .manifest?.translations
    ).toEqual(translations);
    expect(
      parseManifest(JSON.stringify({ ...base, translations })).problems.map(
        (_) => _.message
      )
    ).toEqual(['translations is part of format 2: write "format": 2']);
    expect(
      parseManifest(
        JSON.stringify({
          ...base,
          format: 2,
          translations: {
            '1kaputt': 'x',
            leer: '',
            ohneText: {},
            sprache: { Deutsch: 'x' },
            zahl: 3,
          },
        })
      ).problems.map((_) => _.message)
    ).toEqual([
      expect.stringContaining('translations key "1kaputt" must be'),
      'translations["leer"] must be a text that is not empty',
      'translations["ohneText"] has no text',
      expect.stringContaining('translations["sprache"] key "Deutsch" must be'),
      'translations["zahl"] must be a text or an object of language → text',
    ]);
  });

  it('редиректы — с формата 2: from, to, код 301 или 302, заметка', () => {
    const base = manifestOf(sample());
    const redirects = [
      { from: '/cv', to: '[~@{kontakt}~]', status: 301, note: 'alte Seite' },
      { from: '/en/*', to: '/*' },
    ] as const;
    expect(
      parseManifest(JSON.stringify({ ...base, format: 2, redirects })).manifest
        ?.redirects
    ).toEqual(redirects);
    expect(
      parseManifest(JSON.stringify({ ...base, redirects })).problems.map(
        (_) => _.message
      )
    ).toEqual(['redirects is part of format 2: write "format": 2']);
    expect(
      parseManifest(
        JSON.stringify({
          ...base,
          format: 2,
          redirects: [{ from: '/a', to: '/b', status: 307 }, { from: '/c' }],
        })
      ).problems.map((_) => _.message)
    ).toEqual([
      'redirects[0].status must be 301 or 302',
      'redirects[1].to is required',
    ]);
  });

  it('формат новее — просит обновить cms; не JSON — отказ', () => {
    expect(
      codes(parseManifest(JSON.stringify({ format: 3 })).problems)
    ).toEqual(['package.newer_format']);
    expect(codes(parseManifest('{ nope').problems)).toEqual([
      'package.invalid_manifest',
    ]);
  });
});

describe('архив: пути и пределы', () => {
  it('zip-slip, абсолютные пути, «\\», дубликаты и лишние файлы — до распаковки', () => {
    const files = new Map([
      ...sample(),
      ['../evil.md', _bytes('x')],
      ['/etc/passwd.md', _bytes('x')],
      ['C:/boot.md', _bytes('x')],
      ['media\\bilder\\x.png', _bytes('x')],
      ['media/bilder/Sonne.png', _bytes('x')],
      ['templates/./Seite.svelte', _bytes('x')],
      ['notes/todo.txt', _bytes('x')],
    ]);
    const read = readPackageZip(archiveOf(files));
    expect(read.files.size).toBe(0);
    expect(codes(read.problems)).toEqual([
      'package.duplicate',
      'package.unknown_file',
      'package.unsafe_path',
      'package.unsafe_path',
      'package.unsafe_path',
      'package.unsafe_path',
      'package.unsafe_path',
    ]);
  });

  it('символьная ссылка в архиве — отказ', () => {
    const archive = archiveOf(
      new Map([...sample(), ['media/link.png', _bytes('/etc/passwd')]])
    );
    const index = [...sample().keys(), 'media/link.png'].indexOf(
      'media/link.png'
    );
    new DataView(archive.buffer).setUint32(
      central(archive, index) + 38,
      (0o120777 << 16) >>> 0,
      true
    );
    expect(codes(readPackageZip(archive).problems)).toEqual([
      'package.symlink',
    ]);
  });

  // Символьную ссылку на Windows создаёт только администратор или режим разработчика.
  it.skipIf(process.platform === 'win32')(
    'символьная ссылка в папке — отказ',
    () => {
      const folder = join(dir, 'with-link');
      cpSync(SAMPLE, folder, { recursive: true });
      symlinkSync('/etc/hostname', join(folder, 'media/bilder/host.png'));
      expect(codes(readPackageFolder(folder).problems)).toEqual([
        'package.symlink',
      ]);
    }
  );

  it('папка верхнего уровня снимается, следы macOS и Windows не в счёт', () => {
    const files = new Map([
      ...[...sample()].map(
        ({ 0: path, 1: data }) => [`beispiel/${path}`, data] as const
      ),
      ['__MACOSX/beispiel/._manifest.json', _bytes('x')],
      ['beispiel/.DS_Store', _bytes('x')],
      ['beispiel/media/Thumbs.db', _bytes('x')],
    ]);
    const read = readPackageZip(archiveOf(files));
    expect(read.problems).toEqual([]);
    expect([...read.files.keys()].sort()).toEqual([...sample().keys()].sort());
  });

  it('пределы: размер файла по заголовку, число файлов, сам архив', () => {
    const big = archiveOf(sample());
    const at = [...sample().keys()].indexOf('media/bilder/sonne.png');
    new DataView(big.buffer).setUint32(
      central(big, at) + 24,
      26 * 1024 * 1024,
      true
    );
    expect(codes(readPackageZip(big).problems)).toEqual([
      'package.file_too_large',
    ]);

    const many = new Map([
      ...sample(),
      ...Array.from(
        { length: 1000 },
        (_, n) => [`n${n}.md`, _bytes('x')] as const
      ),
    ]);
    expect(codes(readPackageZip(archiveOf(many)).problems)).toEqual([
      'package.too_many_files',
    ]);
    expect(
      codes(readPackageZip(new Uint8Array(66 * 1024 * 1024)).problems)
    ).toEqual(['package.too_large']);
  });

  it('заниженный в заголовке размер (zip-бомба) — отказ при распаковке', () => {
    const files = new Map([
      ...sample(),
      ['media/bilder/bombe.png', new Uint8Array(8 * 1024 * 1024)],
    ]);
    const archive = archiveOf(files);
    const at = [...files.keys()].indexOf('media/bilder/bombe.png');
    new DataView(archive.buffer).setUint32(
      central(archive, at) + 24,
      1024,
      true
    );
    const read = readPackageZip(archive);
    expect(codes(read.problems)).toEqual(['archive.zip_invalid']);
    expect(read.problems[0]?.file).toBe('media/bilder/bombe.png');
  });
});

describe('проверка до записи', () => {
  it('образец проходит: что ляжет на сайт — по пробной установке', () => {
    const result = check(sample());
    expect(result.problems).toEqual([]);
    expect(result.report).toEqual({
      pages: 2,
      templates: 1,
      components: 1,
      scripts: 0,
      plugins: 0,
      fields: 0,
      forms: 0,
      media: 1,
      translations: 0,
      redirects: 0,
    });
  });

  it('ссылки на страницы, id, компоненты, формы, шаблоны и медиа — с местом', () => {
    const files = withManifest(sample(), (_) => ({
      ..._,
      settings: { seite: '@{weg}' },
      pages: [
        ...(_.pages as object[]),
        { title: 'Ohne', template: 'Fehlt', content: '<p>x</p>' },
      ],
    }));
    files.set(
      'pages/start.html',
      _bytes(
        '<a href="[~@{nope}~]">a</a> [~12~] [[Galerie]] [#Form:termin] [#Shop:x] <img src="/media/bilder/fehlt.jpg">'
      )
    );
    const result = check(files);
    expect(codes(result.problems)).toEqual([
      'package.numeric_link',
      'package.unknown_component',
      'package.unknown_form',
      'package.unknown_form',
      'package.unknown_media',
      'package.unknown_page',
      'package.unknown_page',
      'package.unknown_template',
    ]);
    expect(
      result.problems.find((_) => _.code === 'package.unknown_component')?.file
    ).toBe('pages/start.html');
    expect(
      result.problems.find((_) => _.code === 'package.unknown_template')
        ?.message
    ).toContain('pages[2]');
  });

  it('элементы — проверкой cms elements check: файл, строка, код', () => {
    const files = sample();
    files.set('components/Bild.svelte', _bytes('<p>\n{#if}\n</p>'));
    const problem = check(files).problems[0];
    expect(problem).toMatchObject({
      file: 'components/Bild.svelte',
      code: 'design.compile_failed',
      line: 2,
    });
  });

  it('набор, медиатека и неиспользованный текст страницы', () => {
    const files = withManifest(sample(), (_) => ({ ..._, kit: ['Nope'] }));
    files.set('media/Bild.png', _bytes('x'));
    files.set('media/programm.exe', _bytes('x'));
    files.set('pages/alt.html', _bytes('<p>alt</p>'));
    expect(codes(check(files).problems)).toEqual([
      'media.invalid_path',
      'media.unsupported_type',
      'package.unknown_kit',
      'package.unused_file',
    ]);
  });

  it('плагины — код сервера: без разрешения проблема, с ним — проходят', () => {
    const files = sample();
    files.set(
      'plugins/Zaehler.ts',
      _bytes('export default { render: (html: string) => html };')
    );
    expect(codes(check(files).problems)).toEqual(['package.plugins_refused']);
    expect(check(files, true).report?.plugins).toBe(1);
  });

  it('язык перевода — язык пакета или его ветки; @{key} в переводе — только на страницу пакета', () => {
    const files = withManifest(sample(), (_) => ({
      ..._,
      format: 2,
      translations: {
        gruss: { de: 'Hallo', fr: 'Salut' },
        link: 'Siehe @{weg}',
      },
    }));
    const result = check(files);
    expect(codes(result.problems)).toEqual([
      'package.unknown_language',
      'package.unknown_page',
    ]);
    expect(result.problems[0]?.message).toBe(
      'translations.gruss: fr is neither the package language (de) nor the language of a page'
    );
    // Ветка на английском — английский текст перевода на месте.
    const english = withManifest(sample(), (_) => ({
      ..._,
      format: 2,
      translations: { gruss: { de: 'Hallo', en: 'Hello' } },
      pages: [
        ...(_.pages as object[]),
        { key: 'en', title: 'English', template: 'Seite', language: 'en' },
      ],
    }));
    expect(check(english).problems).toEqual([]);
    expect(check(english).report?.translations).toBe(1);
  });

  it('переводы ставятся с пакетом: строка — на языке пакета, @{key} — id, языки веток — языки сайта', () => {
    const files = withManifest(sample(), (_) => ({
      ..._,
      format: 2,
      translations: {
        fussKontakt: 'Kontakt',
        gruss: { de: 'Hallo', en: 'Hello' },
        kontaktId: '@{kontakt}',
      },
      pages: [
        ...(_.pages as object[]),
        { title: 'English', template: 'Seite', language: 'en' },
      ],
    }));
    const app = createApp();
    applyScaffold(check(files).scaffold!, app);
    const kontakt = app.content.drafts
      .tree()
      .find((_) => _.title === 'Kontakt')!;
    expect(
      app.site.translations
        .list()
        .map((_) => ({ key: String(_.key), values: _.values }))
    ).toEqual([
      { key: 'fussKontakt', values: { de: 'Kontakt' } },
      { key: 'gruss', values: { de: 'Hallo', en: 'Hello' } },
      { key: 'kontaktId', values: { de: String(kontakt.id) } },
    ]);
    expect(app.site.settings.get().languages).toEqual(['en']);
    app.close();
  });

  it('редиректы проверяются, как в менеджере: цепочки, служебные адреса, id и ключи — до записи', () => {
    const withRedirects = (redirects: object[]) =>
      check(withManifest(sample(), (_) => ({ ..._, format: 2, redirects })))
        .problems;
    expect(
      codes(
        withRedirects([
          { from: '/alt', to: '[~12~]' },
          { from: '/weg', to: '[~@{nope}~]' },
        ])
      )
    ).toEqual(['package.numeric_link', 'package.unknown_page']);
    expect(
      codes(
        withRedirects([
          { from: '/a', to: '/b' },
          { from: '/b', to: '/kontakt' },
        ])
      )
    ).toEqual(['redirects.chain']);
    expect(
      codes(withRedirects([{ from: '/manager/x', to: '/kontakt' }]))
    ).toEqual(['redirects.reserved']);
    expect(
      codes(
        withRedirects([
          { from: '/a', to: '/kontakt' },
          { from: '/a/', to: '/' },
        ])
      )
    ).toEqual(['redirects.rule_exists']);
  });

  it('ссылки @{key} при установке становятся id', () => {
    const app = createApp();
    const result = check(sample());
    applyScaffold(result.scaffold!, app);
    const { 0: start, 1: kontakt } = app.content.drafts.tree();
    expect(app.content.drafts.page(start!.id).content).toContain(
      `[~${kontakt!.id}~]`
    );
    expect(app.site.customSettings.value('kontaktSeite')).toBe(
      String(kontakt!.id)
    );
    expect(app.site.settings.get().homePageId).toBe(start!.id);
    expect(
      app.media.files.list().find((_) => _.path === 'bilder/sonne.png')?.alt
    ).toBe('Eine Sonne über einem grünen Hügel');
    app.close();
  });
});

describe('cms new <пакет>', () => {
  const zipPath = join(dir, 'beispiel.zip');
  writeFileSync(zipPath, packFiles(sample()));
  const hash = sha256(new Uint8Array(readFileSync(zipPath)));

  it('из папки и из архива — один сайт; варианты картинки сделал сервер', async () => {
    await run(['new', SAMPLE, '--db', db('folder')]);
    await run(['new', zipPath, '--db', db('zip')]);
    expect(output.join('\n')).toContain(`SHA-256 ${hash}`);
    const fromFolder = open(db('folder'), tree);
    expect(open(db('zip'), tree)).toEqual(fromFolder);
    expect(fromFolder.map((_) => _.title)).toEqual(['Start', 'Kontakt']);
    expect(
      open(db('zip'), (app) =>
        app.media.files.list().map((_): string => _.path)
      )
    ).toEqual(['bilder/sonne.png', 'bilder/sonne@480.webp']);
    expect(open(db('zip'), (app) => app.site.settings.get()).language).toBe(
      'de'
    );
  });

  it('переводы и настройка в несколько строк: из папки на сайт, t(key) и site.custom.key в шаблоне', async () => {
    const folder = join(dir, 'with-translations');
    cpSync(SAMPLE, folder, { recursive: true });
    const manifest = JSON.parse(
      readFileSync(join(folder, 'manifest.json'), 'utf8')
    );
    writeFileSync(
      join(folder, 'manifest.json'),
      JSON.stringify(
        {
          ...manifest,
          format: 2,
          settings: {
            ...manifest.settings,
            kontakte:
              'phone | +49 30 000000 | tel:+4930000000\nmail | hallo@example.com | mailto:hallo@example.com',
          },
          translations: {
            fussKontakt: 'Kontakt',
            themen: 'Küche\nBad\nWohnzimmer',
          },
          redirects: [
            { from: '/cv', to: '[~@{kontakt}~]', note: 'alte Adresse' },
            { from: '/en/*', to: '/*', status: 302 },
            { from: '/index', to: '/' },
          ],
        },
        null,
        2
      )
    );
    writeFileSync(
      join(folder, 'templates/Seite.svelte'),
      readFileSync(join(folder, 'templates/Seite.svelte'), 'utf8')
        .replace(
          '<a href={contact}>Kontakt</a>',
          `<a href={contact}>{t('fussKontakt')}</a>
  <ul class="themen">{#each t('themen').split('\\n') as thema (thema)}<li>{thema}</li>{/each}</ul>
  <ul class="kontakte">{#each site.custom.kontakte.split('\\n') as line (line)}<li>{line.split(' | ')[1]}</li>{/each}</ul>`
        )
        .replace(
          "import { children, link } from '$core';",
          "import { children, link, t } from '$core';"
        )
    );
    output.length = 0;
    await run(['new', folder, '--db', db('translations')]);
    expect(output.join('\n')).toMatch(/Переводы\s+ключей 2/);
    expect(output.join('\n')).toMatch(/Редиректы\s+правил 3/);
    const app = createApp({ databasePath: db('translations') });
    const html = await app
      .fetch(new Request('http://localhost/'))
      .then((_) => _.text());
    expect(html).toContain('>Kontakt</a>');
    expect(html).toContain(
      '<ul class="themen"><li>Küche</li><li>Bad</li><li>Wohnzimmer</li></ul>'
    );
    expect(html).toContain(
      '<ul class="kontakte"><li>+49 30 000000</li><li>hallo@example.com</li></ul>'
    );
    expect(app.site.customSettings.value('kontakte')?.split('\n')).toHaveLength(
      2
    );
    const location = (path: string) =>
      app
        .fetch(new Request(`http://localhost${path}`))
        .then((_) => `${_.status} ${_.headers.get('location')}`);
    expect(await location('/cv')).toBe('301 /kontakt');
    expect(await location('/en/kontakt')).toBe('302 /kontakt');
    expect(await location('/index')).toBe('301 /');
    expect(app.redirects.rules.list().map((_) => _.note)).toContain(
      'alte Adresse'
    );
    app.close();
  });

  it('сайт со своей работой пакет не трогает; --check ничего не пишет', async () => {
    expect(run(['new', zipPath, '--db', db('zip')])).rejects.toThrow(
      'уже есть сайт'
    );
    output.length = 0;
    await run(['new', zipPath, '--check', '--db', db('checked')]);
    expect(output.join('\n')).toContain('ничего не записано');
    expect(existsSync(db('checked'))).toBe(false);
  });

  it('проблемы печатаются строками cms elements check, сайт не создаётся', async () => {
    const folder = join(dir, 'broken');
    cpSync(SAMPLE, folder, { recursive: true });
    writeFileSync(join(folder, 'pages/start.html'), '[[Galerie]]');
    output.length = 0;
    expect(run(['new', folder, '--db', db('broken')])).rejects.toThrow(
      'Пакет не поставлен: проблем 1'
    );
    await Bun.sleep(0);
    expect(output.join('\n')).toContain('✗ pages/start.html');
    expect(existsSync(db('broken'))).toBe(false);
  });

  it('по адресу — только с --sha256: без неё ни одного запроса', async () => {
    const fake = feed({ 'beispiel.zip': packFiles(sample()) });
    const url = 'https://packages.example/beispiel.zip';
    expect(
      run(['new', url, '--db', db('url-none')], { fetch: fake.fetch })
    ).rejects.toThrow('--sha256');
    expect(
      run(['new', url, '--sha256', '0'.repeat(64), '--db', db('url-bad')], {
        fetch: fake.fetch,
      })
    ).rejects.toMatchObject({ code: 'package.checksum_mismatch' });
    await Bun.sleep(0);
    expect(fake.asked).toEqual([url]);
    expect(existsSync(db('url-bad'))).toBe(false);
    await run(['new', url, '--sha256', hash.toUpperCase(), '--db', db('url')], {
      fetch: fake.fetch,
    });
    expect(open(db('url'), tree).map((_) => _.title)).toEqual([
      'Start',
      'Kontakt',
    ]);
    expect(output.join('\n')).toContain('совпала с --sha256');
  });

  it('по http с чужой машины — отказ до скачивания', async () => {
    const fake = feed({ 'beispiel.zip': packFiles(sample()) });
    expect(
      run(
        [
          'new',
          'http://packages.example/beispiel.zip',
          '--sha256',
          hash,
          '--db',
          db('http'),
        ],
        { fetch: fake.fetch }
      )
    ).rejects.toThrow('https');
    await Bun.sleep(0);
    expect(fake.asked).toEqual([]);
  });

  it('официальный пакет по имени — из выпуска этой версии, с ленты CMS_RELEASES_URL', async () => {
    const fake = feed({
      'cms-linux-x64.gz': 'binary',
      'beispiel.zip': packFiles(sample()),
      SHA256SUMS: `${'1'.repeat(64)}  cms-linux-x64.gz\n${hash}  beispiel.zip\n`,
    });
    output.length = 0;
    await run(['new', 'beispiel', '--db', db('official')], {
      fetch: fake.fetch,
      env: { CMS_RELEASES_URL: 'https://mirror.example/api' },
    });
    expect(fake.asked[0]).toBe(
      'https://mirror.example/api/repos/a-sharapov/eile/releases?per_page=30'
    );
    expect(output.join('\n')).toContain(`из выпуска v${VERSION}`);
    expect(open(db('official'), tree).map((_) => _.title)).toEqual([
      'Start',
      'Kontakt',
    ]);
  });

  it('официальный пакет: сумма не совпала с SHA256SUMS — отказ, сайт не тронут', async () => {
    const fake = feed({
      'beispiel.zip': packFiles(sample()),
      SHA256SUMS: `${'2'.repeat(64)}  beispiel.zip\n`,
    });
    expect(
      run(['new', 'beispiel', '--db', db('mismatch')], { fetch: fake.fetch })
    ).rejects.toMatchObject({ code: 'package.checksum_mismatch' });
    await Bun.sleep(0);
    expect(existsSync(db('mismatch'))).toBe(false);
  });

  it('имени нет ни среди встроенных, ни в выпуске — «Нет каркаса»', async () => {
    const fake = feed({ 'beispiel.zip': packFiles(sample()), SHA256SUMS: '' });
    expect(
      run(['new', 'wiki', '--db', db('wiki')], { fetch: fake.fetch })
    ).rejects.toThrow('Нет каркаса «wiki»');
    expect(
      run(['new', 'beispiel', '--db', db('old')], {
        fetch: feed({}, '0.0.1').fetch,
      })
    ).rejects.toThrow('нет версии этой cms');
  });

  it('плагины: без --allow-plugins — отказ; с ним — предупреждение и плагин на сайте', async () => {
    const folder = join(dir, 'plugins');
    cpSync(SAMPLE, folder, { recursive: true });
    mkdirSync(join(folder, 'plugins'));
    writeFileSync(
      join(folder, 'plugins/Zaehler.ts'),
      'export default { render: (html: string) => html };'
    );
    expect(run(['new', folder, '--db', db('no-plugins')])).rejects.toThrow(
      'Пакет не поставлен'
    );
    output.length = 0;
    await run(['new', folder, '--allow-plugins', '--db', db('plugins')]);
    expect(output.join('\n')).toContain(
      'Пакет из сети с плагинами не ставьте никогда'
    );
    expect(
      open(db('plugins'), (app) =>
        app.extensions.plugins.list().map((_): string => _.name)
      )
    ).toEqual(['Zaehler']);
  });
});

describe('cms scaffold pack', () => {
  it('один архив при каждой сборке: порядок, время, переводы строк', () => {
    const once = built(SAMPLE);
    expect(built(SAMPLE, 'en').bytes).toEqual(once.bytes);
    // Порядок, в котором файлы прочитаны, на архив не влияет.
    expect(packFiles(new Map([...once.files].toReversed()))).toEqual(
      once.bytes
    );
    // Та же папка после git на Windows: CRLF и BOM в текстах.
    const windows = join(dir, 'crlf');
    cpSync(SAMPLE, windows, { recursive: true });
    readdirSync(windows, { recursive: true, withFileTypes: true })
      .filter((_) => _.isFile() && /\.(json|html|svelte)$/.test(_.name))
      .forEach(
        (_) =>
          void ((path) =>
            writeFileSync(
              path,
              `\uFEFF${readFileSync(path, 'utf8').replaceAll('\n', '\r\n')}`
            ))(join(_.parentPath, _.name))
      );
    expect(built(windows).sha256).toBe(once.sha256);
    // С переводами в несколько строк — так же: перевод строки внутри JSON — \n, а не байт CR.
    const translated = join(dir, 'pack-translations');
    cpSync(SAMPLE, translated, { recursive: true });
    writeFileSync(
      join(translated, 'manifest.json'),
      JSON.stringify(
        {
          ...JSON.parse(readFileSync(join(SAMPLE, 'manifest.json'), 'utf8')),
          format: 2,
          translations: { themen: 'Küche\nBad', gruss: { de: 'Hallo' } },
        },
        null,
        2
      )
    );
    const first = built(translated);
    cpSync(translated, `${translated}-crlf`, { recursive: true });
    writeFileSync(
      join(`${translated}-crlf`, 'manifest.json'),
      readFileSync(join(translated, 'manifest.json'), 'utf8').replaceAll(
        '\n',
        '\r\n'
      )
    );
    expect(built(`${translated}-crlf`).sha256).toBe(first.sha256);
    expect(built(translated).bytes).toEqual(first.bytes);
    expect(first.report.translations).toBe(2);
  });

  it('пишет архив и печатает сумму; собранный архив рядом не мешает', async () => {
    const folder = join(dir, 'pack-here');
    cpSync(SAMPLE, folder, { recursive: true });
    output.length = 0;
    await run(['scaffold', 'pack', folder, '-o', join(folder, 'beispiel.zip')]);
    await run(['scaffold', 'pack', folder, '-o', join(dir, 'again.zip')]);
    expect(readFileSync(join(folder, 'beispiel.zip'))).toEqual(
      readFileSync(join(dir, 'again.zip'))
    );
    expect(output.join('\n')).toContain(
      `SHA-256       ${sha256(new Uint8Array(readFileSync(join(dir, 'again.zip'))))}`
    );
  });

  it('scripts/release.ts packages: тот же архив и строка SHA256SUMS', () => {
    const out = join(dir, 'release');
    const result = Bun.spawnSync(
      ['bun', join(ROOT, 'scripts/release.ts'), 'packages', '--out', out],
      { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' }
    );
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    const expected = built(SAMPLE);
    // Строка на каждый пакет packages/*, по порядку имён; образец — среди них.
    const sums = readFileSync(join(out, 'SHA256SUMS'), 'utf8');
    expect(sums).toContain(`${expected.sha256}  beispiel.zip\n`);
    expect(sums).toMatch(/^[0-9a-f]{64} {2}kuechenstudio\.zip$/m);
    expect(
      sha256(new Uint8Array(readFileSync(join(out, 'beispiel.zip'))))
    ).toBe(expected.sha256);
  });
});

describe('встроенный каркас → пакет → сайт', () => {
  const builtIn = (scaffold: (typeof SCAFFOLDS)[number]) => {
    const app = createApp({ scaffold });
    return app;
  };

  it.each(
    [...SCAFFOLDS, ...SCAFFOLDS_EN].map(
      (_) => [`${_.name} ${_.language ?? 'ru'}`, _] as const
    )
  )(
    '%s: те же страницы, элементы, формы, поля и настройки',
    (_label, scaffold) => {
      const read = readPackageZip(packFiles(scaffoldPackage(scaffold)));
      expect(read.problems).toEqual([]);
      const result = check(read.files);
      expect(result.problems).toEqual([]);
      const direct = builtIn(scaffold);
      const viaPackage = createApp();
      applyScaffold(result.scaffold!, viaPackage);
      const snapshot = (app: App) => ({
        tree: tree(app),
        fields: app.content.drafts
          .tree()
          .map((_) => app.content.drafts.page(_.id).fields),
        elements: app.design.elements
          .list()
          .map((_) => [
            _.kind,
            _.name,
            app.design.elements.get(_.kind, _.name)?.source,
          ]),
        forms: app.forms.forms
          .list()
          .map((_) => app.forms.forms.get(_.name)?.source),
        fieldList: app.content.fields.list(),
        settings: app.site.customSettings.list(),
        translations: app.site.translations.list(),
        redirects: app.redirects.rules.list().map((_) => [_.from, _.to]),
        site: ((_) => ({
          name: _.name,
          language: _.language,
          languages: _.languages,
          description: _.description,
        }))(app.site.settings.get()),
      });
      expect(snapshot(viaPackage)).toEqual(snapshot(direct));
      direct.close();
      viaPackage.close();
    }
  );

  it('редиректы туда и обратно без потерь: цель-страница — ключом', () => {
    const blog = SCAFFOLDS[0]!;
    const redirects = [
      { from: '/old-blog/*', to: '/blog/*', status: 302, note: 'старый блог' },
      { from: '/about-us', to: `[~@{${blog.home}}~]` },
    ];
    const files = scaffoldPackage({ ...blog, redirects });
    expect(manifestOf(files).format).toBe(2);
    expect(manifestOf(files).redirects).toEqual(redirects);
    const result = check(readPackageZip(packFiles(files)).files);
    expect(result.problems).toEqual([]);
    expect(result.report?.redirects).toBe(2);
    expect(textOf(scaffoldPackage(result.scaffold!), 'manifest.json')).toBe(
      textOf(files, 'manifest.json')
    );
    const app = createApp();
    applyScaffold(result.scaffold!, app);
    expect(
      app.redirects.rules.list().map((_) => `${_.from} ${_.to} ${_.status}`)
    ).toEqual([
      `/about-us [~${app.site.settings.get().homePageId}~] 301`,
      '/old-blog/* /blog/* 302',
    ]);
    app.close();
  });

  it('переводы туда и обратно без потерь; без переводов — формат 1, с ними — 2', () => {
    const blog = SCAFFOLDS[0]!;
    expect(manifestOf(scaffoldPackage(blog)).format).toBe(1);
    const translations = {
      menuHome: 'Главная',
      topics: { ru: 'Кухня\nВанная', en: 'Kitchen\nBath' },
    };
    const files = scaffoldPackage({
      ...blog,
      translations,
      pages: [
        ...blog.pages,
        { title: 'English', template: 'Page', language: 'en' },
      ],
    });
    expect(manifestOf(files).format).toBe(2);
    expect(manifestOf(files).translations).toEqual(translations);
    const result = check(readPackageZip(packFiles(files)).files);
    expect(result.problems).toEqual([]);
    expect(result.scaffold?.translations).toEqual(translations);
    expect(textOf(scaffoldPackage(result.scaffold!), 'manifest.json')).toBe(
      textOf(files, 'manifest.json')
    );
  });

  it('cms scaffold export: папка пакета ставится cms new; непустая — только с --force', async () => {
    const folder = join(dir, 'export-blog');
    await run(['scaffold', 'export', 'blog', folder]);
    expect(existsSync(join(folder, 'manifest.json'))).toBe(true);
    expect(
      parseManifest(readFileSync(join(folder, 'manifest.json'), 'utf8'))
        .manifest?.title
    ).toEqual({ ru: 'Блог', en: 'Blog' });
    expect(run(['scaffold', 'export', 'blog', folder])).rejects.toThrow(
      'не пуста'
    );
    await run(['scaffold', 'export', 'blog', folder, '--force']);
    await run(['new', folder, '--db', db('exported')]);
    const direct = builtIn(SCAFFOLDS[0]!);
    expect(open(db('exported'), tree)).toEqual(tree(direct));
    direct.close();
  });
});

describe('release.yml', () => {
  const workflow = Bun.YAML.parse(
    readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8')
  ) as {
    jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
  };

  it('публикация ставит зависимости до упаковки: пакеты проверяются компилятором Svelte', () => {
    const steps = workflow.jobs.publish!.steps;
    const install = steps.findIndex(
      (_) => _.run === 'bun install --frozen-lockfile'
    );
    const pack = steps.findIndex((_) =>
      _.run?.includes('scripts/release.ts pack')
    );
    expect(install).toBeGreaterThan(-1);
    expect(pack).toBeGreaterThan(install);
  });

  it('пакеты <имя>.zip уходят в выпуск вместе с SHA256SUMS', () => {
    const release = workflow.jobs.publish!.steps.find((_) =>
      _.run?.includes('gh release create')
    );
    expect(release?.run).toContain('dist/release/*.zip');
    expect(release?.run).toContain('dist/release/SHA256SUMS');
    expect(
      workflow.jobs.check!.steps.some((_) => _.run === 'bun run check')
    ).toBe(true);
  });
});
