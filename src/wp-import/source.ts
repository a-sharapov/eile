import {
  evoPrefix,
  type SqlRow,
  type SqlTables,
} from '../evo-import/sql-dump.ts';
import { fail } from '../shared/kernel/errors.ts';

/** Термин таксономии: рубрика, метка, меню (`nav_menu`) или своя. */
export type WpTerm = {
  readonly id: number;
  readonly taxonomy: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /** id родителя; 0 — верхний уровень. */
  readonly parent: number;
};

/** Запись WordPress любого типа: страница, запись, вложение, пункт меню, поле ACF… */
export type WpPost = {
  readonly id: number;
  readonly type: string;
  /** publish, draft, pending, private, future, trash, inherit, auto-draft. */
  readonly status: string;
  readonly title: string;
  /** `post_name` как в базе: может быть в процентной кодировке UTF-8. */
  readonly slug: string;
  readonly content: string;
  readonly excerpt: string;
  readonly parent: number;
  readonly menuOrder: number;
  /** Момент публикации в ISO UTC; null — не задан (черновик). */
  readonly date: string | null;
  /** Дата по часам сайта `2024-05-12 12:00:00`: из неё WordPress собирает адреса `%year%/%monthnum%`. */
  readonly localDate: string;
  /** Ключ автора: id из базы или логин из WXR. */
  readonly author: string;
  readonly password: boolean;
  readonly mime: string;
  readonly guid: string;
  /** Постоянный адрес из WXR (`<link>`); из дампа его нет — адрес считается по настройкам. */
  readonly link: string | null;
  /** Адрес файла вложения из WXR. */
  readonly attachmentUrl: string | null;
  /** Метаполя по порядку записи: у ACF порядок — это порядок полей на странице. */
  readonly meta: readonly (readonly [string, string])[];
  /** Термины записи: id из `terms`. */
  readonly terms: readonly number[];
};

/** Автор: только имя для отчёта и ярлык для адресов `%author%`. Почта и пароль не читаются. */
export type WpAuthor = { readonly name: string; readonly slug: string };

/** Сайт WordPress, прочитанный из WXR или дампа MySQL. */
export type WpSite = {
  readonly source: 'wxr' | 'sql';
  /** Только нужные переносу настройки: адрес, название, постоянные ссылки, главная, язык, меню темы. */
  readonly options: ReadonlyMap<string, string>;
  readonly posts: readonly WpPost[];
  readonly terms: readonly WpTerm[];
  readonly authors: ReadonlyMap<string, WpAuthor>;
  /** Одобренных комментариев: они не переносятся, в отчёте — только число. */
  readonly comments: number;
};

// Остальные настройки — данные чужих плагинов, ключи API и почта: их перенос не трогает вовсе.
const _OPTIONS = [
  'home',
  'siteurl',
  'blogname',
  'blogdescription',
  'permalink_structure',
  'category_base',
  'tag_base',
  'show_on_front',
  'page_on_front',
  'page_for_posts',
  'WPLANG',
  'default_category',
  'stylesheet',
];

/** Дата WordPress `2024-05-12 10:00:00` (UTC) → ISO; нули — не задана. */
export var wpMoment = (raw: string): string | null =>
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw.trim()) &&
  !raw.startsWith('0000')
    ? ((date) => (Number.isNaN(date.getTime()) ? null : date.toISOString()))(
        new Date(`${raw.trim().replace(' ', 'T')}Z`)
      )
    : null;

const _text = (row: SqlRow, column: string): string =>
  String(row[column] ?? '');
const _int = (row: SqlRow, column: string): number => Number(row[column] ?? 0);

/** Префикс таблиц WordPress (`wp_`): у него есть и `posts`, и `postmeta`, и `options`. */
export var wordpressPrefix = (tables: SqlTables): string | null =>
  [...tables.keys()]
    .filter((_) => _.endsWith('posts'))
    .map((_) => _.slice(0, -'posts'.length))
    .filter(
      (_) =>
        tables.has(`${_}postmeta`) &&
        (tables.has(`${_}options`) || tables.has(`${_}terms`))
    )
    .toSorted((a, b) => a.length - b.length)[0] ?? null;

// REPLACE INTO перезаписывает строку с тем же ключом: побеждает последняя, как в Evo.
const _rows = (
  tables: SqlTables,
  name: string,
  key: string
): readonly SqlRow[] => [
  ...new Map(
    (tables.get(name) ?? []).map(
      (row, index) => [String(row[key] ?? `#${index}`), row] as const
    )
  ).values(),
];

const _group = <T>(
  pairs: readonly (readonly [number, T])[]
): Map<number, T[]> =>
  pairs.reduce<Map<number, T[]>>(
    (map, { 0: id, 1: value }) => map.set(id, [...(map.get(id) ?? []), value]),
    new Map()
  );

