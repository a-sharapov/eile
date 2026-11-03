<script lang="ts">
import { untrack } from 'svelte';
import { api } from '#lib/api.ts';
import { currentLanguage, type MessageKey, number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type { GoalSlice, StatsReport } from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import DailyChart from './DailyChart.svelte';
import RankedList from './RankedList.svelte';

// Период — 7, 30 или 90 дней до сегодня или свои даты; ссылкой можно открыть любой: ?days=7, ?from=…&to=….
type Period =
  | { readonly days: number }
  | { readonly from: string; readonly to: string };

const _PRESETS: readonly { days: number; label: MessageKey }[] = [
  { days: 7, label: 'stats.days7' },
  { days: 30, label: 'stats.days30' },
  { days: 90, label: 'stats.days90' },
];

const _initial = (params: { get: (name: string) => string | null }): Period =>
  params.get('from') && params.get('to')
    ? { from: params.get('from')!, to: params.get('to')! }
    : { days: Number(params.get('days')) || 30 };

const _start = _initial(page.url.searchParams);
let period = $state<Period>(_start);
let custom = $state('from' in _start);
let range = $state({
  from: 'from' in _start ? _start.from : '',
  to: 'to' in _start ? _start.to : '',
});
let report = $state<StatsReport | null>(null);
let busy = $state(false);

const queryOf = (_: Period): string =>
  'days' in _
    ? `?days=${_.days}`
    : `?from=${encodeURIComponent(_.from)}&to=${encodeURIComponent(_.to)}`;

const loading = defineLoad(
  () => (
    (busy = true),
    api
      .get<StatsReport>(`/stats${queryOf(period)}`)
      .then((_) => (report = _))
      .finally(() => (busy = false))
  )
);
// Сменился период — отчёт заново; прежний остаётся на месте приглушённым, пока идёт новый.
$effect(
  () => void ((_: string) => untrack(() => loading.retry()))(queryOf(period))
);

const choose = (days: number) => ((custom = false), (period = { days }));

const applyRange = (event: SubmitEvent) => (
  event.preventDefault(),
  void (
    range.from &&
    range.to &&
    (period = (({ 0: from, 1: to }) => ({ from: from!, to: to! }))(
      [range.from, range.to].toSorted()
    ))
  )
);

const admin = $derived(session.user?.role === 'admin');
const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;

const _percent = (value: number, digits = 1): string =>
  new Intl.NumberFormat(currentLanguage(), {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(value);

const _date = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

// Сравнение с тем же сроком перед периодом — только когда там что-то было.
const deltaOf = (current: number, previous: number) =>
  previous > 0
    ? ((change) => ({
        up: change >= 0,
        text: `${change >= 0 ? '+' : '−'}${_percent(Math.abs(change), 0)}`,
      }))((current - previous) / previous)
    : null;

const perVisitor = $derived(
  report && report.totals.visitors > 0
    ? new Intl.NumberFormat(currentLanguage(), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      }).format(report.totals.views / report.totals.visitors)
    : '—'
);

const tiles = $derived(
  report
    ? [
        {
          label: t('stats.visitors'),
          value: number(report.totals.visitors),
          delta: deltaOf(report.totals.visitors, report.previous.visitors),
        },
        {
          label: t('stats.views'),
          value: number(report.totals.views),
          delta: deltaOf(report.totals.views, report.previous.views),
        },
        { label: t('stats.perVisitor'), value: perVisitor, delta: null },
      ]
    : []
);

const _DEVICES: Readonly<Record<string, MessageKey>> = {
  desktop: 'stats.deviceDesktop',
  mobile: 'stats.deviceMobile',
  tablet: 'stats.deviceTablet',
};

const sourceLabel = (value: string): string => value || t('stats.direct');
const deviceLabel = (value: string): string =>
  _DEVICES[value] ? t(_DEVICES[value]!) : value;

type SourceTab = 'sources' | 'referrers' | 'utmMediums' | 'utmCampaigns';
const _SOURCE_TABS: readonly { id: SourceTab; label: MessageKey }[] = [
  { id: 'sources', label: 'stats.allSources' },
  { id: 'referrers', label: 'stats.referrers' },
  { id: 'utmMediums', label: 'stats.mediums' },
  { id: 'utmCampaigns', label: 'stats.campaigns' },
];
let sourceTab = $state<SourceTab>('sources');

type LanguageTab = 'languages' | 'browserLanguages';
const _LANGUAGE_TABS: readonly { id: LanguageTab; label: MessageKey }[] = [
  { id: 'languages', label: 'stats.pageLanguages' },
  { id: 'browserLanguages', label: 'stats.browserLanguages' },
];
let languageTab = $state<LanguageTab>('languages');

const empty = $derived(report !== null && report.since === null);
const firstDay = $derived(
  report !== null && report.since !== null && report.since === report.today
);
const partial = $derived(
  report !== null &&
    report.since !== null &&
    report.since > report.from &&
    report.since !== report.today
);
</script>

<svelte:head><title>{t('stats.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  {#if admin}
    <a class="button ghost" href={settingsHref}>{@html icons.settings}{t('stats.settings')}</a>
  {/if}
  <button type="button" class="button" aria-disabled={busy} onclick={() => loading.retry()}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

{#snippet segments(items: readonly { id: string; label: MessageKey }[], current: string, pick: (id: string) => void, label: string)}
  <div class="segments" role="group" aria-label={label}>
    {#each items as item (item.id)}
      <button type="button" aria-pressed={current === item.id} onclick={() => pick(item.id)}>{t(item.label)}</button>
    {/each}
  </div>
{/snippet}

{#snippet slices(rows: readonly GoalSlice[], head: string, label: (value: string) => string, code: boolean)}
  {#if rows.length === 0}
    <p class="muted none">{t('stats.none')}</p>
  {:else}
    <table class="slices">
      <thead>
        <tr><th>{head}</th><th class="count">{t('stats.reached')}</th><th class="count">{t('stats.base')}</th><th class="count">{t('stats.rate')}</th></tr>
      </thead>
      <tbody>
        {#each rows as row (row.value)}
          <tr>
            <td><span class="name" class:code title={label(row.value)}>{label(row.value)}</span></td>
            <td class="count">{number(row.visitors)}</td>
            <td class="count">{number(row.base)}</td>
            <td class="count">{_percent(row.rate)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />

<div class="page">
  <!-- Период — одной строкой над всем, что от него зависит. -->
  <div class="filters">
    <div class="segments" role="group" aria-label={t('stats.period')}>
      {#each _PRESETS as preset (preset.days)}
        <button type="button" aria-pressed={!custom && 'days' in period && period.days === preset.days} onclick={() => choose(preset.days)}>{t(preset.label)}</button>
      {/each}
      <button type="button" aria-pressed={custom} onclick={() => (custom = true)}>{t('stats.custom')}</button>
    </div>
    {#if custom}
      <form class="range" onsubmit={applyRange}>
        <label>{t('stats.from')}<input type="date" required bind:value={range.from} max={report?.today} /></label>
        <label>{t('stats.to')}<input type="date" required bind:value={range.to} max={report?.today} /></label>
        <button class="button">{t('stats.show')}</button>
      </form>
    {/if}
  </div>

  <LoadState load={loading}>
    {#if report}
      <div class="report" class:busy>
        {#if empty}
          {#snippet offActions()}
            {#if admin}<a class="button primary" href={settingsHref}>{t('stats.settings')}</a>{/if}
          {/snippet}
          <EdgeState kind="missing" heading="h2" title={t(report.enabled ? 'stats.emptyTitle' : 'stats.offTitle')} text={report.enabled ? t('stats.emptyText') : `${t('stats.offText')}${admin ? '' : ` ${t('stats.offEditor')}`}`} actions={report.enabled ? undefined : offActions} />
        {:else}
          {#if !report.enabled}<p class="notice">{t('stats.offWithData')}</p>{/if}
          {#if firstDay}<p class="notice">{t('stats.firstDay')}</p>{/if}
          {#if partial}<p class="muted since">{t('stats.since', { date: _date(report.since!) })}</p>{/if}

          <dl class="tiles">
            {#each tiles as tile (tile.label)}
              <div>
                <dt>{tile.label}</dt>
                <dd>{tile.value}</dd>
                {#if tile.delta}
                  <dd class="delta" class:up={tile.delta.up}>{@html tile.delta.up ? icons.arrowUp : icons.arrowDown}{t('stats.delta', { delta: tile.delta.text })}</dd>
                {/if}
              </div>
            {/each}
          </dl>
          <p class="help hint">{t('stats.visitorsHint')}</p>

          <section class="card" aria-labelledby="stats-daily">
            <h2 id="stats-daily">{t('stats.chartTitle')}</h2>
            <DailyChart days={report.daily} label={t('stats.chartLabel', { from: _date(report.from), to: _date(report.to) })} />
            <details class="table-view">
              <summary>{t('stats.table')}</summary>
              <div class="scroll">
                <table>
                  <thead><tr><th>{t('stats.day')}</th><th class="count">{t('stats.visitors')}</th><th class="count">{t('stats.views')}</th></tr></thead>
                  <tbody>
                    {#each report.daily.toReversed() as day (day.day)}
                      <tr><td>{_date(day.day)}</td><td class="count">{number(day.visitors)}</td><td class="count">{number(day.views)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div class="cards">
            <section class="card" aria-labelledby="stats-pages">
              <h2 id="stats-pages">{t('stats.pages')}</h2>
              <RankedList rows={report.pages} measure="views" head={t('stats.page')} code />
            </section>
            <section class="card" aria-labelledby="stats-sources">
              <h2 id="stats-sources">{t('stats.sources')}</h2>
              {@render segments(_SOURCE_TABS, sourceTab, (id) => (sourceTab = id as SourceTab), t('stats.sources'))}
              <RankedList rows={report[sourceTab]} measure="visitors" head={t('stats.source')} label={sourceTab === 'sources' ? sourceLabel : undefined} />
              <p class="help">{t('stats.sourcesHint')}</p>
            </section>
            <section class="card" aria-labelledby="stats-entries">
              <h2 id="stats-entries">{t('stats.entries')}</h2>
              <RankedList rows={report.entries} measure="visitors" head={t('stats.page')} code />
              <p class="help">{t('stats.entriesHint')}</p>
            </section>
            <section class="card" aria-labelledby="stats-devices">
              <h2 id="stats-devices">{t('stats.devices')}</h2>
              <RankedList rows={report.devices} measure="visitors" head={t('stats.devices')} label={deviceLabel} />
              <h3>{t('stats.languages')}</h3>
              {@render segments(_LANGUAGE_TABS, languageTab, (id) => (languageTab = id as LanguageTab), t('stats.languages'))}
              <RankedList rows={report[languageTab]} measure={languageTab === 'languages' ? 'views' : 'visitors'} head={t('stats.languages')} code />
            </section>
          </div>

          <section class="card goals" aria-labelledby="stats-goals">
            <h2 id="stats-goals">{t('stats.goals')}</h2>
            <p class="help">{t('stats.goalsHint')}</p>
            {#if report.goals.length === 0}
              <p class="muted none">{t('stats.goalsEmpty')}</p>
            {:else}
              {#each report.goals as goal (goal.goal)}
                <article class="goal">
                  <header>
                    <span class="kind">{t(goal.kind === 'form' ? 'stats.goalForm' : 'stats.goalLink')}</span>
                    <h3 class:code={goal.kind === 'link'}>{goal.label}</h3>
                  </header>
                  <dl class="goal-facts">
                    <div><dt>{t('stats.conversions')}</dt><dd>{number(goal.visitors)}</dd></div>
                    <div><dt>{t('stats.rate')}</dt><dd>{_percent(goal.rate)}</dd></div>
                    <div><dt>{t('stats.events')}</dt><dd>{number(goal.events)}</dd></div>
                  </dl>
                  <div class="goal-slices">
                    <div>
                      <h4>{t('stats.bySource')}</h4>
                      {@render slices(goal.sources, t('stats.source'), sourceLabel, false)}
                    </div>
                    <div>
                      <h4>{t('stats.byEntry')}</h4>
                      {@render slices(goal.entries, t('stats.page'), (_) => _, true)}
                    </div>
                  </div>
                </article>
              {/each}
            {/if}
          </section>
        {/if}
      </div>
    {/if}
  </LoadState>
</div>

<style>
  .page {
    display: grid;
    gap: 1.25rem;
    container-type: inline-size;
    max-width: 72rem;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: flex-end;
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

  .range {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .range label {
    font-size: 0.8125rem;
  }

  .report {
    display: grid;
    gap: 1.25rem;
    transition: opacity 150ms var(--ease);
  }

  /* Новый период грузится — прежний отчёт на месте, приглушён: без скачков и пустого экрана. */
  .report.busy {
    opacity: 0.6;
  }

  .notice {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .since,
  .hint {
    margin: 0;
    font-size: 0.8125rem;
  }

  .hint {
    margin-top: -0.5rem;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }

  .tiles > div {
    display: grid;
    gap: 0.25rem;
    align-content: start;
    padding: 0.9rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .tiles dt {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .tiles dd {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 650;
    line-height: 1.15;
    letter-spacing: -0.02em;
  }

  .tiles .delta {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    color: var(--danger);
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: 0;
  }

  .tiles .delta.up {
    color: var(--ok);
  }

  .tiles .delta :global(svg) {
    width: 0.875rem;
    height: 0.875rem;
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

  .card h2 {
    margin: 0;
    font-size: 1rem;
  }

  .card h3 {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
  }

  .card .help {
    margin: 0;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }

  @container (width < 48rem) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .table-view summary {
    color: var(--muted);
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .scroll {
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
    width: 6.5rem;
    text-align: right;
  }

  .none {
    margin: 0;
    font-size: 0.875rem;
  }

  .goal {
    display: grid;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 0.0625rem solid var(--line);
  }

  .goal header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
  }

  .goal h3 {
    margin: 0;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }

  .code {
    font-family: var(--mono);
    font-size: 0.8125rem;
  }

  .kind {
    padding: 0.1rem 0.45rem;
    border-radius: var(--radius-s);
    background: var(--sunken);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .goal-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 2rem;
    margin: 0;
  }

  .goal-facts dt {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .goal-facts dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 650;
  }

  .goal-slices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }

  @container (width < 48rem) {
    .goal-slices {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .goal-slices h4 {
    margin: 0 0 0.4rem;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .slices {
    table-layout: fixed;
  }

  .slices .count {
    width: 5.5rem;
  }

  .name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
