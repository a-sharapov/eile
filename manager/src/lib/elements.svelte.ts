import { api } from './api.ts';
import { loadFields } from './fields.svelte.ts';
import type { MessageKey } from './i18n.ts';
import type { icons } from './icons.ts';
import { defineLoad } from './loading.svelte.ts';
import { loadPlugins } from './plugins.svelte.ts';
import type { ElementKind, ElementSummary } from './types.ts';

/** Вид элемента: подпись одного, группы и значок. */
export var ELEMENT_KINDS: Readonly<
  Record<
    ElementKind,
    {
      readonly one: MessageKey;
      readonly many: MessageKey;
      readonly icon: keyof typeof icons;
    }
  >
> = {
  template: {
    one: 'elements.template',
    many: 'elements.templates',
    icon: 'template',
  },
  component: {
    one: 'elements.component',
    many: 'elements.components',
    icon: 'component',
  },
  script: {
    one: 'elements.script',
    many: 'elements.scripts',
    icon: 'fileCode',
  },
};

export var elements = $state<{ items: ElementSummary[] }>({ items: [] });

export var loadElements = (): Promise<ElementSummary[]> =>
  api.get<ElementSummary[]>('/elements').then((_) => ((elements.items = _), _));

/** Раздел «Элементы» целиком: шаблоны, компоненты, скрипты, плагины, поля — одна загрузка на панель и обзор. */
export var elementsLoad = defineLoad(() =>
  Promise.all([loadElements(), loadPlugins(), loadFields()])
);
