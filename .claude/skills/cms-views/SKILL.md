---

name: cms-views
description: Как устроены шаблоны и компоненты CMS — Svelte 5 из SQLite, компиляция во время работы, импорты $components/…, API $core, загрузка через Bun.plugin/build.module, рендер и сборка одного бинарника — плюс проверенные факты Bun 1.4.4 / Svelte 5.57.3. Use when writing or debugging templates/components (including src/scaffolds), changing design/infrastructure (BunViewLoader, svelte-compiler) or delivery rendering, extending $core, or touching the build.
---

# Виды: шаблоны и компоненты

Решение и обоснование — `docs/adr/0003-svelte-views-compiled-at-runtime.md`.

## Как пишется элемент

```svelte
<!-- шаблон: получает page и site -->
<script>
  import Content from '$core/Content';
  import Menu from '$components/Menu';
  let { page, site } = $props();
</script>

<svelte:head><title>{page.title} — {site.name}</title></svelte:head>
<Menu />
<!-- Content рисует компоненты, формы и ссылки в тексте; {@html page.content} показал бы их тегами. -->
<main><Content of={page} /></main>
```

```svelte
<!-- компонент: данные берёт синхронно -->
<script>
  import { children, link } from '$core';
  let { parent = null } = $props();
  const items = $derived(children(parent));
</script>

{#each items as item (item.id)}<a href={link(item.id)}>{item.title}</a>{/each}
```

- Только Svelte 5 в режиме runes (`runes: true`). Синтаксис `export let` не компилируется.
- Имена в PascalCase. Компонент подключается как `$components/Name`, шаблоны не импортируются.
- Разрешены импорты `$components/*`, `svelte`, `svelte/internal/server` и `$core`. Любой другой импорт
  даёт `design.forbidden_import`.
- Стандартные поля страницы: `page.title`, `longTitle`, `menuTitle`, `description`, `introText`,
  `content`, `path`, `kind` (`page` | `link`), `linkTo`, `folder`, `aliasInPath`, `publishedAt`, `createdAt`,
  `updatedAt`. По обычаю Evo: `{page.longTitle || page.title}` в заголовке и `{item.menuTitle || item.title}`
  в меню. `link(id)` для ссылки отдаёт адрес её цели.
- `page.path` — адрес со стилем адресов сайта (ADR 0063): по умолчанию `/blog/post`; со стилем Evo — `/katalog/`
  у папки, `/o-nas.html` у документа, `/sitemap.xml` как есть, без алиасов предков с `aliasInPath: false`.
  Ссылки строй через `link(id)`, а не склейкой алиасов.
- Поля страницы — `page.fields.<имя>`: своё значение, иначе унаследованное (если у поля `inherit`), иначе
  умолчание, иначе `null`. В `page.fields` есть все поля, назначенные на шаблон страницы.
