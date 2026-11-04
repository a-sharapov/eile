import { attempt } from '../shared/kernel/errors.ts';
import { autop } from './convert.ts';
import { phpField, phpList, unserialize } from './php.ts';
import { metaOf, type WpPost, type WpSite } from './source.ts';

// --- SEO -------------------------------------------------------------------------------------

/** SEO записи из плагина: заголовок для `<title>`, описание и noindex. */
export type Seo = {
  readonly title: string;
  readonly description: string;
  readonly noindex: boolean;
  /** Чьи это поля; null — их нет. */
  readonly plugin: string | null;
};

type SeoKeys = {
  readonly plugin: string;
  readonly title: readonly string[];
  readonly description: readonly string[];
  readonly noindex: (post: WpPost) => boolean;
};

// Свои поля темы вроде meta_title — последними: плагин, если он есть, важнее.
const _SEO: readonly SeoKeys[] = [
  {
    plugin: 'Yoast SEO',
    title: ['_yoast_wpseo_title'],
    description: ['_yoast_wpseo_metadesc'],
    noindex: (_) => metaOf(_, '_yoast_wpseo_meta-robots-noindex') === '1',
  },
  {
    plugin: 'Rank Math',
    title: ['rank_math_title'],
    description: ['rank_math_description'],
    noindex: (_) =>
      phpList(unserialize(metaOf(_, 'rank_math_robots'))).includes('noindex'),
  },
  {
    plugin: 'SEOPress',
    title: ['_seopress_titles_title'],
    description: ['_seopress_titles_desc'],
    noindex: (_) => metaOf(_, '_seopress_robots_index') === 'yes',
  },
  {
    plugin: 'All in One SEO',
    title: ['_aioseop_title'],
    description: ['_aioseop_description'],
    noindex: (_) => metaOf(_, '_aioseop_noindex') === 'on',
  },
  {
    plugin: 'theme fields',
    title: ['meta_title', 'seo_title'],
    description: [
      'meta_description',
      'meta_desc',
      'meta_des',
      'seo_description',
    ],
    noindex: () => false,
  },
];

/** Имена метаполей SEO: их значения — не текст страницы. */
export var SEO_FIELDS: ReadonlySet<string> = new Set(
  _SEO.flatMap((_) => [..._.title, ..._.description])
);

const _SEP = '\u0000';

// Переменные Yoast `%%title%%` и Rank Math `%title%`; неизвестные (`%%page%%`, даты) убираются.
const _expand = (
  text: string,
  values: Readonly<Record<string, string>>
): string =>
  text.replace(
    /%%([a-z_]+)%%|%([a-z_]+)%/gi,
    (_m, yoast?: string, rank?: string) =>
      ((name) => (Object.hasOwn(values, name) ? values[name]! : ''))(
        (yoast ?? rank ?? '').toLowerCase()
      )
  );

/**
 * Заголовок SEO → длинный заголовок Eile: название сайта шаблон допишет сам, поэтому оно и разделители
 * вокруг него убираются. Совпал с заголовком записи — пусто.
 */
const _title = (
  raw: string,
  post: WpPost,
  siteName: string,
  values: Readonly<Record<string, string>>
) =>
  ((parts) =>
    ((title) => (title === post.title.trim() ? '' : title.slice(0, 255)))(
      parts.join(' – ').trim()
    ))(
    _expand(raw, values)
      .split(new RegExp(`${_SEP}|\\s[|–—·•-]\\s`))
      .map((_) => _.replace(/\s+/g, ' ').trim())
      .filter((_) => _ !== '' && _ !== siteName.trim())
  );

export var seoOf = (
  post: WpPost,
  site: WpSite,
  extra: { readonly category: string; readonly excerpt: string }
): Seo => {
  const siteName = site.options.get('blogname') ?? '';
  const values: Readonly<Record<string, string>> = {
    title: post.title,
    sitename: siteName,
    sitedesc: site.options.get('blogdescription') ?? '',
    sep: _SEP,
    excerpt: extra.excerpt,
    excerpt_only: extra.excerpt,
    category: extra.category,
    primary_category: extra.category,
  };
  const found = _SEO.find(
    (keys) =>
      [...keys.title, ...keys.description].some((_) =>
        metaOf(post, _).trim()
      ) || keys.noindex(post)
  );
  const first = (keys: readonly string[]) =>
    keys.map((_) => metaOf(post, _)).find((_) => _.trim() !== '') ?? '';
  return found
    ? {
        title: _title(first(found.title), post, siteName, values),
        description: _expand(first(found.description), values)
          .replaceAll(_SEP, '–')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1000),
        noindex: found.noindex(post),
        plugin: found.plugin,
      }
    : { title: '', description: '', noindex: false, plugin: null };
};

// --- ACF -------------------------------------------------------------------------------------

/** Описание поля ACF: тип и имя по ключу `field_…`. */
export type AcfField = { readonly type: string; readonly name: string };

