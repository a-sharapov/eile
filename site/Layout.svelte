<!-- @component
Рамка промо-сайта: шапка со знаком, разделами, языком и GitHub, подвал. Здесь же шрифты из медиатеки,
цвета (светлая и тёмная схема — по системе) и общая типографика.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Icon from '$components/Icon';
import Logo from '$components/Logo';
import { link, media, site as settings } from '$core';
import Island from '$core/Island';

let {
  /** Страница шаблона */
  page,
  /** Раздел сайта для меню: cookbook — кукбук */
  section = '',
  /** Адрес этой же страницы на другом языке; пусто — главная другого языка */
  alternate = null,
  children,
}: {
  page: { id: number; title: string; longTitle: string; language: string };
  section?: string;
  alternate?: string | null;
  children: Snippet;
} = $props();

const site = settings();
const t = site.i18n;
const c = site.custom;
const en = $derived(page.language === 'en');
const ru = link(Number(c.ruHome)) ?? '/';
const eng = link(Number(c.enHome)) ?? '/en';
const home = $derived(en ? eng : ru);
// Кукбука на языке страницы может не быть: тогда и пункта в меню нет.
const book = $derived(link(Number(en ? c.enCookbook : c.ruCookbook)));
const other = $derived(alternate ?? (en ? ru : eng));
const isHome = $derived(
  page.id === Number(c.ruHome) || page.id === Number(c.enHome)
);
const title = $derived(
  isHome
    ? `${site.name} — ${page.longTitle || page.title}`
    : `${page.longTitle || page.title} — ${site.name}`
);
const year = new Date().getFullYear();

// Кириллица и латиница — отдельными файлами: браузер берёт только нужный.
const _CYRILLIC = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const _LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const _face = (family: string, file: string, range: string): string =>
  `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:100 900;src:url(${media(`fonts/${file}.woff2`)}) format('woff2');unicode-range:${range}}`;
const fonts = [
  _face('Geologica', 'geologica-cyrillic', _CYRILLIC),
  _face('Geologica', 'geologica-latin', _LATIN),
  _face('Onest', 'onest-cyrillic', _CYRILLIC),
  _face('Onest', 'onest-latin', _LATIN),
  _face('JetBrains Mono', 'jetbrains-mono-cyrillic', _CYRILLIC),
  _face('JetBrains Mono', 'jetbrains-mono-latin', _LATIN),
].join('');
const preload = [
  media(`fonts/${en ? 'onest-latin' : 'onest-cyrillic'}.woff2`),
  media(`fonts/${en ? 'geologica-latin' : 'geologica-cyrillic'}.woff2`),
];
const icon = media('brand/favicon.svg');

// Тема ставится до первой отрисовки, иначе страница мигнёт системной; кнопка в шапке переключает её.
// Имя тега отдельно: строка с закрывающим тегом script оборвала бы блок script компонента.
const _TAG = 'script';
const _THEME = `<${_TAG}>(()=>{const r=document.documentElement,k='eile-theme';try{const s=localStorage.getItem(k);if(s==='light'||s==='dark')r.dataset.theme=s}catch{}document.addEventListener('click',e=>{if(!e.target.closest('[data-theme-toggle]'))return;const d=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.dataset.theme=d?'light':'dark';try{localStorage.setItem(k,r.dataset.theme)}catch{}})})()</${_TAG}><noscript><style>[data-theme-toggle]{display:none}</style></noscript>`;

