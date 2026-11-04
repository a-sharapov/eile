import { describe, expect, it } from 'bun:test';
import {
  applyOrder,
  conflictsOf,
  foldElement,
  foldPage,
  operationsOf,
  type PageState,
} from './proposal.ts';

const _PAGE: PageState = {
  changes: { title: 'О нас', content: '<p>Было</p>', alias: 'o-nas' },
  fields: { price: 100 },
  parentId: 1,
  published: false,
  trashed: false,
};

describe('предложение страницы', () => {
  it('правки сливаются, база запоминает то, что агент увидел первым', () => {
    const first = foldPage(
      { kind: 'page.edit', pageId: 5, changes: { title: 'Первый' } },
      null,
      _PAGE
    );
    const second = foldPage(
      {
        kind: 'page.edit',
        pageId: 5,
        changes: { title: 'Второй', alias: 'x' },
      },
      first,
      { ..._PAGE, changes: { ..._PAGE.changes, title: 'Человек' } }
    );
    expect(second.delta.changes).toEqual({ title: 'Второй', alias: 'x' });
    expect(second.base.changes).toEqual({ title: 'О нас', alias: 'o-nas' });
  });

  it('поля, перенос, публикация и корзина — свои ключи дельты', () => {
    const folded = [
      { kind: 'page.fields', pageId: 5, fields: { price: 120 } },
      { kind: 'page.move', pageId: 5, parentId: null },
      { kind: 'page.publish', pageId: 5 },
      { kind: 'page.trash', pageId: 5 },
    ].reduce(
      (proposal, op) => foldPage(op as never, proposal, _PAGE),
      null as ReturnType<typeof foldPage> | null
    )!;
    expect(folded.delta).toEqual({
      created: false,
      changes: {},
      fields: { price: 120 },
      parentId: null,
      published: true,
      trashed: true,
    });
    expect(folded.base).toEqual({
      changes: {},
      fields: { price: 100 },
      parentId: 1,
      published: false,
      trashed: false,
    });
    expect(operationsOf(folded)).toEqual([
      'fields',
      'moved',
      'published',
      'trashed',
    ]);
  });

  it('новая страница: правки ложатся в её создание, базы нет', () => {
    const created = foldPage(
      {
        kind: 'page.create',
        pageId: 9,
        changes: { title: 'Новая', template: 'Base' },
        fields: {},
        parentId: 1,
        publish: false,
      },
      null,
      null
    );
    const edited = foldPage(
      { kind: 'page.edit', pageId: 9, changes: { content: '<p>Текст</p>' } },
      created,
      null
    );
    expect(edited.delta).toMatchObject({
      created: true,
      changes: { title: 'Новая', template: 'Base', content: '<p>Текст</p>' },
      parentId: 1,
    });
    expect(edited.base).toEqual({ changes: {}, fields: {} });
    expect(operationsOf(edited)).toEqual(['created']);
    expect(conflictsOf(edited, null)).toEqual([]);
  });

  it('страницы нет и создать её не предлагали — отказ', () => {
    expect(() =>
      foldPage({ kind: 'page.publish', pageId: 404 }, null, null)
    ).toThrow('Page 404 not found');
  });
});

describe('конфликты', () => {
  const proposal = foldPage(
    { kind: 'page.edit', pageId: 5, changes: { title: 'Агент' } },
    null,
    _PAGE
  );

  it('место правили после предложения — конфликт', () => {
    expect(
      conflictsOf(proposal, {
        ..._PAGE,
        changes: { ..._PAGE.changes, title: 'Человек' },
      })
    ).toEqual(['title']);
  });

  it('правили другое место или сделали то же — не конфликт', () => {
    expect(
      conflictsOf(proposal, {
        ..._PAGE,
        changes: { ..._PAGE.changes, content: '<p>Другое</p>' },
      })
    ).toEqual([]);
    expect(
      conflictsOf(proposal, {
        ..._PAGE,
        changes: { ..._PAGE.changes, title: 'Агент' },
      })
    ).toEqual([]);
  });

  it('страницу удалили навсегда — missing', () => {
    expect(conflictsOf(proposal, null)).toEqual(['missing']);
  });

  it('элемент: ревизия сменилась — конфликт по source', () => {
    const element = foldElement(
      { kind: 'element.save', element: 'component', name: 'Hero', source: 'b' },
      null,
      { revision: 3, source: 'a' }
    );
    expect(element.base).toEqual({ revision: 3, source: 'a' });
    expect(conflictsOf(element, { revision: 3, source: 'a' })).toEqual([]);
    expect(conflictsOf(element, { revision: 4, source: 'c' })).toEqual([
      'source',
    ]);
    expect(operationsOf(element)).toEqual(['changed']);
  });
});

describe('порядок применения', () => {
  it('элементы — первыми, затем новые страницы от родителя к детям, затем правки', () => {
    const page = (id: number, parentId: number | null, created: boolean) => ({
      ...foldPage(
        created
          ? {
              kind: 'page.create',
              pageId: id,
              changes: { title: 't', template: 'Base' },
              fields: {},
              parentId,
              publish: false,
            }
          : { kind: 'page.edit', pageId: id, changes: { title: 't' } },
        null,
        created ? null : _PAGE
      ),
      id,
    });
    const element = (id: number, kind: 'template' | 'component') => ({
      ...foldElement(
        { kind: 'element.save', element: kind, name: 'X', source: 's' },
        null,
        null
      ),
      id,
    });
    expect(
      applyOrder([
        page(1, null, false),
        page(2, 3, true),
        page(3, null, true),
        element(4, 'template'),
        element(5, 'component'),
      ]).map((_) => _.id)
    ).toEqual([5, 4, 3, 2, 1]);
  });
});
