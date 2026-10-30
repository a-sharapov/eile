<!-- @component
Корзина на странице оформления — остров: строки с количеством и итог. Состав заказа текстом кладётся
в поле `items` формы заказа на той же странице; блок `[data-checkout]` с формой виден, пока корзина не
пуста. После отправки формы корзина очищается.
-->
<script lang="ts">
import { onMount } from 'svelte';
import {
  type Line,
  money,
  onCart,
  readCart,
  setQty,
  totalOf,
  writeCart,
} from '$components/CartStore';

let {
  /** Валюта */
  currency = '₽',
  /** Адрес каталога для пустой корзины */
  catalogUrl = '/',
  /** Имя формы заказа */
  form = 'order',
  /** Текст пустой корзины */
  empty = 'В корзине пока пусто.',
  /** Текст после отправки заказа */
  done = 'Заказ отправлен, корзина очищена.',
}: {
  currency?: string;
  catalogUrl?: string;
  form?: string;
  empty?: string;
  done?: string;
} = $props();

let lines = $state<Line[]>([]);
let ready = $state(false);
let sent = $state(false);

const sync = (): void => void (lines = readCart());
const change = (line: Line, qty: number): void =>
  writeCart(setQty(readCart(), line, qty));
const total = $derived(totalOf(lines));
const summary = (all: readonly Line[]): string =>
  [
    ...all.map(
      (_) => `${_.title} × ${_.qty} — ${money(_.price * _.qty, currency)}`
    ),
    `Итого: ${money(totalOf(all), currency)}`,
  ].join('\n');

onMount(() => {
  const off = onCart(sync);
  const sentOrder = (event: Event): void =>
    void (
      (event as CustomEvent<{ form?: string }>).detail?.form === form &&
      ((sent = true), writeCart([]))
    );
  sync();
  ready = true;
  document.addEventListener('cms:form-sent', sentOrder);
  return () => (
    off(), document.removeEventListener('cms:form-sent', sentOrder)
  );
});

// Форма заказа — разметка страницы, а не острова: её поле и блок находятся по имени.
$effect(() => {
  const items = document.querySelector<HTMLTextAreaElement>(
    `form[data-cms-form="${form}"] textarea[name="items"]`
  );
  const checkout = document.querySelector<HTMLElement>('[data-checkout]');
  void (
    items &&
    ((items.value = lines.length > 0 ? summary(lines) : ''),
    (items.readOnly = lines.length > 0))
  );
  void (checkout && (checkout.hidden = ready && lines.length === 0 && !sent));
});
</script>

{#if !ready}
  <p class="loading">Загружаем корзину…</p>
{:else if sent}
  <div class="empty">
    <p>{done}</p>
    <a href={catalogUrl}>Вернуться в каталог</a>
  </div>
{:else if lines.length > 0}
  <ul class="lines">
    {#each lines as line (line.id)}
      <li>
        <a class="title" href={line.url}>{line.title}</a>
        <span class="unit">{money(line.price, currency)}</span>
        <div class="qty" role="group" aria-label="Количество: {line.title}">
          <button type="button" disabled={line.qty <= 1} onclick={() => change(line, line.qty - 1)} aria-label="Меньше">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h12" /></svg>
          </button>
          <output>{line.qty}</output>
          <button type="button" disabled={line.qty >= 99} onclick={() => change(line, line.qty + 1)} aria-label="Больше">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h12M12 6v12" /></svg>
          </button>
        </div>
        <span class="sum">{money(line.price * line.qty, currency)}</span>
        <button type="button" class="remove" onclick={() => change(line, 0)} aria-label="Убрать «{line.title}»">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </li>
    {/each}
  </ul>
  <p class="total">Итого <strong>{money(total, currency)}</strong></p>
{:else}
  <div class="empty">
    <p>{empty}</p>
    <a href={catalogUrl}>Перейти в каталог</a>
  </div>
{/if}

<style>
  .loading {
    color: var(--t-muted, #58655e);
  }

  .lines {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 0.0625rem solid var(--t-border, #dde3dc);
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6rem auto 7rem 2.75rem;
    align-items: center;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 0.0625rem solid var(--t-border, #dde3dc);
  }

  .title {
    color: var(--t-text, #17211c);
    font-weight: 600;
    text-decoration: none;
  }

  .title:hover {
    color: var(--t-accent, #1f4e3b);
  }

  .unit,
  .sum,
  output {
    font-variant-numeric: tabular-nums;
  }

  .unit {
    color: var(--t-muted, #58655e);
  }

  .sum {
    font-weight: 650;
    text-align: right;
  }

  .qty {
    display: inline-flex;
    align-items: center;
    border: 0.0625rem solid var(--t-border, #dde3dc);
    border-radius: var(--t-radius, 0.375rem);
  }

  output {
    min-width: 2rem;
    text-align: center;
  }

  button {
    display: inline-grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 0;
    border-radius: var(--t-radius, 0.375rem);
    background: transparent;
    color: var(--t-text, #17211c);
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--t-hover, #edf2ec);
  }

  button:disabled {
    color: var(--t-border, #c4ccc5);
    cursor: not-allowed;
  }

  button:focus-visible {
    outline: 0.125rem solid var(--t-accent, #1f4e3b);
    outline-offset: 0.0625rem;
  }

  .remove {
    color: var(--t-muted, #58655e);
  }

  .remove:hover {
    color: #a3341f;
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .total {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 1rem;
    margin: 1.25rem 0 0;
    font-size: 1.125rem;
  }

  .total strong {
    font-size: 1.625rem;
    font-variant-numeric: tabular-nums;
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 1rem;
    padding: 3rem 0;
  }

  .empty p {
    margin: 0;
    font-size: 1.25rem;
  }

  .empty a {
    display: inline-flex;
    align-items: center;
    min-height: 3rem;
    padding: 0 1.5rem;
    border-radius: var(--t-radius, 0.375rem);
    background: var(--t-accent, #1f4e3b);
    color: var(--t-on-accent, #fff);
    font-weight: 600;
    text-decoration: none;
  }

  @media (max-width: 40rem) {
    li {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'title remove'
        'qty sum';
      gap: 0.75rem;
    }

    .title {
      grid-area: title;
    }

    .unit {
      display: none;
    }

    .qty {
      grid-area: qty;
      justify-self: start;
    }

    .sum {
      grid-area: sum;
    }

    .remove {
      grid-area: remove;
    }
  }
</style>
