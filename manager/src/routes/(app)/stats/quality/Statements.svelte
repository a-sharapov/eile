<script lang="ts">
import { tick } from 'svelte';
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { moment } from '#lib/format.ts';
import { currentLanguage, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { CURRENCIES, currencyName, money } from '#lib/money.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type {
  QualityReport,
  StatementsReport,
  StatementsSaved,
  StatementView,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import Mark from '../Mark.svelte';
import {
  FIRST_MONTH,
  lastMonth,
  type StatementDraft,
  statementBody,
  statementDraftOf,
  statementProblems,
} from './drafts.ts';
import { monthText, QUALITY_LIMITS } from './quality.ts';

// «Качество → Выписки» (ADR 0072, «Выписки»): месяцы от новых к старым, по месяцу — валюта, сумма выписки, до или
// после комиссии, выручка сайта за месяц, разница и доля, заметка, кто и когда. Правка — на месте; выписку за
// идущий месяц не вносят: месяц ещё не кончился.
let {
  report,
  editable,
  onopen,
  onchanged,
}: {
  report: QualityReport;
  editable: boolean;
  /** Открыть «Проверки»: там включают «Сверку с выпиской». */
  onopen: () => void;
  onchanged: () => Promise<unknown>;
} = $props();

const enabled = $derived(
  report.checks.find((_) => _.code === 'statement_matches')?.enabled ?? false
);
const last = $derived(lastMonth(report.timeZone));
const language = $derived(currentLanguage());

let statements = $state<StatementView[]>([]);
const loading = defineLoad(() =>
  api
    .get<StatementsReport>('/analytics/statements')
    .then((_) => void (statements = _.statements))
);
$effect(() => void loading.retry());

const months = $derived(
  Object.values(Object.groupBy(statements, (_) => _.month))
    .map((_) => _ as StatementView[])
    .toSorted((a, b) => (a[0]!.month < b[0]!.month ? 1 : -1))
);

// Правка на месте — ключ «месяц/валюта»; новая выписка — `fresh`.
let editing = $state<string | null>(null);
let fresh = $state(false);
let draft = $state<StatementDraft>(statementDraftOf(null, ''));
let busy = $state(false);
let formError = $state<string | null>(null);
let element = $state<HTMLElement>();

const fieldErrors = defineFieldErrors(
  (field) => draft[field as keyof StatementDraft]
);
const errors = $derived(fieldErrors.current);

const start = (view: StatementView | null) => (
  (editing = view ? `${view.month}/${view.currency}` : null),
  (fresh = view === null),
  (draft = statementDraftOf(view, last)),
  (formError = null),
  fieldErrors.clear(),
  tick().then(() =>
    element?.querySelector<HTMLElement>('input, select')?.focus()
  )
);

const cancel = () => ((editing = null), (fresh = false));

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  ((next) =>
    ((found) =>
      void (Object.keys(found).length > 0
        ? fieldErrors.show(found)
        : busy ||
          ((busy = true),
          (formError = null),
          api
            .send<StatementsSaved>('PUT', '/analytics/statements', {
              statements: [statementBody(next)],
            })
            .then(
              () => (
                notify(t('statements.saved')),
                cancel(),
                loading.retry(),
                onchanged()
              ),
              (_) => void (formError = describe(_))
            )
            .finally(() => (busy = false)))))(
      statementProblems(next, last, statements, fresh)
    ))($state.snapshot(draft) as StatementDraft)
);

const remove = (view: StatementView) =>
  ask({
    title: t('statements.removeTitle', {
      month: monthText(`${view.month}-01`),
      currency: view.currency,
    }),
    body: t('statements.removeBody'),
    confirm: t('setupList.remove'),
    tone: 'danger',
  }).then(
    (yes) =>
      void (
        yes &&
        api
          .send(
            'DELETE',
            `/analytics/statements/${view.month}/${view.currency}`
          )
          .then(
            () => (
              notify(t('statements.removed')), loading.retry(), onchanged()
            ),
            failed
          )
      )
  );

