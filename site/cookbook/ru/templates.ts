import {
  aside,
  type Chapter,
  c,
  code,
  h2,
  kbd,
  list,
  p,
  shot,
  steps,
  ui,
} from '../markup.ts';

const BASE_1 = `<script>
  import Content from '$core/Content';

  let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

<header class="top">
  <a class="logo" href="/">{site.name}</a>
</header>

<main>
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</main>

<footer class="bottom">
  <p>{site.name} · кухни на заказ</p>
</footer>

<style>
  :global(body) {
    margin: 0;
    background: #f1efeb;
    color: #1f1e1c;
    font: 18px/1.6 system-ui, sans-serif;
  }

  .top,
  main,
  .bottom {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .logo {
    color: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-decoration: none;
  }

  h1 {
    font-size: 2.75rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  .bottom {
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const firstTemplate: Chapter = {
  alias: 'pervyi-shablon',
  title: 'Первый шаблон',
  lead: 'Шаблон решает, как выглядит страница. Разберём шаблон Minimal строчка за строчкой и напишем свой: с шапкой, заголовком и спокойными цветами студии.',
  description:
    'Что такое шаблон в Eile, основы Svelte для начинающих и первый собственный шаблон сайта.',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'поймём, что такое шаблон и откуда он берёт данные;',
        'выучим три приёма Svelte: выражения, условия и списки;',
        'напишем шаблон Base и переведём на него все страницы;',
        'нарочно сделаем ошибку и посмотрим, что будет.'
      )
    ),
    h2('chto-takoe', 'Что такое шаблон'),
    p(
      'Страница в менеджере это данные: заголовок, адрес, текст. Шаблон это рамка, в которую эти данные вставляются: где стоит заголовок, какого он цвета, что в шапке и что в подвале. Одну рамку можно надеть на сколько угодно страниц.',
      'Шаблоны в Eile пишутся на Svelte. Это обычный HTML, в который можно вставлять данные в фигурных скобках. Учить его отдельно не нужно: всё необходимое разберём по ходу.'
    ),
    h2('minimal', 'Шаблон Minimal'),
    p(
      'Над деревом страниц слева есть вкладка ' +
        ui('Элементы') +
        '. Откройте её: там списки шаблонов, компонентов, плагинов и полей страниц. Щёлкните по шаблону <code>Minimal</code>.'
    ),
    code(
      'svelte',
      `<script>
  let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

