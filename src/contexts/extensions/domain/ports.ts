import type { DomainEvent } from '../../../shared/kernel/events.ts';
import type { Plugin, PluginName } from './plugin.ts';

export type PluginRepository = {
  readonly all: () => Plugin[];
  readonly get: (name: PluginName) => Plugin | null;
  readonly save: (plugin: Plugin) => void;
  readonly remove: (name: PluginName) => void;
};

/** Настройки сайта для плагина: обычные и свои (`custom`); нет своей настройки — `undefined`, а не `[@key]`. */
export type PluginSite = Readonly<Record<string, unknown>> & {
  readonly name: string;
  readonly language: string;
  readonly siteUrl: string;
  readonly custom: Readonly<Record<string, string>>;
};

/** Значения заявки от плагина: имя поля → строка или несколько строк (`multiple`). */
export type PluginValues = Readonly<
  Record<string, string | number | boolean | readonly string[]>
>;

export type PluginSubmitOptions = {
  /** Страница сайта, с которой будто бы отправили форму: id. */
  readonly page?: number;
  readonly referrer?: string;
  /** Откуда пришла заявка, если не со страницы сайта: `https://granitmemorial.by/` — в адрес заявки. */
  readonly origin?: string;
  /** Адрес и браузер посетителя, если плагин их знает: заявка хранит их по настройке формы. */
  readonly ip?: string;
  readonly userAgent?: string;
};

/** ok — заявка записана (`spam` — со статусом «спам», без уведомлений); иначе ошибки полей по имени. */
export type PluginSubmitResult =
  | { readonly ok: true; readonly id: number; readonly spam: boolean }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

/** Что корень композиции даёт плагинам: чтение настроек, запись своей настройки, заявка формы. */
export type PluginServices = {
  readonly site: () => PluginSite;
  /** Своя настройка сайта, как из менеджера; ответ — изменилась ли (то же значение кэш не сбрасывает). */
  readonly setCustom: (key: string, value: string) => boolean;
  readonly submit: (
    form: string,
    values: PluginValues,
    options?: PluginSubmitOptions
  ) => PluginSubmitResult;
};

/**
 * Второй аргумент `handle` и аргумент `schedule.run` (ADR 0067). Данные страниц плагин читает из `$core`;
 * здесь — то, чего в `$core` нет: запись своей настройки, заявка формы, журнал и срок вызова.
 */
export type PluginContext = PluginServices & {
  /** Строка в вывод сервера с именем плагина. */
  readonly log: (...parts: readonly unknown[]) => void;
  /** Срок вызова вышел: `fetch(url, { signal })` прервётся сам. */
  readonly signal: AbortSignal;
};

/** Что может предоставить плагин; все хуки необязательны. */
export type PluginHooks = {
  /** Последнее слово о HTML страницы перед отдачей (OnWebPagePrerender в Evo). */
  readonly render?: (
    html: string,
    context: { readonly path: string; readonly status: number }
  ) => string | Promise<string>;
  /** Путь без страницы: адрес редиректа или null (OnPageNotFound в Evo). */
  readonly notFound?: (path: string) => string | null | Promise<string | null>;
  /**
   * Запрос, на который сайт не ответил (любой метод): свой ответ или null — дальше другие плагины и 404
   * (OnPageNotFound в Evo, который отвечает сам).
   */
  readonly handle?: (
    request: Request,
    context: PluginContext
  ) => Response | null | Promise<Response | null>;
  /** Задание по расписанию: только у сервера (`cms serve`), первый запуск — вскоре после старта. */
  readonly schedule?: {
    readonly every: string | number;
    readonly run: (context: PluginContext) => void | Promise<void>;
  };
  /** Доменные события по типу: `content.page_published` и др. */
  readonly on?: Readonly<
    Record<string, (event: DomainEvent) => void | Promise<void>>
  >;
};

export type PluginLoader = {
  /** Бросает DomainError, если исходник не транспилируется или импортирует лишнее. */
  readonly check: (plugin: Plugin) => void;
  readonly load: (plugin: Plugin) => Promise<PluginHooks>;
};

/** Задание расписания: `key` — версия плагина; та же версия после пересборки контекстов сохраняет свой ход. */
export type ScheduledJob = {
  readonly name: string;
  readonly key: string;
  readonly every: number;
  /** Никогда не отклоняется: сбой плагина уже записан. */
  readonly run: () => Promise<void>;
};

/** Таймеры расписаний — одни на процесс: пересборка контекстов не сбивает ход и не даёт двух запусков сразу. */
export type PluginScheduler = {
  /** Задания включённых плагинов: новые ставятся, пропавшие и изменённые снимаются. */
  readonly sync: (jobs: readonly ScheduledJob[]) => void;
  readonly stop: () => void;
};

/**
 * Тело запроса к плагину — в памяти и не больше предела; больше — готовый ответ 413. Плагинов с `handle`
 * несколько, и каждый получает свою копию запроса.
 */
export type RequestBody = (request: Request) => Promise<Request | Response>;
