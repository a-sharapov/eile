import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import type { Report } from '../../shared/kernel/report.ts';
import {
  defineExtensionsService,
  type PluginLimits,
} from './application/extensions-service.ts';
import type { PluginScheduler, PluginServices } from './domain/ports.ts';
import { defineBunPluginLoader } from './infrastructure/bun-plugin-loader.ts';
import { bufferedBody } from './infrastructure/request-body.ts';
import { definePluginRepository } from './infrastructure/sqlite-plugins.ts';

export {
  type ExtensionsService,
  HANDLE_TIMEOUT,
  type PluginLimits,
} from './application/extensions-service.ts';
export type { ExtensionsEvent, Plugin } from './domain/plugin.ts';
export type {
  PluginContext,
  PluginHooks,
  PluginScheduler,
  PluginServices,
  PluginSite,
  PluginSubmitOptions,
  PluginSubmitResult,
  PluginValues,
} from './domain/ports.ts';
export {
  FIRST_RUN_DELAY,
  parseEvery,
  RUN_DEADLINE,
} from './domain/schedule.ts';
export { definePluginScheduler } from './infrastructure/plugin-scheduler.ts';
export { PLUGIN_BODY_LIMIT } from './infrastructure/request-body.ts';
export { extensionsMigrations } from './infrastructure/sqlite-plugins.ts';

/** Контекст extensions: плагины на TypeScript и их хуки. */
export var defineExtensions = ({
  db,
  bus,
  runtime,
  report,
  services,
  scheduler,
  limits,
}: {
  db: Database;
  bus: EventBus;
  runtime: object;
  report?: Report;
  /** Контекст плагина: настройки, своя настройка, заявка формы. */
  services?: PluginServices;
  /** Таймеры расписаний — одни на процесс, их создаёт корень композиции. */
  scheduler?: PluginScheduler;
  limits?: PluginLimits;
}) => {
  const service = defineExtensionsService({
    plugins: definePluginRepository(db),
    loader: defineBunPluginLoader(runtime),
    bus,
    report,
    services,
    scheduler,
    body: bufferedBody(),
    limits,
  });
  bus.onAny((event) => void service.hooks.dispatch(event));
  return service;
};
