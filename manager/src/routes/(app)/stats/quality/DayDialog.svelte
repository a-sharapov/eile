<script lang="ts">
import { tick, untrack } from 'svelte';
import { api } from '#lib/api.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { moment } from '#lib/format.ts';
import { currentLanguage, type MessageKey, number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { money } from '#lib/money.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type {
  CheckDayView,
  QualityReport,
  SetupView,
  ThresholdRule,
} from '#lib/types.ts';
import { resolve } from '$app/paths';
import Mark from '../Mark.svelte';
import Modal from '../Modal.svelte';
import ImportDialog from '../people/ImportDialog.svelte';
import ScrollTable from '../ScrollTable.svelte';
import { kindText, labelNoteText, metricText, outcomeText } from './labels.ts';
import {
  CHECK_ABOUT_KEYS,
  cellState,
  checkName,
  DAY_LINKS,
  type DayLink,
  dayText,
  detailOf,
  QUALITY_LIMITS,
  rowDayText,
  ruleOf,
  STATE_MARKS,
  scopeName,
  valueText,
  zoneOfCheck,
  zoneText,
} from './quality.ts';
import StateSymbol from './StateSymbol.svelte';

// Окно суток проверки (ADR 0072, «Экраны этапа 4»): что сравнивалось и числа, причина «нет данных» словами, когда
// проверено, сводка этих суток; «Проверить заново», «Снять вручную» с обязательной заметкой, «Вернуть», «Дослать
// события» файлом. Коды незнакомых типов, версия и заметки — только текстом.
let {
  report,
  setup,
  target,
  editable,
  intake,
  onclose,
  onchanged,
}: {
  report: QualityReport;
  setup: SetupView;
  /** Включён ли приём: досланный файл примут только при включённом. */
  intake: boolean;
  target: {
    readonly check: string;
    readonly day: string;
    readonly scope: string | null;
    readonly test: boolean;
  } | null;
  editable: boolean;
  onclose: () => void;
  onchanged: () => Promise<unknown>;
} = $props();

let view = $state<CheckDayView | null>(null);
let error = $state<string | null>(null);
let busy = $state(false);
let resolving = $state(false);
let note = $state('');
let importing = $state(false);
let textarea = $state<HTMLTextAreaElement>();

const fieldErrors = defineFieldErrors(() => note);
const errors = $derived(fieldErrors.current);

const path = $derived(
  target === null
    ? null
    : `/analytics/quality/${encodeURIComponent(target.check)}/${target.day}`
);
const search = $derived(
  target === null
    ? ''
    : `?${new URLSearchParams({
        ...(target.scope ? { scope: target.scope } : {}),
        ...(target.test ? { test: '1' } : {}),
      })}`
);

const load = () =>
  ((wanted) =>
    wanted === null
      ? Promise.resolve()
      : api.get<CheckDayView>(wanted).then(
          (_) => void (wanted === `${path}${search}` && (view = _)),
          (_) => void (error = describe(_))
        ))(path === null ? null : `${path}${search}`);

$effect(
  () =>
    void ((_: string | null) =>
      untrack(
        () => (
          (view = null),
          (error = null),
          (resolving = false),
          (note = ''),
          fieldErrors.clear(),
          load()
        )
      ))(path === null ? null : `${path}${search}`)
);

const row = $derived(
  target === null
    ? null
    : (report.rows.find(
        (_) =>
          _.check === target.check &&
          _.scope === target.scope &&
          _.test === target.test
      ) ?? null)
);
const zone = $derived(row?.zone ?? zoneOfCheck(target?.check ?? ''));
const rule = $derived(target ? ruleOf(target.check, report.checks) : null);
const title = $derived(
  target === null
    ? ''
    : `${checkName(target.check, report.checks)} · ${scopeName(setup, target.scope)}`
);
const language = $derived(currentLanguage());
const mark = $derived(view ? cellState(view) : null);
const open = $derived(
  view !== null &&
    view.resolved === null &&
    (view.state === 'warning' || view.state === 'failure')
);
const links = $derived(target ? (DAY_LINKS[target.check] ?? []) : []);

const typeName = (code: string): string | null =>
  setup.types.find((_) => _.sender === target?.scope && _.code === code)
    ?.name ?? null;

const after = (next: CheckDayView, message: MessageKey) => (
  (view = next), notify(t(message)), onchanged()
);

