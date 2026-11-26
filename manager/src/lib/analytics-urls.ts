import { GO_PREFIX } from './analytics.ts';

// Адреса сайта для экранов аналитики. Отдельно от правил настройки: им нужен адрес вкладки менеджера, а правила
// сверяет с сервером тест вне браузера.

/** Адрес сайта снаружи: переход и приёмник открывают по нему, а не по адресу этой вкладки. */
export var siteBase = (siteUrl: string): string =>
  (siteUrl || location.origin).replace(/\/$/, '');

/** Адрес перехода на сайте: `https://сайт/_cms/go/<код>`. */
export var goUrl = (siteUrl: string, code: string): string =>
  `${siteBase(siteUrl)}${GO_PREFIX}${code}`;

/** Адрес приёмника на сайте: отправитель ходит к сайту снаружи, а не к адресу этой вкладки. */
export var intakeUrl = (siteUrl: string): string =>
  `${siteBase(siteUrl)}/_cms/events`;
