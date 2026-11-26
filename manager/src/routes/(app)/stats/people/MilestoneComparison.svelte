<script lang="ts">
import { untrack } from 'svelte';
import {
  dayIn,
  filtersOf,
  lowDataOf,
  periodPatch,
  reportSearch,
  shareRate,
} from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { csvName } from '#lib/csv.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import type {
  IntakeSummary,
  MilestoneComparison,
  SetupView,
  Share,
} from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import CsvButton from '../CsvButton.svelte';
import Mark from '../Mark.svelte';
import { setQuery } from '../query.ts';
import ReportBar from '../ReportBar.svelte';
import ScrollTable from '../ScrollTable.svelte';
import {
  type MilestoneRow,
  milestonePeople,
  milestonesCsv,
  paidDifference,
} from './milestones.ts';

// «Люди → Сравнение вех» (ADR 0072, «Сравнение вех»): у новых людей периода по каждой вехе — сколько достигли, не
// достигли и ещё в окне, и какая доля оплатила в каждой группе. Так видно, какая веха лучше предсказывает оплату.
// «Достигли» и «не достигли» ведут в список людей — с теми же людьми, что в числе.
let {
  setup,
  intake,
  editable,
}: { setup: SetupView; intake: IntakeSummary; editable: boolean } = $props();

let report = $state<MilestoneComparison | null>(null);
let busy = $state(false);

const params = $derived(page.url.searchParams);
const search = $derived(
  reportSearch(params, {
    attribution: null,
    group: null,
    life: null,
    fees: null,
    compare: null,
    basis: null,
    metric: null,
  })
);
const milestones = $derived(
  setup.milestones.filter((_) => _.archivedAt === null)
);

const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<MilestoneComparison>(`/analytics/milestones${wanted}`)
      .then((_) => void (wanted === search && (report = _)))
      .finally(() => (busy = false))
  ))(search)
);
$effect(
  () =>
    void ((_: string, ready: boolean) =>
      ready && untrack(() => loading.retry()))(search, milestones.length > 0)
);

$effect(() => {
  const waiting = (report?.stale ?? 0) > 0;
  const timer = waiting ? setTimeout(() => void loading.retry(), 3000) : 0;
  return () => clearTimeout(timer);
});

const today = $derived(
  report ? dayIn(report.asOf, report.timeZone) : dayIn(Date.now(), '')
);
const filters = $derived(filtersOf(params));
const payment = $derived(setup.types.some((_) => _.role === 'payment'));
const paid = $derived(
  report?.milestones.some((_) => _.paidReached !== null) ?? false
);

const _percent = (rate: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    style: 'percent',
    maximumFractionDigits: rate > 0 && rate < 0.1 ? 1 : 0,
  }).format(rate);

const _points = (value: number): string =>
  t('report.changePoints', {
    value: `${value > 0 ? '+' : value < 0 ? '−' : ''}${new Intl.NumberFormat(
      currentLanguage(),
      { maximumFractionDigits: 1 }
    ).format(Math.abs(value))}`,
  });

const peopleHref = (code: string, reached: boolean) =>
  report
    ? `${resolve('/(app)/stats/people')}?${milestonePeople(code, reached, report)}`
    : '';

const windowText = $derived(
  report === null
    ? ''
    : report.window === 0
      ? t('milestoneComparison.introNoLimit')
      : t('milestoneComparison.intro', { days: report.window })
);

const setupHref = `${resolve('/(app)/stats/setup')}?tab=milestones`;
const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;

const empty = $derived(
  report === null || report.people > 0
    ? null
    : intake.lastAt === null
      ? intake.enabled
        ? 'noEvents'
        : 'off'
      : report.stale > 0
        ? 'stale'
        : filters.length > 0
          ? 'filtered'
          : 'period'
);

const resetFilters = () =>
  void setQuery(Object.fromEntries(filters.map((_) => [_.key, null])));

const csvRows = () => (report ? milestonesCsv(report) : []);
const anyLow = $derived(report?.milestones.some((_) => _.lowData) ?? false);
const anyOpen = $derived(report?.milestones.some((_) => _.open > 0) ?? false);
</script>

