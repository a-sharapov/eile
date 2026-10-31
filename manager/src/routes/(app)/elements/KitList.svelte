<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { loadElements } from '#lib/elements.svelte.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type { KitItem } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';

let items = $state<KitItem[]>([]);
let busy = $state<string | null>(null);

const loading = defineLoad(() =>
  api.get<KitItem[]>('/kit').then((_) => void (items = _))
);
$effect(() => void loading.retry());

const _STATE: Readonly<Record<KitItem['state'], MessageKey>> = {
  missing: 'kit.missing',
  installed: 'kit.installed',
  changed: 'kit.changed',
};

const send = (item: KitItem, replace: boolean): Promise<unknown> => (
  (busy = item.name),
  api
    .send<{ installed: string[] }>('POST', `/kit/${item.name}`, { replace })
    .then((_) =>
      Promise.all([loading.retry(), loadElements()]).then(
        () =>
          void (
            _.installed.length > 0 &&
            notify(`${t('kit.done')} ${_.installed.join(', ')}`)
          )
      )
    )
    .catch(failed)
    .finally(() => (busy = null))
);

// Своя правка на сайте заменяется только после вопроса: вернуть её потом можно лишь из копии.
const install = (item: KitItem): Promise<unknown> =>
  item.state === 'changed'
    ? ask({
        title: t('kit.replaceTitle'),
        body: t('kit.replaceBody'),
        items: [item.name],
        confirm: t('kit.replace'),
        tone: 'danger',
      }).then((confirmed) => confirmed && send(item, true))
    : send(item, false);

const href = (name: string) =>
  resolve('/(app)/elements/[kind]/[name]', { kind: 'component', name });
</script>

<!-- Название раздела — на вкладке; здесь только что это и как работает. -->
<section class="kit">
  <p class="muted intro">{t('kit.about')}</p>
  <LoadState load={loading}>
    <ul>
      {#each items as item (item.name)}
        <li>
          <div class="name">
            {#if item.state === 'missing'}
              <span class="code">{item.name}</span>
            {:else}
              <a class="code" href={href(item.name)}>{item.name}</a>
            {/if}
            <span class="state" data-state={item.state}>{t(_STATE[item.state])}</span>
          </div>
          <p class="about">{item.description}</p>
          {#if item.requires.length > 0}
            <p class="muted requires">{t('kit.requires', { names: item.requires.join(', ') })}</p>
          {/if}
          {#if item.state !== 'installed'}
            <button
              type="button"
              class="button"
              class:primary={item.state === 'missing'}
              disabled={busy !== null}
              aria-busy={busy === item.name}
              onclick={() => install(item)}
            >
              {item.state === 'missing' ? t('kit.install') : t('kit.replace')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  </LoadState>
</section>

<style>
  .kit {
    display: grid;
    gap: 1rem;
  }

  p {
    margin: 0;
    max-width: 68ch;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.85rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .name {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }

  a.code {
    color: var(--text);
    text-decoration: none;
  }

  a.code:hover {
    color: var(--accent);
  }

  .state {
    padding: 0.1rem 0.5rem;
    border-radius: 1rem;
    background: var(--hover);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .state[data-state='installed'] {
    background: var(--ok-soft);
    color: var(--ok);
  }

  .state[data-state='changed'] {
    background: var(--warn-soft);
    color: var(--warn);
  }

  .about {
    font-size: 0.875rem;
  }

  .requires {
    font-size: 0.8125rem;
  }

  button {
    align-self: flex-start;
    margin-top: auto;
  }
</style>