- API `$core` (`delivery/application/component-runtime.ts`):
  - `link(id)` — URL опубликованной страницы или `null`; при `null` Svelte не выводит атрибут;
  - `page(id)`;
  - `children(parentId | null, { includeHidden })`;
  - `current()` — страница первой фазы; в `Uncached` и острове — `null`. Компоненты набора берут текущую
    страницу отсюда, а не из параметра `page`;
  - `ancestors(id)` — предки от корня до родителя (крошки, активная ветка меню);
  - `translations(id?)` — переводы страницы (по умолчанию текущей) для переключателя языка:
    `{ language, url, title, current }`, исходная первой, по одному на язык; без переводов — `[]`
    (ADR 0033);
  - `listing(parent, { perPage, sort, depth, includeHidden, paged, filter, order, page })` → `{ items, number,
    pages, total, url(n), pager(around) }`. Скрытые из меню — в списке по умолчанию. Номер порции берётся из
    хвоста адреса `/blog/page-2` (ADR 0019; со стилем Evo — `/katalog/page-2/` у папки, `/novosti/page-2.html`
    у документа, ADR 0063); первый постраничный список на странице — главный, порция за пределами — 404.
    `filter(page) → boolean` и `order(a, b) → number` (важнее `sort`) — свой отбор и порядок (ADR 0064):
    кандидаты — те же страницы ветки с полями, `total` и пейджер — по отобранным; виды кандидатов заморожены и
    держатся в памяти до правки контента (первый вызов на 2600 страниц — около 70 мс, дальше — единицы мс).
    `page: n` — номер порции явно (из `request().query.page` в `Uncached`, где хвоста адреса нет): 404 нет,
    номер за последней — последняя, `url(n)` — тот же путь с `?page=n`;
  - `site()` — настройки сайта плюс `i18n` и `custom`: `site().i18n.footer`, `site().custom.phone`;
    оба перечисляются (`Object.keys`, `entries`, `JSON.stringify`, `in`) — ключи со значением на языке
    страницы, иначе сайта; отсутствующий ключ по-прежнему читается как `{i18n.key}` / `[@key]`. Словарь для
    скрипта страницы — `{@html '<script type="application/json">' + JSON.stringify(site.i18n).replaceAll('<',
    '\\u003c') + '</script>'}`: `<script>` прямо в разметке Svelte оставляет текстом (ADR 0061);
  - `request()` — запрос; читать только внутри `Uncached`;
  - `media(path)` — URL файла медиатеки с версией;
  - `image(path)` — `{ src, srcset, width, height, alt }` из вариантов `photo@960.webp`; `alt` —
    описание картинки из медиатеки (пусто — не описана).
  - `path` у обоих — путь медиатеки или исходный путь файла связанной папки `<приставка>/<путь на диске>`
    (`image('assets/images/4a_(5).jpg')`, ADR 0065): перенесённые пути не переписывают. Ответ — всегда путь
    медиатеки (`/media/assets/images/4a-5.jpg?v=…`); страница получает тег файла, его сверка и описание
    перерисуют её. Варианты картинок папки лежат в кэше медиатеки, `srcset` тот же.
  - `script(name)` — адрес скрипта сайта `/_cms/scripts/<имя>.<хэш>.js` или `null`; вешает теги
    `element:script/<имя>` скрипта и всех, до кого доходят его ссылки `./имя.js`, — правка любого из них
    перерисует страницу с новым адресом (ADR 0039, 0057).
    Подключение — в `<svelte:head>`: `<script type="module" src={script('kitchen-stage')}></script>`;
    тот же тег на верхнем уровне разметки — `script_duplicate`.
  - `t(key)` — перевод на язык страницы (её ветки), иначе на язык сайта; нет ключа — `{i18n.key}`; список —
    по пункту на строку: `t('topics').split('\n')` (переводы строк хранятся как LF);
  - `setting(key)` — своя настройка сайта; нет — `[@key]`;
  - `search(query, { limit, parent, page })` → `{ query, items: [{ id, title, url, snippet }], total,
    number, pages, url(n), pager(around) }` — поиск по опубликованным страницам на языке текущей (ADR 0030).
    `snippet` — HTML с `<mark>`, уже экранирован: выводить через `{@html}`. Вызов в первой фазе вешает
    на страницу тег `search` — её сбрасывает любая правка страниц. Фраза в кавычках ищется целиком,
    синонимы — из настроек сайта; если ничего не нашлось и запрос исправлен, `corrected` — его текст
    (иначе `null`): выдача тогда по исправленному.

  Шаблон получает `{ page, site }`, и в `site` уже есть переводы и свои настройки: `{site.i18n.key}`,
  `{site.custom.key}` — обычные выражения Svelte (`delivery/domain/site-keys.ts`); нет ключа — сам
  ключ в скобках. Теги `{i18n.key}` и `[@key]` — только для текста страниц и параметров компонентов;
  в разметке шаблона они отклоняются при сохранении (`design.key_tags`, `design/domain/placeholders.ts`).
  В островах ключей нет (`design.island_placeholders`): в браузере нет словарей — тексты через props.
