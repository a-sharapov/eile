import {
  aliasFromTitle,
  type ContentService,
  type CreatePageInput,
} from '../contexts/content/index.ts';
import type { DesignService } from '../contexts/design/index.ts';
import type { Media } from '../contexts/media/index.ts';
import type { RedirectsService } from '../contexts/redirects/index.ts';
import type { SiteService } from '../contexts/site/index.ts';
import { kitClosure } from '../kit/index.ts';
import { scaffoldsFor } from '../scaffolds/index.ts';
import { attempt, fail, isDomainError } from '../shared/kernel/errors.ts';
import { convertContent } from './convert.ts';
import { plainText } from './emit.ts';
import {
  acfFields,
  acfHtml,
  builderOf,
  elementorHtml,
  seoOf,
} from './extras.ts';
import {
  type Attachment,
  attachmentsOf,
  importMedia,
  type MediaResult,
  type MediaSkip,
  type MediaSource,
} from './media.ts';
import { mainMenu } from './menus.ts';
import { type ContentNotes, emptyNotes, type Href, tag } from './notes.ts';
import {
  bareHost,
  definePermalinks,
  normalPath,
  type Permalinks,
} from './permalinks.ts';
import type { WpPost, WpSite, WpTerm } from './source.ts';

export type WpServices = {
  readonly content: ContentService;
  readonly design: DesignService;
  readonly site: SiteService;
  readonly media: Media;
  readonly redirects: RedirectsService;
};

export type WpImportOptions = {
  /** Страница, под которую лечь; null — сайт пуст, перенос становится сайтом целиком. */
  readonly into: number | null;
  readonly media: MediaSource | null;
  /** Пробный прогон: сервисы — снимок базы, файлы не скачиваются. */
  readonly dryRun: boolean;
  readonly fetch?: typeof fetch;
};

type Counts = {
  readonly total: number;
  readonly published: number;
  readonly drafts: number;
  readonly private: number;
  readonly scheduled: number;
  readonly protected: number;
};

/** Страница, о которой стоит сказать: id в Eile и заголовок. */
export type WpItem = { readonly id: number; readonly title: string };

/** Отчёт переноса: что создано, как сопоставлено, что пропущено и почему. */
export type WpReport = {
  readonly source: 'wxr' | 'sql';
  readonly dryRun: boolean;
  readonly into: number | null;
  readonly pages: Counts;
  readonly posts: Counts;
  /** Раздел записей с лентой; null — записей нет. */
  readonly section: (WpItem & { readonly created: boolean }) | null;
  readonly home: number | null;
  readonly taxonomy: {
    readonly categories: number;
    readonly tags: number;
    /** Записи с несколькими рубриками: в адресе одна, остальные — в поле. */
    readonly multiple: number;
  };
  readonly media: {
    readonly attachments: number;
    readonly imported: number;
    readonly images: number;
    readonly source: string | null;
    readonly skipped: readonly MediaSkip[];
    readonly featured: number;
  };
  readonly content: ContentNotes;
  /** Страницы конструкторов и ACF: вёрстка не перенесена, текст — где смог. */
  readonly builders: readonly (WpItem & {
    readonly builder: string;
    readonly text: boolean;
  })[];
  readonly seo: {
    readonly plugins: readonly string[];
    readonly titles: number;
    readonly descriptions: number;
    readonly noindex: number;
  };
  readonly menu: {
    readonly name: string;
    readonly items: number;
    readonly placed: number;
    readonly hidden: number;
    readonly links: number;
    /** Вложенность меню расходится с деревом страниц: дерево важнее, адреса не меняются. */
    readonly nested: number;
    readonly skipped: readonly string[];
  } | null;
  readonly redirects: {
    readonly created: number;
    readonly query: number;
    readonly prefix: number;
    readonly skipped: readonly {
      readonly from: string;
      readonly reason: string;
    }[];
  };
  readonly authors: readonly {
    readonly name: string;
    readonly posts: number;
  }[];
  readonly comments: number;
  /** Записи, которые не переносятся: тип и статус → сколько. */
  readonly skipped: readonly {
    readonly type: string;
    readonly status: string;
    readonly count: number;
  }[];
  readonly warnings: readonly string[];
};

const _IMPORTED = new Set(['publish', 'draft', 'pending', 'private', 'future']);

// Служебные типы, которые перенос читает сам (меню, поля ACF, блоки, вложения) или которым на сайте не место.
const _CONSUMED = new Set([
  'attachment',
  'nav_menu_item',
  'wp_navigation',
  'wp_block',
  'acf-field',
  'acf-field-group',
]);

const _SECTION: Readonly<Record<string, string>> = {
  ru: 'Блог',
  de: 'Blog',
  _: 'Blog',
};

// Страницы поиска и 404 каркаса блога — на языке сайта: у каркаса только русский и английский.
const _EXTRAS: Readonly<
  Record<
    string,
    {
      readonly search: string;
      readonly notFound: string;
      readonly text: string;
    }
  >
