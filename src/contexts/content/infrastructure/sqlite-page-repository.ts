import type { Database } from '../../../platform/database.ts';
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
    { url: string; path: string }
  >(`
    SELECT id FROM content_pages
      WHERE instr(content, $url) > 0 OR instr(intro_text, $url) > 0
        OR social_image = $path
    UNION
    SELECT page_id FROM content_field_values WHERE instr(value, $path) > 0
    ORDER BY 1`);
  const total = db.query<{ n: number }, []>(
    'SELECT count(*) AS n FROM content_pages'
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
    removePages.run(id);
  });

  return {
    // bun:sqlite синхронный: между чтением счётчика и save() никто не вставит строку.
    nextId: () => parsePageId((sequence.get()?.seq ?? 0) + 1),
    get: (id) => toPage(byId.get(id)),
    findSibling: (parentId, alias) => toPage(sibling.get(parentId, alias)),
    ancestors: (id) => ids(ancestors.all(id)),
    due: (at) => ids(due.all({ at })),
    nextScheduledAt: () => next.get()?.at ?? null,
    trashed: () => ids(trashed.all()),
    count: () => total.get()?.n ?? 0,
    save: (page) => void save(page),
    remove: (id) => void remove(id),
    withTemplate: (template) => ids(withTemplate.all(template)),
    mentioning: (text) => ids(mentioning.all(text)),
    referencingMedia: (path) =>
      ids(referencingMedia.all({ url: `/media/${path}`, path })),
  };
};
