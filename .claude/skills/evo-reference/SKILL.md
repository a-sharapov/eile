---

name: evo-reference
description: Как сверяться с исходниками Evolution CMS 1.4.37 (MODX Evo), которые лежат рядом с проектом — карта файлов и функций ядра, схема БД, события, TV-привязки — и правило «поведение описываем, реализуем своё» (оба проекта под GPL-3.0-or-later). Use when you need to know how Evo/MODX Evolution does something (parser, tags, cache, TVs, URLs, events, snippets like DocLister, manager behaviour) before designing the CMS equivalent.
---

# Справочник по Evo

Исходники лежат в `evolution-1.4.37/` в корне репозитория. Они в `.gitignore` и не входят в проект. Если
папки нет, скачай релиз Evolution CMS 1.4.37 (GitHub `evolution-cms/evolution`) и распакуй его туда же.

Это обычный PHP. Читай его напрямую, скилл reverse-engineer-anything здесь не нужен.

## Поведение, а не код (ADR 0004)

Evo и этот проект — оба под GPL-3.0-or-later, так что лицензия перенос не запрещает. Но архитектура другая, и
код Evo в проект не переносим.

1. Читай, чтобы понять **поведение**.
2. Опиши поведение своими словами в `docs/evo-essence.md` со ссылками `файл:строка`.
3. Реализуй с нуля из описания, в терминах `docs/glossary.md`.

Не переводи PHP построчно. Если всё же берёшь фрагмент (таблицу данных, алгоритм), сохрани копирайт Evo
и укажи источник в комментарии.

## Карта

Ядро — `app/includes/document.parser.class.inc.php`, номера строк для 1.4.37.

| Что                                          | Где                                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Старт запроса                                | `executeParser()` :2814, `prepareResponse()` :2993                                                                                                                          |
| Многопроходный парсер                        | `parseDocumentSource()` :2762                                                                                                                                               |
| Теги `[( )]` `[* *]` `{{ }}` `[[ ]]` `[+ +]` | `mergeSettingsContent` :1556, `mergeDocumentContent` :1364, `mergeChunkContent` :1605, `evalSnippets` :2060, `mergePlaceholderContent` :1674                                |
| `@IF` и комментарии `<!--@- -@-->`           | `mergeConditionalTagsContent` :1734, `ignoreCommentedTagsContent` :1888                                                                                                     |
| Кэш: чтение, ключ, файл                      | `getDocumentObjectFromCache` :858, `makePageCacheKey` :832, `getHashFile` :823                                                                                              |
| Кэш: запись                                  | `postProcess` :1211                                                                                                                                                         |
| Некэшируемые `[! !]` и вывод                 | `outputContent` :960 (обработка `[!` на :974)                                                                                                                               |
| URL                                          | `makeUrl` :4260, `rewriteUrls` :2515                                                                                                                                        |
| API сниппетов                                | `getDocumentChildren` :3901, `getDocuments` :3966, `getChildIds` :3168, `runSnippet` :4449, `getChunk` :4481, `parseChunk` :4603, `parseText` :4524, `getTemplateVar` :4903 |
| События                                      | `invokeEvent` :5621; список из 145 событий — `INSERT` в `system_eventnames` в `install/setup.sql`                                                                           |
| Ошибки и редиректы                           | `sendErrorPage` :411, `sendRedirect` :326                                                                                                                                   |
| TV @-привязки                                | `app/includes/tmplvars.commands.inc.php` (`$BINDINGS`, :7)                                                                                                                  |
| Виджеты вывода TV                            | `app/includes/tmplvars.format.inc.php`                                                                                                                                      |
| Схема БД                                     | `install/setup.sql`; демо-данные — `install/setup.data.sql`                                                                                                                 |
| Настройки по умолчанию                       | `app/includes/default_config.php`                                                                                                                                           |
| Менеджер                                     | `app/actions/`, `app/processors/`, `app/frames/`                                                                                                                            |
| Поставляемые сниппеты, плагины, модули       | `assets/snippets/` (DocLister, FormLister…), `assets/plugins/` (transalias, managermanager, qm…), `assets/modules/`                                                         |

## Поиск

- В этом окружении `grep` — это ugrep. Скобки тегов в регулярке ломают выражение (`[!` даёт ошибку), поэтому
  ищи литералом: `grep -nF '[!' file`.
- Функцию находи по определению: `grep -nE "function makeUrl\b" app/includes/document.parser.class.inc.php`.
- Номера строк меняются от версии к версии. Если обновил Evo, обнови и таблицу.

## Импорт

Перенос сайтов Evo — `src/evo-import/` (ADR 0009). Проверочный дамп — демо установщика:
`cat install/setup.sql install/setup.data.sql | sed 's/{PREFIX}/modx_/g' > dump.sql`, затем
`bun src/main.ts import-evo dump.sql --db /tmp/evo.db`.

## Результат

Если выяснил новое поведение, допиши `docs/evo-essence.md`. Для решений «берём / меняем / выбрасываем»
используй таблицу в конце этого файла, а если решение спорное — заведи ADR.
