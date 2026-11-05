---

name: cms-architecture
description: Архитектурные правила проекта (DDD, модульный монолит, гексагональные контексты, синхронные порты) и рецепты, куда класть новый код. Use when adding or changing anything in src/ — a use case, aggregate, value object, repository, read model, migration, domain event, a new bounded context — or when tests/architecture.test.ts fails.
---

# Архитектура

Полная картина — `docs/architecture.md`, язык — `docs/glossary.md`, форма кода — `docs/code-style.md`
(скилл `cms-conventions`). Здесь правила слоёв и рецепты.

## Карта

```
src/app.ts                     корень композиции; единственный, кто знает все контексты
src/main.ts                    CLI и Bun.serve
src/shared/kernel/             pipe, Brand, fail/DomainError, Changed/chain, DomainEvent/EventBus
src/platform/                  database.ts (openDatabase, migrate), event-bus.ts (defineEventBus)
src/contexts/<ctx>/domain/          чистый TS: типы агрегатов, переходы, значения, события, порты-репозитории
src/contexts/<ctx>/application/     чистый TS: define<Ctx>Service(ports), модели чтения, порты
src/contexts/<ctx>/infrastructure/  define*Repository(db), svelte, bun-адаптеры, migrations.ts
src/contexts/<ctx>/interface/       HTTP
src/contexts/<ctx>/index.ts         define<Ctx>({ db, bus, … }) + публичные типы
```

Контексты и их API:

| Контекст   | API                                                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`  | `pages.{create,edit,publish,unpublish,move,setFields,trash,restore}`, `trash.empty`, `schedule.runDue`, `fields.{save,list}`, `published.{page,byPath,children,list}`, `isEmpty` |
| `design`   | `templates.save`, `components.save`, `scripts.{save,saveAll,url,closure}`, `views.template`                                                                                      |
| `site`     | `settings.{get,update}`                                                                                                                                                          |
| `delivery` | `handle(Request)`; `defineComponentRuntime` — модуль `$core`                                                                                                                     |

## Правила зависимостей

Их проверяет `tests/architecture.test.ts`.

- `domain` → только свой `domain` и `shared/kernel`. Никаких пакетов, `bun:*` и `node:*`.
- `application` → свои `domain` и `application`, `shared/kernel`, `index.ts` чужих контекстов (только
  `import type`).
- `infrastructure`, `interface`, `index.ts` → свой контекст, `platform`, `shared` и пакеты.
- Чужой контекст — **только** через `contexts/<other>/index.ts`.
- `platform` не знает контекстов. `shared/kernel` импортирует только себя.
- Импорты пишутся с расширением `.ts`. Инструкция импорта начинается с первой колонки: на этом построен тест.

Если правило мешает — не обходи его. Расширь публичный API контекста или объяви порт у потребителя.

## Тактика

- **Агрегат** — `type` с `readonly`-полями. Переходы — `createX(id, input)`, `editX(changes)(state)`,
  `publishX(state)`, все возвращают `Changed<X, XEvent>`. Если ничего не изменилось, событий нет.
- **Событие** — `type: 'context.past_tense'` в `domain/events.ts`.
- **Сценарий** в `define<Ctx>Service`: `load` → переход → проверка межагрегатных правил (уникальность
  алиаса) → `save` → публикация `events`. Всё это одним `pipe`.
- **Модель чтения** — тип и DTO в `application/`, SQL-реализация `defineX(db)` в `infrastructure/`.
- **Порты синхронны**, потому что синхронен `bun:sqlite`. Асинхронны только загрузка модулей и HTTP.
- **Подписки на события** — в `index.ts` контекста. Шина синхронная.
- **Таблицы** называются с префиксом контекста (`content_pages`), в чужие таблицы не ходим.

## Рецепты

**Новая операция.**
1. Переход в `domain/*.ts` и тест рядом.
2. Операция в пространстве имён `define<Ctx>Service`.
3. При необходимости экспорт типа из `index.ts`.
4. Интеграционный тест в `tests/` через `createApp()`.

**Новое поле агрегата.**
1. Поле в типе агрегата и во входном типе (`NewPage`).
2. Правило в таблице `_EDIT`.
3. Новая миграция `context/NNN_…`. Старые миграции не трогаем никогда.
4. Колонка и маппинг в `define*Repository`.
5. DTO модели чтения, если поле видно снаружи.

**Миграция.** Добавь объект в конец массива `infrastructure/migrations.ts` с id
`context/NNN_description`. Массив миграций нового контекста подключается в `src/app.ts` → `migrate(...)`.

**Новый контекст.**
1. Создай `src/contexts/<ctx>/{domain,application,infrastructure}` и `index.ts` с `define<Ctx>(deps)`.
2. Подключи его в `src/app.ts`.
3. Добавь строку в таблицу контекстов `docs/architecture.md` и термины в `docs/glossary.md`.
4. Если решение неочевидно — напиши ADR в `docs/adr/`.

## Тесты и проверка

- Доменные тесты лежат рядом с кодом: переходы проверяются как чистые функции. Интеграционные — в
  `tests/`: `createApp({ seedDemo: true })` и `app.fetch(new Request('http://localhost/...'))`.
- `bun run test` запускает `NODE_ENV=production bun test src tests`. Режим production нужен, чтобы HTML
  совпадал с боевым (см. скилл `cms-views`).
- Перед завершением работы: `bun run check` (lint + tsc + тесты). Если менялся рантайм или сборка, ещё
  `bun run build` и запуск `dist/cms --port <p> --db <tmp>` из каталога без `node_modules`.
