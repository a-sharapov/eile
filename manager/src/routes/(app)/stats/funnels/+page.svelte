<script lang="ts">
import { untrack } from 'svelte';
import {
  dayIn,
  filtersOf,
  lowDataOf,
  percentChange,
  rateOf,
  reportSearch,
} from '#lib/analytics-reports.ts';
import { api, isApiError } from '#lib/api.ts';
import { csvName } from '#lib/csv.ts';
import { currentLanguage, number, quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { amounts, money } from '#lib/money.ts';
import { can, session } from '#lib/session.svelte.ts';
import type {
  BaseSum,
  FunnelReport,
  FunnelStepReport,
  IntakeSummary,
  SetupView,
  StepMoney,
} from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import Change from '../Change.svelte';
import CsvButton from '../CsvButton.svelte';
import Mark from '../Mark.svelte';
import { stepName } from '../names.ts';
import { setQuery } from '../query.ts';
import ReportBar from '../ReportBar.svelte';
import StatsTabs from '../StatsTabs.svelte';
import { funnelCsv } from './export.ts';

// «Воронки» (ADR 0072): шаги-посещения из сводок статистики, ниже границы — шаги-люди из событий за те же дни и
// тот же источник. Доли — от предыдущего шага и от первого своей стороны; через границу долей нет. Шаг-человек
// ведёт в «Люди»: кто дошёл и кто остановился перед ним. Деньги шагов оплаты — по валютам и одной цифрой в
// базовой валюте, всегда до комиссии; при сравнении у шага — «было» и изменение.
let setup = $state<SetupView | null>(null);
let intake = $state<IntakeSummary | null>(null);
let report = $state<FunnelReport | null>(null);
let missing = $state(false);
let busy = $state(false);
let view = $state<'numbers' | 'rates'>('numbers');

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
const wantedFunnel = $derived(params.get('funnel') ?? '');
const search = $derived(
  reportSearch(params, {
    funnel: wantedFunnel || null,
    group: null,
    window: null,
    life: null,
    fees: null,
  })
);
const hasFunnels = $derived((setup?.funnels.length ?? 0) > 0);

const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<FunnelReport>(`/analytics/funnel${wanted}`)
      .then(
        (_) => void (wanted === search && ((report = _), (missing = false))),
        // Воронки с таким кодом нет (удалили, опечатка в адресе) — так и говорим, а не «не загрузилось».
        (error) =>
          isApiError(error) && error.code === 'analytics.funnel_not_found'
            ? void ((missing = true), (report = null))
            : Promise.reject(error)
      )
      .finally(() => (busy = false))
  ))(search)
);

$effect(
  () =>
    void ((_: string, ready: boolean) =>
      ready && untrack(() => loading.retry()))(search, hasFunnels)
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
const admin = $derived(session.user?.role === 'admin');

// Основная воронка — первой, затем по порядку; в архиве — в конце.
const funnels = $derived(
  (setup?.funnels ?? []).toSorted(
    (a, b) =>
      Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
      Number(b.main) - Number(a.main) ||
      a.position - b.position ||
      (a.code < b.code ? -1 : 1)
  )
);

type Step = FunnelStepReport & {
  /** Номер шага с нуля среди всех шагов: его ждёт список людей. */
  readonly index: number;
  readonly previous: number | null;
  readonly first: number | null;
  readonly max: number;
};

const sideOf = (side: 'visits' | 'people'): Step[] =>
  ((steps) =>
    ((max) =>
      steps.map((step, n) => ({
        ...step,
        previous: n === 0 ? null : steps[n - 1]!.count,
        first: n === 0 ? null : steps[0]!.count,
        max,
      })))(Math.max(1, ...steps.map((_) => _.count ?? 0))))(
    (report?.steps ?? [])
      .map((step, index) => ({ ...step, index }))
      .filter((_) => _.side === side)
  );

const visits = $derived(sideOf('visits'));
const people = $derived(sideOf('people'));

const _percent = (rate: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    style: 'percent',
    maximumFractionDigits: rate > 0 && rate < 0.1 ? 1 : 0,
  }).format(rate);

const _date = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

const shareText = (count: number | null, base: number | null): string =>
  ((rate) =>
    rate === null || count === null || base === null
      ? '—'
      : t('funnel.share', {
          rate: _percent(rate),
          count: number(count),
          base: number(base),
        }))(rateOf(count, base));

// Люди шага — тот же период днями отчёта, те же фильтры и тестовые: список совпадает с числом шага.
const peopleHref = (index: number, stage: 'reached' | 'stopped'): string =>
  `${resolve('/(app)/stats/people')}?${new URLSearchParams([
    ['funnel', report?.funnel.code ?? ''],
    ['step', String(index)],
    ['stage', stage],
    ['from', report?.from ?? ''],
    ['to', report?.to ?? ''],
    ...filters.map((_): [string, string] => [_.key, _.value]),
    ...(report?.test ? ([['test', '1']] as [string, string][]) : []),
  ])}`;

