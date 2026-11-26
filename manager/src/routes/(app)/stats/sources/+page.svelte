<script lang="ts">
import { untrack } from 'svelte';
import {
  dayIn,
  filtersOf,
  periodPatch,
  reportSearch,
} from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { csvName } from '#lib/csv.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type { IntakeSummary, SetupView, SourcesReport } from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import CsvButton from '../CsvButton.svelte';
import DailyChart, { type ChartSeries } from '../DailyChart.svelte';
import { type QueryPatch, setQuery } from '../query.ts';
import ReportBar from '../ReportBar.svelte';
import StatsTabs from '../StatsTabs.svelte';
import AnswersTable from './AnswersTable.svelte';
import { type Level, sourcesCsv } from './export.ts';
import SourcesTable from './SourcesTable.svelte';

// «Источники» (ADR 0072): кто привёл новых людей и клиентов — график по дням и таблица по группе с итогом.
// Параметры отчёта — в адресе; ряд управления меняет их, отчёт перечитывается. Пока люди пересчитываются по
// новой настройке, экран так и пишет и обновляется сам.
let setup = $state<SetupView | null>(null);
let intake = $state<IntakeSummary | null>(null);
let report = $state<SourcesReport | null>(null);
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
const search = $derived(reportSearch(params));

const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<SourcesReport>(`/analytics/sources${wanted}`)
      .then((_) => void (wanted === search && (report = _)))
      .finally(() => (busy = false))
  ))(search)
);
$effect(() => void ((_: string) => untrack(() => loading.retry()))(search));

