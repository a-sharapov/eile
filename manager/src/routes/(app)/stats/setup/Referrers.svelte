<script lang="ts">
import { REFERRER_KIND_LABELS, REFERRER_KINDS } from '#lib/analytics.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { partName, partValueName } from '../names.ts';
import { archive, type EditRequest, remove } from './setup.ts';

// Соответствия рефереров: какие части получает посещение без UTM — по хосту сайта, с любого другого сайта и при
// прямом заходе. Порядок — хосты по алфавиту, затем «любой сайт» и «прямой заход».
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
const rules = $derived(
  setup.referrers.toSorted(
    (a, b) =>
      REFERRER_KINDS.indexOf(a.kind) - REFERRER_KINDS.indexOf(b.kind) ||
      (a.host ?? '').localeCompare(b.host ?? '')
  )
);
const parts = $derived(setup.dictionaries.some((_) => _.purpose === 'parts'));
</script>

<div class="list">
  <header class="intro">
    <p>{t('referrers.intro')}</p>
    {#if editable && parts}<button type="button" class="primary" onclick={() => onedit({ group: 'referrer', item: null })}>{@html icons.plus}{t('referrers.new')}</button>{/if}
  </header>

  {#if rules.length === 0}
    <div class="frame empty">
      <p>{t(parts ? 'referrers.empty' : 'referrers.emptyNoParts')}</p>
      {#if !parts}<a class="button" href="?tab=dictionaries">{t('setupList.toDictionaries')}</a>{/if}
    </div>
  {:else}
    <div class="scroll frame">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('setupList.name')}</th>
            <th scope="col">{t('referrers.kind')}</th>
            <th scope="col">{t('referrers.parts')}</th>
            {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each rules as rule (rule.code)}
            <tr class:archived={rule.archivedAt !== null}>
              <td class="name">
                <span>{rule.name} {#if rule.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}</span>
                <code class="muted">{rule.code}</code>
              </td>
              <td class="kind">{#if rule.kind === 'host'}<code>{rule.host}</code><small class="muted">{t('referrers.hostAndSubdomains')}</small>{:else}{t(REFERRER_KIND_LABELS[rule.kind])}{/if}</td>
              <td class="parts">
                {#each Object.entries(rule.parts) as entry (entry[0])}
                  <span class="part"><span class="muted">{partName(setup, entry[0])}:</span> {partValueName(setup, entry[0], entry[1])}</span>
                {:else}
                  <span class="muted">{t('referrers.noValues')}</span>
                {/each}
              </td>
              {#if editable}
                <td class="row-actions">
                  <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${rule.name}`} onclick={() => onedit({ group: 'referrer', item: rule })}>{@html icons.pencil}{t('setupList.edit')}</button>
                  <button type="button" class="ghost icon" aria-label={`${t(rule.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${rule.name}`} title={t(rule.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('referrer', rule, rule.archivedAt === null).then(done)}>{@html icons.restore}</button>
                  <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${rule.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'referrer', rule).then(done)}>{@html icons.trash}</button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="help">{t('referrers.utmFirst')}</p>
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
    min-width: 44rem;
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

  .kind {
    min-width: 11rem;
  }

  .kind small {
    display: block;
  }

  .parts {
    min-width: 13rem;
  }

  .part {
    display: inline-block;
    margin: 0 0.75rem 0.15rem 0;
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
