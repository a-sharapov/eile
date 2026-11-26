<script lang="ts" module>
/** День графика: линия — главный ряд, столбик — второй; без второго ряда — null. */
export type ChartPoint = {
  readonly day: string;
  readonly line: number;
  readonly bar: number | null;
};

/** Ряды графика: подписи линии и столбиков и число дня словами — для читалки и подсказки. */
export type ChartSeries = {
  readonly line: string;
  readonly bar: string | null;
  /** «12 посетителей, 40 просмотров» — без даты: её добавит график. */
  readonly text: (point: ChartPoint) => string;
};
</script>

<script lang="ts">
import { currentLanguage, type MessageKey, number, t } from '#lib/i18n.ts';
import type { ChartMark } from './overview.ts';

// График по дням: линия — главный ряд цветом акцента, столбики — второй ряд серым за ней. Посещения — посетители
// и просмотры, «Источники» — новые люди и новые клиенты, вернувшиеся — одна линия. Отметки — смены версии
// отправителя: пунктир и треугольник над днём, тон — формой (закрашен, с «!», пустой) и словом в подсказке.
let {
  days,
  label,
  series,
  marks = [],
}: {
  days: readonly ChartPoint[];
  label: string;
  series: ChartSeries;
  marks?: readonly ChartMark[];
} = $props();

// Холст в пикселях ширины блока: подписи — в rem, как весь менеджер, и не растягиваются вместе с SVG.
let width = $state(0);
let rem = $state(16);
let active = $state<number | null>(null);

$effect(
  () =>
    void (rem = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    ))
);

const _NICE = [1, 2, 2.5, 5, 10];

// Шаг сетки — круглый: 1, 2, 2.5, 5 × 10ⁿ, около четырёх линий до максимума.
const stepOf = (max: number): number =>
  ((raw) =>
    ((power) => _NICE.find((_) => _ * power >= raw)! * power)(
      10 ** Math.floor(Math.log10(raw))
    ))(Math.max(max / 4, 1));

const max = $derived(
  Math.max(0, ...days.map((_) => Math.max(_.line, _.bar ?? 0)))
);
const step = $derived(stepOf(max));
const top = $derived(Math.max(step, Math.ceil(max / step) * step));
const ticks = $derived(
  Array.from({ length: Math.round(top / step) + 1 }, (_, n) => n * step)
);

const _compact = (value: number): string =>
  value >= 10_000
    ? new Intl.NumberFormat(currentLanguage(), { notation: 'compact' }).format(
        value
      )
    : number(value);

const height = $derived(14 * rem);
const left = $derived(
  (Math.max(...ticks.map((_) => _compact(_).length)) * 0.55 + 0.75) *
    (rem * 0.75)
);
const right = $derived(0.5 * rem);
const placed = $derived(
  marks
    .map((mark) => ({ mark, index: days.findIndex((_) => _.day === mark.day) }))
    .filter((_) => _.index >= 0)
);
const plotTop = $derived((placed.length > 0 ? 1.6 : 0.75) * rem);
const plotBottom = $derived(height - 1.75 * rem);
const plotWidth = $derived(Math.max(0, width - left - right));
const band = $derived(days.length > 0 ? plotWidth / days.length : 0);
// Столбик — не толще 24 px и с зазором в 2 px до соседа: остаток полосы — воздух.
const barWidth = $derived(Math.max(1, Math.min(24, band - 2, band * 0.7)));

const y = (value: number): number =>
  plotBottom - (top === 0 ? 0 : (value / top) * (plotBottom - plotTop));
const centre = (index: number): number => left + band * (index + 0.5);

// Скругление 4 px — только у вершины; у основания столбик прямой.
const barPath = (index: number, value: number): string =>
  ((x, w, yTop) =>
    ((r) =>
      `M${x},${plotBottom}V${yTop + r}A${r},${r} 0 0 1 ${x + r},${yTop}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${yTop + r}V${plotBottom}Z`)(
      Math.min(4, w / 2, plotBottom - yTop)
    ))(centre(index) - barWidth / 2, barWidth, y(value));

const line = $derived(
  days
    .map((_, n) => `${n === 0 ? 'M' : 'L'}${centre(n)},${y(_.line)}`)
    .join('')
);

const _date = (day: string, options: Intl.DateTimeFormatOptions): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    ...options,
  });

// Подписи дней — сколько поместится с запасом, первая и последняя всегда.
const labels = $derived(
  ((count) =>
    days.length === 0
      ? []
      : [
          ...new Set(
            Array.from({ length: count }, (_, n) =>
              Math.round((n * (days.length - 1)) / Math.max(1, count - 1))
            )
          ),
        ])(
    Math.max(1, Math.min(days.length, Math.floor(plotWidth / (5.5 * rem)) + 1))
  )
);

