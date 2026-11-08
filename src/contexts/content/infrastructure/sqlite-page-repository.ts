import type { Database } from '../../../platform/database.ts';
import type { AddressNode } from '../domain/address.ts';
import type { Alias } from '../domain/alias.ts';
import type { FieldValue } from '../domain/field.ts';
import {
  type Page,
  type PageId,
  type PageKind,
  parsePageId,
} from '../domain/page.ts';
import type { PageRepository } from '../domain/page-repository.ts';

export type PageRow = {
  id: number;
  parent_id: number | null;
  kind: string;
  title: string;
  long_title: string;
  menu_title: string;
  description: string;
  intro_text: string;
  alias: string;
  folder: number;
  alias_in_path: number;
  template: string;
  content_type: string;
  content: string;
  link_to: string;
  published: number;
  publish_at: string | null;
  unpublish_at: string | null;
  published_at: string | null;
  trashed_at: string | null;
  menu_index: number;
  hidden_from_menu: number;
  cacheable: number;
  searchable: number;
  social_image: string;
  language: string;
  translation_of: number | null;
  created_at: string;
  updated_at: string;
};

export type FieldValueRow = { field: string; value: string };

const _COLUMNS = {
  id: 'id',
  parent_id: 'parentId',
  kind: 'kind',
  title: 'title',
  long_title: 'longTitle',
  menu_title: 'menuTitle',
  description: 'description',
  intro_text: 'introText',
  alias: 'alias',
  folder: 'folder',
  alias_in_path: 'aliasInPath',
  template: 'template',
  content_type: 'contentType',
  content: 'content',
  link_to: 'linkTo',
  published: 'published',
  publish_at: 'publishAt',
  unpublish_at: 'unpublishAt',
  published_at: 'publishedAt',
  trashed_at: 'trashedAt',
  menu_index: 'menuIndex',
  hidden_from_menu: 'hiddenFromMenu',
  cacheable: 'cacheable',
  searchable: 'searchable',
  social_image: 'socialImage',
  language: 'language',
  translation_of: 'translationOf',
} as const;

const _column = Object.keys(_COLUMNS);

const _UPSERT = `
  INSERT INTO content_pages (${_column.join(', ')}, created_at, updated_at)
  VALUES (${_column.map((_) => `$${_}`).join(', ')}, $now, $now)
  ON CONFLICT (id) DO UPDATE SET
    ${_column
      .filter((_) => _ !== 'id')
      .map((_) => `${_} = excluded.${_}`)
      .join(', ')},
    updated_at = excluded.updated_at`;

const _ANCESTORS = `
  WITH RECURSIVE up (id, depth) AS (
    SELECT parent_id, 1 FROM content_pages WHERE id = ? AND parent_id IS NOT NULL
    UNION ALL
    SELECT page.parent_id, up.depth + 1
    FROM content_pages AS page JOIN up ON page.id = up.id
    WHERE page.parent_id IS NOT NULL
  )
  SELECT id FROM up ORDER BY depth`;

const _BRANCH = `
  WITH RECURSIVE branch (id) AS (
    SELECT ?
    UNION ALL
    SELECT page.id FROM content_pages AS page JOIN branch ON page.parent_id = branch.id
  )`;

const _DUE = `
  SELECT id FROM content_pages
  WHERE (published = 0 AND publish_at <= $at) OR (published = 1 AND unpublish_at <= $at)`;

const _NEXT = `
  SELECT min(at) AS at FROM (
    SELECT publish_at AS at FROM content_pages WHERE published = 0 AND publish_at IS NOT NULL
    UNION ALL
    SELECT unpublish_at FROM content_pages WHERE published = 1 AND unpublish_at IS NOT NULL
  )`;

// Ключ адреса снизу вверх: к алиасу страницы — видимые алиасы предков. Дошли до корня (at IS NULL) —
// ветка вне корзины; страница в ветке из корзины до корня не доходит и адреса не занимает.
const _RIVALS = `
  WITH RECURSIVE up (start, at, key) AS (
    SELECT id, parent_id, '/' || alias FROM content_pages
    WHERE alias IN (SELECT value FROM json_each(?)) AND trashed_at IS NULL
    UNION ALL
    SELECT up.start, page.parent_id,
           CASE page.alias_in_path WHEN 1 THEN '/' || page.alias ELSE '' END || up.key
    FROM content_pages AS page JOIN up ON page.id = up.at
    WHERE page.trashed_at IS NULL
  )
  SELECT page.id, page.parent_id, page.alias, page.folder, page.alias_in_path, up.key
  FROM up JOIN content_pages AS page ON page.id = up.start
  WHERE up.at IS NULL`;

