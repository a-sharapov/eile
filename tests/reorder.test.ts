import { describe, expect, it } from 'bun:test';
import {
  gapBack,
  isNoop,
  landing,
  moveSpan,
  nearestGap,
  nextGap,
} from '../manager/src/lib/reorder.ts';

// Перестановка строк менеджера: промежуток 0 — перед первой строкой, length — после последней.

const _LIST = ['a', 'b', 'c', 'd', 'e'] as const;

describe('moveSpan', () => {
  it('строка вниз и вверх встаёт в выбранный промежуток', () => {
    expect(moveSpan(_LIST, 1, 1, 4)).toEqual(['a', 'c', 'd', 'b', 'e']);
    expect(moveSpan(_LIST, 3, 1, 0)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(moveSpan(_LIST, 0, 1, 5)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('отрезок едет целиком и в том же порядке', () => {
    expect(moveSpan(_LIST, 1, 2, 5)).toEqual(['a', 'd', 'e', 'b', 'c']);
    expect(moveSpan(_LIST, 3, 2, 1)).toEqual(['a', 'd', 'e', 'b', 'c']);
  });

  it('промежутки на краях своего отрезка ничего не меняют, исходный список цел', () => {
    const list = [..._LIST];
    expect(moveSpan(list, 1, 2, 1)).toEqual(list);
    expect(moveSpan(list, 1, 2, 2)).toEqual(list);
    expect(moveSpan(list, 1, 2, 3)).toEqual(list);
    expect(isNoop(1, 2, 3)).toBe(true);
    expect(isNoop(1, 2, 4)).toBe(false);
    moveSpan(list, 0, 2, 5);
    expect(list).toEqual([..._LIST]);
  });

  it('landing указывает, где встал отрезок, а gapBack возвращает его на место', () => {
    for (let count = 1; count <= 3; count++)
      for (let from = 0; from + count <= _LIST.length; from++)
        for (let to = 0; to <= _LIST.length; to++) {
          const moved = moveSpan(_LIST, from, count, to);
          const at = landing(from, count, to);
          expect(moved.slice(at, at + count)).toEqual(
            _LIST.slice(from, from + count)
          );
          expect(moveSpan(moved, at, count, gapBack(at, count, from))).toEqual([
            ..._LIST,
          ]);
        }
  });
});

describe('nearestGap', () => {
  // Три строки по 40 px с промежутком 10 px: границы — 0, 45, 95, 140.
  const edges = [
    { top: 0, bottom: 40 },
    { top: 50, bottom: 90 },
    { top: 100, bottom: 140 },
  ];

  it('граница — середина между строками; выше первой — 0, ниже последней — length', () => {
    const all = [0, 1, 2, 3];
    expect(nearestGap(edges, all, -30)).toBe(0);
    expect(nearestGap(edges, all, 20)).toBe(0);
    expect(nearestGap(edges, all, 30)).toBe(1);
    expect(nearestGap(edges, all, 75)).toBe(2);
    expect(nearestGap(edges, all, 400)).toBe(3);
  });

  it('выбирает только из разрешённых промежутков', () => {
    expect(nearestGap(edges, [0, 3], 60)).toBe(0);
    expect(nearestGap(edges, [0, 3], 80)).toBe(3);
    expect(nearestGap(edges, [], 80)).toBeNull();
  });
});

describe('nextGap', () => {
  const all = [0, 1, 2, 3, 4, 5];

  it('стрелки переставляют строку на одно место, как кнопки «Выше» и «Ниже»', () => {
    expect(nextGap(all, 2, 1, 'up')).toBe(1);
    expect(nextGap(all, 2, 1, 'down')).toBe(4);
    expect(moveSpan(_LIST, 2, 1, 1)).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(moveSpan(_LIST, 2, 1, 4)).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('Home и End — в самое начало и в самый конец; дальше некуда — null', () => {
    expect(nextGap(all, 2, 1, 'first')).toBe(0);
    expect(nextGap(all, 2, 1, 'last')).toBe(5);
    expect(nextGap(all, 0, 1, 'up')).toBeNull();
    expect(nextGap(all, 4, 1, 'down')).toBeNull();
  });

  it('отрезок перешагивает через соседние разрешённые места', () => {
    // Шаги стоят на 0, 2 и 4: отрезок 2–3 едет вниз за следующий шаг, вверх — перед предыдущим.
    expect(nextGap([4, 0, 2, 5], 2, 2, 'down')).toBe(5);
    expect(nextGap([0, 2, 4, 5], 2, 2, 'up')).toBe(0);
  });
});
