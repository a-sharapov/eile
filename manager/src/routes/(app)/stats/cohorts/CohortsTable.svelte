<script lang="ts">
import { lowDataOf } from '#lib/analytics-reports.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { money } from '#lib/money.ts';
import type { CohortAverage, CohortCell, CohortRow } from '#lib/types.ts';
import { resolve } from '$app/paths';
import Mark from '../Mark.svelte';
import ScrollTable from '../ScrollTable.svelte';
import {
  averageMembers,
  cellMeasure,
  cellWords,
  cohortPeople,
  HEAT_STEPS,
  heatBounds,
  heatScale,
  heatStep,
  lifeColumns,
  monthShort,
  type PaymentCohorts,
} from './cohorts.ts';

// Когорты по первой оплате (ADR 0072, «Когорты»): строка — месяц первой оплаты, столбцы — месяцы жизни. Цвет ячейки
// — ступень шкалы от меньшего к большему, число читается и без цвета. Неполная ячейка — знаком ◌, курсивом и
// штриховкой, словами — в подсказке и для читалки; будущая — пустая. Под таблицей — «Среднее» по полным ячейкам.
let {
  report,
  today,
  title,
}: {
  report: PaymentCohorts;
  /** Сегодня в поясе отчёта: люди когорты нынешнего месяца — по сегодня. */
  today: string;
  /** Заголовок таблицы — имя области прокрутки. */
  title: string;
} = $props();

const id = $props.id();
const columns = $derived(lifeColumns(report));
const ks = $derived(Array.from({ length: columns }, (_, k) => k));
const active = $derived(report.metric === 'active');
const base = $derived(report.baseCurrency);
const scale = $derived(heatScale(report.rows, report.metric));

const _monthText = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