> = {
  de: {
    search: 'Suche',
    notFound: 'Seite nicht gefunden',
    text: '<p>Diese Seite gibt es hier nicht – vielleicht wurde sie umbenannt. Schauen Sie in den <a href="[~@{blog}~]">Blog</a> oder gehen Sie <a href="/">zur Startseite</a>.</p>',
  },
};

const _language = (locale: string): string =>
  ((code) => (/^[a-z]{2,3}$/.test(code) ? code : 'en'))(
    (locale.split(/[_-]/)[0] ?? '').toLowerCase()
  );

const _ALIAS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const _RESERVED = new Set(['manager', 'media']);

const _decoded = (slug: string): string =>
  attempt(
    () => decodeURIComponent(slug),
    () => slug
  );

const _counts = (posts: readonly WpPost[]): Counts => ({
  total: posts.length,
  published: posts.filter((_) => _.status === 'publish' && !_.password).length,
  drafts: posts.filter((_) => _.status === 'draft' || _.status === 'pending')
    .length,
  private: posts.filter((_) => _.status === 'private').length,
  scheduled: posts.filter((_) => _.status === 'future').length,
  protected: posts.filter((_) => _.password && _.status === 'publish').length,
});

const _merge = (into: ContentNotes, from: ContentNotes): void => {
  into.figures += from.figures;
  into.galleries += from.galleries;
  into.videos += from.videos;
  into.links += from.links;
  into.unresolved.push(...from.unresolved);
  into.images.push(...from.images);
  into.tables += from.tables;
  into.code += from.code;
  into.shifted = into.shifted || from.shifted;
  Object.entries(from.shortcodes).forEach(
    ({ 0: name, 1: n }) =>
      void (into.shortcodes[name] = (into.shortcodes[name] ?? 0) + n)
  );
  Object.entries(from.blocks).forEach(
    ({ 0: name, 1: n }) =>
      void (into.blocks[name] = (into.blocks[name] ?? 0) + n)
  );
  into.forms.push(...from.forms);
  into.embeds.push(...from.embeds);
  from.builders.forEach(
    (_) => void (into.builders.includes(_) || into.builders.push(_))
  );
  into.html += from.html;
};

const _unique = (list: readonly string[]): string[] => [...new Set(list)];

// Анонс записи без своего: первые 55 слов текста, как у WordPress.
const _excerpt = (text: string): string =>
  ((words) =>
    words.length > 55 ? `${words.slice(0, 55).join(' ')}…` : words.join(' '))(
    plainText(text).split(' ').filter(Boolean)
  );

/** Сайт пуст: ни страниц, ни элементов, ни полей — перенос становится сайтом целиком. */
export var emptySite = ({ content, design }: WpServices): boolean =>
  content.isEmpty() &&
  design.elements.list().length === 0 &&
  content.fields.list().length === 0;

/**
 * Переносит сайт WordPress: страницы и записи с деревом, порядком и статусами, раздел записей с лентой, рубрики
 * и метки в поля, вложения в медиатеку, SEO, меню, старые адреса — в правила переадресации. Существующее не
 * перезаписывается: сайт пуст или перенос ложится под пустую страницу `into`.
 */
export var importWordPress = (
  services: WpServices,
  site: WpSite,
  options: WpImportOptions
): Promise<WpReport> =>
  Promise.resolve(options).then(() => {
    const { content, design, media } = services;
    void (options.into === null
      ? emptySite(services) ||
        fail(
          'wp.not_empty',
          'The site already has pages or elements: import into an empty site or under --into'
        )
      : ((page) =>
          page === null
            ? fail('wp.into_missing', `There is no page ${options.into}`)
            : content.drafts.tree().some((_) => _.parentId === options.into)
              ? fail(
                  'wp.into_not_empty',
                  `Page ${options.into} already has children: pick an empty page`
                )
              : page)(content.drafts.view(options.into)));
    const { list: attachments, unsupported } = attachmentsOf(site);
    const loaded: Promise<MediaResult> =
      options.media === null
        ? Promise.resolve({ imported: new Map(), skipped: [] })
        : importMedia(attachments, options.media, media, {
            dryRun: options.dryRun,
            ...(options.fetch ? { fetch: options.fetch } : {}),
          });
    return loaded.then((result) =>
      _write(services, site, options, attachments, {
        imported: result.imported,
        skipped: [...unsupported, ...result.skipped],
      })
    );
  });

