<script lang="ts">
import {
  filtersOf,
  lowDataOf,
  type QueryParams,
} from '#lib/analytics-reports.ts';
import { currentLanguage, t } from '#lib/i18n.ts';
import { amounts, money as moneyText } from '#lib/money.ts';
import type {
  BaseSum,
  ReturnRow,
  SetupView,
  SourcesReport,
  SourcesRow,
} from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { groupName } from '../names.ts';
import type { QueryPatch } from '../query.ts';
import { columnDefinition, columnKey, columnName } from './columns.ts';
import type { Levels } from './export.ts';
import SourcesCells from './SourcesCells.svelte';
import SourcesRows from './SourcesRows.svelte';

// Таблица «Источников»: итог «Всего» первой строкой, при сравнении под ним — «было» с итогом прошлого периода,
// строки по группе, столбцы — те, что есть у сайта (`columns` ответа). Под таблицей — что значит каждый столбец.
// Открытые уровни строк записываются в `levels`: их берёт выгрузка CSV.
let {
  report,
  setup,
  params,
  levels,
  ratesHref,
  spendHref,
  customersHref,
  editable,
  onfilter,
}: {
  report: SourcesReport;
  setup: SetupView;
  params: QueryParams;
  levels: Levels;
  ratesHref: string;
  spendHref: string;
  customersHref: ((path: QueryPatch) => string) | null;
  /** Право analytics.edit: «Введите расходы» ведёт в «Расходы». */
  editable: boolean;
  onfilter: (patch: QueryPatch) => void;
} = $props();

const columns = $derived(report.columns);
const rows = $derived(report.rows as readonly (SourcesRow | ReturnRow)[]);
const total = $derived(report.total as SourcesRow | ReturnRow);
const lowKey = (row: SourcesRow | ReturnRow) =>
  row.lowData.people && row.lowData.customers
    ? 'report.lowData'
    : row.lowData.people
      ? 'report.lowPeople'
      : row.lowData.customers
        ? 'report.lowCustomers'
        : null;
const totalLow = $derived(lowKey(total));
const filters = $derived(filtersOf(params).length);
const anyLow = $derived(
  [total, ...rows].some((_) => _.lowData.people || _.lowData.customers)
);
const money = $derived(
  columns.some((_) =>
    ['ltvCustomer', 'ltvPerson', 'cac', 'ltvCac', 'payback'].includes(_.kind)
  )
);

const _date = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

// Суммы отчёта в базовой валюте: по ним — заметки «без курса» и «≈» под таблицей.
const sums = $derived(
  [total, ...rows].flatMap((row): (BaseSum | null | undefined)[] => [
    row.revenueBase,
    ...('people' in row
      ? [row.spend, row.ltvCustomer?.revenue, row.ltvPerson?.revenue]
      : []),
  ])
);
const unpriced = $derived(
  [
    ...new Set(
      [...sums, report.spend?.unassigned, report.spend?.broader].flatMap((_) =>
        Object.keys(_?.unpriced ?? {})
      )
    ),
  ].toSorted()
);
// Сколько без курса в итогах: выручка и расход итога.
const unpricedTotal = $derived(
  amounts(
    [total.revenueBase, 'people' in total ? total.spend : null].reduce<
      Record<string, number>
    >(
      (all, sum) =>
        Object.entries(sum?.unpriced ?? {}).reduce(
          (inner, { 0: currency, 1: value }) => ({
            ...inner,
            [currency]: (inner[currency] ?? 0) + value,
          }),
          all
        ),
      {}
    ),
    currentLanguage()
  )
);
const stale = $derived(sums.some((_) => _?.staleRate === true));
const inBase = (sum: BaseSum): string =>
  report.baseCurrency === null
    ? ''
    : [
        moneyText(sum.value, report.baseCurrency, currentLanguage()),
        ...amounts(sum.unpriced, currentLanguage()),
      ].join(' + ');

const spend = $derived(report.spend);
// Расход есть у сайта, но столбцов денег нет — нечего и писать; столбцов нет совсем — просим ввести расход.
const askSpend = $derived(
  report.baseCurrency !== null &&
    report.spend === null &&
    report.attribution === 'first' &&
    columns.some((_) => _.kind === 'revenue')
);

