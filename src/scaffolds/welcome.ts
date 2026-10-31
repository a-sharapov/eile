import { PRODUCT } from '../product.ts';
import type { Scaffold } from './scaffold.ts';

// Как Minimal Template в Evo: только заголовок вкладки и текст страницы.
const _MINIMAL = `<script>
  let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

{@html page.content}
`;

const _GREETING = `<h1>Добро пожаловать</h1>
<p>Сайт работает. Эту страницу выводит шаблон Minimal — в нём нет ничего, кроме текста страницы.</p>
<p>Наполняйте сайт в менеджере: <a href="/manager">/manager</a>. Шаблоны и компоненты лежат там же, в «Элементах», и правятся прямо в браузере.</p>
<p>Готовый сайт разворачивается одной командой, пока на сайте только это приветствие:</p>
<pre><code>cms new blog        # блог
cms new portfolio   # портфолио
cms new company     # сайт компании
cms new showcase    # витрина
cms new shop        # интернет-магазин</code></pre>
`;

/** Сайт по умолчанию: страница приветствия и пустой шаблон. Каркас заменяет его, пока его не трогали. */
export var WELCOME: Scaffold = {
  name: 'welcome',
  title: 'Приветствие',
  summary: 'Страница приветствия и пустой шаблон Minimal',
  siteName: PRODUCT,
  templates: { Minimal: _MINIMAL },
  pages: [
    {
      key: 'home',
      title: 'Добро пожаловать',
      template: 'Minimal',
      content: _GREETING,
    },
  ],
  home: 'home',
};

const _GREETING_EN = `<h1>Welcome</h1>
<p>The site is up. This page uses the Minimal template, which shows nothing but the page text.</p>
<p>Fill the site in the manager: <a href="/manager">/manager</a>. Templates and components live there too, under Elements, and you edit them right in the browser.</p>
<p>While the site has only this welcome page, one command turns it into a ready-made site:</p>
<pre><code>cms new blog        # blog
cms new portfolio   # portfolio
cms new company     # company site
cms new showcase    # showcase
cms new shop        # online shop</code></pre>
`;

/** То же приветствие по-английски: новая база на системе не с русской локалью. */
export var WELCOME_EN: Scaffold = {
  ...WELCOME,
  name: 'welcome-en',
  title: 'Welcome',
  summary: 'A welcome page and a blank Minimal template',
  language: 'en',
  pages: [
    {
      key: 'home',
      title: 'Welcome',
      template: 'Minimal',
      content: _GREETING_EN,
    },
  ],
};
