import type { Component } from 'svelte';
import { render } from 'svelte/server';
import type { ViewRenderer } from '../application/ports.ts';

// Маркеры гидрации Svelte (`<!--[-->`, `<!--]-->`, `<!---->`, `<!--$s1-->` от `$props.id()`, хэш в head)
// без клиентского JS — шум.
// Комментарии внутри `{@html}` не трогаем: `<!--noindex-->` нужен Яндексу, маркеры регионов — второй фазе.
// В dev-режиме (NODE_ENV не production) Svelte добавляет и другие маркеры.
const _BLOCK_MARKER = /<!--(?:\[[!\d-]*|\]|\$s\d+|)-->/g;
const _HEAD_MARKER = /^<!--[a-z0-9]+-->/;

export var svelteViewRenderer: ViewRenderer = {
  render: (view, props, context, hydratable = false) => {
    const { head, body } = render(view as Component<Record<string, unknown>>, {
      props: { ...props },
      context: new Map(context),
    });
    return {
      head: head.replace(_HEAD_MARKER, '').replace(_BLOCK_MARKER, ''),
      body: hydratable ? body : body.replace(_BLOCK_MARKER, ''),
    };
  },
};
