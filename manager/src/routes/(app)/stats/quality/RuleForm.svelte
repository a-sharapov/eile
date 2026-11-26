<script lang="ts">
import { tick } from 'svelte';
import { CHECK_CODE_LIMIT, CODE_PATTERN, ROLE_LABELS } from '#lib/analytics.ts';
import { api, isApiError } from '#lib/api.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { currentLanguage, number, quoted, t } from '#lib/i18n.ts';
import { CURRENCIES, currencyName } from '#lib/money.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type { CheckNotify, CheckView, SetupView } from '#lib/types.ts';
import Modal from '../Modal.svelte';
import {
  CHECK_METRICS,
  FORM_GOAL_CHOICE,
  METRIC_PARAMS,
  RULE_DAYS,
  RULE_ROLES,
  type RuleDraft,
  ruleBody,
  ruleDraftOf,
  ruleProblems,
} from './drafts.ts';
import { METRIC_LABELS, NOTIFY_LABELS, periodText } from './labels.ts';
import { QUALITY_LIMITS } from './quality.ts';

// Своя пороговая проверка: показатель и его поля, «меньше / больше», порог (у выручки — деньгами валюты), период,
// важность, «уведомлять». До сохранения форма говорит, когда проверка пойдёт и что сохранение перепроверит неделю.
let {
  request,
  setup,
  checks,
  timeZone,
  onclose,
  onsaved,
}: {
  /** null — окно закрыто; `check: null` — новая проверка. */
  request: { readonly check: CheckView | null } | null;
  setup: SetupView;
  checks: readonly CheckView[];
  timeZone: string;
  onclose: () => void;
  onsaved: () => void;
} = $props();

let draft = $state<RuleDraft>(ruleDraftOf(null));
let busy = $state(false);
let formError = $state<string | null>(null);
let element = $state<HTMLFormElement>();
const id = $props.id();

const fieldErrors = defineFieldErrors((field) =>
  field === 'goal'
    ? [draft.goal, draft.form]
    : field === 'threshold'
      ? [draft.threshold, draft.currency]
      : draft[field as keyof RuleDraft]
);
const errors = $derived(fieldErrors.current);

$effect(() => {
  const next = request;
  void (
    next &&
    (fieldErrors.clear(), (formError = null), (draft = ruleDraftOf(next.check)))
  );
});

const existing = $derived(request?.check ?? null);
const wanted = $derived(
  draft.metric === ''
    ? []
    : [
        ...METRIC_PARAMS[draft.metric].required,
        ...METRIC_PARAMS[draft.metric].optional,
      ]
);
const senders = $derived(
  setup.senders.filter(
    (_) => _.archivedAt === null || _.code === existing?.params?.sender
  )
);
const types = $derived(
  setup.types.filter(
    (_) =>
      _.sender === draft.sender &&
      (_.archivedAt === null ||
        (existing?.params as { type?: string } | undefined)?.type === _.code)
  )
);
const links = $derived(setup.links.filter((_) => _.archivedAt === null));
const _NOTIFY: readonly CheckNotify[] = ['failure', 'any', 'off'];

const send = (body: Record<string, unknown>) =>
  api.send('PUT', '/analytics/setup/check', body);

// Отказ сервера — у поля, о котором он, иначе под формой.
const _FIELDS: readonly (readonly [RegExp, string])[] = [
  [/threshold/, 'threshold'],
  [/\bsender\b/, 'sender'],
  [/\btype\b/, 'type'],
  [/\brole\b/, 'role'],
  [/\bgoal\b|\blink\b|form/, 'goal'],
  [/currency/, 'currency'],
  [/\bname\b/, 'name'],
  [/\bnote\b/, 'note'],
];

const fieldOf = (code: string, message: string): string | null =>
  code === 'analytics.invalid_code'
    ? 'code'
    : code === 'analytics.too_many'
      ? null
      : (_FIELDS.find((_) => _[0].test(message))?.[1] ?? null);

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  ((next) =>
    ((found) =>
      void (Object.keys(found).length > 0
        ? (fieldErrors.show(found),
          tick().then(() =>
            element
              ?.querySelector<HTMLElement>('[aria-invalid="true"]')
              ?.focus()
          ))
        : busy ||
          ((busy = true),
          (formError = null),
          send(ruleBody(next))
            .then(
              () => (notify(t('setupForm.saved')), onsaved()),
              (error) =>
                ((field) =>
                  field
                    ? fieldErrors.show({ [field]: describe(error) })
                    : void (formError = describe(error)))(
                  isApiError(error) ? fieldOf(error.code, error.message) : null
                )
            )
            .finally(() => (busy = false)))))(
      ruleProblems(next, { setup, checks, existing })
    ))($state.snapshot(draft) as RuleDraft)
);

