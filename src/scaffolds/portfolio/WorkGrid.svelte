<!-- @component
Сетка работ: обложка, название, год и роль. Работы — дети раздела, порядок — как в меню.
-->
<script lang="ts">
import Cover from '$components/Cover';
import { current, link, listing } from '$core';

let {
  /** Раздел с работами: id страницы; пусто — текущая */
  parent = null,
  /** Сколько работ показать */
  count = 100,
  /** Подпись ссылки на все работы; пусто — без ссылки */
  more = '',
}: {
  parent?: number | null;
  count?: number;
  more?: string;
} = $props();

const section = $derived(parent ?? current()?.id ?? null);
const list = $derived(
  listing(section, { perPage: count, sort: 'menu', paged: false })
);
</script>

{#if list.items.length > 0}
  <div class="grid">
    {#each list.items as work (work.id)}
      <article class="work">
        <Cover {work} sizes="(min-width: 48rem) 45vw, 100vw" />
        <h3><a href={link(work.id)}>{work.longTitle || work.title}</a></h3>
        <p>
          {#if work.fields.role}<span>{work.fields.role}</span>{/if}
          {#if work.fields.year}<span>{work.fields.year}</span>{/if}
        </p>
      </article>
    {/each}
  </div>
  {#if more && section !== null && list.total > list.items.length}
    <a class="more" href={link(section)}>{more} →</a>
  {/if}
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(2.5rem, 5vw, 4.5rem) clamp(1.25rem, 3vw, 2.5rem);
    margin: 0;
  }

  .work {
    position: relative;
    display: grid;
    align-content: start;
    align-self: start;
    gap: 0.25rem;
  }

  /* Вторая колонка — ниже: сетка дышит, как развеска на стене. */
  .work:nth-child(even) {
    margin-top: clamp(0rem, 8vw, 7rem);
  }

  .work :global(.cover) {
    margin-bottom: 0.875rem;
    transition: filter 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .work:hover :global(.cover) {
    filter: brightness(0.94) saturate(1.1);
  }

  h3 {
    margin: 0;
    font-size: clamp(1.125rem, 0.95rem + 0.6vw, 1.375rem);
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.015em;
  }

  /* Одна ссылка на работу, но кликается вся карточка. */
  h3 a {
    text-decoration: none;
  }

  h3 a::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .work:hover h3 a {
    color: var(--t-accent, #c2370b);
  }

  h3 a:focus-visible {
    outline: none;
  }

  .work:has(a:focus-visible) {
    outline: 0.1875rem solid var(--t-accent, #c2370b);
    outline-offset: 0.5rem;
  }

  p {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 1rem;
    margin: 0;
    color: var(--t-muted, #5b5852);
    font-size: 0.9375rem;
  }

  .more {
    display: inline-block;
    margin-top: 3rem;
    font-size: 1.125rem;
    font-weight: 650;
  }

  @media (max-width: 40rem) {
    .grid {
      grid-template-columns: 1fr;
    }

    .work:nth-child(even) {
      margin-top: 0;
    }
  }
</style>