const _TRAIL = `
  WITH RECURSIVE up (at, trail) AS (
    SELECT parent_id, CASE alias_in_path WHEN 1 THEN '/' || alias ELSE '' END
    FROM content_pages WHERE id = ? AND trashed_at IS NULL
    UNION ALL
    SELECT page.parent_id,
           CASE page.alias_in_path WHEN 1 THEN '/' || page.alias ELSE '' END || up.trail
    FROM content_pages AS page JOIN up ON page.id = up.at
    WHERE page.trashed_at IS NULL
  )
  SELECT trail FROM up WHERE at IS NULL`;

const _DESCENDANTS = `
  WITH RECURSIVE down (id) AS (
    SELECT id FROM content_pages WHERE parent_id = ? AND trashed_at IS NULL
    UNION ALL
    SELECT page.id FROM content_pages AS page JOIN down ON page.parent_id = down.id
    WHERE page.trashed_at IS NULL
  )
  SELECT id, parent_id, alias, folder, alias_in_path FROM content_pages
  WHERE id IN (SELECT id FROM down)`;

type AddressRow = {
  id: number;
  parent_id: number | null;
  alias: string;
  folder: number;
  alias_in_path: number;
};

const _toNode = (row: AddressRow): AddressNode => ({
  id: row.id,
  parentId: row.parent_id,
  alias: row.alias,
  folder: row.folder === 1,
  aliasInPath: row.alias_in_path === 1,
});

export var toFieldValues = (
  rows: FieldValueRow[]
): Readonly<Record<string, FieldValue>> =>
  Object.fromEntries(rows.map((_) => [_.field, JSON.parse(_.value)]));

const _toRow = (page: Page): Record<string, unknown> =>
  Object.entries(_COLUMNS).reduce<Record<string, unknown>>(
    (row, { 0: column, 1: key }) => ({
      ...row,
      [column]: typeof page[key] === 'boolean' ? Number(page[key]) : page[key],
    }),
    { now: new Date().toISOString() }
  );

