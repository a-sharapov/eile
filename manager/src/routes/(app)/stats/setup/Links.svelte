<script lang="ts">
import { GO_PREFIX } from '#lib/analytics.ts';
import { goUrl } from '#lib/analytics-urls.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type { SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { partName, partValueName, senderName } from '../names.ts';
import { archive, type EditRequest, remove } from './setup.ts';

// Переходы `/_cms/go/<код>`: куда ведёт кнопка сайта и с какими заданными частями. Переход в архиве работает —
// старые кнопки не ведут на ошибку.
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
const schemas = $derived(setup.schemas.some((_) => _.archivedAt === null));

const copy = (code: string) =>
  navigator.clipboard
    .writeText(goUrl(session.site.url, code))
    .then(() => notify(t('common.copied')), failed);
</script>

<div class="list">
  <header class="intro">
    <p>{t('links.intro')}</p>
    {#if editable && schemas}<button type="button" class="primary" onclick={() => onedit({ group: 'link', item: null })}>{@html icons.plus}{t('links.new')}</button>{/if}
  </header>

  {#if setup.links.length === 0}
    <div class="frame empty">
      <p>{t(schemas ? 'links.empty' : 'links.emptyNoSchemas')}</p>
      {#if !schemas}<a class="button" href="?tab=schemas">{t('setupList.toSchemas')}</a>{/if}
    </div>
  {:else}
    <div class="scroll frame">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('setupList.name')}</th>
            <th scope="col">{t('links.address')}</th>
            <th scope="col">{t('links.target')}</th>
            <th scope="col">{t('links.parts')}</th>
            {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each setup.links as link (link.code)}
            <tr class:archived={link.archivedAt !== null}>
              <td class="name">
                <span>{link.name} {#if link.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}</span>
                <small class="muted">{senderName(setup, link.sender)}</small>
              </td>
              <td class="go">
                <span class="go-row">
                  <code>{GO_PREFIX}{link.code}</code>
                  <button type="button" class="ghost icon" aria-label={t('links.copyAddressOf', { name: link.name })} title={t('links.copyAddress')} onclick={() => copy(link.code)}>{@html icons.copy}</button>
                </span>
              </td>
              <td class="target"><code>{link.target}</code></td>
              <td class="parts">
                {#each Object.entries(link.parts) as entry (entry[0])}
                  <span class="part"><span class="muted">{partName(setup, entry[0])}:</span> {partValueName(setup, entry[0], entry[1])}</span>
                {:else}
                  <span class="muted">—</span>
                {/each}
              </td>
              {#if editable}
                <td class="row-actions">
                  <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${link.name}`} onclick={() => onedit({ group: 'link', item: link })}>{@html icons.pencil}{t('setupList.edit')}</button>
                  <button type="button" class="ghost icon" aria-label={`${t(link.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${link.name}`} title={t(link.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('link', link, link.archivedAt === null).then(done)}>{@html icons.restore}</button>
                  <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${link.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'link', link).then(done)}>{@html icons.trash}</button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="help">{t('links.archiveHint')}</p>
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
    min-width: 56rem;
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
    min-width: 11rem;
  }

  .name > * {
    display: block;
  }

  .go {
    min-width: 10rem;
  }

  .go-row {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .go code {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .go button {
    flex: none;
    width: 2rem;
    min-height: 2rem;
    margin: -0.35rem 0;
  }

  .go :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  /* Адрес назначения — одно слово без пробелов: переносится по знакам, а не распирает столбец. */
  .target {
    min-width: 14rem;
    max-width: 22rem;
  }

  .target code {
    overflow-wrap: anywhere;
  }

  .parts {
    min-width: 10rem;
  }

  .part {
    display: block;
  }

  .help {
    margin: 0;
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
