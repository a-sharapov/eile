<script lang="ts">
import { api } from '#lib/api.ts';
import { number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import type { SetupView, UnknownReport } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { senderName } from '../names.ts';
import { generatorHref } from './links.ts';

// Метки первых касаний не из реестра: их пишут отправители и посетители — на экране только текстом. «В
// генератор» открывает генератор с разобранной меткой: её можно выдать и сохранить в реестр.
let { setup, editable }: { setup: SetupView; editable: boolean } = $props();

let labels = $state<UnknownReport['labels'] | null>(null);
const loading = defineLoad(() =>
  api
    .get<UnknownReport>('/analytics/unknown')
    .then((_) => void (labels = _.labels))
);
$effect(() => void loading.retry());

const withSchema = (sender: string) =>
  setup.schemas.some((_) => _.sender === sender && _.archivedAt === null);
</script>

<div class="unknown">
  <p class="intro">{t('labels.unknownIntro')}</p>
  <LoadState load={loading}>
    {#if labels}
      {#if labels.length === 0}
        <div class="frame empty"><p>{t('labels.unknownEmpty')}</p></div>
      {:else}
        <div class="scroll frame">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('unknown.label')}</th>
                <th scope="col">{t('people.sender')}</th>
                <th scope="col" class="num">{t('unknown.people')}</th>
                {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each labels as item (`${item.sender}/${item.label}`)}
                <tr>
                  <td class="label"><code>{item.label}</code></td>
                  <td>{senderName(setup, item.sender)}</td>
                  <td class="num">{number(item.count)}</td>
                  {#if editable}
                    <td class="row-actions">
                      {#if withSchema(item.sender)}
                        <a class="button ghost" href={generatorHref(item.sender, item.label)}>{@html icons.tag}{t('labels.toGenerator')}<span class="sr-only">: {item.label}</span></a>
                      {:else}
                        <small class="muted">{t('labels.noSchemaFor')}</small>
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </LoadState>
</div>

<style>
  .unknown {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .intro {
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .scroll {
    position: relative;
    overflow-x: auto;
  }

  table {
    min-width: 36rem;
  }

  th,
  td {
    padding: 0.5rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: middle;
  }

  .label {
    min-width: 16rem;
  }

  .label code {
    overflow-wrap: anywhere;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .row-actions .button {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.8125rem;
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
