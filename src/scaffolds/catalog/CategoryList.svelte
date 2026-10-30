<!-- @component
Разделы каталога плитками: обложка из поля cover или плашка, название и сколько в разделе товаров.
-->
<script lang="ts">
import Cover from '$components/Cover';
import { children, current, link } from '$core';

let {
  /** Каталог: id страницы; пусто — текущая */
  parent = null,
  /** Заголовок над плитками */
  title = '',
}: { parent?: number | null; title?: string } = $props();

const here = current();
const sections = $derived(children(parent ?? here?.id ?? null));
const goods = (n: number): string =>
  `${n} ${
    n % 10 === 1 && n % 100 !== 11
      ? 'товар'
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? 'товара'
        : 'товаров'
  }`;
</script>

{#if sections.length > 0}
  <section class="sections" aria-label={title || undefined}>
    {#if title}<h2 class="title">{title}</h2>{/if}
    <ul>
      {#each sections as section (section.id)}
        <li>
          <Cover
            title={section.menuTitle || section.title}
            src={typeof section.fields.cover === 'string' ? section.fields.cover : null}
            ratio="4/3"
            sizes="(min-width: 64rem) 33vw, 100vw"
          />
          <a href={link(section.id)}>{section.menuTitle || section.title}</a>
          <span>{goods(children(section.id, { includeHidden: true }).length)}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .sections {
    margin: 0 0 3.5rem;
  }

  .title {
    margin: 0 0 1.5rem;
    font-size: 1.5rem;
    line-height: 1.2;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    display: grid;
    gap: 0.125rem;
  }

  li :global(.cover) {
    margin-bottom: 0.75rem;
  }

  a {
    color: var(--t-text, #1d2430);
    font-size: 1.25rem;
    font-weight: 650;
    text-decoration: none;
  }

  a::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  li:hover a {
    color: var(--t-accent, #2f6fde);
  }

  a:focus-visible {
    outline: none;
  }

  li:has(a:focus-visible) {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.375rem;
    border-radius: var(--t-radius, 0.375rem);
  }

  span {
    color: var(--t-muted, #5b6472);
    font-size: 0.875rem;
  }
</style>
