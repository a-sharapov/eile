import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';

let app: App;
let blog: number;

// Список блога порциями по два, пейджер — ссылками.
const _BLOG = `<script>
import { listing } from '$core';
let { page } = $props();
const list = $derived(listing(page.id, { perPage: 2, sort: 'menu' }));
</script>
<svelte:head><title>{page.title} — Сайт</title></svelte:head>
<ul>{#each list.items as item (item.id)}<li>{item.title}</li>{/each}</ul>
<p>{list.number}/{list.pages}</p>
<nav>{#each list.pager() as item}{#if item.kind === 'gap'}…{:else}<a href={item.url}>{item.number}</a>{/if}{/each}</nav>`;

const _PLAIN = `<script>let { page } = $props();</script>
<svelte:head><title>{page.title}</title></svelte:head><h1>{page.title}</h1>`;

beforeEach(() => {
  app = createApp();
  app.design.templates.save('Blog', _BLOG);
  app.design.templates.save('Plain', _PLAIN);
  const home = app.content.pages.create({
    title: 'Главная',
    template: 'Plain',
    publish: true,
  });
  blog = app.content.pages.create({
    title: 'Блог',
    alias: 'blog',
    template: 'Blog',
    publish: true,
  });
  [1, 2, 3, 4, 5].forEach(
    (_) =>
      void app.content.pages.create({
        title: `Пост ${_}`,
        alias: `post-${_}`,
        parentId: blog,
        template: 'Plain',
        menuIndex: _,
        hiddenFromMenu: true,
        publish: true,
      })
  );
  app.site.settings.update({ homePageId: home });
});

afterEach(() => app.close());

const get = (path: string) =>
  app.fetch(new Request(`https://site.test${path}`));

const text = (path: string) => get(path).then((_) => _.text());

describe('порции списка по ЧПУ', () => {
  it('первая порция — адрес страницы, следующие — /page-N', async () => {
    const first = await text('/blog');
    expect(first).toContain('<li>Пост 1</li><li>Пост 2</li>');
    expect(first).toContain('<p>1/3</p>');
    expect(first).toContain(
      '<a href="/blog">1</a><a href="/blog/page-2">2</a>'
    );
    const second = await text('/blog/page-2');
    expect(second).toContain('<li>Пост 3</li><li>Пост 4</li>');
    expect(second).toContain('<p>2/3</p>');
    expect(await text('/blog/page-3')).toContain('<li>Пост 5</li>');
  });

  it('порция кэшируется под своим адресом', async () => {
    expect((await get('/blog/page-2')).headers.get('x-cache')).toBe('miss');
    const again = await get('/blog/page-2');
    expect(again.headers.get('x-cache')).toBe('hit');
    expect(await again.text()).toContain('<li>Пост 3</li>');
    expect(await text('/blog')).toContain('<li>Пост 1</li>');
  });

  it('новый пост сбрасывает все порции', async () => {
    await get('/blog/page-3');
    app.content.pages.create({
      title: 'Пост 6',
      parentId: blog,
      template: 'Plain',
      menuIndex: 6,
      hiddenFromMenu: true,
      publish: true,
    });
    const third = await get('/blog/page-3');
    expect(third.headers.get('x-cache')).toBe('miss');
    expect(await third.text()).toContain('<li>Пост 5</li><li>Пост 6</li>');
  });

  it.each(['/blog/page-4', '/blog/page-0', '/blog/page-02', '/blog/page-x'])(
    '%p — 404, а не пустая порция',
    async (path) => {
      expect((await get(path)).status).toBe(404);
    }
  );

  it('у страницы без списка порций нет', async () => {
    expect((await get('/blog/post-1/page-2')).status).toBe(404);
  });

  it('/page-1 и завершающий слэш уходят на единственный адрес', async () => {
    const first = await get('/blog/page-1');
    expect(first.status).toBe(301);
    expect(first.headers.get('location')).toBe('/blog');
    const slash = await get('/blog/page-2/');
    expect(slash.status).toBe(301);
    expect(slash.headers.get('location')).toBe('/blog/page-2');
  });

  it('настоящая страница page-2 важнее порции родителя', async () => {
    app.content.pages.create({
      title: 'Своя страница',
      alias: 'page-2',
      parentId: blog,
      template: 'Plain',
      hiddenFromMenu: true,
      publish: true,
    });
    expect(await text('/blog/page-2')).toContain('<h1>Своя страница</h1>');
  });

  it('старый адрес порции ведёт на ту же порцию по новому', async () => {
    app.content.pages.edit(blog, { alias: 'news' });
    const moved = await get('/blog/page-2');
    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('/news/page-2');
  });

  it('слово страниц задаёт сайт', async () => {
    app.site.settings.update({ pagingSegment: 'stranica' });
    expect(await text('/blog')).toContain('href="/blog/stranica-2"');
    expect(await text('/blog/stranica-2')).toContain('<li>Пост 3</li>');
    expect((await get('/blog/page-2')).status).toBe(404);
  });
});

