<script lang="ts">
import { untrack } from 'svelte';
import {
  COHORT_DAYS,
  COHORT_PRESETS,
  dayIn,
  filtersOf,
  metricOf,
  periodPatch,
  reportSearch,
} from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { csvName } from '#lib/csv.ts';
import { t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type {
  CohortMetric,
  CohortsReport,
  IntakeSummary,
  SetupView,
} from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import CsvButton from '../CsvButton.svelte';
import { setQuery } from '../query.ts';
import ReportBar from '../ReportBar.svelte';
import StatsTabs from '../StatsTabs.svelte';
import ArrivalCohorts from './ArrivalCohorts.svelte';
import CohortsTable from './CohortsTable.svelte';
import { arrivalCohortsCsv, metricName, paymentCohortsCsv } from './cohorts.ts';

// «Когорты» (ADR 0072, «Когорты»): по первой оплате — клиенты месяца и их выручка или доступ по месяцам жизни, по
// приходу — новые люди месяца и доли пути. Вид, показатель, комиссия, период и фильтры — в адресе
// (`?basis=arrival&metric=…`); период — месяцами: строки — все месяцы, которых он касается.
let setup = $state<SetupView | null>(null);
let intake = $state<IntakeSummary | null>(null);
let report = $state<CohortsReport | null>(null);
let busy = $state(false);

const base = defineLoad(() =>
  Promise.all([
    api.get<SetupView>('/analytics/setup'),
    api.get<IntakeSummary>('/analytics/intake'),
  ]).then(
    ({ 0: next, 1: summary }) => void ((setup = next), (intake = summary))
  )
);
$effect(() => void base.retry());

const params = $derived(page.url.searchParams);
// Когорты по первой оплате — только с ролью «оплата»: без неё сервер отказал бы, вид — по приходу.
const payment = $derived(
  setup?.types.some((_) => _.role === 'payment') ?? false
);
const search = $derived(
  reportSearch(params, {
    attribution: null,
    group: null,
    window: null,
    life: null,
    compare: null,
    basis: payment ? params.get('basis') : 'arrival',
  })
);

const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<CohortsReport>(`/analytics/cohorts${wanted}`)
      .then((_) => void (wanted === search && (report = _)))
      .finally(() => (busy = false))
  ))(search)
);
$effect(
  () =>
    void ((_: string, ready: boolean) =>
      ready && untrack(() => loading.retry()))(search, setup !== null)
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
const editable = $derived(can('analytics.edit'));
const basis = $derived(
  report?.basis ??
    (payment && params.get('basis') !== 'arrival' ? 'payment' : 'arrival')
);
const metric = $derived(
  report?.basis === 'payment' ? report.metric : metricOf(params)
);
const paid = $derived(report?.basis === 'payment' ? report : null);
const arrived = $derived(report?.basis === 'arrival' ? report : null);

const pickBasis = (next: 'payment' | 'arrival') =>
  void (
    next !== basis &&
    setQuery({ basis: next === 'arrival' ? 'arrival' : null, metric: null })
  );
const pickMetric = (next: string) =>
  void setQuery({ metric: next === 'cumulative' ? null : next });

const _HINTS: Readonly<
  Record<
    CohortMetric,
    'cohorts.hintCumulative' | 'cohorts.hintMonthly' | 'cohorts.hintActive'
  >
> = {
  cumulative: 'cohorts.hintCumulative',
  monthly: 'cohorts.hintMonthly',
  active: 'cohorts.hintActive',
};

const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
const setupHref = (tab: string) =>
  `${resolve('/(app)/stats/setup')}?tab=${tab}`;

// Деньги когорт без базовой валюты не считаются: экран просит её задать (показатель «доступ» считается и так).
const noBase = $derived(
  paid !== null && paid.metric !== 'active' && paid.baseCurrency === null
);

// Почему пусто: приём выключен, событий нет, пересчёт, под фильтры никто не подошёл, в эти месяцы никого.
const empty = $derived(
  report === null || intake === null
    ? null
    : (
          report.basis === 'payment'
            ? report.rows.some((_) => _.customers > 0)
            : report.rows.some((_) => _.people > 0)
        )
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

const title = $derived(
  t(basis === 'arrival' ? 'cohorts.arrivalTitle' : 'cohorts.tableTitle')
);
const csvRows = () =>
  report === null
    ? []
    : report.basis === 'payment'
      ? paymentCohortsCsv(report)
      : arrivalCohortsCsv(report);
const fileName = $derived(
  report === null
    ? ''
    : csvName(
        report.basis === 'payment'
          ? `cohorts-${report.metric}`
          : 'cohorts-arrival',
        report.from,
        report.to
      )
);
</script>

<svelte:head><title>{t('analytics.cohorts')} — {t('stats.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" aria-disabled={busy} onclick={() => loading.retry()}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<StatsTabs />

<LoadState load={base}>
  {#if setup && intake}
    <div class="page">
      <div class="pick">
        <div class="segments" role="group" aria-label={t('cohorts.basis')}>
          <button type="button" aria-pressed={basis === 'payment'} aria-disabled={!payment} title={payment ? undefined : t('cohorts.noPaymentRole')} onclick={() => payment && pickBasis('payment')}>{t('cohorts.byPayment')}</button>
          <button type="button" aria-pressed={basis === 'arrival'} onclick={() => pickBasis('arrival')}>{t('cohorts.byArrival')}</button>
        </div>
        {#if paid}
          <label>
            <span>{t('cohorts.metric')}</span>
            <select value={metric} onchange={(e) => pickMetric(e.currentTarget.value)}>
              {#each paid.metrics as item (item)}<option value={item}>{metricName(item)}</option>{/each}
            </select>
          </label>
        {/if}
      </div>

      <ReportBar mode="cohorts" {setup} {today} payment={payment && basis === 'payment' && metric !== 'active'} presets={COHORT_PRESETS} fallback={COHORT_DAYS} />
      <p class="help period-note">{t('cohorts.periodHint')}</p>

      {#if !payment && intake.lastAt !== null}<p class="notice plain">{t('cohorts.noPaymentRole')}</p>{/if}
      {#if noBase}
        <p class="notice plain">
          <span>{t('cohorts.noBase')}</span>
          {#if editable}<a href={settingsHref}>{t('sources.setBase')}</a>{/if}
        </p>
      {/if}
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
              {#snippet offActions()}
                {#if editable}<a class="button primary" href={settingsHref}>{t('people.turnOn')}</a>{/if}
              {/snippet}
              <EdgeState kind="missing" heading="h2" title={t('people.offTitle')} text={t(editable ? 'people.offText' : 'people.offTextReader')} actions={offActions} />
            {:else if empty === 'noEvents'}
              {#snippet noEventsActions()}
                {#if editable}<a class="button primary" href={setupHref('senders')}>{t('people.toSenders')}</a>{/if}
              {/snippet}
              <EdgeState kind="missing" heading="h2" title={t('people.noEventsTitle')} text={t('people.noEventsText')} actions={noEventsActions} />
            {:else if empty === 'stale'}
              <EdgeState kind="missing" heading="h2" title={t('people.staleTitle')} text={t('people.staleText')} />
            {:else if empty === 'filtered'}
              <div class="none">
                <p>{t('report.nobodyFiltered')}</p>
                <button type="button" onclick={resetFilters}>{t('report.resetFilters')}</button>
              </div>
            {:else if empty === 'period'}
              <div class="none">
                <p>{t(report.basis === 'payment' ? 'cohorts.empty' : 'cohorts.emptyArrival')}{report.test ? '' : ` ${t('report.testHidden')}`}</p>
                <div class="actions">
                  <button type="button" onclick={() => setQuery(periodPatch({ kind: 'all' }, COHORT_DAYS))}>{t('report.showAllTime')}</button>
                  {#if !report.test}<button type="button" class="ghost" onclick={() => setQuery({ test: '1' })}>{t('people.showTest')}</button>{/if}
                </div>
              </div>
            {:else}
              <section class="block" aria-labelledby="cohorts-table">
                <div class="title-row">
                  <h2 id="cohorts-table">{title}</h2>
                  <CsvButton name={fileName} rows={csvRows} label={title} />
                </div>
                {#if paid}
                  <p class="help">{t(_HINTS[paid.metric])}{paid.metric === 'active' ? '' : ` ${t(paid.fees === 'net' ? 'cohorts.feesNet' : 'cohorts.feesGross')}`}</p>
                  <CohortsTable report={paid} {today} {title} />
                {:else if arrived}
                  <p class="help">{t('cohorts.arrivalHint')}</p>
                  <ArrivalCohorts report={arrived} {today} {title} />
                {/if}
              </section>
            {/if}
          </div>
        {/if}
      </LoadState>
    </div>
  {/if}
</LoadState>

<style>
  .page {
    display: grid;
    gap: 1.25rem;
    container-type: inline-size;
    min-width: 0;
    max-width: 80rem;
  }

  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: flex-end;
  }

  .pick label {
    display: grid;
    flex: 0 1 20rem;
    gap: 0.25rem;
    min-width: 0;
  }

  .pick label > span {
    font-size: 0.8125rem;
  }

  .segments {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .segments button {
    min-height: 2rem;
    padding: 0 0.75rem;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
  }

  .segments button[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--surface);
    box-shadow: var(--shadow-s);
    color: var(--text);
    font-weight: 600;
  }

  .segments button[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 1;
    color: color-mix(in oklch, var(--muted) 70%, var(--surface));
  }

  .period-note {
    margin: -0.75rem 0 0;
    font-size: 0.75rem;
  }

  .report {
    display: grid;
    gap: 1.5rem;
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
</style>
