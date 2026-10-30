import { type MessageKey, t } from './i18n.ts';
import { icons } from './icons.ts';

/** Тип по умолчанию: страница собирается шаблоном. Остальные — страница-файл со своим текстом. */
export var HTML_TYPE = 'text/html';

export var isHtml = (contentType: string): boolean => contentType === HTML_TYPE;

// Как на сервере (manager/domain/content-policy.ts): эти типы браузер не исполняет, их выбирает редактор.
const _INERT: ReadonlySet<string> = new Set([
  'text/html',
  'text/plain',
  'text/css',
  'text/markdown',
  'text/csv',
  'text/calendar',
  'application/json',
]);

/** SVG, XML, ленты и скрипты выбирает и правит только администратор. */
export var inertType = (contentType: string): boolean =>
  _INERT.has(contentType.trim().toLowerCase());

/** Типы в списке «Тип содержимого»; любой другой MIME вводится вручную. */
export var CONTENT_TYPES: readonly {
  readonly type: string;
  readonly label: MessageKey;
}[] = [
  { type: 'text/html', label: 'contentType.html' },
  { type: 'text/plain', label: 'contentType.plain' },
  { type: 'text/markdown', label: 'contentType.markdown' },
  { type: 'text/css', label: 'contentType.css' },
  { type: 'text/javascript', label: 'contentType.javascript' },
  { type: 'application/json', label: 'contentType.json' },
  { type: 'application/xml', label: 'contentType.xml' },
  { type: 'application/rss+xml', label: 'contentType.rss' },
  { type: 'application/atom+xml', label: 'contentType.atom' },
  { type: 'image/svg+xml', label: 'contentType.svg' },
  { type: 'text/csv', label: 'contentType.csv' },
  { type: 'text/calendar', label: 'contentType.calendar' },
  { type: 'application/manifest+json', label: 'contentType.manifest' },
];

type Family =
  | 'html'
  | 'text'
  | 'css'
  | 'script'
  | 'json'
  | 'xml'
  | 'svg'
  | 'feed'
  | 'table'
  | 'calendar'
  | 'other';

const _EXACT: Readonly<Record<string, Family>> = {
  'text/html': 'html',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/css': 'css',
  'text/javascript': 'script',
  'application/javascript': 'script',
  'application/json': 'json',
  'image/svg+xml': 'svg',
  'application/rss+xml': 'feed',
  'application/atom+xml': 'feed',
  'text/csv': 'table',
  'text/calendar': 'calendar',
};

// Незнакомый тип — по окончанию: `+json`, `+xml`, иначе `text/*` — текст.
const _family = (contentType: string): Family =>
  _EXACT[contentType] ??
  (/[/+]json$/.test(contentType)
    ? 'json'
    : /[/+]xml$/.test(contentType)
      ? 'xml'
      : contentType.startsWith('text/')
        ? 'text'
        : 'other');

const _ICON: Readonly<Record<Family, string>> = {
  html: icons.file,
  text: icons.fileType,
  css: icons.fileHash,
  script: icons.fileScript,
  json: icons.fileJson,
  xml: icons.fileCode,
  svg: icons.fileImage,
  feed: icons.fileFeed,
  table: icons.fileTable,
  calendar: icons.calendar,
  other: icons.fileBlank,
};

/** Значок страницы в дереве — по типу содержимого. */
export var typeIcon = (contentType: string): string =>
  _ICON[_family(contentType)];

export type CodeLanguage = 'html' | 'css' | 'javascript' | 'xml' | 'text';

const _LANGUAGE: Readonly<Record<Family, CodeLanguage>> = {
  html: 'html',
  text: 'text',
  css: 'css',
  script: 'javascript',
  json: 'javascript',
  xml: 'xml',
  svg: 'xml',
  feed: 'xml',
  table: 'text',
  calendar: 'text',
  other: 'text',
};

/** Подсветка текста страницы-файла в редакторе кода. */
export var codeLanguage = (contentType: string): CodeLanguage =>
  _LANGUAGE[_family(contentType)];

/** Подпись типа: из списка, иначе сам MIME. */
export var typeLabel = (contentType: string): string =>
  ((preset) => (preset ? t(preset) : contentType))(
    CONTENT_TYPES.find((_) => _.type === contentType)?.label
  );