const _percent = (rate: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(rate);

/** Значение ячейки или среднего: деньги — в базовой валюте, доступ — долей. */
const measureText = (measure: number): string =>
  active
    ? _percent(measure)
    : base === null
      ? '—'
      : money(measure, base, currentLanguage());

const stepOf = (cell: CohortCell): number | null =>
  ((measure) =>
    measure === null || scale === null ? null : heatStep(measure, scale))(
    cellMeasure(cell, report.metric)
  );

const cellTitle = (cell: CohortCell, row: CohortRow): string =>
  [
    cell.state === 'incomplete'
      ? cell.base > 0
        ? t('cohorts.incompleteHint', {
            count: number(cell.base),
            base: number(row.customers),
          })
        : t('cohorts.incompleteNoneHint')
      : '',
    cell.unpriced ? t('cohorts.unpricedHint') : '',
    cell.staleRate ? t('sources.staleHint') : '',
  ]
    .filter(Boolean)
    .join(' ');

const peopleHref = (row: CohortRow): string =>
  `${resolve('/(app)/stats/people')}?${cohortPeople(row.month, 'payment', report, today)}`;

const averageTitle = (k: number): string =>
  ((members) =>
    members.length === 0
      ? ''
      : t('cohorts.averageMembers', {
          months: members.map((_) => _monthText(_.month)).join(', '),
        }))(averageMembers(report.rows, k));

const averageMeasure = (average: CohortAverage): number | null =>
  average.value === null
    ? null
    : active
      ? average.customers > 0
        ? average.value / average.customers
        : null
      : average.value;

const openRow = $derived(report.rows.find((_) => _.open) ?? null);
const anyLow = $derived(report.rows.some((_) => _.lowData));
const anyIncomplete = $derived(
  report.rows.some((row) =>
    row.cells.slice(0, columns).some((_) => _.state === 'incomplete')
  )
);
const anyUnpriced = $derived(
  report.rows.some((row) => row.cells.some((_) => _.unpriced))
);
const anyStale = $derived(
  report.rows.some((row) => row.cells.some((_) => _.staleRate))
);
const ratesHref = `${resolve('/(app)/stats/spend')}?tab=rates`;
const bounds = $derived(scale === null ? [] : heatBounds(scale));
</script>

{#snippet cell(row: CohortRow, value: CohortCell)}
  {@const step = stepOf(value)}
  {@const words = cellWords(value, row)}
  {@const measure = cellMeasure(value, report.metric)}
  <td class="cell num" class:incomplete={value.state === 'incomplete'} class:future={value.state === 'future'} data-step={step} title={cellTitle(value, row) || undefined}>
    {#if value.state !== 'future'}
      <span class="main">{#if value.state === 'incomplete'}<span class="partial" aria-hidden="true">◌</span>{/if}{#if value.staleRate}<span class="approx" aria-hidden="true">≈</span>{/if}{measure === null ? '—' : measureText(measure)}</span>
      {#if active && value.base > 0 && value.value !== null}
        <small>{t('report.ofBase', { count: number(value.value), base: number(value.base) })}</small>
      {:else if !active && value.state === 'incomplete' && value.base > 0}
        <small>{t('report.ofBase', { count: number(value.base), base: number(row.customers) })}</small>
      {/if}
      {#if value.unpriced}<small class="warn">{t('cohorts.unpriced')}</small>{/if}
    {/if}
    {#if words}<span class="sr-only">{words}</span>{/if}
  </td>
{/snippet}

<div class="cohorts">
<ScrollTable label={title}>
  <table class="cohorts-table" aria-describedby={`${id}-legend`}>
    <thead>
      <tr>
        <th scope="col" rowspan="2" class="month pinned">{t('cohorts.colMonth')}</th>
        <th scope="col" rowspan="2" class="customers num pinned">{t('cohorts.colCustomers')}</th>
        <th scope="colgroup" colspan={columns} class="group">{t('cohorts.lifeMonths')}</th>
      </tr>
      <tr>
        {#each ks as k (k)}
          <th scope="col" class="num life"><span class="sr-only">{t('cohorts.lifeMonthN', { n: k })}</span><span aria-hidden="true">{k}</span></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each report.rows as row (row.month)}
        <tr class:low={row.lowData}>
          <th scope="row" class="month pinned">
            <span class="name">{monthShort(row.month, currentLanguage())}</span>
            {#if row.open}<Mark tone="accent" title={t('cohorts.openHint')}>{t('cohorts.open')}</Mark>{/if}
            {#if row.lowData && row.customers > 0}<Mark title={t('cohorts.lowHint', { n: lowDataOf(report).customers })}>{t('report.lowData')}</Mark>{/if}
          </th>
          <td class="customers num pinned">
            {#if row.customers > 0}<a href={peopleHref(row)} title={t('cohorts.peopleLink')}>{number(row.customers)}</a>{:else}{number(0)}{/if}
          </td>
          {#each ks as k (k)}{@render cell(row, row.cells[k]!)}{/each}
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr class="average">
        <th scope="row" class="month pinned">{t('cohorts.average')}</th>
        <td class="customers num pinned"></td>
        {#each ks as k (k)}
          {@const average = report.average[k]}
          {@const measure = average ? averageMeasure(average) : null}
          <td class="num" title={averageTitle(k) || undefined}>
            {#if average && measure !== null}
              <span class="main">{measureText(measure)}</span>
              {#if active}<small>{t('report.ofBase', { count: number(average.value ?? 0), base: number(average.customers) })}</small>{/if}
              <small>{tn('cohorts.averageCohorts', average.cohorts)}</small>
              {#if !active}<small>{tn('cohorts.averageCustomers', average.customers)}</small>{/if}
              {#if averageTitle(k)}<span class="sr-only">{averageTitle(k)}</span>{/if}
            {:else}
              <span class="muted" aria-hidden="true">—</span><span class="sr-only">{t('cohorts.averageNone')}</span>
            {/if}
          </td>
        {/each}
      </tr>
    </tfoot>
  </table>
</ScrollTable>

<div class="under">
  {#if scale}
    <p class="legend" id={`${id}-legend`}>
      <span class="legend-title">{t('cohorts.legend')}</span>
      <span class="scale" aria-hidden="true">
        <span>{t('cohorts.less')}</span>
        {#each bounds as from, step (step)}<span class="swatch" data-step={step} title={measureText(from)}></span>{/each}
        <span>{t('cohorts.more')}</span>
      </span>
      <span class="muted">{t('cohorts.legendRange', { min: measureText(scale.min), max: measureText(scale.max) })}</span>
    </p>
  {:else}
    <p class="sr-only" id={`${id}-legend`}>{t('cohorts.legendNone')}</p>
  {/if}

  <ul class="notes">
    <li>{t('cohorts.averageNote')}</li>
    {#if openRow}<li>{t('cohorts.averageOpen', { month: _monthText(openRow.month) })}</li>{/if}
    {#if anyIncomplete}<li><span class="partial" aria-hidden="true">◌</span> {t('cohorts.incompleteNote')}</li>{/if}
    {#if anyUnpriced}<li class="warn">{t('cohorts.unpricedNote')} <a href={ratesHref}>{t('sources.toRates')}</a></li>{/if}
    {#if anyStale}<li><span class="approx" aria-hidden="true">≈</span> {t('sources.staleNote')} <a href={ratesHref}>{t('sources.toRates')}</a></li>{/if}
    {#if anyLow}<li>{t('cohorts.lowNote', { n: lowDataOf(report).customers })}</li>{/if}
  </ul>
</div>
</div>

<style>
  .cohorts {
    --month: 8rem;
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  th,
  td {
    padding: 0.5rem 0.6rem;
  }

  thead th {
    vertical-align: bottom;
    line-height: 1.3;
  }

  .group {
    border-bottom-style: dashed;
    text-align: center;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  thead .num {
    text-align: right;
  }

  .life {
    min-width: 5.5rem;
  }

  /* Месяц и число клиентов закреплены: при прокрутке вбок видно, чья строка. */
  .pinned {
    position: sticky;
    z-index: 1;
    background: var(--surface);
  }

  thead .pinned {
    z-index: 2;
    background: var(--sunken);
  }

  .month {
    left: 0;
    width: var(--month);
    min-width: var(--month);
    max-width: var(--month);
    text-align: left;
  }

  .customers {
    left: var(--month);
    min-width: 5rem;
  }

  .customers.pinned {
    box-shadow: var(--pinned-shadow, none);
  }

  tbody .month,
  tfoot .month {
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 600;
    vertical-align: top;
  }

  .month .name {
    display: block;
    margin-bottom: 0.2rem;
  }

  .month :global(.mark) {
    margin: 0.1rem 0.25rem 0 0;
  }

  td {
    font-size: 0.875rem;
    vertical-align: top;
    white-space: nowrap;
  }

  td small {
    display: block;
    color: var(--muted);
    font-size: 0.75rem;
    white-space: normal;
    overflow-wrap: break-word;
  }

  /* «4 когорты», «439 клиентов» — одной строкой: столбец станет шире, а не выше. */
  tfoot td small {
    white-space: nowrap;
  }

  .main {
    display: block;
    font-weight: 600;
  }

  /* Ступени шкалы — тон акцента поверх фона: светлее — меньше, насыщеннее — больше; в тёмной теме — так же от фона. */
  .cell[data-step],
  .swatch {
    background: color-mix(in oklab, var(--accent) var(--heat, 0%), var(--surface));
  }

  [data-step='0'] {
    --heat: 6%;
  }

  [data-step='1'] {
    --heat: 14%;
  }

  [data-step='2'] {
    --heat: 24%;
  }

  [data-step='3'] {
    --heat: 35%;
  }

  [data-step='4'] {
    --heat: 48%;
  }

  /* Неполная: курсив и штриховка поверх ступени, знак ◌ — у числа. */
  .cell.incomplete {
    background-image: repeating-linear-gradient(
      135deg,
      color-mix(in oklch, var(--text) 9%, transparent) 0 0.0625rem,
      transparent 0.0625rem 0.375rem
    );
  }

  .cell.incomplete .main {
    font-style: italic;
    font-weight: 500;
  }

  .partial {
    margin-right: 0.2rem;
    color: var(--muted);
    font-style: normal;
  }

  .approx {
    margin-right: 0.2rem;
    color: var(--warn-text);
    font-weight: 700;
  }

  .warn {
    color: var(--warn-text);
  }

  /* На насыщенных ступенях мелкие подписи и отметки — цветом текста: серый и янтарный теряют контраст (ниже 4.5:1). */
  .cell[data-step='2'] :is(small, .partial, .approx),
  .cell[data-step='3'] :is(small, .partial, .approx),
  .cell[data-step='4'] :is(small, .partial, .approx) {
    color: var(--text);
  }

  /* Мало данных — цветом текста, не прозрачностью; ступени бледнее (не больше 22 %): приглушённое число читается
     и на них, контраст не ниже 4.5:1 в обеих темах. */
  .low .month,
  .low td,
  .low td small,
  .low .cell[data-step] :is(small, .partial, .approx) {
    color: var(--muted);
  }

  .low .cell[data-step] {
    background-color: color-mix(
      in oklab,
      var(--accent) calc(var(--heat, 0%) * 0.45),
      var(--surface)
    );
  }

  .low .main {
    font-weight: 500;
  }

  tbody tr:hover .pinned {
    background: color-mix(in oklch, var(--surface), var(--sunken) 60%);
  }

  tfoot th,
  tfoot td {
    border-top: 0.125rem solid color-mix(in oklch, var(--line), var(--text) 12%);
    border-bottom: 0;
    background: var(--sunken);
  }

  tfoot .pinned {
    background: var(--sunken);
  }

  .under {
    display: grid;
    gap: 0.6rem;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
    align-items: center;
    margin: 0;
    font-size: 0.8125rem;
  }

  .legend-title {
    font-weight: 600;
  }

  .scale {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    color: var(--muted);
  }

  .swatch {
    width: 1.5rem;
    height: 0.875rem;
    border: 0.0625rem solid color-mix(in oklch, var(--line), var(--text) 10%);
    border-radius: var(--radius-s);
  }

  .notes {
    display: grid;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    color: var(--muted);
    font-size: 0.8125rem;
    list-style: none;
    text-wrap: pretty;
  }

  .notes .warn {
    color: var(--warn-text);
  }

  /* Узкий экран: закреплён только месяц, число клиентов уезжает вместе с ячейками. */
  @media (max-width: 34rem) {
    .cohorts {
      --month: 6.75rem;
    }

    .customers.pinned {
      position: static;
      box-shadow: none;
    }

    .month.pinned {
      box-shadow: var(--pinned-shadow, none);
    }
  }
</style>
