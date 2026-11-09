import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';

// Стиль адресов Evo (ADR 0063): суффикс `.html`, папки со слэшем, алиас, скрытый из адресов детей.

let app: App;
const ids: Record<string, number> = {};

const _PLAIN = `<script>let { page } = $props();</script>
<svelte:head><title>{page.title}</title></svelte:head><h1>{page.title}</h1>`;

// Список детей порциями по одной; `parent` — чей список: у новостей он чужой, их страница — не папка.
const _LIST = `<script>
import { listing, link } from '$core';
let { page } = $props();
const list = $derived(listing(page.fields.source || page.id, { perPage: 1, sort: 'menu' }));
</script>
<svelte:head><title>{page.title}</title></svelte:head>
<ul>{#each list.items as item (item.id)}<li><a href={link(item.id)}>{item.title}</a></li>{/each}</ul>
<nav>{#each list.pager() as item}{#if item.kind === 'page'}<a href={item.url}>{item.number}</a>{/if}{/each}</nav>`;

const create = (
  key: string,
  input: Parameters<App['content']['pages']['create']>[0]
) => (ids[key] = app.content.pages.create({ publish: true, ...input }));

beforeEach(() => {
  app = createApp();
  app.design.templates.save('Plain', _PLAIN);
  app.design.templates.save('List', _LIST);
  app.content.fields.save({
    name: 'source',
    label: 'Чей список',
    type: 'number',
    templates: ['List'],
  });
  app.site.settings.update({
    urlSuffix: '.html',
    folderSlash: true,
    siteUrl: 'https://site.test',
  });
  create('home', { title: 'Главная', alias: 'index', template: 'Plain' });
  create('katalog', {
    title: 'Каталог',
    alias: 'katalog',
    template: 'List',
    folder: true,
  });
  create('first', {
    title: 'Первый',
    alias: 'first',
    parentId: ids.katalog,
    template: 'Plain',
    menuIndex: 1,
  });
  create('second', {
    title: 'Второй',
    alias: 'second',
    parentId: ids.katalog,
    template: 'Plain',
    menuIndex: 2,
  });
  create('novosti', {
    title: 'Новости',
    alias: 'novosti',
    template: 'List',
    fields: { source: ids.katalog! },
  });
  create('cities', {
    title: 'Города',
    alias: 'cities',
    template: 'Plain',
    aliasInPath: false,
  });
  create('baran', {
    title: 'Барановичи',
    alias: 'baran',
    parentId: ids.cities,
    template: 'Plain',
    folder: true,
  });
  create('feed', {
    title: 'Лента',
    alias: 'feed.xml',
    template: 'Plain',
    contentType: 'application/xml',
    content: '<feed/>',
  });
  app.site.settings.update({ homePageId: ids.home });
});

afterEach(() => app.close());

const get = (path: string) =>
  app.fetch(new Request(`https://site.test${path}`));

const text = (path: string) => get(path).then((_) => _.text());

const location = (path: string) =>
  get(path).then((_) => [_.status, _.headers.get('location')]);