export var definePageRepository = (db: Database): PageRepository => {
  const sequence = db.query<{ seq: number }, []>(
    "SELECT seq FROM sqlite_sequence WHERE name = 'content_pages'"
  );
  // sqlite_sequence правится обычным UPDATE; строки ещё нет, пока в таблицу не вставляли ни разу.
  const bump = db.query<{ seq: number }, []>(
    "UPDATE sqlite_sequence SET seq = seq + 1 WHERE name = 'content_pages' RETURNING seq"
  );
  const first = db.query<{ seq: number }, []>(
    "INSERT INTO sqlite_sequence (name, seq) VALUES ('content_pages', 1) RETURNING seq"
  );
  const byId = db.query<PageRow, [number]>(
    'SELECT * FROM content_pages WHERE id = ?'
  );
  const sibling = db.query<PageRow, [number | null, string]>(
    'SELECT * FROM content_pages WHERE parent_id IS ? AND alias = ? AND trashed_at IS NULL'
  );
  const ancestors = db.query<{ id: number }, [number]>(_ANCESTORS);
  const due = db.query<{ id: number }, { at: string }>(_DUE);
  const next = db.query<{ at: string | null }, []>(_NEXT);
  const trashed = db.query<{ id: number }, []>(
    'SELECT id FROM content_pages WHERE trashed_at IS NOT NULL'
  );
  const withTemplate = db.query<{ id: number }, [string]>(
    'SELECT id FROM content_pages WHERE template = ? ORDER BY id'
  );
  const mentioning = db.query<{ id: number }, [string]>(
    'SELECT id FROM content_pages WHERE instr(content, ?) > 0 ORDER BY id'
  );
  const referencingMedia = db.query<
    { id: number },
    { url: string; path: string; original: string }
  >(`
    SELECT id FROM content_pages
      WHERE instr(content, $url) > 0 OR instr(intro_text, $url) > 0
        OR social_image = $path
        OR ($original <> '' AND (instr(content, $original) > 0 OR instr(intro_text, $original) > 0))
    UNION
    SELECT page_id FROM content_field_values
      WHERE instr(value, $path) > 0 OR ($original <> '' AND instr(value, $original) > 0)
    ORDER BY 1`);
  const total = db.query<{ n: number }, []>(
    'SELECT count(*) AS n FROM content_pages'
  );
  const created = db.query<{ created_at: string }, [number]>(
    'SELECT created_at FROM content_pages WHERE id = ?'
  );
  const valuesOf = db.query<FieldValueRow, [number]>(
    'SELECT field, value FROM content_field_values WHERE page_id = ?'
  );
  const upsert = db.query(_UPSERT);
  const clearValues = db.query(
    'DELETE FROM content_field_values WHERE page_id = ?'
  );
  const insertValue = db.query(
    'INSERT INTO content_field_values (page_id, field, value) VALUES (?, ?, ?)'
  );
  const removeValues = db.query(
    `${_BRANCH} DELETE FROM content_field_values WHERE page_id IN (SELECT id FROM branch)`
  );
  const removePages = db.query(
    `${_BRANCH} DELETE FROM content_pages WHERE id IN (SELECT id FROM branch)`
  );
  const removeRevisions = db.query(
    `${_BRANCH} DELETE FROM content_revisions WHERE page_id IN (SELECT id FROM branch)`
  );
  // Переводы удалённой страницы остаются страницами, но без исходной.
  const unlinkTranslations = db.query(
    `${_BRANCH} UPDATE content_pages SET translation_of = NULL WHERE translation_of IN (SELECT id FROM branch)`
  );
  const translations = db.query<{ id: number }, [number]>(
    'SELECT id FROM content_pages WHERE translation_of = ? ORDER BY id'
  );
  const trail = db.query<{ trail: string }, [number]>(_TRAIL);
  const descendants = db.query<AddressRow, [number]>(_DESCENDANTS);
  const rivals = db.query<AddressRow & { key: string }, [string]>(_RIVALS);

  const toPage = (row: PageRow | null): Page | null =>
    row && {
      id: parsePageId(row.id),
      parentId: row.parent_id === null ? null : parsePageId(row.parent_id),
      kind: row.kind as PageKind,
      title: row.title,
      longTitle: row.long_title,
      menuTitle: row.menu_title,
      description: row.description,
      introText: row.intro_text,
      alias: row.alias as Alias,
      folder: row.folder === 1,
      aliasInPath: row.alias_in_path === 1,
      template: row.template,
      contentType: row.content_type,
      content: row.content,
      linkTo: row.link_to,
      published: row.published === 1,
      publishAt: row.publish_at,
      unpublishAt: row.unpublish_at,
      publishedAt: row.published_at,
      trashedAt: row.trashed_at,
      menuIndex: row.menu_index,
      hiddenFromMenu: row.hidden_from_menu === 1,
      cacheable: row.cacheable === 1,
      searchable: row.searchable === 1,
      socialImage: row.social_image,
      language: row.language,
      translationOf:
        row.translation_of === null ? null : parsePageId(row.translation_of),
      fields: toFieldValues(valuesOf.all(row.id)),
    };

  const ids = (rows: { id: number }[]): PageId[] =>
    rows.map((_) => parsePageId(_.id));

  const save = db.transaction((page: Page) => {
    upsert.run(_toRow(page) as never);
    clearValues.run(page.id);
    Object.entries(page.fields).forEach(
      ({ 0: field, 1: value }) =>
        void insertValue.run(page.id, field, JSON.stringify(value))
    );
  });

  const remove = db.transaction((id: PageId) => {
    removeValues.run(id);
    removeRevisions.run(id);
    unlinkTranslations.run(id);
    removePages.run(id);
  });

  return {
    // bun:sqlite синхронный: между чтением счётчика и save() никто не вставит строку.
    nextId: () => parsePageId((sequence.get()?.seq ?? 0) + 1),
    reserve: () => parsePageId((bump.get() ?? first.get()!).seq),
    lastId: () => sequence.get()?.seq ?? 0,
    get: (id) => toPage(byId.get(id)),
    findSibling: (parentId, alias) => toPage(sibling.get(parentId, alias)),
    ancestors: (id) => ids(ancestors.all(id)),
    due: (at) => ids(due.all({ at })),
    nextScheduledAt: () => next.get()?.at ?? null,
    trashed: () => ids(trashed.all()),
    count: () => total.get()?.n ?? 0,
    createdAt: (id) => created.get(id)?.created_at ?? null,
    save: (page) => void save(page),
    remove: (id) => void remove(id),
    withTemplate: (template) => ids(withTemplate.all(template)),
    mentioning: (text) => ids(mentioning.all(text)),
    referencingMedia: (path, original = '') =>
      ids(referencingMedia.all({ url: `/media/${path}`, path, original })),
    translationsOf: (id) => ids(translations.all(id)),
    trail: (id) => trail.get(id)?.trail ?? null,
    descendants: (id) => descendants.all(id).map(_toNode),
    withAliases: (aliases) =>
      rivals
        .all(JSON.stringify(aliases))
        .map((_) => ({ node: _toNode(_), key: _.key })),
  };
};