- SEO-разметку (`canonical`, описание, `robots`, Open Graph, Twitter, JSON-LD, ссылку на Markdown-версию)
  добавляет рендер сам (`delivery/domain/discovery.ts`); если шаблон уже выводит такой тег — например
  `<meta name="description">`, — свой тег рендер не добавляет. Плавные переходы между страницами — настройка
  сайта `viewTransitions` (ADR 0066): рендер сам ставит в head `@view-transition` (с оглядкой на
  `prefers-reduced-motion`), шаблону своё правило не нужно; своё `@view-transition` в head или стилях вида
  важнее — второго рендер не добавит. `<html lang>` — язык страницы. Свой `<meta name="viewport">` шаблона (например, с `viewport-fit=cover`)
  заменяет обычный — второго тега документ не ставит.

  Каждый экспорт — публичный API для разработчиков сайтов. Добавляй экспорты осознанно и описывай их в
  `docs/glossary.md`.
- Стили scoped, пишутся в `<style>` своего файла, а в страницу уходят ссылками на файлы стилей (ADR 0047). На
  клиент JS не отправляется — кроме островов и скриптов сайта.

## Стили

- Рендер забирает `$$css` нарисованных видов из `$$renderer.global.css` до печати head
  (`delivery/infrastructure/svelte-view-renderer.ts`); компиляция — прежняя, `css: "injected"`.
- Каталог (`design/infrastructure/site-styles.ts`): CSS, где каждый селектор с классом области, — в общем файле
  `/_cms/styles/site.<хэш>.css`; элемент с правилом на весь документ (`:global(body)`, `@font-face`, `@import`,
  `@layer a, b;`) — свой файл `/_cms/styles/<Имя>.<хэш>.css` только на страницах, где он нарисован
  (`isScoped` по `parseCss` из `svelte/compiler`). `<svelte:options css="injected" />` — стиль остаётся в
  странице `<style id>`.
- Теги — в конце head вида, до SEO-шапки и head регионов; свои файлы — по рендеру, общий — последним. Стили
  регионов дописываются после head регионов, без повторов.
- Хэш — от содержимого файла; правка шаблона или компонента сбрасывает тег кэша `styles`. Прежний хэш отдаёт
  текущую версию с `no-cache`, незнакомое имя — 404. Отдача общая со скриптами: `design/interface/file-handler.ts`.

## Скрипты сайта

- Элемент `kind: 'script'`, имя `kitchen-stage`, до 2 МиБ; в папке элементов — `scripts/<имя>.js` (ADR 0039).
- При сохранении `Bun.Transpiler.scanImports` проверяет синтаксис (`design.script_syntax` со строкой и
  столбцом), пути берутся из дерева acorn (`platform/module-imports.ts`, `modulePaths`). `import`, `export from`
  и `import('…')` — только `./имя.js` (другой скрипт сайта) и `https://…`, иначе `design.script_import`.
- Куски одной сборки — отдельные скрипты (ADR 0057). Ссылка `./имя.js` — в `import`/`export from`, `import()` и
  `new URL('./имя.js', import.meta.url)` (воркер); в `import()` и `new URL` — и шаблон без подстановок.
  Строка, где просто написано `./x.js`, — не ссылка. Скрипт, на который есть ссылка, должен быть в базе или в
  том же наборе (`ScriptBatch`), иначе `design.unknown_script`. Круг ссылок разрешён.
- Набор: `design.scripts.save(name, source, batch)` ищет ссылки сначала в `batch`; `saveAll(batch)` —
  транзакцией. Отправка папки, `PUT /elements/script/<имя>` со `scripts`, `save_element` со `scripts`, каркас и
  принятие предложений — набором. Круг из новых скриптов по одному не сохранить.
