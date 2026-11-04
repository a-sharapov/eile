import { attempt } from '../shared/kernel/errors.ts';
import { metaOf, type WpPost, type WpSite, type WpTerm } from './source.ts';

/** Прежние адреса сайта WordPress: записи, рубрики, метки, авторы — путь с query, без хоста. */
export type Permalinks = {
  /** Адрес записи; null — у неё не было публичного адреса (черновик, тип без страниц). */
  readonly of: (post: WpPost) => string | null;
  /** Архив рубрики или метки. */
  readonly term: (term: WpTerm) => string;
  /** Начало адресов архивов: `/category/`, `/tag/`, `/author/` — для правил с разделом. */
  readonly bases: {
    readonly category: string;
    readonly tag: string;
    readonly author: string;
  };
  /** Подкаталог сайта: `/blog`, если WordPress жил не в корне; пусто — в корне. */
  readonly root: string;
  /** Постоянные ссылки выключены: адреса — `/?p=12`. */
  readonly plain: boolean;
  /** Хост старого сайта без www: по нему ссылка в тексте узнаётся как своя. */
  readonly host: string | null;
  /** Рубрика записи, по которой WordPress строил адрес `%category%`. */
  readonly primaryCategory: (post: WpPost) => WpTerm | null;
  /** Адрес страницы по ярлыкам, даже неопубликованной: ссылки в тексте могли вести и на него. */
  readonly slugPath: (post: WpPost) => string;
};

const _url = (raw: string): URL | null =>
  URL.canParse(raw) ? new URL(raw) : null;

/** Хост без `www.` — старый сайт мог жить на обоих. */
export var bareHost = (host: string): string =>
  host.toLowerCase().replace(/^www\./, '');

const _slash = (path: string): string =>
  path.endsWith('/') ? path : `${path}/`;

export var definePermalinks = (site: WpSite): Permalinks => {
  const option = (name: string): string => site.options.get(name) ?? '';
  const home = _url(option('home') || option('siteurl'));
  const root = (home?.pathname ?? '/').replace(/\/+$/, '');
  const structure = option('permalink_structure');
  const plain = site.source === 'sql' && structure === '';
  // Начало адресов архивов — часть структуры до первого тега: `/blog/%postname%/` → `/blog/`.
  const front =
    structure.indexOf('%') > 0
      ? structure.slice(0, structure.indexOf('%'))
      : '/';
  const base = (custom: string, fallback: string): string =>
    custom.trim() === ''
      ? `${root}${front}${fallback}/`
      : `${root}/${custom.trim().replace(/^\/+|\/+$/g, '')}/`;
  const bases = {
    category: base(option('category_base'), 'category'),
    tag: base(option('tag_base'), 'tag'),
    author: `${root}${front}author/`,
  };
  const posts = new Map(site.posts.map((_) => [_.id, _] as const));
  const terms = new Map(site.terms.map((_) => [_.id, _] as const));
  const termPath = (term: WpTerm, seen = 0): string =>
    ((parent) =>
      parent && seen < 20
        ? `${termPath(parent, seen + 1)}/${term.slug}`
        : term.slug)(term.parent > 0 ? terms.get(term.parent) : undefined);
  const primaryCategory = (post: WpPost): WpTerm | null =>
    ((categories) =>
      ((chosen) =>
        categories.find((_) => _.id === chosen) ??
        // WordPress берёт рубрику с меньшим id, если основная не выбрана.
        categories.toSorted((a, b) => a.id - b.id)[0] ??
        null)(
        Number(
          metaOf(post, '_yoast_wpseo_primary_category') ||
            metaOf(post, 'rank_math_primary_category') ||
            0
        )
      ))(
      post.terms
        .map((_) => terms.get(_))
        .filter((_): _ is WpTerm => _?.taxonomy === 'category')
    );
  const date = (post: WpPost) =>
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(post.localDate) ??
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(post.date ?? '');
  const tags = (post: WpPost): Readonly<Record<string, string>> =>
    ((d) => ({
      year: d?.[1] ?? '',
      monthnum: d?.[2] ?? '',
      day: d?.[3] ?? '',
      hour: d?.[4] ?? '',
      minute: d?.[5] ?? '',
      second: d?.[6] ?? '',
      post_id: String(post.id),
      postname: post.slug,
      category: ((term) => (term ? termPath(term) : 'uncategorized'))(
        primaryCategory(post)
      ),
      author: site.authors.get(post.author)?.slug ?? '',
    }))(date(post));
  const pagePath = (post: WpPost, seen = 0): string =>
    ((parent) =>
      parent && seen < 20
        ? `${pagePath(parent, seen + 1)}${post.slug}/`
        : `${root}/${post.slug}/`)(
      post.parent > 0 ? posts.get(post.parent) : undefined
    );
  const frontPage =
    option('show_on_front') === 'page' ? Number(option('page_on_front')) : 0;
  const QUERY: Readonly<Record<string, string>> = {
    page: 'page_id',
    post: 'p',
    attachment: 'attachment_id',
  };
  const fromDump = (post: WpPost): string | null =>
    post.type === 'page' && post.id === frontPage
      ? `${root}/`
      : plain
        ? QUERY[post.type]
          ? `${root}/?${QUERY[post.type]}=${post.id}`
          : null
        : post.type === 'page'
          ? pagePath(post)
          : post.type === 'post'
            ? `${root}${structure.replace(
                /%([a-z_]+)%/g,
                (match, name: string) => tags(post)[name] ?? match
              )}`
            : post.type === 'attachment'
              ? ((parent) =>
                  parent && parent.status === 'publish'
                    ? ((path) =>
                        path && !path.includes('?')
                          ? `${_slash(path)}${post.slug}/`
                          : `${root}/?attachment_id=${post.id}`)(
                        fromDump(parent)
                      )
                    : `${root}/${post.slug}/`)(posts.get(post.parent))
              : null;
  // В WXR адрес есть у каждой записи: `<link>`; у неопубликованной он вида `?p=12` и не нужен.
  const fromLink = (post: WpPost): string | null =>
    ((url) => (url ? `${url.pathname}${url.search}` : null))(
      post.link ? _url(post.link) : null
    );
  return {
    of: (post) =>
      post.status !== 'publish' && post.type !== 'attachment'
        ? null
        : site.source === 'wxr'
          ? fromLink(post)
          : fromDump(post),
    term: (term) =>
      plain
        ? term.taxonomy === 'category'
          ? `${root}/?cat=${term.id}`
          : `${root}/?tag=${term.slug}`
        : `${term.taxonomy === 'category' ? bases.category : bases.tag}${
            term.taxonomy === 'category' ? termPath(term) : term.slug
          }/`,
    bases,
    root,
    plain,
    host: home ? bareHost(home.host) : null,
    primaryCategory,
    slugPath: pagePath,
  };
};

/** Путь без процентной кодировки, слэша на конце и пустых сегментов: так сравниваются адреса. */
export var normalPath = (path: string): string =>
  ((decoded) => `/${decoded.split('/').filter(Boolean).join('/')}`)(
    attempt(
      () => decodeURIComponent(path),
      () => path
    )
  );