const _write = (
  services: WpServices,
  site: WpSite,
  options: WpImportOptions,
  attachments: readonly Attachment[],
  mediaResult: MediaResult
): WpReport => {
  const { content, design, redirects } = services;
  const warnings: string[] = [];
  const tryTo = <T>(label: string, run: () => T): T | null =>
    attempt(
      run,
      (error) => (
        warnings.push(
          `${label}: ${isDomainError(error) ? error.message : String(error)}`
        ),
        null
      )
    );

  const into = options.into;
  const whole = into === null;
  const language = whole
    ? _language(site.options.get('WPLANG') ?? '')
    : (content.drafts.view(into)?.language ?? '') ||
      services.site.settings.get().language;
  const permalinks = definePermalinks(site);
  const terms = new Map(site.terms.map((_) => [_.id, _] as const));
  const option = (name: string): string => site.options.get(name) ?? '';

  // --- что переносится ---------------------------------------------------------------------------

  const live = (_: WpPost) => _IMPORTED.has(_.status);
  const pages = site.posts.filter((_) => _.type === 'page' && live(_));
  const posts = site.posts.filter((_) => _.type === 'post' && live(_));
  const reusable = new Map(
    site.posts
      .filter((_) => _.type === 'wp_block')
      .map((_) => [_.id, _.content] as const)
  );
  const skipped = [
    ...site.posts
      .filter(
        (_) =>
          !_CONSUMED.has(_.type) &&
          !((_.type === 'page' || _.type === 'post') && live(_))
      )
      .reduce<Map<string, number>>(
        (map, _) =>
          ((key) => map.set(key, (map.get(key) ?? 0) + 1))(
            `${_.type}\u0000${_.status}`
          ),
        new Map()
      ),
  ].map(({ 0: key, 1: count }) =>
    (({ 0: type, 1: status }) => ({ type: type!, status: status!, count }))(
      key.split('\u0000')
    )
  );

  // --- id ------------------------------------------------------------------------------------
  // В пустой сайт id сохраняются: страница 42 в WordPress — 42 и здесь. Под `into` — сдвиг за последний id.

  const existing = content.drafts
    .tree()
    .reduce((max, _) => Math.max(max, _.id), 0);
  const offset = whole ? 0 : existing;
  const idOf = (wpId: number): number => wpId + offset;
  const top = [...pages, ...posts].reduce((max, _) => Math.max(max, _.id), 0);
  let nextExtra = Math.max(existing, offset + top);
  const extraId = (): number => ++nextExtra;

  const pageIds = new Set(pages.map((_) => _.id));
  const front =
    option('show_on_front') === 'page' &&
    pageIds.has(Number(option('page_on_front')))
      ? Number(option('page_on_front'))
      : site.source === 'wxr'
        ? (pages.find(
            (_) =>
              _.status === 'publish' &&
              permalinks.of(_) === `${permalinks.root}/`
          )?.id ?? 0)
        : 0;
  const postsPage =
    pageIds.has(Number(option('page_for_posts'))) &&
    Number(option('page_for_posts')) !== front
      ? Number(option('page_for_posts'))
      : 0;
  const sectionId =
    posts.length === 0 ? null : postsPage > 0 ? idOf(postsPage) : extraId();

  // --- шаблоны и поля ------------------------------------------------------------------------------

  const scaffold = scaffoldsFor(language).find((_) => _.name === 'blog')!;
  const hasTemplate = (name: string) =>
    design.elements.get('template', name) !== null;
  const hasComponent = (name: string) =>
    design.elements.get('component', name) !== null;
  const installKit = (name: string): void =>
    kitClosure(name, language)
      .filter((_) => !hasComponent(_.name))
      .forEach(
        (_) =>
          void tryTo(`component ${_.name}`, () =>
            design.components.save(_.name, _.source)
          )
      );
  void (
    whole &&
    tryTo('blog scaffold', () => {
      (scaffold.kit ?? []).forEach(installKit);
      Object.entries(scaffold.components ?? {}).forEach(
        ({ 0: name, 1: source }) => void design.components.save(name, source)
      );
      Object.entries(scaffold.templates).forEach(
        ({ 0: name, 1: source }) => void design.templates.save(name, source)
      );
    })
  );
  ['Figure', 'Gallery', 'Video'].forEach(installKit);
  const base = whole ? 'Page' : content.drafts.view(into)!.template;
  const templates = {
    home: whole ? 'Home' : base,
    page: base,
    section: whole ? 'Blog' : base,
    post: whole ? 'Post' : hasTemplate('Post') ? 'Post' : base,
  };
  // Лента в разделе под `into`: шаблон чужой, поэтому лента — тегом в тексте, PostList ставится из набора.
  void (!whole && sectionId !== null && installKit('PostList'));
  const field = (
    name: string,
    label: string,
    type: 'image' | 'text'
  ): string | null =>
    tryTo(`field ${name}`, () =>
      ((found) =>
        found === undefined
          ? content.fields.save({
              name,
              label,
              type,
              templates: [templates.post],
            })
          : found.type !== type
            ? fail(
                'wp.field_type',
                `Field ${name} exists with type ${found.type}`
              )
            : found.templates.includes(templates.post)
              ? found.name
              : content.fields.save({
                  ...found,
                  templates: [...found.templates, templates.post],
                }))(content.fields.list().find((_) => _.name === name))
    ) as string | null;
  const fieldLabels = (
    {
      ru: ['Обложка', 'Рубрики', 'Метки'],
      de: ['Titelbild', 'Kategorien', 'Schlagwörter'],
    } as Record<string, string[]>
  )[language] ?? ['Cover', 'Categories', 'Tags'];
  const hasCategories = site.terms.some((_) => _.taxonomy === 'category');
  const hasTags = site.terms.some((_) => _.taxonomy === 'post_tag');
  const fields =
    posts.length === 0
      ? { cover: null, categories: null, tags: null }
      : {
          cover: field('cover', fieldLabels[0]!, 'image'),
          categories: hasCategories
            ? field('categories', fieldLabels[1]!, 'text')
            : null,
          tags: hasTags ? field('tags', fieldLabels[2]!, 'text') : null,
        };

  // --- вложения и ссылки -----------------------------------------------------------------------

  const imported = mediaResult.imported;
  const attachmentById = new Map(attachments.map((_) => [_.id, _] as const));
  // Адрес любого размера картинки → вложение: `2024/05/photo-300x200.jpg`, `photo-scaled.jpg`.
  const byFile = new Map(
    attachments.flatMap((a) =>
      ((dir) => [
        [a.file.toLowerCase(), a.id] as const,
        ...a.sizes.map((_) => [`${dir}${_}`.toLowerCase(), a.id] as const),
      ])(
        a.file.includes('/') ? a.file.slice(0, a.file.lastIndexOf('/') + 1) : ''
      )
    )
  );
  const attachmentByFile = (file: string): number | null =>
    ((key) =>
      byFile.get(key) ??
      byFile.get(key.replace(/-\d+x\d+(\.[a-z0-9]+)$/, '$1')) ??
      byFile.get(key.replace(/(\.[a-z0-9]+)$/, '-scaled$1')) ??
      null)(file.toLowerCase());
  // Картинкой в тексте и обложкой бывает только картинка; ссылка ведёт на любой файл.
  const mediaById = (id: number): string | null =>
    attachmentById.get(id)?.image ? (imported.get(id) ?? null) : null;

  // Прежний путь → куда он ведёт теперь.
  type Target =
    | { readonly kind: 'page'; readonly id: number }
    | { readonly kind: 'attachment'; readonly id: number };
  // Позже в списке — важнее: опубликованный адрес, затем адрес по ярлыкам (черновики), затем вложения.
  const postsById = new Map(site.posts.map((_) => [_.id, _] as const));
  const entry = (path: string | null, target: Target) =>
    path ? [[normalPath(path), target] as const] : [];
  const oldPaths = new Map<string, Target>([
    ...attachments.flatMap((a) =>
      ((post) =>
        entry(post ? permalinks.of(post) : null, {
          kind: 'attachment',
          id: a.id,
        }))(postsById.get(a.id))
    ),
    ...pages.flatMap((post) =>
      entry(permalinks.slugPath(post), { kind: 'page', id: idOf(post.id) })
    ),
    ...[...pages, ...posts].flatMap((post) =>
      entry(permalinks.of(post), { kind: 'page', id: idOf(post.id) })
    ),
  ]);

  const homeUrl = ((raw) => (URL.canParse(raw) ? new URL(raw) : null))(
    option('home') || option('siteurl')
  );
  const fileHref = (id: number): Href =>
    ((path) =>
      path === null
        ? { kind: 'attachment' }
        : {
            kind: 'file',
            href: `/media/${path}`,
            image: attachmentById.get(id)?.image ?? false,
          })(imported.get(id) ?? null);
  const byQuery = (query: URLSearchParams): Href | null =>
    ((p, page, attachment, cat) =>
      p > 0 && (pageIds.has(p) || posts.some((_) => _.id === p))
        ? { kind: 'page', id: idOf(p), hash: '' }
        : page > 0 && pageIds.has(page)
          ? { kind: 'page', id: idOf(page), hash: '' }
          : attachment > 0
            ? fileHref(attachment)
            : cat > 0 && sectionId !== null
              ? { kind: 'page', id: sectionId, hash: '' }
              : null)(
      Number(query.get('p') ?? 0),
      Number(query.get('page_id') ?? 0),
      Number(query.get('attachment_id') ?? 0),
      Number(query.get('cat') ?? 0)
    );
  const termHref = (path: string): Href | null =>
    sectionId !== null &&
    [permalinks.bases.category, permalinks.bases.tag].some((_) =>
      `${path}/`.startsWith(
        normalPath(_) === '/' ? '/\u0000' : `${normalPath(_)}/`
      )
    )
      ? { kind: 'page', id: sectionId, hash: '' }
      : null;
  const link = (raw: string): Href => {
    const text = raw.trim();
    const url =
      text === '' || text.startsWith('#')
        ? null
        : URL.canParse(text, homeUrl?.href ?? 'http://wordpress.invalid/')
          ? new URL(text, homeUrl?.href ?? 'http://wordpress.invalid/')
          : null;
    const own =
      url !== null &&
      /^https?:$/.test(url.protocol) &&
      (homeUrl === null
        ? !/^[a-z][a-z0-9+.-]*:/i.test(text)
        : bareHost(url.host) === bareHost(homeUrl.host));
    const path = url ? normalPath(url.pathname) : '';
    const uploads = path.indexOf('/wp-content/uploads/');
    const target =
      own && uploads >= 0
        ? ((id) => (id === null ? null : fileHref(id)))(
            attachmentByFile(
              path.slice(uploads + '/wp-content/uploads/'.length)
            )
          )
        : own
          ? (byQuery(url!.searchParams) ??
            ((found) =>
              found?.kind === 'page'
                ? ({ kind: 'page', id: found.id, hash: url!.hash } as Href)
                : found?.kind === 'attachment'
                  ? fileHref(found.id)
                  : null)(oldPaths.get(path)) ??
            termHref(path) ??
            (path === normalPath(`${permalinks.root}/`) && home !== null
              ? ({ kind: 'page', id: home, hash: url!.hash } as Href)
              : null))
          : null;
    return url === null
      ? { kind: 'none' }
      : (target ??
          (own
            ? {
                kind: 'url',
                href: `${url.pathname}${url.search}${url.hash}`,
                internal: true,
              }
            : /^(?:https?|mailto|tel):$/.test(url.protocol)
              ? { kind: 'url', href: text, internal: false }
              : { kind: 'none' }));
  };

  // --- главная, меню и порядок -------------------------------------------------------------------

  const home: number | null = !whole
    ? null
    : front > 0
      ? idOf(front)
      : (sectionId ??
        ((first) => (first ? idOf(first.id) : null))(
          pages
            .filter((_) => _.parent === 0 && _.status === 'publish')
            .toSorted((a, b) => a.menuOrder - b.menuOrder)[0]
        ));

  const menu = mainMenu(site);
  const menuPlan = ((items) => {
    type Place = { readonly index: number; readonly title: string };
    const places = new Map<number, Place>();
    const links: { index: number; title: string; url: string }[] = [];
    const missed: string[] = [];
    let sectionPlace: Place | null = null;
    let nested = 0;
    const pageOf = (item: (typeof items)[number]): number | null =>
      item.target.kind === 'post'
        ? item.target.id
        : item.target.kind === 'url'
          ? ((href) => (href.kind === 'page' ? href.id - offset : null))(
              link(item.target.url)
            )
          : null;
    items.forEach((item, index) => {
      const wpId = pageOf(item);
      const isSection =
        (item.target.kind === 'term' && sectionId !== null) ||
        (wpId !== null && idOf(wpId) === sectionId);
      void (isSection
        ? (sectionPlace ??= { index, title: item.title })
        : wpId !== null && pageIds.has(wpId)
          ? (places.has(wpId) || places.set(wpId, { index, title: item.title }),
            ((parentItem) =>
              void (
                parentItem &&
                pageOf(parentItem) !== null &&
                pages.find((_) => _.id === wpId)?.parent !==
                  pageOf(parentItem) &&
                nested++
              ))(items.find((_) => _.key === item.parent)))
          : item.target.kind === 'url' &&
              /^(?:https?:\/\/|\/)/.test(item.target.url) &&
              item.title
            ? links.push({ index, title: item.title, url: item.target.url })
            : missed.push(
                item.title ||
                  (item.target.kind === 'url'
                    ? item.target.url
                    : String(item.target.id))
              ));
    });
    return {
      places,
      links,
      missed,
      section: sectionPlace as Place | null,
      nested,
    };
  })(menu?.items ?? []);
  const menuOf = (
    post: WpPost
  ): { menuIndex: number; hiddenFromMenu: boolean; menuTitle: string } =>
    ((place) =>
      menu === null
        ? { menuIndex: post.menuOrder, hiddenFromMenu: false, menuTitle: '' }
        : place
          ? {
              menuIndex: place.index,
              hiddenFromMenu: false,
              menuTitle:
                place.title && place.title !== post.title
                  ? place.title.slice(0, 255)
                  : '',
            }
          : {
              menuIndex: 1000 + post.menuOrder,
              hiddenFromMenu: true,
              menuTitle: '',
            })(menuPlan.places.get(post.id));

  // --- алиасы ----------------------------------------------------------------------------------

  const taken = new Map<number | null, Set<string>>();
  const aliasFor = (
    parent: number | null,
    slug: string,
    title: string
  ): string => {
    const set =
      taken.get(parent) ??
      new Set<string>(
        parent === null || parent === into
          ? content.drafts
              .tree()
              .filter((_) => _.parentId === parent)
              .map((_) => _.alias)
          : []
      );
    taken.set(parent, set);
    const decoded = _decoded(slug).toLowerCase();
    const wanted =
      (_ALIAS.test(decoded) ? decoded : '') ||
      attempt(
        () => aliasFromTitle(decoded || title, language),
        () => ''
      ) ||
      attempt(
        () => aliasFromTitle(title, language),
        () => ''
      ) ||
      'page';
    const free = [
      wanted,
      ...Array.from({ length: 98 }, (_, n) => `${wanted}-${n + 2}`),
    ].find((_) => !set.has(_) && !(parent === null && _RESERVED.has(_)))!;
    set.add(free);
    return free;
  };

  // --- текст ------------------------------------------------------------------------------------

  const notes = emptyNotes();
  const fieldsAcf = acfFields(site);
  const ctx = {
    mediaById,
    attachmentByUrl: (url: string) =>
      ((at) =>
        at < 0
          ? null
          : attachmentByFile(
              normalPath(url.slice(at + 20).replace(/[?#].*$/, '')).slice(1)
            ))(url.indexOf('/wp-content/uploads/')),
    link,
    reusable: (id: number) => reusable.get(id) ?? null,
    latestPosts:
      sectionId !== null && hasComponent('RecentPosts')
        ? (n: number) =>
            tag('RecentPosts', [
              ['parent', sectionId],
              ['count', n],
            ])
        : null,
  };
  const builders: (WpItem & { builder: string; text: boolean })[] = [];
  const textOf = (post: WpPost): string => {
    const own = emptyNotes();
    const builder = builderOf(post);
    const elementor = builder === 'Elementor' ? elementorHtml(post) : null;
    const acf = acfHtml(post, fieldsAcf);
    const text = convertContent(
      [elementor ?? post.content, acf ?? ''].filter(Boolean).join('\n\n'),
      ctx,
      own
    );
    const by = [
      builder,
      ...own.builders,
      ...(acf !== null ? ['ACF'] : []),
    ].filter((_): _ is string => _ !== null);
    void (
      by.length > 0 &&
      builders.push({
        id: idOf(post.id),
        title: post.title,
        builder: _unique(by).join(', '),
        text: text.trim() !== '',
      })
    );
    _merge(notes, own);
    return text;
  };

  // --- страницы и записи --------------------------------------------------------------------------

  const seo = {
    plugins: new Set<string>(),
    titles: 0,
    descriptions: 0,
    noindex: 0,
  };
  let featured = 0;
  let multiple = 0;
  const common = (post: WpPost, parent: number | null) => {
    const text = textOf(post);
    const category = permalinks.primaryCategory(post);
    const excerpt = plainText(post.excerpt);
    const meta = seoOf(post, site, { category: category?.name ?? '', excerpt });
    void (meta.plugin && seo.plugins.add(meta.plugin));
    seo.titles += meta.title ? 1 : 0;
    seo.descriptions += meta.description ? 1 : 0;
    seo.noindex += meta.noindex ? 1 : 0;
    const cover = mediaById(
      Number(post.meta.find((_) => _[0] === '_thumbnail_id')?.[1] ?? 0)
    );
    featured += cover ? 1 : 0;
    const published = post.status === 'publish' && !post.password;
    return {
      parentId: parent,
      title: (post.title.trim() || `${post.type} ${post.id}`).slice(0, 255),
      longTitle: meta.title,
      description: meta.description,
      alias: aliasFor(parent, post.slug, post.title),
      content: text,
      searchable: !meta.noindex,
      ...(cover ? { socialImage: cover } : {}),
      publish: published,
      publishedAt: post.date,
      publishAt: post.status === 'future' ? post.date : null,
      text,
      excerpt,
      cover,
    };
  };

  // Подпись пункта меню у раздела записей, если она не совпадает с заголовком.
  const sectionTitle = (title: string): string =>
    menuPlan.section?.title && menuPlan.section.title !== title
      ? menuPlan.section.title.slice(0, 255)
      : '';
  const depthOf = (post: WpPost, seen = 0): number =>
    post.parent > 0 && pageIds.has(post.parent) && seen < 50
      ? 1 + depthOf(pages.find((_) => _.id === post.parent)!, seen + 1)
      : 0;
  const created = new Set<number>();
  const place = (
    id: number,
    label: string,
    input: CreatePageInput & { publishedAt?: string | null }
  ) =>
    void (
      tryTo(label, () => content.pages.import(id, input)) !== null &&
      created.add(id)
    );

  pages
    .toSorted(
      (a, b) =>
        depthOf(a) - depthOf(b) || a.menuOrder - b.menuOrder || a.id - b.id
    )
    .forEach((post) => {
      const parent =
        post.parent > 0 && pageIds.has(post.parent) ? idOf(post.parent) : into;
      const {
        text: _text,
        excerpt,
        cover: _cover,
        ...input
      } = common(post, parent);
      const isSection = idOf(post.id) === sectionId;
      place(idOf(post.id), `page ${post.id}`, {
        ...input,
        ...menuOf(post),
        ...(isSection && menuPlan.section
          ? {
              menuIndex: menuPlan.section.index,
              hiddenFromMenu: false,
              menuTitle: sectionTitle(post.title),
            }
          : {}),
        introText: excerpt.slice(0, 1000),
        template:
          post.id === front
            ? templates.home
            : isSection
              ? templates.section
              : templates.page,
        content:
          isSection && !whole
            ? `${input.content}\n[[PostList perPage=10]]`.trim()
            : input.content,
      });
    });

  void (
    sectionId !== null &&
    postsPage === 0 &&
    place(sectionId, 'posts section', {
      parentId: into,
      title: _SECTION[language] ?? _SECTION._!,
      alias: aliasFor(into, 'blog', 'blog'),
      template: templates.section,
      content: whole ? '' : '[[PostList perPage=10]]',
      publish: true,
      ...(menu === null
        ? { menuIndex: 1000 + pages.length, hiddenFromMenu: false }
        : menuPlan.section
          ? {
              menuIndex: menuPlan.section.index,
              hiddenFromMenu: false,
              menuTitle: sectionTitle(_SECTION[language] ?? _SECTION._!),
            }
          : { menuIndex: 1000, hiddenFromMenu: true }),
    })
  );

  posts
    .toSorted(
      (a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id - b.id
    )
    .forEach((post) => {
      const { text, excerpt, cover, ...input } = common(post, sectionId);
      const categories = post.terms
        .map((_) => terms.get(_))
        .filter((_): _ is WpTerm => _?.taxonomy === 'category');
      const primary = permalinks.primaryCategory(post);
      multiple += categories.length > 1 ? 1 : 0;
      const tags = post.terms
        .map((_) => terms.get(_))
        .filter((_): _ is WpTerm => _?.taxonomy === 'post_tag');
      place(idOf(post.id), `post ${post.id}`, {
        ...input,
        introText: (excerpt || _excerpt(text)).slice(0, 1000),
        template: templates.post,
        menuIndex: 0,
        hiddenFromMenu: true,
        fields: {
          ...(cover && fields.cover ? { [fields.cover]: cover } : {}),
          ...(categories.length > 0 && fields.categories
            ? {
                [fields.categories]: [
                  ...(primary ? [primary] : []),
                  ...categories.filter((_) => _.id !== primary?.id),
                ]
                  .map((_) => _.name)
                  .join(', '),
              }
            : {}),
          ...(tags.length > 0 && fields.tags
            ? { [fields.tags]: tags.map((_) => _.name).join(', ') }
            : {}),
        },
      });
    });

  // Пункты меню со своим адресом — страницы-ссылки там же, где были в меню.
  const linkPages = menuPlan.links.flatMap((item) =>
    ((href) =>
      ((linkTo) =>
        linkTo === null
          ? []
          : ((id) => (
              place(id, `menu link ${item.title}`, {
                parentId: into,
                kind: 'link',
                title: item.title.slice(0, 255),
                alias: aliasFor(into, '', item.title),
                template: templates.page,
                linkTo,
                menuIndex: item.index,
                hiddenFromMenu: false,
                publish: true,
              }),
              created.has(id) ? [id] : []
            ))(extraId()))(
        href.kind === 'url' && /^(?:https?:\/\/|\/)/.test(href.href)
          ? href.href
          : href.kind === 'file'
            ? href.href
            : null
      ))(link(item.url))
  );

  // --- служебные страницы, настройки -------------------------------------------------------------

  const extras = whole
    ? ((texts) => {
        const spec = (key: string) => scaffold.pages.find((_) => _.key === key);
        const search = spec('search');
        const notFound = spec('not-found');
        const resolve = (text: string) =>
          text.replace(
            /\[~@\{blog\}~\]/g,
            sectionId === null ? '/' : `[~${sectionId}~]`
          );
        const searchId = search ? extraId() : null;
        const notFoundId = notFound ? extraId() : null;
        void (
          search &&
          searchId !== null &&
          place(searchId, 'search page', {
            ...search,
            title: texts?.search ?? search.title,
            alias: aliasFor(null, 'search', 'search'),
            parentId: null,
            menuIndex: 2000,
            publish: true,
          })
        );
        void (
          notFound &&
          notFoundId !== null &&
          place(notFoundId, '404 page', {
            ...notFound,
            title: texts?.notFound ?? notFound.title,
            alias: aliasFor(null, '404', '404'),
            content: resolve(texts?.text ?? notFound.content ?? ''),
            parentId: null,
            menuIndex: 2001,
            publish: true,
          })
        );
        return {
          search: searchId !== null && created.has(searchId) ? searchId : null,
          notFound:
            notFoundId !== null && created.has(notFoundId) ? notFoundId : null,
        };
      })(_EXTRAS[language])
    : { search: null, notFound: null };

  void (
    whole &&
    tryTo('settings', () => {
      services.site.settings.update({
        ...(option('blogname')
          ? { name: option('blogname').slice(0, 200) }
          : {}),
        description: option('blogdescription').slice(0, 1000),
        language,
        homePageId: home !== null && created.has(home) ? home : null,
        notFoundPageId: extras.notFound,
      });
      void (
        extras.search !== null &&
        services.site.customSettings.save('searchPage', String(extras.search))
      );
    })
  );

  // --- переадресации ---------------------------------------------------------------------------

  type Planned = {
    readonly from: string;
    readonly to: string;
    readonly kind: 'exact' | 'query' | 'prefix';
  };
  const planned: Planned[] = [];
  const pathNow = (id: number): string | null =>
    created.has(id) ? (content.drafts.view(id)?.path ?? null) : null;
  // Адрес, где теперь живая страница, правило не займёт: страница важнее, такое правило молчало бы.
  const rule = (from: string, to: string, kind: Planned['kind']): void =>
    void (
      (kind !== 'exact' ||
        (normalPath(from) !== '/' &&
          content.published.byPath(normalPath(from)) === null)) &&
      planned.push({ from, to, kind })
    );
  const published = (post: WpPost) =>
    post.status === 'publish' && !post.password;
  [...pages, ...posts].filter(published).forEach((post) => {
    const id = idOf(post.id);
    const now = pathNow(id);
    const old = permalinks.of(post);
    const path = old && old.includes('?') ? null : old;
    void (
      now !== null &&
      path !== null &&
      normalPath(path) !== normalPath(now) &&
      !(id === home && normalPath(path) === '/') &&
      rule(normalPath(path), `[~${id}~]`, 'exact')
    );
    void (
      now !== null &&
      rule(
        `/?${post.type === 'page' ? 'page_id' : 'p'}=${post.id}`,
        `[~${id}~]`,
        'query'
      )
    );
  });
  attachments
    .filter((_) => imported.has(_.id))
    .forEach((a) => {
      const post = postsById.get(a.id);
      const old = post ? permalinks.of(post) : null;
      void (
        old &&
        !old.includes('?') &&
        normalPath(old) !== '/' &&
        rule(normalPath(old), `/media/${a.path}`, 'exact')
      );
      void rule(`/?attachment_id=${a.id}`, `/media/${a.path}`, 'query');
    });
  void (
    sectionId !== null &&
    created.has(sectionId) &&
    (permalinks.plain
      ? site.terms
          .filter((_) => _.taxonomy === 'category')
          .forEach(
            (_) => void rule(`/?cat=${_.id}`, `[~${sectionId}~]`, 'query')
          )
      : [
          permalinks.bases.category,
          permalinks.bases.tag,
          permalinks.bases.author,
        ].forEach(
          (_) => void rule(`${normalPath(_)}/*`, `[~${sectionId}~]`, 'prefix')
        ))
  );
  // Архивы по годам `/2024/05/` — в раздел; записи с адресом по дате ведут свои точные правила.
  void (
    sectionId !== null &&
    created.has(sectionId) &&
    !permalinks.plain &&
    _unique(posts.filter(published).map((_) => (_.date ?? '').slice(0, 4)))
      .filter((_) => /^\d{4}$/.test(_))
      .forEach(
        (year) =>
          void rule(
            `${permalinks.root}/${year}/*`,
            `[~${sectionId}~]`,
            'prefix'
          )
      )
  );
  void (
    imported.size > 0 &&
    (rule(
      `${permalinks.root}/wp-content/uploads/*`,
      '/media/uploads/*',
      'prefix'
    ),
    attachments
      .filter(
        (_) =>
          imported.has(_.id) && _.path !== `uploads/${_.file.toLowerCase()}`
      )
      .forEach(
        (_) =>
          void rule(
            `${permalinks.root}/wp-content/uploads/${_.file}`,
            `/media/${_.path}`,
            'exact'
          )
      ))
  );

  // Все правила — одной пачкой: одна транзакция, дерево страниц читается один раз.
  const batch = redirects.rules.createMany(
    planned.map(({ from, to }) => ({ from, to, note: 'WordPress' }))
  );
  const failed = new Set(batch.skipped.map((_) => _.from));
  const made = planned.filter((_) => !failed.has(_.from));
  const rules = {
    created: batch.created,
    query: made.filter((_) => _.kind === 'query').length,
    prefix: made.filter((_) => _.kind === 'prefix').length,
    skipped: batch.skipped.map((_) => ({ from: _.from, reason: _.code })),
  };

  // --- отчёт -----------------------------------------------------------------------------------

  const authors = [
    ...[...pages, ...posts].reduce<Map<string, number>>(
      (map, _) => map.set(_.author, (map.get(_.author) ?? 0) + 1),
      new Map()
    ),
  ]
    .map(({ 0: key, 1: count }) => ({
      name: site.authors.get(key)?.name || key || '—',
      posts: count,
    }))
    .toSorted((a, b) => b.posts - a.posts);

  return {
    source: site.source,
    dryRun: options.dryRun,
    into,
    pages: _counts(pages),
    posts: _counts(posts),
    section:
      sectionId !== null && created.has(sectionId)
        ? {
            id: sectionId,
            title: content.drafts.view(sectionId)?.title ?? '',
            created: postsPage === 0,
          }
        : null,
    home: home !== null && created.has(home) ? home : null,
    taxonomy: {
      categories: site.terms.filter((_) => _.taxonomy === 'category').length,
      tags: site.terms.filter((_) => _.taxonomy === 'post_tag').length,
      multiple,
    },
    media: {
      attachments:
        attachments.length +
        mediaResult.skipped.filter((_) => _.reason === 'type').length,
      imported: imported.size,
      images: attachments.filter((_) => imported.has(_.id) && _.image).length,
      source:
        options.media === null
          ? null
          : options.media.kind === 'dir'
            ? options.media.path
            : options.media.base,
      skipped: mediaResult.skipped,
      featured,
    },
    content: {
      ...notes,
      unresolved: _unique(notes.unresolved),
      images: _unique(notes.images),
      forms: _unique(notes.forms),
      embeds: _unique(notes.embeds),
    },
    builders,
    seo: { ...seo, plugins: [...seo.plugins] },
    menu:
      menu === null
        ? null
        : {
            name: menu.name,
            items: menu.items.length,
            placed: menuPlan.places.size + (menuPlan.section ? 1 : 0),
            hidden: pages.filter((_) => !menuPlan.places.has(_.id)).length,
            links: linkPages.length,
            nested: menuPlan.nested,
            skipped: menuPlan.missed,
          },
    redirects: rules,
    authors,
    comments: site.comments,
    skipped,
    warnings,
  };
};
