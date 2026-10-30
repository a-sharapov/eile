---

name: cms-conventions
description: Стиль кода проекта — pipe/reduce, без early return, таблица вместо if, .then вместо async/await, export var и стрелки, фабрики define*Service/define*Repository, агрегаты как данные с переходами Changed, fail(), indexed tuples, комментарии только по делу и по-русски, Biome. Use when writing, editing, refactoring or reviewing any TypeScript/Svelte in this repo, and before saying a diff is done.
---

# Стиль кода проекта

Полные правила с примерами — `docs/code-style.md`. Перед сдачей диффа пройди чеклист.

## Чеклист

- [ ] **pipe** — два шага и больше над одним значением оформлены `pipe(…)(x)`, а не цепочкой `let`?
- [ ] **reduce** — накопление через `reduce` с неизменяемым аккумулятором, без `for` с мутацией?
- [ ] **`(_) =>`** — однопараметрические лямбды в шагах названы `_`?
- [ ] **без early return** — нет `if (…) return`? Ветки — тернарники, `??`, `void (p && f())`, `fail()`?
- [ ] **таблица** — выбор по kind/method/area сделан через `Record` и `map[key] ?? map._`?
- [ ] **Promise** — `.then(_handle, _catch)`; синхронно бросающее завёрнуто в `Promise.resolve(x).then(…)`;
  нет `async`/`await` вне тестов?
- [ ] **кортежи** — `{ 0: a, 1: b }`, а не `[, b]`?
- [ ] **модули** — `export var` со стрелками, `type` вместо `interface`, `import type`, приватное — `_name`?
- [ ] **без классов** — агрегат — `type` плюс переходы `(state) => changed(next, ...events)`; сервис —
  `defineXService(ports)` с пространствами имён операций; адаптер — `defineX(db)`?
- [ ] **ошибки** — `fail('context.reason', 'English message')`, проверка через `isDomainError`?
- [ ] **слои** — правила `tests/architecture.test.ts` не нарушены (скилл `cms-architecture`)?
- [ ] **комментарии** — только необходимые, одна-две строки, по-русски, без пересказа и истории?
- [ ] **тесты** — названия по-русски, `it(…)`; новая логика покрыта доменным тестом рядом или
  интеграционным в `tests/`?
- [ ] **CSS** — `rem`/`em`, без `:global()` во внешних файлах, иконки в кнопках — SVG?
- [ ] **проверка** — `bun run check` зелёный (lint + typecheck + test)? Если менялась сборка или рантайм —
  `bun run build` и запуск бинарника вне репозитория?

## Подводные камни

- `pipe` типизирован слабо. Ставь `pipe<In, Out>` и аннотируй параметр первого шага, иначе TS выведет
  `unknown`.
- Biome ругается `useIterableCallbackReturn`, если колбэк `forEach` возвращает значение. Пиши
  `.forEach((_) => void effect(_))`.
- Escape-последовательности вроде `̀` в регулярках при записи файла через инструменты могут
  превратиться в невидимые символы. Используй классы Unicode: `/\p{M}/gu`.
- Biome не видит использования импортов в разметке `.svelte`, поэтому для них правила неиспользуемого
  отключены в `biome.json`.

## Образцы в коде

| Паттерн                                       | Где                                                             |
| --------------------------------------------- | --------------------------------------------------------------- |
| Агрегат и переходы, таблица правок            | `src/contexts/content/domain/page.ts`                           |
| Сервис `define*Service` и `pipe` со сценарием | `src/contexts/content/application/content-service.ts`           |
| Репозиторий с подготовленными запросами       | `src/contexts/content/infrastructure/sqlite-page-repository.ts` |
| Promise-цепочка и таблица ответов             | `src/contexts/delivery/interface/site-handler.ts`               |
| Замыкание с состоянием                        | `src/contexts/design/infrastructure/bun-view-loader.ts`         |
