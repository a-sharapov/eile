import {
  clampPage,
  PAGE_SIZES,
  pageCount,
  pageOfIndex,
  pageSlice,
} from './pager.ts';

// Состояние пейджера экрана. Номер страницы живёт, пока открыт менеджер: из редактора человек
// возвращается туда же. Сколько строк показывать, помнит браузер — по ключу экрана.
let _pages = $state<Record<string, number>>({});

const _SIZE_KEY = 'cms.pageSize.';

// «0» — все строки: пустое значение хранилища за него не сойдёт.
const _storedSize = (
  key: string,
  fallback: number,
  sizes: readonly number[]
): number => {
  try {
    return ((raw) =>
      raw !== null && sizes.includes(Number(raw)) ? Number(raw) : fallback)(
      localStorage.getItem(_SIZE_KEY + key)
    );
  } catch {
    return fallback;
  }
};

const _storeSize = (key: string, size: number): void => {
  try {
    localStorage.setItem(_SIZE_KEY + key, String(size));
  } catch {}
};

export type Pager = {
  page: number;
  size: number;
  /** Из чего выбирать размер: списку с сервера «все» не годится. */
  readonly sizes: readonly number[];
};

/** Пейджер экрана `key`: номер страницы и сколько строк на ней; смена размера держит первую строку в кадре. */
export var definePager = (
  key: string,
  fallback = 50,
  sizes: readonly number[] = PAGE_SIZES
): Pager => {
  let size = $state(_storedSize(key, fallback, sizes));
  return {
    sizes,
    get page() {
      return _pages[key] ?? 1;
    },
    set page(next: number) {
      _pages = { ..._pages, [key]: next };
    },
    get size() {
      return size;
    },
    set size(next: number) {
      const first = size > 0 ? ((_pages[key] ?? 1) - 1) * size : 0;
      size = next;
      _storeSize(key, next);
      _pages = { ..._pages, [key]: pageOfIndex(first, next) };
    },
  };
};

/** Номер страницы в пределах списка: он сократился (фильтр, свёрнутая ветка) — последняя страница. */
export var currentPage = (pager: Pager, total: number): number =>
  clampPage(pager.page, pageCount(total, pager.size));

/** Строки текущей страницы. */
export var pageOf = <T>(items: readonly T[], pager: Pager): readonly T[] =>
  pageSlice(items, currentPage(pager, items.length), pager.size);