const run = () =>
  void (
    target &&
    !busy &&
    ((busy = true),
    api
      .send('POST', '/analytics/quality/run', {
        check: target.check,
        day: target.day,
        ...(target.scope ? { scope: target.scope } : {}),
      })
      .then(() => load())
      .then(() => (notify(t('quality.ranAgain')), onchanged()))
      .then(undefined, (_) => void (error = describe(_)))
      .finally(() => (busy = false)))
  );

const startResolve = () => (
  (resolving = true), tick().then(() => textarea?.focus())
);

const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  void (
    target &&
    ((text) =>
      text.length < 1 || text.length > QUALITY_LIMITS.note
        ? fieldErrors.show({
            note: t('quality.noteHint', { n: QUALITY_LIMITS.note }),
          })
        : busy ||
          ((busy = true),
          api
            .send<CheckDayView>('POST', `${path}/resolve`, {
              ...(target.scope ? { scope: target.scope } : {}),
              ...(target.test ? { test: true } : {}),
              note: note.trim(),
            })
            .then(
              (_) => (
                (resolving = false), (note = ''), after(_, 'quality.resolved')
              ),
              (_) => void fieldErrors.show({ note: describe(_) })
            )
            .finally(() => (busy = false))))([...note.trim()])
  )
);

const reopen = () =>
  void (
    target &&
    !busy &&
    ((busy = true),
    api
      .send<CheckDayView>('DELETE', `${path}/resolve${search}`)
      .then(
        (_) => after(_, 'quality.reopened'),
        (_) => void (error = describe(_))
      )
      .finally(() => (busy = false)))
  );

const peopleHref = (patch: Record<string, string>) =>
  `${resolve('/(app)/stats/people')}?${new URLSearchParams(patch)}`;

const _LINKS: Readonly<
  Record<Exclude<DayLink, 'import'>, () => { href: string; label: MessageKey }>
> = {
  labels: () => ({
    href: `${resolve('/(app)/stats/labels')}?tab=check`,
    label: 'quality.linkLabels',
  }),
  events: () => ({
    href: peopleHref({
      tab: 'events',
      from: target?.day ?? '',
      to: target?.day ?? '',
      ...(target?.scope ? { sender: target.scope } : {}),
      ...(target?.check === 'payment_duplicates' ? { role: 'payment' } : {}),
    }),
    label: 'quality.linkEvents',
  }),
  people: () => ({
    href: peopleHref({ firstTouchConflict: '1' }),
    label: 'quality.linkConflicts',
  }),
  unknown: () => ({
    href: `${resolve('/(app)/stats/setup')}?tab=unknown`,
    label: 'quality.linkUnknown',
  }),
  rates: () => ({
    href: `${resolve('/(app)/stats/spend')}?tab=rates`,
    label: 'quality.linkRates',
  }),
  statements: () => ({
    href: `${resolve('/(app)/stats/quality')}?tab=statements`,
    label: 'quality.linkStatements',
  }),
};

const percent = (value: number): string =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);

const share = (part: number, whole: number): string =>
  whole === 0
    ? '—'
    : `${percent((Math.abs(part - whole) / Math.abs(whole)) * 100)} %`;

type TypeRow = {
  type: string;
  known: boolean;
  summary: number;
  site: number;
  erased: number;
  missing: number;
  extra: number;
};
</script>