- Адрес (`design/infrastructure/site-scripts.ts`): у компоненты сильной связности один хэш — исходники членов по
  имени плюс хэши внешних компонент; у скрипта без ссылок — хэш исходника. Тело ответа — исходник с
  `./имя.<хэш>.js` на местах ссылок (`linkScript`). Разбор acorn запоминается по имени и хэшу исходника
  (`defineScriptModules`): около 0,2 с на 1,1 МБ, раз на версию.
- Отдаёт `design/interface/file-handler.ts`: `text/javascript`, `nosniff`, `immutable`, ETag, HEAD, br/gzip;
  прежний хэш — 404.
- Удалить скрипт, который подключает `script('имя')` строкой или на который ссылается другой скрипт, нельзя
  (`design.element_in_use`). `remove(kind, name, together)` не считает держащими тех, кто уходит вместе:
  `--prune` удаляет круг одной отправкой.
- Цикл импортов компонентов (`design.import_cycle`) и ошибка компиляции (`design.compile_failed`) отклоняют
  сохранение, а сайт продолжает работать на прежней версии.

## Формы

- В тексте страницы — тег модуля `[#Form:имя]`, в шаблоне — `import Form from '$core/Form'` и
  `<Form name="callback" />`. Это регион вида `module`: рисуется на каждом запросе (свежая печать, метки UTM,
  флеш после отправки без JS), страница вокруг — из кэша. Незнакомый модуль выводится тегом как есть.
- Форма — HTML5-разметка из раздела «Формы»; сервер читает её `HTMLRewriter` (`forms/infrastructure/html-markup.ts`).
  Стили — `:where(.cms-form …)` и переменные `--t-*`, их перекрывает любой стиль шаблона.
- После отправки скрипт улучшения шлёт событие `cms:form-sent` (`detail: { form, goal }`) — цель аналитики
  сайт отправляет сам.

## Поиск

- Индекс — контекст `search` (FTS5, основы слов Snowball для русского и лёгкие для английского), обновляется
  событиями страниц. В выдаче — опубликованные, видимые поисковикам страницы без 404.
- Набор: `SearchForm` (GET-форма для шапки; уже 7rem — кнопка-лупа) и `SearchResults` (поле, выдача,
  пейджер; читает `request().query.q`). Выдача — регионом `<Uncached name="SearchResults" />` (страница
  вокруг в кэше) или тегом `[[SearchResults]]` в тексте (страница не кэшируется).
- JSON для островов — `GET /_cms/search?q=&limit=&page=&lang=&parent=`, 60 запросов в минуту с адреса.

## Набор компонентов

- Исходники — `src/kit/*.svelte`, каталог с зависимостями — `src/kit/index.ts` (`KIT`, `kitClosure`).
  Менеджер ставит их в элементы сайта (`GET /kit`, `POST /kit/:name`, `{ replace: true }` — заменить
  правленый). Каркас ставит нужные ему компоненты набора с зависимостями (`Scaffold.kit`).
- Острова набора (`MenuKeys`, `ModalLinks`) держат один обработчик на страницу через `<script module>`.
- Svelte выводит неизвестные атрибуты как есть: `popover`, `popovertarget`, `commandfor`, `command`,
  `closedby` работают без JS там, где их знает браузер.

## Каркасы сайтов

- `src/scaffolds/<имя>/index.ts` — значение `Scaffold` (ADR 0022): `kit` (компоненты набора, зависимости
  ставятся сами), `components` (зависимости раньше зависящих), `templates`, `fields`, `forms`, `settings`
  (свои настройки сайта: строка или `{ value, note }` с пояснением для менеджера, ADR 0055), `translations`
  (ключ → текст на языке каркаса или `{ язык: текст }`; языки веток и переводов становятся языками сайта,
  ADR 0061), `redirects` (правила `{ from, to, status, note }`, цель-страница — `[~@{key}~]`), `pages`
  (дерево), `home` и `notFound` — ключи страниц.
