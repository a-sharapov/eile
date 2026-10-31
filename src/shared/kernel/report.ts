import type { Localized } from './manager-language.ts';

/** Сбой или критическое событие, о котором стоит сообщить людям: 500, упавший плагин, перебор пароля. */
export type Alert = {
  /** Источник: `site.error`, `extensions.plugin_failed`. */
  readonly kind: string;
  readonly severity: 'critical' | 'error' | 'warning' | 'info';
  /** На каждом языке: уведомление уходит на языке из настроек, журнал читают на своём. */
  readonly title: Localized;
  /** Подробности: на каждом языке или одной строкой — стек, текст ошибки. */
  readonly detail: Localized | string;
  /** Что считать одним и тем же сбоем; по умолчанию — источник и заголовок. */
  readonly key?: string;
};

/** Порт «сообщить о сбое»: синхронный и никогда не бросает — тот, кто сообщил, продолжает работу. */
export type Report = (alert: Alert) => void;

export var NO_REPORT: Report = () => undefined;

/** Стек ошибки, если есть, иначе её текст. */
export var errorDetail = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/** Первая строка ошибки: по ней одинаковые сбои склеиваются, а не по адресу запроса. */
export var errorKey = (kind: string, error: unknown): string =>
  `${kind}:${(error instanceof Error ? `${error.name}: ${error.message}` : String(error)).split('\n')[0]!.slice(0, 200)}`;