// Пересчёт людей идёт — отчёт сам обновляется раз в три секунды.
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
// Роль «оплата» видна по столбцу выручки: у источника возврата доли оплаты нет, а выручка есть.
const payment = $derived(
  report?.columns.some((_) => _.kind === 'revenue') ?? false
);
const life = $derived(
  report?.columns.some((_) => _.kind === 'ltvCustomer') ?? false
);
// Открытые уровни таблицы — для выгрузки CSV; новый отчёт — уровни заново.
const levels = $derived(((_: string) => new Map<string, Level>())(search));
const questions = $derived(
  setup
    ? setup.dictionaries
        .filter((_) => _.purpose === 'answers')
        .toSorted(
          (a, b) =>
            Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
            (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
        )
        .map((_) => _.code)
    : []
);

const addFilter = (patch: QueryPatch) => void setQuery(patch);

const _date = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

// Новые люди — линией, новые клиенты — столбиками; у источника возврата — одна линия вернувшихся.
const firstSeries: ChartSeries = {
  get line() {
    return t('sources.colPeople');
  },
  get bar() {
    return t('sources.colCustomers');
  },
  text: (_) =>
    `${tn('sources.peopleCount', _.line)}, ${tn('sources.customersCount', _.bar ?? 0)}`,
};
const returnSeries: ChartSeries = {
  get line() {
    return t('sources.colReturned');
  },
  bar: null,
  text: (_) => tn('sources.returnedCount', _.line),
};

const points = $derived(
  report === null
    ? []
    : report.attribution === 'first'
      ? report.daily.map((_) => ({
          day: _.day,
          line: _.people,
          bar: _.customers,
        }))
      : report.daily.map((_) => ({ day: _.day, line: _.returned, bar: null }))
);

const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
const ratesHref = `${resolve('/(app)/stats/spend')}?tab=rates`;
// «Расход не введён» ведёт в «Расходы» месяцев периода отчёта.
const spendHref = $derived(
  report
    ? `${resolve('/(app)/stats/spend')}?${new URLSearchParams({ from: report.from.slice(0, 7), to: report.to.slice(0, 7) })}`
    : resolve('/(app)/stats/spend')
);
// Новые клиенты строки — люди с первой оплатой в периоде отчёта, с фильтрами отчёта и путём строки.
const customersHref = $derived(
  report === null || report.attribution !== 'first'
    ? null
    : (path: QueryPatch) =>
        `${resolve('/(app)/stats/people')}?${new URLSearchParams([
          ['by', 'payment'],
          ['from', report?.from ?? ''],
          ['to', report?.to ?? ''],
          ...filters
            .filter((_) => !(_.key in path))
            .map((_): [string, string] => [_.key, _.value]),
          ...Object.entries(path).flatMap(({ 0: key, 1: value }) =>
            value === null ? [] : [[key, value] as [string, string]]
          ),
          ...(report?.test ? ([['test', '1']] as [string, string][]) : []),
        ])}`
);
const csvRows = () =>
  report && setup ? sourcesCsv(report, setup, levels) : [];
const setupHref = (tab: string) =>
  `${resolve('/(app)/stats/setup')}?tab=${tab}`;

// Почему пусто — как у «Людей»: приём выключен, событий нет, пересчёт, в периоде никого, фильтр никого не нашёл.
const empty = $derived(
  report === null || intake === null || report.rows.length > 0
    ? null
    : intake.lastAt === null
      ? intake.enabled
        ? 'noEvents'
        : 'off'
      : report.stale > 0
        ? 'stale'
        : filters.length > 0
          ? 'filtered'
          : report.attribution === 'return'
            ? 'noReturns'
            : 'period'
);

const resetFilters = () =>
  void setQuery(Object.fromEntries(filters.map((_) => [_.key, null])));
</script>

<svelte:head><title>{t('analytics.sources')} — {t('stats.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" aria-disabled={busy} onclick={() => loading.retry()}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<StatsTabs />

<LoadState load={base}>
  {#if setup && intake}
    <div class="page">
      <ReportBar mode="sources" {setup} {today} group={report?.group ?? null} {payment} {life} />

      {#if report && report.fees === 'net' && report.feeCoverage}
        <p class="notice plain">{t('sources.feeCoverage', { n: report.feeCoverage.withFee, total: report.feeCoverage.payments })}</p>
      {/if}
      {#if report && payment && report.baseCurrency === null}
        <p class="notice plain">
          <span>{t('sources.noBase')}</span>
          {#if editable}<a href={settingsHref}>{t('sources.setBase')}</a>{/if}
        </p>
      {/if}

      <!-- Схемы нет, а события уже идут — подсказка; пока событий нет, экран говорит о приёме, а не о схеме. -->
      {#if setup.schemas.length === 0 && intake.lastAt !== null}
        <p class="notice plain">
          <span>{t('sources.noSchema')}</span>
          {#if editable}<a href={setupHref('schemas')}>{t('sources.toSchemas')}</a>{/if}
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
            {:else if empty === 'period' || empty === 'noReturns'}
              <div class="none">
                <p>{t(empty === 'noReturns' ? 'sources.noReturns' : 'sources.nobodyNew', { from: _date(report.from), to: _date(report.to) })}{report.test ? '' : ` ${t('report.testHidden')}`}</p>
                <div class="actions">
                  <button type="button" onclick={() => setQuery(periodPatch({ kind: 'all' }))}>{t('report.showAllTime')}</button>
                  {#if !report.test}<button type="button" class="ghost" onclick={() => setQuery({ test: '1' })}>{t('people.showTest')}</button>{/if}
                </div>
              </div>
            {:else}
              <section class="card" aria-labelledby="sources-daily">
                <h2 id="sources-daily">{t(report.attribution === 'first' ? 'sources.chartTitle' : 'sources.chartReturnTitle')}</h2>
                <DailyChart days={points} label={t(report.attribution === 'first' ? 'sources.chartLabel' : 'sources.chartReturnLabel', { from: _date(report.from), to: _date(report.to) })} series={report.attribution === 'first' ? firstSeries : returnSeries} />
                <details class="table-view">
                  <summary>{t('stats.table')}</summary>
                  <div class="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('stats.day')}</th>
                          <th scope="col" class="count">{report.attribution === 'first' ? t('sources.colPeople') : t('sources.colReturned')}</th>
                          {#if report.attribution === 'first'}<th scope="col" class="count">{t('sources.colCustomers')}</th>{/if}
                        </tr>
                      </thead>
                      <tbody>
                        {#each points.toReversed() as day (day.day)}
                          <tr><td>{_date(day.day)}</td><td class="count">{number(day.line)}</td>{#if day.bar !== null}<td class="count">{number(day.bar)}</td>{/if}</tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>

              <section class="block" aria-labelledby="sources-table">
                <div class="title-row">
                  <h2 id="sources-table">{t(report.attribution === 'first' ? 'sources.tableTitle' : 'sources.tableReturnTitle')}</h2>
                  <CsvButton name={csvName('sources', report.from, report.to)} rows={csvRows} label={t(report.attribution === 'first' ? 'sources.tableTitle' : 'sources.tableReturnTitle')} />
                </div>
                <p class="help">{t(report.attribution === 'first' ? 'sources.tableHint' : 'sources.tableReturnHint')}</p>
                <SourcesTable {report} {setup} {params} {levels} {ratesHref} {spendHref} {customersHref} {editable} onfilter={addFilter} />
              </section>

              {#if questions.length > 0 && report.attribution === 'first' && !report.group.startsWith('answer:')}
                <AnswersTable {setup} {params} {questions} />
              {/if}
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

  .report {
    display: grid;
    gap: 1.5rem;
    min-width: 0;
    transition: opacity 150ms var(--ease);
  }

  /* Новые параметры грузятся — прежний отчёт на месте, приглушён: без скачков и пустого экрана. */
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

  .card {
    display: grid;
    gap: 0.75rem;
    align-content: start;
    min-width: 0;
    padding: 1rem 1.1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .card h2,
  .block h2 {
    margin: 0;
    font-size: 1rem;
  }

  .block {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
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

  .table-view summary {
    color: var(--muted);
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .scroll {
    position: relative;
    max-height: 20rem;
    margin-top: 0.5rem;
    overflow: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
  }

  th,
  td {
    padding: 0.5rem 0.75rem;
  }

  .count {
    width: 8rem;
    text-align: right;
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
