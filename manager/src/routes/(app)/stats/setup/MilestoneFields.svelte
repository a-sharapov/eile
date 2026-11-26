<script lang="ts">
import { ITEM_LIMITS } from '#lib/analytics.ts';
import { t } from '#lib/i18n.ts';
import type { PropertyKind, SetupView } from '#lib/types.ts';
import { propertyOf, typeOf } from '../names.ts';
import { type Draft, describedBy } from './drafts.ts';
import type { SetupRow } from './setup.ts';

// Веха: тип события, сколько событий, условие на свойство типа, окно и от чего оно, столбец в «Источниках».
let {
  draft = $bindable(),
  setup,
  existing,
  errors,
  id,
}: {
  draft: Draft;
  setup: SetupView;
  existing: SetupRow | null;
  errors: Readonly<Record<string, string>>;
  id: string;
} = $props();

// «Не меньше» — у числа; «равно» — у выбора, «да или нет» и числа.
const _KINDS: Readonly<Record<'gte' | 'eq', readonly PropertyKind[]>> = {
  gte: ['number'],
  eq: ['choice', 'boolean', 'number'],
};

// В новую ссылку — только не из архива; прежний тип или отправитель остаётся в выборе.
const senders = $derived(
  setup.senders.filter(
    (sender) =>
      (sender.archivedAt === null || existing?.sender === sender.code) &&
      setup.types.some((_) => _.sender === sender.code)
  )
);
const types = $derived(
  setup.types.filter(
    (_) =>
      _.sender === draft.sender &&
      (_.archivedAt === null ||
        (existing?.sender === _.sender &&
          (existing?.type === _.code || existing?.anchor === _.code)))
  )
);
const type = $derived(typeOf(setup, draft.sender, draft.type));
const declared = $derived(
  (type?.properties ?? []).flatMap((_) =>
    ((property) => (property ? [property] : []))(
      propertyOf(setup, 'event', _.code)
    )
  )
);
const fitting = (mode: 'gte' | 'eq') =>
  declared.filter((_) => _KINDS[mode].includes(_.kind));
const property = $derived(propertyOf(setup, 'event', draft.property));
const values = $derived(
  (
    setup.dictionaries.find((_) => _.code === property?.dictionary)?.values ??
    []
  ).filter(
    (_) =>
      _.archivedAt === null ||
      (existing?.condition as { eq?: unknown } | null)?.eq === _.code
  )
);

const pickSender = (sender: string) => (
  (draft.sender = sender),
  (draft.type = ''),
  (draft.anchor = ''),
  (draft.property = ''),
  (draft.value = '')
);

const pickType = (code: string) => (
  (draft.type = code),
  void (
    typeOf(setup, draft.sender, code)?.properties.some(
      (_) => _.code === draft.property
    ) || ((draft.property = ''), (draft.value = ''))
  )
);

const pickMode = (mode: Draft['condition']) => (
  (draft.condition = mode),
  void (
    (mode === 'none' ||
      !fitting(mode).some((_) => _.code === draft.property)) &&
    (draft.property = '')
  ),
  (draft.value = '')
);

const pickProperty = (code: string) => (
  (draft.property = code), (draft.value = '')
);

const _MODES: readonly {
  mode: Draft['condition'];
  label:
    | 'milestones.conditionNone'
    | 'milestones.modeGte'
    | 'milestones.modeEq';
}[] = [
  { mode: 'none', label: 'milestones.conditionNone' },
  { mode: 'gte', label: 'milestones.modeGte' },
  { mode: 'eq', label: 'milestones.modeEq' },
];
</script>