const _KEYS: Readonly<Record<string, (index: number, last: number) => number>> =
  {
    ArrowLeft: (index) => Math.max(0, index - 1),
    ArrowRight: (index, last) => Math.min(last, index + 1),
    Home: () => 0,
    End: (_index, last) => last,
  };

const onKey = (event: KeyboardEvent) =>
  ((move) =>
    void (
      move &&
      days.length > 0 &&
      (event.preventDefault(),
      (active = move(active ?? days.length - 1, days.length - 1)))
    ))(_KEYS[event.key]);

const shown = $derived(active === null ? null : (days[active] ?? null));
const marksOn = (day: string | undefined): ChartMark[] =>
  placed.filter((_) => _.mark.day === day).map((_) => _.mark);
const valueText = $derived(
  ((day) =>
    day
      ? `${_date(day.day, { day: 'numeric', month: 'long' })}: ${series.text(day)}${marksOn(day.day)
          .map((_) => `; ${_.label}`)
          .join('')}`
      : '')(days[active ?? days.length - 1])
);

// Треугольник над днём остриём вниз: у «не сошлось» внутри «!», у «не сверялось» — только контур.
const triangle = (index: number): string =>
  ((x, size) =>
    `M${x - size},${plotTop - size * 1.7}H${x + size}L${x},${plotTop - 0.25 * rem}Z`)(
    centre(index),
    0.42 * rem
  );

const _MARK_LABELS: Readonly<Record<ChartMark['tone'], MessageKey>> = {
  ok: 'analyticsOverview.markOk',
  bad: 'analyticsOverview.markBad',
  none: 'analyticsOverview.markNone',
};
const tones = $derived(
  (['ok', 'bad', 'none'] as const).filter((tone) =>
    placed.some((_) => _.mark.tone === tone)
  )
);
// Подсказка — над днём, но не за краем холста.
const tipLeft = $derived(
  active === null
    ? 0
    : Math.min(Math.max(centre(active), 6 * rem), width - 6 * rem)
);
</script>