- Пакет каркаса (ADR 0056) — тот же `Scaffold` файлами: `translations` и `redirects` в манифесте — формат 2,
  без них выгрузка пишет формат 1; язык перевода — язык пакета или его ветки, иначе
  `package.unknown_language`; правила проверяет контекст `redirects` при пробной установке.
- Общие функции нескольких компонентов — в `<script module>` одного из них: `import Studio, { facts } from
  '$components/Studio'` (так устроен `kuechenstudio`).
- `@{key}` в тексте страниц, исходнике форм и своих настройках — id страницы с этим `key`: `[~@{contacts}~]`,
  `[[RecentPosts parent=@{blog}]]`. Текст и формы пишутся вторым проходом.
- Рамка сайта — компонент `Layout` со `children`-сниппетом: заголовок вкладки, шапка, подвал, переменные
  `--t-*` для набора и форм. Стили текста страницы — `:global(:where(.prose) …)`: нулевая специфичность,
  компоненты внутри текста сильнее.
- Поля форм — функции `src/scaffolds/form-html.ts`: та же разметка, что пишет редактор форм, форма
  открывается в нём блоками.
- `.svelte` каркаса импортируются текстом, как набор. Внешних шрифтов и картинок нет: пустая обложка —
  заготовка из CSS.
- Проверка — `tests/scaffolds.test.ts`: каждая опубликованная страница 200, в HTML нет тегов `[[`, `[#`,
  `[~`, `@{`.
- Флаг ядра `hidden` в конце тега (`[[Name hidden]]`, `[#Form:name hidden]`) скрывает блок, не удаляя:
  `withoutHidden` выбрасывает его до разбора, компоненту он не передаётся (ADR 0035).

## Некэшируемые регионы

```svelte
<script>
  import Uncached from '$core/Uncached';
</script>
<Uncached name="Cart" props={{ currency: 'EUR' }} />
```

- Страница кэшируется, а `Cart` рендерится на каждом запросе. Внутри региона можно читать `request()`
  (`path`, `query`, `header(name)`, `cookie(name)`).
- Props должны сериализоваться в JSON. Регион и форма внутри региона ничего не выводят, а остров —
  рисуется: его props считаются на каждом запросе (можно из `request().cookie(…)`) и в кэш не попадают
  (ADR 0036). Загрузчик островов на странице один.
- Если `request()` читается в шаблоне вне региона, страница не кэшируется (`x-cache: bypass`).
- Кэш сбрасывается по тегам (ADR 0007). Проверка — заголовок `x-cache: hit | miss | bypass`.

## Острова

```svelte
<script>
  import Island from '$core/Island';
</script>
<Island name="Counter" props={{ start: 2 }} />
```

- Сервер рендерит `Counter` с маркерами гидрации, браузер гидрирует его модулем
  `/_cms/islands/Counter.<hash>.js`. На странице один загрузчик.
- Остров импортирует только `svelte` и `$components/*`, без `$core` (`design.island_import`). Данные
  передаются через props (JSON). Остров в острове поэтому невозможен; остров в `Uncached` — можно.
- Рантайм Svelte для браузера — `design/infrastructure/client-runtime.ts`. В бинарнике он вшит
  (`CLIENT_RUNTIME_KEY`), в разработке собирается `Bun.build` при первом острове.

## Как это работает

1. `design.components.save` / `design.templates.save` (`design/application/design-service.ts`) проверяет
   имя, ищет циклы (`domain/import-cycle.ts`) и вызывает `svelteSourceCompiler.check`.
2. `defineViewLoader(…).template(name)` (`design/infrastructure/bun-view-loader.ts`):
   - `compileForServer` (`generate: "server"`, `css: "injected"`, `runes: true`);
   - `Bun.Transpiler.scanImports` и белый список;
   - пути импортов по дереву разбора (`platform/module-imports.ts`) переписываются на
     `@cms/views-N/<kind>/<Name>-<hash>` и `@cms/views-N/host/<module>`; текст в строках не трогается;
   - модули регистрируются через `build.module()`;
   - шаблон загружается через `import(вычисляемый спецификатор)`.
