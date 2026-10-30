/** Тип по умолчанию: страница рендерится шаблоном в HTML-документ. */
export var HTML_TYPE = 'text/html';

/** Остальные типы — страница-файл: её текст без шаблона и без обёртки документа. */
export var isHtml = (contentType: string): boolean => contentType === HTML_TYPE;

/** Разметка: значения подстановок `{i18n.key}` и `[@key]` в ней экранируются, как в HTML. */
export var isMarkup = (contentType: string): boolean =>
  isHtml(contentType) || /[/+]xml$/.test(contentType);

const _TEXT =
  /^text\/|[/+](?:xml|json)$|^application\/(?:javascript|ecmascript)$/;

/** Заголовок Content-Type: у текстовых типов — с кодировкой, текст страниц хранится в UTF-8. */
export var responseType = (contentType: string): string =>
  _TEXT.test(contentType) ? `${contentType}; charset=utf-8` : contentType;
