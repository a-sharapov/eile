import type { Database } from '../../../platform/database.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type {
  DraftContent,
  ListOptions,
  ListSort,
  PageList,
  PageNode,
  PageView,
  PublishedContent,
  TranslationNode,
} from '../application/published-content.ts';
import {
  type AddressNode,
  type AddressStyle,
  addressEnding,
  addressKey,
  addressOf,
  addressVariants,
  childTrail,
  PLAIN_ADDRESS,
} from '../domain/address.ts';
import { type Field, type FieldValue, fitsField } from '../domain/field.ts';
import type { Page, PageKind } from '../domain/page.ts';
import { type FieldRow, toField } from './sqlite-field-repository.ts';
import {
  type FieldValueRow,
  type PageRow,
  toFieldValues,
} from './sqlite-page-repository.ts';

type TreeRow = {
  id: number;
  parent_id: number | null;
  key: string;
  trail: string;
  alias: string;
  folder: number;
  published: number;
  language: string;
};

type TreeIndex = {
  /** Адрес страницы: путь с окончанием по стилю адресов. */
  readonly pathOf: ReadonlyMap<number, string>;
  readonly idOf: ReadonlyMap<string, number>;
  /** Страница по ключу адреса — пути без окончания: так находится вариант адреса. */
  readonly keyOf: ReadonlyMap<string, number>;
  /** Начало адреса детей: видимые алиасы страницы и предков. */
  readonly trailOf: ReadonlyMap<number, string>;
  readonly parentOf: ReadonlyMap<number, number | null>;
  readonly childrenOf: ReadonlyMap<number | null, readonly number[]>;
  /** Язык с учётом ветки: язык пишется на ветку, страницы внутри наследуют его. */
  readonly languageOf: ReadonlyMap<number, string>;
};

// Ключ — алиасы предков, чей алиас в адресе, и свой алиас; trail — начало адреса детей.
const _TREE = `
  WITH RECURSIVE tree (id, parent_id, key, trail, alias, folder, published, language) AS (
    SELECT id, parent_id, '/' || alias,
           CASE alias_in_path WHEN 1 THEN '/' || alias ELSE '' END,
           alias, folder, published, language
    FROM content_pages WHERE parent_id IS NULL AND trashed_at IS NULL
    UNION ALL
    SELECT page.id, page.parent_id, tree.trail || '/' || page.alias,
           tree.trail || CASE page.alias_in_path WHEN 1 THEN '/' || page.alias ELSE '' END,
           page.alias, page.folder, page.published,
           CASE page.language WHEN '' THEN tree.language ELSE page.language END
    FROM content_pages AS page JOIN tree ON page.parent_id = tree.id
    WHERE page.trashed_at IS NULL
  )
  SELECT id, parent_id, key, trail, alias, folder, published, language FROM tree`;

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

