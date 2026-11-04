import { attempt } from '../shared/kernel/errors.ts';
import { emitText } from './emit.ts';
import {
  BLOCK_TAGS,
  decodeEntities,
  findAll,
  parseHtml,
  textOf,
} from './html.ts';
import {
  type ContentNotes,
  type ConvertContext,
  count,
  emptyNotes,
  placeholder,
  tag,
  tagValue,
  video as videoText,
} from './notes.ts';

// До разбора HTML готовый текст Eile едет заглушкой: разбор его не тронет.
const video = (...args: Parameters<typeof videoText>): string =>
  placeholder(videoText(...args));

// --- блоки Gutenberg ---------------------------------------------------------------------------

type Block = {
  readonly name: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly inner: (string | Block)[];
};

const _COMMENT =
  /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+(?:(\{[\s\S]*?\})\s+)?(\/)?-->/g;

const _json = (raw: string | undefined): Record<string, unknown> =>
  attempt(
    () =>
      ((value: unknown) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)
          : {})(raw ? JSON.parse(raw) : {}),
    () => ({})
  );

/** Дерево блоков: между комментариями `<!-- wp:… -->` — HTML блока, вне блоков — классический текст. */
const _parseBlocks = (content: string): (string | Block)[] => {
  const root: Block = { name: '#root', attrs: {}, inner: [] };
  const stack: Block[] = [root];
  const end = [...content.matchAll(_COMMENT)].reduce((at, match) => {
    const top = stack[stack.length - 1]!;
    const name = `${match[2] ?? 'core/'}${match[3]}`;
    void (match.index > at && top.inner.push(content.slice(at, match.index)));
    const block: Block = { name, attrs: _json(match[4]), inner: [] };
    void (match[1]
      ? ((index) => index > 0 && stack.splice(index))(
          stack.findLastIndex((_) => _.name === name)
        )
      : (top.inner.push(block), match[5] || stack.push(block)));
    return match.index + match[0].length;
  }, 0);
  void (end < content.length && root.inner.push(content.slice(end)));
  return root.inner;
};

const _string = (block: Block, key: string): string =>
  typeof block.attrs[key] === 'string' ? (block.attrs[key] as string) : '';

type BlockTools = {
  readonly inner: () => string;
  /** Текст другой записи (повторно используемый блок) — тем же конвертером, на уровень глубже. */
  readonly nested: (content: string) => string;
  readonly ctx: ConvertContext;
  readonly notes: ContentNotes;
  readonly depth: number;
};

type BlockRender = (block: Block, tools: BlockTools) => string;

const _embed: BlockRender = (block, { inner, notes }) =>
  ((tree) =>
    video(
      _string(block, 'url') ||
        (textOf(tree)
          .split(' ')
          .find((_) => /^https?:\/\//.test(_)) ??
          ''),
      textOf(findAll(tree, ['figcaption'])),
      notes,
      block.name
    ))(parseHtml(inner()));

const _drop: BlockRender = () => '';

// Тексты данных блока ACF (`acf/hero`): ключи `_name` и `field_…` — служебные, адреса и цвета — не текст.
const _acfTexts = (data: unknown): string[] =>
  typeof data === 'object' && data !== null
    ? Object.entries(data as Record<string, unknown>).flatMap(
        ({ 0: key, 1: value }) =>
          /^_|^field_/.test(key)
            ? []
            : typeof value === 'string'
              ? /\p{L}/u.test(value) && !/^(?:https?:|#|field_)/.test(value)
                ? [value]
                : []
              : _acfTexts(value)
      )
    : [];

const _BLOCK_RENDER: Readonly<Record<string, BlockRender>> = {
  'core/embed': _embed,
  'core/video': (block, tools) =>
    ((html) =>
      ((src) =>
        src
          ? video(
              src,
              textOf(findAll(parseHtml(html), ['figcaption'])),
              tools.notes,
              block.name
            )
          : html)(
        findAll(parseHtml(html), ['video', 'source'])
          .map((_) => decodeEntities(_.attrs.src ?? ''))
          .find(Boolean) ?? ''
      ))(tools.inner()),
  'core/html': (_block, { inner, notes }) => (notes.html++, inner()),
  'core/block': (block, { ctx, notes, nested, depth }) =>
    ((text) =>
      text === null || depth > 3
        ? (count(notes.blocks, block.name), '')
        : nested(text))(
      Number(block.attrs.ref ?? 0) > 0
        ? ctx.reusable(Number(block.attrs.ref))
        : null
    ),
  'core/latest-posts': (block, { ctx, notes }) =>
    ctx.latestPosts
      ? placeholder(ctx.latestPosts(Number(block.attrs.postsToShow ?? 5)))
      : (count(notes.blocks, block.name), ''),
  'core/separator': _drop,
  'core/spacer': _drop,
  'core/more': _drop,
  'core/nextpage': _drop,
  'core/read-more': _drop,
};

const _block: BlockRender = (block, tools) =>
  _BLOCK_RENDER[block.name]?.(block, tools) ??
  (block.name.startsWith('core-embed/')
    ? _embed(block, tools)
    : block.name.startsWith('acf/')
      ? (count(tools.notes.blocks, block.name),
        _acfTexts(block.attrs.data)
          .map((_) => `<p>${_}</p>`)
          .join('\n'))
      : block.inner.length === 0
        ? (count(tools.notes.blocks, block.name), '')
        : // Свой блок плагина с HTML: текст остаётся, вёрстка — нет.
          (block.name.startsWith('core/') ||
            count(tools.notes.blocks, block.name),
          `\n${tools.inner()}\n`));

// --- шорткоды ----------------------------------------------------------------------------------

// Регулярка WordPress get_shortcode_regex: `[name …]`, `[name …/]`, `[name]…[/name]`; `[[name]]` — текст.
const _SHORTCODE =
  /\[(\[?)([a-zA-Z_][\w-]*)(?![\w-])([^\]/]*(?:\/(?!\])[^\]/]*)*?)(?:(\/)\]|\](?:([^[]*(?:\[(?!\/\2\])[^[]*)*)\[\/\2\])?)(\]?)/g;

