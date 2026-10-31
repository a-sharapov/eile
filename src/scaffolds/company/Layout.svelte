<!-- @component
Рамка страницы сайта компании: шапка с меню, телефоном и кнопкой «Заказать звонок», подвал с контактами.
Окно звонка показывает текст страницы из своей настройки callbackPage. Здесь же цвета и шрифты сайта —
переменные `--t-*` подхватывают компоненты набора и формы.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Menu from '$components/Menu';
import Modal from '$components/Modal';
import ModalButton from '$components/ModalButton';
import SearchForm from '$components/SearchForm';
import { link, site as settings } from '$core';

let {
  /** Страница шаблона */
  page,
  children,
}: {
  page: {
    id: number;
    title: string;
    longTitle: string;
    path: string;
    content: string;
  };
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
const tel = `tel:${phone.replace(/[^\d+]/g, '')}`;
const callback = Number(site.custom.callbackPage);
const policy = Number(site.custom.policyPage);
const searchPage = Number(site.custom.searchPage);
// Форма звонка уже в тексте страницы — окно с ней же не нужно: кнопка ведёт к форме на странице.
const inline = $derived(page.content.includes('[#Form:callback]'));
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<a class="skip" href="#main">К содержанию</a>
<header class="top">
  <div class="inner">
    <a class="name" href="/">{site.name}</a>
    <Menu depth={1} />
    <div class="reach">
      <div class="find"><SearchForm page={searchPage} /></div>
      <a class="phone" href={tel}>{phone}</a>
      {#if inline}
        <a class="call" href="#form-callback">Заказать звонок</a>
      {:else}
        <ModalButton modal="callback" text="Заказать звонок" />
      {/if}
    </div>
  </div>
</header>

<main id="main">
  {@render children()}
</main>

<footer class="bottom">
  <div class="columns">
    <div class="about">
      <p class="footer-name">{site.name}</p>
      {#if site.description}<p>{site.description}</p>{/if}
    </div>
    <dl class="contacts">
      <dt>Телефон</dt>
      <dd><a href={tel}>{phone}</a></dd>
      <dt>Почта</dt>
      <dd><a href="mailto:{site.custom.email}">{site.custom.email}</a></dd>
      <dt>Адрес</dt>
      <dd>{site.custom.address}</dd>
      <dt>Часы</dt>
      <dd>{site.custom.hours}</dd>
    </dl>
  </div>
  <div class="legal">
    <p>© {year} {site.name}</p>
    {#if Number.isInteger(searchPage) && link(searchPage)}
      <a class="to-search" href={link(searchPage)}>Поиск по сайту</a>
    {/if}
    {#if Number.isInteger(policy) && link(policy)}
      <a href={link(policy)}>Политика конфиденциальности</a>
    {/if}
  </div>
</footer>

{#if !inline && Number.isInteger(callback)}
  <Modal id="callback" title="Заказать звонок" source={callback} size="sm" />
{/if}

<style>
  :global(:root) {
    --white: #fff;
    --ink: #0f1a2b;
    --muted: #536074;
    --line: #dfe4ec;
    --band: #f2f5fa;
    --accent: #1b3d8f;
    --accent-deep: #11295f;
    --sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --t-accent: var(--accent);
    --t-text: var(--ink);
    --t-muted: var(--muted);
    --t-border: var(--line);
    --t-surface: var(--white);
    --t-hover: var(--band);
    --t-on-accent: #fff;
    --t-radius: 0.375rem;
    --t-gap: 2rem;
    --t-success: #1f7a4d;
    --t-danger: #b42318;
    --page: min(76rem, 100% - 3rem);
  }

  :global(body) {
    margin: 0;
    background: var(--white);
    color: var(--ink);
    font: 1.0625rem/1.6 var(--sans);
    -webkit-font-smoothing: antialiased;
  }

  :global(::selection) {
    background: color-mix(in oklab, var(--accent) 20%, transparent);
  }

  :global(a) {
    color: var(--accent);
    text-decoration-thickness: 0.07em;
    text-underline-offset: 0.2em;
  }

  :global(:focus-visible) {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.2rem;
  }

  :global(h1, h2, h3) {
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  /* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */
  :global(:where(.prose) :where(h2)) {
    margin: 3rem 0 1rem;
    font-size: clamp(1.5rem, 1.2rem + 1vw, 1.875rem);
    line-height: 1.2;
  }

  :global(:where(.prose) :where(h3)) {
    margin: 2rem 0 0.5rem;
    font-size: 1.1875rem;
  }

  :global(:where(.prose) :where(p, ul, ol)) {
    max-width: 44rem;
    margin: 0 0 1.125rem;
  }

  :global(:where(.prose) :where(li + li)) {
    margin-top: 0.375rem;
  }

  :global(:where(.prose) :where(img)) {
    max-width: 100%;
    height: auto;
    border-radius: var(--t-radius);
  }

  :global(:where(.prose) :where(.cms-form)) {
    margin-top: 1.5rem;
  }

  /* Согласие — галочка и текст строкой, перенос — под текст, а не под галочку. */
  :global(.cms-form .field-consent label) {
    display: block;
    padding-left: 1.75rem;
    text-indent: -1.75rem;
  }

  :global(.cms-form input[type='checkbox']) {
    width: 1.125rem;
    height: 1.125rem;
    margin: 0 0.625rem 0 0;
    vertical-align: -0.2em;
    accent-color: var(--accent);
  }

  .skip {
    position: absolute;
    left: 1rem;
    top: -3rem;
    z-index: 10;
    padding: 0.5rem 0.75rem;
    background: var(--ink);
    color: #fff;
  }

  .skip:focus {
    top: 1rem;
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 5;
    border-bottom: 0.0625rem solid var(--line);
    background: color-mix(in srgb, var(--white) 94%, transparent);
    backdrop-filter: saturate(1.4) blur(0.5rem);
  }

  .inner {
    display: flex;
    align-items: center;
    gap: 1rem 2rem;
    width: var(--page);
    min-height: 4.5rem;
    margin-inline: auto;
  }

  .name {
    flex: none;
    color: var(--ink);
    font-size: 1.1875rem;
    font-weight: 750;
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .inner :global(.menu) {
    flex: 1;
    min-width: 0;
    font-size: 0.9375rem;
  }

  .reach {
    display: flex;
    flex: none;
    align-items: center;
    gap: 1.25rem;
  }

  /* Шапка плотная: поле — на широком экране, иначе лупа; на телефоне поиск — ссылкой в подвале. */
  .find {
    width: 2.5rem;
  }

  .to-search {
    margin-left: auto;
  }

  .phone {
    color: var(--ink);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    white-space: nowrap;
  }

  .phone:hover {
    color: var(--accent);
  }

  .call {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0 1.25rem;
    border-radius: var(--t-radius);
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    text-decoration: none;
  }

  .call:hover {
    background: var(--accent-deep);
  }

  main {
    min-height: 50vh;
    padding-bottom: 6rem;
  }

  /* Страница кончается цветной полосой — подвал сразу под ней. */
  main:has(> :global([data-band]:last-child)) {
    padding-bottom: 0;
  }

  .bottom {
    padding: 4rem 0 2rem;
    background: var(--ink);
    color: #c9d2e0;
    font-size: 0.9375rem;
  }

  .bottom a {
    color: #fff;
  }

  .columns,
  .legal {
    display: grid;
    gap: 2rem;
    width: var(--page);
    margin-inline: auto;
  }

  .columns {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    padding-bottom: 3rem;
  }

  .about p {
    max-width: 24rem;
    margin: 0 0 0.5rem;
  }

  .about .footer-name {
    color: #fff;
    font-size: 1.1875rem;
    font-weight: 750;
  }

  .contacts {
    display: grid;
    grid-template-columns: 6rem 1fr;
    gap: 0.625rem 1.5rem;
    margin: 0;
  }

  dt {
    color: #8e9bb0;
  }

  dd {
    margin: 0;
    color: #fff;
  }

  .legal {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 2rem;
    padding-top: 1.5rem;
    border-top: 0.0625rem solid rgb(255 255 255 / 0.14);
    color: #8e9bb0;
    font-size: 0.875rem;
  }

  .legal p {
    margin: 0;
  }

  .legal a {
    color: #c9d2e0;
  }

  /* Тесно для строки меню — телефон уходит в подвал, кнопка звонка остаётся. */
  @media (min-width: 100rem) {
    .find {
      width: 11rem;
    }
  }

  @media (max-width: 30rem) {
    .find {
      display: none;
    }
  }

  @media (max-width: 64rem) {
    .phone {
      display: none;
    }
  }

  @media (max-width: 48rem) {
    :global(:root) {
      --page: min(76rem, 100% - 2.5rem);
    }

    .inner {
      gap: 0.75rem;
      min-height: 4rem;
    }

    .inner :global(.menu) {
      order: 3;
      flex: none;
    }

    .reach {
      margin-left: auto;
    }

    .reach :global(.open),
    .call {
      min-height: 2.5rem;
      padding: 0 0.875rem;
      font-size: 0.875rem;
    }

    .columns {
      grid-template-columns: 1fr;
    }

    .contacts {
      grid-template-columns: 5rem 1fr;
    }
  }

  @media (max-width: 26rem) {
    .name {
      font-size: 1rem;
    }
  }
</style>
