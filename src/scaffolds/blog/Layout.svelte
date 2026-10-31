<!-- @component
Рамка страницы блога: шапка с названием и меню, колонка текста, подвал. Шаблоны кладут в неё свою
разметку. Здесь же цвета и шрифты сайта — переменные `--t-*` подхватывают и компоненты набора.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Menu from '$components/Menu';
import SearchForm from '$components/SearchForm';
import { site as settings } from '$core';

let {
  /** Страница шаблона */
  page,
  children,
}: {
  page: { title: string; longTitle: string; path: string };
  children: Snippet;
} = $props();

const site = settings();
const year = new Date().getFullYear();
const title = $derived(
  page.path === '/'
    ? site.name
    : `${page.longTitle || page.title} — ${site.name}`
);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="color-scheme" content="light dark">
</svelte:head>

<a class="skip" href="#text">К тексту</a>
<header class="masthead">
  <a class="name" href="/">{site.name}</a>
  <div class="tools">
    <Menu depth={1} />
    <div class="find"><SearchForm page={site.custom.searchPage} /></div>
  </div>
</header>
<main id="text">
  {@render children()}
</main>
<footer class="colophon">
  <p>© {year} {site.name}</p>
  {#if site.description}<p>{site.description}</p>{/if}
</footer>

<style>
  :global(:root) {
    --paper: #fbf8f3;
    --ink: #1f1c18;
    --muted: #6c6459;
    --line: #e5ddd0;
    --accent: #9e3a1c;
    --tint: #f3ece1;
    --serif: Charter, 'Bitstream Charter', 'Iowan Old Style', 'Sitka Text', Cambria, Georgia, serif;
    --sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    --t-accent: var(--accent);
    --t-text: var(--ink);
    --t-muted: var(--muted);
    --t-border: var(--line);
    --t-surface: var(--paper);
    --t-hover: var(--tint);
    --t-on-accent: #fff;
    --t-radius: 0.25rem;
    --t-gap: 2.5rem;
  }

  /* Читают и ночью: та же бумага, только тёмная. */
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --paper: #171513;
      --ink: #ebe5da;
      --muted: #a69d8f;
      --line: #322c26;
      --accent: #e8906a;
      --tint: #221e1a;
      --t-on-accent: #171513;
    }
  }

  :global(body) {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 1.1875rem/1.65 var(--serif);
    text-rendering: optimizeLegibility;
  }

  :global(::selection) {
    background: color-mix(in oklab, var(--accent) 24%, transparent);
  }

  :global(a) {
    color: var(--accent);
    text-decoration-thickness: 0.06em;
    text-underline-offset: 0.18em;
  }

  :global(:focus-visible) {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.2rem;
  }

  /* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */
  :global(:where(.prose) :where(h2)) {
    margin: 2.75rem 0 0.75rem;
    font-size: 1.5rem;
    line-height: 1.25;
    text-wrap: balance;
  }

  :global(:where(.prose) :where(h3)) {
    margin: 2rem 0 0.5rem;
    font-size: 1.1875rem;
  }

  :global(:where(.prose) :where(p, ul, ol)) {
    margin: 0 0 1.25rem;
  }

  :global(:where(.prose) :where(li + li)) {
    margin-top: 0.375rem;
  }

  :global(:where(.prose) :where(blockquote)) {
    margin: 2rem 0;
    padding-left: 1.25rem;
    border-left: 0.0625rem solid var(--accent);
    font-style: italic;
  }

  :global(:where(.prose) :where(code)) {
    padding: 0.1em 0.3em;
    border-radius: 0.2rem;
    background: var(--tint);
    font: 0.84em var(--mono);
  }

  :global(:where(.prose) :where(pre)) {
    overflow-x: auto;
    padding: 1rem 1.25rem;
    border-radius: 0.375rem;
    background: var(--tint);
    line-height: 1.5;
  }

  :global(:where(.prose) :where(pre code)) {
    padding: 0;
    background: none;
  }

  :global(:where(.prose) :where(img)) {
    max-width: 100%;
    height: auto;
    border-radius: 0.25rem;
  }

  :global(:where(.prose) :where(hr)) {
    margin: 3rem 0;
    border: 0;
    border-top: 0.0625rem solid var(--line);
  }

  .skip {
    position: absolute;
    left: 1rem;
    top: -3rem;
    padding: 0.5rem 0.75rem;
    background: var(--ink);
    color: var(--paper);
    font: 0.875rem var(--sans);
  }

  .skip:focus {
    top: 1rem;
  }

  .masthead,
  main,
  .colophon {
    width: min(40rem, 100% - 2.5rem);
    margin-inline: auto;
  }

  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
    padding-block: 2rem 4rem;
    font: 0.9375rem var(--sans);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 0.5rem 1.25rem;
  }

  .find {
    --search-height: 2.25rem;
    width: 9.5rem;
  }

  .name {
    color: var(--ink);
    font: 700 1.25rem/1.2 var(--serif);
    letter-spacing: -0.01em;
    text-decoration: none;
  }

  .colophon {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1.5rem;
    margin-top: 6rem;
    padding-block: 2rem 3rem;
    border-top: 0.0625rem solid var(--line);
    color: var(--muted);
    font: 0.875rem/1.5 var(--sans);
  }

  .colophon p {
    margin: 0;
  }

  @media (max-width: 40rem) {
    :global(body) {
      font-size: 1.0625rem;
    }

    .masthead {
      padding-block: 1.25rem 2.5rem;
    }

    .tools {
      gap: 0.25rem;
    }

    .find {
      width: 2.25rem;
    }
  }
</style>