{@html page.content}`,
      { file: 'Шаблон Minimal' }
    ),
    p('Разберём по частям.'),
    list(
      c('<script>…</script>') +
        ': служебная часть, здесь готовят данные. Строка ' +
        c('let { page, site } = $props();') +
        ' говорит: «шаблон получает страницу <code>page</code> и сайт <code>site</code>». Так в каждом шаблоне.',
      c('<svelte:head>') +
        ': то, что попадёт в заголовок документа. Тег ' +
        c('<title>') +
        ' задаёт текст на вкладке браузера.',
      c('{page.title}') +
        ': фигурные скобки значат «вставь сюда значение». ' +
        c('page.title') +
        ' это заголовок страницы, ' +
        c('site.name') +
        ' название сайта.',
      c('page.longTitle || page.title') +
        ': «длинный заголовок, а если его нет, то обычный». Две черты ' +
        c('||') +
        ' читаются как «или».',
      c('{@html page.content}') +
        ': текст страницы, который вы пишете в менеджере.'
    ),
    h2('svelte', 'Три приёма Svelte'),
    p(
      'Всё, что нам понадобится в кукбуке, держится на трёх приёмах. Первый вы уже видели: выражение в фигурных скобках.'
    ),
    code('svelte', `<p>Сайт называется {site.name}</p>`),
    p('Второй: показать кусок, только если выполнено условие.'),
    code(
      'svelte',
      `{#if page.introText}
  <p class="intro">{page.introText}</p>
{/if}`
    ),
    p(
      'Анонс выведется, только если вы его заполнили. Пустой абзац на странице не появится.'
    ),
    p('Третий: повторить кусок для каждого элемента списка.'),
    code(
      'svelte',
      `<ul>
  {#each ['эспрессо', 'капучино', 'фильтр'] as drink}
    <li>{drink}</li>
  {/each}
</ul>`
    ),
    p(
      'Получится список из трёх пунктов. Внутри блока ' +
        c('{#each}') +
        ' слово <code>drink</code> по очереди принимает каждое значение.'
    ),
    h2('base', 'Свой шаблон Base'),
    steps(
      'На вкладке ' +
        ui('Элементы') +
        ' нажмите <b>+</b> рядом со словом «Шаблоны».',
      'Напишите имя <code>Base</code>. Имена элементов пишутся латиницей с заглавной буквы.',
      'Нажмите ' +
        ui('Создать') +
        '. Откроется редактор с заготовкой: сотрите её и вставьте код ниже.',
      'Сохраните: ' + ui('Сохранить') + ' или ' + kbd('Ctrl', 'S') + '.'
    ),
    code('svelte', BASE_1, { file: 'Шаблон Base', save: 'template:Base' }),
    p('Что здесь нового по сравнению с Minimal:'),
    list(
      c("import Content from '$core/Content';") +
        ': подключаем встроенный компонент Content. Он выводит текст страницы и при этом превращает ссылки на другие страницы, вставки компонентов и формы в готовый HTML. Поэтому дальше мы пишем ' +
        c('<Content of={page} />') +
        ' вместо ' +
        c('{@html page.content}') +
        '.',
      c('<header>') +
        ', ' +
        c('<main>') +
        ', ' +
        c('<footer>') +
        ': шапка, основная часть и подвал. Это обычные теги HTML.',
      c('<style>') +
        ': стили, то есть цвета, шрифты и отступы. Стили шаблона действуют только на его разметку. ' +
        c(':global(body)') +
        ' нужен, чтобы задать фон всей странице.'
    ),
    h2('naznachit', 'Надеть шаблон на страницы'),
    p(
      'Шаблон создан, но страницы по-прежнему на Minimal. Переключим их. Быстрее всего это сделать на обзоре: откройте ' +
        ui('Страницы') +
        ' в шапке и в колонке шаблона выберите Base у каждой страницы. Значение сохраняется, как только вы уходите из ячейки.'
    ),
    p(
      'Второй способ: открыть страницу и выбрать шаблон в блоке ' +
        ui('Место на сайте') +
        ' справа, затем сохранить.'
    ),
    shot('base', 'Главная студии на шаблоне Base'),
    p(
      'Новые страницы получают шаблон родителя, а на верхнем уровне шаблон соседей. Раз все страницы теперь на Base, новые тоже будут на нём.'
    ),
    h2('oshibka', 'Ошибка в шаблоне'),
    p(
      'Сделаем ошибку нарочно, чтобы не бояться её потом. Сотрите в шаблоне Base одну закрывающую фигурную скобку, например в ' +
        c('{site.name}') +
        ', и сохраните.'
    ),
    p(
      'Менеджер не сохранит шаблон и покажет, на какой строке ошибка. Сайт в это время работает на прежней версии: посетители ничего не заметят. Верните скобку и сохраните снова.'
    ),
    aside(
      'tip',
      'Это правило Eile',
      p(
        'Шаблон, который не собирается, не попадает на сайт. Поэтому экспериментировать можно смело: худшее, что случится, это сообщение об ошибке в менеджере.'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        'все страницы на шаблоне Base;',
        'на сайте шапка с названием «ФАСАД» и тёплый серый фон;',
        'вы видели сообщение об ошибке и знаете, что сайт при этом не сломался.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.code();
    ['Главная', 'О студии', 'Каталог', 'Контакты'].forEach(
      (title) => void _.edit(title, { template: 'Base' })
    );
  },
  expect: [
    ['/', 'class="logo'],
    ['/o-studii', '<h1'],
  ],
};

const NAV = `<!-- @component
Меню сайта: страницы верхнего уровня.
-->
<script>
  import { children, current, link } from '$core';

  const here = current();
  const items = children(null);
</script>

<nav class="nav">
  {#each items as item (item.id)}
    <a
      href={link(item.id)}
      aria-current={here?.id === item.id ? 'page' : undefined}
    >
      {item.menuTitle || item.title}
    </a>
  {/each}
</nav>

<style>
  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
  }

  .nav a {
    color: inherit;
    text-decoration: none;
  }

  .nav a[aria-current] {
    font-weight: 700;
  }
</style>`;

const HEADER = `<!-- @component
Шапка: название сайта и меню.
-->
<script>
  import Nav from '$components/Nav';
  import { site } from '$core';
</script>

<header class="header">
  <a class="logo" href="/">{site().name}</a>
  <Nav />
</header>

<style>
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .logo {
    color: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-decoration: none;
  }
</style>`;

const FOOTER_1 = `<!-- @component
Подвал: название, строка о студии и год.
-->
<script>
  import { site } from '$core';

  let {
    /** Строка рядом с названием */
    note = 'кухни на заказ',
  } = $props();

  const year = new Date().getFullYear();
</script>

<footer class="footer">
  <p><b>{site().name}</b> · {note}</p>
  <p>© {year}</p>
</footer>

<style>
  .footer {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const BASE_2 = `<script>
  import Content from '$core/Content';
  import Footer from '$components/Footer';
  import Header from '$components/Header';

  let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

<Header />

<main>
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</main>

<Footer note="кухни по вашим размерам" />

<style>
  :global(body) {
    margin: 0;
    background: #f1efeb;
    color: #1f1e1c;
    font: 18px/1.6 system-ui, sans-serif;
  }

  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1.5rem 2rem;
  }

  h1 {
    font-size: 2.75rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }
</style>`;

const components: Chapter = {
  alias: 'komponenty',
  title: 'Компоненты: шапка, меню и подвал',
  menuTitle: 'Компоненты',
  lead: 'Шапку и подвал удобно держать отдельными кусочками и подключать в любой шаблон. Такие кусочки называются компонентами. Сделаем три: меню, шапку и подвал.',
  description:
    'Компоненты в Eile: как вынести шапку, меню и подвал из шаблона, передать им параметры и взять данные из $core.',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'узнаем, чем компонент отличается от шаблона;',
        'сделаем меню, которое само собирается из дерева;',
        'вынесем шапку и подвал в компоненты;',
        'передадим компоненту параметр.'
      )
    ),
    h2('zachem', 'Зачем нужны компоненты'),
    p(
      'Скоро у сайта появятся другие шаблоны: для кухонь, для каталога, для проектов. Шапка и подвал нужны везде. Если копировать их в каждый шаблон, то, чтобы поменять телефон в подвале, придётся править пять мест и не забыть ни одно.',
      'Компонент решает это: шапка пишется один раз и подключается одной строкой. Поменяли компонент, и все шаблоны получили новую шапку.'
    ),
    h2('nav', 'Меню из дерева'),
    p(
      'Начнём с меню. Оно должно показывать страницы верхнего уровня и само обновляться, когда вы добавляете страницу. Создайте компонент: на вкладке ' +
        ui('Элементы') +
        ' нажмите <b>+</b> рядом со словом «Компоненты» и напишите имя <code>Nav</code>.'
    ),
    code('svelte', NAV, { file: 'Компонент Nav', save: 'component:Nav' }),
    p('Что здесь происходит:'),
    list(
      c('<!-- @component … -->') +
        ': описание компонента. Менеджер покажет его рядом с именем, а вы через месяц вспомните, зачем он нужен.',
      c("import { children, current, link } from '$core';") +
        ': берём из <code>$core</code> три функции. <code>$core</code> это модуль, через который шаблоны и компоненты получают данные сайта.',
      c('children(null)') +
        ': страницы верхнего уровня, в том порядке, как они стоят в дереве. Вместо <code>null</code> можно передать id страницы, и получите её дочерние.',
      c('link(item.id)') +
        ': адрес страницы по её номеру. Переименуете страницу, и ссылка поменяется сама.',
      c('current()') +
        ': страница, которую сейчас смотрит посетитель. Сравнив номера, мы помечаем текущий пункт меню, и он становится жирным.',
      c('(item.id)') +
        ' после ' +
        c('as item') +
        ': ключ пункта списка. Svelte по нему отличает пункты друг от друга.'
    ),
    aside(
      'tip',
      'Меню из набора',
      p(
        'Щёлкните в шапке значок ' +
          ui('Элементы') +
          ': справа откроется обзор элементов с вкладкой ' +
          ui('Набор компонентов') +
          '. Там лежит компонент Menu: с выпадающими подменю и кнопкой для телефона. Наш Nav проще, зато в нём видна каждая строчка. Когда разберётесь, попробуйте Menu.'
      )
    ),
    h2('header', 'Шапка'),
    p('Новый компонент <code>Header</code>:'),
    code('svelte', HEADER, {
      file: 'Компонент Header',
      save: 'component:Header',
    }),
    p(
      'Компонент подключает другой компонент так же, как шаблон: ' +
        c("import Nav from '$components/Nav';") +
        ' и дальше ' +
        c('<Nav />') +
        '. Название сайта берём через ' +
        c('site().name') +
        ': в компонент <code>site</code> не приходит параметром, его спрашивают у <code>$core</code>.'
    ),
    h2('footer', 'Подвал с параметром'),
    p(
      'У подвала будет параметр: строка рядом с названием. Так один компонент может выглядеть по-разному в разных шаблонах.'
    ),
    code('svelte', FOOTER_1, {
      file: 'Компонент Footer',
      save: 'component:Footer',
    }),
    p(
      'Параметры компонент получает через ' +
        c('$props()') +
        ', как шаблон получает <code>page</code>. После знака <code>=</code> стоит значение по умолчанию: если параметр не передали, подвал напишет «кухни на заказ». Комментарий ' +
        c('/** … */') +
        ' над параметром менеджер покажет как подсказку.'
    ),
    h2('sobrat', 'Собрать шаблон из компонентов'),
    p('Теперь шаблон Base становится короче. Замените его код целиком:'),
    code('svelte', BASE_2, { file: 'Шаблон Base', save: 'template:Base' }),
    p(
      'Подвалу мы передали свою строку: ' +
        c('<Footer note="кухни по вашим размерам" />') +
        '. Параметры пишутся как атрибуты тега.'
    ),
    shot('components', 'Шапка с меню и подвал на сайте студии'),
    aside(
      'trouble',
      'Менеджер пишет, что компонента нет',
      p(
        'Проверьте имя: в ' +
          c("'$components/Header'") +
          ' оно должно совпадать с именем в ' +
          ui('Элементах') +
          ' буква в букву, с заглавной. И сохраните компоненты раньше, чем шаблон, который их подключает.'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        'в шапке сайта название и меню из четырёх страниц;',
        'пункт текущей страницы выделен;',
        'в подвале строка «кухни по вашим размерам» и текущий год.'
      )
    ),
  ].join('\n'),
  expect: [
    ['/', 'кухни по вашим размерам'],
    ['/katalog', 'aria-current="page"'],
  ],
};

