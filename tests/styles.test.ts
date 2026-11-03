import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Стили шаблонов и компонентов — файлами с хэшем, а не `<style>` в каждой странице (ADR 0047).

let app: App;

const CARD =
  '<script>let { text = \'\' } = $props();</script><p class="card">{text}</p><style>.card { color: tomato; }</style>';

// Правило на весь документ: такому компоненту — свой файл, и только там, где он нарисован.
const DARK =
  '<div class="dark"></div><style>:global(body) { background: black; } .dark { height: 1px; }</style>';

const BASE = `<script>
  import Card from '$components/Card';
  import Dark from '$components/Dark';
  let { page } = $props();
</script>
<h1>{page.title}</h1>
<Card text={page.title} />
{#if page.title === 'Контакты'}<Dark />{/if}
<style>h1 { margin: 0; }</style>`;

const get = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`http://localhost${path}`, init));

const page = (path: string) => get(path).then((_) => _.text());

const headOf = (html: string): string =>
  html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

const linksOf = (html: string): string[] =>
  [
    ...headOf(html).matchAll(
      /<link rel="stylesheet" href="(\/_cms\/styles\/[^"]+)">/g
    ),
  ].map((_) => _[1]!);

const siteFile = (html: string): string =>
  linksOf(html).find((_) => _.startsWith('/_cms/styles/site.'))!;

const cssOf = (html: string): Promise<string> =>
  Promise.all(linksOf(html).map((_) => get(_).then((r) => r.text()))).then(
    (_) => _.join('\n')
  );

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
  app.design.components.save('Card', CARD);
  app.design.components.save('Dark', DARK);
  app.design.templates.save('Base', BASE);
});

afterEach(() => app.close());