/** Поля ACF сайта по ключу: из записей типа `acf-field`. */
export var acfFields = (site: WpSite): ReadonlyMap<string, AcfField> =>
  new Map(
    site.posts
      .filter((_) => _.type === 'acf-field')
      .map(
        (_) =>
          [
            _.slug,
            {
              type: String(phpField(unserialize(_.content), 'type') ?? ''),
              name: _.excerpt,
            },
          ] as const
      )
  );

const _HEADING = /(?:^|_)(?:title|heading|headline|ueberschrift|zagolovok)$/;

// Значение без описания поля — текст, если похоже на фразу: буквы и пробел, не адрес, не PHP, не ключ.
const _prose = (value: string): boolean =>
  /\p{L}/u.test(value) &&
  /\s/.test(value.trim()) &&
  !/^(?:https?:|#|field_|[aObis]:\d)/.test(value.trim());

const _escape = (text: string): string => Bun.escapeHTML(text);

type AcfRender = (name: string, value: string) => string;

const _paragraphs = (text: string): string =>
  text
    .split(/\n\s*\n/)
    .map((_) => _.trim())
    .filter(Boolean)
    .map((_) => `<p>${_escape(_).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

// Глубина поля во вложенных строках ACF: `blocks_0_title` — 1, `blocks_0_items_2_title` — 2.
const _depth = (name: string): number => (name.match(/_\d+_/g) ?? []).length;

// Картинки оформления — значки, фоны, логотипы, аватары — в текст страницы не идут.
const _DECOR =
  /(?:^|_)(?:icon|bg|background|logo|pattern|shape|avatar|hex|badge|marker|arrow)$/;

const _heading = (name: string, value: string): string =>
  ((level) =>
    `<h${level}>${_escape(value.replace(/\s+/g, ' ').trim())}</h${level}>`)(
    _depth(name) > 1 ? 3 : 2
  );

const _ACF: Readonly<Record<string, AcfRender>> = {
  text: (name, value) =>
    _HEADING.test(name) ? _heading(name, value) : `<p>${_escape(value)}</p>`,
  textarea: (name, value) =>
    _HEADING.test(name) && !/\n\s*\n/.test(value)
      ? _heading(name, value)
      : _paragraphs(value),
  wysiwyg: (_name, value) => autop(value),
  image: (name, value) =>
    /^\d+$/.test(value) && !_DECOR.test(name)
      ? `<p><img class="wp-image-${value}" src=""></p>`
      : '',
  gallery: (_name, value) =>
    ((ids) =>
      ids.length > 0 ? `\n\n[gallery ids="${ids.join(',')}"]\n\n` : '')(
      phpList(unserialize(value))
        .map(String)
        .filter((_) => /^\d+$/.test(_))
    ),
  link: (_name, value) =>
    ((link) =>
      ((url, title) =>
        typeof url === 'string' && url
          ? `<p><a href="${_escape(url)}">${_escape(typeof title === 'string' && title ? title : url)}</a></p>`
          : '')(phpField(link, 'url'), phpField(link, 'title')))(
      unserialize(value)
    ),
  oembed: (_name, value) =>
    value ? `\n\n[embed]${value.trim()}[/embed]\n\n` : '',
  url: (_name, value) =>
    /youtu|vimeo/.test(value) ? `\n\n[embed]${value.trim()}[/embed]\n\n` : '',
};

/**
 * Тексты полей ACF страницы по порядку записи: заголовки, абзацы, картинки и галереи — HTML для общего
 * конвертера. Вёрстка гибкого содержимого не переносится, только то, что в нём написано.
 */
export var acfHtml = (
  post: WpPost,
  fields: ReadonlyMap<string, AcfField>
): string | null =>
  ((keys) =>
    keys.size === 0
      ? null
      : post.meta
          .filter(
            ({ 0: name, 1: value }) =>
              keys.has(name) && !SEO_FIELDS.has(name) && value.trim() !== ''
          )
          .map(({ 0: name, 1: value }) =>
            ((field) =>
              field
                ? (_ACF[field.type]?.(name, value) ?? '')
                : _prose(value)
                  ? _ACF.text!(name, value)
                  : '')(fields.get(keys.get(name)!))
          )
          .filter(Boolean)
          .join('\n'))(
    new Map(
      post.meta
        .filter(
          ({ 0: name, 1: value }) =>
            name.startsWith('_') &&
            value.startsWith('field_') &&
            !SEO_FIELDS.has(name.slice(1))
        )
        .map(({ 0: name, 1: value }) => [name.slice(1), value] as const)
    )
  );

// --- конструкторы страниц ----------------------------------------------------------------------

type Elementor = {
  readonly elType?: string;
  readonly widgetType?: string;
  readonly settings?: Record<string, unknown>;
  readonly elements?: Elementor[];
};

const _s = (value: unknown): string => (typeof value === 'string' ? value : '');

const _items = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((_) => typeof _ === 'object' && _ !== null)
    : [];

const _WIDGETS: Readonly<
  Record<string, (s: Record<string, unknown>) => string>
> = {
  heading: (s) =>
    ((level) => (_s(s.title) ? `<${level}>${_s(s.title)}</${level}>` : ''))(
      /^h[1-6]$/.test(_s(s.header_size)) ? _s(s.header_size) : 'h2'
    ),
  'text-editor': (s) => autop(_s(s.editor)),
  image: (s) =>
    ((image) =>
      image && (image.id || image.url)
        ? `<p><img class="wp-image-${Number(image.id ?? 0)}" src="${_escape(_s(image.url))}" alt=""></p>`
        : '')(s.image as { id?: number; url?: string } | undefined),
  video: (s) =>
    ((url) => (url ? `\n\n[embed]${url}[/embed]\n\n` : ''))(
      _s(s.youtube_url) || _s(s.vimeo_url)
    ),
  button: (s) =>
    ((url) =>
      _s(s.text)
        ? url
          ? `<p><a href="${_escape(url)}">${_escape(_s(s.text))}</a></p>`
          : `<p>${_escape(_s(s.text))}</p>`
        : '')(_s((s.link as { url?: string } | undefined)?.url)),
  'icon-list': (s) =>
    ((items) =>
      items.length
        ? `<ul>${items.map((_) => `<li>${_}</li>`).join('')}</ul>`
        : '')(
      _items(s.icon_list)
        .map((_) => _s(_.text))
        .filter(Boolean)
    ),
  'image-gallery': (s) =>
    ((ids) => (ids.length ? `\n\n[gallery ids="${ids.join(',')}"]\n\n` : ''))(
      _items(s.wp_gallery ?? s.gallery)
        .map((_) => Number(_.id ?? 0))
        .filter((_) => _ > 0)
    ),
  'icon-box': (s) =>
    `${_s(s.title_text) ? `<h3>${_s(s.title_text)}</h3>` : ''}${_s(s.description_text) ? `<p>${_s(s.description_text)}</p>` : ''}`,
  'image-box': (s) =>
    `${_s(s.title_text) ? `<h3>${_s(s.title_text)}</h3>` : ''}${_s(s.description_text) ? `<p>${_s(s.description_text)}</p>` : ''}`,
  testimonial: (s) =>
    _s(s.testimonial_content)
      ? `<blockquote><p>${_s(s.testimonial_content)}</p>${_s(s.testimonial_name) ? `<p>${_s(s.testimonial_name)}</p>` : ''}</blockquote>`
      : '',
  accordion: (s) =>
    _items(s.tabs)
      .map((_) => `<h3>${_s(_.tab_title)}</h3>${autop(_s(_.tab_content))}`)
      .join('\n'),
  toggle: (s) =>
    _items(s.tabs)
      .map((_) => `<h3>${_s(_.tab_title)}</h3>${autop(_s(_.tab_content))}`)
      .join('\n'),
  tabs: (s) =>
    _items(s.tabs)
      .map((_) => `<h3>${_s(_.tab_title)}</h3>${autop(_s(_.tab_content))}`)
      .join('\n'),
  html: (s) => _s(s.html),
  shortcode: (s) => `\n\n${_s(s.shortcode)}\n\n`,
};

const _elementor = (elements: readonly Elementor[]): string =>
  elements
    .map((_) =>
      _.elType === 'widget'
        ? (_WIDGETS[_.widgetType ?? '']?.(_.settings ?? {}) ?? '')
        : _elementor(_.elements ?? [])
    )
    .filter(Boolean)
    .join('\n');

/** Текст Elementor из `_elementor_data`: заголовки, тексты, картинки, кнопки; вёрстка — нет. */
export var elementorHtml = (post: WpPost): string | null =>
  ((raw) =>
    raw === ''
      ? null
      : attempt(
          () =>
            ((data: unknown) =>
              Array.isArray(data) ? _elementor(data as Elementor[]) : null)(
              JSON.parse(raw)
            ),
          () => null
        ))(metaOf(post, '_elementor_data'));

/** Конструктор страницы по метаполям: его вёрстка не переносится, в отчёт. */
export var builderOf = (post: WpPost): string | null =>
  metaOf(post, '_elementor_data') ||
  metaOf(post, '_elementor_edit_mode') === 'builder'
    ? 'Elementor'
    : metaOf(post, '_et_pb_use_builder') === 'on'
      ? 'Divi'
      : metaOf(post, '_wpb_vc_js_status') === 'true'
        ? 'WPBakery'
        : metaOf(post, '_fl_builder_enabled') === '1'
          ? 'Beaver Builder'
          : metaOf(post, 'ct_builder_shortcodes')
            ? 'Oxygen'
            : metaOf(post, '_bricks_page_content_2')
              ? 'Bricks'
              : null;
