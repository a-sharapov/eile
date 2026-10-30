<!-- @component
Карточка товара: обложка, отметка, название, цена и наличие. Вся карточка — ссылка на товар.
-->
<script lang="ts">
import Cover from '$components/Cover';
import Price from '$components/Price';
import { link } from '$core';

type Product = {
  id: number;
  title: string;
  longTitle: string;
  menuTitle: string;
  fields: Record<string, string | number | boolean | null>;
};

let {
  /** Товар: страница с полями price, oldPrice, cover, inStock, badge */
  item,
  /** Тег заголовка: h2 в разделе, h3 под заголовком блока */
  heading = 'h2',
  /** Пропорции обложки: 4/5=Портрет, 1/1=Квадрат, 4/3=Пейзаж */
  ratio = '4/5',
  /** Подпись товара, которого нет в наличии */
  unavailable = 'Нет в наличии',
}: {
  item: Product;
  heading?: 'h2' | 'h3';
  ratio?: '4/5' | '1/1' | '4/3';
  unavailable?: string;
} = $props();

const fields = $derived(item.fields);
const number = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;
</script>

<article class="card">
  <div class="media">
    <Cover
      title={item.menuTitle || item.title}
      src={typeof fields.cover === 'string' ? fields.cover : null}
      {ratio}
    />
    {#if fields.badge}<span class="badge">{fields.badge}</span>{/if}
  </div>
  <svelte:element this={heading} class="name">
    <a href={link(item.id)}>{item.longTitle || item.title}</a>
  </svelte:element>
  <Price price={number(fields.price)} old={number(fields.oldPrice)} />
  {#if fields.inStock === false}<p class="stock">{unavailable}</p>{/if}
</article>

<style>
  .card {
    position: relative;
    display: grid;
    align-content: start;
    gap: 0.375rem;
  }

  .media {
    position: relative;
    margin-bottom: 0.5rem;
    overflow: hidden;
    border-radius: var(--cover-radius, var(--t-radius, 0.375rem));
  }

  .media :global(.cover) {
    transition: scale 400ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .card:hover .media :global(.cover) {
    scale: 1.03;
  }

  .badge {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    padding: 0.25rem 0.625rem;
    border-radius: 999rem;
    background: var(--badge, var(--t-accent, #2f6fde));
    color: var(--badge-ink, var(--t-on-accent, #fff));
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.4;
  }

  .name {
    margin: 0;
    font-family: var(--card-font, inherit);
    font-size: 1.0625rem;
    font-weight: 600;
    line-height: 1.3;
  }

  /* Одна ссылка, но кликается вся карточка. */
  .name a {
    color: var(--t-text, #1d2430);
    text-decoration: none;
  }

  .name a::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .card:hover .name a {
    color: var(--t-accent, #2f6fde);
  }

  .name a:focus-visible {
    outline: none;
  }

  .card:has(a:focus-visible) {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.375rem;
    border-radius: var(--t-radius, 0.375rem);
  }

  .stock {
    margin: 0;
    color: var(--t-muted, #5b6472);
    font-size: 0.875rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .media :global(.cover) {
      transition: none;
    }
  }
</style>
