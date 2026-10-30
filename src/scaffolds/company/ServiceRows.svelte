<!-- @component
Услуги строками: название и анонс слева, цена «от» и срок справа. Строка целиком ведёт на страницу услуги.
-->
<script lang="ts">
import { current, link, listing } from '$core';

let {
  /** Раздел услуг: id страницы; пусто — текущая */
  parent = null,
  /** Подпись цены перед суммой */
  from = 'от',
  /** Знак валюты */
  currency = '₽',
}: { parent?: number | null; from?: string; currency?: string } = $props();

const list = $derived(
  listing(parent ?? current()?.id ?? null, {
    perPage: 50,
    sort: 'menu',
    paged: false,
  })
);
const money = new Intl.NumberFormat('ru-RU');
const price = (value: unknown): string | null =>
  typeof value === 'number' && value > 0
    ? `${from} ${money.format(value)} ${currency}`
    : null;
</script>

{#if list.items.length > 0}
  <ul class="services">
    {#each list.items as item (item.id)}
      {@const cost = price(item.fields.priceFrom)}
      <li>
        <div class="what">
          <h3><a href={link(item.id)}>{item.longTitle || item.title}</a></h3>
          {#if item.introText || item.description}
            <p>{item.introText || item.description}</p>
          {/if}
        </div>
        <div class="terms">
          {#if cost}<span class="cost">{cost}</span>{/if}
          {#if item.fields.term}<span class="term">{item.fields.term}</span>{/if}
        </div>
        <svg class="go" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .services {
    max-width: none;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 0.0625rem solid var(--t-border, #dfe4ec);
  }

  li {
    position: relative;
    margin: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 13rem 1.5rem;
    align-items: center;
    gap: 1rem 2.5rem;
    padding: 1.75rem 0.25rem;
    border-bottom: 0.0625rem solid var(--t-border, #dfe4ec);
    transition: background-color 160ms ease-out;
  }

  li:hover {
    background: var(--t-hover, #f2f5fa);
  }

  h3 {
    margin: 0 0 0.375rem;
    font-size: 1.3125rem;
    line-height: 1.25;
  }

  /* Одна ссылка на строку, но кликается вся строка. */
  h3 a {
    color: var(--t-text, #0f1a2b);
    text-decoration: none;
  }

  h3 a::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  li:has(a:focus-visible) {
    outline: 0.125rem solid var(--t-accent, #1b3d8f);
    outline-offset: -0.125rem;
  }

  h3 a:focus-visible {
    outline: none;
  }

  p {
    max-width: 38rem;
    margin: 0;
    color: var(--t-muted, #536074);
  }

  .terms {
    display: grid;
    gap: 0.125rem;
    text-align: right;
  }

  .cost {
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .term {
    color: var(--t-muted, #536074);
    font-size: 0.9375rem;
  }

  .go {
    fill: none;
    stroke: var(--t-accent, #1b3d8f);
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: translate 160ms ease-out;
  }

  li:hover .go {
    translate: 0.25rem 0;
  }

  @media (max-width: 40rem) {
    li {
      grid-template-columns: minmax(0, 1fr) 1.5rem;
      padding: 1.25rem 0;
    }

    .terms {
      grid-row: 2;
      text-align: left;
    }

    .go {
      grid-row: 1;
      grid-column: 2;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    li,
    .go {
      transition: none;
    }
  }
</style>
