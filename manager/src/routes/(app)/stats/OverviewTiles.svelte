<script lang="ts">
import { untrack } from 'svelte';
import { percentChange } from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { amounts, money } from '#lib/money.ts';
import { can } from '#lib/session.svelte.ts';
import type {
  BaseSum,
  IntakeSummary,
  OverviewReport,
  OverviewTotals,
  VersionMark,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';
import Change from './Change.svelte';
import { overviewQueries } from './overview.ts';

// Ряд итогов «Обзора» (ADR 0072, «„Обзор“»): новые люди и клиенты, выручка до комиссии и под ней — после,
// действующий доступ, расход и CAC за период посещений, под каждым — изменение к прошлому периоду той же длины.
// Плитка — ссылка на свою вкладку. Только те итоги, что есть у сайта; до первых событий ряда нет совсем — экран
// остаётся прежними «Посещениями». Монтируется только с правом analytics.read.
let {
  search,
  shown = $bindable(false),
  versions = $bindable([]),
}: {
  /** Период посещений запросом: `?days=7` или `?from=…&to=…`. */
  search: string;
  /** Ряд показан: у сайта есть события аналитики. */
  shown?: boolean;
  /** Смены версий отправителей в периоде — отметками на графике посещений. */
  versions?: readonly VersionMark[];
} = $props();

let intake = $state<IntakeSummary | null>(null);
let report = $state<OverviewReport | null>(null);
let busy = $state(false);

// Приём — раз на экран: до первых событий итогов не запрашиваем вовсе.
const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    (intake
      ? Promise.resolve(intake)
      : api.get<IntakeSummary>('/analytics/intake')
    )
      .then(
        (summary) => (
          (intake = summary),
          summary.lastAt === null
            ? null
            : api.get<OverviewReport>(`/analytics/overview${wanted}`)
        )
      )
      .then((next) => void (wanted === search && (report = next)))
      .finally(() => (busy = false))
  ))(search)
);
$effect(() => void ((_: string) => untrack(() => loading.retry()))(search));

$effect(() => {
  const waiting = (report?.stale ?? 0) > 0;
  const timer = waiting ? setTimeout(() => void loading.retry(), 3000) : 0;
  return () => clearTimeout(timer);
});

const visible = $derived(intake !== null && intake.lastAt !== null);
$effect(() => {
  shown = visible;
});
$effect(() => {
  versions = report?.versions ?? [];
});

const editable = $derived(can('analytics.edit'));
const language = $derived(currentLanguage());

