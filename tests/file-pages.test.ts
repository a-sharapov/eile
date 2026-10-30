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

const idOf = (path: string) => app.content.published.byPath(path)!.id;

const file = (alias: string, contentType: string, content: string) =>
  app.content.pages.create({
    title: alias,
    alias,
    template: 'Base',
    contentType,
    content,
    publish: true,
  });

describe('страницы-файлы', () => {
  it('CSS отдаётся своим типом и текстом без шаблона, со ссылками на страницы', async () => {
    file(
      'style.css',
      'text/css',
      `a[href="[~${idOf('/kontakty')}~]"] { color: red; }`
    );
    const first = await get('/style.css');
    expect(first.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(first.headers.get('x-cache')).toBe('miss');
    expect(await first.text()).toBe('a[href="/kontakty"] { color: red; }');
    const again = await get('/style.css');
    expect(again.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(again.headers.get('x-cache')).toBe('hit');
  });

  it('лента собирается компонентом: XML без маркеров Svelte, текст экранирован', async () => {
    app.design.components.save(
      'Item',
      '<script>let { title } = $props();</script><item><title>{title}</title></item>'
    );
    file(
      'feed.xml',
      'application/rss+xml',
      '<?xml version="1.0"?>\n<rss>[[Item title="A & B"]]</rss>'
    );
    const response = await get('/feed.xml');
    expect(response.headers.get('content-type')).toBe(
      'application/rss+xml; charset=utf-8'
    );
    expect(await response.text()).toBe(
      '<?xml version="1.0"?>\n<rss><item><title>A &amp; B</title></item></rss>'
    );
  });

  it('своя страница robots.txt важнее готового файла', async () => {
    file('robots.txt', 'text/plain', 'User-agent: *\nDisallow: /');
    const response = await get('/robots.txt');
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8'
    );
    expect(await response.text()).toBe('User-agent: *\nDisallow: /');
  });

  it('файлы не попадают в меню, sitemap.xml и Markdown-версии', async () => {
    const id = file('logo.svg', 'image/svg+xml', '<svg/>');
    expect(app.content.published.children(null).map((_) => _.id)).not.toContain(
      id
    );
    expect(
      app.content.published
        .children(null, { includeHidden: true })
        .map((_) => _.id)
    ).toContain(id);
    expect(await (await get('/sitemap.xml')).text()).not.toContain('logo.svg');
    expect((await get('/logo.svg.md')).status).toBe(404);
  });

  it('HTML-страница по-прежнему рендерится шаблоном', async () => {
    const response = await get('/kontakty');
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(await response.text()).toStartWith('<!doctype html>');
  });
});
