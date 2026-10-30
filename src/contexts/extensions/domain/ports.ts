import type { DomainEvent } from '../../../shared/kernel/events.ts';
import type { Plugin, PluginName } from './plugin.ts';

export type PluginRepository = {
  readonly all: () => Plugin[];
  readonly get: (name: PluginName) => Plugin | null;
  readonly save: (plugin: Plugin) => void;
  readonly remove: (name: PluginName) => void;
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
