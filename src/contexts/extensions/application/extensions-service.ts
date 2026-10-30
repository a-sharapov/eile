import { fail } from '../../../shared/kernel/errors.ts';
import type { DomainEvent, EventBus } from '../../../shared/kernel/events.ts';
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
  PluginHooks,
  PluginLoader,
  PluginRepository,
} from '../domain/ports.ts';

export var defineExtensionsService = ({
  plugins,
  loader,
  bus,
  report = NO_REPORT,
}: {
  plugins: PluginRepository;
  loader: PluginLoader;
  bus: EventBus;
  /** Плагин упал — сайт работает дальше, а владелец узнаёт. */
  report?: Report;
}) => {
  const _logPluginError =
    (name: string) =>
    (error: unknown): void => (
      console.error(`Plugin ${name} failed:`, error),
      report({
        kind: 'extensions.plugin_failed',
        severity: 'error',
        title: `Плагин ${name} упал`,
        detail: errorDetail(error),
        key: errorKey(`extensions.plugin_failed:${name}`, error),
      })
    );

  // Включённые плагины меняются только через store: список держим в памяти, а не читаем на каждый запрос.
  let loaded: Promise<Array<{ name: string; hooks: PluginHooks }>> | null =
    null;

  const store = (change: PluginChange): Plugin => (
    change.events.length > 0 &&
      (loader.check(change.state),
      plugins.save(change.state),
      (loaded = null),
      change.events.forEach(bus.publish)),
    change.state
  );

  const load = (name: string): Plugin =>
    plugins.get(parsePluginName(name)) ??
    fail('extensions.plugin_not_found', `There is no plugin named "${name}"`);

  // Модуль загруженного плагина: ошибка загрузки — пустые хуки и запись в журнал.
  // Хуки зовутся внутри `.then`: синхронный throw плагина становится отказом, а не падением запроса.
  const active = (): Promise<Array<{ name: string; hooks: PluginHooks }>> =>
    loaded ?? (loaded = activate());

  const activate = (): Promise<Array<{ name: string; hooks: PluginHooks }>> =>
    Promise.all(
      plugins
        .all()
        .filter((_) => _.enabled)
        .map((plugin) =>
          loader.load(plugin).then(
            (hooks) => ({ name: plugin.name, hooks }),
            (error) => (
              _logPluginError(plugin.name)(error),
              { name: plugin.name, hooks: {} }
            )
          )
        )
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
        pipe<string, Plugin>(
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
        pipe<string, Plugin>(load, setPluginEnabled(enabled), store)(name),
      remove: (name: string): void =>
        pipe<string, void>(
          load,
          removePlugin,
          (_: PluginChange) => (
            plugins.remove(_.state.name),
            (loaded = null),
            _.events.forEach(bus.publish)
          )
        )(name),
    },
    hooks: { render, notFound, dispatch },
  };
};

export type ExtensionsService = ReturnType<typeof defineExtensionsService>;
