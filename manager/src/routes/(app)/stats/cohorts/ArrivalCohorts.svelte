<script lang="ts">
import { lowDataOf, shareRate } from '#lib/analytics-reports.ts';
import { currentLanguage, number, t } from '#lib/i18n.ts';
import type { ArrivalCohortRow, Share, SourcesColumn } from '#lib/types.ts';
import { resolve } from '$app/paths';
import Mark from '../Mark.svelte';
import ScrollTable from '../ScrollTable.svelte';
import { columnKey } from '../sources/columns.ts';
import {
  type ArrivalCohorts,
  arrivalColumnName,
  arrivalShare,
  arrivalShares,
  cohortPeople,
  monthShort,
} from './cohorts.ts';

// Когорты по приходу (ADR 0072, «Когорты»): строка — месяц прихода и его новые люди, столбцы — доли пути по
// правилам «Источников» («2 из 3», «+1 в окне») и клиенты на сегодня. Доля неполная, если в ней есть «ещё в окне»
// или месяц ещё идёт: знак ◌ и слова для читалки. Внизу — среднее по полным ячейкам.
let {
  report,
  today,
  title,
}: {
  report: ArrivalCohorts;
  today: string;
  title: string;
} = $props();

const shares = $derived(arrivalShares(report.columns));
const customers = $derived(report.columns.some((_) => _.kind === 'customers'));

const _percent = (rate: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    style: 'percent',
    maximumFractionDigits: rate > 0 && rate < 0.1 ? 1 : 0,
  }).format(rate);

const peopleHref = (row: ArrivalCohortRow): string =>
  `${resolve('/(app)/stats/people')}?${cohortPeople(row.month, 'arrival', report, today)}`;

const anyOpen = $derived(report.rows.some((_) => _.open));
const anyLow = $derived(report.rows.some((_) => _.lowData));
</script>

{#snippet share(row: ArrivalCohortRow, column: SourcesColumn, average: boolean)}
  {@const value = arrivalShare(row, column)}
  {@const partial = !average && value !== null && (value.open > 0 || row.open)}
  <td class="num share" class:incomplete={partial} title={partial ? t('cohorts.shareIncompleteHint') : undefined}>
    {#if value}
      {@render rate(value, partial)}
      {#if value.base > 0}<small>{t('report.ofBase', { count: number(value.count), base: number(value.base) })}</small>{/if}
      {#if value.open > 0}<small class="open">{t('report.inWindow', { n: number(value.open) })}</small>{/if}
      {#if partial}<span class="sr-only">{t('cohorts.incomplete')}</span>{/if}
    {:else}
      <span class="muted">—</span>
    {/if}
  </td>
{/snippet}

{#snippet rate(value: Share, partial: boolean)}
  {@const found = shareRate(value)}
  <span class="main">{#if partial}<span class="partial" aria-hidden="true">◌</span>{/if}{found === null ? '—' : _percent(found)}</span>
{/snippet}

<div class="cohorts">
  <ScrollTable label={title}>
    <table class="arrival-table">
      <thead>
        <tr>
          <th scope="col" class="month pinned">{t('cohorts.colMonth')}</th>
          <th scope="col" class="num people pinned">{arrivalColumnName({ kind: 'people' })}</th>
          {#each shares as column (columnKey(column))}<th scope="col" class="num">{arrivalColumnName(column)}</th>{/each}
          {#if customers}<th scope="col" class="num">{t('cohorts.colCustomersToday')}</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each report.rows as row (row.month)}
          <tr class:low={row.lowData}>
            <th scope="row" class="month pinned">
              <span class="name">{monthShort(row.month, currentLanguage())}</span>
              {#if row.open}<Mark tone="accent" title={t('cohorts.openHintArrival')}>{t('cohorts.open')}</Mark>{/if}
              {#if row.lowData && row.people > 0}<Mark title={t('cohorts.lowHintArrival', { n: lowDataOf(report).people })}>{t('report.lowData')}</Mark>{/if}
            </th>
            <td class="num people pinned">
              {#if row.people > 0}<a href={peopleHref(row)} title={t('cohorts.arrivalLink')}>{number(row.people)}</a>{:else}{number(0)}{/if}
            </td>
            {#each shares as column (columnKey(column))}{@render share(row, column, false)}{/each}
            {#if customers}<td class="num">{row.customers === null ? '—' : number(row.customers)}</td>{/if}
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" class="month pinned">{t('cohorts.average')}</th>
          <td class="num people pinned">{number(report.average.people)}</td>
          {#each shares as column (columnKey(column))}{@render share(report.average, column, true)}{/each}
          {#if customers}<td class="num">{report.average.customers === null ? '—' : number(report.average.customers)}</td>{/if}
        </tr>
      </tfoot>
    </table>
  </ScrollTable>

  <ul class="notes">
    <li>{t('cohorts.arrivalAverageNote')}</li>
    {#if anyOpen}<li>{t('cohorts.arrivalOpenNote')}</li>{/if}
    {#if anyLow}<li>{t('cohorts.lowNoteArrival', { n: lowDataOf(report).people })}</li>{/if}
  </ul>
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
    min-width: 6rem;
    vertical-align: bottom;
    line-height: 1.3;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

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

  .people {
    left: var(--month);
  }

  .people.pinned {
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
  }

  .main {
    display: block;
    font-weight: 600;
  }

  .open {
    color: color-mix(in oklch, var(--accent) 70%, var(--text));
  }

  .share.incomplete {
    background-image: repeating-linear-gradient(
      135deg,
      color-mix(in oklch, var(--text) 9%, transparent) 0 0.0625rem,
      transparent 0.0625rem 0.375rem
    );
  }

  .share.incomplete .main {
    font-style: italic;
    font-weight: 500;
  }

  .partial {
    margin-right: 0.2rem;
    color: var(--muted);
    font-style: normal;
  }

  .low .month,
  .low td,
  .low td small,
  .low .open {
    color: var(--muted);
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

  @media (max-width: 34rem) {
    .cohorts {
      --month: 6.75rem;
    }

    .people.pinned {
      position: static;
      box-shadow: none;
    }

    .month.pinned {
      box-shadow: var(--pinned-shadow, none);
    }
  }
</style>
