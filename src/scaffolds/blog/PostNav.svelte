<!-- @component
Соседние записи под текстом: предыдущая и следующая по дате публикации.
-->
<script lang="ts">
import { current, link, listing } from '$core';

let {
  /** Подпись более новой записи */
  newer = 'Новее',
  /** Подпись более старой записи */
  older = 'Раньше',
}: { newer?: string; older?: string } = $props();

const here = current();
const items = $derived(
  here?.parentId
    ? listing(here.parentId, { perPage: 100, sort: 'published', paged: false })
        .items
    : []
);
const at = $derived(items.findIndex((_) => _.id === here?.id));
const pair = $derived(
  at < 0
    ? []
    : [
        { label: newer, item: items[at - 1] ?? null, side: 'newer' },
        { label: older, item: items[at + 1] ?? null, side: 'older' },
      ].filter((_) => _.item !== null)
);
</script>

{#if pair.length > 0}
  <nav class="neighbours" aria-label="Другие записи">
    {#each pair as entry (entry.side)}
      <a class={entry.side} href={link(entry.item!.id)}>
        <span>{entry.label}</span>
        {entry.item!.longTitle || entry.item!.title}
      </a>
    {/each}
  </nav>
{/if}

<style>
  .neighbours {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-top: 4rem;
    padding-top: 1.5rem;
    border-top: 0.0625rem solid var(--t-border, #e5ddd0);
  }

  a {
    display: grid;
    gap: 0.25rem;
    color: var(--t-text, #1f1c18);
    line-height: 1.35;
    text-decoration: none;
  }

  a:hover {
    color: var(--t-accent, #9e3a1c);
  }

  .older {
    grid-column: 2;
    text-align: right;
  }

  span {
    color: var(--t-muted, #6c6459);
    font: 0.8125rem system-ui, sans-serif;
  }

  @media (max-width: 30rem) {
    .neighbours {
      grid-template-columns: 1fr;
    }

    .older {
      grid-column: 1;
      text-align: left;
    }
  }
</style>