<div class="legend" aria-hidden="true">
  <span><span class="key line"></span>{series.line}</span>
  {#if series.bar !== null}<span><span class="key bar"></span>{series.bar}</span>{/if}
  {#each tones as tone (tone)}<span><svg class="key mark {tone}" viewBox="0 0 12 10" aria-hidden="true"><path d="M1,1H11L6,9Z" />{#if tone === 'bad'}<path class="bang" d="M6,2.6V5.2" />{/if}</svg>{t(_MARK_LABELS[tone])}</span>{/each}
</div>
<!-- С клавиатуры график — ползунок по дням: стрелки дают ту же подсказку, что мышь; таблица — под ним. -->
<div
  class="chart"
  bind:clientWidth={width}
  tabindex="0"
  role="slider"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={Math.max(0, days.length - 1)}
  aria-valuenow={active ?? days.length - 1}
  aria-valuetext={valueText}
  title={t('stats.chartKeys')}
  onkeydown={onKey}
  onfocus={() => void (active ??= days.length - 1)}
  onblur={() => void (active = null)}
>
  {#if width > 0}
    <svg {width} {height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" onpointerleave={() => void (active = null)}>
      {#each ticks as tick (tick)}
        <line class:axis={tick === 0} class="grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
        <text class="tick" x={left - 0.5 * rem} y={y(tick)} dy="0.32em" text-anchor="end">{_compact(tick)}</text>
      {/each}
      {#each days as day, index (day.day)}
        {#if (day.bar ?? 0) > 0}
          <path class="bar" class:lifted={active === index} d={barPath(index, day.bar ?? 0)} />
        {/if}
      {/each}
      {#each placed as item (`${item.mark.day}/${item.mark.label}`)}
        <line class="mark-line {item.mark.tone}" x1={centre(item.index)} x2={centre(item.index)} y1={plotTop - 0.2 * rem} y2={plotBottom} />
        <path class="mark {item.mark.tone}" d={triangle(item.index)} />
        {#if item.mark.tone === 'bad'}<line class="bang" x1={centre(item.index)} x2={centre(item.index)} y1={plotTop - 0.42 * rem * 1.45} y2={plotTop - 0.42 * rem * 0.75} />{/if}
      {/each}
      {#if active !== null}
        <line class="cross" x1={centre(active)} x2={centre(active)} y1={plotTop} y2={plotBottom} />
      {/if}
      <path class="line" d={line} />
      {#if days.length > 0}
        {@const at = active ?? days.length - 1}
        <circle class="dot" cx={centre(at)} cy={y(days[at]!.line)} r="4" />
      {/if}
      {#each labels as index (index)}
        <text class="tick" x={centre(index)} y={plotBottom + 1.15 * rem} text-anchor={index === 0 && days.length > 1 ? 'start' : index === days.length - 1 && days.length > 1 ? 'end' : 'middle'} dx={index === 0 && days.length > 1 ? -band / 2 : index === days.length - 1 && days.length > 1 ? band / 2 : 0}>{_date(days[index]!.day, { day: 'numeric', month: 'short' })}</text>
      {/each}
      {#each days as _day, index (index)}
        <rect role="presentation" class="hit" x={left + band * index} y={plotTop} width={band} height={plotBottom - plotTop} onpointerenter={() => void (active = index)} />
      {/each}
    </svg>
  {/if}
  {#if shown}
    <div class="tip" style:left={`${tipLeft}px`} role="status" aria-live="polite">
      <span class="when">{_date(shown.day, { weekday: 'short', day: 'numeric', month: 'long' })}</span>
      <span class="row"><span class="key line"></span><strong>{number(shown.line)}</strong> {series.line}</span>
      {#if series.bar !== null}<span class="row"><span class="key bar"></span><strong>{number(shown.bar ?? 0)}</strong> {series.bar}</span>{/if}
      {#each marksOn(shown.day) as mark (mark.label)}<span class="row note"><svg class="key mark {mark.tone}" viewBox="0 0 12 10" aria-hidden="true"><path d="M1,1H11L6,9Z" />{#if mark.tone === 'bad'}<path class="bang" d="M6,2.6V5.2" />{/if}</svg>{mark.label}</span>{/each}
    </div>
  {/if}
</div>

<style>
  /* Линия — главный ряд, цветом акцента; столбики — второй ряд серым за ним. Шаги для тёмной темы — свои,
     проверены валидатором палитры против поверхности каждой темы. */
  .chart,
  .legend {
    --series-line: light-dark(
      oklch(51% calc(0.15 * var(--sig)) var(--hue)),
      oklch(66% calc(0.13 * var(--sig)) var(--hue))
    );
    --series-bar: light-dark(
      oklch(75% 0.012 var(--hue)),
      oklch(45% 0.012 var(--hue))
    );
    --mark-ok: color-mix(in oklch, var(--ok) 80%, var(--text));
    --mark-bad: color-mix(in oklch, var(--danger) 85%, var(--text));
    --mark-none: var(--muted);
  }

  /* Отметки смены версии: пунктир через весь график и треугольник над днём. */
  .mark-line {
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .mark-line.ok,
  .mark.ok {
    stroke: var(--mark-ok);
  }

  .mark-line.bad,
  .mark.bad {
    stroke: var(--mark-bad);
  }

  .mark-line.none,
  .mark.none {
    stroke: var(--mark-none);
  }

  .mark {
    stroke-width: 1.25;
    stroke-linejoin: round;
  }

  .mark.ok {
    fill: var(--mark-ok);
  }

  .mark.bad {
    fill: var(--mark-bad);
  }

  .mark.none {
    fill: var(--surface);
  }

  .bang {
    stroke: var(--surface);
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  svg.key.mark {
    width: 0.75rem;
    height: 0.625rem;
    overflow: visible;
  }

  .tip .note {
    max-width: 18rem;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .legend > span {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }

  .key {
    display: inline-block;
    flex: none;
  }

  .key.line {
    width: 0.875rem;
    height: 0.125rem;
    border-radius: 0.0625rem;
    background: var(--series-line);
  }

  .key.bar {
    width: 0.5rem;
    height: 0.75rem;
    border-radius: 0.125rem 0.125rem 0 0;
    background: var(--series-bar);
  }

  .chart {
    position: relative;
    min-height: 14rem;
    border-radius: var(--radius);
    outline-offset: 0.25rem;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .grid.axis {
    stroke: color-mix(in oklch, var(--line), var(--text) 18%);
  }

  .tick {
    fill: var(--muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    fill: var(--series-bar);
    transition: fill 120ms var(--ease);
  }

  .bar.lifted {
    fill: color-mix(in oklch, var(--series-bar), var(--text) 22%);
  }

  .line {
    fill: none;
    stroke: var(--series-line);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .dot {
    fill: var(--series-line);
    stroke: var(--surface);
    stroke-width: 2;
  }

  .cross {
    stroke: color-mix(in oklch, var(--line), var(--text) 30%);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .hit {
    fill: transparent;
  }

  .tip {
    position: absolute;
    top: 0;
    display: grid;
    gap: 0.2rem;
    min-width: 10rem;
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 0.8125rem;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .tip .when {
    color: var(--muted);
  }

  .tip .row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    color: var(--muted);
  }

  .tip strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
</style>
