<!-- @component
Рамка страницы портфолио: шапка с именем и меню, широкое поле для работ, подвал с почтой и Telegram.
Здесь же цвета и шрифты сайта — переменные `--t-*` подхватывают и компоненты набора.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Menu from '$components/Menu';
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
const telegram = site.custom.telegram.replace(/^@/, '');
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<a class="skip" href="#work">К содержимому</a>
<header class="top">
  <a class="name" href="/">{site.name}</a>
  <Menu depth={1} />
</header>
<main id="work">
  {@render children()}
</main>
<footer class="bottom">
  <p class="contacts">
    <a href="mailto:{site.custom.email}">{site.custom.email}</a>
    <a href="https://t.me/{telegram}">@{telegram}</a>
  </p>
  <p class="copy">© {year} {site.name}</p>
</footer>

<style>
  :global(:root) {
    --wall: #ecebe7;
    --ink: #131312;
    --muted: #5b5852;
    --line: #d2cec6;
    --accent: #c2370b;
    --raised: #f6f5f2;
    --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --gutter: clamp(1.25rem, 4vw, 3rem);
    --t-accent: var(--accent);
    --t-text: var(--ink);
    --t-muted: var(--muted);
    --t-border: var(--line);
    --t-surface: var(--raised);
    --t-hover: #e2e0da;
    --t-on-accent: #fff;
    --t-radius: 0;
    --t-gap: 2rem;
    color-scheme: light;
  }

  :global(body) {
    margin: 0;
    background: var(--wall);
    color: var(--ink);
    font: 1.0625rem/1.6 var(--sans);
    -webkit-font-smoothing: antialiased;
  }

  :global(::selection) {
    background: var(--ink);
    color: var(--wall);
  }

  :global(a) {
    color: inherit;
    text-decoration-color: var(--accent);
    text-decoration-thickness: 0.09em;
    text-underline-offset: 0.2em;
  }

  :global(a:hover) {
    color: var(--accent);
  }

  :global(:focus-visible) {
    outline: 0.1875rem solid var(--accent);
    outline-offset: 0.2rem;
  }

  /* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. Строка — не
     длиннее 40rem, а сетка работ в тексте занимает всю ширину. */
  :global(:where(.prose) > :where(p, ul, ol, h2, h3, blockquote)) {
    max-width: 40rem;
  }

  :global(:where(.prose) :where(h2)) {
    margin: 3.5rem 0 1rem;
    font-size: clamp(1.375rem, 1.1rem + 1vw, 1.875rem);
    line-height: 1.15;
    letter-spacing: -0.02em;
  }

  :global(:where(.prose) :where(p, ul, ol)) {
    margin: 0 0 1.25rem;
  }

  :global(:where(.prose) :where(ul)) {
    padding-left: 1.125rem;
  }

  :global(:where(.prose) :where(li + li)) {
    margin-top: 0.375rem;
  }

  :global(:where(.prose) :where(blockquote)) {
    margin: 3rem 0;
    font-size: 1.375rem;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.01em;
  }

  :global(:where(.prose) :where(blockquote)::before) {
    content: '';
    display: block;
    width: 2.5rem;
    height: 0.1875rem;
    margin-bottom: 1rem;
    background: var(--accent);
  }

  :global(:where(.prose) :where(img)) {
    max-width: 100%;
    height: auto;
  }

  .skip {
    position: absolute;
    left: 1rem;
    top: -3rem;
    padding: 0.5rem 0.75rem;
    background: var(--ink);
    color: var(--wall);
  }

  .skip:focus {
    top: 1rem;
  }

  .top,
  main,
  .bottom {
    width: min(90rem, 100% - 2 * var(--gutter));
    margin-inline: auto;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 2rem;
    padding-block: 1.75rem clamp(3rem, 8vw, 6rem);
    font-size: 0.9375rem;
  }

  .name {
    font-size: 1.125rem;
    font-weight: 750;
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .bottom {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 1.5rem 3rem;
    margin-top: clamp(5rem, 12vw, 9rem);
    padding-block: 2.5rem 3rem;
    border-top: 0.0625rem solid var(--ink);
  }

  .bottom p {
    margin: 0;
  }

  .contacts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 2rem;
    font-size: clamp(1.25rem, 0.9rem + 1.6vw, 2rem);
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .contacts a {
    text-decoration: none;
  }

  .copy {
    color: var(--muted);
    font-size: 0.875rem;
  }
</style>