<Modal open={target !== null} {title} wide full {onclose}>
  {#if target}
    <p class="when">{`${rowDayText(zone, target.day)} · ${zoneText(zone, report.timeZone)}`}{#if target.test}{' · '}<Mark>{t('analytics.testMark')}</Mark>{/if}</p>
  {/if}
  {#if error}<p class="field-error" role="alert">{error}</p>{/if}
  {#if target && view && mark}
    <div class="status {mark}">
      <span class="symbol"><StateSymbol state={mark} /></span>
      <div>
        <strong>{t(STATE_MARKS[view.state].label)}{#if view.resolved}{' · '}{t('quality.stateResolved')}{/if}</strong>
        <span>{valueText(target.check, view, { rule })}</span>
      </div>
    </div>

    {#if view.resolved}
      <div class="resolution frame">
        <p><strong>{t('quality.resolvedBy', { name: view.resolved.by || t('setupLog.nobody'), when: moment(view.resolved.at) })}</strong>{#if view.resolved.agent}{' '}<Mark tone="accent">{t('setupLog.agent')}</Mark>{/if}</p>
        <p class="note">{view.resolved.note}</p>
        {#if editable}<button type="button" onclick={reopen} aria-disabled={busy}>{@html icons.restore}{t('quality.reopen')}</button>{/if}
      </div>
    {/if}

    <p class="about">{rule ? t('qualityAbout.custom', { metric: metricText(rule, setup), compare: t(rule.compare === 'lt' ? 'qualityForm.lt' : 'qualityForm.gt'), threshold: rule.metric === 'revenue' && rule.currency ? money(rule.threshold, rule.currency, language) : number(rule.threshold) }) : t(CHECK_ABOUT_KEYS[target.check] ?? 'quality.aboutUnknown')}</p>

    <!-- Подробности по проверке: числа строки дня, чужие коды — только текстом. -->
    {#if target.check === 'events_arrived' && detailOf<TypeRow[]>(view, 'types')}
      <ScrollTable label={title}>
        <table>
          <thead><tr><th scope="col">{t('quality.colType')}</th><th scope="col" class="num">{t('quality.colSummary')}</th><th scope="col" class="num">{t('quality.colSite')}</th><th scope="col" class="num">{t('quality.colErased')}</th><th scope="col" class="num">{t('quality.colMissing')}</th><th scope="col" class="num">{t('quality.colExtra')}</th></tr></thead>
          <tbody>
            {#each detailOf<TypeRow[]>(view, 'types') ?? [] as item (item.type)}
              <tr class:bad={item.missing > 0}>
                <th scope="row">{#if item.known && typeName(item.type)}{typeName(item.type)} <code class="muted">{item.type}</code>{:else}<code>{item.type}</code> <Mark tone="warn">{t('quality.unknownType')}</Mark>{/if}</th>
                <td class="num">{number(item.summary)}</td><td class="num">{number(item.site)}</td><td class="num">{number(item.erased)}</td><td class="num">{item.missing ? number(item.missing) : '—'}</td><td class="num">{item.extra ? number(item.extra) : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </ScrollTable>
    {:else if (target.check === 'revenue_matches' || target.check === 'statement_matches') && detailOf<unknown[]>(view, 'currencies')}
      <ScrollTable label={title}>
        <table>
          <thead><tr><th scope="col">{t('quality.colCurrency')}</th><th scope="col" class="num">{t(target.check === 'statement_matches' ? 'quality.colStatement' : 'quality.colSummary')}</th><th scope="col" class="num">{t('quality.colSite')}</th><th scope="col" class="num">{t('quality.colShare')}</th></tr></thead>
          <tbody>
            {#each detailOf<{ currency: string; summary?: number; statement?: number; site: number; fees?: string }[]>(view, 'currencies') ?? [] as item (item.currency)}
              {@const left = item.statement ?? item.summary ?? 0}
              <tr class:bad={left !== item.site}><th scope="row">{item.currency}{#if item.fees}{' '}<small class="muted">{t(item.fees === 'net' ? 'statements.net' : 'statements.gross')}</small>{/if}</th><td class="num">{money(left, item.currency, language)}</td><td class="num">{money(item.site, item.currency, language)}</td><td class="num">{share(item.site, left)}</td></tr>
            {/each}
          </tbody>
        </table>
      </ScrollTable>
      {#if detailOf<number>(view, 'tolerance') !== null}<p class="muted small">{t('quality.tolerance', { share: percent(detailOf<number>(view, 'tolerance') ?? 0) })}</p>{/if}
    {:else if target.check === 'summary_arrived'}
      {#if detailOf<string>(view, 'expected')}<p class="small">{t('quality.expectedBy', { when: moment(detailOf<string>(view, 'expected')!) })}</p>{/if}
      {#if detailOf<string>(view, 'receivedAt')}<p class="small">{t('quality.cameAt', { when: moment(detailOf<string>(view, 'receivedAt')!) })}</p>{/if}
    {:else if target.check === 'intake_refusals' && detailOf<unknown[]>(view, 'refusals')}
      {#if (detailOf<unknown[]>(view, 'refusals') ?? []).length > 0}
        <ul class="facts">
          {#each detailOf<{ sender: string | null; outcome: string; count: number }[]>(view, 'refusals') ?? [] as item, index (index)}
            <li><span>{item.sender ? scopeName(setup, item.sender) : t('quality.keyUnknown')} · {outcomeText(item.outcome)}</span><strong>{number(item.count)}</strong></li>
          {/each}
        </ul>
      {/if}
    {:else if detailOf<Record<string, number>>(view, 'senders')}
      <ul class="facts">
        {#each Object.entries(detailOf<Record<string, number>>(view, 'senders') ?? {}) as entry (entry[0])}
          <li><span>{scopeName(setup, entry[0])}</span><strong>{number(entry[1])}</strong></li>
        {/each}
      </ul>
    {:else if target.check === 'labels_readable' && detailOf<number>(view, 'total') !== null}
      <ul class="facts">
        <li><span>{t('quality.touches')}</span><strong>{number(detailOf<number>(view, 'total') ?? 0)}</strong></li>
        {#each ['invalid', 'extra', 'length'] as const as kind (kind)}
          {#if detailOf<number>(view, kind) !== null}<li><span>{labelNoteText(kind)}</span><strong>{number(detailOf<number>(view, kind) ?? 0)}</strong></li>{/if}
        {/each}
      </ul>
    {:else if target.check === 'event_time'}
      <ul class="facts">
        <li><span>{t('quality.future')}</span><strong>{number(detailOf<number>(view, 'future') ?? 0)}</strong></li>
        <li><span>{t('quality.late')}</span><strong>{number(detailOf<number>(view, 'late') ?? 0)}</strong></li>
      </ul>
    {:else if target.check === 'all_known' && detailOf<Record<string, number>>(view, 'kinds')}
      <ul class="facts">
        {#each Object.entries(detailOf<Record<string, number>>(view, 'kinds') ?? {}) as entry (entry[0])}
          <li><span>{kindText(entry[0])}</span><strong>{number(entry[1])}</strong></li>
        {/each}
      </ul>
    {:else if target.check === 'links_arrive' && detailOf<unknown[]>(view, 'links')}
      <ScrollTable label={title}>
        <table>
          <thead><tr><th scope="col">{t('quality.colLink')}</th><th scope="col" class="num">{t('quality.colGoals')}</th><th scope="col" class="num">{t('quality.colPeople')}</th></tr></thead>
          <tbody>
            {#each detailOf<{ link: string; goals: number; people: number }[]>(view, 'links') ?? [] as item (item.link)}
              <tr><th scope="row">{setup.links.find((_) => _.code === item.link)?.name ?? item.link}</th><td class="num">{number(item.goals)}</td><td class="num">{number(item.people)}</td></tr>
            {/each}
          </tbody>
        </table>
      </ScrollTable>
    {:else if target.check === 'rate_present'}
      {#if (detailOf<string[]>(view, 'missing') ?? []).length > 0}<p class="small">{t('quality.noRateFor', { currencies: (detailOf<string[]>(view, 'missing') ?? []).join(', ') })}</p>{/if}
      {#if (detailOf<unknown[]>(view, 'stale') ?? []).length > 0}<p class="small">{t('quality.staleRateFor', { items: (detailOf<{ currency: string; month: string }[]>(view, 'stale') ?? []).map((_) => `${_.currency} · ${_.month}`).join(', ') })}</p>{/if}
    {:else if target.check === 'sender_facts' && detailOf<number>(view, 'checked') !== null}
      <ul class="facts">
        <li><span>{t('quality.factsChecked')}</span><strong>{number(detailOf<number>(view, 'checked') ?? 0)}</strong></li>
        <li><span>{t('quality.factsMismatched')}</span><strong>{number(detailOf<number>(view, 'mismatched') ?? 0)}</strong></li>
      </ul>
    {/if}

    {#if view.summary}
      <section class="summary" aria-labelledby="day-summary">
        <h3 id="day-summary">{t('quality.summaryOfDay')}</h3>
        <p class="muted small">{[t('quality.summaryCame', { when: moment(view.summary.receivedAt) }), ...(view.summary.version ? [t('quality.version', { version: view.summary.version })] : []), ...(view.summary.failed !== null ? [t('quality.failed', { n: number(view.summary.failed) })] : [])].join(' · ')}</p>
        <ul class="facts">
          {#each Object.entries(view.summary.counts) as entry (entry[0])}
            <li><span>{typeName(entry[0]) ?? entry[0]}</span><strong>{number(entry[1])}</strong></li>
          {/each}
          {#each Object.entries(view.summary.revenue ?? {}) as entry (entry[0])}
            <li><span>{t('quality.revenueIn', { currency: entry[0] })}</span><strong>{money(entry[1], entry[0], language)}</strong></li>
          {/each}
        </ul>
      </section>
    {/if}

    <p class="muted small">{t('quality.evaluated', { when: moment(view.evaluatedAt) })}</p>

    {#if links.some((_) => _ !== 'import')}
      <ul class="links">
        {#each links.filter((_) => _ !== 'import') as link (link)}
          {@const to = _LINKS[link as Exclude<DayLink, 'import'>]()}
          <li><a href={to.href}>{t(to.label)}</a></li>
        {/each}
      </ul>
    {/if}

    {#if editable && resolving}
      <form class="resolve" novalidate onsubmit={submit}>
        <label>
          <span>{t('quality.noteLabel')}</span>
          <textarea rows="3" bind:this={textarea} bind:value={note} maxlength={QUALITY_LIMITS.note} aria-invalid={errors.note ? 'true' : undefined} aria-describedby={errors.note ? 'resolve-error' : 'resolve-hint'}></textarea>
          {#if errors.note}<small id="resolve-error" class="field-error">{errors.note}</small>{:else}<small id="resolve-hint">{t('quality.noteHelp', { n: QUALITY_LIMITS.note })}</small>{/if}
        </label>
        <div class="row">
          <button type="submit" class="primary" aria-disabled={busy}>{t('quality.resolve')}</button>
          <button type="button" onclick={() => (resolving = false)}>{t('common.cancel')}</button>
        </div>
      </form>
    {/if}
  {:else if target && !error}
    <p class="muted">{t('common.loading')}</p>
  {/if}

  {#snippet footer()}
    {#if editable && view && target}
      {#if links.includes('import') && target.scope !== null}<button type="button" onclick={() => (importing = true)}>{@html icons.upload}{t('quality.resend')}</button>{/if}
      <button type="button" onclick={run} aria-disabled={busy}>{@html icons.refresh}{t('quality.runAgain')}</button>
      {#if open && !resolving}<button type="button" onclick={startResolve}>{@html icons.check}{t('quality.resolveStart')}</button>{/if}
    {/if}
    <button type="button" class="primary" onclick={onclose}>{t('common.close')}</button>
  {/snippet}
</Modal>

{#if target && target.scope !== null}
  <ImportDialog open={importing} {setup} enabled={intake} preset={target.scope} hint={t('quality.resendHint', { day: dayText(target.day, true) })} onclose={() => (importing = false)} onimported={() => void onchanged()} />
{/if}

<style>
  .when {
    margin: -0.75rem 0 0;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .status {
    display: flex;
    gap: 0.75rem;
    align-items: start;
    padding: 0.75rem 0.9rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .status strong {
    display: block;
  }

  .status strong::first-letter {
    text-transform: uppercase;
  }

  .status div {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .status .symbol {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-s);
    background: var(--surface);
    font-weight: 700;
  }

  .status.ok {
    border-color: color-mix(in oklch, var(--ok) 35%, var(--line));
    background: var(--ok-soft);
  }

  .status.ok .symbol {
    color: color-mix(in oklch, var(--ok) 65%, var(--text));
  }

  .status.warning {
    border-color: color-mix(in oklab, var(--warn) 45%, var(--line));
    background: var(--warn-soft);
  }

  .status.warning .symbol {
    color: var(--warn-text);
  }

  .status.failure {
    border-color: color-mix(in oklab, var(--danger) 45%, var(--line));
    background: var(--danger-soft);
  }

  .status.failure .symbol {
    color: color-mix(in oklab, var(--danger) 75%, var(--text));
  }

  .status.resolved .symbol {
    border: 0.0625rem dashed color-mix(in oklab, var(--muted) 75%, transparent);
    color: color-mix(in oklab, var(--text) 55%, var(--muted));
  }

  .resolution {
    display: grid;
    gap: 0.4rem;
    justify-items: start;
    padding: 0.75rem 0.9rem;
  }

  .resolution p {
    margin: 0;
    font-size: 0.875rem;
  }

  .note {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .about,
  .small {
    margin: 0;
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  table {
    width: 100%;
  }

  th,
  td {
    padding: 0.4rem 0.65rem;
    font-size: 0.8125rem;
    vertical-align: top;
  }

  tbody th {
    min-width: 9rem;
    font-weight: 500;
    text-align: left;
    overflow-wrap: break-word;
  }

  /* Код типа — своей строкой и целиком: таблица прокручивается вбок, а не ломает код по буквам. */
  tbody th code {
    display: block;
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

  .facts {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }

  .facts li {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.3rem 0;
    border-bottom: 0.0625rem solid var(--line);
  }

  .facts span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .facts strong {
    font-variant-numeric: tabular-nums;
  }

  .summary {
    display: grid;
    gap: 0.4rem;
  }

  h3 {
    margin: 0;
    font-size: 0.9375rem;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    margin: 0;
    padding: 0;
    font-size: 0.875rem;
    list-style: none;
  }

  .resolve {
    display: grid;
    gap: 0.6rem;
    padding-top: 0.75rem;
    border-top: 0.0625rem solid var(--line);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