const described = (field: string) =>
  errors[field] ? `${id}-${field}-error` : undefined;
</script>

{#snippet fieldError(field: string)}
  {#if errors[field]}<small id={`${id}-${field}-error`} class="field-error">{errors[field]}</small>{/if}
{/snippet}

<Modal open={request !== null} title={existing ? t('qualityForm.editCustom', { name: quoted(existing.name) }) : t('qualityForm.newCustom')} wide {onclose}>
  <form id={`${id}-form`} class="form" novalidate onsubmit={save} bind:this={element} oninput={() => (formError = null)}>
    <div class="pair">
      <label>
        <span>{t('setupForm.code')}</span>
        {#if existing}
          <input class="code" readonly value={draft.code} />
        {:else}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="code" bind:value={draft.code} required maxlength={CHECK_CODE_LIMIT} pattern={CODE_PATTERN} spellcheck="false" autocomplete="off" autocapitalize="none" autofocus aria-invalid={errors.code ? 'true' : undefined} aria-describedby={errors.code ? `${id}-code-error` : `${id}-code-hint`} />
          {#if errors.code}{@render fieldError('code')}{:else}<small id={`${id}-code-hint`}>{t('qualityForm.codeHint', { n: CHECK_CODE_LIMIT })}</small>{/if}
        {/if}
      </label>
      <label>
        <span>{t('setupForm.name')}</span>
        <input bind:value={draft.name} required maxlength="100" aria-invalid={errors.name ? 'true' : undefined} aria-describedby={described('name')} />
        {@render fieldError('name')}
      </label>
    </div>

    <label>
      <span>{t('qualityForm.metric')}</span>
      <select bind:value={draft.metric} aria-invalid={errors.metric ? 'true' : undefined} aria-describedby={described('metric')}>
        <option value="" disabled>{t('setupForm.pick')}</option>
        {#each CHECK_METRICS as metric (metric)}<option value={metric}>{t(METRIC_LABELS[metric])}</option>{/each}
      </select>
      {@render fieldError('metric')}
    </label>

    {#if wanted.includes('sender')}
      <div class="pair">
        <label>
          <span>{t('people.sender')}{#if draft.metric === 'role'}{' '}<small>{t('setupForm.optional')}</small>{/if}</span>
          <select bind:value={draft.sender} onchange={() => (draft.type = '')} aria-invalid={errors.sender ? 'true' : undefined} aria-describedby={described('sender')}>
            <option value="">{draft.metric === 'role' ? t('qualityForm.anySender') : t('setupForm.pick')}</option>
            {#each senders as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
          </select>
          {@render fieldError('sender')}
        </label>
        {#if wanted.includes('type')}
          <label>
            <span>{t('analytics.groupType')}</span>
            <select bind:value={draft.type} disabled={draft.sender === ''} aria-invalid={errors.type ? 'true' : undefined} aria-describedby={described('type')}>
              <option value="" disabled>{t('setupForm.pick')}</option>
              {#each types as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
            </select>
            {@render fieldError('type')}
          </label>
        {/if}
      </div>
    {/if}
    {#if wanted.includes('role')}
      <label>
        <span>{t('analytics.role')}</span>
        <select bind:value={draft.role} aria-invalid={errors.role ? 'true' : undefined} aria-describedby={described('role')}>
          <option value="" disabled>{t('setupForm.pick')}</option>
          {#each RULE_ROLES as item (item)}<option value={item}>{t(ROLE_LABELS[item])}</option>{/each}
        </select>
        {@render fieldError('role')}
      </label>
    {/if}
    {#if wanted.includes('currency')}
      <label>
        <span>{t('qualityForm.currency')}</span>
        <select bind:value={draft.currency} aria-invalid={errors.currency ? 'true' : undefined} aria-describedby={described('currency')}>
          <option value="" disabled>{t('setupForm.pick')}</option>
          {#each CURRENCIES as item (item)}<option value={item}>{item} · {currencyName(item, currentLanguage())}</option>{/each}
        </select>
        {@render fieldError('currency')}
      </label>
    {/if}
    {#if wanted.includes('goal')}
      <div class="pair">
        <label>
          <span>{t('qualityForm.goal')}</span>
          <select bind:value={draft.goal}>
            <option value="go:">{t('qualityMetric.anyLink')}</option>
            {#each links as link (link.code)}<option value={`go:${link.code}`}>{t('qualityMetric.link', { name: quoted(link.name) })}</option>{/each}
            <option value={FORM_GOAL_CHOICE}>{t('qualityForm.goalForm')}</option>
          </select>
        </label>
        {#if draft.goal === FORM_GOAL_CHOICE}
          <label>
            <span>{t('qualityForm.formName')}</span>
            <input class="code" bind:value={draft.form} spellcheck="false" autocomplete="off" aria-invalid={errors.goal ? 'true' : undefined} aria-describedby={described('goal')} />
            {@render fieldError('goal')}
          </label>
        {/if}
      </div>
    {/if}

    <div class="trio">
      <fieldset>
        <legend>{t('qualityForm.compare')}</legend>
        <label class="option"><input type="radio" name={`${id}-compare`} value="lt" bind:group={draft.compare} /><span>{t('qualityForm.lt')}</span></label>
        <label class="option"><input type="radio" name={`${id}-compare`} value="gt" bind:group={draft.compare} /><span>{t('qualityForm.gt')}</span></label>
      </fieldset>
      <label>
        <span>{draft.metric === 'revenue' && draft.currency ? t('qualityForm.thresholdMoney', { currency: draft.currency }) : t('qualityForm.threshold')}</span>
        {#if draft.metric === 'revenue'}
          <input type="text" inputmode="decimal" autocomplete="off" bind:value={draft.threshold} aria-invalid={errors.threshold ? 'true' : undefined} aria-describedby={described('threshold')} />
        {:else}
          <input type="number" inputmode="numeric" min="0" max={QUALITY_LIMITS.threshold} step="1" bind:value={draft.threshold} aria-invalid={errors.threshold ? 'true' : undefined} aria-describedby={described('threshold')} />
        {/if}
        {@render fieldError('threshold')}
      </label>
      <label>
        <span>{t('qualityForm.period')}</span>
        <select bind:value={draft.days}>
          {#each RULE_DAYS as item (item)}<option value={item}>{periodText(item)}</option>{/each}
        </select>
      </label>
    </div>

    <div class="pair">
      <fieldset>
        <legend>{t('qualityForm.severity')}</legend>
        <label class="option"><input type="radio" name={`${id}-severity`} value="warning" bind:group={draft.severity} /><span>{t('quality.stateWarning')}</span></label>
        <label class="option"><input type="radio" name={`${id}-severity`} value="failure" bind:group={draft.severity} /><span>{t('quality.stateFailure')}</span></label>
      </fieldset>
      <label>
        <span>{t('qualityForm.notify')}</span>
        <select bind:value={draft.notify}>
          {#each _NOTIFY as item (item)}<option value={item}>{t(NOTIFY_LABELS[item])}</option>{/each}
        </select>
      </label>
    </div>

    <label class="option">
      <input type="checkbox" bind:checked={draft.enabled} />
      <span><strong>{t('qualityForm.enabled')}</strong><small class="help">{t('qualityForm.enabledHint')}</small></span>
    </label>

    <label>
      <span>{t('setupForm.note')} <small>{t('setupForm.optional')}</small></span>
      <textarea rows="2" bind:value={draft.note} maxlength={QUALITY_LIMITS.note} aria-invalid={errors.note ? 'true' : undefined} aria-describedby={described('note')}></textarea>
      {@render fieldError('note')}
    </label>

    <p class="notice" role="note">{t(draft.days === 1 ? 'qualityForm.whenDay' : 'qualityForm.whenDays', { zone: timeZone, n: number(draft.days) })} {t('qualityForm.recheck')}</p>
    {#if formError}<p class="field-error" role="alert">{formError}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="button" onclick={onclose}>{t('common.cancel')}</button>
    <button type="submit" form={`${id}-form`} class="primary" aria-disabled={busy}>{existing ? t('setupForm.save') : t('qualityForm.create')}</button>
  {/snippet}
</Modal>

<style>
  .form {
    display: grid;
    gap: 1rem;
  }

  label > span small {
    color: var(--muted);
    font-weight: 400;
  }

  .pair,
  .trio {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
    align-items: start;
  }

  fieldset {
    display: grid;
    gap: 0.35rem;
  }

  [readonly] {
    color: var(--muted);
  }

  .notice {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    font-size: 0.875rem;
    text-wrap: pretty;
  }
</style>
