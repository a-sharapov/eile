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
