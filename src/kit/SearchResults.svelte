<!-- @component
Выдача поиска по сайту: поле с запросом, найденные страницы с отрывком и номера страниц. Читает запрос
посетителя, поэтому ставится некэшируемым регионом: <Uncached name="SearchResults" />.
-->
<script lang="ts">
import Pagination from '$components/Pagination';
import { request, search } from '$core';

let {
  /** Найденных на странице */
  perPage = 10,
  /** Искать только в разделе: id страницы; пусто — по всему сайту */
  parent = null,
  /** Подпись поля для читалок экрана */
  label = 'Поиск по сайту',
  /** Подсказка в поле */
  placeholder = 'Что найти?',
  /** Надпись кнопки */
  button = 'Найти',
  /** Сколько нашлось: {n} — число */
  found = 'Найдено: {n}',
  /** Текст, если ничего не нашлось */
  empty = 'Ничего не нашлось. Попробуйте другие слова или более короткий запрос.',
  /** Текст до запроса */
  hint = 'Введите слово или фразу — поиск найдёт и другие их формы.',
}: {
  perPage?: number;
  parent?: number | null;
  label?: string;
  placeholder?: string;
  button?: string;
  found?: string;
  empty?: string;
  hint?: string;
} = $props();

const uid = $props.id();
const asked = request();
const query = (asked?.query.q ?? '').slice(0, 200);
const number = Math.max(1, Number.parseInt(asked?.query.page ?? '1', 10) || 1);
const results =
  query.trim() === ''
    ? null
    : search(query, { limit: perPage, parent, page: number });
</script>

<div class="search-results">
  <form class="field" role="search" method="get">
    <label class="hidden" for="{uid}-q">{label}</label>
    <input id="{uid}-q" type="search" name="q" value={query} {placeholder} maxlength="200" autocomplete="off" enterkeyhint="search" />
    <button type="submit">{button}</button>
  </form>

  {#if results === null}
    <p class="note">{hint}</p>
  {:else if results.items.length === 0}
    <p class="note" role="status">{empty}</p>
  {:else}
    <p class="note" role="status">{found.replaceAll('{n}', String(results.total))}</p>
    <ol class="found">
      {#each results.items as item (item.id)}
        <li>
          <a href={item.url}>{item.title}</a>
          {#if item.snippet}<p>{@html item.snippet}</p>{/if}
        </li>
      {/each}
    </ol>
    <Pagination
      items={results.pager(1)}
      prev={results.number > 1 ? results.url(results.number - 1) : null}
      next={results.number < results.pages ? results.url(results.number + 1) : null}
    />
  {/if}
</div>

<style>
  .field {
    display: flex;
    gap: 0.5rem;
    margin: 0 0 1.25rem;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 2.75rem;
    padding: 0 0.875rem;
    border: 0.0625rem solid var(--t-border, #dfe3ea);
    border-radius: var(--t-radius, 0.375rem);
    background: var(--t-surface, #fff);
    color: var(--t-text, #1d2430);
    font: inherit;
    appearance: none;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  input::placeholder {
    color: var(--t-muted, #5b6472);
    opacity: 1;
  }

  input:hover {
    border-color: color-mix(in oklab, var(--t-text, #1d2430) 30%, var(--t-border, #dfe3ea));
  }

  input:focus-visible {
    outline: none;
    border-color: var(--t-accent, #2f6fde);
    box-shadow: 0 0 0 0.1875rem color-mix(in oklab, var(--t-accent, #2f6fde) 22%, transparent);
  }

  button {
    flex: none;
    height: 2.75rem;
    padding: 0 1.25rem;
    border: 0;
    border-radius: var(--t-radius, 0.375rem);
    background: var(--t-accent, #2f6fde);
    color: var(--t-on-accent, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.15s;
  }

  button:hover {
    filter: brightness(1.08);
  }

  button:active {
    filter: brightness(0.94);
  }

  button:focus-visible {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.125rem;
  }

  .note {
    margin: 0 0 1.5rem;
    color: var(--t-muted, #5b6472);
    font-size: 0.9375em;
  }

  .found {
    display: grid;
    gap: 1.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .found a {
    color: var(--t-text, #1d2430);
    font-size: 1.125em;
    font-weight: 600;
    line-height: 1.3;
    text-decoration: none;
  }

  .found a:hover {
    color: var(--t-accent, #2f6fde);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .found a:focus-visible {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.2rem;
    border-radius: 0.125rem;
  }

  .found p {
    margin: 0.375rem 0 0;
    color: var(--t-muted, #5b6472);
    line-height: 1.55;
  }

  /* Отрывок приходит HTML-строкой: найденные слова отмечены <mark>. */
  .found p :global(mark) {
    padding: 0 0.1em;
    border-radius: 0.2em;
    background: color-mix(in oklab, var(--t-accent, #2f6fde) 18%, transparent);
    color: var(--t-text, #1d2430);
  }

  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 30rem) {
    button {
      padding: 0 1rem;
    }
  }
</style>
