<!-- @component
Рамка страницы витрины: шапка с названием, меню и телефоном, страница, подвал с контактами. Здесь же
цвета и шрифты сайта: переменные `--t-*` подхватывают компоненты набора, `--plate-*` — плашки товаров.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Menu from '$components/Menu';
import SearchForm from '$components/SearchForm';
import { link, site as settings } from '$core';

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
const phone = site.custom.phone;
const policy = link(Number(site.custom.policy));
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<a class="skip" href="#main">К содержимому</a>
<header class="masthead">
  <div class="bar">
    <a class="name" href="/">{site.name}</a>
    <Menu depth={2} />
    <div class="find"><SearchForm page={site.custom.searchPage} /></div>
    <a class="phone" href="tel:{phone.replace(/[^\d+]/g, '')}">{phone}</a>
  </div>
</header>
<main id="main">
  {@render children()}
</main>
<footer class="colophon">
  <div class="columns">
    <div>
      <p class="name">{site.name}</p>
      {#if site.description}<p>{site.description}</p>{/if}
    </div>
    <div>
      <p>{site.custom.address}</p>
      <p>{site.custom.hours}</p>
    </div>
    <div>
      <p><a href="tel:{phone.replace(/[^\d+]/g, '')}">{phone}</a></p>
      <p><a href="mailto:{site.custom.email}">{site.custom.email}</a></p>
    </div>
  </div>
  <p class="legal">
    © {year} {site.name}
    {#if policy}<a href={policy}>Политика конфиденциальности</a>{/if}
  </p>
</footer>

<style>
  :global(:root) {
    --stone: #f5f0e8;
    --surface: #fffcf7;
    --ink: #2b2420;
    --muted: #6b5f55;
    --line: #e2d7c9;
    --clay: #a3441c;
    --tint: #eee4d6;
    --display: 'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', P052, Georgia, serif;
    --sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    --t-accent: var(--clay);
    --t-text: var(--ink);
    --t-muted: var(--muted);
    --t-border: var(--line);
    --t-surface: var(--surface);
    --t-hover: var(--tint);
    --t-on-accent: #fffaf3;
    --t-radius: 0.5rem;
    --cover-radius: 0.75rem;
    --plate-font: var(--display);
    --plate-weight: 400;
    /* Глазури: песок, терракота, селадон, кобальт, охра, зола. */
    --plate-0: #eadbc6;
    --plate-ink-0: #5e3a1d;
    --plate-1: #edcfbf;
    --plate-ink-1: #7a2f14;
    --plate-2: #d6e0d2;
    --plate-ink-2: #2f4a37;
    --plate-3: #d4dbe3;
    --plate-ink-3: #2b3c50;
    --plate-4: #ecdcb2;
    --plate-ink-4: #64460f;
    --plate-5: #e3dfd8;
    --plate-ink-5: #443e37;
  }

  /* Подвал прижат к низу и на короткой странице. */
  :global(body) {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    margin: 0;
    background: var(--stone);
    color: var(--ink);
    font: 1.0625rem/1.6 var(--sans);
  }

  :global(::selection) {
    background: color-mix(in oklab, var(--clay) 22%, transparent);
  }

  :global(a) {
    color: var(--clay);
    text-decoration-thickness: 0.06em;
    text-underline-offset: 0.18em;
  }

  :global(:focus-visible) {
    outline: 0.125rem solid var(--clay);
    outline-offset: 0.2rem;
  }

  :global(:where(h1, h2, h3)) {
    font-family: var(--display);
    font-weight: 400;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  /* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */
  :global(:where(.prose)) {
    max-width: 44rem;
  }

  :global(:where(.prose) :where(h2)) {
    margin: 2.5rem 0 0.75rem;
    font-size: 1.625rem;
    line-height: 1.2;
  }

  :global(:where(.prose) :where(p, ul, ol)) {
    margin: 0 0 1.125rem;
  }

  :global(:where(.prose) :where(li + li)) {
    margin-top: 0.375rem;
  }

  :global(:where(.prose) :where(table)) {
    width: 100%;
    margin: 1.5rem 0 2rem;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  :global(:where(.prose) :where(th, td)) {
    padding: 0.625rem 1rem 0.625rem 0;
    border-bottom: 0.0625rem solid var(--line);
    text-align: left;
    vertical-align: top;
  }

  :global(:where(.prose) :where(th)) {
    width: 40%;
    color: var(--muted);
    font-weight: 400;
  }

  .skip {
    position: absolute;
    left: 1rem;
    top: -3rem;
    z-index: 20;
    padding: 0.5rem 0.75rem;
    background: var(--ink);
    color: var(--stone);
  }

  .skip:focus {
    top: 1rem;
  }

  .bar,
  main,
  .colophon {
    width: min(76rem, 100% - 3rem);
    margin-inline: auto;
  }

  .masthead {
    border-bottom: 0.0625rem solid var(--line);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 1rem 2.5rem;
    min-height: 5.5rem;
  }

  .bar :global(.menu) {
    flex: 1;
  }

  .name {
    color: var(--ink);
    font: 1.5rem/1.1 var(--display);
    letter-spacing: -0.01em;
    text-decoration: none;
  }

  /* Меню и телефон занимают шапку: поле — на широком экране, иначе лупа поближе к меню. */
  .find {
    flex: none;
    width: 2.5rem;
    margin-inline-start: -1.5rem;
  }

  .phone {
    color: var(--ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    white-space: nowrap;
  }

  .phone:hover {
    color: var(--clay);
  }

  main {
    flex: 1;
    box-sizing: border-box;
    padding-block: 3rem 6rem;
  }

  .colophon {
    padding-block: 3rem 2.5rem;
    border-top: 0.0625rem solid var(--line);
    color: var(--muted);
    font-size: 0.9375rem;
  }

  .columns {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1.5fr;
    gap: 2rem;
  }

  .colophon p {
    margin: 0 0 0.375rem;
  }

  .colophon .name {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 1.25rem;
  }

  .colophon a {
    color: var(--ink);
    text-decoration: none;
  }

  .colophon a:hover {
    color: var(--clay);
  }

  .legal {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 2rem;
    margin-top: 2.5rem !important;
    font-size: 0.875rem;
  }

  @media (min-width: 100rem) {
    .find {
      width: 11rem;
      margin-inline-start: 0;
    }
  }

  @media (max-width: 56rem) {
    .phone {
      display: none;
    }

    .bar {
      justify-content: space-between;
      min-height: 4rem;
    }

    .bar :global(.menu) {
      flex: none;
    }

    .columns {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    main {
      padding-block: 2rem 4rem;
    }
  }

  @media (max-width: 30rem) {
    .bar,
    main,
    .colophon {
      width: min(76rem, 100% - 2rem);
    }
  }
</style>
