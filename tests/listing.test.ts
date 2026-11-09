import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';

let app: App;
let blog: number;
let archive: number;

const _PLAIN = `<script>let { page } = $props();</script><h1>{page.title}</h1>`;

const titles = (
  parentId: number | null,
  options: Parameters<App['content']['published']['list']>[1] = {}
) => app.content.published.list(parentId, options).items.map((_) => _.title);

// Посты с разными датами публикации, порядком в меню и заголовками — чтобы сортировки различались.
const post = (
  title: string,
  parentId: number,
  day: number,
  menuIndex: number
) =>
  app.content.pages.create({
    title,
    parentId,
    template: 'Plain',
    publish: true,
    menuIndex,
    hiddenFromMenu: true,
  });

beforeEach(() => {
  let day = 0;
  const at = () => new Date(Date.UTC(2026, 0, 1 + day++)).toISOString();
  app = createApp({ clock: () => new Date(at()) });
  app.design.templates.save('Plain', _PLAIN);
  blog = app.content.pages.create({
    title: 'Блог',
    template: 'Plain',
    publish: true,
  });
  post('Бета', blog, 1, 3);
  post('альфа', blog, 2, 2);
  post('Гамма', blog, 3, 1);
  archive = app.content.pages.create({
    title: 'Архив',
    parentId: blog,
    template: 'Plain',
    publish: true,
    menuIndex: 4,
  });
  post('Старый', archive, 4, 1);
  app.content.pages.create({
    title: 'Черновик',
    parentId: blog,
    template: 'Plain',
    menuIndex: 5,
  });
});

afterEach(() => app.close());

describe('список страниц', () => {
  it('сортировки: свежие, по созданию, по заголовку без регистра, по меню', () => {
    expect(titles(blog, { includeHidden: true })).toEqual([
      'Архив',
      'Гамма',
      'альфа',
      'Бета',
    ]);
    expect(titles(blog, { includeHidden: true, sort: 'created' })).toEqual([
      'Архив',
      'Гамма',
      'альфа',
      'Бета',
    ]);
    expect(titles(blog, { includeHidden: true, sort: 'title' })).toEqual([
      'альфа',
      'Архив',
      'Бета',
      'Гамма',
    ]);
    expect(titles(blog, { includeHidden: true, sort: 'menu' })).toEqual([
      'Гамма',
      'альфа',
      'Бета',
      'Архив',
    ]);
  });

  it('скрытые из меню — только по просьбе; черновик — никогда', () => {
    expect(titles(blog)).toEqual(['Архив']);
    expect(
      app.content.published.list(blog, { includeHidden: true }).total
    ).toBe(4);
  });

  it('глубина 2 — и внуки; порция и общее число', () => {
    expect(
      titles(blog, { includeHidden: true, depth: 2, sort: 'menu' })
    ).toEqual(['Гамма', 'Старый', 'альфа', 'Бета', 'Архив']);
    const portion = app.content.published.list(blog, {
      includeHidden: true,
      depth: 2,
      sort: 'title',
      offset: 1,
      limit: 2,
    });
    expect(portion.items.map((_) => _.title)).toEqual(['Архив', 'Бета']);
    expect(portion.total).toBe(5);
  });

  it('ветка в корзине — без потомков; корзина самой страницы — без детей', () => {
    app.content.pages.trash(archive);
    expect(titles(blog, { includeHidden: true, depth: 2 })).toEqual([
      'Гамма',
      'альфа',
      'Бета',
    ]);
    app.content.pages.trash(blog);
    expect(app.content.published.list(blog, { includeHidden: true })).toEqual({
      items: [],
      total: 0,
    });
  });

  it('корень — страницы верхнего уровня', () => {
    expect(titles(null, { includeHidden: true, depth: 1 })).toEqual(['Блог']);
  });
});

describe('свой отбор и порядок списка', () => {
  const field = () =>
    app.content.fields.save({
      name: 'price',
      label: 'Цена',
      type: 'text',
      templates: ['Plain'],
    });

  it('filter отбирает из всей ветки, total — по отобранным, порция — после отбора', () => {
    const list = app.content.published.list(blog, {
      includeHidden: true,
      depth: 2,
      sort: 'title',
      filter: (_) => _.title !== 'Архив',
      offset: 1,
      limit: 2,
    });
    expect(list.total).toBe(4);
    expect(list.items.map((_) => _.title)).toEqual(['Бета', 'Гамма']);
  });

  it('order важнее sort; при равенстве остаётся порядок sort', () => {
    field();
    const prices: Record<string, string> = {
      Бета: '30',
      альфа: '10',
      Гамма: '10',
    };
    Object.entries(prices).forEach(
      ({ 0: title, 1: price }) =>
        void app.content.pages.setFields(
          app.content.published
            .list(blog, { includeHidden: true })
            .items.find((_) => _.title === title)!.id,
          { price }
        )
    );
    expect(
      titles(blog, {
        includeHidden: true,
        sort: 'menu',
        filter: (_) => _.fields.price !== null,
        order: (a, b) => Number(a.fields.price) - Number(b.fields.price),
      })
    ).toEqual(['Гамма', 'альфа', 'Бета']);
  });

  it('значения полей — с наследованием и умолчанием, как у одной страницы', () => {
    app.content.fields.save({
      name: 'tag',
      label: 'Метка',
      type: 'text',
      templates: ['Plain'],
      inherit: true,
      defaultValue: 'нет',
    });
    app.content.pages.setFields(archive, { tag: 'архив' });
    const list = app.content.published.list(blog, {
      includeHidden: true,
      depth: 2,
      filter: (_) => _.fields.tag === 'архив',
    });
    expect(list.items.map((_) => _.title).sort()).toEqual(['Архив', 'Старый']);
    expect(
      app.content.published.list(blog, {
        includeHidden: true,
        filter: (_) => _.fields.tag === 'нет',
      }).total
    ).toBe(3);
  });

  it('кандидаты — только для чтения и обновляются после правки', () => {
    const first = app.content.published.list(blog, {
      includeHidden: true,
      filter: () => true,
    });
    expect(Object.isFrozen(first.items[0])).toBe(true);
    expect(Object.isFrozen(first.items[0]!.fields)).toBe(true);
    post('Дельта', blog, 5, 6);
    expect(
      app.content.published.list(blog, {
        includeHidden: true,
        filter: () => true,
      }).total
    ).toBe(first.total + 1);
  });
});
