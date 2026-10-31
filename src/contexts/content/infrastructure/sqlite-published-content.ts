import type { Database } from '../../../platform/database.ts';
import type {
  DraftContent,
  ListSort,
  PageNode,
  PageView,
  PublishedContent,
  TranslationNode,
} from '../application/published-content.ts';
import { type Field, type FieldValue, fitsField } from '../domain/field.ts';
import type { PageKind } from '../domain/page.ts';
import { type FieldRow, toField } from './sqlite-field-repository.ts';
import {
  type FieldValueRow,
  type PageRow,
  toFieldValues,
} from './sqlite-page-repository.ts';

type TreeRow = {
  id: number;
  parent_id: number | null;
  path: string;
  language: string;
};

type TreeIndex = {
  readonly pathOf: ReadonlyMap<number, string>;
  readonly idOf: ReadonlyMap<string, number>;
  readonly parentOf: ReadonlyMap<number, number | null>;
  readonly childrenOf: ReadonlyMap<number | null, readonly number[]>;
  /** Язык с учётом ветки: язык пишется на ветку, страницы внутри наследуют его. */
  readonly languageOf: ReadonlyMap<number, string>;
};

const _TREE = `
  WITH RECURSIVE tree (id, parent_id, path, language) AS (
    SELECT id, parent_id, '/' || alias, language FROM content_pages
    WHERE parent_id IS NULL AND trashed_at IS NULL
    UNION ALL
    SELECT page.id, page.parent_id, tree.path || '/' || page.alias,
           CASE page.language WHEN '' THEN tree.language ELSE page.language END
    FROM content_pages AS page JOIN tree ON page.parent_id = tree.id
    WHERE page.trashed_at IS NULL
  )
  SELECT id, parent_id, path, language FROM tree`;

const _CHILDREN = `
  SELECT * FROM content_pages
  WHERE parent_id IS ? AND published = 1
    AND ((hidden_from_menu = 0 AND content_type = 'text/html') OR ?)
  ORDER BY menu_index, id`;

// Список: страницы, чей родитель — сама страница или её потомок выше нижнего уровня (?1, корень — ?2).
// Отбор и сортировка идут по покрывающему индексу content_pages_listing: тексты страниц не читаются,
// целиком поднимаются только строки порции.
const _LISTED = `
  FROM content_pages
  WHERE (parent_id IN (SELECT value FROM json_each(?1)) OR (?2 AND parent_id IS NULL))
    AND published = 1 AND content_type = 'text/html'
    AND (hidden_from_menu = 0 OR ?3) AND trashed_at IS NULL`;

const _ORDER: Readonly<Record<Exclude<ListSort, 'title'>, string>> = {
  published: 'published_at DESC, id DESC',
  created: 'created_at DESC, id DESC',
  menu: 'menu_index, id',
};

// NOCASE в SQLite складывает регистр только у латиницы: «альфа» встала бы после «Гамма». Заголовки
// сравниваем по Unicode без регистра, числа — по значению: «Пост 2» раньше «Пост 10».
const _TITLES = new Intl.Collator('und', {
  sensitivity: 'base',
  numeric: true,
});

// Глубина и порция с потолками: параметр компонента не должен развернуть весь сайт.
const _MAX_DEPTH = 8;
const _MAX_LIMIT = 500;

const _clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Math.trunc(value) || low));

type NodeRow = Pick<
  PageRow,
  | 'id'
  | 'parent_id'
  | 'kind'
  | 'title'
  | 'menu_title'
  | 'alias'
  | 'template'
  | 'content_type'
  | 'published'
  | 'trashed_at'
  | 'menu_index'
  | 'hidden_from_menu'
  | 'publish_at'
  | 'unpublish_at'
  | 'language'
>;

const _NODES = `
  SELECT id, parent_id, kind, title, menu_title, alias, template, content_type,
         published, trashed_at, menu_index, hidden_from_menu, publish_at, unpublish_at, language
  FROM content_pages ORDER BY coalesce(parent_id, 0), menu_index, id`;

// Язык узла — с учётом ветки по индексу дерева; у страницы в корзине — свой.
const _toNode =
  (languageOf: ReadonlyMap<number, string>) =>
  (row: NodeRow): PageNode => ({
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind as PageKind,
    title: row.title,
    menuTitle: row.menu_title,
    alias: row.alias,
    template: row.template,
    contentType: row.content_type,
    published: row.published === 1,
    trashed: row.trashed_at !== null,
    menuIndex: row.menu_index,
    hiddenFromMenu: row.hidden_from_menu === 1,
    publishAt: row.publish_at,
    unpublishAt: row.unpublish_at,
    language: languageOf.get(row.id) ?? row.language,
  });