/** Сайт из дампа mysqldump: таблицы с найденным префиксом. */
export var siteFromDump = (tables: SqlTables): WpSite => {
  const prefix =
    wordpressPrefix(tables) ??
    (evoPrefix(tables) === null
      ? fail(
          'wp.not_wordpress',
          'The dump has no WordPress tables (posts, postmeta, options)'
        )
      : fail('wp.evo_dump', 'This is an Evo dump: use cms import-evo'));
  const options = new Map(
    _rows(tables, `${prefix}options`, 'option_name')
      .filter(
        (_) =>
          _OPTIONS.includes(_text(_, 'option_name')) ||
          _text(_, 'option_name').startsWith('theme_mods_')
      )
      .map((_) => [_text(_, 'option_name'), _text(_, 'option_value')] as const)
  );
  // Меню темы — только у текущей темы; остальные theme_mods не нужны.
  const theme = `theme_mods_${options.get('stylesheet') ?? ''}`;
  const meta = _group(
    _rows(tables, `${prefix}postmeta`, 'meta_id').map(
      (_) =>
        [
          _int(_, 'post_id'),
          [_text(_, 'meta_key'), _text(_, 'meta_value')] as const,
        ] as const
    )
  );
  const taxonomy = new Map(
    _rows(tables, `${prefix}term_taxonomy`, 'term_taxonomy_id').map(
      (_) => [_int(_, 'term_taxonomy_id'), _] as const
    )
  );
  const names = new Map(
    _rows(tables, `${prefix}terms`, 'term_id').map(
      (_) => [_int(_, 'term_id'), _] as const
    )
  );
  const terms = [...taxonomy.values()].map(
    (row): WpTerm => ({
      id: _int(row, 'term_id'),
      taxonomy: _text(row, 'taxonomy'),
      slug: _text(names.get(_int(row, 'term_id')) ?? {}, 'slug'),
      name: _text(names.get(_int(row, 'term_id')) ?? {}, 'name'),
      description: _text(row, 'description'),
      parent: _int(row, 'parent'),
    })
  );
  const relations = _group(
    (tables.get(`${prefix}term_relationships`) ?? []).flatMap((_) =>
      ((term) =>
        term === undefined
          ? []
          : [[_int(_, 'object_id'), _int(term, 'term_id')] as const])(
        taxonomy.get(_int(_, 'term_taxonomy_id'))
      )
    )
  );
  return {
    source: 'sql',
    options: new Map(
      [...options].filter(
        ({ 0: name }) => !name.startsWith('theme_mods_') || name === theme
      )
    ),
    posts: _rows(tables, `${prefix}posts`, 'ID').map(
      (row): WpPost => ({
        id: _int(row, 'ID'),
        type: _text(row, 'post_type'),
        status: _text(row, 'post_status'),
        title: _text(row, 'post_title'),
        slug: _text(row, 'post_name'),
        content: _text(row, 'post_content'),
        excerpt: _text(row, 'post_excerpt'),
        parent: _int(row, 'post_parent'),
        menuOrder: _int(row, 'menu_order'),
        date:
          wpMoment(_text(row, 'post_date_gmt')) ??
          wpMoment(_text(row, 'post_date')),
        localDate: _text(row, 'post_date'),
        author: String(_int(row, 'post_author')),
        password: _text(row, 'post_password') !== '',
        mime: _text(row, 'post_mime_type'),
        guid: _text(row, 'guid'),
        link: null,
        attachmentUrl: null,
        meta: meta.get(_int(row, 'ID')) ?? [],
        terms: relations.get(_int(row, 'ID')) ?? [],
      })
    ),
    terms,
    comments: (tables.get(`${prefix}comments`) ?? []).filter(
      (_) => _text(_, 'comment_approved') === '1'
    ).length,
    // Из пользователей — только имя и ярлык: почта, логин и хэш пароля остаются в дампе.
    authors: new Map(
      _rows(tables, `${prefix}users`, 'ID').map(
        (_) =>
          [
            String(_int(_, 'ID')),
            {
              name: _text(_, 'display_name') || _text(_, 'user_nicename'),
              slug: _text(_, 'user_nicename'),
            },
          ] as const
      )
    ),
  };
};

type Node = Readonly<Record<string, unknown>>;

const _list = (value: unknown): Node[] =>
  value === undefined || value === null
    ? []
    : ([value].flat() as unknown[]).map((_) =>
        typeof _ === 'object' && _ !== null ? (_ as Node) : { '#text': _ }
      );

const _string = (node: Node, key: string): string =>
  ((value) =>
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null
        ? String((value as Node)['#text'] ?? '')
        : '')(node[key]);

