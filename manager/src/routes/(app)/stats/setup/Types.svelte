<script lang="ts">
import { ROLE_LABELS } from '#lib/analytics.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { SetupView } from '#lib/types.ts';
import { page } from '$app/state';
import Mark from '../Mark.svelte';
import { propertyOf } from '../names.ts';
import { setQuery } from '../query.ts';
import { archive, type EditRequest, remove } from './setup.ts';

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

// Типы — по отправителю: у каждого свой набор, код типа уникален только у своего отправителя.
const sender = $derived(page.url.searchParams.get('sender') ?? '');
const groups = $derived(
  setup.senders
    .filter((_) => sender === '' || _.code === sender)
    .map((owner) => ({
      owner,
      types: setup.types
        .filter((_) => _.sender === owner.code)
        .toSorted(
          (a, b) =>
            Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
            a.name.localeCompare(b.name)
        ),
    }))
);

const done = (changed: boolean) => void (changed && onchanged());
</script>

<div class="list">
  <header class="intro">
    <p>{t('eventTypes.intro')}</p>
    <div class="tools">
      {#if setup.senders.length > 1}
        <label>
          <span class="sr-only">{t('people.sender')}</span>
          <select value={sender} onchange={(e) => setQuery({ sender: e.currentTarget.value || null })}>
            <option value="">{t('people.allSenders')}</option>
            {#each setup.senders as item (item.code)}<option value={item.code}>{item.name}</option>{/each}
          </select>
        </label>
      {/if}
      {#if editable && setup.senders.some((_) => _.archivedAt === null)}
        <button type="button" class="primary" onclick={() => onedit({ group: 'type', item: null, preset: sender ? { sender } : {} })}>{@html icons.plus}{t('eventTypes.new')}</button>
      {/if}
    </div>
  </header>

  {#if setup.senders.length === 0}
    <div class="frame empty"><p>{t('eventTypes.noSenders')}</p></div>
  {/if}

  {#each groups as group (group.owner.code)}
    <section aria-labelledby={`types-${group.owner.code}`}>
      <h3 id={`types-${group.owner.code}`}>{group.owner.name} <code class="muted">{group.owner.code}</code></h3>
      {#if group.types.length === 0}
        <p class="muted none">{t('eventTypes.empty')}</p>
      {:else}
        <div class="scroll frame">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('setupList.name')}</th>
                <th scope="col">{t('setupForm.code')}</th>
                <th scope="col">{t('analytics.role')}</th>
                <th scope="col">{t('setupForm.properties')}</th>
                {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each group.types as type (type.code)}
                <tr class:archived={type.archivedAt !== null}>
                  <td class="name">{type.name} {#if type.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}{#if type.note}<small class="muted">{type.note}</small>{/if}</td>
                  <td><code>{type.code}</code></td>
                  <td class="role">{t(ROLE_LABELS[type.role])}</td>
                  <td class="props">
                    {#each type.properties as property (property.code)}
                      <span class="prop">{propertyOf(setup, 'event', property.code)?.name ?? property.code} {#if property.required}<Mark tone="accent">{t('setupForm.requiredShort')}</Mark>{/if}</span>
                    {:else}
                      <span class="muted">—</span>
                    {/each}
                  </td>
                  {#if editable}
                    <td class="row-actions">
                      <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${type.name}`} onclick={() => onedit({ group: 'type', item: type })}>{@html icons.pencil}{t('setupList.edit')}</button>
                      <button type="button" class="ghost icon" aria-label={`${t(type.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${type.name}`} title={t(type.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('type', type, type.archivedAt === null).then(done)}>{@html icons.restore}</button>
                      <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${type.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'type', type).then(done)}>{@html icons.trash}</button>
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
    gap: 1.5rem;
    min-width: 0;
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
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  section {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  h3 {
    font-size: 1rem;
  }

  h3 code {
    margin-left: 0.25rem;
    font-weight: 400;
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
    min-width: 50rem;
  }

  th,
  td {
    padding: 0.55rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  .archived td {
    color: var(--muted);
  }

  .name {
    min-width: 11rem;
  }

  .role {
    min-width: 8rem;
  }

  .name small {
    display: block;
    max-width: 22rem;
  }

  .props {
    max-width: 20rem;
  }

  .prop {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    margin: 0 0.6rem 0.2rem 0;
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

  .empty {
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }
</style>
