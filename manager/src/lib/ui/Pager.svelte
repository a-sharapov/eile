<script lang="ts">
import { number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { currentPage, type Pager } from '#lib/pager.svelte.ts';
import { pageCount, pageRange, pagerItems } from '#lib/pager.ts';

// Пейджер длинного списка: «51–100 из 3 129», номера страниц и сколько строк показывать. Короткому списку
// он не нужен — не рисуется. `onpage` — после смены страницы или размера: экран вернёт список в кадр.
let {
  pager,
  total,
  onpage,
}: { pager: Pager; total: number; onpage?: () => void } = $props();

const count = $derived(pageCount(total, pager.size));
const current = $derived(currentPage(pager, total));
const range = $derived(pageRange(current, pager.size, total));
const items = $derived(pagerItems(current, count));

const go = (page: number) => void ((pager.page = page), onpage?.());
</script>

{#if total > pager.sizes[0]!}
  <nav class="pager" aria-label={t('pager.label')}>
    <p class="range" aria-live="polite">{t('pager.range', { from: number(range.from), to: number(range.to), total: number(total) })}</p>
    {#if count > 1}
      <ul class="pages">
        <li><button type="button" class="step" aria-label={t('pager.prev')} title={t('pager.prev')} disabled={current === 1} onclick={() => go(current - 1)}>{@html icons.chevronLeft}</button></li>
        {#each items as item, i (item === 'gap' ? `gap-${i}` : item)}
          <li>
            {#if item === 'gap'}
              <span class="gap" aria-hidden="true">…</span>
            {:else}
              <button type="button" aria-current={item === current ? 'page' : undefined} aria-label={t('pager.page', { n: number(item) })} onclick={() => go(item)}>{number(item)}</button>
            {/if}
          </li>
        {/each}
        <li><button type="button" class="step" aria-label={t('pager.next')} title={t('pager.next')} disabled={current === count} onclick={() => go(current + 1)}>{@html icons.chevron}</button></li>
      </ul>
    {/if}
    <label class="size">
      {t('pager.size')}
      <select value={pager.size} onchange={(e) => ((pager.size = Number(e.currentTarget.value)), onpage?.())}>
        {#each pager.sizes as size (size)}<option value={size}>{size > 0 ? number(size) : t('pager.all')}</option>{/each}
      </select>
    </label>
  </nav>
{/if}

<style>
  .pager {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0.25rem 0;
    font-size: 0.8125rem;
  }

  .range {
    margin: 0;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* Номера — одной полоской, как переключатель вида: выбранная страница приподнята. */
  .pages {
    display: inline-flex;
    gap: 0.125rem;
    margin: 0;
    padding: 0.1875rem;
    border-radius: calc(var(--radius) + 0.1875rem);
    background: var(--hover);
    list-style: none;
  }

  .pages li {
    display: contents;
  }

  .pages button,
  .gap {
    min-width: 2rem;
    min-height: 2rem;
    padding: 0 0.5rem;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .pages button {
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    font-weight: 500;
  }

  .pages button:hover:not(:disabled, [aria-current='page']) {
    border: 0;
    background: var(--hover);
    box-shadow: none;
    color: var(--text);
  }

  .pages button[aria-current='page'] {
    background: var(--selected);
    box-shadow: var(--shadow-s);
    color: var(--text);
    font-weight: 600;
  }

  .gap {
    display: inline-grid;
    place-items: center;
    color: var(--muted);
  }

  .step :global(svg) {
    width: 0.9rem;
    height: 0.9rem;
  }

  .size {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    color: var(--muted);
  }

  .size select {
    width: auto;
    min-height: 2rem;
    font-size: 0.8125rem;
  }

  /* Узкий экран: подпись и размер — строкой, номера — под ними во всю ширину. */
  @media (max-width: 40rem) {
    .pages {
      order: 3;
      flex: 1 1 100%;
      justify-content: center;
    }
  }
</style>
