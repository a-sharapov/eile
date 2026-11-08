import { attempt, fail } from '../../../shared/kernel/errors.ts';
import type { DomainEvent, EventBus } from '../../../shared/kernel/events.ts';
import type { Localized } from '../../../shared/kernel/manager-language.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  errorDetail,
  errorKey,
  NO_REPORT,
  type Report,
} from '../../../shared/kernel/report.ts';
import {
  changePluginSource,
  createPlugin,
  type Plugin,
  type PluginChange,
  type PluginName,
  parsePluginName,
  removePlugin,
  setPluginEnabled,
} from '../domain/plugin.ts';
import type {
  PluginContext,
  PluginHooks,
  PluginLoader,
  PluginRepository,
  PluginScheduler,
  PluginServices,
  RequestBody,
  ScheduledJob,
} from '../domain/ports.ts';
import { parseEvery, RUN_DEADLINE } from '../domain/schedule.ts';

/** Сроки вызовов плагина, мс; тесты ставят короткие. */
export type PluginLimits = {
  /** Ответ `handle`: дольше — запрос идёт дальше, к 404. */
  readonly handle?: number;
  /** Запуск по расписанию: дольше — сбой, и следующий запуск снова возможен. */
  readonly run?: number;
};

/** 5 с: тишина в 10 с закрывает соединение у Bun — посетитель ещё успеет получить страницу 404. */
export var HANDLE_TIMEOUT = 5000;

type Active = {
  readonly name: string;
  /** Версия плагина: ревизия и исходник — ревизия после удаления и создания заново снова 1. */
  readonly key: string;
  readonly hooks: PluginHooks;
};

type Where = 'hook' | 'schedule';

const _TITLES: Readonly<Record<Where, (name: string) => Localized>> = {
  hook: (name) => ({
    en: `Plugin ${name} crashed`,
    de: `Plugin ${name} ist abgestürzt`,
    ru: `Плагин ${name} упал`,
  }),
  schedule: (name) => ({
    en: `The scheduled job of plugin ${name} failed`,
    de: `Der geplante Auftrag des Plugins ${name} ist fehlgeschlagen`,
    ru: `Задание по расписанию плагина ${name} не выполнилось`,
  }),
};

const _KINDS: Readonly<Record<Where, string>> = {
  hook: 'extensions.plugin_failed',
  schedule: 'extensions.schedule_failed',
};

const _noServices = (): never =>
  fail('extensions.no_services', 'Plugin services are not connected');

const _NO_SERVICES: PluginServices = {
  site: _noServices,
  setCustom: _noServices,
  submit: _noServices,
};

const _NO_SCHEDULER: PluginScheduler = {
  sync: () => undefined,
  stop: () => undefined,
};

const _AS_IS: RequestBody = (request) => Promise.resolve(request);

const _seconds = (ms: number): string =>
  ms >= 60_000 ? `${ms / 60_000} min` : `${ms / 1000} s`;

// Срок вышел — отказ с понятной ошибкой, а signal прерывает то, что плагин передал ему (fetch).
const _timed = <T>(
  ms: number,
  message: string,
  run: (signal: AbortSignal) => T | Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(message)), ms);
  return Promise.race([
    Promise.resolve(controller.signal).then(run),
    new Promise<never>((_resolve, reject) =>
      controller.signal.addEventListener(
        'abort',
        () => reject(controller.signal.reason),
        { once: true }
      )
    ),
  ]).finally(() => clearTimeout(timer));
};

