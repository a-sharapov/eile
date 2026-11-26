<script lang="ts">
import {
  LABEL_LIMITS,
  LABEL_SEPARATORS,
  schemaLength,
} from '#lib/analytics.ts';
import { quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { SetupView } from '#lib/types.ts';
import { partOf } from '../names.ts';
import { type Draft, describedBy } from './drafts.ts';

// Схема метки: разделитель, предел и части по порядку — «выше» и «ниже»; подсчёт длины и пример метки по ходу.
let {
  draft = $bindable(),
  setup,
  errors,
  id,
}: {
  draft: Draft;
  setup: SetupView;
  errors: Readonly<Record<string, string>>;
  id: string;
} = $props();

// Часть в новую ссылку — только не из архива; уже стоящая в схеме остаётся, даже если её убрали в архив.
const free = $derived(
  setup.dictionaries.filter(
    (_) =>
      _.purpose === 'parts' &&
      _.archivedAt === null &&
      !draft.parts.includes(_.code)
  )
);
const anyParts = $derived(
  setup.dictionaries.some((_) => _.purpose === 'parts')
);
const limit = $derived(Number(draft.length) || 0);
const total = $derived(schemaLength(setup, draft.separator, draft.parts));
// Пример — первое значение каждой части не из архива; у части без значений — её код.
const example = $derived(
  draft.parts
    .map(
      (code) =>
        partOf(setup, code)?.values.find((_) => _.archivedAt === null)?.code ??
        code
    )
    .join(draft.separator)
);

let adding = $state('');

const add = () =>
  void (
    adding !== '' &&
    draft.parts.length < LABEL_LIMITS.parts &&
    ((draft.parts = [...draft.parts, adding]), (adding = ''))
  );

const move = (index: number, step: -1 | 1) =>
  ((other) =>
    void (
      other >= 0 &&
      other < draft.parts.length &&
      (draft.parts = draft.parts.map((_, at) =>
        at === index
          ? draft.parts[other]!
          : at === other
            ? draft.parts[index]!
            : _
      ))
    ))(index + step);

const drop = (code: string) =>
  (draft.parts = draft.parts.filter((_) => _ !== code));
</script>

<fieldset aria-describedby={`${id}-separator-hint`}>
  <legend>{t('schemas.separator')}</legend>
  <div class="separators">
    {#each LABEL_SEPARATORS as separator (separator)}
      <label class="choice">
        <input type="radio" name={`${id}-separator`} value={separator} bind:group={draft.separator} />
        <code>{separator}</code>
      </label>
    {/each}
  </div>
  {#if errors.separator}<small id={`${id}-separator-error`} class="field-error" data-error tabindex="-1">{errors.separator}</small>{/if}
  <small id={`${id}-separator-hint`} class="help">{t('schemas.separatorHint')}</small>
</fieldset>

<label class="short">
  <span>{t('schemas.length')}</span>
  <input type="number" inputmode="numeric" min="1" max={LABEL_LIMITS.label} step="1" bind:value={draft.length} aria-invalid={errors.length ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'length')} />
  {#if errors.length}<small id={`${id}-length-error`} class="field-error">{errors.length}</small>{/if}
  <small id={`${id}-length-hint`}>{t('schemas.lengthHelp', { n: LABEL_LIMITS.label })}</small>
</label>

<fieldset aria-describedby={describedBy(id, errors, 'parts')}>
  <legend>{t('schemas.parts')}</legend>
  {#if !anyParts}
    <p class="help">{t('schemas.noParts')}</p>
  {:else}
    {#if draft.parts.length > 0}
      <ol class="rows">
        {#each draft.parts as code, index (code)}
          {@const part = partOf(setup, code)}
          <li>
            <span class="index" aria-hidden="true">{index + 1}</span>
            <span class="what">
              <span>{part?.name ?? code} <code class="muted">{code}</code></span>
              <small class="muted">{[t('schemas.partLimit', { n: part?.length ?? 0 }), ...(part?.utm ? [part.utm] : [])].join(' · ')}</small>
            </span>
            <span class="buttons">
              <button type="button" class="ghost icon" aria-label={t('dictionaries.up', { name: quoted(part?.name ?? code) })} title={t('dictionaries.upShort')} aria-disabled={index === 0} onclick={() => move(index, -1)}>{@html icons.arrowUp}</button>
              <button type="button" class="ghost icon" aria-label={t('dictionaries.down', { name: quoted(part?.name ?? code) })} title={t('dictionaries.downShort')} aria-disabled={index === draft.parts.length - 1} onclick={() => move(index, 1)}>{@html icons.arrowDown}</button>
              <button type="button" class="ghost icon danger" aria-label={t('schemas.removePart', { name: quoted(part?.name ?? code) })} title={t('schemas.removePartShort')} onclick={() => drop(code)}>{@html icons.close}</button>
            </span>
          </li>
        {/each}
      </ol>
    {/if}
    {#if draft.parts.length < LABEL_LIMITS.parts && free.length > 0}
      <div class="add">
        <label>
          <span class="sr-only">{t('schemas.addPart')}</span>
          <select bind:value={adding}>
            <option value="" disabled>{t('schemas.pickPart')}</option>
            {#each free as part (part.code)}<option value={part.code}>{part.name} · {part.code}</option>{/each}
          </select>
        </label>
        <button type="button" aria-disabled={adding === ''} onclick={add}>{@html icons.plus}{t('schemas.addPart')}</button>
      </div>
    {/if}
  {/if}
  {#if errors.parts}<small id={`${id}-parts-error`} class="field-error" data-error tabindex="-1">{errors.parts}</small>{/if}
  <p id={`${id}-parts-hint`} class="count" class:over={total > limit}>
    {t(total > limit ? 'schemas.countOver' : 'schemas.count', { total, n: limit })}
  </p>
  {#if example}
    <p class="example"><span class="muted">{t('schemas.example')}</span> <code>{example}</code></p>
  {/if}
</fieldset>

<style>
  .short input {
    max-width: 12rem;
  }

  .separators {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .choice {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 0.9rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
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

  .choice code {
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .rows {
    display: grid;
    margin: 0;
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    list-style: none;
  }

  .rows li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.4rem 0.4rem 0.4rem 0.75rem;
  }

  .rows li + li {
    border-top: 0.0625rem solid var(--line);
  }

  .index {
    flex: none;
    width: 1.25rem;
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .what {
    display: grid;
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 400;
    overflow-wrap: break-word;
  }

  .what small {
    font-size: 0.8125rem;
  }

  .buttons {
    display: flex;
    flex: none;
  }

  .buttons button {
    width: 2rem;
    min-height: 2rem;
  }

  .buttons :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: end;
  }

  .add label {
    flex: 1 1 14rem;
  }

  .add button :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .count {
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .count.over {
    color: var(--danger);
    font-weight: 550;
  }

  .example {
    margin: 0;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }
</style>
