<script lang="ts">
import { PURPOSE_LABELS } from '#lib/analytics.ts';
import { quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed } from '#lib/notices.svelte.ts';
import type { DictionaryValue, SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { archive, type EditRequest, remove, swap, usersOf } from './setup.ts';

let {
  setup,
  editable,
  onedit,
  onchanged,
}: {
  setup: SetupView;
  editable: boolean;
  onedit: (request: EditRequest) => void;
  onchanged: () => void;
} = $props();

const done = (changed: boolean) => void (changed && onchanged());
let moving = $state(false);

// Порядок значений — их `position`: соседи меняются номерами.
const move = (
  values: readonly DictionaryValue[],
  index: number,
  step: -1 | 1
) =>
  ((value, other) =>
    void (
      value &&
      other &&
      !moving &&
      ((moving = true),
      swap('value', value, other, step)
        .then(onchanged, failed)
        .finally(() => (moving = false)))
    ))(values[index], values[index + step]);
</script>

<div class="list">
  <header class="intro">
    <p>{t('dictionaries.intro')}</p>
    {#if editable}<button type="button" class="primary" onclick={() => onedit({ group: 'dictionary', item: null })}>{@html icons.plus}{t('dictionaries.new')}</button>{/if}
  </header>

  {#if setup.dictionaries.length === 0}
    <div class="frame empty"><p>{t('dictionaries.empty')}</p></div>
  {/if}

  {#each setup.dictionaries as dictionary (dictionary.code)}
    {@const free = usersOf(setup, 'dictionary', dictionary).length === 0}
    <details class="frame" class:archived={dictionary.archivedAt !== null} open={setup.dictionaries.length <= 6}>
      <summary>
        <span class="title">
          <span class="chevron" aria-hidden="true">{@html icons.chevron}</span>
          <strong>{dictionary.name}</strong>
          <code class="muted">{dictionary.code}</code>
        </span>
        <span class="meta">
          <Mark tone={dictionary.purpose === 'values' ? 'plain' : 'accent'}>{t(PURPOSE_LABELS[dictionary.purpose])}</Mark>
          {#if dictionary.purpose === 'parts'}
            <span class="muted">{dictionary.utm ?? t('dictionaries.noUtm')} · {t('schemas.partLimit', { n: dictionary.length ?? 0 })}</span>
          {/if}
          {#if dictionary.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}
          <span class="muted">{tn('dictionaries.values', dictionary.values.length)}</span>
        </span>
      </summary>
      <div class="inside">
        {#if dictionary.note}<p class="muted note">{dictionary.note}</p>{/if}
        {#if editable}
          <div class="actions">
            {#if dictionary.archivedAt === null}<button type="button" onclick={() => onedit({ group: 'value', item: null, preset: { dictionary: dictionary.code } })}>{@html icons.plus}{t('dictionaries.addValue')}</button>{/if}
            <button type="button" class="ghost" onclick={() => onedit({ group: 'dictionary', item: dictionary })}>{@html icons.pencil}{t('setupList.edit')}</button>
            <button type="button" class="ghost" onclick={() => archive('dictionary', dictionary, dictionary.archivedAt === null).then(done)}>{@html icons.restore}{t(dictionary.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}</button>
            {#if free}<button type="button" class="ghost danger" onclick={() => remove(setup, 'dictionary', dictionary).then(done)}>{@html icons.trash}{t('setupList.remove')}</button>{/if}
          </div>
        {/if}
        {#if dictionary.values.length === 0}
          <p class="muted none">{t('dictionaries.noValues')}</p>
        {:else}
          <div class="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col" class="num">{t('dictionaries.position')}</th>
                  <th scope="col">{t('setupList.name')}</th>
                  <th scope="col">{t('setupForm.code')}</th>
                  <th scope="col">{t('setupForm.note')}</th>
                  {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each dictionary.values as value, index (value.code)}
                  <tr class:archived={value.archivedAt !== null}>
                    <td class="num">{value.position}</td>
                    <td>{value.name} {#if value.awaitsSpend}<Mark tone="warn" title={t('setupForm.awaitsSpendHint')}>{t('dictionaries.awaitsSpend')}</Mark>{/if} {#if value.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}</td>
                    <td><code>{value.code}</code></td>
                    <td class="muted note-cell">{value.note || '—'}</td>
                    {#if editable}
                      <td class="row-actions">
                        <button type="button" class="ghost icon" aria-label={t('dictionaries.up', { name: quoted(value.name) })} title={t('dictionaries.upShort')} aria-disabled={index === 0 || moving} onclick={() => move(dictionary.values, index, -1)}>{@html icons.arrowUp}</button>
                        <button type="button" class="ghost icon" aria-label={t('dictionaries.down', { name: quoted(value.name) })} title={t('dictionaries.downShort')} aria-disabled={index === dictionary.values.length - 1 || moving} onclick={() => move(dictionary.values, index, 1)}>{@html icons.arrowDown}</button>
                        <button type="button" class="ghost icon" aria-label={`${t('setupList.edit')}: ${value.name}`} title={t('setupList.edit')} onclick={() => onedit({ group: 'value', item: value })}>{@html icons.pencil}</button>
                        <button type="button" class="ghost icon" aria-label={`${t(value.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${value.name}`} title={t(value.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('value', value, value.archivedAt === null).then(done)}>{@html icons.restore}</button>
                        <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${value.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'value', value).then(done)}>{@html icons.trash}</button>
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </details>
  {/each}
</div>

<style>
  .list {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: start;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .intro p {
    flex: 1 1 24rem;
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.1rem;
    cursor: pointer;
  }

  summary:hover {
    background: color-mix(in oklch, var(--sunken) 60%, transparent);
  }

  .title {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    align-items: baseline;
    min-width: 0;
  }

  .title strong {
    overflow-wrap: anywhere;
  }

  /* Свой маркер раскрытия: у summary с flex системного треугольника нет. */
  .chevron {
    display: inline-flex;
    align-self: center;
    color: var(--muted);
    transition: transform 160ms var(--ease);
  }

  .chevron :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  details[open] .chevron {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }

  .archived .title strong {
    color: var(--muted);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.8125rem;
  }

  .inside {
    display: grid;
    gap: 0.75rem;
    padding: 0 1.1rem 1rem;
  }

  .note {
    margin: 0;
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .actions button {
    min-height: 2.25rem;
    padding: 0 0.65rem;
    font-size: 0.8125rem;
  }

  .actions :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .none {
    margin: 0;
    font-size: 0.875rem;
  }

  .scroll {
    overflow-x: auto;
    /* Свой блок отсчёта: подписи только для читалки (.sr-only) в шапке таблицы прокручиваются вместе с ней, а не
       расширяют страницу на узком экране. */
    position: relative;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
  }

  table {
    min-width: 40rem;
  }

  th,
  td {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  .archived td {
    color: var(--muted);
  }

  .num {
    width: 3.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .note-cell {
    max-width: 18rem;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .row-actions button {
    width: 2rem;
    min-height: 2rem;
    padding: 0;
  }

  .row-actions :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .empty {
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }
</style>
