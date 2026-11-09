<script lang="ts">
import { ACTION_LABEL } from '#lib/activity.ts';
import { api } from '#lib/api.ts';
import { ago, moment } from '#lib/format.ts';
import { t } from '#lib/i18n.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { definePager } from '#lib/pager.svelte.ts';
import { statusOf, tree } from '#lib/tree.svelte.ts';
import type { Activity } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import Pager from '#lib/ui/Pager.svelte';
import { resolve } from '$app/paths';

// Журнал правок целиком, страницами с сервера: кто, что и когда сделал со страницами (хранится последняя
// тысяча). Страница, удалённая навсегда, видна номером — ссылке некуда вести.
const pager = definePager('journal', 50, [25, 50, 100, 200]);
let items = $state<Activity[]>([]);
let total = $state(0);
let top = $state<HTMLElement>();

const load = defineLoad(() =>
  api
    .get<{ items: Activity[]; total: number }>(
      `/activity/page?offset=${(pager.page - 1) * pager.size}&limit=${pager.size}`
    )
    .then((_) => ((items = _.items), (total = _.total)))
);

$effect(() => {
  void [pager.page, pager.size];
  void load.retry();
});

const nodes = $derived(new Map(tree.nodes.map((_) => [_.id, _])));

const toTop = () =>
  void (
    top &&
    top.getBoundingClientRect().top < 0 &&
    top.scrollIntoView({ block: 'start' })
  );
</script>

<section class="journal" aria-labelledby="journal-title" bind:this={top}>
  <h2 id="journal-title" class="sr-only">{t('journal.title')}</h2>
  <p class="muted hint">{t('journal.hint')}</p>
  <LoadState load={load}>
    {#if items.length === 0}
      <p class="muted">{t('overview.noRecent')}</p>
    {:else}
      <div class="frame">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('journal.when')}</th>
              <th scope="col">{t('journal.who')}</th>
              <th scope="col">{t('journal.what')}</th>
              <th scope="col">{t('journal.page')}</th>
            </tr>
          </thead>
          <tbody>
            {#each items as entry, i (`${entry.pageId}:${entry.action}:${entry.at}:${i}`)}
              {@const node = nodes.get(entry.pageId)}
              <tr>
                <td class="when"><time datetime={entry.at} title={moment(entry.at)}>{ago(entry.at)}</time></td>
                <td>{entry.userName}</td>
                <td>{t(ACTION_LABEL[entry.action])}</td>
                <td>
                  {#if node}
                    <a href={resolve('/(app)/pages/[id]', { id: String(node.id) })} data-status={statusOf(node)}>{node.title}</a>
                  {:else}
                    <span class="muted">{t('journal.gone', { id: entry.pageId })}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pager {pager} {total} onpage={toTop} />
    {/if}
  </LoadState>
</section>

<style>
  .journal {
    scroll-margin-top: calc(var(--topbar, 0) + 4.5rem);
  }

  .hint {
    margin: 0 0 1rem;
    font-size: 0.875rem;
  }

  .frame {
    overflow-x: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  table {
    width: 100%;
    min-width: 36rem;
    border-collapse: collapse;
  }

  th {
    padding: 0.6rem 1rem;
    border-bottom: 0.0625rem solid var(--line);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 500;
    text-align: left;
  }

  td {
    padding: 0.55rem 1rem;
    border-bottom: 0.0625rem solid var(--line);
    font-size: 0.875rem;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: var(--hover);
  }

  .when {
    width: 10rem;
    color: var(--muted);
    white-space: nowrap;
  }

  a[data-status='draft'] {
    color: var(--muted);
    font-style: italic;
  }
</style>
