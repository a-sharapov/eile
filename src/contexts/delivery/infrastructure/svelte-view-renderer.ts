import type { Component } from 'svelte';
import { render } from 'svelte/server';
import type {
  RenderedStyle,
  View,
  ViewRenderer,
} from '../application/ports.ts';

// Маркеры гидрации Svelte (`<!--[-->`, `<!--]-->`, `<!---->`, `<!--$s1-->` от `$props.id()`, хэш в head)
// без клиентского JS — шум.
// Комментарии внутри `{@html}` не трогаем: `<!--noindex-->` нужен Яндексу, маркеры регионов — второй фазе.
// В dev-режиме (NODE_ENV не production) Svelte добавляет и другие маркеры.
const _BLOCK_MARKER = /<!--(?:\[[!\d-]*|\]|\$s\d+|)-->/g;
const _HEAD_MARKER = /^<!--[a-z0-9]+-->/;

type _Renderer = { readonly global?: { readonly css?: unknown } };

type _View = (renderer: _Renderer, props: unknown) => void;

/**
 * Каждый скомпилированный вид кладёт свой `$$css` в набор рендера, а Svelte печатает набор в head, когда
 * корень нарисован. Корень-обёртка забирает набор раньше: стили уходят файлами (ADR 0047). Набора нет
 * (другая версия Svelte) — стили остаются в head, как раньше.
 */
const _collecting = (view: View) => {
  let styles: readonly RenderedStyle[] = [];
  const root = (renderer: _Renderer, props: unknown): void => {
    (view as _View)(renderer, props);
    const css = renderer.global?.css;
    void (
      css instanceof Set &&
      ((styles = [...css] as RenderedStyle[]), css.clear())
    );
  };
  return { root, styles: () => styles };
};

export var svelteViewRenderer: ViewRenderer = {
  render: (view, props, context, hydratable = false) => {
    const collecting = _collecting(view);
    const { head, body } = render(
      collecting.root as unknown as Component<Record<string, unknown>>,
      { props: { ...props }, context: new Map(context) }
    );
    return {
      head: head.replace(_HEAD_MARKER, '').replace(_BLOCK_MARKER, ''),
      body: hydratable ? body : body.replace(_BLOCK_MARKER, ''),
      styles: collecting.styles(),
    };
  },
};