const percent = (value: number): string =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);

const tolerance = $derived(
  (
    report.checks.find((_) => _.code === 'statement_matches')?.params as
      | Record<string, number>
      | undefined
  )?.tolerance ?? 1
);
</script>

{#snippet form()}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form class="edit" novalidate onsubmit={save} onkeydown={(e) => e.key === 'Escape' && (e.preventDefault(), cancel())} bind:this={element} aria-label={fresh ? t('statements.add') : t('statements.edit')}>
    <div class="fields">
      <label>
        <span>{t('statements.month')}</span>
        <input type="month" min={FIRST_MONTH} max={last} bind:value={draft.month} readonly={!fresh} aria-invalid={errors.month ? 'true' : undefined} aria-describedby="statement-month-hint" />
        {#if errors.month}<small id="statement-month-hint" class="field-error">{errors.month}</small>{:else}<small id="statement-month-hint">{t('statements.monthHelp')}</small>{/if}
      </label>
      <label>
        <span>{t('qualityForm.currency')}</span>
        {#if fresh}
          <select bind:value={draft.currency} aria-invalid={errors.currency ? 'true' : undefined}>
            <option value="" disabled>{t('setupForm.pick')}</option>
            {#each CURRENCIES as item (item)}<option value={item}>{item} · {currencyName(item, language)}</option>{/each}
          </select>
        {:else}
          <input readonly value={draft.currency} />
        {/if}
        {#if errors.currency}<small class="field-error">{errors.currency}</small>{/if}
      </label>
      <label>
        <span>{t('statements.amount')}</span>
        <input type="text" inputmode="decimal" autocomplete="off" bind:value={draft.amount} aria-invalid={errors.amount ? 'true' : undefined} aria-describedby="statement-amount-hint" />
        {#if errors.amount}<small id="statement-amount-hint" class="field-error">{errors.amount}</small>{:else}<small id="statement-amount-hint">{t('statements.amountHelp')}</small>{/if}
      </label>
      <fieldset>
        <legend>{t('statements.fees')}</legend>
        <label class="option"><input type="radio" name="statement-fees" value="gross" bind:group={draft.fees} /><span>{t('statements.gross')}</span></label>
        <label class="option"><input type="radio" name="statement-fees" value="net" bind:group={draft.fees} /><span>{t('statements.net')}</span></label>
      </fieldset>
    </div>
    <label>
      <span>{t('setupForm.note')} <small>{t('setupForm.optional')}</small></span>
      <textarea rows="2" bind:value={draft.note} maxlength={QUALITY_LIMITS.note} aria-invalid={errors.note ? 'true' : undefined}></textarea>
      {#if errors.note}<small class="field-error">{errors.note}</small>{/if}
    </label>
    {#if formError}<p class="field-error" role="alert">{formError}</p>{/if}
    <div class="row">
      <button type="submit" class="primary" aria-disabled={busy}>{t('setupForm.save')}</button>
      <button type="button" onclick={cancel}>{t('common.cancel')}</button>
    </div>
  </form>
{/snippet}

<div class="statements">
  {#if !enabled}
    <p class="notice" role="note">{@html icons.alert}<span>{t('statements.off')}</span> <button type="button" class="link" onclick={onopen}>{t('statements.toChecks')}</button></p>
  {/if}
  <header class="intro">
    <p>{t('statements.intro', { share: percent(tolerance) })}</p>
    {#if editable && !fresh}<button type="button" class="primary" onclick={() => start(null)}>{@html icons.plus}{t('statements.add')}</button>{/if}
  </header>

  {#if fresh}<div class="frame fresh">{@render form()}</div>{/if}

  <LoadState load={loading}>
    {#if months.length === 0 && !fresh}
      <p class="muted none">{t('statements.empty')}</p>
    {/if}
    {#each months as month (month[0]!.month)}
      <section class="month frame" aria-labelledby={`month-${month[0]!.month}`}>
        <h3 id={`month-${month[0]!.month}`}>{monthText(`${month[0]!.month}-01`)}</h3>
        <ul class="rows">
          {#each month as view (view.currency)}
            <li class:bad={view.share !== null && view.share > tolerance}>
              {#if editing === `${view.month}/${view.currency}`}
                {@render form()}
              {:else}
                <div class="facts">
                  <div class="money">
                    <span class="currency">{view.currency} <small class="muted">{t(view.fees === 'net' ? 'statements.net' : 'statements.gross')}</small></span>
                    <dl>
                      <div><dt>{t('statements.statement')}</dt><dd>{money(view.amount, view.currency, language)}</dd></div>
                      <div><dt>{t('statements.site')}</dt><dd>{money(view.site, view.currency, language)}</dd></div>
                      <div><dt>{t('statements.difference')}</dt><dd>{money(view.difference, view.currency, language)}{#if view.share !== null}{` · ${percent(view.share)} %`}{/if}</dd></div>
                    </dl>
                    {#if view.share !== null && view.share > tolerance}<Mark tone="danger">{t('statements.mismatch', { share: percent(tolerance) })}</Mark>{:else}<Mark tone="ok">{t('statements.matches')}</Mark>{/if}
                  </div>
                  {#if view.note}<p class="note">{view.note}</p>{/if}
                  <p class="muted who">{view.author ? `${view.author.name}${view.author.agent ? ` · ${t('setupLog.agent')}` : ''}, ` : ''}{moment(view.updatedAt)}</p>
                </div>
                {#if editable}
                  <div class="actions">
                    <button type="button" class="ghost" aria-label={t('statements.editNamed', { month: monthText(`${view.month}-01`), currency: view.currency })} onclick={() => start(view)}>{@html icons.pencil}{t('setupList.edit')}</button>
                    <button type="button" class="ghost icon danger" aria-label={t('statements.removeNamed', { month: monthText(`${view.month}-01`), currency: view.currency })} title={t('setupList.remove')} onclick={() => remove(view)}>{@html icons.trash}</button>
                  </div>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </LoadState>
</div>

<style>
  .statements {
    display: grid;
    gap: 1rem;
    min-width: 0;
    container-type: inline-size;
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

  .notice :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    color: var(--warn-text);
  }

  .link {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: start;
    justify-content: space-between;
  }

  .intro p {
    flex: 1 1 24rem;
    max-width: 52rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .none {
    margin: 0;
    font-size: 0.875rem;
  }

  .fresh,
  .month {
    padding: 0.9rem 1.1rem;
  }

  .month {
    display: grid;
    gap: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .rows {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows > li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: start;
    justify-content: space-between;
    padding: 0.6rem 0;
    border-top: 0.0625rem solid var(--line);
  }

  .rows > li:first-child {
    border-top: 0;
  }

  .facts {
    display: grid;
    flex: 1 1 20rem;
    gap: 0.3rem;
    min-width: 0;
  }

  .money {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.25rem;
    align-items: center;
  }

  .currency {
    min-width: 6rem;
    font-weight: 650;
  }

  .currency small {
    display: block;
    font-weight: 400;
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    margin: 0;
  }

  dt {
    color: var(--muted);
    font-size: 0.75rem;
  }

  dd {
    margin: 0;
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
  }

  .note,
  .who {
    margin: 0;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    gap: 0.25rem;
  }

  .actions button {
    min-height: 2rem;
    padding: 0 0.55rem;
    font-size: 0.8125rem;
  }

  .actions button.icon {
    width: 2rem;
    padding: 0;
  }

  .actions :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .edit {
    display: grid;
    flex: 1 1 100%;
    gap: 0.75rem;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.75rem 1rem;
    align-items: start;
  }

  fieldset {
    display: grid;
    gap: 0.3rem;
  }

  label > span small {
    color: var(--muted);
    font-weight: 400;
  }

  [readonly] {
    color: var(--muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
