<script lang="ts">
import { tick } from 'svelte';
import { api } from '#lib/api.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type { SetupView, SpendSaved, SpendView } from '#lib/types.ts';
import { partName } from '../names.ts';
import {
  checkDrafts,
  inputOf,
  NOTE_LIMIT,
  partsOrder,
  type SpendDraft,
} from './spend.ts';

// Форма строк расхода: правка одной строки на месте или новые строки месяца (добавленные, по подсказке, копия
// прошлого месяца) — одной пачкой, все или ни одной. Части — значения справочников без архива (прежнее значение
// правки остаётся в выборе), часть можно оставить пустой; сумма — текстом: точка или запятая. Enter сохраняет,
// Esc у правки отменяет.
let {
  drafts = $bindable(),
  setup,
  currencies,
  existing,
  mode,
  onsaved,
  oncancel,
}: {
  drafts: SpendDraft[];
  setup: SetupView;
  /** Валюты сайта — первыми в выборе; ниже — все валюты ISO 4217. */
  currencies: {
    readonly site: readonly string[];
    readonly all: readonly string[];
  };
  /** Строки месяца: повтор ключа — ошибка до отправки, а не тихая замена суммы. */
  existing: readonly SpendView[];
  mode: 'edit' | 'new';
  onsaved: () => void;
  oncancel: () => void;
} = $props();

const id = $props.id();
let busy = $state(false);
let formError = $state<string | null>(null);
let element = $state<HTMLFormElement>();

const _FIELDS = ['parts', 'currency', 'amount', 'note'] as const;
// Ошибка поля исчезает, как только поле изменили; у частей — вместе с валютой: ключ строки — части и валюта.
const fieldErrors = defineFieldErrors((field) =>
  ((key, name) =>
    ((draft) =>
      draft === undefined
        ? null
        : name === 'parts'
          ? [draft.parts, draft.currency]
          : draft[name as (typeof _FIELDS)[number]])(
      drafts.find((_) => String(_.key) === key)
    ))(field.slice(0, field.indexOf('.')), field.slice(field.indexOf('.') + 1))
);
const errors = $derived(fieldErrors.current);

// Части: по порядку схем; часть в архиве — только если стоит в строке.
const parts = $derived(
  partsOrder(
    setup,
    new Set(
      drafts.flatMap((_) =>
        Object.keys(_.parts).filter((key) => _.parts[key] !== '')
      )
    )
  )
);

const valuesOf = (part: string, current: string) =>
  (setup.dictionaries.find((_) => _.code === part)?.values ?? []).filter(
    (_) => _.archivedAt === null || _.code === current
  );

const known = (part: string, value: string) =>
  value === '' || valuesOf(part, value).some((_) => _.code === value);

const field = (draft: SpendDraft, name: string) => `${draft.key}.${name}`;
const describedBy = (draft: SpendDraft, name: string, hint = false) =>
  [
    errors[field(draft, name)] ? `${id}-${draft.key}-${name}-error` : '',
    hint ? `${id}-${draft.key}-${name}-hint` : '',
  ]
    .filter(Boolean)
    .join(' ') || undefined;

const showErrors = (found: Record<string, string>) =>
  tick().then(
    () => (
      fieldErrors.show(found),
      tick().then(() =>
        element?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      )
    )
  );

const save = (event: SubmitEvent) => {
  event.preventDefault();
  const next = $state.snapshot(drafts) as SpendDraft[];
  const found = checkDrafts(next, existing);
  void (Object.keys(found).length > 0
    ? showErrors(found)
    : busy ||
      ((busy = true),
      (formError = null),
      api
        .send<SpendSaved>('PUT', '/analytics/spend', {
          rows: next.map(inputOf),
        })
        .then(
          (saved) => (
            notify(
              mode === 'edit'
                ? t('spend.savedOne')
                : tn('spend.saved', saved.rows.length)
            ),
            onsaved()
          ),
          (error) => void (formError = describe(error))
        )
        .finally(() => (busy = false))));
};

// Новая строка в форме — фокус на её первое поле; правка на месте — на сумму: щёлкнувший видит, куда печатать.
let shownDrafts = 0;
$effect(() => {
  const count = drafts.length;
  void (
    count > shownDrafts &&
    tick().then(() =>
      element
        ?.querySelector<HTMLElement>(
          mode === 'edit'
            ? 'input[inputmode=decimal]'
            : 'fieldset:last-of-type select, fieldset:last-of-type input'
        )
        ?.focus()
    )
  );
  shownDrafts = count;
});

const remove = (key: number) =>
  void ((drafts = drafts.filter((_) => _.key !== key)),
  drafts.length === 0 && oncancel());

const keydown = (event: KeyboardEvent) =>
  void (
    event.key === 'Escape' &&
    mode === 'edit' &&
    (event.preventDefault(), oncancel())
  );
</script>

