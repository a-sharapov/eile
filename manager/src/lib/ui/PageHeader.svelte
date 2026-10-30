<script lang="ts">
import type { Snippet } from 'svelte';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';

let {
  title,
  crumbs = [],
  meta,
  actions,
  sticky = true,
  titleHidden = false,
}: {
  title: string;
  /** Путь к странице раздела: «Страницы › О проекте»; сама страница добавляется последней. */
  crumbs?: readonly { readonly label: string; readonly href?: string }[];
  /** Статус рядом с путём: «Черновик · id 2 · /o-proekte». */
  meta?: Snippet;
  /** Кнопки справа, главная — последней. */
  actions?: Snippet;
  /** Строка с путём и кнопками закреплена у верха холстины: сохранить можно из любого места формы. */
  sticky?: boolean;
  /** Заголовок — только для читалки: у редактора страницы им служит поле заголовка. */
  titleHidden?: boolean;
} = $props();

// Глубокий путь: первое звено, «…» со списком средних, родитель и текущая страница.
type Crumb = { readonly label: string; readonly href?: string };
const shown = $derived<{ head: Crumb[]; hidden: Crumb[]; tail: Crumb[] }>(
  crumbs.length > 3
    ? {
        head: [crumbs[0]!],
        hidden: crumbs.slice(1, -1),
        tail: [crumbs.at(-1)!],
      }
    : { head: [...crumbs], hidden: [], tail: [] }
);

let hiddenMenu = $state<HTMLDetailsElement>();

const hiddenKey = (event: KeyboardEvent) =>
  void (
    hiddenMenu?.open &&
    event.key === 'Escape' &&
    (event.preventDefault(),
    (hiddenMenu.open = false),
    hiddenMenu.querySelector<HTMLElement>('summary')?.focus())
  );

const hiddenOutside = (event: PointerEvent) =>
  void (
    hiddenMenu?.open &&
    !hiddenMenu.contains(event.target as Node) &&
    (hiddenMenu.open = false)
  );

// Без пути в строке холстины заголовок появляется, только когда большой ушёл из вида:
// наверху страницы он не повторяется, при прокрутке — напоминает, где ты.
let header = $state<HTMLElement>();
let scrolled = $state(false);

$effect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => void (scrolled = entry !== undefined && !entry.isIntersecting),
    { rootMargin: '-64px 0px 0px 0px' }
  );
  void (header && observer.observe(header));
  return () => observer.disconnect();
});
</script>

