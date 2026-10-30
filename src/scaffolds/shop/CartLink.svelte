<!-- @component
Ссылка на корзину в шапке с числом товаров — остров: число берётся из корзины в браузере.
-->
<script lang="ts">
import { onMount } from 'svelte';
import { countOf, onCart, readCart } from '$components/CartStore';

let {
  /** Адрес корзины */
  url,
  /** Подпись */
  label = 'Корзина',
}: { url: string; label?: string } = $props();

let count = $state(0);
const sync = (): void => void (count = countOf(readCart()));

onMount(() => (sync(), onCart(sync)));
</script>

<a class="cart" href={url} aria-label={count > 0 ? `${label}: ${count}` : label}>
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
    <path d="M9 10V7a3 3 0 0 1 6 0v3" />
  </svg>
  <span class="label">{label}</span>
  {#if count > 0}<span class="count" aria-hidden="true">{count}</span>{/if}
</a>

<style>
  .cart {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0 0.875rem;
    border-radius: var(--t-radius, 0.375rem);
    color: var(--t-text, #17211c);
    font-weight: 600;
    text-decoration: none;
  }

  .cart:hover {
    background: var(--t-hover, #edf2ec);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-width: 1.375rem;
    height: 1.375rem;
    padding: 0 0.375rem;
    border-radius: 999rem;
    background: var(--t-accent, #1f4e3b);
    color: var(--t-on-accent, #fff);
    font-size: 0.75rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
  }

  @media (max-width: 40rem) {
    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
</style>
