// Постраничный вывод длинных списков менеджера (таблица страниц, медиатека): тысячи строк с полями разом
// браузер рисует секундами. Только расчёты — без состояния, его держит pager.svelte.ts.

/** Сколько строк показывать: выбор человека; 0 — все сразу. */
export var PAGE_SIZES: readonly number[] = [25, 50, 100, 200, 0];

/** Номер страницы или пропуск «…» между ними. */
export type PagerItem = number | 'gap';

/** Сколько страниц; пустой список — одна, пустая. */
export var pageCount = (total: number, size: number): number =>
  size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;

/** Номер в пределах `1…count`: список сократился (фильтр, свёрнутая ветка) — последняя страница. */
export var clampPage = (page: number, count: number): number =>
  Math.min(Math.max(1, Math.trunc(page) || 1), Math.max(1, count));

/** Строки страницы `page`; `size` 0 — все. */
export var pageSlice = <T>(
  items: readonly T[],
  page: number,
  size: number
): readonly T[] =>
  size > 0 ? items.slice((page - 1) * size, page * size) : items;

/** На какой странице строка с номером `index` (с нуля). */
export var pageOfIndex = (index: number, size: number): number =>
  size > 0 && index > 0 ? Math.floor(index / size) + 1 : 1;

/** Первая и последняя строка страницы для подписи «51–100 из 3129»; пустой список — 0–0. */
export var pageRange = (
  page: number,
  size: number,
  total: number
): { readonly from: number; readonly to: number } =>
  total === 0
    ? { from: 0, to: 0 }
    : size > 0
      ? { from: (page - 1) * size + 1, to: Math.min(page * size, total) }
      : { from: 1, to: total };

/**
 * Номера для пейджера: первая, последняя и соседи текущей, между ними — «…». Пропуск ровно одной
 * страницы показывается её номером: «1 2 3», а не «1 … 3». Страниц немного (до семи при `around` 1) — все.
 */
export var pagerItems = (
  current: number,
  count: number,
  around = 1
): PagerItem[] =>
  ((shown) =>
    shown.flatMap((n, i): PagerItem[] =>
      ((last) =>
        last === undefined || n - last === 1
          ? [n]
          : n - last === 2
            ? [n - 1, n]
            : ['gap', n])(shown[i - 1])
    ))(
    Array.from({ length: count }, (_, i) => i + 1).filter(
      (n) =>
        count <= 5 + 2 * around ||
        n === 1 ||
        n === count ||
        Math.abs(n - current) <= around
    )
  );
