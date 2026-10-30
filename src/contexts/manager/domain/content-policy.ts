// Что можно тому, кто правит только контент (без `design.edit`): сайт и менеджер живут на одном
// адресе, поэтому скрипт в странице редактора выполнился бы у администратора с его правами.

/** Типы страниц, которые браузер не выполняет: их выбирает и правит любой, кто правит контент. */
const _INERT: ReadonlySet<string> = new Set([
  'text/html',
  'text/plain',
  'text/css',
  'text/markdown',
  'text/csv',
  'text/calendar',
  'application/json',
]);

const _normal = (contentType: string): string =>
  contentType.trim().toLowerCase();

/** SVG, XML, ленты, XHTML и скрипты браузер исполняет — их выбирает только администратор. */
export var inertType = (contentType: string): boolean =>
  _INERT.has(_normal(contentType));

export var isHtmlType = (contentType: string): boolean =>
  _normal(contentType) === 'text/html';