// Таблица шире рамки: у правого края — тень «есть ещё столбцы», у закреплённой колонки при прокрутке — тень.
let scroller = $state<HTMLElement>();
let edges = $state({ left: false, right: false });
const measure = () =>
  void (
    scroller &&
    (edges = {
      left: scroller.scrollLeft > 1,
      right:
        scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
    })
  );
$effect(() => {
  const observer = new ResizeObserver(measure);
  void (
    scroller &&
    (observer.observe(scroller),
    scroller.firstElementChild && observer.observe(scroller.firstElementChild))
  );
  void report;
  measure();
  return () => observer.disconnect();
});

const compared = $derived(
  report.compare
    ? t('sources.comparedTo', {
        range: t('report.rangeText', {
          from: _date(report.compare.from),
          to: _date(report.compare.to),
        }),
      })
    : ''
);
</script>

<div class="wrap" class:more={edges.right} class:scrolled={edges.left}>
  <div class="scroll frame" bind:this={scroller} onscroll={measure}>
    <table class="sources-table">
      <thead>
        <tr>
          <th scope="col" class="value">{groupName(setup, report.group)}</th>
          {#each columns as column (columnKey(column))}
            <th scope="col" class="num" class:money={['revenue', 'ltvCustomer', 'ltvPerson', 'spend', 'cac', 'costPerPerson'].includes(column.kind)} title={columnDefinition(report, column)}>{columnName(report, column)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        <tr class="total" class:compared={report.compare !== null}>
          <th scope="row" class="value">
            <div class="head">
              <span class="spacer" aria-hidden="true"></span>
              <div class="name"><strong>{t('sources.total')}</strong>{#if totalLow}<Mark>{t(totalLow)}</Mark>{/if}</div>
            </div>
          </th>
          <SourcesCells row={total} {columns} base={report.baseCurrency} before={report.compare?.total ?? null} {compared} {ratesHref} {spendHref} customersHref={customersHref?.({}) ?? ''} />
        </tr>
        {#if report.compare}
          <tr class="was">
            <th scope="row" class="value">
              <div class="head">
                <span class="spacer" aria-hidden="true"></span>
                <div class="name"><span>{t('sources.was')}</span><small>{t('report.rangeText', { from: _date(report.compare.from), to: _date(report.compare.to) })}</small></div>
              </div>
            </th>
            <SourcesCells row={report.compare.total} {columns} base={report.baseCurrency} was />
          </tr>
        {/if}
        {#key `${report.group}|${params}`}
          <SourcesRows {rows} group={report.group} {columns} {setup} {params} {filters} {levels} base={report.baseCurrency} {ratesHref} {spendHref} {customersHref} {onfilter} />
        {/key}
      </tbody>
    </table>
  </div>
</div>

{#if spend || askSpend || unpriced.length > 0 || stale}
  <ul class="notes">
    {#if unpriced.length > 0}
      <li class="warn">{t('sources.noRate', { currencies: unpriced.join(', '), amounts: unpricedTotal.join(', ') || '—' })} <a href={ratesHref}>{t('sources.toRates')}</a></li>
    {/if}
    {#if stale}<li><span class="approx" aria-hidden="true">≈</span> {t('sources.staleNote')} <a href={ratesHref}>{t('sources.toRates')}</a></li>{/if}
    {#if spend}
      {#if spend.scope === 'total' && spend.reason === 'group'}<li>{t('sources.spendGroup')}</li>{/if}
      {#if spend.scope === 'none' && spend.reason === 'filter'}<li>{t('sources.spendFilter')}</li>{/if}
      {#if spend.scope === 'none' && spend.reason === 'return'}<li>{t('sources.spendReturn')}</li>{/if}
      {#if spend.unassigned}<li>{t('sources.spendUnassigned', { part: groupName(setup, report.group), amount: inBase(spend.unassigned) })}</li>{/if}
      {#if spend.broader}<li>{t('sources.spendBroader', { amount: inBase(spend.broader) })}</li>{/if}
      {#if spend.prorated && spend.scope !== 'none'}<li>{t('sources.spendProrated')}</li>{/if}
    {:else if askSpend}
      <li>{t('sources.askSpend')} {#if editable}<a href={spendHref}>{t('sources.toSpend')}</a>{/if}</li>
    {/if}
  </ul>
{/if}

<details class="definitions">
  <summary>{t('sources.definitions')}</summary>
  <dl>
    {#each columns as column (columnKey(column))}
      <div><dt>{columnName(report, column)}</dt><dd>{columnDefinition(report, column)}</dd></div>
    {/each}
    {#if money}<div><dt>{t('sources.defMoneyLowTitle')}</dt><dd>{t('sources.defMoneyLow', { people: lowDataOf(report).people, customers: lowDataOf(report).customers })}</dd></div>{/if}
    {#if report.baseCurrency !== null}<div><dt>≈</dt><dd>{t('sources.defStale')}</dd></div>{/if}
    {#if report.compare}<div><dt>{t('sources.was')}</dt><dd>{t('sources.defCompare')}</dd></div>{/if}
    {#if anyLow}<div><dt>{t('report.lowData')}</dt><dd>{t('sources.defLowData', { people: lowDataOf(report).people, customers: lowDataOf(report).customers })}</dd></div>{/if}
  </dl>
</details>

<style>
  /* Таблица шире экрана прокручивается в своей рамке; первая колонка закреплена. */
  .wrap {
    position: relative;
    min-width: 0;
  }

  .scroll {
    position: relative;
    overflow-x: auto;
  }

  /* Справа есть ещё столбцы — тень у края рамки; прокрутили — тень у закреплённой колонки. */
  .wrap.more::after {
    content: '';
    position: absolute;
    top: 0.0625rem;
    right: 0.0625rem;
    bottom: 0.0625rem;
    width: 2rem;
    border-radius: 0 var(--radius-l) var(--radius-l) 0;
    background: linear-gradient(
      to right,
      transparent,
      color-mix(in oklch, var(--text) 9%, transparent)
    );
    pointer-events: none;
  }

  .wrap.scrolled :global(.sources-table .value) {
    box-shadow: 0.5rem 0 0.5rem -0.5rem
      color-mix(in oklch, var(--text) 30%, transparent);
  }

  table {
    min-width: 40rem;
  }

  th {
    padding: 0.55rem 0.6rem;
    vertical-align: bottom;
  }

  thead th {
    min-width: 5.5rem;
    line-height: 1.3;
  }

  /* Столбцы денег шире: «12 345,67 €» и «и 20,00 CHF без курса» не жмутся. */
  thead th.money {
    min-width: 6.75rem;
  }

  thead .num {
    text-align: right;
  }

  thead .value {
    position: sticky;
    left: 0;
    z-index: 2;
    min-width: 12rem;
    padding-left: 2.25rem;
    text-align: left;
  }

  .total th,
  .total :global(td),
  .was th,
  .was :global(td) {
    border-bottom: 0.125rem solid color-mix(in oklch, var(--line), var(--text) 12%);
  }

  /* При сравнении итог и «было» — одна пара: линия под парой. */
  .total.compared th,
  .total.compared :global(td) {
    border-bottom: 0.0625rem dashed var(--line);
  }

  .total .value,
  .was .value {
    vertical-align: top;
    position: sticky;
    left: 0;
    z-index: 1;
    padding-left: 0.5rem;
    background: var(--surface);
    color: var(--text);
    font-size: 0.875rem;
    text-align: left;
  }

  .was .value,
  .was :global(td),
  .was :global(td .open) {
    background: color-mix(in oklch, var(--surface), var(--sunken) 55%);
    color: var(--muted);
  }

  .was .name {
    display: grid;
    gap: 0.1rem;
    font-weight: 500;
  }

  .was .name small {
    font-size: 0.75rem;
    font-weight: 400;
  }

  .head {
    display: flex;
    gap: 0.25rem;
    align-items: flex-start;
  }

  .spacer {
    flex: none;
    width: 1.5rem;
  }

  .name {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.45rem;
    align-items: baseline;
    padding-top: 0.1rem;
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

  .approx {
    color: var(--warn-text);
    font-weight: 700;
  }

  .definitions summary {
    color: var(--muted);
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .definitions dl {
    display: grid;
    gap: 0.4rem;
    margin: 0.6rem 0 0;
  }

  .definitions div {
    display: grid;
    grid-template-columns: minmax(8rem, 13rem) minmax(0, 1fr);
    gap: 0.75rem;
    font-size: 0.8125rem;
  }

  .definitions dt {
    font-weight: 600;
  }

  .definitions dd {
    margin: 0;
    color: var(--muted);
    text-wrap: pretty;
  }

  @media (max-width: 34rem) {
    thead .value {
      min-width: 9.5rem;
    }

    .definitions div {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.1rem;
    }
  }
</style>
