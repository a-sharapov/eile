<!-- @component
Последние записи раздела строками «дата — заголовок» и ссылка на весь раздел. Для главной: ленту целиком
показывает шаблон раздела.
-->
<script lang="ts">
import { current, link, listing, page, site } from '$core';

let {
  /** Раздел с записями: id страницы */
  parent,
  /** Сколько записей */
  count = 5,
  /** Заголовок над списком */
  title = 'Новые записи',
  /** Подпись ссылки на раздел; пусто — без ссылки */
  more = 'Все записи',
}: {
  parent: number;
  count?: number;
  title?: string;
  more?: string;
} = $props();

const list = $derived(
  listing(parent, { perPage: count, sort: 'published', paged: false })
);
const section = $derived(page(parent));
const dates = new Intl.DateTimeFormat(current()?.language || site().language, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
</script>

{#if list.items.length > 0}
  <section class="recent" aria-labelledby="recent-{parent}">
    <h2 id="recent-{parent}">{title}</h2>
    <ul>
      {#each list.items as item (item.id)}
        <li>
          {#if item.publishedAt}
            <time datetime={item.publishedAt}>{dates.format(new Date(item.publishedAt))}</time>
          {/if}
          <a href={link(item.id)}>{item.longTitle || item.title}</a>
        </li>
      {/each}
    </ul>
    {#if more && section}<a class="more" href={link(parent)}>{more} →</a>{/if}
  </section>
{/if}

<style>
  .recent {
    margin: 3.5rem 0 0;
  }

  h2 {
    margin: 0 0 1rem;
    color: var(--t-muted, #6c6459);
    font: 600 0.8125rem/1.4 system-ui, sans-serif;
    letter-spacing: 0.02em;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 0.0625rem solid var(--t-border, #e5ddd0);
  }

  li {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    align-items: baseline;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 0.0625rem solid var(--t-border, #e5ddd0);
  }

  time {
    color: var(--t-muted, #6c6459);
    font: 0.8125rem/1.4 system-ui, sans-serif;
    font-variant-numeric: tabular-nums;
  }

  li a {
    color: var(--t-text, #1f1c18);
    font-size: 1.125rem;
    line-height: 1.35;
    text-decoration: none;
  }

  li a:hover {
    color: var(--t-accent, #9e3a1c);
  }

  .more {
    display: inline-block;
    margin-top: 1.25rem;
    font: 0.9375rem system-ui, sans-serif;
  }

  @media (max-width: 30rem) {
    li {
      grid-template-columns: 1fr;
      gap: 0.125rem;
    }
  }
</style>
