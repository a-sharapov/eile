<script lang="ts">
import { HOST_TOKEN } from '#lib/analytics.ts';
import { quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type {
  AnalyticsDictionary,
  DictionaryValue,
  SetupView,
} from '#lib/types.ts';
import { partName } from '../names.ts';
import { type Draft, describedBy, nextKey } from './drafts.ts';

// Значения частей парами «часть — значение»: соответствие реферера и заданные части перехода. Значение — из
// справочника части (не из архива; уже стоящее остаётся), у «любого другого сайта» — ещё хост реферера.
let {
  draft = $bindable(),
  setup,
  parts,
  previous,
  host = false,
  errors,
  id,
  legend,
  hint,
  empty,
}: {
  draft: Draft;
  setup: SetupView;
  /** Какие части можно задать, по порядку. */
  parts: readonly (AnalyticsDictionary & { values: DictionaryValue[] })[];
  /** Части прежнего элемента: значение в архиве, уже стоящее в нём, остаётся в выборе. */
  previous: Readonly<Record<string, string>>;
  host?: boolean;
  errors: Readonly<Record<string, string>>;
  id: string;
  legend: string;
  hint: string;
  /** Частей задать нельзя — почему. */
  empty: string;
} = $props();

const choices = (part: string) =>
  (parts.find((_) => _.code === part)?.values ?? []).filter(
    (_) => _.archivedAt === null || previous[part] === _.code
  );

const add = () =>
  ((part) =>
    void (
      part &&
      (draft.pairs = [
        ...draft.pairs,
        { key: nextKey(), part: part.code, value: '' },
      ])
    ))(parts.find((p) => !draft.pairs.some((_) => _.part === p.code)));

const drop = (key: number) =>
  (draft.pairs = draft.pairs.filter((_) => _.key !== key));

const setPart = (key: number, part: string) =>
  (draft.pairs = draft.pairs.map((_) =>
    _.key === key ? { ..._, part, value: '' } : _
  ));
</script>

<fieldset aria-describedby={describedBy(id, errors, 'pairs')}>
  <legend>{legend}</legend>
  {#if parts.length === 0}
    <p class="help">{empty}</p>
  {:else}
    {#if draft.pairs.length > 0}
      <ul class="rows">
        {#each draft.pairs as pair (pair.key)}
          <li>
            <label>
              <span class="sr-only">{t('pairs.part')}</span>
              <select value={pair.part} onchange={(e) => setPart(pair.key, e.currentTarget.value)} aria-invalid={errors.pairs && pair.part === '' ? 'true' : undefined}>
                {#each parts as part (part.code)}
                  <option value={part.code} disabled={part.code !== pair.part && draft.pairs.some((_) => _.part === part.code)}>{part.name}</option>
                {/each}
              </select>
            </label>
            <span class="dash" aria-hidden="true">—</span>
            <label>
              <span class="sr-only">{t('pairs.valueOf', { name: quoted(partName(setup, pair.part)) })}</span>
              <select bind:value={pair.value} aria-invalid={errors.pairs && pair.value === '' ? 'true' : undefined}>
                <option value="" disabled>{t('setupForm.pick')}</option>
                {#if host}<option value={HOST_TOKEN}>{t('analytics.hostValue')}</option>{/if}
                {#each choices(pair.part) as value (value.code)}<option value={value.code}>{value.name} · {value.code}</option>{/each}
              </select>
            </label>
            <button type="button" class="ghost icon danger" aria-label={t('pairs.remove', { name: quoted(partName(setup, pair.part)) })} title={t('pairs.removeShort')} onclick={() => drop(pair.key)}>{@html icons.close}</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if draft.pairs.length < parts.length}
      <button type="button" class="add" onclick={add}>{@html icons.plus}{t('pairs.add')}</button>
    {/if}
  {/if}
  {#if errors.pairs}<small id={`${id}-pairs-error`} class="field-error" data-error tabindex="-1">{errors.pairs}</small>{/if}
  <small id={`${id}-pairs-hint`} class="help">{hint}</small>
</fieldset>

<style>
  .rows {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.3fr) auto;
    gap: 0.5rem;
    align-items: center;
  }

  .dash {
    color: var(--muted);
  }

  .rows button {
    width: 2.25rem;
    min-height: 2.25rem;
  }

  .rows :global(svg),
  .add :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .add {
    justify-self: start;
  }

  /* Узкий экран: часть над значением, пары разделены чертой — видно, какое значение чьё. */
  @media (max-width: 30rem) {
    .rows {
      gap: 0.6rem;
    }

    .rows li {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .rows li + li {
      padding-top: 0.6rem;
      border-top: 0.0625rem solid var(--line);
    }

    .dash {
      display: none;
    }

    .rows li > label:nth-of-type(2) {
      grid-column: 1;
    }

    .rows li > button {
      grid-row: 1 / span 2;
      grid-column: 2;
    }
  }
</style>
