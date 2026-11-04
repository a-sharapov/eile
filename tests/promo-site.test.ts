import { afterAll, describe, expect, it } from 'bun:test';
import { CHAPTERS_EN } from '../site/cookbook/en/index.ts';
import { CHAPTERS_RU } from '../site/cookbook/ru/index.ts';
import { SITE, TEXTS, translations } from '../site/index.ts';
import { createApp } from '../src/app.ts';
import { applyScaffold } from '../src/scaffolds/scaffold.ts';

// Промо-сайт Eile собирается на самой Eile: каждый компонент компилируется, ключи переводов есть на
// обоих языках, страницы отдаются без нераскрытых тегов.
const app = createApp();
applyScaffold(SITE, app);
translations().forEach(
  ({ 0: key, 1: values }) => void app.site.translations.save(key, values)
);
app.site.customSettings.save('version', '0.0.0-test');
// Ролик главной — только по-русски: на английской главной кнопки нет.
app.media.files.save({
  path: 'video/howto-ru.mp4',
  data: new Uint8Array([0, 0, 0, 24]),
});
app.site.settings.update({ languages: ['en'] });

afterAll(() => app.close());

const get = (path: string) =>
  app
    .fetch(new Request(`http://localhost${path}`))
    .then((_) => _.text().then((html) => ({ status: _.status, html })));

// Нет ключа перевода или своей настройки — на странице остаётся сам тег.
const _MISSING = /\{i18n\.\w+\}|\[@\w+\]|@\{/;

// id на странице одни: рамка (меню, подвал) и текст главы не должны выдать один и тот же id дважды.
const _duplicateIds = (html: string): string[] =>
  [...html.matchAll(/\sid="([^"]+)"/g)]
    .map((_) => _[1]!)
    .filter((id, index, all) => all.indexOf(id) !== index);

// Корневые классы компонентов разделов: компонент, который не загрузился, исчез бы молча.
const _BLOCKS = [
  'pains',
  'compare',
  'speed',
  'tour',
  'code',
  'inside',
  'server',
  'vs',
  'ai',
  'steps',
  'closing',
];

describe('промо-сайт', () => {
  it.each([
    ['/', 'ru', 'Весь сайт в двух файлах'],
    ['/en', 'en', 'The whole site in two files'],
  ])('%s — главная своего языка', async (path, lang, title) => {
    const { status, html } = await get(path);
    expect(status).toBe(200);
    expect(html).toContain(`<html lang="${lang}"`);
    expect(html).toContain(title);
    expect(html).not.toMatch(_MISSING);
    expect(_duplicateIds(html)).toEqual([]);
    _BLOCKS.forEach(
      (_) =>
        void expect([_, new RegExp(`class="${_} `).test(html)]).toEqual([
          _,
          true,
        ])
    );
  });

  it('ролик на русской главной: кнопка поверх скриншота открывает файл и без JS', async () => {
    const ru = await get('/');
    expect(ru.html).toMatch(/data-module="\/_cms\/islands\/DemoVideo\./);
    expect(ru.html).toMatch(/href="\/media\/video\/howto-ru\.mp4\?v=/);
    expect((await get('/en')).html).not.toContain('DemoVideo');
  });

  it('404 — своя страница со ссылками на обе главные', async () => {
    const { status, html } = await get('/no-such-page');
    expect(status).toBe(404);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/en"');
    expect(html).not.toMatch(_MISSING);
  });

  (
    [
      ['/cookbook', CHAPTERS_RU.length],
      ['/en/cookbook', CHAPTERS_EN.length],
    ] as const
  ).forEach(
    ({ 0: path, 1: count }) =>
      void it(`кукбук ${path}: оглавление и все главы, код подсвечен, теги из примеров не выполняются`, async () => {
        const book = await get(path);
        expect(book.status).toBe(200);
        const chapters = [
          ...book.html.matchAll(
            new RegExp(`<h3[^>]*><a href="(${path}/[^"]+)"`, 'g')
          ),
        ].map((_) => _[1]!);
        expect(chapters.length).toBe(count);
        const pages = await Promise.all(chapters.map(get));
        pages.forEach(({ status, html }, index) => {
          expect([chapters[index], status]).toEqual([chapters[index], 200]);
          expect(html).not.toMatch(_MISSING);
          expect(html).not.toMatch(/\[\[|\[~|\[#Form/);
          expect([chapters[index], _duplicateIds(html)]).toEqual([
            chapters[index],
            [],
          ]);
        });
        expect(pages[4]!.html).toContain('<span class="k">import</span>');
        expect(pages[4]!.html).toContain('rel="next"');
      })
  );

  it('английская главная ведёт в английский кукбук, глава — к своей русской паре', async () => {
    const { html } = await get('/en');
    expect(html).toContain('href="/en/cookbook"');
    const chapter = await get(`/en/cookbook/${CHAPTERS_EN[1]!.alias}`);
    expect(chapter.html).toContain(`/cookbook/${CHAPTERS_RU[1]!.alias}`);
  });

  it.each(['install.sh', 'install.ps1'])(
    '/%s — ссылка на скрипт последнего релиза, не в меню и не в sitemap',
    async (name) => {
      const answer = await app.fetch(new Request(`http://localhost/${name}`));
      expect(answer.status).toBe(301);
      expect(answer.headers.get('location')).toBe(
        `https://github.com/a-sharapov/eile/releases/latest/download/${name}`
      );
      const sitemap = await get('/sitemap.xml');
      expect(sitemap.html).not.toContain(name);
      const home = (await get('/')).html;
      expect(home).toContain(`https://eile.site/${name}`);
      expect(home).not.toContain(`href="/${name}"`);
    }
  );

  it('у каждого перевода есть текст на обоих языках', () => {
    Object.entries(TEXTS).forEach(
      ({ 0: key, 1: { 0: ru, 1: en } }) =>
        void expect([key, ru.length > 0, en.length > 0]).toEqual([
          key,
          true,
          true,
        ])
    );
  });
});
