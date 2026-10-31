# Eile

CMS в духе MODX Evo — просто, быстро, без лишнего: Bun 1.4 + SQLite + Svelte 5, поставка одним бинарником. Архитектура — DDD,
модульный монолит, код — в функциональном стиле. Лицензия GPL-3.0-or-later.

## Команды

```sh
bun install
bun run dev        # http://localhost:8080, база site.db; на пустой базе — приветствие и шаблон Minimal
bun run check      # biome + tsc + все тесты (NODE_ENV=production)
bun run format     # форматирование Biome
bun run dev:manager # SPA менеджера на Vite с прокси API на :8080
bun run build      # SPA + dist/cms: один файл, запуск: dist/cms --port 8080 --db site.db
dist/cms new blog --db site.db              # сайт из каркаса: blog, portfolio, company, showcase, shop
dist/cms import-evo dump.sql --db site.db   # перенос сайта Evo
dist/cms backup copy.db --db site.db        # бэкап всего сайта одним файлом
dist/cms --domain example.com --db site.db  # HTTPS без прокси: Let's Encrypt сам
dist/cms update                             # новая версия со сверкой SHA256SUMS
dist/cms help [команда]                     # справка с примерами; info, users — сводка и пользователи
```

## Где что

- `docs/` — видение, суть Evo, единый язык, архитектура, ADR, дорожная карта. Начинай с `docs/README.md`.
- `src/contexts/{content,design,site,delivery,identity,media,extensions,assistant,manager,notify,forms,search,redirects,diagnostics,upkeep,certificates}` — ограниченные контексты. `src/app.ts` — корень
  композиции.
- `src/scaffolds/` — каркасы сайтов для `cms new` и приветствие новой базы; `tests/fixtures/demo.ts` — демо-сайт тестов.
- `manager/` — SPA менеджера (SvelteKit 3, TypeScript 6, свой `package.json`); перед правкой — скилл `sveltekit-3`.
- `scripts/build.ts` — сборка бинарника со встроенной SPA; `scripts/release.ts` — бинарники под платформы релиза.
- `install.sh` — установщик `curl … | bash`; `.github/workflows/` — CI и релиз по тегу `vX.Y.Z` (ADR 0023).
- `README.md` — для владельцев сайтов; разработка, проверки и релиз — `CONTRIBUTING.md`.

## Скиллы проекта

- `cms-conventions` — стиль кода и чеклист перед сдачей диффа. Загружай перед любой правкой кода.
- `cms-architecture` — правила слоёв и рецепты, куда класть код. Загружай перед любой правкой `src/`.
- `cms-views` — шаблоны и компоненты, рантайм-компиляция, `$core`, проверенные факты Bun и Svelte.
- `evo-reference` — как сверяться с исходниками Evo.

## Правила

- Правила зависимостей между слоями и контекстами проверяет `tests/architecture.test.ts`. Не обходи его —
  расширяй публичный API контекста.
- Термины в коде берутся из `docs/glossary.md`. Новый термин — сначала в глоссарий.
- Стиль кода — `docs/code-style.md`: `pipe`/`reduce`, без early return, таблица вместо `if`, `.then` вместо
  `async`/`await`, `export var`, фабрики `define*`, агрегаты как данные, `fail()`.
- Идентификаторы на английском. Комментарии (только необходимые) и документация — на русском.
- Код Evo не переводим построчно, а описываем поведение (`docs/adr/0004-clean-room-from-evo.md`).
- Перед тем как сказать «готово», запусти `bun run check`. Если менялись рантайм или сборка, ещё
  `bun run build` и запуск бинарника вне репозитория.
