<!-- Пейджер ленты: номера ссылками, без JS. Пункты даёт `listing().pager()` из $core. -->
<script lang="ts">
let {
  items = [],
  prev = null,
  next = null,
  label = 'Страницы',
  prevLabel = 'Назад',
  nextLabel = 'Вперёд',
}: {
  items?: (
    | { kind: 'page'; number: number; url: string; current: boolean }
    | { kind: 'gap' }
  )[];
  prev?: string | null;
  next?: string | null;
  label?: string;
  prevLabel?: string;
  nextLabel?: string;
} = $props();
</script>

{#if items.length > 1}
  <nav class="pager" aria-label={label}>
    {#if prev}<a class="step" href={prev} rel="prev">← {prevLabel}</a>{/if}
    <ul>
      {#each items as item, index (index)}
        <li>
          {#if item.kind === 'gap'}
            <span class="gap" aria-hidden="true">…</span>
          {:else if item.current}
            <span class="number" aria-current="page">{item.number}</span>
          {:else}
            <a class="number" href={item.url}>{item.number}</a>
          {/if}
        </li>
      {/each}
    </ul>
    {#if next}<a class="step" href={next} rel="next">{nextLabel} →</a>{/if}
  </nav>
{/if}

<style>
  .pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-block: 2rem;
  }

  ul {
    display: flex;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .number,
  .step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
    min-height: 2.5rem;
    padding: 0 0.75rem;
    border-radius: var(--t-radius, 0.375rem);
    color: var(--t-text, #1d2430);
    text-decoration: none;
  }

  a:hover {
    background: var(--t-hover, #f1f4f8);
  }

  a:focus-visible {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.125rem;
  }

  [aria-current] {
    background: var(--t-accent, #2f6fde);
    color: var(--t-on-accent, #fff);
    font-weight: 600;
  }

  .gap {
    min-width: 1.5rem;
    color: var(--t-muted, #5b6472);
    text-align: center;
  }
</style>
