import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string, method = 'GET') =>
  app.fetch(new Request(`http://localhost${path}`, { method }));

const html = (path: string) => get(path).then((_) => _.text());

const errorCode = (action: () => void): string | undefined =>
  attempt(
    () => void action(),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const pathOf = (alias: string) => app.content.published.byPath(alias)!;

describe('публичный сайт', () => {
  it('главная — шаблон Base, собранный из компонентов', async () => {
    const response = await get('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    const page = await response.text();
    expect(page).toStartWith('<!doctype html>\n<html lang="ru">');
    expect(page).toContain('<title>Главная — Eile</title>');
    expect(page).toMatch(/<a href="\/o-proekte"[^>]*>О проекте<\/a>/);
    expect(page).not.toContain('<!--');
    expect(page).toContain('</main>\n</body>\n</html>\n');
  });

  it('страница находится по пути из алиасов', async () => {
    expect(await html('/kontakty')).toContain('<h1>Контакты</h1>');
  });

  it('комментарии в контенте страницы сохраняются', async () => {
    app.content.pages.edit(pathOf('/o-proekte').id, {
      content: '<!--noindex--><p>Секрет</p><!--/noindex-->',
    });
    expect(await html('/o-proekte')).toContain(
      '<!--noindex--><p>Секрет</p><!--/noindex-->'
    );
  });

  it('у страницы один канонический адрес', async () => {
    const trailing = await get('/o-proekte/?ref=menu');
    expect(trailing.status).toBe(301);
    expect(trailing.headers.get('location')).toBe('/o-proekte?ref=menu');
    expect((await get('/glavnaya')).headers.get('location')).toBe('/');
  });

  it('неизвестный путь — страница 404', async () => {
    const response = await get('/no/such/page');
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('<h1>Страница не найдена</h1>');
  });

  it('снятая с публикации страница пропадает с сайта и из меню', async () => {
    app.content.pages.unpublish(pathOf('/o-proekte').id);
    expect((await get('/o-proekte')).status).toBe(404);
    expect(await html('/')).not.toContain('О проекте');
  });

  it('алиас уникален среди соседей', () => {
    expect(
      errorCode(() =>
        app.content.pages.create({ title: 'Контакты', template: 'Base' })
      )
    ).toBe('content.alias_taken');
  });

  it('HEAD без тела, остальные методы запрещены', async () => {
    const head = await get('/', 'HEAD');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect((await get('/', 'POST')).status).toBe(405);
  });

  it('битый URL — 400', async () => {
    expect((await get('/%E0%A4%A')).status).toBe(400);
  });
});

describe('правка элементов', () => {
  it('сохранённый компонент виден на следующем запросе, кэш тоже', async () => {
    await html('/');
    app.design.components.save(
      'Header',
      '<script>let { siteName } = $props();</script><header>★ {siteName}</header>'
    );
    expect(await html('/')).toContain('<header>★ Eile</header>');
  });

  it('новый компонент подключается правкой шаблона', async () => {
    app.design.components.save(
      'Footer',
      "<script>import { site } from '$core';</script><footer>© {site().name}</footer>"
    );
    app.design.templates.save(
      'Base',
      "<script>import Footer from '$components/Footer'; let { page } = $props();</script><h1>{page.title}</h1><Footer />"
    );
    expect(await html('/kontakty')).toContain(
      '<h1>Контакты</h1><footer>© Eile</footer>'
    );
  });

  it('некомпилируемый исходник отклоняется, сайт работает', async () => {
    expect(
      errorCode(() =>
        app.design.components.save('Header', '<header>{</header>')
      )
    ).toBe('design.compile_failed');
    expect((await get('/')).status).toBe(200);
  });

  it('виды импортируют только компоненты, svelte и $core', () => {
    const source =
      "<script>import { readFileSync } from 'node:fs';</script><p>x</p>";
    expect(errorCode(() => app.design.components.save('Leak', source))).toBe(
      'design.forbidden_import'
    );
  });

  it('циклы импортов отклоняются', () => {
    app.design.components.save(
      'Card',
      "<script>import Price from '$components/Price';</script><Price />"
    );
    const price =
      "<script>import Card from '$components/Card';</script><Card />";
    expect(errorCode(() => app.design.components.save('Price', price))).toBe(
      'design.import_cycle'
    );
  });

  it('страница без шаблона — 500, а не падение', async () => {
    const id = app.content.pages.create({
      title: 'Orphan',
      template: 'Missing',
      publish: true,
    });
    expect((await get(app.content.published.page(id)!.path)).status).toBe(500);
  });
});

describe('поля', () => {
  const template =
    '<script>let { page } = $props();</script><h1>{page.title}</h1><p>{page.fields.banner}|{page.fields.price ?? "—"}</p>';

  beforeEach(() => {
    app.design.templates.save('Base', template);
    app.content.fields.save({
      name: 'banner',
      type: 'text',
      inherit: true,
      defaultValue: 'Скидки',
      templates: ['Base'],
    });
    app.content.fields.save({
      name: 'price',
      type: 'number',
      templates: ['Base'],
    });
  });

  it('шаблон видит свои значения, наследованные и умолчания', async () => {
    const about = pathOf('/o-proekte').id;
    const team = app.content.pages.create({
      parentId: about,
      title: 'Команда',
      template: 'Base',
      publish: true,
      fields: { price: 100 },
    });
    expect(await html('/o-proekte/komanda')).toContain('<p>Скидки|100</p>');
    app.content.pages.setFields(about, { banner: 'Новинки' });
    expect(await html('/o-proekte/komanda')).toContain('<p>Новинки|100</p>');
    expect(await html('/kontakty')).toContain('<p>Скидки|—</p>');
    expect(app.content.published.page(team)!.fields).toEqual({
      banner: 'Новинки',
      price: 100,
    });
  });

  it('неверное значение и чужое поле отклоняются', () => {
    const about = pathOf('/o-proekte').id;
    expect(
      errorCode(() => app.content.pages.setFields(about, { price: 'дорого' }))
    ).toBe('content.invalid_field_value');
    expect(
      errorCode(() => app.content.pages.setFields(about, { color: 'red' }))
    ).toBe('content.field_not_assigned');
  });
});

describe('перемещение', () => {
  it('меняет адрес страницы и её потомков', async () => {
    const contacts = pathOf('/kontakty').id;
    app.content.pages.create({
      parentId: contacts,
      title: 'Офис',
      template: 'Base',
      publish: true,
    });
    app.content.pages.move(contacts, pathOf('/o-proekte').id);
    const old = await get('/kontakty');
    expect(old.status).toBe(301);
    expect(old.headers.get('location')).toBe('/o-proekte/kontakty');
    expect((await get('/kontakty/ofis')).headers.get('location')).toBe(
      '/o-proekte/kontakty/ofis'
    );
    expect(await html('/o-proekte/kontakty/ofis')).toContain('<h1>Офис</h1>');
  });

  it('нельзя переместить внутрь своей ветки или к соседу с тем же алиасом', () => {
    const about = pathOf('/o-proekte').id;
    const team = app.content.pages.create({
      parentId: about,
      title: 'Команда',
      template: 'Base',
    });
    expect(errorCode(() => app.content.pages.move(about, team))).toBe(
      'content.invalid_parent'
    );
    const twin = app.content.pages.create({
      parentId: about,
      title: 'Контакты',
      template: 'Base',
    });
    expect(errorCode(() => app.content.pages.move(twin, null))).toBe(
      'content.alias_taken'
    );
  });
  it('место среди соседей задаёт порядок в меню, при смене родителя — переносит', async () => {
    const order = (parentId: number | null) =>
      app.content.drafts
        .tree()
        .filter((_) => _.parentId === parentId && !_.trashed)
        .map((_) => _.title);
    const contacts = pathOf('/kontakty').id;
    app.content.pages.place(contacts, null, 0);
    expect(order(null)[0]).toBe('Контакты');
    expect(await html('/')).toMatch(
      /Контакты<\/a>\s*<\/li>\s*<li[^>]*><a href="\/"[^>]*>Главная/
    );
    const about = pathOf('/o-proekte').id;
    app.content.pages.place(contacts, about, 5);
    expect(order(about)).toEqual(['Контакты']);
    expect((await get('/o-proekte/kontakty')).status).toBe(200);
  });

  it('копия — рядом с оригиналом, неопубликованная, со свободным алиасом', () => {
    const about = pathOf('/o-proekte');
    const first = app.content.pages.duplicate(about.id, 'О проекте (копия)');
    const second = app.content.pages.duplicate(about.id, 'О проекте (копия)');
    expect(app.content.drafts.page(first)).toMatchObject({
      parentId: about.parentId,
      title: 'О проекте (копия)',
      alias: 'o-proekte-kopiya',
      published: false,
      content: about.content,
      template: about.template,
    });
    expect(String(app.content.drafts.page(second).alias)).toBe(
      'o-proekte-kopiya-2'
    );
  });
});

describe('ссылки на страницы в контенте', () => {
  it('[~id~] — текущий адрес страницы, после переименования тоже', async () => {
    const contacts = pathOf('/kontakty').id;
    const about = pathOf('/o-proekte').id;
    app.content.pages.edit(about, {
      content: `<p><a href="[~${contacts}~]">Пишите</a></p>`,
    });
    expect(await html('/o-proekte')).toContain(
      '<a href="/kontakty">Пишите</a>'
    );
    app.content.pages.edit(contacts, { alias: 'svyaz' });
    expect(await html('/o-proekte')).toContain('<a href="/svyaz">Пишите</a>');
  });
});

describe('стандартные поля', () => {
  it('menuTitle — в меню, longTitle — в заголовке, description — в meta', async () => {
    app.content.pages.edit(pathOf('/o-proekte').id, {
      menuTitle: 'Проект',
      longTitle: 'О проекте подробно',
    });
    const page = await html('/o-proekte');
    expect(page).toMatch(/<a href="\/o-proekte"[^>]*>Проект<\/a>/);
    expect(page).toContain('<h1>О проекте подробно</h1>');
    expect(page).toContain(
      '<meta name="description" content="Алиас этой страницы получен из заголовка транслитерацией."/>'
    );
  });
});

describe('ссылки', () => {
  it('внешняя ссылка — 301 без query, в меню — адрес цели', async () => {
    app.content.pages.create({
      kind: 'link',
      title: 'GitHub',
      template: 'Base',
      linkTo: 'https://github.com/',
      menuIndex: 9,
      publish: true,
    });
    const response = await get('/github?x=1');
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://github.com/');
    expect(await html('/')).toMatch(
      /<a href="https:\/\/github.com\/"[^>]*>GitHub<\/a>/
    );
  });

  it('ссылка на id ведёт по адресу страницы', async () => {
    app.content.pages.create({
      kind: 'link',
      title: 'Связаться',
      template: 'Base',
      linkTo: String(pathOf('/kontakty').id),
      publish: true,
    });
    expect((await get('/svyazatsya')).headers.get('location')).toBe(
      '/kontakty'
    );
  });
});

describe('корзина', () => {
  it('прячет ветку, освобождает алиас, восстанавливает и удаляет навсегда', async () => {
    const about = pathOf('/o-proekte').id;
    app.content.pages.create({
      parentId: about,
      title: 'Команда',
      template: 'Base',
      publish: true,
    });
    app.content.pages.trash(about);
    expect((await get('/o-proekte')).status).toBe(404);
    expect((await get('/o-proekte/komanda')).status).toBe(404);
    expect(await html('/')).not.toContain('О проекте');

    const twin = app.content.pages.create({
      title: 'О проекте',
      template: 'Base',
    });
    expect(errorCode(() => app.content.pages.restore(about))).toBe(
      'content.alias_taken'
    );
    app.content.pages.trash(twin);
    app.content.pages.restore(about);
    expect(await html('/o-proekte/komanda')).toContain('<h1>Команда</h1>');

    expect(app.content.trash.empty()).toBe(1);
    expect(errorCode(() => app.content.pages.restore(twin))).toBe(
      'content.page_not_found'
    );
  });
});

describe('расписание', () => {
  it('публикует и снимает по часам в начале запроса', async () => {
    let now = new Date('2026-11-01T10:00:00Z');
    const timed = createApp({ scaffold: DEMO, clock: () => now });
    const visit = (path: string) =>
      timed.fetch(new Request(`http://localhost${path}`)).then((_) => _.status);
    timed.content.pages.create({
      title: 'Акция',
      template: 'Base',
      publishAt: '2026-11-01T12:00:00Z',
      unpublishAt: '2026-11-02T00:00:00Z',
    });
    expect(await visit('/aktsiya')).toBe(404);
    now = new Date('2026-11-01T12:00:00Z');
    expect(await visit('/aktsiya')).toBe(200);
    expect(timed.content.published.byPath('/aktsiya')!.publishedAt).toBe(
      '2026-11-01T12:00:00.000Z'
    );
    now = new Date('2026-11-02T00:00:01Z');
    expect(await visit('/aktsiya')).toBe(404);
    expect(timed.content.schedule.runDue()).toBe(0);
    timed.close();
  });
});

it('два приложения в одном процессе не делят виды', async () => {
  const other = createApp({ scaffold: DEMO });
  other.design.components.save('Header', '<header>other</header>');
  expect(await html('/')).not.toContain('<header>other</header>');
  expect(
    await other.fetch(new Request('http://localhost/')).then((_) => _.text())
  ).toContain('<header>other</header>');
  other.close();
});