// Слэш у родителя в WXR — ярлык рубрики, а не id.
const _wxrTerms = (channel: Node): WpTerm[] => {
  const raw = [
    ..._list(channel['wp:category']).map((_) => ({
      id: Number(_string(_, 'wp:term_id')),
      taxonomy: 'category',
      slug: _string(_, 'wp:category_nicename'),
      name: _string(_, 'wp:cat_name'),
      description: _string(_, 'wp:category_description'),
      parentSlug: _string(_, 'wp:category_parent'),
    })),
    ..._list(channel['wp:tag']).map((_) => ({
      id: Number(_string(_, 'wp:term_id')),
      taxonomy: 'post_tag',
      slug: _string(_, 'wp:tag_slug'),
      name: _string(_, 'wp:tag_name'),
      description: _string(_, 'wp:tag_description'),
      parentSlug: '',
    })),
    ..._list(channel['wp:term']).map((_) => ({
      id: Number(_string(_, 'wp:term_id')),
      taxonomy: _string(_, 'wp:term_taxonomy'),
      slug: _string(_, 'wp:term_slug'),
      name: _string(_, 'wp:term_name'),
      description: _string(_, 'wp:term_description'),
      parentSlug: _string(_, 'wp:term_parent'),
    })),
  ];
  return raw.map(({ parentSlug, ...term }) => ({
    ...term,
    parent:
      raw.find((_) => _.taxonomy === term.taxonomy && _.slug === parentSlug)
        ?.id ?? 0,
  }));
};

// Язык канала `de-DE` → WPLANG `de_DE`, как в базе.
const _locale = (language: string): string => language.replace('-', '_');

/** Сайт из файла WXR (Инструменты → Экспорт). */
export var siteFromWxr = (xml: string | Uint8Array): WpSite => {
  const root = Bun.XML.parse(xml) as Node;
  const channel = ((root.rss ?? {}) as Node).channel as Node | undefined;
  const items = channel ? _list(channel.item) : [];
  void (
    (channel &&
      (channel['wp:wxr_version'] !== undefined || items.length > 0)) ||
    fail('wp.not_wxr', 'This XML is not a WordPress export (WXR)')
  );
  const terms = _wxrTerms(channel!);
  const home =
    _string(channel!, 'wp:base_blog_url') || _string(channel!, 'link');
  return {
    source: 'wxr',
    options: new Map(
      [
        ['home', home],
        ['siteurl', _string(channel!, 'wp:base_site_url') || home],
        ['blogname', _string(channel!, 'title')],
        ['blogdescription', _string(channel!, 'description')],
        ['WPLANG', _locale(_string(channel!, 'language'))],
      ].filter(({ 1: value }) => value !== '') as [string, string][]
    ),
    posts: items.map(
      (item): WpPost => ({
        id: Number(_string(item, 'wp:post_id')),
        type: _string(item, 'wp:post_type'),
        status: _string(item, 'wp:status'),
        title: _string(item, 'title'),
        slug: _string(item, 'wp:post_name'),
        content: _string(item, 'content:encoded'),
        excerpt: _string(item, 'excerpt:encoded'),
        parent: Number(_string(item, 'wp:post_parent') || 0),
        menuOrder: Number(_string(item, 'wp:menu_order') || 0),
        date:
          wpMoment(_string(item, 'wp:post_date_gmt')) ??
          wpMoment(_string(item, 'wp:post_date')),
        localDate: _string(item, 'wp:post_date'),
        author: _string(item, 'dc:creator'),
        password: _string(item, 'wp:post_password') !== '',
        mime: '',
        guid: _string(item, 'guid'),
        link: _string(item, 'link') || null,
        attachmentUrl: _string(item, 'wp:attachment_url') || null,
        meta: _list(item['wp:postmeta']).map(
          (_) =>
            [_string(_, 'wp:meta_key'), _string(_, 'wp:meta_value')] as const
        ),
        terms: _list(item.category).flatMap((_) =>
          ((term) => (term ? [term.id] : []))(
            terms.find(
              (term) =>
                term.taxonomy === _string(_, '@domain') &&
                term.slug === _string(_, '@nicename')
            )
          )
        ),
      })
    ),
    terms,
    comments: items.reduce(
      (sum, item) =>
        sum +
        _list(item['wp:comment']).filter(
          (_) => _string(_, 'wp:comment_approved') === '1'
        ).length,
      0
    ),
    authors: new Map(
      _list(channel!['wp:author']).map(
        (_) =>
          [
            _string(_, 'wp:author_login'),
            {
              name:
                _string(_, 'wp:author_display_name') ||
                _string(_, 'wp:author_login'),
              slug: _string(_, 'wp:author_login').toLowerCase(),
            },
          ] as const
      )
    ),
  };
};

/** Значение метаполя записи; нет его — пусто. */
export var metaOf = (post: WpPost, key: string): string =>
  post.meta.find((_) => _[0] === key)?.[1] ?? '';
