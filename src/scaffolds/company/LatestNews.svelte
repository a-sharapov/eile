<!-- @component
Последние новости раздела: дата, заголовок и анонс, ниже ссылка на все новости.
-->
<script lang="ts">
import { current, link, listing, site } from '$core';

let {
  /** Раздел новостей: id страницы */
  parent,
  /** Сколько новостей */
  count = 3,
  /** Подпись ссылки на раздел; пусто — без ссылки */
  more = 'Все новости',
}: { parent: number; count?: number; more?: string } = $props();

const list = $derived(
  listing(parent, { perPage: count, sort: 'published', paged: false })
);
const dates = new Intl.DateTimeFormat(current()?.language || site().language, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
</script>

{#if list.items.length > 0}
  <div class="news">
    <ul>
      {#each list.items as item (item.id)}
        <li>
          {#if item.publishedAt}
            <time datetime={item.publishedAt}>{dates.format(new Date(item.publishedAt))}</time>
          {/if}
          <a href={link(item.id)}>{item.longTitle || item.title}</a>
          {#if item.introText}<p>{item.introText}</p>{/if}
        </li>
      {/each}
    </ul>
    {#if more && link(parent)}<a class="more" href={link(parent)}>{more} →</a>{/if}
  </div>
{/if}

<style>
  ul {
    max-width: none;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 2rem 2.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    margin: 0;
    display: grid;
    align-content: start;
    gap: 0.5rem;
    padding-top: 1.25rem;
    border-top: 0.125rem solid var(--t-text, #0f1a2b);
  }

  time {
    color: var(--t-muted, #536074);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  li > a {
    color: var(--t-text, #0f1a2b);
    font-size: 1.1875rem;
    font-weight: 650;
    line-height: 1.3;
    text-decoration: none;
  }

  li > a::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  li:hover > a {
    color: var(--t-accent, #1b3d8f);
  }

  li:has(a:focus-visible) {
    outline: 0.125rem solid var(--t-accent, #1b3d8f);
    outline-offset: 0.5rem;
  }

  li > a:focus-visible {
    outline: none;
  }

  p {
    margin: 0;
    color: var(--t-muted, #536074);
    font-size: 0.9375rem;
  }

  .more {
    display: inline-block;
    margin-top: 2rem;
    font-weight: 600;
    text-decoration: none;
  }

  .more:hover {
    text-decoration: underline;
  }
</style>