export var defineExtensionsService = ({
  plugins,
  loader,
  bus,
  report = NO_REPORT,
  services = _NO_SERVICES,
  scheduler = _NO_SCHEDULER,
  body = _AS_IS,
  limits = {},
}: {
  plugins: PluginRepository;
  loader: PluginLoader;
  bus: EventBus;
  /** Плагин упал — сайт работает дальше, а владелец узнаёт. */
  report?: Report;
  /** Настройки, своя настройка и заявка формы — для контекста плагина. */
  services?: PluginServices;
  /** Таймеры расписаний процесса. */
  scheduler?: PluginScheduler;
  /** Тело запроса к `handle`: в памяти и с пределом. */
  body?: RequestBody;
  limits?: PluginLimits;
}) => {
  const handleTimeout = limits.handle ?? HANDLE_TIMEOUT;
  const runDeadline = limits.run ?? RUN_DEADLINE;

  const _logPluginError =
    (name: string, where: Where = 'hook') =>
    (error: unknown): void => (
      console.error(`Plugin ${name} failed:`, error),
      report({
        kind: _KINDS[where],
        severity: 'error',
        title: _TITLES[where](name),
        detail: errorDetail(error),
        key: errorKey(`${_KINDS[where]}:${name}`, error),
      })
    );

  // Включённые плагины меняются только через store: список держим в памяти, а не читаем на каждый запрос.
  let loaded: Promise<Active[]> | null = null;
  // Расписания ставит только сервер (`start`); CLI и тесты без фона их не запускают.
  let started = false;

  const load = (name: string): Plugin =>
    plugins.get(parsePluginName(name)) ??
    fail('extensions.plugin_not_found', `There is no plugin named "${name}"`);

  // Модуль загруженного плагина: ошибка загрузки — пустые хуки и запись в журнал.
  // Хуки зовутся внутри `.then`: синхронный throw плагина становится отказом, а не падением запроса.
  const active = (): Promise<Active[]> => loaded ?? (loaded = activate());

  const activate = (): Promise<Active[]> =>
    Promise.all(
      plugins
        .all()
        .filter((_) => _.enabled)
        .map((plugin) =>
          ((key) =>
            loader.load(plugin).then(
              (hooks) => ({ name: plugin.name, key, hooks }),
              (error) => (
                _logPluginError(plugin.name)(error),
                { name: plugin.name, key, hooks: {} }
              )
            ))(`${plugin.revision}\n${plugin.source}`)
        )
    );

  const context = (name: string, signal: AbortSignal): PluginContext => ({
    ...services,
    log: (...parts) => console.log(`[${name}]`, ...parts),
    signal,
  });

  const runScheduled =
    (name: string, schedule: NonNullable<PluginHooks['schedule']>) =>
    (): Promise<void> =>
      _timed(
        runDeadline,
        `Plugin ${name}: the scheduled run did not finish in ${_seconds(runDeadline)}`,
        (signal) => schedule.run(context(name, signal))
      ).then(() => undefined, _logPluginError(name, 'schedule'));

  // Неверный период — сбой плагина, задание не ставится; остальные плагины работают.
  const jobsOf = (list: readonly Active[]): ScheduledJob[] =>
    list.flatMap(({ name, key, hooks }) =>
      hooks.schedule
        ? attempt(
            () =>
              ((every, schedule) => [
                {
                  name,
                  key: `${key}\n${every}`,
                  every,
                  run: runScheduled(name, schedule),
                },
              ])(parseEvery(hooks.schedule!.every), hooks.schedule!),
            (error) => (_logPluginError(name, 'schedule')(error), [])
          )
        : []
    );

  // Задания — по списку, который ещё актуален: правка плагина, пришедшая раньше загрузки, его заменила.
  const arm = (): void => {
    const current = active();
    void current.then(
      (list) =>
        void (started && current === loaded && scheduler.sync(jobsOf(list)))
    );
  };

  const store = (change: PluginChange): Plugin => (
    change.events.length > 0 &&
      (loader.check(change.state),
      plugins.save(change.state),
      (loaded = null),
      change.events.forEach(bus.publish),
      started && arm()),
    change.state
  );

  const render = (
    html: string,
    context: { path: string; status: number }
  ): Promise<string> =>
    active().then((_) =>
      _.reduce<Promise<string>>(
        (result, { name, hooks }) =>
          result.then((current) =>
            hooks.render
              ? Promise.resolve()
                  .then(() => hooks.render!(current, context))
                  .then(
                    (next) => (typeof next === 'string' ? next : current),
                    (error) => (_logPluginError(name)(error), current)
                  )
              : current
          ),
        Promise.resolve(html)
      )
    );

  const notFound = (path: string): Promise<string | null> =>
    active().then((_) =>
      _.reduce<Promise<string | null>>(
        (result, { name, hooks }) =>
          result.then((found) =>
            found !== null || !hooks.notFound
              ? found
              : Promise.resolve()
                  .then(() => hooks.notFound!(path))
                  .then(
                    (next) => (typeof next === 'string' ? next : null),
                    (error) => (_logPluginError(name)(error), null)
                  )
          ),
        Promise.resolve(null)
      )
    );

  // Ответ одного плагина: каждый получает свою копию запроса — тело, прочитанное одним, читается и следующим.
  const respond = (
    { name, hooks }: Active,
    request: Request
  ): Promise<Response | null> =>
    _timed(
      handleTimeout,
      `Plugin ${name}: handle did not answer in ${_seconds(handleTimeout)}`,
      (signal) =>
        hooks.handle!(request.clone() as Request, context(name, signal))
    ).then(
      (answer) =>
        answer === null || answer === undefined
          ? null
          : answer instanceof Response
            ? answer
            : (_logPluginError(name)(
                new Error(
                  `Plugin ${name}: handle must return a Response or null`
                )
              ),
              null),
      (error) => (_logPluginError(name)(error), null)
    );

  // Первый ответ по порядку имён плагинов выигрывает; тело читается, только если есть кому его отдать.
  const handle = (request: Request): Promise<Response | null> =>
    active().then((list) =>
      ((handlers) =>
        handlers.length === 0
          ? null
          : body(request).then((prepared) =>
              prepared instanceof Response
                ? prepared
                : handlers.reduce<Promise<Response | null>>(
                    (answer, plugin) =>
                      answer.then(
                        (found) => found ?? respond(plugin, prepared)
                      ),
                    Promise.resolve(null)
                  )
            ))(list.filter((_) => _.hooks.handle))
    );

  const dispatch = (event: DomainEvent): Promise<void> =>
    active().then((_) =>
      Promise.all(
        _.map(({ name, hooks }) =>
          Promise.resolve()
            .then(() => hooks.on?.[event.type]?.(event))
            .then(undefined, _logPluginError(name))
        )
      ).then(() => undefined)
    );

  return {
    plugins: {
      list: (): Plugin[] => plugins.all(),
      get: (name: string): Plugin => load(name),
      save: (name: string, source: string): Plugin =>
        pipe(
          parsePluginName,
          (_: PluginName) => {
            const existing = plugins.get(_);
            return existing
              ? changePluginSource(source)(existing)
              : createPlugin(_, source);
          },
          store
        )(name),
      setEnabled: (name: string, enabled: boolean): Plugin =>
        pipe(load, setPluginEnabled(enabled), store)(name),
      remove: (name: string): void =>
        pipe(
          load,
          removePlugin,
          (_: PluginChange) => (
            plugins.remove(_.state.name),
            (loaded = null),
            _.events.forEach(bus.publish),
            void (started && arm())
          )
        )(name),
    },
    hooks: { render, notFound, handle, dispatch },
    /**
     * Расписания плагинов — у сервера: ставит задания и переставляет их при каждой правке плагина. Ответ
     * отключает этот набор контекстов от таймеров, но не снимает их: после пересборки контекстов задания той же
     * версии плагина идут своим ходом (снимает их `scheduler.stop`).
     */
    start: (): (() => void) => (
      (started = true), arm(), () => void (started = false)
    ),
  };
};

export type ExtensionsService = ReturnType<typeof defineExtensionsService>;