<!-- Строка холстины: где я (путь), в каком состоянии (статус) и что можно сделать (кнопки). -->
{#if crumbs.length > 0 || meta || actions}
  <div class="page-bar" class:sticky>
    <div class="where">
      {#if crumbs.length > 0}
        <nav class="crumbs" aria-label={t('common.breadcrumbs')}>
          <ol>
            {#each shown.head as crumb, index (index)}
              <li>{@render link(crumb)}</li>
            {/each}
            {#if shown.hidden.length > 0}
              <li class="folded">
                <details class="hidden-crumbs" bind:this={hiddenMenu} onfocusout={(e) => void (hiddenMenu && !hiddenMenu.contains(e.relatedTarget as Node | null) && (hiddenMenu.open = false))}>
                  <summary aria-label={t('common.moreCrumbs')} title={t('common.moreCrumbs')}>{@html icons.more}</summary>
                  <ul class="menu">
                    {#each shown.hidden as crumb, index (index)}
                      <li>{#if crumb.href}<a href={crumb.href} onclick={() => hiddenMenu && (hiddenMenu.open = false)}>{crumb.label}</a>{:else}<span>{crumb.label}</span>{/if}</li>
                    {/each}
                  </ul>
                </details>
              </li>
            {/if}
            {#each shown.tail as crumb, index (index)}
              <li>{@render link(crumb)}</li>
            {/each}
            <li aria-current="page"><span>{title}</span></li>
          </ol>
        </nav>
      {:else}
        <span class="bar-title" class:shown={scrolled} aria-hidden="true">{title}</span>
      {/if}
      {#if meta}<div class="meta">{@render meta()}</div>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
{/if}
{#snippet link(crumb: Crumb)}
  {#if crumb.href}<a href={crumb.href}>{crumb.label}</a>{:else}<span>{crumb.label}</span>{/if}
{/snippet}

<svelte:window onkeydown={hiddenKey} onpointerdown={hiddenOutside} />

<header class="page-header" bind:this={header} class:sr-only={titleHidden} class:flush={crumbs.length === 0 && !meta && !actions}>
  <h1 id="page-title">{title}</h1>
</header>

<style>
  /* Слева — путь и под ним статус, справа — кнопки: кнопки не уходят на вторую строку. */
  .page-bar {
    container: page-bar / inline-size;
    display: flex;
    gap: 0.5rem 1.25rem;
    align-items: center;
    min-height: 3.75rem;
    margin: 0 -2.25rem;
    padding: 0.625rem 2.25rem;
    border-bottom: 0.0625rem solid var(--line);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    background: var(--canvas);
  }

  /* Закреплена под шапкой: холстина прокручивается вместе со страницей. */
  .sticky {
    position: sticky;
    top: var(--topbar, 0);
    z-index: 5;
  }

  .where {
    display: grid;
    flex: 1;
    gap: 0.1rem;
    min-width: 0;
  }

  .crumbs {
    min-width: 0;
  }

  .crumbs ol {
    display: flex;
    gap: 0 0.45rem;
    overflow: hidden;
    white-space: nowrap;
    align-items: center;
    margin: 0;
    padding: 0;
    color: var(--muted);
    font-size: 0.875rem;
    list-style: none;
  }

  /* Разделитель — вне сжимаемого текста: путь не превращается в ряд косых черт. */
  .crumbs ol > li {
    display: flex;
    flex: 0 1000 auto;
    align-items: center;
    min-width: 1.5rem;
  }

  .crumbs ol > li + li::before {
    flex: none;
    margin-right: 0.45rem;
    color: color-mix(in oklch, var(--muted) 60%, transparent);
    content: '/';
  }

  .crumbs ol > li > :is(a, span) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .crumbs a {
    color: var(--muted);
    text-decoration: none;
  }

  .crumbs a:hover {
    color: var(--text);
  }

  /* Текущая страница сжимается последней и не уже половины строки. */
  .crumbs [aria-current='page'] {
    flex: 0 1 auto;
    min-width: min(50%, 12rem);
    color: var(--text);
    font-weight: 550;
  }

  /* Раздел и «…» не сжимаются: сжимаются родитель и текущая страница. */
  .crumbs ol > li:first-child,
  .crumbs .folded {
    flex: none;
  }

  .hidden-crumbs summary {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.5rem;
    border-radius: var(--radius-s, 0.375rem);
    color: var(--muted);
    list-style: none;
    cursor: pointer;
  }

  .hidden-crumbs summary::-webkit-details-marker {
    display: none;
  }

  .hidden-crumbs summary:hover,
  .hidden-crumbs[open] summary {
    background: var(--hover);
    color: var(--text);
  }

  .hidden-crumbs summary :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  /* Строка пути обрезает переполнение, а меню — нет: его опорный блок — сама строка холстины. */
  .hidden-crumbs .menu {
    position: absolute;
    z-index: 20;
    display: grid;
    min-width: 12rem;
    max-width: min(24rem, calc(100vw - 2rem));
    margin: 0.25rem 0 0;
    padding: 0.3rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow);
    list-style: none;
  }

  .hidden-crumbs .menu {
    white-space: normal;
  }

  .hidden-crumbs .menu :is(a, span) {
    display: block;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
    text-overflow: ellipsis;
  }

  .hidden-crumbs .menu a:hover {
    background: var(--hover);
  }

  .bar-title {
    overflow: hidden;
    font-size: 0.9375rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(0.25rem);
    transition:
      opacity 180ms var(--ease),
      transform 180ms var(--ease);
  }

  .bar-title.shown {
    opacity: 1;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-title {
      transition: none;
    }
  }

  .meta {
    display: flex;
    gap: 0 0.75rem;
    align-items: center;
    overflow: hidden;
    color: var(--muted);
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex: none;
    gap: 0.4rem;
    margin-left: auto;
  }

  .page-header {
    margin: 1.75rem 0 1.5rem;
  }

  .page-header.flush {
    margin-top: 2rem;
  }

  h1 {
    overflow-wrap: anywhere;
    font-size: 1.625rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: -0.025em;
  }

  @media (width < 64rem) {
    .page-bar {
      margin: 0 -1.25rem;
      padding: 0.5rem 1.25rem;
    }
  }

  @media (width < 48rem) {
    .where {
      flex-basis: 100%;
    }

    .page-bar {
      flex-wrap: wrap;
      margin: 0 -1rem;
      padding: 0.5rem 1rem;
      border-radius: var(--radius-l) var(--radius-l) 0 0;
    }

    .sticky {
      position: static;
    }

    .page-header {
      margin: 1.25rem 0 1rem;
    }

    h1 {
      font-size: 1.375rem;
    }
  }
</style>
