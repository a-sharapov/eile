<script lang="ts">
import { KIND_LABELS, RECONCILE_LABELS } from '#lib/analytics.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type {
  AnalyticsProperty,
  PropertyScope,
  SetupView,
} from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { dictionaryOf } from '../names.ts';
import { archive, type EditRequest, remove, usersOf } from './setup.ts';

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

// Свойства событий (поля `data`) и признаки человека (`traits`) — одна группа настройки с двумя областями.
const _SCOPES: readonly {
  scope: PropertyScope;
  title: 'properties.events' | 'properties.traits';
  hint: 'properties.eventsHint' | 'properties.traitsHint';
}[] = [
  { scope: 'event', title: 'properties.events', hint: 'properties.eventsHint' },
  {
    scope: 'person',
    title: 'properties.traits',
    hint: 'properties.traitsHint',
  },
];

const listOf = (scope: PropertyScope): AnalyticsProperty[] =>
  setup.properties
    .filter((_) => _.scope === scope)
    .toSorted(
      (a, b) =>
        Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
        a.name.localeCompare(b.name)
    );

const done = (changed: boolean) => void (changed && onchanged());
</script>

<div class="list">
  <p class="sensitive" role="note">{@html icons.alert}<span>{t('setupForm.sensitive')}</span></p>

  {#each _SCOPES as area (area.scope)}
    <section aria-labelledby={`properties-${area.scope}`}>
      <header class="intro">
        <div>
          <h3 id={`properties-${area.scope}`}>{t(area.title)}</h3>
          <p>{t(area.hint)}</p>
        </div>
        {#if editable}
          <button type="button" class={area.scope === 'event' ? 'primary' : ''} onclick={() => onedit({ group: 'property', item: null, preset: { scope: area.scope } })}>{@html icons.plus}{t(area.scope === 'event' ? 'properties.newEvent' : 'properties.newTrait')}</button>
        {/if}
      </header>
      {#if listOf(area.scope).length === 0}
        <p class="muted none">{t('properties.empty')}</p>
      {:else}
        <div class="scroll frame">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('setupList.name')}</th>
                <th scope="col">{t('setupForm.code')}</th>
                <th scope="col">{t('setupForm.kind')}</th>
                <th scope="col">{t('setupForm.marks')}</th>
                {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each listOf(area.scope) as property (property.code)}
                <tr class:archived={property.archivedAt !== null}>
                  <td class="name">{property.name} {#if property.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}{#if property.note}<small class="muted">{property.note}</small>{/if}</td>
                  <td><code>{property.code}</code></td>
                  <td class="kind">{t(KIND_LABELS[property.kind])}{#if property.kind === 'choice' && property.dictionary}<small class="muted">{dictionaryOf(setup, property.dictionary)?.name ?? property.dictionary}</small>{/if}</td>
                  <td class="marks">
                    {#if property.dimension}<Mark tone="accent">{t('setupForm.dimension')}</Mark>{/if}
                    {#if property.untrusted}<Mark tone="warn">{t('setupForm.untrusted')}</Mark>{/if}
                    {#if property.reconcile}<Mark tone="ok" title={t('reconcile.hint')}>{t('reconcile.mark', { mark: t(RECONCILE_LABELS[property.reconcile]) })}</Mark>{/if}
                    {#if !property.dimension && !property.untrusted && !property.reconcile}<span class="muted">—</span>{/if}
                  </td>
                  {#if editable}
                    <td class="row-actions">
                      <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${property.name}`} onclick={() => onedit({ group: 'property', item: property })}>{@html icons.pencil}{t('setupList.edit')}</button>
                      <button type="button" class="ghost icon" aria-label={`${t(property.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${property.name}`} title={t(property.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('property', property, property.archivedAt === null).then(done)}>{@html icons.restore}</button>
                      {#if usersOf(setup, 'property', property).length === 0}
                        <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${property.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'property', property).then(done)}>{@html icons.trash}</button>
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  .list {
    display: grid;
    gap: 1.75rem;
    min-width: 0;
  }

  .sensitive {
    display: flex;
    gap: 0.5rem;
    align-items: start;
    max-width: 52rem;
    margin: 0;
    padding: 0.7rem 0.9rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .sensitive :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin-top: 0.15rem;
    color: var(--warn-text);
  }

  section {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: end;
    justify-content: space-between;
  }

  .intro div {
    flex: 1 1 24rem;
    max-width: 46rem;
  }

  h3 {
    font-size: 1rem;
  }

  .intro p {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
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
  }

  table {
    min-width: 48rem;
  }

  th,
  td {
    padding: 0.55rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  td small {
    display: block;
  }

  .archived td {
    color: var(--muted);
  }

  .name {
    min-width: 11rem;
  }

  .kind {
    min-width: 9rem;
  }

  .name small {
    max-width: 22rem;
  }

  .marks :global(.mark) {
    margin: 0 0.25rem 0.2rem 0;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .row-actions button {
    min-height: 2rem;
    padding: 0 0.55rem;
    font-size: 0.8125rem;
  }

  .row-actions button.icon {
    width: 2rem;
    padding: 0;
  }

  .row-actions :global(svg) {
    width: 1rem;
    height: 1rem;
  }
</style>