const _date = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(language, {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

const current = $derived(report?.current ?? null);
const previous = $derived(report?.previous ?? null);
const base = $derived(report?.baseCurrency ?? null);
const links = $derived(
  report
    ? ((queries) => ({
        sources: `${resolve('/(app)/stats/sources')}${queries.sources}`,
        cohorts: `${resolve('/(app)/stats/cohorts')}${queries.cohorts}`,
        spend: `${resolve('/(app)/stats/spend')}${queries.spend}`,
      }))(overviewQueries(search, report))
    : null
);

const inBase = (minor: number): string =>
  base === null ? '' : money(minor, base, language);

const unpricedText = (sum: BaseSum | null): string =>
  ((lines) =>
    lines.length === 0
      ? ''
      : t('sources.unpriced', { amounts: lines.join(', ') }))(
    amounts(sum?.unpriced ?? {}, language)
  );

// Выручка без базовой валюты сравнима, только если у обоих периодов одна и та же единственная валюта.
const revenueChange = (now: OverviewTotals, before: OverviewTotals) =>
  now.revenueBase !== null && before.revenueBase !== null
    ? percentChange(now.revenueBase.value, before.revenueBase.value)
    : ((a, b) =>
        a.length === 1 && b.length === 1 && a[0]![0] === b[0]![0]
          ? percentChange(a[0]![1], b[0]![1])
          : null)(
        Object.entries(now.revenue ?? {}),
        Object.entries(before.revenue ?? {})
      );

const spendShown = $derived(
  current !== null &&
    previous !== null &&
    (current.spend !== null || previous.spend !== null)
);
// Базовая валюта есть, а расходов за оба периода нет — просим внести: без них нет CAC.
const askSpend = $derived(
  current !== null &&
    previous !== null &&
    base !== null &&
    current.customers !== null &&
    current.spend === null &&
    previous.spend === null
);

const activeDay = $derived(
  report === null
    ? ''
    : ((asOf) => [report.to, asOf].toSorted()[0]!)(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: report.timeZone || undefined,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(Date.parse(report.asOf))
      )
);

const compared = $derived(
  report
    ? t('report.rangeText', {
        from: _date(report.compare.from),
        to: _date(report.compare.to),
      })
    : ''
);

const count = $derived(
  current === null
    ? 0
    : 1 +
        Number(current.customers !== null) +
        Number(current.revenue !== null) +
        Number(current.active !== null) +
        (spendShown ? 1 + Number(current.customers !== null) : 0)
);
const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
</script>

{#snippet approx(sum: BaseSum | null)}
  {#if sum?.staleRate}<span class="approx" title={t('sources.staleHint')}>≈<span class="sr-only">{t('sources.staleShort')}</span></span>{/if}
{/snippet}

{#if can('analytics.read')}
  <LoadState load={loading}>
    {#if visible && report && current && previous && links}
      <section class="overview" class:busy aria-labelledby="overview-title">
        <div class="head">
          <h2 id="overview-title">{t('analyticsOverview.title')}</h2>
          <p class="help">{t('analyticsOverview.compared', { range: compared })}</p>
        </div>

        {#if !intake?.enabled}
          <p class="notice"><span>{t('analyticsOverview.off')}</span> {#if editable}<a href={settingsHref}>{t('people.toSwitch')}</a>{/if}</p>
        {/if}
        {#if report.stale > 0}
          <p class="notice" role="status">{@html icons.refresh}<span>{tn('report.stale', report.stale)}</span></p>
        {/if}

        <ul class="tiles" style:--count={count} data-count={count}>
          <li>
            <a class="tile" href={links.sources} title={t('analyticsOverview.toSources')}>
              <span class="label">{t('analyticsOverview.people')}</span>
              <span class="value">{number(current.people)}</span>
              {#if percentChange(current.people, previous.people)}<Change change={percentChange(current.people, previous.people)!} title={compared} />{/if}
            </a>
          </li>
          {#if current.customers !== null}
            <li>
              <a class="tile" href={links.sources} title={t('analyticsOverview.toSources')}>
                <span class="label">{t('analyticsOverview.customers')}</span>
                <span class="value">{number(current.customers)}</span>
                {#if percentChange(current.customers, previous.customers)}<Change change={percentChange(current.customers, previous.customers)!} title={compared} />{/if}
              </a>
            </li>
          {/if}
          {#if current.revenue !== null}
            {@const change = revenueChange(current, previous)}
            <li>
              <a class="tile" href={links.sources} title={t('analyticsOverview.toSources')}>
                <span class="label">{t('analyticsOverview.revenue')}</span>
                {#if current.revenueBase !== null}
                  <span class="value">{@render approx(current.revenueBase)}{inBase(current.revenueBase.value)}</span>
                  {#if current.revenueNet !== null}<span class="line">{t('analyticsOverview.revenueNet', { amount: inBase(current.revenueNet.value) })}</span>{/if}
                  {#if unpricedText(current.revenueBase)}<span class="line warn" title={t('analyticsOverview.unpricedHint')}>{unpricedText(current.revenueBase)}</span>{/if}
                {:else if Object.keys(current.revenue).length === 0}
                  <span class="value">—</span>
                {:else}
                  {#each amounts(current.revenue, language) as line (line)}<span class="value small">{line}</span>{/each}
                {/if}
                {#if change}<Change {change} title={compared} />{/if}
              </a>
            </li>
          {/if}
          {#if current.active !== null}
            <li>
              <a class="tile" href={links.cohorts} title={t('analyticsOverview.toCohorts')}>
                <span class="label">{t('analyticsOverview.active')}</span>
                <span class="value">{number(current.active)}</span>
                <span class="line">{t('analyticsOverview.activeAt', { date: _date(activeDay) })}</span>
                {#if percentChange(current.active, previous.active)}<Change change={percentChange(current.active, previous.active)!} title={compared} />{/if}
              </a>
            </li>
          {/if}
          {#if spendShown}
            <li>
              <a class="tile" href={links.spend} title={t('analyticsOverview.toSpend')}>
                <span class="label">{t('analyticsOverview.spend')}</span>
                {#if current.spend}
                  <span class="value">{@render approx(current.spend)}{inBase(current.spend.value)}</span>
                  {#if unpricedText(current.spend)}<span class="line warn" title={t('analyticsOverview.unpricedHint')}>{unpricedText(current.spend)}</span>{/if}
                {:else}
                  <span class="value">—</span>
                  <span class="line">{t('analyticsOverview.noSpend')}</span>
                {/if}
                {#if percentChange(current.spend?.value, previous.spend?.value)}<Change change={percentChange(current.spend?.value, previous.spend?.value)!} neutral title={compared} />{/if}
              </a>
            </li>
            {#if current.customers !== null}
              <li>
                <a class="tile" href={links.sources} title={t('analyticsOverview.toSources')}>
                  <span class="label">{t('analyticsOverview.cac')}</span>
                  {#if current.cac !== null}
                    <span class="value">{inBase(current.cac)}</span>
                    {#if current.cac === 0}<span class="line">{t('sources.free')}</span>{/if}
                  {:else}
                    <span class="value">—</span>
                    {#if current.spend !== null && current.customers === 0}<span class="line">{t('sources.noCustomers')}</span>{/if}
                  {/if}
                  {#if percentChange(current.cac, previous.cac)}<Change change={percentChange(current.cac, previous.cac)!} lowerBetter title={compared} />{/if}
                </a>
              </li>
            {/if}
          {/if}
        </ul>

        {#if base === null && current.revenue !== null}
          <p class="notice plain">
            <span>{t('analyticsOverview.noBase')}</span>
            {#if editable}<a href={settingsHref}>{t('sources.setBase')}</a>{/if}
          </p>
        {:else if askSpend}
          <p class="note">{t('analyticsOverview.askSpend')} <a href={links.spend}>{t('sources.toSpend')}</a></p>
        {/if}
      </section>
    {/if}
  </LoadState>
{/if}

<style>
  .overview {
    display: grid;
    gap: 0.75rem;
    transition: opacity 150ms var(--ease);
  }

  .overview.busy {
    opacity: 0.6;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    align-items: baseline;
  }

  .head h2 {
    margin: 0;
    font-size: 1rem;
  }

  .head .help {
    margin: 0;
    font-size: 0.8125rem;
  }

  /* Все итоги — одним рядом, если плитке хватает места; уже — по три и по два, последняя плитка без пары тянется на
     весь ряд. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(var(--count, 6), minmax(0, 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    display: grid;
    gap: 0.2rem;
    align-content: start;
    height: 100%;
    padding: 0.9rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition: border-color 150ms var(--ease);
  }

  .tile:hover {
    border-color: color-mix(in oklch, var(--accent) 45%, var(--line));
  }

  .label {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .value {
    font-size: 1.5rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    overflow-wrap: break-word;
  }

  .value.small {
    font-size: 1.125rem;
  }

  .line {
    color: var(--muted);
    font-size: 0.8125rem;
    overflow-wrap: break-word;
  }

  .line.warn,
  .approx {
    color: var(--warn-text);
  }

  .approx {
    margin-right: 0.2rem;
    font-weight: 700;
    cursor: help;
  }

  .tile :global(.change) {
    margin-top: 0.15rem;
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

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  @container (width < 68rem) {
    .tiles {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .tiles li:last-child:nth-child(3n + 1) {
      grid-column: 1 / -1;
    }

    .tiles li:last-child:nth-child(3n + 2) {
      grid-column: span 2;
    }

    /* Четыре итога — два ровных ряда по два. */
    .tiles[data-count='4'] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tiles[data-count='4'] li:last-child {
      grid-column: auto;
    }
  }

  @container (width < 48rem) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tiles li:last-child:nth-child(3n + 1),
    .tiles li:last-child:nth-child(3n + 2) {
      grid-column: auto;
    }

    .tiles li:last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }
  }
</style>