const partFilter = $derived(filters.some((_) => _.key.startsWith('part.')));
// Разрез источника у посещений — с выпуска этапа 2: раньше фильтр по части даёт шагам-посещениям ноль.
const sinceNote = $derived(
  report === null || visits.length === 0 || !partFilter
    ? null
    : report.visitsSince === null
      ? t('funnel.noOrigins')
      : report.visitsSince > report.from
        ? t('funnel.originsSince', { date: _date(report.visitsSince) })
        : null
);

// Шаги-люди все по нулям — говорим почему, как «Люди».
const peopleEmpty = $derived(
  report === null ||
    intake === null ||
    people.length === 0 ||
    people.some((_) => (_.count ?? 0) > 0)
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

const _EMPTY_TEXT = {
  off: 'funnel.emptyOff',
  noEvents: 'funnel.emptyNoEvents',
  stale: 'funnel.emptyStale',
  filtered: 'funnel.emptyFiltered',
  period: 'funnel.emptyPeriod',
} as const;

const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
const funnelsHref = `${resolve('/(app)/stats/setup')}?tab=funnels`;
const ratesHref = `${resolve('/(app)/stats/spend')}?tab=rates`;

const inBase = (minor: number): string =>
  report?.baseCurrency
    ? money(minor, report.baseCurrency, currentLanguage())
    : '';

const unpricedText = (sum: BaseSum): string =>
  ((lines) =>
    lines.length === 0
      ? ''
      : t('sources.unpriced', { amounts: lines.join(', ') }))(
    amounts(sum.unpriced, currentLanguage())
  );

// По валютам — только если есть валюта, кроме базовой: иначе строка повторила бы цифру базовой валюты.
const otherCurrencies = (step: StepMoney): boolean =>
  report?.baseCurrency === null ||
  Object.keys(step.amounts).some((_) => _ !== report?.baseCurrency);

const compared = $derived(
  report?.compare
    ? t('report.rangeText', {
        from: _date(report.compare.from),
        to: _date(report.compare.to),
      })
    : ''
);
const csvRows = () => (report && setup ? funnelCsv(report, setup) : []);
</script>

<svelte:head><title>{t('analytics.funnels')} — {t('stats.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" aria-disabled={busy} onclick={() => loading.retry()}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

{#snippet stepItem(step: Step)}
  {@const width = step.count === null ? 0 : Math.round((step.count / step.max) * 1000) / 10}
  <li class="step" class:low={step.lowData}>
    <div class="title">
      <span class="no" aria-hidden="true">{step.index + 1}</span>
      <h3>{setup ? stepName(setup, step.step) : ''}</h3>
      {#if step.unfiltered}<Mark tone="warn" title={t('funnel.unfilteredHint')}>{t('funnel.unfiltered')}</Mark>{/if}
      {#if step.lowData}<Mark title={t('funnel.lowDataHint', { n: lowDataOf(report).people })}>{t('report.lowData')}</Mark>{/if}
    </div>
    <div class="track" aria-hidden="true">{#if step.count !== null && step.count > 0}<span class="fill" class:people={step.side === 'people'} style:width={`${width}%`}></span>{/if}</div>
    <div class="figures">
      {#if step.count === null}
        <span class="off">{t('funnel.visitsOff')}{#if admin}{' '}<a href={settingsHref}>{t('funnel.visitsOn')}</a>{/if}</span>
      {:else}
        {#if view === 'numbers'}
          <strong class="main">{number(step.count)}</strong>
        {:else}
          <!-- Доли: главное число — доля от первого шага своей стороны, у первого — 100 %. -->
          <strong class="main">{((rate) => (rate === null ? '—' : _percent(rate)))(step.first === null ? rateOf(step.count, step.count) : rateOf(step.count, step.first))}</strong>
          <span class="muted">{number(step.count)}</span>
        {/if}
        <!-- Доля — только от ненулевого шага: «от предыдущего —» у пустой воронки ничего не говорит. -->
        {#if (step.previous ?? 0) > 0}<span class="rate"><span class="muted">{t('funnel.ofPrevious')}</span> {shareText(step.count, step.previous)}</span>{/if}
        {#if step.previous !== null && (step.first ?? 0) > 0}<span class="rate"><span class="muted">{t('funnel.ofFirst')}</span> {shareText(step.count, step.first)}</span>{/if}
      {/if}
      {#if step.skipped > 0}<span class="extra">{t('funnel.skipped', { n: number(step.skipped) })}</span>{/if}
      {#if step.open > 0}<span class="extra open">{t('funnel.open', { n: number(step.open) })}</span>{/if}
      {#if step.money}
        <span class="money">
          {#if step.money.base && report?.baseCurrency}
            <span class="base">{#if step.money.base.staleRate}<span class="approx" title={t('sources.staleHint')}>≈<span class="sr-only">{t('sources.staleShort')}</span></span>{/if}{t('funnel.moneyBase', { amount: inBase(step.money.base.value), each: step.money.perPersonBase === null ? '—' : inBase(step.money.perPersonBase) })}</span>
            {#if Object.keys(step.money.base.unpriced).length > 0}<a class="warn" href={ratesHref}>{unpricedText(step.money.base)}</a>{/if}
          {/if}
          {#if otherCurrencies(step.money)}
            {#each amounts(step.money.amounts, currentLanguage()) as line, n (line)}
              <span class:muted={report?.baseCurrency !== null}>{t('funnel.money', { amount: line, each: amounts(step.money.perPerson, currentLanguage())[n] ?? '' })}</span>
            {/each}
          {/if}
        </span>
      {/if}
      {#if report?.compare && report.compare.steps[step.index]}
        {@const was = report.compare.steps[step.index]!}
        {@const countChange = percentChange(step.count, was.count)}
        <span class="was">
          <span>{t('funnel.was', { n: was.count === null ? '—' : number(was.count) })}</span>
          {#if countChange}<Change change={countChange} title={compared} inline />{/if}
          {#if was.money?.base && step.money?.base && report.baseCurrency}
            {@const moneyChange = percentChange(step.money.base.value, was.money.base.value)}
            <span>{t('funnel.wasMoney', { amount: inBase(was.money.base.value) })}</span>
            {#if moneyChange}<Change change={moneyChange} title={compared} inline />{/if}
          {/if}
        </span>
      {/if}
      {#if step.side === 'people' && peopleEmpty === null}
        <span class="links">
          <a href={peopleHref(step.index, 'reached')}>{t('funnel.reachedPeople')}</a>
          <a href={peopleHref(step.index, 'stopped')}>{t('funnel.stoppedPeople')}</a>
        </span>
      {/if}
    </div>
  </li>
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<StatsTabs />

<LoadState load={base}>
  {#if setup && intake}
    {#if !hasFunnels}
      {#snippet noFunnelActions()}
        {#if editable}<a class="button primary" href={funnelsHref}>{t('funnel.toSetup')}</a>{/if}
      {/snippet}
      <EdgeState kind="missing" heading="h2" title={t('funnel.noneTitle')} text={t(editable ? 'funnel.noneText' : 'funnel.noneTextReader')} actions={noFunnelActions} />
    {:else}
      <div class="page">
        <div class="pick">
          <label>
            <span>{t('funnel.funnel')}</span>
            <select value={report?.funnel.code ?? wantedFunnel} onchange={(e) => setQuery({ funnel: e.currentTarget.value })}>
              {#each funnels as item (item.code)}
                <option value={item.code}>{item.main ? t('funnel.mainNamed', { name: item.name }) : item.archivedAt ? t('funnel.archivedNamed', { name: item.name }) : item.name}</option>
              {/each}
            </select>
          </label>
          <div class="segments" role="group" aria-label={t('funnel.view')}>
            <button type="button" aria-pressed={view === 'numbers'} onclick={() => (view = 'numbers')}>{t('funnel.numbers')}</button>
            <button type="button" aria-pressed={view === 'rates'} onclick={() => (view = 'rates')}>{t('funnel.rates')}</button>
          </div>
          {#if report && !missing}<span class="csv"><CsvButton name={csvName(`funnel-${report.funnel.code}`, report.from, report.to)} rows={csvRows} label={report.funnel.name} /></span>{/if}
        </div>

        <ReportBar mode="funnel" {setup} {today} />
        {#if report?.compare}<p class="help compare-note">{t('funnel.compared', { range: compared })}</p>{/if}

        {#if report && report.stale > 0}
          <p class="notice" role="status">{@html icons.refresh}<span>{tn('report.stale', report.stale)}</span></p>
        {/if}

        <LoadState load={loading}>
          {#if missing}
            <div class="none">
              <p>{t('funnel.missing', { code: wantedFunnel })}</p>
              <button type="button" onclick={() => setQuery({ funnel: null })}>{t('funnel.toMain')}</button>
            </div>
          {:else if report}
            <div class="report" class:busy>
              <p class="help order">
                {t(report.funnel.strict ? 'funnel.strict' : 'funnel.free')}
                {#if params.get('attribution') === 'return'}{' '}{t('funnel.firstOnly')}{/if}
              </p>
              {#if sinceNote}<p class="notice plain">{sinceNote}</p>{/if}

              {#if visits.length > 0}
                <section aria-labelledby="funnel-visits">
                  <h2 id="funnel-visits" class="side">{t('funnel.visitsSide')}</h2>
                  <ol class="steps">
                    {#each visits as step (step.index)}{@render stepItem(step)}{/each}
                  </ol>
                </section>
              {/if}

              {#if visits.length > 0 && people.length > 0}
                <p class="boundary">{t('funnel.boundary')}</p>
              {/if}

              {#if people.length > 0}
                <section aria-labelledby="funnel-people">
                  <h2 id="funnel-people" class="side">{t('funnel.peopleSide')}</h2>
                  {#if peopleEmpty}<p class="notice plain">{t(_EMPTY_TEXT[peopleEmpty])}</p>{/if}
                  <ol class="steps" start={visits.length + 1}>
                    {#each people as step (step.index)}{@render stepItem(step)}{/each}
                  </ol>
                </section>
              {/if}
              <p class="help">{t('funnel.lowDataNote', { n: lowDataOf(report).people })}</p>
            </div>
          {/if}
        </LoadState>
      </div>
    {/if}
  {/if}
</LoadState>

<style>
  .page {
    display: grid;
    gap: 1.25rem;
    container-type: inline-size;
    min-width: 0;
    max-width: 72rem;
  }

  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: flex-end;
  }

  .pick label {
    display: grid;
    flex: 0 1 22rem;
    gap: 0.25rem;
    min-width: 0;
  }

  .pick label > span {
    font-size: 0.8125rem;
  }

  .segments {
    display: inline-flex;
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

  .report {
    display: grid;
    gap: 1rem;
    min-width: 0;
    transition: opacity 150ms var(--ease);
  }

  .report.busy {
    opacity: 0.6;
  }

  .order {
    max-width: 52rem;
    margin: 0;
  }

  .notice {
    display: flex;
    gap: 0.5rem;
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

  section {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .side {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .steps {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    list-style: none;
  }

  /* Шаг: название, полоса шириной по числу (от наибольшего на своей стороне) и числа. */
  .step {
    display: grid;
    grid-template-columns: minmax(12rem, 18rem) minmax(8rem, 1fr) minmax(14rem, 20rem);
    gap: 0.5rem 1.25rem;
    align-items: center;
    padding: 0.85rem 1rem;
    border-bottom: 0.0625rem solid var(--line);
  }

  .step:last-child {
    border-bottom: 0;
  }

  .title {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.5rem;
    align-items: baseline;
    min-width: 0;
  }

  .title h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .no {
    flex: none;
    min-width: 1.25rem;
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .track {
    height: 0.75rem;
    overflow: hidden;
    border-radius: 999rem;
    background: var(--sunken);
  }

  .fill {
    display: block;
    height: 100%;
    min-width: 0.125rem;
    border-radius: 999rem;
    background: color-mix(in oklch, var(--muted) 55%, var(--sunken));
  }

  .fill.people {
    background: var(--accent);
  }

  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.85rem;
    align-items: baseline;
    min-width: 0;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .main {
    font-size: 1.125rem;
    font-weight: 650;
  }

  .rate,
  .extra,
  .money,
  .was,
  .links,
  .off {
    flex-basis: 100%;
  }

  .money .base {
    font-weight: 600;
  }

  .money .warn {
    color: var(--warn-text);
  }

  .approx {
    margin-right: 0.2rem;
    color: var(--warn-text);
    font-weight: 700;
    cursor: help;
  }

  .was {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.5rem;
    align-items: baseline;
    color: var(--muted);
  }

  .compare-note {
    margin: 0;
  }

  .pick .csv {
    margin-left: auto;
  }

  .extra.open {
    color: color-mix(in oklch, var(--accent) 70%, var(--text));
  }

  .money > span,
  .money > a {
    display: block;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 1rem;
  }

  .off {
    color: var(--muted);
  }

  /* Мало данных: шаг приглушён цветом, а не прозрачностью (в тёмной теме прозрачность темнит пятном), подпись —
     словами отметкой у названия. */
  .step.low .fill {
    background: color-mix(in oklch, var(--muted) 45%, var(--sunken));
  }

  .step.low .figures > :not(.links),
  .step.low .main {
    color: var(--muted);
  }

  .boundary {
    margin: 0.25rem 0;
    padding: 0.65rem 0.9rem;
    border-left: 0.1875rem solid var(--accent);
    background: var(--sunken);
    border-radius: 0 var(--radius) var(--radius) 0;
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .none {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.25rem 0;
  }

  .none p {
    margin: 0;
    color: var(--muted);
  }

  .help {
    margin: 0;
  }

  /* Узкий экран: полосы во всю ширину, числа — под названием. */
  @container (width < 48rem) {
    .step {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.45rem;
    }
  }
</style>