3. Разрешённые спецификаторы кэшируются в `#resolved` и сбрасываются на любое событие `design.*`.
4. `svelteDocumentRenderer`: `render()` из `svelte/server` → стили нарисованных видов списком → удаление маркеров `<!--[-->`, `<!--]-->`,
   `<!---->` и хэша в head → HTML-документ с `<html lang>`.

## Проверенные факты (2026-10-29, Bun 1.4.4, Svelte 5.57.3)

- Стили (2026-11-03): `render()` синхронно зовёт корень как `component($$renderer, props)`; `$$renderer.global.css`
  — `Set` из `$$css` нарисованных видов по порядку рендера. Набор, очищенный до конца корня, Svelte в head не
  печатает. Сжатый CSS Svelte даёт только при `css: "injected"`; при `"external"` в CSS пробелы и
  `/* (unused) */` (+20 %), зато только там есть `hasGlobal`. Класс области — хэш имени файла, у шаблона и
  компонента с одним именем он общий. `compile(…, { modernAst: true }).ast.options?.css` — значение
  `<svelte:options css>`. Остров в браузере вставляет стиль, только если компонент сам просит `css="injected"`,
  и только когда в head нет `#svelte-…`.
- `plugin({ setup(build) { … } })`: ссылку на `build` можно сохранить и звать `build.module()` позже. Это
  работает в `bun run`, `bun test` и в бинарнике `bun build --compile`.
- Рантайм-`build.onResolve` **не срабатывает** для голых спецификаторов (`Cannot find package …`). Не
  пытайся его использовать.
- `import("$components/X")` с литералом бандлер разрешает при сборке, и `--compile` падает. Спецификатор
  должен быть вычисляемым.
- Повторный `import()` того же спецификатора возвращает старый модуль. Поэтому в спецификаторе есть хэш кода.
- Хост-модули регистрируются как `{ exports: {...obj}, loader: "object" }`.
- `bun test` ставит `NODE_ENV=test`, тогда `esm-env` даёт `DEV = true`, и серверный рантайм Svelte
  добавляет маркеры (например, `<!--h6dbkn-->` перед `{@html}`). Поэтому тесты запускаются с
  `NODE_ENV=production`, а сборка — с `--define process.env.NODE_ENV='"production"'`. У `bun run` без
  `NODE_ENV` значение `DEV` ложно.
- Комментарии внутри `{@html}` (например, `<!--noindex-->` для Яндекса) сохраняются: регулярка маркеров их не
  трогает, это проверяет тест.
- У `svelte/internal/server` нет TS-типов, они объявлены в `src/ambient.d.ts`.
- `.svelte`, импортированный `with { type: "text" }`, встраивается в бинарник строкой. Но собственные типы
  Svelte для `*.svelte` описывают компонент, поэтому в `src/scaffolds/*/index.ts` стоит приведение к `string`.
- Замеры: компиляция первого вида около 20 мс (прогрев), дальше около 2 мс; рендер около 0,07 мс; бинарник
  около 105 МБ, собирается примерно за 0,1 с.

## Отладка

| Симптом                                       | Причина                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 500 и `There is no template named "X"` в логе | У страницы `template` указывает на несуществующий шаблон                                           |
| `design.forbidden_import`                     | Импорт вне белого списка; относительные импорты тоже запрещены                                     |
| `Cannot find module '@cms/views-…'`           | Ошибка загрузчика: спецификатор не был зарегистрирован                                             |
| Правка не видна                               | Не было события `design.*` (сохранение мимо `design.*.save`?) или страница закэширована без сброса |
| В HTML лишние `<!--…-->`                      | Запуск в dev-режиме (`NODE_ENV` не production)                                                     |

## Известные ограничения

- Модули не выгружаются: каждая правка добавляет модуль в память, перезапуск освобождает её.
- `views.template/component` отдают `{ view, elements }`, где `elements` — ключи графа импортов для тегов кэша.
