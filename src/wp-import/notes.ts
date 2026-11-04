import { decodeEntities } from './html.ts';

/** Куда ведёт ссылка из текста WordPress после переноса. */
export type Href =
  | { readonly kind: 'page'; readonly id: number; readonly hash: string }
  /** Файл медиатеки `/media/…`; на картинку саму себя ссылка в Figure не нужна. */
  | { readonly kind: 'file'; readonly href: string; readonly image: boolean }
  /** Страница вложения (`?attachment_id=`, `/запись/картинка/`): ссылка на неё не нужна. */
  | { readonly kind: 'attachment' }
  /** Внешний адрес — как есть; свой адрес без страницы (`internal`) — тоже, но в отчёт. */
  | { readonly kind: 'url'; readonly href: string; readonly internal: boolean }
  | { readonly kind: 'none' };

/** Что конвертер знает о переносе: вложения, ссылки, повторно используемые блоки. */
export type ConvertContext = {
  /** Путь в медиатеке по id вложения; null — вложения нет или файл не перенесён. */
  readonly mediaById: (id: number) => string | null;
  /** id вложения по адресу файла любого размера (`photo-300x200.jpg`); null — не своё. */
  readonly attachmentByUrl: (url: string) => number | null;
  readonly link: (href: string) => Href;
  /** Текст повторно используемого блока `wp:block`; null — такого нет. */
  readonly reusable: (id: number) => string | null;
  /** Тег ленты новых записей для `core/latest-posts`; null — ленты нет. */
  readonly latestPosts: ((count: number) => string) | null;
};

/** Что стало с текстом записи: копится по всему переносу и попадает в отчёт. */
export type ContentNotes = {
  figures: number;
  galleries: number;
  videos: number;
  /** Ссылок переписано на `[~id~]`. */
  links: number;
  /** Свои адреса, для которых страницы не нашлось. */
  unresolved: string[];
  /** Картинки не из медиатеки или без перенесённого файла. */
  images: string[];
  tables: number;
  code: number;
  /** Заголовки сдвинуты на уровень: в тексте был h1. */
  shifted: boolean;
  /** Шорткоды и блоки без соответствия: имя → сколько раз. */
  shortcodes: Record<string, number>;
  blocks: Record<string, number>;
  /** Формы плагинов: их собирают заново в «Формах». */
  forms: string[];
  /** Встраивания, которые стали ссылкой. */
  embeds: string[];
  /** Конструкторы страниц, чей текст сохранён без вёрстки. */
  builders: string[];
  /** Блоки «Свой HTML»: разметка почищена. */
  html: number;
};

export var emptyNotes = (): ContentNotes => ({
  figures: 0,
  galleries: 0,
  videos: 0,
  links: 0,
  unresolved: [],
  images: [],
  tables: 0,
  code: 0,
  shifted: false,
  shortcodes: {},
  blocks: {},
  forms: [],
  embeds: [],
  builders: [],
  html: 0,
});

export var count = (table: Record<string, number>, name: string): void =>
  void (table[name] = (table[name] ?? 0) + 1);

/** Значение в кавычках тега `[[Name a="…"]]`: без двойных кавычек и переводов строк — их грамматика тега не знает. */
export var tagValue = (text: string): string =>
  decodeEntities(text).replaceAll('"', '”').replace(/\s+/g, ' ').trim();

/** Тег компонента в тексте страницы; пустые параметры не пишутся. */
export var tag = (
  name: string,
  props: readonly (readonly [string, string | number | null])[]
): string =>
  `[[${name}${props
    .filter(({ 1: value }) => value !== null && value !== '')
    .map(({ 0: key, 1: value }) =>
      typeof value === 'number' ? ` ${key}=${value}` : ` ${key}="${value}"`
    )
    .join('')}]]`;

/** Готовый тег Eile в HTML, который ещё пойдёт через разбор: элемент-заглушка с тегом в атрибуте. */
export var placeholder = (text: string): string =>
  text === '' ? '' : `<x-eile data-tag="${encodeURIComponent(text)}"></x-eile>`;

const _YOUTUBE =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)[\w-]{6,20}/i;
const _VIMEO =
  /^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?\d{3,12}/i;

/** Ролик YouTube или Vimeo — тег Video; другой адрес — ссылка абзацем и строка в отчёте. Это готовый текст Eile. */
export var video = (
  url: string,
  title: string,
  notes: ContentNotes,
  what: string
): string =>
  ((clean) =>
    _YOUTUBE.test(clean) || _VIMEO.test(clean)
      ? (notes.videos++,
        tag('Video', [
          ['url', tagValue(clean)],
          ['title', tagValue(title)],
        ]))
      : clean
        ? (notes.embeds.push(`${what}: ${clean}`),
          /^https?:\/\//.test(clean)
            ? `<p><a href="${clean.replaceAll('"', '%22')}">${Bun.escapeHTML(title || clean)}</a></p>`
            : '')
        : '')(decodeEntities(url).trim());
