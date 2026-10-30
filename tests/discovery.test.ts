import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string) =>
  app.fetch(new Request(`https://site.test${path}`));

const text = (path: string) => get(path).then((_) => _.text());

const idOf = (path: string) => app.content.published.byPath(path)!.id;

describe('поисковики', () => {
  it('sitemap.xml — опубликованные страницы для поиска, без 404 и скрытых от поиска', async () => {
    app.content.pages.edit(idOf('/kontakty'), { searchable: false });
    const response = await get('/sitemap.xml');
    expect(response.headers.get('content-type')).toBe(
      'application/xml; charset=utf-8'
    );
    const xml = await response.text();
    expect(xml).toContain('<loc>https://site.test/</loc>');
    expect(xml).toContain('<loc>https://site.test/o-proekte</loc>');
    expect(xml).not.toContain('/kontakty');
    expect(xml).not.toContain('/404');
  });

  it('robots.txt — sitemap, закрытый менеджер, боты ИИ по настройкам', async () => {
    expect(await text('/robots.txt')).toContain(
      'Disallow: /manager\n\nSitemap: https://site.test/sitemap.xml'
    );
    app.site.settings.update({
      aiTraining: false,
      siteUrl: 'https://example.com/',
    });
    const robots = await text('/robots.txt');
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).not.toContain('OAI-SearchBot');
    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('страница получает canonical, Open Graph и JSON-LD; скрытая от поиска — noindex', async () => {
    const page = await text('/o-proekte');
    expect(page).toContain(
      '<link rel="canonical" href="https://site.test/o-proekte">'
    );
    expect(page).toContain('<meta property="og:title" content="О проекте">');
    expect(page).toContain('"@type":"WebPage"');
    expect(page.match(/name="description"/g)).toHaveLength(1);
    app.content.pages.edit(idOf('/o-proekte'), { searchable: false });
    expect(await text('/o-proekte')).toContain(
      '<meta name="robots" content="noindex">'
    );
  });

  it('старый адрес после смены алиаса ведёт на новый, новый адрес снова свободен', async () => {
    const about = idOf('/o-proekte');
    app.content.pages.edit(about, { alias: 'about' });
    const old = await get('/o-proekte');
    expect(old.status).toBe(301);
    expect(old.headers.get('location')).toBe('/about');
    app.content.pages.edit(about, { alias: 'o-proekte' });
    expect((await get('/o-proekte')).status).toBe(200);
    expect((await get('/about')).headers.get('location')).toBe('/o-proekte');
    expect(app.content.pages.oldPaths(about)).toEqual(['/about']);
  });
});

describe('ИИ', () => {
  it('llms.txt — название, описание и ссылки на Markdown-версии', async () => {
    app.site.settings.update({ description: 'Демо-сайт' });
    const llms = await text('/llms.txt');
    expect(llms).toStartWith('# Eile\n\n> Демо-сайт\n\n## Eile\n');
    expect(llms).toContain('- [Главная](https://site.test/index.md)');
    expect(llms).toContain('- [О проекте](https://site.test/o-proekte.md)');
  });

  it('Markdown-версия страницы — её содержимое без меню и разметки', async () => {
    const response = await get('/o-proekte.md');
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    const md = await response.text();
    expect(md).toStartWith('# О проекте\n\n');
    expect(md).toContain(
      'Алиас этой страницы получен из заголовка транслитерацией.'
    );
    expect(md).not.toContain('<');
    expect((await get('/index.md')).status).toBe(200);
    expect((await get('/net-takoj.md')).status).toBe(404);
  });

  it('llms-full.txt — весь текст сайта одним файлом', async () => {
    const full = await text('/llms-full.txt');
    expect(full).toContain('# О проекте\n\nURL: https://site.test/o-proekte');
    expect(full).not.toContain('[[Callout');
  });

  it('правка контента обновляет готовые файлы', async () => {
    await text('/llms.txt');
    app.content.pages.edit(idOf('/kontakty'), { title: 'Связь' });
    expect(await text('/llms.txt')).toContain('[Связь]');
  });
});