<!-- Esc у правки — отмена: клавиша приходит от поля внутри формы, сама форма фокуса не берёт. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="spend-form" class:edit={mode === 'edit'} novalidate onsubmit={save} onkeydown={keydown} oninput={() => (formError = null)} bind:this={element} aria-label={t(mode === 'edit' ? 'spend.editRow' : 'spend.newRows')}>
  {#each drafts as draft, index (draft.key)}
    <fieldset class="draft">
      <legend class={mode === 'edit' ? 'sr-only' : ''}>{mode === 'edit' ? t('spend.editRow') : t('spend.rowN', { n: index + 1 })}</legend>
      <div class="fields">
        {#each parts as part (part)}
          {@const current = draft.parts[part] ?? ''}
          <label>
            <span>{partName(setup, part)}</span>
            <select value={current} onchange={(e) => (draft.parts = { ...draft.parts, [part]: e.currentTarget.value })} aria-invalid={errors[field(draft, 'parts')] ? 'true' : undefined} aria-describedby={describedBy(draft, 'parts')}>
              <option value="">{t('spend.anyValue')}</option>
              {#each valuesOf(part, current) as value (value.code)}<option value={value.code}>{value.archivedAt ? t('spend.archivedOption', { name: value.name }) : value.name}</option>{/each}
              {#if !known(part, current)}<option value={current}>{t('spend.unknownOption', { code: current })}</option>{/if}
            </select>
          </label>
        {/each}
        <label class="amount">
          <span>{t('spend.amount')}</span>
          <input type="text" inputmode="decimal" autocomplete="off" bind:value={draft.amount} aria-invalid={errors[field(draft, 'amount')] ? 'true' : undefined} aria-describedby={describedBy(draft, 'amount')} />
        </label>
        <label class="currency">
          <span>{t('spend.currency')}</span>
          <select bind:value={draft.currency} aria-invalid={errors[field(draft, 'currency')] ? 'true' : undefined} aria-describedby={describedBy(draft, 'currency')}>
            {#if draft.currency === ''}<option value="" disabled>{t('setupForm.pick')}</option>{/if}
            <optgroup label={t('spend.siteCurrencies')}>
              {#each currencies.site as code (code)}<option value={code}>{code}</option>{/each}
            </optgroup>
            <optgroup label={t('spend.allCurrencies')}>
              {#each currencies.all.filter((_) => !currencies.site.includes(_)) as code (code)}<option value={code}>{code}</option>{/each}
            </optgroup>
          </select>
        </label>
        <label class="note">
          <span>{t('spend.note')} <small>{t('setupForm.optional')}</small></span>
          <input type="text" maxlength={NOTE_LIMIT} bind:value={draft.note} aria-invalid={errors[field(draft, 'note')] ? 'true' : undefined} aria-describedby={describedBy(draft, 'note')} />
        </label>
        {#if mode === 'new'}
          <button type="button" class="ghost icon remove" aria-label={t('spend.removeDraft', { n: index + 1 })} title={t('spend.removeDraft', { n: index + 1 })} onclick={() => remove(draft.key)}>{@html icons.close}</button>
        {/if}
      </div>
      {#each _FIELDS as name (name)}
        {#if errors[field(draft, name)]}<small id={`${id}-${draft.key}-${name}-error`} class="field-error">{errors[field(draft, name)]}</small>{/if}
      {/each}
    </fieldset>
  {/each}

  <p class="help rule">{t('spend.rule')}</p>
  {#if formError}<p class="field-error" role="alert">{formError}</p>{/if}

  <div class="actions">
    <button type="submit" class="primary" aria-disabled={busy}>{mode === 'edit' ? t('spend.saveRow') : tn('spend.saveRows', drafts.length)}</button>
    <button type="button" onclick={oncancel}>{t('common.cancel')}</button>
  </div>
</form>

<style>
  .spend-form {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.85rem 1rem;
    border: 0.0625rem solid color-mix(in oklch, var(--accent) 30%, var(--line));
    border-radius: var(--radius-l);
    background: color-mix(in oklch, var(--surface), var(--accent-soft) 35%);
  }

  .spend-form.edit {
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius);
  }

  .draft {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .draft + .draft {
    padding-top: 0.75rem;
    border-top: 0.0625rem dashed var(--line);
  }

  legend {
    margin-bottom: 0.4rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.5rem 0.75rem;
    align-items: end;
  }

  .fields label {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .fields label > span {
    font-size: 0.8125rem;
  }

  .fields label > span small {
    color: var(--muted);
    font-weight: 400;
  }

  .fields select,
  .fields input {
    width: 100%;
    min-width: 0;
  }

  .amount input {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .note {
    grid-column: span 2;
  }

  .remove {
    justify-self: start;
  }

  .rule {
    max-width: 52rem;
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Узкий экран: поля друг под другом во всю ширину. */
  @container (width < 30rem) {
    .fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .note {
      grid-column: auto;
    }
  }
</style>
