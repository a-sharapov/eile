import type { Brand } from '../../../shared/kernel/brand.ts';
import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';

export type PluginName = Brand<string, 'PluginName'>;

/** Модуль на TypeScript с хуками; аналог плагина Evo. Исполняется на сервере — правит только администратор. */
export type Plugin = {
  readonly name: PluginName;
  readonly source: string;
  readonly enabled: boolean;
  readonly revision: number;
};

export type ExtensionsEvent = {
  readonly type: 'extensions.plugin_changed' | 'extensions.plugin_removed';
  readonly name: PluginName;
};

export type PluginChange = Changed<Plugin, ExtensionsEvent>;

const _NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;
const _MAX_SOURCE_LENGTH = 256 * 1024;

export var parsePluginName = (raw: string): PluginName =>
  _NAME.test(raw)
    ? (raw as PluginName)
    : fail(
        'extensions.invalid_name',
        `Plugin name "${raw}" must be PascalCase latin letters and digits`
      );

const _source = (source: string): string =>
  !source.trim()
    ? fail('extensions.empty_source', 'Source cannot be empty')
    : source.length > _MAX_SOURCE_LENGTH
      ? fail(
          'extensions.source_too_large',
          `Source is larger than ${_MAX_SOURCE_LENGTH} characters`
        )
      : source;

const _changed = (plugin: Plugin): PluginChange =>
  changed<Plugin, ExtensionsEvent>(plugin, {
    type: 'extensions.plugin_changed',
    name: plugin.name,
  });

export var removePlugin = (plugin: Plugin): PluginChange =>
  changed<Plugin, ExtensionsEvent>(plugin, {
    type: 'extensions.plugin_removed',
    name: plugin.name,
  });

export var createPlugin = (name: PluginName, source: string): PluginChange =>
  _changed({ name, source: _source(source), enabled: true, revision: 1 });

export var changePluginSource =
  (source: string) =>
  (plugin: Plugin): PluginChange =>
    source === plugin.source
      ? changed(plugin)
      : _changed({
          ...plugin,
          source: _source(source),
          revision: plugin.revision + 1,
        });

export var setPluginEnabled =
  (enabled: boolean) =>
  (plugin: Plugin): PluginChange =>
    enabled === plugin.enabled
      ? changed(plugin)
      : _changed({ ...plugin, enabled });