// Наборов кандидатов отбора в памяти: разных списков со своим отбором на сайте обычно один-два.
const _CANDIDATE_SETS = 8;

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
  | 'folder'
  | 'alias_in_path'
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
  SELECT id, parent_id, kind, title, menu_title, alias, folder, alias_in_path, template, content_type,
         published, trashed_at, menu_index, hidden_from_menu, publish_at, unpublish_at, language
  FROM content_pages ORDER BY coalesce(parent_id, 0), menu_index, id`;

// Адреса узлов менеджера — по всем страницам, и в корзине тоже: так их видно и до публикации.
const _nodePaths = (
  rows: readonly NodeRow[],
  style: AddressStyle
): ReadonlyMap<number, string> => {
  const byId = new Map(rows.map((_) => [_.id, _]));
  const trails = new Map<number, string>();
  const trailOf = (id: number | null, depth = 0): string =>
    id === null || depth > rows.length
      ? ''
      : (trails.get(id) ??
        ((row) =>
          ((trail) => (trails.set(id, trail), trail))(
            row === undefined
              ? ''
              : childTrail(trailOf(row.parent_id, depth + 1), _addressNode(row))
          ))(byId.get(id)));
  return new Map(
    rows.map((_) => [
      _.id,
      addressOf(trailOf(_.parent_id), _addressNode(_), style).url,
    ])
  );
};

const _addressNode = (
  row: Pick<NodeRow, 'id' | 'parent_id' | 'alias' | 'folder' | 'alias_in_path'>
): AddressNode => ({
  id: row.id,
  parentId: row.parent_id,
  alias: row.alias,
  folder: row.folder === 1,
  aliasInPath: row.alias_in_path === 1,
});

// Язык узла — с учётом ветки по индексу дерева; у страницы в корзине — свой.
const _toNode =
  (
    languageOf: ReadonlyMap<number, string>,
    paths: ReadonlyMap<number, string>
  ) =>
  (row: NodeRow): PageNode => ({
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind as PageKind,
    title: row.title,
    menuTitle: row.menu_title,
    alias: row.alias,
    path: paths.get(row.id) ?? `/${row.alias}`,
    folder: row.folder === 1,
    aliasInPath: row.alias_in_path === 1,
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

// Повтор ключа или адреса (данные до проверки адресов) — побеждает опубликованная страница.
const _index = (rows: TreeRow[], style: AddressStyle): TreeIndex =>
  ((ordered) => ({
    pathOf: new Map(
      rows.map((_) => [
        _.id,
        `${_.key}${addressEnding({ alias: _.alias, folder: _.folder === 1 }, style)}`,
      ])
    ),
    idOf: new Map(
      ordered.map((_) => [
        `${_.key}${addressEnding({ alias: _.alias, folder: _.folder === 1 }, style)}`,
        _.id,
      ])
    ),
    keyOf: new Map(ordered.map((_) => [_.key, _.id])),
    trailOf: new Map(rows.map((_) => [_.id, _.trail])),
    parentOf: new Map(rows.map((_) => [_.id, _.parent_id])),
    childrenOf: rows.reduce(
      (all, row) =>
        all.set(row.parent_id, [...(all.get(row.parent_id) ?? []), row.id]),
      new Map<number | null, number[]>()
    ),
    languageOf: new Map(rows.map((_) => [_.id, _.language])),
  }))(rows.toSorted((a, b) => a.published - b.published));

const _sameStyle = (a: AddressStyle, b: AddressStyle): boolean =>
  a.suffix === b.suffix && a.folderSlash === b.folderSlash;

export var definePublishedContent = (
  db: Database,
  style: () => AddressStyle = () => PLAIN_ADDRESS
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
  // Вся ветка списка по сортировке — кандидаты для своего отбора и порядка.
  const everyListed = (order: string) =>
    db.query<PageRow, [string, number, number]>(
      `SELECT * ${_LISTED} ORDER BY ${order}`
    );
  const fieldRows = db.query<FieldRow, []>('SELECT * FROM content_fields');
  const valueRows = db.query<FieldValueRow, [number]>(
    'SELECT field, value FROM content_field_values WHERE page_id = ?'
  );
  const valuesIn = db.query<FieldValueRow & { page_id: number }, [string]>(
    `SELECT page_id, field, value FROM content_field_values
     WHERE page_id IN (SELECT value FROM json_each(?))`
  );
  let index: { tree: TreeIndex; style: AddressStyle } | null = null;
  let fields: readonly Field[] | null = null;

  // Индекс собран под стиль адресов: сменили его в настройках — собираем заново.
  const indexed = (): TreeIndex =>
    ((current) =>
      index !== null && _sameStyle(index.style, current)
        ? index.tree
        : (index = { tree: _index(tree.all(), current), style: current }).tree)(
      style()
    );
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
  const memoized = (read: ValuesOf = valuesOf): ValuesOf => {
    const seen = new Map<number, Values>();
    return (id) =>
      seen.get(id) ?? ((values) => (seen.set(id, values), values))(read(id));
  };

  // Значения полей пачки страниц и их предков — одним запросом, а не запросом на страницу.
  const batchValues = (ids: readonly number[]): ValuesOf =>
    ((all) =>
      ((rows) => memoized((id) => toFieldValues(rows.get(id) ?? [])))(
        valuesIn
          .all(JSON.stringify(all))
          .reduce(
            (map, row) =>
              map.set(row.page_id, [...(map.get(row.page_id) ?? []), row]),
            new Map<number, FieldValueRow[]>()
          )
      ))([...new Set(ids.flatMap((_) => [_, ...lineage(_)]))]);

  const fieldsOf = (
    row: PageRow,
    values: ValuesOf = memoized()
  ): Record<string, FieldValue | null> =>
    definitions()
      .filter((_) => _.templates.includes(row.template))
      .reduce<Record<string, FieldValue | null>>(
        (all, field) => ({
          ...all,
          [field.name]: resolve(values)(field, row.id),
        }),
        {}
      );

  const viewWith =
    (values: ValuesOf) =>
    (row: PageRow): PageView => ({
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
      folder: row.folder === 1,
      aliasInPath: row.alias_in_path === 1,
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
      fields: fieldsOf(row, values),
    });

  const view = (row: PageRow): PageView => viewWith(memoized())(row);

  // Своё значение — из самой страницы, наследуемое — от родителя по базе, как у сохранённой.
  const fieldsOfPage = (page: Page): Record<string, FieldValue | null> => {
    const values = memoized();
    return definitions()
      .filter((_) => _.templates.includes(page.template))
      .reduce<Record<string, FieldValue | null>>(
        (all, field) => ({
          ...all,
          [field.name]:
            (fitsField(field)(page.fields[field.name])
              ? page.fields[field.name]
              : undefined) ??
            (field.inherit && page.parentId !== null
              ? (own(values)(field, page.parentId) ??
                inherited(values)(field, page.parentId))
              : undefined) ??
            field.defaultValue,
        }),
        {}
      );
  };

  const viewOf = (page: Page): PageView =>
    ((stored, now) => ({
      id: page.id,
      parentId: page.parentId,
      kind: page.kind,
      title: page.title,
      longTitle: page.longTitle,
      menuTitle: page.menuTitle,
      description: page.description,
      introText: page.introText,
      alias: page.alias,
      path: addressOf(
        page.parentId === null
          ? ''
          : (indexed().trailOf.get(page.parentId) ?? ''),
        page,
        style()
      ).url,
      folder: page.folder,
      aliasInPath: page.aliasInPath,
      template: page.template,
      contentType: page.contentType,
      content: page.content,
      linkTo: page.linkTo,
      menuIndex: page.menuIndex,
      hiddenFromMenu: page.hiddenFromMenu,
      cacheable: page.cacheable,
      searchable: page.searchable,
      socialImage: page.socialImage,
      language:
        page.language ||
        (page.parentId === null
          ? ''
          : (indexed().languageOf.get(page.parentId) ?? '')),
      translationOf: page.translationOf,
      createdAt: stored?.created_at ?? now,
      updatedAt: now,
      publishedAt: page.publishedAt,
      fields: fieldsOfPage(page),
    }))(anyById.get(page.id), new Date().toISOString());

  // Кандидаты отбора — замороженные виды ветки: их держим до правки контента, и следующий рендер (регион
  // `Uncached` с отбором по запросу) только отбирает и сортирует. На 2600 страниц с полями сборка — около
  // 70 мс, из памяти — единицы мс.
  const candidates = new Map<string, readonly PageView[]>();

  const frozen = (view: PageView): PageView =>
    Object.freeze({ ...view, fields: Object.freeze({ ...view.fields }) });

  const candidatesOf = (
    where: [string, number, number],
    sort: ListSort
  ): readonly PageView[] =>
    ((key) =>
      candidates.get(key) ??
      ((views) => (
        candidates.size >= _CANDIDATE_SETS &&
          candidates.delete(candidates.keys().next().value!),
        candidates.set(key, views),
        views
      ))(
        ((rows) =>
          rows.map(viewWith(batchValues(rows.map((_) => _.id)))).map(frozen))(
          sort === 'title'
            ? byTitle(where, 0, Number.MAX_SAFE_INTEGER)
            : everyListed(_ORDER[sort] ?? _ORDER.published).all(...where)
        )
      ))(JSON.stringify([where, sort, style()]));

  /**
   * Список со своим отбором или порядком: кандидаты — все страницы, что взял бы обычный список, по его
   * сортировке; поля — одним запросом на пачку. `order` сортирует устойчиво: при равенстве остаётся `sort`.
   */
  const selected = (
    where: [string, number, number],
    sort: ListSort,
    { filter, order }: ListOptions,
    offset: number,
    limit: number
  ): PageList =>
    pipe(
      (views: readonly PageView[]) =>
        filter ? views.filter((_) => filter(_)) : [...views],
      (views: PageView[]) => (order ? views.toSorted(order) : views),
      (views: PageView[]) => ({
        items: views.slice(offset, offset + limit),
        total: views.length,
      })
    )(candidatesOf(where, sort));

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
    locate: (path) =>
      ((id) => (id === undefined ? null : page(id)))(
        indexed().idOf.get(path) ??
          indexed().keyOf.get(addressKey(path, style())) ??
          indexed().keyOf.get(path.length > 1 ? path.replace(/\/$/, '') : path)
      ),
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
      return options.filter || options.order
        ? selected(where, sort, options, offset, limit)
        : {
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
    // Прежний адрес мог быть записан с другим окончанием: `/o-nas`, `/o-nas/`, `/o-nas.html`.
    movedFrom: (path) =>
      addressVariants(path, style()).reduce<PageView | null>(
        (found, variant) =>
          found ??
          ((row) => (row ? page(row.page_id) : null))(movedFrom.get(variant)),
        null
      ),
    drafts: {
      tree: () =>
        ((rows) =>
          rows.map(_toNode(indexed().languageOf, _nodePaths(rows, style()))))(
          nodes.all()
        ),
      view: (id) => {
        const row = anyById.get(id);
        return row && view(row);
      },
      viewOf,
      translations: (id) =>
        ((rows) =>
          rows.length < 2 ? [] : rows.map(translationNode(hubOf(id)!)))(
          setOf(id)
        ),
    },
    invalidate: () =>
      void ((index = null), (fields = null), candidates.clear()),
  };
};
