import { describe, expect, it } from 'bun:test';
import {
  clampPage,
  pageCount,
  pageOfIndex,
  pageRange,
  pagerItems,
  pageSlice,
} from '../manager/src/lib/pager.ts';

describe('пейджер длинных списков менеджера', () => {
  it('страниц — по размеру; пустой список и «все» — одна страница', () => {
    expect(pageCount(3129, 50)).toBe(63);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(3129, 0)).toBe(1);
  });

  it('номер — в пределах списка: сократился — последняя страница, мусор — первая', () => {
    expect(clampPage(70, 63)).toBe(63);
    expect(clampPage(0, 63)).toBe(1);
    expect(clampPage(Number.NaN, 63)).toBe(1);
    expect(clampPage(2.7, 63)).toBe(2);
  });

  it('строки страницы и подпись «51–100 из …»; «все» — весь список', () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(pageSlice(rows, 3, 50)).toEqual(rows.slice(100));
    expect(pageSlice(rows, 1, 0)).toBe(rows);
    expect(pageRange(2, 50, 120)).toEqual({ from: 51, to: 100 });
    expect(pageRange(3, 50, 120)).toEqual({ from: 101, to: 120 });
    expect(pageRange(1, 0, 120)).toEqual({ from: 1, to: 120 });
    expect(pageRange(1, 50, 0)).toEqual({ from: 0, to: 0 });
  });

  it('смена размера держит строку: 151-я при 100 на странице — вторая страница', () => {
    expect(pageOfIndex(150, 100)).toBe(2);
    expect(pageOfIndex(0, 25)).toBe(1);
    expect(pageOfIndex(500, 0)).toBe(1);
  });

  it('номера: первая, последняя и соседи текущей; пропуск одной страницы — её номером', () => {
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pagerItems(30, 63)).toEqual([1, 'gap', 29, 30, 31, 'gap', 63]);
    expect(pagerItems(3, 63)).toEqual([1, 2, 3, 4, 'gap', 63]);
    expect(pagerItems(63, 63)).toEqual([1, 'gap', 62, 63]);
  });
});
