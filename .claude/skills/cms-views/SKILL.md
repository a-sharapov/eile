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
  import Menu from '$components/Menu';
  let { page, site } = $props();
</script>

<svelte:head><title>{page.title} — {site.name}</title></svelte:head>
<Menu />
<main>{@html page.content}</main>
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
  `content`, `path`, `kind` (`page` | `link`), `linkTo`, `publishedAt`, `createdAt`, `updatedAt`. По
  обычаю Evo: `{page.longTitle || page.title}` в заголовке и `{item.menuTitle || item.title}` в меню.
  `link(id)` для ссылки отдаёт адрес её цели.
- Поля страницы — `page.fields.<имя>`: своё значение, иначе унаследованное (если у поля `inherit`), иначе
  умолчание, иначе `null`. В `page.fields` есть все поля, назначенные на шаблон страницы.
- API `$core` (`delivery/application/component-runtime.ts`):
  - `link(id)` — URL опубликованной страницы или `null`; при `null` Svelte не выводит атрибут;
  - `page(id)`;
  - `children(parentId | null, { includeHidden })`;
  - `current()` — страница первой фазы; в `Uncached` и острове — `null`. Компоненты набора берут текущую
    страницу отсюда, а не из параметра `page`;
  - `ancestors(id)` — предки от корня до родителя (крошки, активная ветка меню);
  - `listing(parent, { perPage, sort, depth, includeHidden, paged })` → `{ items, number, pages, total,
    url(n), pager(around) }`. Скрытые из меню — в списке по умолчанию. Номер порции берётся из хвоста
    адреса `/blog/page-2` (ADR 0019); первый постраничный список на странице — главный, порция за
    пределами — 404;
  - `site()` — настройки сайта плюс `i18n` и `custom`: `site().i18n.footer`, `site().custom.phone`;
  - `request()` — запрос; читать только внутри `Uncached`;
  - `media(path)` — URL файла медиатеки с версией;
  - `image(path)` — `{ src, srcset, width, height, alt }` из вариантов `photo@960.webp`; `alt` —
    описание картинки из медиатеки (пусто — не описана).
  - `t(key)` — перевод на язык страницы (её ветки), иначе на язык сайта; нет ключа — `{i18n.key}`;
  - `setting(key)` — своя настройка сайта; нет — `[@key]`.

  Шаблон получает `{ page, site }`, и в `site` уже есть переводы и свои настройки: `{site.i18n.key}`,
  `{site.custom.key}` — обычные выражения Svelte (`delivery/domain/site-keys.ts`); нет ключа — сам
  ключ в скобках. Теги `{i18n.key}` и `[@key]` — только для текста страниц и параметров компонентов;
  в разметке шаблона они отклоняются при сохранении (`design.key_tags`, `design/domain/placeholders.ts`).
  В островах ключей нет (`design.island_placeholders`): в браузере нет словарей — тексты через props.
- SEO-разметку (`canonical`, описание, `robots`, Open Graph, Twitter, JSON-LD, ссылку на Markdown-версию)
  добавляет рендер сам (`delivery/domain/discovery.ts`); если шаблон уже выводит такой тег — например
  `<meta name="description">`, — свой тег рендер не добавляет. `<html lang>` — язык страницы.

  Каждый экспорт — публичный API для разработчиков сайтов. Добавляй экспорты осознанно и описывай их в
  `docs/glossary.md`.
- Стили scoped, уходят в `<head>`. На клиент JS не отправляется.
- Цикл импортов (`design.import_cycle`) и ошибка компиляции (`design.compile_failed`) отклоняют сохранение,
  а сайт продолжает работать на прежней версии.

## Формы

- В тексте страницы — тег модуля `[#Form:имя]`, в шаблоне — `import Form from '$core/Form'` и
  `<Form name="callback" />`. Это регион вида `module`: рисуется на каждом запросе (свежая печать, метки UTM,
  флеш после отправки без JS), страница вокруг — из кэша. Незнакомый модуль выводится тегом как есть.
- Форма — HTML5-разметка из раздела «Формы»; сервер читает её `HTMLRewriter` (`forms/infrastructure/html-markup.ts`).
  Стили — `:where(.cms-form …)` и переменные `--t-*`, их перекрывает любой стиль шаблона.
- После отправки скрипт улучшения шлёт событие `cms:form-sent` (`detail: { form, goal }`) — цель аналитики
  сайт отправляет сам.

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
  (свои настройки сайта), `pages` (дерево), `home` и `notFound` — ключи страниц.
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

## Некэшируемые регионы

```svelte
<script>
  import Uncached from '$core/Uncached';
</script>
<Uncached name="Cart" props={{ currency: 'EUR' }} />
```

- Страница кэшируется, а `Cart` рендерится на каждом запросе. Внутри региона можно читать `request()`
  (`path`, `query`, `header(name)`, `cookie(name)`).
- Props должны сериализоваться в JSON. Регион внутри региона ничего не выводит.
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
  передаются через props (JSON).
- Рантайм Svelte для браузера — `design/infrastructure/client-runtime.ts`. В бинарнике он вшит
  (`CLIENT_RUNTIME_KEY`), в разработке собирается `Bun.build` при первом острове.

## Как это работает

1. `design.components.save` / `design.templates.save` (`design/application/design-service.ts`) проверяет
   имя, ищет циклы (`domain/import-cycle.ts`) и вызывает `svelteSourceCompiler.check`.
2. `defineViewLoader(…).template(name)` (`design/infrastructure/bun-view-loader.ts`):
   - `compileForServer` (`generate: "server"`, `css: "injected"`, `runes: true`);
   - `Bun.Transpiler.scanImports` и белый список;
   - импорты переписываются на `@cms/views-N/<kind>/<Name>-<hash>` и `@cms/views-N/host/<module>`;
   - модули регистрируются через `build.module()`;
   - шаблон загружается через `import(вычисляемый спецификатор)`.
3. Разрешённые спецификаторы кэшируются в `#resolved` и сбрасываются на любое событие `design.*`.
4. `svelteDocumentRenderer`: `render()` из `svelte/server` → удаление маркеров `<!--[-->`, `<!--]-->`,
   `<!---->` и хэша в head → HTML-документ с `<html lang>`.

## Проверенные факты (2026-10-29, Bun 1.4.4, Svelte 5.57.3)

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
- Импорты переписываются регуляркой по скомпилированному коду.
- `views.template/component` отдают `{ view, elements }`, где `elements` — ключи графа импортов для тегов кэша.