const sections = $derived([
  ['speed', t.navSpeed],
  ['manager', t.navManager],
  ['templates', t.navTemplates],
  ['ai', t.navAi],
  ['inside', t.navInside],
]);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111418" />
  {#if icon}<link rel="icon" href={icon} type="image/svg+xml" />{/if}
  {#each preload as href}
    {#if href}<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous" {href} />{/if}
  {/each}
  {#if (isHome || alternate) && site.siteUrl}
    <link rel="alternate" hreflang={en ? 'ru' : 'en'} href={`${site.siteUrl}${other}`} />
  {/if}
  {@html `<style>${fonts}</style>`}
  {@html _THEME}
</svelte:head>

<a class="skip" href="#main">{t.skip}</a>
<header class="top" data-menu>
  <div class="bar">
    <a class="brand" href={home}><Logo label={`${site.name}, ${t.toHome}`} /></a>
    <nav class="nav" id="nav" popover="auto" aria-label={t.navLabel}>
      <ul>
        {#each sections as { 0: id, 1: label }}
          <li><a href={`${home}#${id}`}>{label}</a></li>
        {/each}
        {#if book}
          <li>
            <a href={book} aria-current={section === 'cookbook' ? 'page' : undefined}>{t.navCookbook}</a>
          </li>
        {/if}
      </ul>
    </nav>
    <div class="tools">
      <button class="theme" type="button" data-theme-toggle aria-label={t.themeToggle} title={t.themeToggle}>
        <span class="moon"><Icon name="moon" /></span>
        <span class="sun"><Icon name="sun" /></span>
      </button>
      <a
        class="lang"
        href={other}
        hreflang={en ? 'ru' : 'en'}
        lang={en ? 'ru' : 'en'}
        aria-label={en ? 'Русская версия' : 'English version'}
      >{en ? 'RU' : 'EN'}</a>
      <a class="gh" href={c.repo}><Icon name="github" /><span>GitHub</span></a>
      <button class="burger" type="button" popovertarget="nav" aria-label={t.navLabel}>
        <Icon name="menu" />
      </button>
    </div>
  </div>
  <Island name="MenuKeys" />
</header>

<main id="main">
  {@render children()}
</main>

<footer class="end">
  <div class="cols">
    <div class="about">
      <a class="brand" href={home}><Logo label={site.name} /></a>
      <p>{t.footerMotto}</p>
    </div>
    <div>
      <h2>{t.footerProduct}</h2>
      <ul>
        <li><a href={c.download}>{t.footerDownload}</a></li>
        <li><a href={`${home}#start`}>{t.footerStart}</a></li>
        {#if book}<li><a href={book}>{t.navCookbook}</a></li>{/if}
      </ul>
    </div>
    <div>
      <h2>{t.footerDocs}</h2>
      <ul>
        <li><a href={`${c.repo}#readme`}>README</a></li>
        <li><a href={`${c.repo}/blob/main/docs/glossary.md`}>{t.footerGlossary}</a></li>
        <li><a href={`${c.repo}/blob/main/docs/README.md`}>{t.footerInside}</a></li>
        <li><a href={`${c.repo}/blob/main/docs/adr/0009-evo-import.md`}>{t.footerMigrate}</a></li>
      </ul>
    </div>
    <div>
      <h2>{t.footerProject}</h2>
      <ul>
        <li><a href={c.repo}>GitHub</a></li>
        <li><a href={`${c.repo}/issues`}>{t.footerIssues}</a></li>
        <li><a href={`${c.repo}/blob/main/LICENSE`}>GPL-3.0-or-later</a></li>
      </ul>
    </div>
  </div>
  <p class="legal">
    <span>© {year} Eile</span>
    <span>{t.footerMadeWith} <a href={`${c.repo}/tree/main/site`}>{t.footerSource}</a></span>
  </p>
</footer>

<style>
  :global(:root[data-theme='light']) {
    color-scheme: light;
  }

  :global(:root[data-theme='dark']) {
    color-scheme: dark;
  }

  :global(:root) {
    color-scheme: light dark;
    --canvas: light-dark(#ffffff, #111418);
    --bg: light-dark(#f2f4f7, #171b20);
    --raised: light-dark(#ffffff, #1b2026);
    --line: light-dark(#e3e6eb, #272d35);
    --line-strong: light-dark(#cdd2d9, #38404a);
    --text: light-dark(#13171c, #e9ecf0);
    --muted: light-dark(#59616b, #a0a8b3);
    --faint: light-dark(#7a828c, #7f8893);
    --accent: light-dark(#2f5c96, #8db4ec);
    --fill: light-dark(#2f5c96, #6a9be0);
    --fill-hover: light-dark(#244b7d, #84aeea);
    --on-fill: light-dark(#ffffff, #0b1320);
    --accent-soft: light-dark(#e6eefa, #1d2a3c);
    --ok: light-dark(#1d7d3e, #5fcf88);
    --code-bg: #12161c;
    --display: 'Geologica', 'Onest', system-ui, sans-serif;
    --sans: 'Onest', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
    --wide: 76rem;
    --gutter: clamp(1.25rem, 0.5rem + 3vw, 3rem);
    --radius: 0.75rem;
    --radius-l: 1.125rem;
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    --shadow-shot: 0 1px 2px rgb(16 28 48 / 0.06), 0 2rem 4rem -1.5rem rgb(16 36 72 / 0.28);
    --t-accent: var(--fill);
    --t-text: var(--text);
    --t-muted: var(--muted);
    --t-border: var(--line);
    --t-surface: var(--raised);
    --t-on-accent: var(--on-fill);
    --t-radius: var(--radius);
    scroll-behavior: smooth;
    scroll-padding-top: 5.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(:root) {
      scroll-behavior: auto;
    }
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(body) {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    margin: 0;
    background: var(--canvas);
    color: var(--text);
    font: 400 1.0625rem/1.6 var(--sans);
    font-feature-settings: 'cv11';
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  :global(::selection) {
    background: color-mix(in oklab, var(--fill) 26%, transparent);
  }

  :global(a) {
    color: var(--accent);
    text-decoration-thickness: 0.06em;
    text-underline-offset: 0.2em;
  }

  :global(:focus-visible) {
    outline: 2px solid var(--fill);
    outline-offset: 2px;
    border-radius: 0.25rem;
  }

  :global(code) {
    font-family: var(--mono);
    font-size: 0.9em;
    font-variant-ligatures: none;
  }

  :global(html) {
    scrollbar-color: var(--line-strong) transparent;
  }

  main {
    flex: 1;
  }

  .skip {
    position: absolute;
    left: 1rem;
    top: -4rem;
    z-index: 20;
    padding: 0.6rem 1rem;
    border-radius: var(--radius);
    background: var(--fill);
    color: var(--on-fill);
  }

  .skip:focus {
    top: 1rem;
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: color-mix(in oklab, var(--canvas) 94%, transparent);
    border-bottom: 1px solid var(--line);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 2rem;
    width: min(100% - 2 * var(--gutter), var(--wide));
    height: 4rem;
    margin: 0 auto;
  }

  .brand {
    display: block;
    color: var(--accent);
    font-size: 1.375rem;
    border-radius: 0.25rem;
  }

  .nav {
    flex: 1;
  }

  .nav ul {
    display: flex;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .nav a {
    display: block;
    padding: 0.4rem 0.7rem;
    border-radius: 0.5rem;
    color: var(--muted);
    font-size: 0.9375rem;
    font-weight: 500;
    text-decoration: none;
    transition:
      color 140ms var(--ease),
      background 140ms var(--ease);
  }

  .nav a:hover {
    background: var(--bg);
    color: var(--text);
  }

  .nav a[aria-current] {
    color: var(--text);
    background: var(--bg);
  }

  /* На широком экране меню — обычная строка; поповером оно становится только на узком. */
  @media (min-width: 60rem) {
    .nav[popover] {
      display: block;
      position: static;
      inset: auto;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      overflow: visible;
    }
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .lang,
  .gh,
  .theme,
  .burger {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.375rem;
    padding: 0 0.85rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    background: var(--raised);
    color: var(--text);
    font: 600 0.875rem/1 var(--sans);
    text-decoration: none;
    cursor: pointer;
    transition:
      border-color 140ms var(--ease),
      background 140ms var(--ease);
  }

  .lang {
    font-family: var(--mono);
    font-size: 0.8125rem;
    letter-spacing: 0.04em;
  }

  .lang:hover,
  .gh:hover,
  .theme:hover,
  .burger:hover {
    border-color: var(--line-strong);
    background: var(--bg);
  }

  .burger {
    display: none;
    padding: 0 0.65rem;
  }

  .theme {
    padding: 0 0.65rem;
  }

  /* Кнопка показывает тему, в которую переключит: в светлой — луна, в тёмной — солнце. */
  .theme .sun {
    display: none;
  }

  :global(:root[data-theme='dark']) .theme .moon {
    display: none;
  }

  :global(:root[data-theme='dark']) .theme .sun {
    display: inline;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .theme .moon {
      display: none;
    }

    :global(:root:not([data-theme='light'])) .theme .sun {
      display: inline;
    }
  }

  @media (max-width: 59.99rem) {
    .bar {
      gap: 1rem;
    }

    .burger {
      display: inline-flex;
    }

    .nav[popover] {
      inset: 4.5rem var(--gutter) auto auto;
      width: min(18rem, calc(100vw - 2 * var(--gutter)));
      margin: 0;
      padding: 0.5rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-l);
      background: var(--raised);
      color: var(--text);
      box-shadow: 0 1.5rem 3rem -1rem rgb(16 28 48 / 0.3);
    }

    .nav ul {
      flex-direction: column;
    }

    .nav a {
      padding: 0.7rem 0.85rem;
      font-size: 1rem;
      color: var(--text);
    }
  }

  @media (max-width: 30rem) {
    .gh span {
      display: none;
    }

    .gh {
      padding: 0 0.65rem;
    }
  }

  .end {
    margin-top: clamp(5rem, 10vw, 8rem);
    border-top: 1px solid var(--line);
    background: var(--bg);
  }

  .cols {
    display: grid;
    grid-template-columns: 1.6fr repeat(3, 1fr);
    gap: 2.5rem;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 0 auto;
    padding: 4rem 0 3rem;
  }

  .about .brand {
    font-size: 1.75rem;
  }

  .about p {
    max-width: 22rem;
    margin: 1rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  .cols h2 {
    margin: 0 0 0.85rem;
    color: var(--text);
    font: 600 0.875rem/1.3 var(--sans);
  }

  .cols ul {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cols a:not(.brand) {
    color: var(--muted);
    font-size: 0.9375rem;
    text-decoration: none;
  }

  .cols a:not(.brand):hover {
    color: var(--text);
    text-decoration: underline;
  }

  .legal {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 2rem;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 0 auto;
    padding: 1.5rem 0 2.5rem;
    border-top: 1px solid var(--line);
    color: var(--faint);
    font-size: 0.875rem;
  }

  .legal a {
    color: inherit;
  }

  @media (max-width: 48rem) {
    .cols {
      grid-template-columns: 1fr 1fr;
    }

    .about {
      grid-column: 1 / -1;
    }
  }
</style>
