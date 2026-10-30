<!-- @component
Хлебные крошки: путь от главной до текущей страницы. На главной не выводятся. Разметку для поисковиков
(BreadcrumbList) сайт добавляет сам.
-->
<script lang="ts">
import { ancestors, current, link, page, site } from '$core';

let {
  /** Главная первым пунктом */
  home = true,
  /** Подпись главной; пусто — её заголовок в меню */
  homeTitle = '',
  /** Текущая страница последним пунктом */
  last = true,
  /** Название для читалок экрана */
  label = 'Вы здесь',
}: {
  home?: boolean;
  homeTitle?: string;
  last?: boolean;
  label?: string;
} = $props();

const here = current();
const homeId = site().homePageId;
const start = $derived(
  home && homeId !== null && here?.id !== homeId ? page(homeId) : null
);
const chain = $derived(
  here ? ancestors(here.id).filter((_) => _.id !== homeId) : []
);
</script>

{#if here && here.id !== homeId}
  <nav class="crumbs" aria-label={label}>
    <ol>
      {#if start}
        <li><a href={link(start.id)}>{homeTitle || start.menuTitle || start.title}</a></li>
      {/if}
      {#each chain as item (item.id)}
        <li><a href={link(item.id)}>{item.menuTitle || item.title}</a></li>
      {/each}
      {#if last}
        <li><span aria-current="page">{here.menuTitle || here.title}</span></li>
      {/if}
    </ol>
  </nav>
{/if}

<style>
  ol {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--t-muted, #5b6472);
    font-size: 0.875em;
  }

  /* Разделитель читалка не произносит: пустой альтернативный текст. */
  li + li::before {
    content: '/' / '';
    margin-inline: 0.5rem;
    opacity: 0.6;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  a:hover {
    color: var(--t-accent, #2f6fde);
    text-decoration: underline;
  }

  a:focus-visible {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.125rem;
    border-radius: 0.125rem;
  }

  [aria-current] {
    color: var(--t-text, #1d2430);
  }
</style>
