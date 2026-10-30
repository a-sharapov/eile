import { api } from './api.ts';
import { loadFields } from './fields.svelte.ts';
import { defineLoad } from './loading.svelte.ts';
import { loadPlugins } from './plugins.svelte.ts';
import type { ElementSummary } from './types.ts';

export var elements = $state<{ items: ElementSummary[] }>({ items: [] });

export var loadElements = (): Promise<ElementSummary[]> =>
  api.get<ElementSummary[]>('/elements').then((_) => ((elements.items = _), _));

/** Раздел «Элементы» целиком: шаблоны и компоненты, плагины, поля — одна загрузка на панель и обзор. */
export var elementsLoad = defineLoad(() =>
  Promise.all([loadElements(), loadPlugins(), loadFields()])
);
