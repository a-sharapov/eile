<script lang="ts">
import { tick } from 'svelte';
import { api } from '#lib/api.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { number, quoted, t } from '#lib/i18n.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type { CheckNotify, CheckView } from '#lib/types.ts';
import Modal from '../Modal.svelte';
import {
  type CorrectionDraft,
  correctionBody,
  correctionDraftOf,
  correctionProblems,
} from './drafts.ts';
import { NOTIFY_LABELS, paramText } from './labels.ts';
import {
  builtinCheck,
  CHECK_ABOUT_KEYS,
  checkName,
  PARAM_RANGES,
  QUALITY_LIMITS,
} from './quality.ts';

// Поправка встроенной проверки: включена ли, когда уведомлять, пороги в пределах сервера, заметка. Сохранение
// повышает ревизию: такт перепроверит последние 7 суток по новым порогам без уведомлений о прошлом.
let {
  check,
  checks,
  onclose,
  onsaved,
}: {
  check: CheckView | null;
  checks: readonly CheckView[];
  onclose: () => void;
  onsaved: () => void;
} = $props();

let draft = $state<CorrectionDraft>({
  code: '',
  enabled: true,
  notify: 'failure',
  note: '',
  params: {},
});
let busy = $state(false);
let formError = $state<string | null>(null);
let element = $state<HTMLFormElement>();
const id = $props.id();

const fieldErrors = defineFieldErrors((field) =>
  field.startsWith('params.') ? draft.params[field.slice(7)] : draft.note
);
const errors = $derived(fieldErrors.current);

$effect(() => {
  const next = check;
  void (
    next &&
    (fieldErrors.clear(), (formError = null), (draft = correctionDraftOf(next)))
  );
});

const spec = $derived(check ? builtinCheck(check.code) : null);
const _NOTIFY: readonly CheckNotify[] = ['failure', 'any', 'off'];

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  ((found) =>
    void (Object.keys(found).length > 0
      ? (fieldErrors.show(found),
        tick().then(() =>
          element?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
        ))
      : busy ||
        ((busy = true),
        (formError = null),
        api
          .send('PUT', '/analytics/setup/check', correctionBody(draft))
          .then(
            () => (notify(t('setupForm.saved')), onsaved()),
            (_) => void (formError = describe(_))
          )
          .finally(() => (busy = false)))))(
    correctionProblems($state.snapshot(draft) as CorrectionDraft)
  )
);
</script>

<Modal open={check !== null} title={check ? t('qualityForm.editBuiltin', { name: quoted(checkName(check.code, checks)) }) : ''} {onclose}>
  {#if check && spec}
    <form id={`${id}-form`} class="form" novalidate onsubmit={save} bind:this={element}>
      <p class="about">{t(CHECK_ABOUT_KEYS[check.code] ?? 'quality.aboutUnknown')}</p>
      <label class="option">
        <input type="checkbox" bind:checked={draft.enabled} />
        <span><strong>{t('qualityForm.enabled')}</strong><small class="help">{t('qualityForm.enabledHint')}</small></span>
      </label>
      <fieldset>
        <legend>{t('qualityForm.notify')}</legend>
        {#each _NOTIFY as item (item)}
          <label class="option"><input type="radio" name={`${id}-notify`} value={item} bind:group={draft.notify} /><span>{t(NOTIFY_LABELS[item])}</span></label>
        {/each}
      </fieldset>
      {#each Object.entries(spec.params) as entry (entry[0])}
        {@const range = PARAM_RANGES[entry[1]]}
        <label>
          <span>{paramText(entry[0])}</span>
          <input type="number" inputmode={range.tenths ? 'decimal' : 'numeric'} min={range.min} max={range.max} step={range.tenths ? '0.1' : '1'} bind:value={draft.params[entry[0]]} aria-invalid={errors[`params.${entry[0]}`] ? 'true' : undefined} aria-describedby={`${id}-${entry[0]}-hint`} />
          {#if errors[`params.${entry[0]}`]}<small id={`${id}-${entry[0]}-hint`} class="field-error">{errors[`params.${entry[0]}`]}</small>{:else}<small id={`${id}-${entry[0]}-hint`}>{t('qualityForm.paramHint', { min: number(range.min), max: number(range.max), core: number(spec.defaults[entry[0]] ?? 0) })}</small>{/if}
        </label>
      {/each}
      {#if Object.keys(spec.params).length === 0}<p class="help">{t('qualityForm.noParams')}</p>{/if}
      <label>
        <span>{t('setupForm.note')} <small>{t('setupForm.optional')}</small></span>
        <textarea rows="2" bind:value={draft.note} maxlength={QUALITY_LIMITS.note} aria-invalid={errors.note ? 'true' : undefined}></textarea>
        {#if errors.note}<small class="field-error">{errors.note}</small>{/if}
      </label>
      <p class="notice" role="note">{t('qualityForm.recheck')}</p>
      {#if formError}<p class="field-error" role="alert">{formError}</p>{/if}
    </form>
  {/if}
  {#snippet footer()}
    <button type="button" onclick={onclose}>{t('common.cancel')}</button>
    <button type="submit" form={`${id}-form`} class="primary" aria-disabled={busy}>{t('setupForm.save')}</button>
  {/snippet}
</Modal>

<style>
  .form {
    display: grid;
    gap: 1rem;
  }

  .about {
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  label > span small {
    color: var(--muted);
    font-weight: 400;
  }

  fieldset {
    display: grid;
    gap: 0.35rem;
  }

  .notice {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    font-size: 0.875rem;
  }
</style>
