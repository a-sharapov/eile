import { api } from './api.ts';
import type { Plugin } from './types.ts';

export var plugins = $state<{ items: Plugin[] }>({ items: [] });

export var loadPlugins = (): Promise<Plugin[]> =>
  api.get<Plugin[]>('/plugins').then((_) => ((plugins.items = _), _));