describe('находимость порций', () => {
  it('canonical на себя, «страница N» в заголовке, prev и next', async () => {
    const second = await text('/blog/page-2');
    expect(second).toContain('<title>Блог — Сайт — page 2</title>');
    expect(second).toContain(
      '<link rel="canonical" href="https://site.test/blog/page-2">'
    );
    expect(second).toContain('<link rel="prev" href="https://site.test/blog">');
    expect(second).toContain(
      '<link rel="next" href="https://site.test/blog/page-3">'
    );
    expect(second).not.toContain('type="text/markdown"');
    expect(second).toContain('"name":"Блог","item":"https://site.test/blog"');
  });

  it('первая порция — без суффикса, только next', async () => {
    const first = await text('/blog');
    expect(first).toContain('<title>Блог — Сайт</title>');
    expect(first).not.toContain('rel="prev"');
    expect(first).toContain(
      '<link rel="next" href="https://site.test/blog/page-2">'
    );
  });

  it('«страница N» — на языке страницы или из перевода сайта', async () => {
    app.site.settings.update({ language: 'ru' });
    expect(await text('/blog/page-2')).toContain(
      '<title>Блог — Сайт — страница 2</title>'
    );
    app.site.translations.save('pagingTitle', { ru: 'стр. {n}' });
    expect(await text('/blog/page-3')).toContain(
      '<title>Блог — Сайт — стр. 3</title>'
    );
  });

  it('canonical на первую порцию — по настройке сайта', async () => {
    app.site.settings.update({ pagingCanonical: 'first' });
    expect(await text('/blog/page-2')).toContain(
      '<link rel="canonical" href="https://site.test/blog">'
    );
  });

  it('в sitemap.xml только сама страница', async () => {
    const xml = await text('/sitemap.xml');
    expect(xml).toContain('<loc>https://site.test/blog</loc>');
    expect(xml).not.toContain('page-2');
  });
});

describe('свой отбор и явный номер в $core.listing', () => {
  it('filter и order: пейджер по отобранным, порция по хвосту, за последней — 404', async () => {
    app.design.templates.save(
      'Odd',
      `<script>
import { listing } from '$core';
let { page } = $props();
const list = $derived(listing(page.id, {
  perPage: 2,
  filter: (item) => item.menuIndex % 2 === 1,
  order: (a, b) => b.menuIndex - a.menuIndex,
}));
</script>
<svelte:head><title>{page.title}</title></svelte:head>
<ul>{#each list.items as item (item.id)}<li>{item.title}</li>{/each}</ul>
<p>{list.number}/{list.pages}/{list.total}</p>
<nav>{#each list.pager() as item}{#if item.kind === 'page'}<a href={item.url}>{item.number}</a>{/if}{/each}</nav>`
    );
    app.content.pages.edit(blog, { template: 'Odd' });
    const first = await text('/blog');
    expect(first).toContain('<li>Пост 5</li><li>Пост 3</li>');
    expect(first).toContain('<p>1/2/3</p>');
    expect(first).toContain(
      '<a href="/blog">1</a><a href="/blog/page-2">2</a>'
    );
    expect(await text('/blog/page-2')).toContain('<li>Пост 1</li>');
    expect((await get('/blog/page-3')).status).toBe(404);
  });

  it('page — номер из запроса в Uncached: адреса порций с ?page=, за последней — последняя', async () => {
    app.design.components.save(
      'Catalog',
      `<script>
import { listing, request } from '$core';
let { parent } = $props();
const query = request().query;
const list = listing(parent, {
  perPage: 2,
  sort: 'menu',
  page: Number(query.page ?? 1),
  order: query.sort === 'desc' ? (a, b) => b.menuIndex - a.menuIndex : undefined,
});
</script>
<ul>{#each list.items as item (item.id)}<li>{item.title}</li>{/each}</ul>
<p>{list.number}/{list.pages}</p>
<nav>{#each list.pager() as item}{#if item.kind === 'page'}<a href={item.url}>{item.number}</a>{/if}{/each}</nav>`
    );
    app.design.templates.save(
      'Shop',
      `<script>
import Uncached from '$core/Uncached';
let { page } = $props();
</script>
<svelte:head><title>{page.title}</title></svelte:head>
<Uncached name="Catalog" props={{ parent: page.id }} />`
    );
    app.content.pages.edit(blog, { template: 'Shop' });
    const second = await text('/blog?page=2&sort=desc');
    expect(second).toContain('<li>Пост 3</li><li>Пост 2</li>');
    expect(second).toContain('<p>2/3</p>');
    expect(second).toContain(
      '<a href="/blog?sort=desc">1</a><a href="/blog?page=2&amp;sort=desc">2</a><a href="/blog?page=3&amp;sort=desc">3</a>'
    );
    expect(await text('/blog?page=9')).toContain('<li>Пост 5</li>');
    expect(await text('/blog?page=9')).toContain('<p>3/3</p>');
    // Хвоста адреса в регионе нет: постраничного списка у первой фазы нет, и /blog/page-2 — 404.
    expect((await get('/blog/page-2')).status).toBe(404);
  });
});
