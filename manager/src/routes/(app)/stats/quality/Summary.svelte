<script lang="ts">
import { currentLanguage, type MessageKey, number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { money } from '#lib/money.ts';
import { can } from '#lib/session.svelte.ts';
import type {
  IntakeSummary,
  QualityCell,
  QualityReport,
  QualityRow,
  SetupView,
  SummaryCheck,
} from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import Mark from '../Mark.svelte';
import { onlyQuery, setQuery } from '../query.ts';
import ScrollTable from '../ScrollTable.svelte';
import DayDialog from './DayDialog.svelte';
import QualityGrid from './QualityGrid.svelte';
import QualityTiles from './QualityTiles.svelte';
import {
  bannersOf,
  cellLabel,
  checkName,
  dayText,
  emptyReason,
  episodeStart,
  gridDays,
  nextCheck,
  openOn,
  STATE_MARKS,
  scopeName,
  tilesOf,
  whenText,
} from './quality.ts';
import StateSymbol from './StateSymbol.svelte';

// «Качество → Сводка»: плашки, плитки по проверкам, сетка за 30 суток, последняя сводка отправителей и окно дня.
let {
  report,
  setup,
  intake,
  editable,
  busy,
  onchanged,
}: {
  report: QualityReport;
  setup: SetupView;
  intake: IntakeSummary;
  editable: boolean;
  busy: boolean;
  /** Сняли, вернули или перепроверили: экран перечитывает сетку. */
  onchanged: () => Promise<unknown>;
} = $props();

const query = $derived(page.url.searchParams);
const test = $derived(query.get('test') === '1');
const picked = $derived(query.get('day'));
const opened = $derived(
  query.get('day') && query.get('check')
    ? {
        check: query.get('check')!,
        day: query.get('day')!,
        scope: query.get('scope') || null,
        test: query.get('testRow') === '1',
      }
    : null
);

const days = $derived(gridDays(report.from, report.to));
const rows = $derived(report.rows.filter((_) => test || !_.test));
const tiles = $derived(tilesOf(report.rows));
const banners = $derived(bannersOf(report, intake.enabled, setup));
const empty = $derived(
  report.rows.length === 0
    ? emptyReason(setup, report.checks, intake.lastAt !== null)
    : null
);
const first = $derived(
  nextCheck(report.asOf, report.checks, setup.senders, report.timeZone)
);
const flagged = $derived(picked && !opened ? openOn(report.rows, picked) : []);

const open = (row: QualityRow, cell: QualityCell) =>
  void setQuery({
    day: cell.day,
    check: row.check,
    scope: row.scope,
    testRow: row.test ? '1' : null,
  });

const close = () =>
  void setQuery({ check: null, scope: null, testRow: null, day: null });

// Последняя сводка отправителя: самые новые сутки; расхождение — с первых суток эпизода «События дошли».
const latest = $derived(
  Object.values(
    Object.groupBy(
      (report.summaries ?? []).filter((_) => !_.test),
      (_) => _.sender
    )
  ).map(
    (_) =>
      (_ as SummaryCheck[]).toSorted((a, b) => (a.day < b.day ? 1 : -1))[0]!
  )
);

const sinceOf = (
  summary: SummaryCheck
): { day: string; version: string | null } | null =>
  ((row) =>
    ((cell) =>
      cell && cell.state === 'failure' && cell.resolved === null
        ? ((day) => ({
            day,
            version:
              (report.summaries ?? []).find(
                (_) => _.sender === summary.sender && _.day === day && !_.test
              )?.version ?? null,
          }))(episodeStart(row!.cells, cell.day))
        : null)(row?.cells.find((_) => _.day === row.day)))(
    report.rows.find(
      (_) =>
        !_.test &&
        _.scope === summary.sender &&
        (_.check === 'events_arrived' || _.check === 'revenue_matches') &&
        _.state === 'failure'
    )
  );

const _EMPTY: Readonly<
  Record<
    'senders' | 'disabled' | 'events' | 'due',
    readonly [MessageKey, MessageKey]
  >
> = {
  senders: ['quality.emptySenders', 'quality.emptySendersText'],
  disabled: ['quality.emptyDisabled', 'quality.emptyDisabledText'],
  events: ['quality.emptyEvents', 'quality.emptyEventsText'],
  due: ['quality.emptyDue', 'quality.emptyDueText'],
};

const language = $derived(currentLanguage());
const notifyHref = `${resolve('/(app)/settings')}?tab=notify`;
const sendersHref = `${resolve('/(app)/stats/setup')}?tab=senders`;
const helpSender = `${resolve('/(app)/help')}#analytics-sender`;
</script>

<div class="summary" class:busy>
  {#each banners as banner (banner)}
    {#if banner === 'channels'}
      <p class="notice" role="note">{@html icons.alert}<span>{t('quality.noChannels')}</span>{#if can('site.edit')}{' '}<a href={notifyHref}>{t('quality.toNotify')}</a>{/if}</p>
    {:else if banner === 'intake'}
      <p class="notice" role="note">{@html icons.alert}<span>{t('quality.intakeOff')}</span></p>
    {:else}
      <p class="notice plain" role="note">{@html icons.alert}<span>{t('quality.noSummaries')}</span> <a href={helpSender}>{t('quality.toSenderHelp')}</a></p>
    {/if}
  {/each}

  {#if empty}
    {#snippet emptyActions()}
      {#if empty === 'senders' && editable}<a class="button primary" href={sendersHref}>{t('quality.toSenders')}</a>{/if}
      {#if empty === 'disabled'}<button type="button" class="primary" onclick={() => onlyQuery({ tab: 'checks' })}>{t('quality.toChecks')}</button>{/if}
    {/snippet}
    <EdgeState kind="missing" heading="h2" title={t(_EMPTY[empty][0])} text={empty === 'due' && first ? t('quality.firstCheck', { when: whenText(first.at, first.zone) }) : t(_EMPTY[empty][1])} actions={empty === 'senders' || empty === 'disabled' ? emptyActions : undefined} />
  {:else}
    {#if flagged.length > 0}
      <section class="flagged frame" aria-labelledby="quality-flagged">
        <h3 id="quality-flagged">{t('quality.openOn', { day: dayText(picked!) })}</h3>
        <ul>
          {#each flagged as item (`${item.row.check}/${item.row.scope}/${item.row.test}`)}
            <li><button type="button" class="ghost" onclick={() => open(item.row, item.cell)}><span aria-hidden="true">{STATE_MARKS[item.cell.state].symbol}</span> {cellLabel(item.row, item.cell, { checks: report.checks, setup })}</button></li>
          {/each}
        </ul>
      </section>
    {:else if picked && !opened}
      <p class="muted calm">{t('quality.nothingOn', { day: dayText(picked) })}</p>
    {/if}

    <section aria-labelledby="quality-tiles">
      <h3 id="quality-tiles" class="sr-only">{t('quality.tilesTitle')}</h3>
      <QualityTiles {tiles} checks={report.checks} {setup} timeZone={report.timeZone} onopen={open} />
    </section>

    <section class="grid-section" aria-labelledby="quality-grid">
      <header>
        <h3 id="quality-grid">{t('quality.gridTitle')}</h3>
        <label class="check"><input type="checkbox" checked={test} onchange={(e) => setQuery({ test: e.currentTarget.checked ? '1' : null })} />{t('quality.showTest')}</label>
      </header>
      <ul class="legend" aria-label={t('quality.legend')}>
        {#each ['ok', 'warning', 'failure', 'no_data', 'resolved'] as const as state (state)}
          <li><span class="key {state}"><StateSymbol {state} /></span>{t(STATE_MARKS[state].label)}</li>
        {/each}
        <li><span class="key dot" aria-hidden="true"></span>{t('quality.notified')}</li>
      </ul>
      <QualityGrid {rows} {days} checks={report.checks} {setup} timeZone={report.timeZone} picked={picked} onopen={open} />
      <p class="help">{t('quality.gridHint')}</p>
    </section>

    {#if latest.length > 0}
      <section class="latest" aria-labelledby="quality-latest">
        <h3 id="quality-latest">{t('quality.latestTitle')}</h3>
        <div class="senders">
          {#each latest as summary (summary.sender)}
            {@const since = sinceOf(summary)}
            <article class="frame">
              <header>
                <h4>{scopeName(setup, summary.sender)} <span class="muted">{t('quality.summaryFor', { day: dayText(summary.day) })}</span></h4>
                {#if summary.version}<span class="muted version">{t('quality.version', { version: summary.version })}</span>{/if}
              </header>
              {#if since}<p class="since"><Mark tone="danger">{t('quality.stateFailure')}</Mark> {since.version ? t('quality.sinceVersion', { day: dayText(since.day), version: since.version }) : t('quality.since', { day: dayText(since.day) })}</p>{/if}
              {#if summary.types.length > 0}
                <ScrollTable label={t('quality.typesTable', { sender: scopeName(setup, summary.sender) })}>
                  <table class="counts">
                    <thead><tr><th scope="col">{t('quality.colType')}</th><th scope="col" class="num">{t('quality.colSummary')}</th><th scope="col" class="num">{t('quality.colSite')}</th><th scope="col" class="num">{t('quality.colErased')}</th><th scope="col" class="num">{t('quality.colMissing')}</th></tr></thead>
                    <tbody>
                      {#each summary.types as row (row.type)}
                        <tr class:bad={row.missing > 0}>
                          <th scope="row">{#if row.name}{row.name}{:else}<code>{row.type}</code> <Mark tone="warn">{t('quality.unknownType')}</Mark>{/if}</th>
                          <td class="num">{number(row.summary)}</td>
                          <td class="num">{number(row.site)}</td>
                          <td class="num">{number(row.erased)}</td>
                          <td class="num">{row.missing > 0 ? number(row.missing) : '—'}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </ScrollTable>
              {/if}
              {#if summary.currencies.length > 0}
                <ScrollTable label={t('quality.moneyTable', { sender: scopeName(setup, summary.sender) })}>
                  <table class="counts money">
                    <thead><tr><th scope="col">{t('quality.colCurrency')}</th><th scope="col" class="num">{t('quality.colSummary')}</th><th scope="col" class="num">{t('quality.colSite')}</th></tr></thead>
                    <tbody>
                      {#each summary.currencies as row (row.currency)}
                        <tr class:bad={row.summary !== row.site}><th scope="row">{row.currency}</th><td class="num">{money(row.summary, row.currency, language)}</td><td class="num">{money(row.site, row.currency, language)}</td></tr>
                      {/each}
                    </tbody>
                  </table>
                </ScrollTable>
              {/if}
              {#if summary.failed !== null}<p class="muted failed">{t('quality.failed', { n: number(summary.failed) })}</p>{/if}
            </article>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<DayDialog {report} {setup} target={opened} {editable} intake={intake.enabled} onclose={close} {onchanged} />

<style>
  .summary {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
    transition: opacity 150ms var(--ease);
  }

  .summary.busy {
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
    color: var(--warn-text);
  }

  .notice span {
    flex: 1 1 18rem;
  }

  section {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .grid-section header,
  .latest article header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    align-items: baseline;
    justify-content: space-between;
  }

  .check {
    font-size: 0.875rem;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    color: var(--muted);
    font-size: 0.8125rem;
    list-style: none;
  }

  .legend li {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
  }

  .key {
    display: inline-grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-s);
    background: var(--sunken);
    font-size: 0.6875rem;
    font-weight: 700;
  }

  .key.ok {
    background: var(--ok-soft);
    color: color-mix(in oklch, var(--ok) 65%, var(--text));
  }

  .key.warning {
    background: var(--warn-soft);
    color: var(--warn-text);
  }

  .key.failure {
    background: var(--danger-soft);
    color: color-mix(in oklab, var(--danger) 75%, var(--text));
  }

  .key.resolved {
    border-style: dashed;
    border-color: color-mix(in oklab, var(--muted) 75%, transparent);
    background: var(--surface);
    color: color-mix(in oklab, var(--text) 55%, var(--muted));
  }

  .key.dot {
    width: 0.4rem;
    height: 0.4rem;
    border: 0;
    border-radius: 50%;
    background: var(--muted);
  }

  .help,
  .calm {
    margin: 0;
    font-size: 0.8125rem;
  }

  .flagged {
    padding: 0.75rem 0.9rem;
  }

  .flagged ul {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .flagged button {
    justify-content: flex-start;
    min-height: 2rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    font-weight: 450;
    text-align: left;
    white-space: normal;
  }

  .senders {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr));
    gap: 0.75rem;
  }

  .senders article {
    display: grid;
    gap: 0.6rem;
    align-content: start;
    min-width: 0;
    padding: 0.85rem 1rem;
  }

  h4 {
    margin: 0;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }

  h4 .muted {
    font-weight: 400;
  }

  .version,
  .failed,
  .since {
    margin: 0;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }

  .counts {
    width: 100%;
  }

  .counts th,
  .counts td {
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
  }

  .counts tbody th {
    min-width: 8rem;
    font-weight: 500;
    text-align: left;
    overflow-wrap: break-word;
  }

  .counts tbody th code {
    white-space: nowrap;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  tr.bad > * {
    background: color-mix(in oklab, var(--surface), var(--danger-soft) 70%);
  }
</style>
