/** CSS компонента, как его собрал Svelte при рендере: класс области и код. */
export type RenderedStyle = { readonly hash: string; readonly code: string };

export type Rendered = {
  readonly head: string;
  readonly body: string;
  /** Стили нарисованных компонентов по порядку рендера: в head их нет, теги ставит документ. */
  readonly styles?: readonly RenderedStyle[];
};

const _escapeAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

// Свой viewport шаблона (например, с `viewport-fit=cover` для вырезов экрана) заменяет обычный: два тега
// браузеры сливают непредсказуемо.
const _VIEWPORT = /<meta\b[^>]*\bname\s*=\s*["']?viewport\b/i;

export var htmlDocument = (language: string, { head, body }: Rendered) =>
  [
    '<!doctype html>',
    `<html lang="${_escapeAttribute(language)}">`,
    '<head>',
    '<meta charset="utf-8">',
    _VIEWPORT.test(head)
      ? ''
      : '<meta name="viewport" content="width=device-width, initial-scale=1">',
    head,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');

const _escapeJson = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

/** Обёртка острова: `display: contents` не влияет на вёрстку, props — для гидрации. */
export var islandHtml = (
  module: string,
  props: unknown,
  body: string
): string =>
  `<cms-island data-module="${_escapeAttribute(module)}" data-props="${_escapeJson(props)}" style="display:contents">${body}</cms-island>`;

/** Один загрузчик на страницу: модуль каждого острова грузится и гидрирует свой узел. */
export var islandLoader = (hydrator: string): string =>
  `<script type="module">import{hydrate}from${JSON.stringify(hydrator)};for(const e of document.querySelectorAll('cms-island'))import(e.dataset.module).then(m=>hydrate(m.default,{target:e,props:JSON.parse(e.dataset.props)}));</script>`;

/** Маркер места некэшируемого региона в HTML первой фазы. */
export var regionMarker = (index: number): string =>
  `<!--cms:region:${index}-->`;

const _REGION_MARKER = /<!--cms:region:(\d+)-->/g;

/**
 * Подставляет регионы на места маркеров: head регионов, которого ещё нет, дописывается в head, стили
 * регионов — к стилям страницы; один компонент — один раз.
 */
export var fillRegions = (
  snapshot: Rendered,
  regions: readonly Rendered[]
): Rendered => ({
  head: [
    snapshot.head,
    ...new Set(
      regions.map((_) => _.head).filter((_) => !snapshot.head.includes(_))
    ),
  ].join(''),
  body: snapshot.body.replace(
    _REGION_MARKER,
    (_match, index: string) => regions[Number(index)]?.body ?? ''
  ),
  styles: [
    ...new Set([
      ...(snapshot.styles ?? []),
      ...regions.flatMap((_) => _.styles ?? []),
    ]),
  ],
});
