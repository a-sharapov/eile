// Перестановка в списке: промежуток `to` — место между элементами, 0 — перед первым, length — после
// последнего. Переезжает отрезок из `count` элементов, начиная с `from`: так шаг формы едет со своими полями.

/** Промежутки на краях своего отрезка ничего не меняют. */
export var isNoop = (from: number, count: number, to: number): boolean =>
  to >= from && to <= from + count;

/** Список, где отрезок `from…from+count` стоит в промежутке `to`. */
export var moveSpan = <T>(
  list: readonly T[],
  from: number,
  count: number,
  to: number
): T[] =>
  isNoop(from, count, to)
    ? [...list]
    : ((rest, at) => [
        ...rest.slice(0, at),
        ...list.slice(from, from + count),
        ...rest.slice(at),
      ])(
        [...list.slice(0, from), ...list.slice(from + count)],
        to > from ? to - count : to
      );

/** Где после перестановки окажется первый элемент отрезка. */
export var landing = (from: number, count: number, to: number): number =>
  isNoop(from, count, to) ? from : to > from ? to - count : to;

/** Промежуток, куда отрезок вернётся на прежнее место `origin`, если сейчас он на `from`. */
export var gapBack = (from: number, count: number, origin: number): number =>
  origin > from ? origin + count : origin;

/** Края строк по вертикали, в пикселях окна. */
export type Edge = { readonly top: number; readonly bottom: number };

const _gapY = (edges: readonly Edge[], gap: number): number =>
  gap === 0
    ? (edges[0]?.top ?? 0)
    : gap >= edges.length
      ? (edges.at(-1)?.bottom ?? 0)
      : ((edges[gap - 1]?.bottom ?? 0) + (edges[gap]?.top ?? 0)) / 2;

/** Ближайший к точке `y` из разрешённых промежутков: граница — середина между строками. */
export var nearestGap = (
  edges: readonly Edge[],
  gaps: readonly number[],
  y: number
): number | null =>
  gaps.reduce<{ gap: number | null; distance: number }>(
    (best, gap) =>
      ((distance) => (distance < best.distance ? { gap, distance } : best))(
        Math.abs(_gapY(edges, gap) - y)
      ),
    { gap: null, distance: Number.POSITIVE_INFINITY }
  ).gap;

export type Step = 'up' | 'down' | 'first' | 'last';

const _NEXT: Readonly<
  Record<
    Step,
    (gaps: readonly number[], from: number, count: number) => number | null
  >
> = {
  up: (gaps, from) => gaps.filter((_) => _ < from).at(-1) ?? null,
  down: (gaps, from, count) => gaps.find((_) => _ > from + count) ?? null,
  first: (gaps, from) => gaps.find((_) => _ < from) ?? null,
  last: (gaps, from, count) =>
    gaps.filter((_) => _ > from + count).at(-1) ?? null,
};

/** Промежуток для клавиши: соседний выше или ниже, самый первый или последний; null — дальше некуда. */
export var nextGap = (
  gaps: readonly number[],
  from: number,
  count: number,
  step: Step
): number | null =>
  _NEXT[step](
    gaps.toSorted((a, b) => a - b),
    from,
    count
  );
