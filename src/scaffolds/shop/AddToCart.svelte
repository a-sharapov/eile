<!-- @component
Кнопка «В корзину» на странице товара — остров: корзина живёт в браузере покупателя. Под кнопкой —
сколько этого товара уже в корзине и ссылка на неё.
-->
<script lang="ts">
import { onMount } from 'svelte';
import { onCart, readCart, setQty, writeCart } from '$components/CartStore';

let {
  /** Товар: id страницы */
  id,
  /** Название в корзине */
  title,
  /** Цена за штуку */
  price = 0,
  /** Адрес товара */
  url = '',
  /** Адрес корзины */
  cartUrl = '',
  /** Товар в наличии */
  available = true,
  /** Надпись кнопки */
  label = 'В корзину',
  /** Надпись, когда товара нет */
  unavailable = 'Нет в наличии',
}: {
  id: number;
  title: string;
  price?: number | null;
  url?: string;
  cartUrl?: string;
  available?: boolean;
  label?: string;
  unavailable?: string;
} = $props();

let inCart = $state(0);
const sync = (): void =>
  void (inCart = readCart().find((_) => _.id === id)?.qty ?? 0);
const add = (): void =>
  writeCart(
    setQty(readCart(), { id, title, price: price ?? 0, url }, inCart + 1)
  );
const sellable = $derived(available && typeof price === 'number' && price > 0);

onMount(() => (sync(), onCart(sync)));
</script>

<div class="buy">
  <button type="button" class="add" disabled={!sellable} onclick={add}>
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </svg>
    {sellable ? label : unavailable}
  </button>
  <p class="added" role="status">
    {#if inCart > 0}
      В корзине: {inCart} шт. · <a href={cartUrl}>Оформить заказ</a>
    {/if}
  </p>
</div>

<style>
  .buy {
    display: grid;
    justify-items: start;
    gap: 0.75rem;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    min-height: 3.25rem;
    padding: 0 1.75rem;
    border: 0;
    border-radius: var(--t-radius, 0.375rem);
    background: var(--t-accent, #1f4e3b);
    color: var(--t-on-accent, #fff);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    transition:
      background 160ms ease-out,
      transform 160ms ease-out;
  }

  .add:hover:not(:disabled) {
    background: color-mix(in oklab, var(--t-accent, #1f4e3b) 82%, #000);
  }

  .add:active:not(:disabled) {
    transform: translateY(0.0625rem);
  }

  .add:disabled {
    background: var(--t-hover, #edf2ec);
    color: var(--t-muted, #58655e);
    cursor: not-allowed;
  }

  .add:focus-visible {
    outline: 0.125rem solid var(--t-accent, #1f4e3b);
    outline-offset: 0.1875rem;
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .added {
    min-height: 1.5em;
    margin: 0;
    color: var(--t-muted, #58655e);
    font-size: 0.9375rem;
  }
</style>