const errorOf = (action: () => unknown): string =>
  attempt(
    () => (action(), ''),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('адреса в стиле Evo', () => {
  it('папка — с /, документ — с суффиксом, алиас с точкой — как есть, главная — /', () => {
    const path = (key: string) => app.content.published.page(ids[key]!)!.path;
    expect(path('katalog')).toBe('/katalog/');
    expect(path('first')).toBe('/katalog/first.html');
    expect(path('novosti')).toBe('/novosti.html');
    expect(path('feed')).toBe('/feed.xml');
    // Дочерняя страница сделала раздел папкой, как в Evo.
    expect(path('cities')).toBe('/cities/');
    expect(path('baran')).toBe('/baran/');
  });

  it.each([
    '/',
    '/katalog/',
    '/katalog/first.html',
    '/novosti.html',
    '/baran/',
    '/cities/',
    '/feed.xml',
  ])('%p — 200', async (path) => {
    expect((await get(path)).status).toBe(200);
  });

  it.each([
    ['/katalog', '/katalog/'],
    ['/katalog.html', '/katalog/'],
    ['/katalog/first', '/katalog/first.html'],
    ['/katalog/first/', '/katalog/first.html'],
    ['/katalog/first.html/', '/katalog/first.html'],
    ['/baran', '/baran/'],
    ['/baran.html', '/baran/'],
    ['/feed.xml/', '/feed.xml'],
    ['/index.html', '/'],
    ['/index/', '/'],
    ['//katalog//first', '/katalog/first.html'],
  ])('%p — 301 на %p', async (path, to) => {
    expect(await location(path)).toEqual([301, to]);
  });

  it('вариант адреса сохраняет query', async () => {
    expect(await location('/katalog?utm_source=mail')).toEqual([
      301,
      '/katalog/?utm_source=mail',
    ]);
  });

  it('по пути со скрытым алиасом страницы нет', async () => {
    expect((await get('/cities/baran/')).status).toBe(404);
  });

  it('ссылки, крошки и [~id~] ведут на адрес с окончанием', async () => {
    const page = await text('/katalog/');
    expect(page).toContain('<a href="/katalog/first.html">Первый</a>');
    app.content.pages.edit(ids.cities!, {
      content: `<p><a href="[~${ids.baran}~]">город</a></p>`,
    });
    app.design.templates.save(
      'Plain',
      `<script>import Content from '$core/Content'; let { page } = $props();</script><Content of={page} />`
    );
    expect(await text('/cities/')).toContain('<a href="/baran/">город</a>');
  });
});

describe('порции списка в стиле Evo', () => {
  it('у папки — /katalog/page-2/, у документа — /novosti/page-2.html', async () => {
    const folder = await text('/katalog/');
    expect(folder).toContain(
      '<a href="/katalog/">1</a><a href="/katalog/page-2/">2</a>'
    );
    expect(await text('/katalog/page-2/')).toContain(
      '<li><a href="/katalog/second.html">Второй</a></li>'
    );
    expect(await text('/novosti.html')).toContain(
      '<a href="/novosti.html">1</a><a href="/novosti/page-2.html">2</a>'
    );
    expect((await get('/novosti/page-2.html')).status).toBe(200);
  });

  it.each([
    ['/katalog/page-2', '/katalog/page-2/'],
    ['/katalog/page-2.html', '/katalog/page-2/'],
    ['/katalog/page-1/', '/katalog/'],
    ['/novosti/page-2', '/novosti/page-2.html'],
    ['/novosti/page-2/', '/novosti/page-2.html'],
    ['/novosti.html/page-2', '/novosti/page-2.html'],
  ])('%p — 301 на %p', async (path, to) => {
    expect(await location(path)).toEqual([301, to]);
  });

  it('за последней порцией — 404', async () => {
    expect((await get('/katalog/page-3/')).status).toBe(404);
  });

  it('canonical, prev и next порции — с окончанием', async () => {
    const second = await text('/katalog/page-2/');
    expect(second).toContain(
      '<link rel="canonical" href="https://site.test/katalog/page-2/">'
    );
    expect(second).toContain(
      '<link rel="prev" href="https://site.test/katalog/">'
    );
  });
});

describe('находимость', () => {
  it('canonical и Markdown-версия — без окончания и с .md', async () => {
    const page = await text('/katalog/');
    expect(page).toContain(
      '<link rel="canonical" href="https://site.test/katalog/">'
    );
    expect(page).toContain(
      '<link rel="alternate" type="text/markdown" href="https://site.test/katalog.md">'
    );
    const markdown = await get('/katalog.md');
    expect(markdown.status).toBe(200);
    expect(await markdown.text()).toContain('# Каталог');
    expect((await get('/katalog/first.md')).status).toBe(200);
  });

  it('sitemap.xml и llms.txt — адреса с окончанием', async () => {
    const xml = await text('/sitemap.xml');
    expect(xml).toContain('<loc>https://site.test/katalog/</loc>');
    expect(xml).toContain('<loc>https://site.test/katalog/first.html</loc>');
    expect(xml).toContain('<loc>https://site.test/baran/</loc>');
    expect(xml).toContain('<loc>https://site.test/</loc>');
    expect(await text('/llms.txt')).toContain(
      '(https://site.test/katalog/first.md)'
    );
  });

  it('правило переадресации на [~id~] ведёт на адрес с окончанием', async () => {
    app.redirects.rules.create({
      from: '/old-catalog',
      to: `[~${ids.katalog}~]`,
    });
    expect(await location('/old-catalog/')).toEqual([301, '/katalog/']);
  });
});

describe('единственность адреса', () => {
  it('страница со скрытым алиасом родителя не займёт чужой адрес', () => {
    expect(
      errorOf(() =>
        app.content.pages.create({
          title: 'Ещё Барановичи',
          alias: 'baran',
          template: 'Plain',
        })
      )
    ).toBe('content.address_taken');
    expect(
      errorOf(() =>
        app.content.pages.create({
          title: 'Каталог',
          alias: 'katalog',
          parentId: ids.cities,
          template: 'Plain',
        })
      )
    ).toBe('content.address_taken');
  });

  it('документ и алиас с точкой по одному адресу — столкновение', () => {
    app.content.pages.create({
      title: 'О нас',
      alias: 'o-nas.html',
      template: 'Plain',
    });
    expect(
      errorOf(() =>
        app.content.pages.create({
          title: 'О нас',
          alias: 'o-nas',
          template: 'Plain',
        })
      )
    ).toBe('content.address_taken');
  });

  it('скрыть алиас нельзя, если дети столкнутся с чужими адресами', () => {
    create('vtoroy', {
      title: 'Раздел',
      alias: 'razdel',
      template: 'Plain',
      folder: true,
    });
    create('inner', {
      title: 'Каталог внутри',
      alias: 'katalog',
      parentId: ids.vtoroy,
      template: 'Plain',
    });
    expect(
      errorOf(() => app.content.pages.edit(ids.vtoroy!, { aliasInPath: false }))
    ).toBe('content.address_taken');
    expect(app.content.published.page(ids.inner!)!.path).toBe(
      '/razdel/katalog.html'
    );
  });
});

describe('смена адреса', () => {
  it('у документа появилась дочерняя — он папка, прежний адрес ведёт на новый', async () => {
    create('about', { title: 'О компании', alias: 'about', template: 'Plain' });
    expect(app.content.published.page(ids.about!)!.path).toBe('/about.html');
    create('team', {
      title: 'Команда',
      alias: 'team',
      parentId: ids.about,
      template: 'Plain',
    });
    expect(app.content.drafts.page(ids.about!).folder).toBe(true);
    expect(app.content.published.page(ids.about!)!.path).toBe('/about/');
    expect(await location('/about.html')).toEqual([301, '/about/']);
  });

  it('алиас родителя снова в адресе — прежние адреса детей ведут на новые', async () => {
    app.content.pages.edit(ids.cities!, { aliasInPath: true });
    expect(app.content.published.page(ids.baran!)!.path).toBe('/cities/baran/');
    expect(await location('/baran/')).toEqual([301, '/cities/baran/']);
    expect(await location('/baran')).toEqual([301, '/cities/baran/']);
  });

  it('стиль адресов по умолчанию — снова без окончаний', async () => {
    app.site.settings.update({ urlSuffix: '', folderSlash: false });
    expect((await get('/katalog')).status).toBe(200);
    expect(await location('/katalog/')).toEqual([301, '/katalog']);
    // Прежний суффикс — уже не вариант адреса: смена стиля меняет адреса всего сайта (ADR 0063).
    expect((await get('/katalog/first.html')).status).toBe(404);
    expect((await get('/baran')).status).toBe(200);
  });
});