<div class="pair">
  <label>
    <span>{t('milestones.sender')}</span>
    <select value={draft.sender} onchange={(e) => pickSender(e.currentTarget.value)} aria-invalid={errors.sender ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'sender', false)}>
      <option value="" disabled>{t('setupForm.pick')}</option>
      {#each senders as sender (sender.code)}<option value={sender.code}>{sender.name}</option>{/each}
    </select>
    {#if errors.sender}<small id={`${id}-sender-error`} class="field-error">{errors.sender}</small>{/if}
  </label>
  <label>
    <span>{t('milestones.type')}</span>
    <select value={draft.type} onchange={(e) => pickType(e.currentTarget.value)} disabled={draft.sender === ''} aria-invalid={errors.type ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'type', false)}>
      <option value="" disabled>{t('setupForm.pick')}</option>
      {#each types as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
    </select>
    {#if errors.type}<small id={`${id}-type-error`} class="field-error">{errors.type}</small>{/if}
  </label>
</div>

<label class="short">
  <span>{t('milestones.count')}</span>
  <input type="number" inputmode="numeric" min="1" max={ITEM_LIMITS.milestoneCount} step="1" bind:value={draft.count} aria-invalid={errors.count ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'count')} />
  {#if errors.count}<small id={`${id}-count-error`} class="field-error">{errors.count}</small>{/if}
  <small id={`${id}-count-hint`}>{t('milestones.countHelp')}</small>
</label>

<fieldset aria-describedby={describedBy(id, errors, 'condition')}>
  <legend>{t('milestones.condition')}</legend>
  <div class="modes">
    {#each _MODES as item (item.mode)}
      {@const off = item.mode !== 'none' && fitting(item.mode).length === 0}
      <label class="choice" class:off>
        <input type="radio" name={`${id}-condition`} value={item.mode} checked={draft.condition === item.mode} disabled={off} onchange={() => pickMode(item.mode)} />
        {t(item.label)}
      </label>
    {/each}
  </div>
  {#if draft.condition !== 'none'}
    <div class="pair">
      <label>
        <span>{t('milestones.property')}</span>
        <select value={draft.property} onchange={(e) => pickProperty(e.currentTarget.value)} aria-invalid={errors.condition && draft.property === '' ? 'true' : undefined}>
          <option value="" disabled>{t('setupForm.pick')}</option>
          {#each fitting(draft.condition) as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
        </select>
      </label>
      <label>
        <span>{t(draft.condition === 'gte' ? 'milestones.atLeast' : 'milestones.equals')}</span>
        {#if draft.condition === 'eq' && property?.kind === 'choice'}
          <select bind:value={draft.value} aria-invalid={errors.condition && draft.value === '' ? 'true' : undefined}>
            <option value="" disabled>{t('setupForm.pick')}</option>
            {#each values as value (value.code)}<option value={value.code}>{value.name} · {value.code}</option>{/each}
          </select>
        {:else if draft.condition === 'eq' && property?.kind === 'boolean'}
          <select bind:value={draft.value} aria-invalid={errors.condition && draft.value === '' ? 'true' : undefined}>
            <option value="" disabled>{t('setupForm.pick')}</option>
            <option value="true">{t('common.yes')}</option>
            <option value="false">{t('common.no')}</option>
          </select>
        {:else}
          <input type="number" inputmode="decimal" step="any" bind:value={draft.value} disabled={draft.property === ''} aria-invalid={errors.condition && draft.property !== '' ? 'true' : undefined} />
        {/if}
      </label>
    </div>
  {/if}
  {#if errors.condition}<small id={`${id}-condition-error`} class="field-error" data-error tabindex="-1">{errors.condition}</small>{/if}
  <small id={`${id}-condition-hint`} class="help">{t(declared.length === 0 && draft.type !== '' ? 'milestones.noProperties' : 'milestones.conditionHint')}</small>
</fieldset>

<fieldset aria-describedby={describedBy(id, errors, 'days')}>
  <legend>{t('milestones.window')}</legend>
  <div class="window">
    <label class="days">
      <span class="sr-only">{t('milestones.days')}</span>
      <input type="number" inputmode="numeric" min="1" max={ITEM_LIMITS.milestoneDays} step="1" bind:value={draft.days} disabled={draft.forever} aria-invalid={errors.days ? 'true' : undefined} />
      <span class="unit" aria-hidden="true">{t('milestones.daysUnit')}</span>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={draft.forever} />
      {t('milestones.forever')}
    </label>
  </div>
  {#if errors.days}<small id={`${id}-days-error`} class="field-error">{errors.days}</small>{/if}
  <small id={`${id}-days-hint`} class="help">{t('milestones.windowHint', { n: ITEM_LIMITS.milestoneDays })}</small>
</fieldset>

<label>
  <span>{t('milestones.anchor')}</span>
  <select bind:value={draft.anchor} disabled={draft.sender === ''} aria-invalid={errors.anchor ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'anchor')}>
    <option value="">{t('milestones.anchorArrival')}</option>
    {#each types as item (item.code)}<option value={item.code}>{t('milestones.anchorType', { name: item.name })}</option>{/each}
  </select>
  {#if errors.anchor}<small id={`${id}-anchor-error`} class="field-error">{errors.anchor}</small>{/if}
  <small id={`${id}-anchor-hint`}>{t('milestones.anchorHint')}</small>
</label>

<label class="option">
  <input type="checkbox" bind:checked={draft.column} />
  <span><strong>{t('milestones.column')}</strong><small class="help">{t('milestones.columnHint')}</small></span>
</label>

<style>
  .short input {
    max-width: 12rem;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
  }

  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .choice {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 0.85rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    font-weight: 400;
    cursor: pointer;
  }

  .choice:has(:checked) {
    border-color: color-mix(in oklch, var(--accent) 45%, var(--line));
    background: color-mix(in oklch, var(--accent-soft) 45%, var(--surface));
  }

  .choice:has(:focus-visible) {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.125rem;
  }

  .choice.off {
    opacity: 0.55;
    cursor: default;
  }

  .window {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: center;
  }

  .days {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .days input {
    width: 6.5rem;
  }

  .unit {
    color: var(--muted);
    font-weight: 400;
  }
</style>