const LAYOUT = `<!-- @component
Рамка сайта: заголовок вкладки, шапка, подвал и общие стили. Шаблон кладёт внутрь свою часть.
-->
<script>
  import Footer from '$components/Footer';
  import Header from '$components/Header';
  import { site } from '$core';

  let { page, children } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site().name}</title>
</svelte:head>

<Header />

<main>
  {@render children()}
</main>

<Footer note="кухни по вашим размерам" />

<style>
  :global(body) {
    margin: 0;
    background: #f1efeb;
    color: #1f1e1c;
    font: 18px/1.6 system-ui, sans-serif;
  }

  :global(h1) {
    font-size: 2.75rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  :global(img) {
    max-width: 100%;
    height: auto;
  }

  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1.5rem 2rem;
  }
</style>`;

const BASE_3 = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';

  let { page } = $props();
</script>

<Layout {page}>
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</Layout>`;

const layout: Chapter = {
  alias: 'ramka',
  title: 'Рамка: один макет на все шаблоны',
  menuTitle: 'Рамка сайта',
  lead: 'Скоро шаблонов станет несколько. Чтобы не повторять в каждом шапку, подвал и стили, соберём их в рамку, а шаблоны будут класть внутрь только своё.',
  description:
    'Компонент-рамка Layout в Eile: общий макет сайта и вложенное содержимое через children.',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'сделаем компонент Layout, общий для всех шаблонов;',
        'узнаем, как компонент принимает вложенную разметку;',
        'сократим Base до нескольких строк.'
      )
    ),
    h2('problema', 'Что повторяется'),
    p(
      'Посмотрите на Base. В нём заголовок вкладки, шапка, подвал и стили страницы. Всё это понадобится и шаблону кухни, и шаблону проектов. Отличается только середина: у кухни фото и цена, у проектов список работ.',
      'Значит, вынесем всё общее в компонент-рамку. Рамка нарисует шапку и подвал, а в середину вставит то, что ей передал шаблон.'
    ),
    h2('layout', 'Компонент Layout'),
    p('Создайте компонент <code>Layout</code>:'),
    code('svelte', LAYOUT, {
      file: 'Компонент Layout',
      save: 'component:Layout',
    }),
    p('Главное здесь две вещи.'),
    list(
      c('let { page, children } = $props();') +
        ': рамка получает страницу (для заголовка вкладки) и <code>children</code>, то есть всё, что шаблон положит между открывающим и закрывающим тегом рамки.',
      c('{@render children()}') +
        ': «нарисуй здесь то, что передали внутрь». Именно на этом месте окажется середина каждого шаблона.'
    ),
    p(
      'Стили заголовков и картинок стоят в ' +
        c(':global(…)') +
        ': так они действуют на всю страницу. Без него стили рамки касались бы только её собственной разметки.'
    ),
    h2('base', 'Base внутри рамки'),
    p('Замените код Base:'),
    code('svelte', BASE_3, { file: 'Шаблон Base', save: 'template:Base' }),
    p(
      'Восемь строк вместо пятидесяти. ' +
        c('<Layout {page}>') +
        ' это короткая запись ' +
        c('<Layout page={page}>') +
        ': когда имя параметра совпадает с именем значения, его можно не повторять.'
    ),
    p(
      'Сайт выглядит точно так же, как в конце прошлой главы. Так и задумано: мы поменяли устройство, а не вид. Зато следующий шаблон займёт пару минут.'
    ),
    aside(
      'tip',
      'Как устроены готовые сайты',
      p(
        'Каркасы Eile (<code>cms new blog</code>, <code>cms new company</code> и другие) собраны точно так же: компонент Layout и короткие шаблоны внутри него. Если захотите посмотреть на большой пример, разверните каркас в отдельной папке и откройте его ' +
          ui('Элементы') +
          '.'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        'сайт выглядит как раньше;',
        'в Base нет ни шапки, ни подвала, ни стилей;',
        'вы можете объяснить, что делает ' + c('{@render children()}') + '.'
      )
    ),
  ].join('\n'),
  expect: [
    ['/', 'кухни по вашим размерам'],
    ['/kontakty', '<h1'],
  ],
};

export var TEMPLATES: readonly Chapter[] = [firstTemplate, components, layout];
