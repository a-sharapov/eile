<!-- @component
Рамка страницы магазина: шапка с названием, меню и корзиной, страница, подвал с контактами. Здесь же
цвета и шрифты сайта: переменные `--t-*` подхватывают компоненты набора, `--plate-*` — плашки товаров.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Menu from '$components/Menu';
import { link, site as settings } from '$core';
import Island from '$core/Island';

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
const cart = link(Number(site.custom.cart));
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
    {#if cart}<Island name="CartLink" props={{ url: cart }} />{/if}
  </div>
</header>
<main id="main">
  {@render children()}
</main>
<footer class="colophon">
  <div class="inner">
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
      <span>© {year} {site.name}</span>
      {#if policy}<a href={policy}>Политика конфиденциальности</a>{/if}
    </p>
  </div>
</footer>

<style>
  :global(:root) {
    --paper: #fbfaf6;
    --surface: #ffffff;
    --ink: #17211c;
    --muted: #57645d;
    --line: #dce2db;
    --green: #1f4e3b;
    --green-deep: #133426;
    --tint: #edf2ec;
    --sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    --t-accent: var(--green);
    --t-text: var(--ink);
    --t-muted: var(--muted);
    --t-border: var(--line);
    --t-surface: var(--surface);
    --t-hover: var(--tint);
    --t-on-accent: #ffffff;
    --t-radius: 0.375rem;
    --cover-radius: 0.375rem;
    --badge: #f0e3c2;
    --badge-ink: #5c4510;
    --plate-weight: 800;
    /* Чаи: зелёный, улун, красный, жасмин, пуэр, травы. */
    --plate-0: #dde8cf;
    --plate-ink-0: #2f4b24;
    --plate-1: #f1e0b6;
    --plate-ink-1: #614310;
    --plate-2: #edd3c5;
    --plate-ink-2: #6a2a17;
    --plate-3: #f1eedd;
    --plate-ink-3: #4a472a;
    --plate-4: #e3d7cc;
    --plate-ink-4: #4a3327;
    --plate-5: #d7e6df;
    --plate-ink-5: #21463b;
  }

  /* Подвал прижат к низу и на короткой странице. */
  :global(body) {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 1rem/1.6 var(--sans);
  }

  :global(::selection) {
    background: color-mix(in oklab, var(--green) 20%, transparent);
  }

  :global(a) {
    color: var(--green);
    text-decoration-thickness: 0.06em;
    text-underline-offset: 0.18em;
  }

  :global(:focus-visible) {
    outline: 0.125rem solid var(--green);
    outline-offset: 0.2rem;
  }

  :global(:where(h1, h2, h3)) {
    font-weight: 750;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  /* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */
  :global(:where(.prose)) {
    max-width: 44rem;
  }

  :global(:where(.prose) :where(h2)) {
    margin: 2.25rem 0 0.75rem;
    font-size: 1.375rem;
    line-height: 1.25;
  }

  :global(:where(.prose) :where(p, ul, ol)) {
    margin: 0 0 1rem;
  }

  :global(:where(.prose) :where(li + li)) {
    margin-top: 0.375rem;
  }

  :global(:where(.prose) :where(table)) {
    width: 100%;
    margin: 1.25rem 0 1.75rem;
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
    font-weight: 500;
  }

  .skip {
    position: absolute;
    left: 1rem;
    top: -3rem;
    z-index: 20;
    padding: 0.5rem 0.75rem;
    background: var(--ink);
    color: var(--paper);
  }

  .skip:focus {
    top: 1rem;
  }

  .bar,
  main,
  .inner {
    width: min(78rem, 100% - 3rem);
    margin-inline: auto;
  }

  .masthead {
    position: sticky;
    top: 0;
    z-index: 10;
    border-bottom: 0.0625rem solid var(--line);
    background: color-mix(in oklab, var(--paper) 92%, transparent);
    backdrop-filter: saturate(1.4) blur(0.75rem);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 1rem 2rem;
    min-height: 4.5rem;
  }

  .bar :global(.menu) {
    flex: 1;
  }

  .name {
    color: var(--green-deep);
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    text-decoration: none;
    white-space: nowrap;
  }

  main {
    flex: 1;
    box-sizing: border-box;
    padding-block: 2.5rem 6rem;
  }

  .colophon {
    background: var(--green-deep);
    color: #c9d8cf;
    font-size: 0.9375rem;
  }

  .inner {
    padding-block: 3rem 2.5rem;
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
    color: #ffffff;
    font-size: 1.125rem;
  }

  .colophon a {
    color: #ffffff;
    text-decoration: none;
  }

  .colophon a:hover {
    text-decoration: underline;
  }

  .colophon :global(:focus-visible) {
    outline-color: #ffffff;
  }

  .legal {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 2rem;
    margin-top: 2.5rem !important;
    padding-top: 1.5rem;
    border-top: 0.0625rem solid rgb(255 255 255 / 0.14);
    font-size: 0.875rem;
  }

  @media (max-width: 56rem) {
    .bar {
      gap: 0.5rem;
      min-height: 4rem;
    }

    .bar :global(.menu) {
      flex: none;
      order: 3;
    }

    .name {
      flex: 1;
    }

    .columns {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    main {
      padding-block: 1.75rem 4rem;
    }
  }

  @media (max-width: 30rem) {
    .bar,
    main,
    .inner {
      width: min(78rem, 100% - 2rem);
    }
  }
</style>
