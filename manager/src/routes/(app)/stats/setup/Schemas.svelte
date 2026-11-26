<script lang="ts">
import { schemaLength } from '#lib/analytics.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { partName, senderName } from '../names.ts';
import { archive, type EditRequest, remove } from './setup.ts';

// Схемы меток — по отправителю: порядок частей, разделитель и предел. Из схемы собираются метки переходов и
// генератора, по ней разбираются метки касаний.
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
const row = (schema: SetupView['schemas'][number]) => ({
  ...schema,
  code: schema.sender,
});
const parts = $derived(setup.dictionaries.filter((_) => _.purpose === 'parts'));
// Схему заводят отправителю без схемы.
const free = $derived(
  setup.senders.some(
    (sender) =>
      sender.archivedAt === null &&
      !setup.schemas.some((_) => _.sender === sender.code)
  )
);
</script>

<div class="list">
  <header class="intro">
    <p>{t('schemas.intro')}</p>
    {#if editable && free && parts.length > 0}<button type="button" class="primary" onclick={() => onedit({ group: 'schema', item: null })}>{@html icons.plus}{t('schemas.new')}</button>{/if}
  </header>

  {#if setup.schemas.length === 0}
    <div class="frame empty">
      <p>{t(setup.senders.length === 0 ? 'schemas.emptyNoSenders' : parts.length === 0 ? 'schemas.emptyNoParts' : 'schemas.empty')}</p>
      {#if setup.senders.length === 0}
        <a class="button" href="?tab=senders">{t('setupList.toSenders')}</a>
      {:else if parts.length === 0}
        <a class="button" href="?tab=dictionaries">{t('setupList.toDictionaries')}</a>
      {/if}
    </div>
  {:else}
    <div class="scroll frame">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('schemas.senderColumn')}</th>
            <th scope="col">{t('schemas.parts')}</th>
            <th scope="col">{t('schemas.separator')}</th>
            <th scope="col" class="num">{t('schemas.lengthColumn')}</th>
            {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each setup.schemas as schema (schema.sender)}
            {@const total = schemaLength(setup, schema.separator, schema.parts)}
            <tr class:archived={schema.archivedAt !== null}>
              <td class="name">
                <span>{senderName(setup, schema.sender)} <code class="muted">{schema.sender}</code></span>
                <small class="muted">{schema.name}</small>
                {#if schema.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}
              </td>
              <td class="parts">
                <ol>
                  {#each schema.parts as part (part)}<li>{partName(setup, part)}</li>{/each}
                </ol>
              </td>
              <td><code class="separator">{schema.separator}</code></td>
              <td class="num">{t('schemas.countShort', { total, n: schema.length })}</td>
              {#if editable}
                <td class="row-actions">
                  <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${schema.name}`} onclick={() => onedit({ group: 'schema', item: row(schema) })}>{@html icons.pencil}{t('setupList.edit')}</button>
                  <button type="button" class="ghost icon" aria-label={`${t(schema.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${schema.name}`} title={t(schema.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('schema', row(schema), schema.archivedAt === null).then(done)}>{@html icons.restore}</button>
                  <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${schema.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'schema', row(schema)).then(done)}>{@html icons.trash}</button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .list {
    display: grid;
    gap: 1rem;
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

  .scroll {
    overflow-x: auto;
    /* Свой блок отсчёта: подписи только для читалки (.sr-only) в шапке таблицы прокручиваются вместе с ней, а не
       расширяют страницу на узком экране. */
    position: relative;
  }

  table {
    min-width: 46rem;
  }

  th,
  td {
    padding: 0.55rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: top;
    overflow-wrap: break-word;
  }

  .archived td {
    color: var(--muted);
  }

  .name {
    min-width: 12rem;
  }

  .name small {
    display: block;
  }

  .parts {
    min-width: 14rem;
  }

  .parts ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Части — по порядку: стрелка между ними, не после последней. */
  .parts li + li::before {
    margin-right: 0.35rem;
    color: var(--muted);
    content: '→';
  }

  .separator {
    font-weight: 600;
  }

  .num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
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
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }
</style>
