import { describe, expect, it } from 'bun:test';
import { createField } from './field.ts';
import { createPage, editPage, type Page, parsePageId } from './page.ts';
import {
  changesBetween,
  MERGE_MS,
  planRevision,
  type Revision,
  restoreChanges,
  retained,
  snapshotOf,
} from './revision.ts';

const _AT = '2026-11-01T10:00:00.000Z';
const _LONG_AGO = '2026-10-01T10:00:00.000Z';
const anna = { id: 1, name: 'Анна' };
const boris = { id: 2, name: 'Борис' };

const later = (ms: number): string =>
  new Date(Date.parse(_AT) + ms).toISOString();

const page = createPage(parsePageId(7), {
  title: 'О нас',
  template: 'Base',
  content: '<p>Было</p>',
}).state;

const edited = (changes: Parameters<typeof editPage>[0], from: Page = page) =>
  editPage(changes)(from).state;

const edit = (
  after: Page,
  overrides: Partial<Parameters<typeof planRevision>[1]> = {}
) => ({
  before: page,
  after,
  action: 'edited' as const,
  author: anna,
  at: _AT,
  createdAt: _LONG_AGO,
  ...overrides,
});

const revisionFrom = (
  plan: ReturnType<typeof planRevision>,
  id = 1
): Revision =>
  plan.kind === 'add' ? { ...plan.revision, id } : fail('ожидалась новая');

const fail = (message: string): never => {
  throw new Error(message);
};

describe('история правок', () => {
  it('снимок помнит текст, заголовки, адрес, шаблон и поля, но не публикацию и место', () => {
    const snapshot = snapshotOf(page);
    expect(snapshot.content).toBe('<p>Было</p>');
    expect(snapshot.fields).toEqual({});
    expect('published' in snapshot).toBe(false);
    expect('parentId' in snapshot).toBe(false);
    expect('menuIndex' in snapshot).toBe(false);
  });

  it('изменения — ключи страницы и поля по имени', () => {
    const after = {
      ...edited({ title: 'О компании', content: '<p>Стало</p>' }),
      fields: { cover: 'a.jpg' },
    };
    expect(changesBetween(snapshotOf(page), snapshotOf(after))).toEqual([
      'title',
      'content',
      'fields.cover',
    ]);
  });

  it('правка того, чего история не помнит, версии не даёт', () => {
    expect(planRevision(null, edit(edited({ menuIndex: 4 }))).kind).toBe(
      'none'
    );
  });

  it('первая правка — версия с прежним состоянием, автором и списком изменений', () => {
    const plan = planRevision(null, edit(edited({ content: '<p>Стало</p>' })));
    expect(plan).toMatchObject({
      kind: 'add',
      revision: {
        pageId: 7,
        action: 'edited',
        author: anna,
        at: _AT,
        changed: ['content'],
        restoredFrom: null,
      },
    });
    const { revision } = plan as Extract<typeof plan, { kind: 'add' }>;
    expect(revision.snapshot.content).toBe('<p>Было</p>');
    expect(revision.size).toBeGreaterThan(0);
  });

  it('правки в первые 10 минут после создания — продолжение создания', () => {
    expect(
      planRevision(
        null,
        edit(edited({ content: '<p>Стало</p>' }), { createdAt: later(-60_000) })
      ).kind
    ).toBe('none');
  });

  it('тот же человек в пределах 10 минут продолжает версию: снимок прежний, изменения копятся', () => {
    const first = revisionFrom(
      planRevision(null, edit(edited({ content: '<p>Стало</p>' })))
    );
    const second = edited(
      { title: 'О компании' },
      edited({ content: '<p>Стало</p>' })
    );
    const plan = planRevision(
      first,
      edit(second, { before: first.snapshot as Page, at: later(5 * 60_000) })
    );
    expect(plan).toMatchObject({
      kind: 'merge',
      revision: { id: 1, at: later(5 * 60_000), changed: ['title', 'content'] },
    });
  });

  it('другой человек, пауза дольше 10 минут или возврат — новая версия', () => {
    const first = revisionFrom(
      planRevision(null, edit(edited({ content: '<p>Стало</p>' })))
    );
    const next = edited({ content: '<p>Ещё</p>' });
    expect(planRevision(first, edit(next, { author: boris })).kind).toBe('add');
    expect(
      planRevision(first, edit(next, { at: later(MERGE_MS + 1000) })).kind
    ).toBe('add');
    expect(planRevision(first, edit(next, { action: 'restored' })).kind).toBe(
      'add'
    );
  });

  it('вернул всё как было в той же сессии — версия больше не нужна', () => {
    const first = revisionFrom(
      planRevision(null, edit(edited({ content: '<p>Стало</p>' }))),
      9
    );
    expect(
      planRevision(
        first,
        edit(page, { before: edited({ content: '<p>Стало</p>' }) })
      )
    ).toEqual({ kind: 'drop', id: 9 });
  });

  it('хранится не больше 30 версий и не больше 512 КБ, но последние 5 — всегда', () => {
    const small = Array.from({ length: 40 }, (_, i) => ({
      id: 40 - i,
      size: 1000,
    }));
    expect(retained(small)).toEqual(small.slice(0, 30).map((_) => _.id));
    const large = Array.from({ length: 12 }, (_, i) => ({
      id: 12 - i,
      size: 200 * 1024,
    }));
    expect(retained(large)).toHaveLength(5);
    const medium = Array.from({ length: 12 }, (_, i) => ({
      id: 12 - i,
      size: 60 * 1024,
    }));
    expect(retained(medium)).toHaveLength(8);
  });

  it('возврат берёт поля версии и снимает свои значения, которых в ней не было', () => {
    const cover = createField({
      name: 'cover',
      type: 'image',
      templates: ['Base'],
    }).state;
    const gone = createField({
      name: 'gone',
      type: 'text',
      templates: [],
    }).state;
    const snapshot = { ...snapshotOf(page), fields: { gone: 'x' } };
    const current = { ...page, fields: { cover: 'a.jpg' } };
    expect(restoreChanges(snapshot, current, [cover, gone])).toEqual({
      changes: expect.objectContaining({
        title: 'О нас',
        content: '<p>Было</p>',
      }),
      fields: { cover: null },
    });
  });
});
