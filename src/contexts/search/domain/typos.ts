// Опечатки: слово запроса, которого нет в индексе, заменяется ближайшим по правке словом из индекса.

/** Слово индекса и на скольких страницах оно встречается. */
export type VocabularyTerm = { readonly term: string; readonly docs: number };

/** Больше слов одного запроса не исправляем: каждое — проход по словарю. */
export var MAX_CORRECTIONS = 3;

type _Rows = [Uint16Array, Uint16Array, Uint16Array];

// Строка таблицы правок для буквы a[i]: строки — позапрошлая (для перестановки), прошлая и текущая.
// Ответ — наименьшая клетка строки: если она больше допуска, дальше таблица не уменьшится.
const _row = (
  a: readonly string[],
  b: readonly string[],
  i: number,
  rows: _Rows
): number => {
  const { 0: older, 1: previous, 2: current } = rows;
  current[0] = i + 1;
  return b.reduce((least, char, j) => {
    const value = Math.min(
      previous[j + 1]! + 1,
      current[j]! + 1,
      previous[j]! + (a[i] === char ? 0 : 1),
      i > 0 && j > 0 && a[i] === b[j - 1] && a[i - 1] === char
        ? older[j - 1]! + 1
        : Number.MAX_SAFE_INTEGER
    );
    current[j + 1] = value;
    return Math.min(least, value);
  }, current[0]);
};

/**
 * Число правок — вставка, удаление, замена, перестановка соседних букв — не больше `max`; дальше
 * считать незачем, и ответ — `max + 1`. Таблица — три строки чисел по кругу, без копий.
 */
export var editDistance = (
  first: string,
  second: string,
  max: number
): number =>
  ((a, b) =>
    Math.abs(a.length - b.length) > max
      ? max + 1
      : ((rows) =>
          a.some(
            (_, i) =>
              (
                // По кругу: прошлая строка становится позапрошлой, текущая — прошлой, позапрошлая — новой.
                rows.push(rows.shift()!), _row(a, b, i, rows) > max
              )
          )
            ? max + 1
            : Math.min(rows[2][b.length]!, max + 1))(
          ((rows: _Rows) => (
            rows[2].forEach((_, j) => void (rows[2][j] = j)), rows
          ))([
            new Uint16Array(b.length + 1),
            new Uint16Array(b.length + 1),
            new Uint16Array(b.length + 1),
          ])
        ))([...first], [...second]);

/** Сколько правок допустимо: короткому слову — одна, иначе любое слово стало бы похожим. */
export var allowedEdits = (stem: string): number => (stem.length <= 4 ? 1 : 2);

// Дешёвый отбор до таблицы правок: длина в пределах допуска и совпадает начало — первая или вторая
// буква, или они переставлены. Опечатка сразу в двух первых буквах редка, а словарь сужается в разы.
const _candidate = (stem: string, term: string, max: number): boolean =>
  term !== stem &&
  Math.abs(term.length - stem.length) <= max &&
  (term[0] === stem[0] ||
    term[1] === stem[1] ||
    (term[0] === stem[1] && term[1] === stem[0]));

/** Ближайшее слово индекса: меньше правок, затем чаще встречается; цифры и короткое не правим. */
export var nearestTerm = (
  stem: string,
  vocabulary: readonly VocabularyTerm[]
): string | null =>
  stem.length < 3 || /^\p{N}+$/u.test(stem)
    ? null
    : ((max) =>
        vocabulary
          .filter((_) => _candidate(stem, _.term, max))
          .map((_) => ({ ..._, distance: editDistance(stem, _.term, max) }))
          .filter((_) => _.distance <= max)
          .toSorted(
            (a, b) =>
              a.distance - b.distance ||
              b.docs - a.docs ||
              a.term.localeCompare(b.term)
          )[0]?.term ?? null)(allowedEdits(stem));
