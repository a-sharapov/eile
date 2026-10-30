<!-- @component
Товары плиткой. Для раздела — порциями с пейджером (/раздел/page-2). С глубиной 2 и больше — товары
подразделов одним списком, без порций: для главной («Новинки», «Хиты»). Товар — страница с полем price.
-->
<script lang="ts">
import Pagination from '$components/Pagination';
import ProductCard from '$components/ProductCard';
import { current, listing } from '$core';

let {
  /** Раздел: id страницы; пусто — текущая */
  parent = null,
  /** Товаров в порции */
  perPage = 12,
  /** Уровней вниз: 1 — товары раздела, 2 — и его подразделов */
  depth = 1,
  /** Порядок: menu=Как в дереве, published=Сначала новые, title=По алфавиту */
  sort = 'menu',
  /** Заголовок над плиткой */
  title = '',
  /** Колонок на широком экране, от 2 до 4 */
  columns = 3,
  /** Текст, если товаров нет */
  empty = 'Здесь пока нет товаров.',
  /** Подпись товара, которого нет в наличии */
  unavailable = 'Нет в наличии',
}: {
  parent?: number | null;
  perPage?: number;
  depth?: number;
  sort?: 'menu' | 'published' | 'title';
  title?: string;
  columns?: number;
  empty?: string;
  unavailable?: string;
} = $props();

const here = current();
const deep = $derived(depth > 1);
const list = $derived(
  listing(
    parent ?? here?.id ?? null,
    deep ? { perPage: 100, depth, sort, paged: false } : { perPage, sort }
  )
);
// В глубоком списке есть и сами подразделы: у них нет поля цены.
const items = $derived(
  deep
    ? list.items.filter((_) => 'price' in _.fields).slice(0, perPage)
    : list.items
);
</script>

<section class="products" aria-label={title || undefined}>
  {#if title}<h2 class="title">{title}</h2>{/if}
  {#if items.length === 0}
    <p class="empty">{empty}</p>
  {:else}
    <div class="grid" style:--columns={Math.min(4, Math.max(2, columns))}>
      {#each items as item (item.id)}
        <ProductCard {item} heading={title ? 'h3' : 'h2'} {unavailable} />
      {/each}
    </div>
    {#if !deep}
      <Pagination
        items={list.pager(1)}
        prev={list.number > 1 ? list.url(list.number - 1) : null}
        next={list.number < list.pages ? list.url(list.number + 1) : null}
      />
    {/if}
  {/if}
</section>

<style>
  .products {
    margin: 0 0 3rem;
  }

  .title {
    margin: 0 0 1.5rem;
    font-size: 1.5rem;
    line-height: 1.2;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: 2.5rem var(--grid-gap, 1.5rem);
  }

  .empty {
    color: var(--t-muted, #5b6472);
  }

  @media (max-width: 56rem) {
    .grid {
      grid-template-columns: repeat(min(var(--columns), 3), minmax(0, 1fr));
    }
  }

  @media (max-width: 44rem) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 2rem 1rem;
    }
  }
</style>
