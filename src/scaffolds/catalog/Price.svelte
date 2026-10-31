<!-- @component
Цена товара. Валюта — своя настройка сайта `currency`; старая цена, если она больше, зачёркнута. Без цены —
подпись «по запросу».
-->
<script lang="ts">
import { site } from '$core';

let {
  /** Цена */
  price = null,
  /** Старая цена: показывается зачёркнутой, если больше цены */
  old = null,
  /** Размер: md=Обычный, lg=Крупный */
  size = 'md',
  /** Подпись, если цены нет */
  missing = 'Цена по запросу',
}: {
  price?: number | null;
  old?: number | null;
  size?: 'md' | 'lg';
  missing?: string;
} = $props();

const settings = site();
const money = new Intl.NumberFormat(settings.language || 'ru', {
  maximumFractionDigits: 0,
});
const format = (amount: number): string =>
  `${money.format(amount)} ${settings.custom.currency}`;
const valid = (amount: unknown): amount is number =>
  typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
</script>

<p class="price {size}">
  {#if valid(price)}
    <span class="now">{format(price)}</span>
    {#if valid(old) && old > price}
      <s><span class="hidden">{'Было '}</span>{format(old)}</s>
    {/if}
  {:else}
    <span class="ask">{missing}</span>
  {/if}
</p>

<style>
  .price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.625rem;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .now {
    color: var(--t-text, #1d2430);
    font-weight: 650;
  }

  .lg .now {
    font-size: 1.75rem;
    letter-spacing: -0.01em;
  }

  s {
    color: var(--t-muted, #5b6472);
    font-size: 0.875em;
  }

  .ask {
    color: var(--t-muted, #5b6472);
  }

  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