{#snippet share(value: Share | null)}
  <td class="num share">
    {#if value}
      {@const rate = shareRate(value)}
      <span class="main">{rate === null ? '—' : _percent(rate)}</span>
      {#if value.base > 0}<small>{t('report.ofBase', { count: number(value.count), base: number(value.base) })}</small>{/if}
      {#if value.open > 0}<small class="open">{t('report.inWindow', { n: number(value.open) })}</small>{/if}
    {:else}
      <span class="muted">—</span>
    {/if}
  </td>
{/snippet}

{#snippet count(row: MilestoneRow, value: number, reached: boolean)}
  <td class="num count">
    {#if value > 0}<a href={peopleHref(row.code, reached)} title={t(reached ? 'milestoneComparison.reachedLink' : 'milestoneComparison.missedLink', { name: row.name })}>{number(value)}</a>{:else}{number(0)}{/if}
  </td>
{/snippet}

{#if milestones.length === 0}
  {#snippet noneActions()}
    {#if editable}<a class="button primary" href={setupHref}>{t('milestoneComparison.toSetup')}</a>{/if}
  {/snippet}
  <EdgeState kind="missing" heading="h2" title={t('milestoneComparison.noneTitle')} text={t(editable ? 'milestoneComparison.noneText' : 'milestoneComparison.noneTextReader')} actions={noneActions} />
{:else}
  <div class="milestones">
    <ReportBar mode="milestones" {setup} {today} {payment} />

    {#if !payment}<p class="notice plain">{t('milestoneComparison.noPayment')}</p>{/if}
    {#if !intake.enabled && intake.lastAt !== null}
      <p class="notice"><span>{t('people.offWithData')}</span> {#if editable}<a href={settingsHref}>{t('people.toSwitch')}</a>{/if}</p>
    {/if}
    {#if report && report.stale > 0}
      <p class="notice" role="status">{@html icons.refresh}<span>{tn('report.stale', report.stale)}</span></p>
    {/if}

    <LoadState load={loading}>
      {#if report}
        <div class="report" class:busy>
          {#if empty === 'off'}
            <EdgeState kind="missing" heading="h2" title={t('people.offTitle')} text={t(editable ? 'people.offText' : 'people.offTextReader')} />
          {:else if empty === 'noEvents'}
            <EdgeState kind="missing" heading="h2" title={t('people.noEventsTitle')} text={t('people.noEventsText')} />
          {:else if empty === 'stale'}
            <EdgeState kind="missing" heading="h2" title={t('people.staleTitle')} text={t('people.staleText')} />
          {:else if empty === 'filtered'}
            <div class="none">
              <p>{t('report.nobodyFiltered')}</p>
              <button type="button" onclick={resetFilters}>{t('report.resetFilters')}</button>
            </div>
          {:else if empty === 'period'}
            <div class="none">
              <p>{t('milestoneComparison.nobody')}{report.test ? '' : ` ${t('report.testHidden')}`}</p>
              <div class="actions">
                <button type="button" onclick={() => setQuery(periodPatch({ kind: 'all' }))}>{t('report.showAllTime')}</button>
                {#if !report.test}<button type="button" class="ghost" onclick={() => setQuery({ test: '1' })}>{t('people.showTest')}</button>{/if}
              </div>
            </div>
          {:else}
            <section class="block" aria-labelledby="milestones-table">
              <div class="title-row">
                <h2 id="milestones-table">{t('milestoneComparison.tableTitle')}</h2>
                <CsvButton name={csvName('milestones', report.from, report.to)} rows={csvRows} label={t('milestoneComparison.tableTitle')} />
              </div>
              <p class="help">{tn('milestoneComparison.people', report.people)}{paid ? ` ${windowText}` : ''}</p>
              <ScrollTable label={t('milestoneComparison.tableTitle')}>
                <table class="milestones-table">
                  <thead>
                    <tr>
                      <th scope="col" class="name pinned">{t('milestoneComparison.colMilestone')}</th>
                      <th scope="col" class="num">{t('milestoneComparison.colReached')}</th>
                      <th scope="col" class="num">{t('milestoneComparison.colMissed')}</th>
                      <th scope="col" class="num" title={t('milestoneComparison.openHint')}>{t('milestoneComparison.colOpen')}</th>
                      {#if paid}
                        <th scope="col" class="num">{t('milestoneComparison.colPaidReached')}</th>
                        <th scope="col" class="num">{t('milestoneComparison.colPaidMissed')}</th>
                        <th scope="col" class="num" title={t('milestoneComparison.diffHint')}>{t('milestoneComparison.colDifference')}</th>
                      {/if}
                    </tr>
                  </thead>
                  <tbody>
                    {#each report.milestones as row (row.code)}
                      {@const difference = paidDifference(row)}
                      <tr class:low={row.lowData}>
                        <th scope="row" class="name pinned">
                          <span class="title">{row.name}</span>
                          {#if row.lowData}<Mark title={t('milestoneComparison.lowHint', { n: lowDataOf(report).people })}>{t('report.lowData')}</Mark>{/if}
                        </th>
                        {@render count(row, row.reached, true)}
                        {@render count(row, row.missed, false)}
                        <td class="num">{number(row.open)}</td>
                        {#if paid}
                          {@render share(row.paidReached)}
                          {@render share(row.paidMissed)}
                          <td class="num difference">{difference === null ? '—' : _points(difference)}</td>
                        {/if}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </ScrollTable>
              <ul class="notes">
                {#if paid}<li>{t('milestoneComparison.paidNote')}</li>{/if}
                {#if anyOpen}<li>{t('milestoneComparison.openHint')}</li>{/if}
                {#if anyLow}<li>{t('milestoneComparison.lowNote', { n: lowDataOf(report).people })}</li>{/if}
              </ul>
            </section>
          {/if}
        </div>
      {/if}
    </LoadState>
  </div>
{/if}

<style>
  .milestones {
    display: grid;
    gap: 1.25rem;
    container-type: inline-size;
    min-width: 0;
    max-width: 72rem;
  }

  .report {
    display: grid;
    gap: 1rem;
    min-width: 0;
    transition: opacity 150ms var(--ease);
  }

  .report.busy {
    opacity: 0.6;
  }

  .notice {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    align-items: center;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .notice.plain {
    border-color: var(--line);
    background: var(--sunken);
  }

  .notice :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
  }

  .block {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .block h2 {
    margin: 0;
    font-size: 1rem;
  }

  .block .help {
    max-width: 52rem;
    margin: 0;
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
  }

  th,
  td {
    padding: 0.55rem 0.6rem;
  }

  thead th {
    min-width: 6.5rem;
    vertical-align: bottom;
    line-height: 1.3;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .pinned {
    position: sticky;
    left: 0;
    z-index: 1;
    box-shadow: var(--pinned-shadow, none);
    background: var(--surface);
  }

  thead .pinned {
    z-index: 2;
    background: var(--sunken);
  }

  .name {
    min-width: 11rem;
    max-width: 16rem;
    text-align: left;
  }

  tbody .name {
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 600;
    vertical-align: top;
  }

  .name .title {
    display: block;
    margin-bottom: 0.2rem;
    overflow-wrap: break-word;
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

  .count {
    font-weight: 600;
  }

  .open {
    color: color-mix(in oklch, var(--accent) 70%, var(--text));
  }

  .difference {
    font-weight: 600;
  }

  /* Мало данных — цветом текста, не прозрачностью. */
  .low .name,
  .low td,
  .low td small,
  .low .open {
    color: var(--muted);
  }

  .low .main,
  .low .count,
  .low .difference {
    font-weight: 500;
  }

  tbody tr:last-child th {
    border-bottom: 0;
  }

  tbody tr:hover .pinned {
    background: color-mix(in oklch, var(--surface), var(--sunken) 60%);
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

  .none {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.25rem 0;
  }

  .none p {
    max-width: 40rem;
    margin: 0;
    color: var(--muted);
  }

  .none .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  @container (width < 34rem) {
    .name {
      min-width: 8.5rem;
    }
  }
</style>