describe('стили сайта файлами', () => {
  it('в странице нет <style> компонентов: ссылки в head, классы страницы — в файлах', async () => {
    const html = await page('/o-proekte');
    expect(html).not.toContain('<style');
    expect(linksOf(html)).toEqual([
      expect.stringMatching(/^\/_cms\/styles\/site\.[a-z0-9]+\.css$/),
    ]);
    const css = await cssOf(html);
    const card = /<p class="card (svelte-[a-z0-9]+)">/.exec(html)![1]!;
    const title = /<h1 class="(svelte-[a-z0-9]+)">/.exec(html)![1]!;
    expect(css).toContain(`.card.${card}`);
    expect(css).toContain(`h1.${title}`);
  });

  it('файл: text/css, nosniff, навсегда, ETag и 304; HEAD без тела; другие методы — 405', async () => {
    const url = siteFile(await page('/o-proekte'));
    const response = await get(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/css; charset=utf-8'
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    const etag = response.headers.get('etag')!;
    const css = await response.text();
    expect(etag).toBe(`"${/site\.([a-z0-9]+)\.css$/.exec(url)![1]}"`);
    expect(
      (await get(url, { headers: { 'if-none-match': etag } })).status
    ).toBe(304);
    const head = await get(url, { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe(
      String(new TextEncoder().encode(css).byteLength)
    );
    expect(await head.text()).toBe('');
    expect((await get(url, { method: 'POST' })).status).toBe(405);
  });

  it('сжимается br и gzip; у сжатой копии свой ETag', async () => {
    const url = siteFile(await page('/o-proekte'));
    const css = await (await get(url)).text();
    const br = await get(url, { headers: { 'accept-encoding': 'gzip, br' } });
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(br.headers.get('vary')).toBe('accept-encoding');
    expect(br.headers.get('etag')).toMatch(/-br"$/);
    expect(
      new TextDecoder().decode(
        brotliDecompressSync(new Uint8Array(await br.arrayBuffer()))
      )
    ).toBe(css);
    const gzip = await get(url, { headers: { 'accept-encoding': 'gzip' } });
    expect(gzip.headers.get('content-encoding')).toBe('gzip');
    expect(
      new TextDecoder().decode(
        gunzipSync(new Uint8Array(await gzip.arrayBuffer()))
      )
    ).toBe(css);
  });

  it('правка стиля — новый хэш, страница из кэша перерисована; прежний адрес — текущая версия без immutable', async () => {
    const before = siteFile(await page('/o-proekte'));
    expect((await get('/o-proekte')).headers.get('x-cache')).toBe('hit');

    app.design.components.save('Card', CARD.replace('tomato', 'navy'));

    const response = await get('/o-proekte');
    expect(response.headers.get('x-cache')).toBe('miss');
    const after = siteFile(await response.text());
    expect(after).not.toBe(before);
    expect(await (await get(after)).text()).toContain('color:navy');
    const stale = await get(before);
    expect(stale.status).toBe(200);
    expect(stale.headers.get('cache-control')).toBe('no-cache');
    expect(await stale.text()).toContain('color:navy');
  });

  it('правка разметки без стилей хэш не меняет: файл остаётся в кэше браузера', async () => {
    const before = siteFile(await page('/o-proekte'));
    app.design.components.save(
      'Card',
      CARD.replace('{text}</p>', '{text}!</p>')
    );
    const html = await page('/o-proekte');
    expect(html).toContain('О проекте!');
    expect(siteFile(html)).toBe(before);
  });

  it('правила на весь документ — свой файл, только на странице, где компонент нарисован', async () => {
    const contacts = await page('/kontakty');
    const about = await page('/o-proekte');
    const dark = linksOf(contacts).find((_) =>
      _.startsWith('/_cms/styles/Dark.')
    )!;
    expect(linksOf(contacts)).toEqual([dark, siteFile(contacts)]);
    expect(linksOf(about)).toEqual([siteFile(about)]);
    expect(siteFile(about)).toBe(siteFile(contacts));
    expect(await (await get(dark)).text()).toContain(
      'body {background:black;}'
    );
    expect(await (await get(siteFile(about))).text()).not.toContain('black');
  });

  it('в общем файле родитель раньше детей; ссылки — до SEO-шапки', async () => {
    const html = await page('/o-proekte');
    const css = await cssOf(html);
    expect(css.indexOf('h1.svelte-')).toBeLessThan(
      css.indexOf('.card.svelte-')
    );
    expect(headOf(html).indexOf('/_cms/styles/')).toBeLessThan(
      headOf(html).indexOf('rel="canonical"')
    );
  });

  it('<svelte:options css="injected" /> оставляет стиль в странице', async () => {
    app.design.components.save(
      'Card',
      `<svelte:options css="injected" />${CARD}`
    );
    const html = await page('/o-proekte');
    expect(headOf(html)).toMatch(
      /<style id="svelte-[a-z0-9]+">\.card\.svelte-[a-z0-9]+ \{color:tomato;\}<\/style>/
    );
    expect(await cssOf(html)).not.toContain('tomato');
  });

  it('шаблон без стилей — страница без ссылок', async () => {
    app.design.templates.save(
      'Base',
      '<script>let { page } = $props();</script><h1>{page.title}</h1>'
    );
    const html = await page('/o-proekte');
    expect(linksOf(html)).toEqual([]);
    expect(html).not.toContain('<style');
  });

  it('компонент некэшируемого региона — тоже файлом, ссылка не повторяется', async () => {
    app.design.templates.save(
      'Base',
      `<script>import Uncached from '$core/Uncached'; let { page } = $props();</script><h1>{page.title}</h1><Uncached name="Card" props={{ text: 'регион' }} /><Uncached name="Dark" /><style>h1 { margin: 0; }</style>`
    );
    const html = await page('/o-proekte');
    expect(html).toContain('регион');
    expect(html).not.toContain('<style');
    const links = linksOf(html);
    expect(links.filter((_) => _.startsWith('/_cms/styles/site.')).length).toBe(
      1
    );
    expect(links.some((_) => _.startsWith('/_cms/styles/Dark.'))).toBe(true);
    expect(await cssOf(html)).toContain('.card.svelte-');
  });

  it('незнакомое имя и кривой путь — 404; Markdown-версия страницы ссылок не несёт', async () => {
    expect((await get('/_cms/styles/Nope.abc.css')).status).toBe(404);
    expect((await get('/_cms/styles/site.css')).status).toBe(404);
    expect((await get('/_cms/styles/../scripts/x.js')).status).toBe(404);
    expect(await page('/o-proekte.md')).not.toContain('/_cms/styles/');
  });
});