const _index = (rows: TreeRow[]): TreeIndex => ({
  pathOf: new Map(rows.map((_) => [_.id, _.path])),
  idOf: new Map(rows.map((_) => [_.path, _.id])),
  parentOf: new Map(rows.map((_) => [_.id, _.parent_id])),
  childrenOf: rows.reduce(
    (all, row) =>
      all.set(row.parent_id, [...(all.get(row.parent_id) ?? []), row.id]),
    new Map<number | null, number[]>()
  ),
  languageOf: new Map(rows.map((_) => [_.id, _.language])),
});

export var definePublishedContent = (
  db: Database
): PublishedContent & {
  readonly drafts: DraftContent;
  readonly invalidate: () => void;
} => {
  const byId = db.query<PageRow, [number]>(
    'SELECT * FROM content_pages WHERE id = ? AND published = 1'
  );
  const childrenOf = db.query<PageRow, [number | null, number]>(_CHILDREN);
  const anyById = db.query<PageRow, [number]>(
    'SELECT * FROM content_pages WHERE id = ?'
  );
  const nodes = db.query<NodeRow, []>(_NODES);
  const movedFrom = db.query<{ page_id: number }, [string]>(
    'SELECT page_id FROM content_old_paths WHERE path = ?'
  );
  const tree = db.query<TreeRow, []>(_TREE);
  // Набор переводов по исходной странице: она первой, затем переводы по id.
  const members = db.query<PageRow, [number]>(
    `SELECT * FROM content_pages WHERE id = ?1 OR translation_of = ?1
     ORDER BY translation_of IS NOT NULL, id`
  );
  // Порция по дате или меню: номера отбирает и сортирует индекс, строки поднимаются только для них.
  const listed = (order: string) =>
    db.query<PageRow, [string, number, number, number, number]>(
      `SELECT * FROM content_pages
       WHERE id IN (SELECT id ${_LISTED} ORDER BY ${order} LIMIT ?4 OFFSET ?5)
       ORDER BY ${order}`
    );
  const titled = db.query<
    { id: number; title: string },
    [string, number, number]
  >(`SELECT id, title ${_LISTED}`);
  const byIds = db.query<PageRow, [string]>(
    'SELECT * FROM content_pages WHERE id IN (SELECT value FROM json_each(?))'
  );
  const counted = db.query<{ total: number }, [string, number, number]>(
    `SELECT count(*) AS total ${_LISTED}`
  );

  // По заголовку сортирует Intl.Collator: из базы — номера и заголовки ветки, строки — только порции.
  const byTitle = (
    where: [string, number, number],
    offset: number,
    limit: number
  ): PageRow[] =>
    ((ids) =>
      ((rows) => ids.flatMap((_) => rows.get(_) ?? []))(
        new Map(byIds.all(JSON.stringify(ids)).map((_) => [_.id, _] as const))
      ))(
      titled
        .all(...where)
        .sort((a, b) => _TITLES.compare(a.title, b.title) || a.id - b.id)
        .slice(offset, offset + limit)
        .map((_) => _.id)
    );
  const fieldRows = db.query<FieldRow, []>('SELECT * FROM content_fields');
  const valueRows = db.query<FieldValueRow, [number]>(
    'SELECT field, value FROM content_field_values WHERE page_id = ?'
  );
  let index: TreeIndex | null = null;
  let fields: readonly Field[] | null = null;

  const indexed = (): TreeIndex => (index ??= _index(tree.all()));
  const definitions = (): readonly Field[] =>
    (fields ??= fieldRows.all().map(toField));
  const valuesOf = (id: number) => toFieldValues(valueRows.all(id));

  type Values = ReturnType<typeof toFieldValues>;
  type ValuesOf = (id: number) => Values;

  // Значение из базы, которое не подходит под текущий тип поля, считается отсутствующим.
  const own =
    (values: ValuesOf) =>
    (field: Field, id: number): FieldValue | undefined => {
      const value = values(id)[field.name];
      return fitsField(field)(value) ? value : undefined;
    };

  const inherited =
    (values: ValuesOf) =>
    (field: Field, id: number): FieldValue | undefined => {
      const parent = indexed().parentOf.get(id) ?? null;
      return parent === null
        ? undefined
        : (own(values)(field, parent) ?? inherited(values)(field, parent));
    };

  const resolve =
    (values: ValuesOf) =>
    (field: Field, id: number): FieldValue | null =>
      own(values)(field, id) ??
      (field.inherit ? inherited(values)(field, id) : undefined) ??
      field.defaultValue;

  // Значения страницы и предков читаются из базы один раз на страницу, а не на каждое поле.
  const memoized = (): ValuesOf => {
    const seen = new Map<number, Values>();
    return (id) =>
      seen.get(id) ??
      ((values) => (seen.set(id, values), values))(valuesOf(id));
  };

  const fieldsOf = (row: PageRow): Record<string, FieldValue | null> => {
    const values = memoized();
    return definitions()
      .filter((_) => _.templates.includes(row.template))
      .reduce<Record<string, FieldValue | null>>(
        (all, field) => ({
          ...all,
          [field.name]: resolve(values)(field, row.id),
        }),
        {}
      );
  };

  const view = (row: PageRow): PageView => ({
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind as PageKind,
    title: row.title,
    longTitle: row.long_title,
    menuTitle: row.menu_title,
    description: row.description,
    introText: row.intro_text,
    alias: row.alias,
    path: indexed().pathOf.get(row.id) ?? `/${row.alias}`,
    template: row.template,
    contentType: row.content_type,
    content: row.content,
    linkTo: row.link_to,
    menuIndex: row.menu_index,
    hiddenFromMenu: row.hidden_from_menu === 1,
    cacheable: row.cacheable === 1,
    searchable: row.searchable === 1,
    socialImage: row.social_image,
    language: indexed().languageOf.get(row.id) ?? row.language,
    translationOf: row.translation_of,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    fields: fieldsOf(row),
  });

  // Страница без пути в индексе лежит в ветке, чей предок в корзине.
  const reachable = (row: PageRow | null): row is PageRow =>
    row !== null && indexed().pathOf.has(row.id);

  // Потомки по уровням, без рекурсии в SQL: индекс дерева уже в памяти.
  const levels = (parentId: number | null, depth: number): number[][] =>
    Array.from({ length: depth - 1 }).reduce<number[][]>(
      (all) => [
        ...all,
        all.at(-1)!.flatMap((_) => [...(indexed().childrenOf.get(_) ?? [])]),
      ],
      [[...(indexed().childrenOf.get(parentId) ?? [])]]
    );

  const lineage = (id: number): number[] => {
    const parent = indexed().parentOf.get(id) ?? null;
    return parent === null ? [] : [parent, ...lineage(parent)];
  };

  const page = (id: number): PageView | null => {
    const row = byId.get(id);
    return reachable(row) ? view(row) : null;
  };

  const hubOf = (id: number): number | null =>
    ((row) => (row ? (row.translation_of ?? row.id) : null))(anyById.get(id));

  const setOf = (id: number): PageRow[] =>
    ((hub) => (hub === null ? [] : members.all(hub)))(hubOf(id));

  const translationNode =
    (hub: number) =>
    (row: PageRow): TranslationNode => ({
      id: row.id,
      title: row.title,
      language: indexed().languageOf.get(row.id) ?? row.language,
      published: row.published === 1,
      trashed: !indexed().pathOf.has(row.id),
      original: row.id === hub,
    });

  return {
    page,
    byPath: (path) => {
      const id = indexed().idOf.get(path);
      return id === undefined ? null : page(id);
    },
    children: (parentId, options = {}) =>
      childrenOf
        .all(parentId, options.includeHidden ? 1 : 0)
        .filter(reachable)
        .map(view),
    lineage,
    translations: (id) =>
      setOf(id)
        .filter((_) => _.published === 1)
        .filter(reachable)
        .map(view),
    translationHub: hubOf,
    list: (parentId, options = {}) => {
      const depth = _clamp(options.depth ?? 1, 1, _MAX_DEPTH);
      // Родители: сама страница, если она не в корзине, и её потомки всех уровней, кроме нижнего.
      const parents =
        parentId === null || indexed().pathOf.has(parentId)
          ? [parentId, ...levels(parentId, depth).slice(0, -1).flat()]
          : [];
      const where: [string, number, number] = [
        JSON.stringify(parents.filter((_) => _ !== null)),
        parents.includes(null) ? 1 : 0,
        options.includeHidden ? 1 : 0,
      ];
      const limit = _clamp(options.limit ?? _MAX_LIMIT, 1, _MAX_LIMIT);
      const offset = Math.max(0, Math.trunc(options.offset ?? 0));
      const sort = options.sort ?? 'published';
      return {
        items: (sort === 'title'
          ? byTitle(where, offset, limit)
          : listed(_ORDER[sort] ?? _ORDER.published).all(
              ...where,
              limit,
              offset
            )
        ).map(view),
        total: counted.get(...where)?.total ?? 0,
      };
    },
    containers: (parentId, depth) => [
      parentId,
      ...levels(parentId, _clamp(depth, 1, _MAX_DEPTH))
        .slice(0, -1)
        .flat()
        .filter((_) => indexed().childrenOf.has(_)),
    ],
    movedFrom: (path) =>
      ((row) => (row ? page(row.page_id) : null))(movedFrom.get(path)),
    drafts: {
      tree: () => nodes.all().map(_toNode(indexed().languageOf)),
      view: (id) => {
        const row = anyById.get(id);
        return row && view(row);
      },
      translations: (id) =>
        ((rows) =>
          rows.length < 2 ? [] : rows.map(translationNode(hubOf(id)!)))(
          setOf(id)
        ),
    },
    invalidate: () => void ((index = null), (fields = null)),
  };
};