// Редактор WordPress заменяет кавычки параметров на типографские: `ids=”1,2″`.
const _atts = (raw: string): Record<string, string> =>
  Object.fromEntries(
    [
      ...decodeEntities(raw)
        .replace(/[“”″„]/g, '"')
        .replace(/[‘’′]/g, "'")
        .matchAll(
          /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'|([\w-]+)\s*=\s*([^\s'"]+)|"([^"]*)"|(\S+)/g
        ),
    ].map((_, index) =>
      _[1] !== undefined
        ? [_[1].toLowerCase(), _[2]!]
        : _[3] !== undefined
          ? [_[3].toLowerCase(), _[4]!]
          : _[5] !== undefined
            ? [_[5].toLowerCase(), _[6]!]
            : [String(index), (_[7] ?? _[8] ?? '').replace(/^=/, '')]
    )
  );

type ShortcodeInput = {
  readonly atts: Readonly<Record<string, string>>;
  readonly inner: string;
  readonly notes: ContentNotes;
  readonly ctx: ConvertContext;
};

type Shortcode = (input: ShortcodeInput) => string;

const _ids = (raw: string | undefined): number[] =>
  (raw ?? '')
    .split(',')
    .map((_) => Number(_.trim()))
    .filter((_) => Number.isInteger(_) && _ > 0);

const _first = (
  atts: Readonly<Record<string, string>>,
  keys: readonly string[]
): string => keys.map((_) => atts[_] ?? '').find(Boolean) ?? '';

const _IMAGE = /<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>|<img\b[^>]*>/gi;

// [caption]: картинка и подпись — как `<figure>` блока, дальше их разбирает общий разбор HTML.
const _caption: Shortcode = ({ atts, inner }) =>
  `<figure class="${atts.align ?? ''}">${(inner.match(_IMAGE) ?? []).join('')}<figcaption>${atts.caption || inner.replace(_IMAGE, '').trim()}</figcaption></figure>`;

const _paths = (ids: readonly number[], ctx: ConvertContext): string[] =>
  ids.map(ctx.mediaById).filter((_): _ is string => _ !== null);

const _gallery = (
  paths: readonly string[],
  columns: number,
  caption: string,
  notes: ContentNotes
): string =>
  paths.length === 0
    ? ''
    : paths.length === 1
      ? (notes.figures++,
        placeholder(
          tag('Figure', [
            ['src', paths[0]!],
            ['caption', tagValue(caption)],
          ])
        ))
      : (notes.galleries++,
        placeholder(
          tag('Gallery', [
            ['images', paths.join(',')],
            ['columns', columns > 0 ? Math.min(4, columns) : null],
            ['caption', tagValue(caption)],
          ])
        ));

// Видео и звук не с YouTube — ссылкой на файл: плеера для своих файлов в наборе нет.
const _fileLink = (src: string, ctx: ConvertContext): string =>
  ((href) =>
    href.kind === 'file' || href.kind === 'url'
      ? `<p><a href="${href.href}">${Bun.escapeHTML(decodeURIComponent(href.href.split('/').pop() || href.href))}</a></p>`
      : '')(ctx.link(src));

const _media =
  (keys: readonly string[], what: string): Shortcode =>
  ({ atts, inner, notes, ctx }) =>
    ((src) =>
      src === ''
        ? ''
        : /youtu|vimeo/i.test(src)
          ? video(src, '', notes, what)
          : (notes.embeds.push(`${what}: ${src}`), _fileLink(src, ctx)))(
      _first(atts, keys) || inner.trim()
    );

const _SHORTCODES: Readonly<Record<string, Shortcode>> = {
  caption: _caption,
  wp_caption: _caption,
  gallery: ({ atts, notes, ctx }) =>
    _gallery(
      _paths(_ids(atts.ids ?? atts.include), ctx),
      Number(atts.columns ?? 0),
      '',
      notes
    ),
  embed: ({ inner, notes }) => video(inner.trim(), '', notes, 'embed'),
  // Jetpack: `[youtube https://…]` и `[youtube=https://…]`.
  youtube: ({ atts, inner, notes }) =>
    video(_first(atts, ['0', 'url']) || inner.trim(), '', notes, 'youtube'),
  vimeo: ({ atts, inner, notes }) =>
    ((id) =>
      video(
        /^\d+$/.test(id) ? `https://vimeo.com/${id}` : id,
        '',
        notes,
        'vimeo'
      ))(_first(atts, ['0', 'id', 'url']) || inner.trim()),
  video: _media(['src', 'mp4', 'm4v', 'webm', 'ogv', 'mov'], 'video'),
  audio: _media(['src', 'mp3', 'm4a', 'ogg', 'wav'], 'audio'),
  vc_single_image: ({ atts, notes, ctx }) =>
    _gallery(_paths(_ids(atts.image), ctx), 0, atts.caption ?? '', notes),
  vc_gallery: ({ atts, notes, ctx }) =>
    _gallery(_paths(_ids(atts.images), ctx), 0, '', notes),
  vc_video: ({ atts, notes }) =>
    video(atts.link ?? '', atts.title ?? '', notes, 'vc_video'),
  et_pb_video: ({ atts, notes }) =>
    video(atts.src ?? '', '', notes, 'et_pb_video'),
  et_pb_image: ({ atts }) =>
    atts.src
      ? `<p><img src="${atts.src}" alt="${Bun.escapeHTML(atts.alt ?? '')}"></p>`
      : '',
  vc_custom_heading: ({ atts }) =>
    atts.text ? `<h2>${Bun.escapeHTML(atts.text)}</h2>` : '',
  et_pb_button: ({ atts }) =>
    atts.button_url && atts.button_text
      ? `<p><a href="${atts.button_url}">${Bun.escapeHTML(atts.button_text)}</a></p>`
      : '',
};

// Формы плагинов: разметку не перенести, форму собирают заново в разделе «Формы».
const _FORMS: ReadonlySet<string> = new Set([
  'contact-form-7',
  'contact-form',
  'wpforms',
  'gravityform',
  'gravityforms',
  'ninja_form',
  'ninja_forms',
  'formidable',
  'caldera_form',
  'fluentform',
  'mc4wp_form',
  'forminator_form',
]);

// Приставки шорткодов конструкторов страниц: вёрстка не переносится, текст внутри — да.
const _BUILDERS: readonly (readonly [string, string])[] = [
  ['vc_', 'WPBakery'],
  ['et_pb_', 'Divi'],
  ['fusion_', 'Avada'],
  ['av_', 'Enfold'],
  ['cs_', 'Cornerstone'],
  ['themify_', 'Themify'],
  ['tatsu_', 'Tatsu'],
  ['fl_builder', 'Beaver Builder'],
];

const _builder = (name: string): string | null =>
  _BUILDERS.find(({ 0: prefix }) => name.startsWith(prefix))?.[1] ?? null;

// `[Примечание]` в тексте — не шорткод: им считается известное имя, пара с закрывающим, параметры или `/]`.
const _isShortcode = (
  name: string,
  raw: string,
  self: string | undefined,
  inner: string | undefined
): boolean =>
  Object.hasOwn(_SHORTCODES, name) ||
  _FORMS.has(name) ||
  _builder(name) !== null ||
  inner !== undefined ||
  self !== undefined ||
  raw.includes('=');

const _shortcode = (name: string, input: ShortcodeInput): string =>
  ((builder) => (
    void (
      builder &&
      !input.notes.builders.includes(builder) &&
      input.notes.builders.push(builder)
    ),
    Object.hasOwn(_SHORTCODES, name)
      ? _SHORTCODES[name]!(input)
      : _FORMS.has(name)
        ? (input.notes.forms.push(name), '')
        : builder
          ? `\n\n${input.inner}\n\n`
          : (count(input.notes.shortcodes, name), input.inner)
  ))(_builder(name));

const _shortcodes = (
  html: string,
  notes: ContentNotes,
  ctx: ConvertContext
): string =>
  html.replace(
    _SHORTCODE,
    (
      match,
      open: string,
      name: string,
      raw: string,
      self: string | undefined,
      inner: string | undefined,
      close: string
    ) =>
      open === '[' && close === ']'
        ? match.slice(1, -1)
        : _isShortcode(name.toLowerCase(), raw, self, inner)
          ? `${open}${_shortcode(name.toLowerCase(), {
              atts: _atts(raw),
              inner: inner === undefined ? '' : _shortcodes(inner, notes, ctx),
              notes,
              ctx,
            })}${close}`
          : match
  );

// --- абзацы классического редактора ------------------------------------------------------------

const _BLOCKS_RE = [...BLOCK_TAGS].join('|');
const _BLOCK_OPEN = new RegExp(`(<(?:${_BLOCKS_RE})(?=[\\s/>]))`, 'gi');
const _BLOCK_CLOSE = new RegExp(`(</(?:${_BLOCKS_RE})>)`, 'gi');
const _BLOCK_START = new RegExp(`^</?(?:${_BLOCKS_RE})(?=[\\s/>])`, 'i');

/** Как wpautop: пустая строка — новый абзац, перевод строки — `<br>`; блочные теги — сами по себе. */
export var autop = (html: string): string =>
  html
    .replace(/\r\n?/g, '\n')
    .replace(_BLOCK_OPEN, '\n\n$1')
    .replace(_BLOCK_CLOSE, '$1\n\n')
    .split(/\n\s*\n/)
    .map((_) => _.trim())
    .filter(Boolean)
    .map((_) =>
      _BLOCK_START.test(_) ? _ : `<p>${_.replace(/\n/g, '<br>')}</p>`
    )
    .join('\n');

// Адрес одной строкой в классическом тексте WordPress встраивал сам: ролик — плеером, остальное — ссылкой.
const _autoembed = (content: string, notes: ContentNotes): string =>
  content.replace(
    /^[ \t]*(https?:\/\/[^\s<>"']+)[ \t]*$/gm,
    (_match, url: string) => `\n\n${video(url, '', notes, 'embed')}\n\n`
  );

// --- целиком ----------------------------------------------------------------------------------

/**
 * Текст записи WordPress → текст страницы Eile. Блоки Gutenberg и классический HTML, шорткоды; на выходе —
 * `<p>`, `<h2>`–`<h4>`, списки, цитаты, `<strong>`, `<em>`, `<a href>` и теги Figure, Gallery, Video.
 */
export var convertContent = (
  content: string,
  ctx: ConvertContext,
  notes: ContentNotes = emptyNotes(),
  depth = 0
): string => {
  const render = (nodes: (string | Block)[]): string =>
    nodes
      .map((_) =>
        typeof _ === 'string'
          ? _
          : _block(_, {
              inner: () => render(_.inner),
              nested: (text) => _expand(text, depth + 1),
              ctx,
              notes,
              depth,
            })
      )
      .join('');
  // Повторно используемый блок — тот же путь до HTML, но без разбора в текст: его сделает внешний вызов.
  const _expand = (text: string, level: number): string =>
    text.includes('<!-- wp:')
      ? level > 3
        ? ''
        : render(_parseBlocks(text))
      : text;
  // Заглушку `<x-eile>` ставит только сам конвертер: такая же в тексте WordPress вывела бы HTML как есть.
  const source = content.replace(/<(\/?x-eile)/gi, '&lt;$1');
  const gutenberg = source.includes('<!-- wp:');
  const html = _shortcodes(
    gutenberg ? render(_parseBlocks(source)) : _autoembed(source, notes),
    notes,
    ctx
  );
  return emitText(gutenberg ? html : autop(html), ctx, notes);
};
