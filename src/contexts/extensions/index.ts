import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import type { Report } from '../../shared/kernel/report.ts';
import { defineExtensionsService } from './application/extensions-service.ts';
import { defineBunPluginLoader } from './infrastructure/bun-plugin-loader.ts';
import { definePluginRepository } from './infrastructure/sqlite-plugins.ts';

export type { ExtensionsService } from './application/extensions-service.ts';
export type { ExtensionsEvent, Plugin } from './domain/plugin.ts';
export type { PluginHooks } from './domain/ports.ts';
export { extensionsMigrations } from './infrastructure/sqlite-plugins.ts';

/** Контекст extensions: плагины на TypeScript и их хуки. */
export var defineExtensions = ({
  db,
  bus,
  runtime,
  report,
}: {
  db: Database;
  bus: EventBus;
  runtime: object;
  report?: Report;
}) => {
  const service = defineExtensionsService({
    plugins: definePluginRepository(db),
    loader: defineBunPluginLoader(runtime),
    bus,
    report,
  });
  bus.onAny((event) => void service.hooks.dispatch(event));
  return service;
};
