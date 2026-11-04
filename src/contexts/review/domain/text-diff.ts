// Сравнение «сейчас → предложено» для проверки правок: по строкам, а в изменённой строке — по словам.
// Разметка остаётся видна: проверяющему важно, не принёс ли агент лишний тег или компонент.

/** Кусок строки: общий с другой стороной или изменённый. */
export type Piece = { readonly text: string; readonly changed: boolean };

/** Строка сравнения: общая, только сейчас (`old`), только в предложении (`new`) или свёрнутые общие. */
export type DiffLine =
  | { readonly kind: 'same' | 'old' | 'new'; readonly pieces: readonly Piece[] }
  | { readonly kind: 'skip'; readonly count: number };

type Kind = 'same' | 'old' | 'new';
type Op = { readonly kind: Kind; readonly value: string };

// Ячеек таблицы общей подпоследовательности — не больше: 4 млн Int32 — 16 МБ на одно сравнение. Больше —
// «было целиком → стало целиком».
const _MAX_CELLS = 4_000_000;

const _commonPrefix = (a: readonly string[], b: readonly string[]): number =>
  ((limit) => {
    const at = (i: number): number =>
      i < limit && a[i] === b[i] ? at(i + 1) : i;
    return at(0);
  })(Math.min(a.length, b.length));

const _commonSuffix = (
  a: readonly string[],
  b: readonly string[],
  prefix: number
): number =>
  ((limit) => {
    const at = (i: number): number =>
      i < limit && a[a.length - 1 - i] === b[b.length - 1 - i] ? at(i + 1) : i;
    return at(0);
  })(Math.min(a.length, b.length) - prefix);

// Длины общей подпоследовательности суффиксов: table[i][j] — для a[i…] и b[j…]. Строки таблицы
// заполняются на месте: копия на каждом шаге стоила бы квадрат от длины текста.
const _table = (a: readonly string[], b: readonly string[]): Int32Array[] =>
  a.reduceRight<Int32Array[]>(
    (rows, x) => [
      b.reduceRight(
        (row, y, j) => (
          (row[j] =
            x === y
              ? rows[0]![j + 1]! + 1
              : Math.max(rows[0]![j]!, row[j + 1]!)),
          row
        ),
        new Int32Array(b.length + 1)
      ),
      ...rows,
    ],
    [new Int32Array(b.length + 1)]
  );

// Проход по таблице хвостовой рекурсией (JavaScriptCore её не растит в стек); шаги копятся в одном
// массиве — копия на каждом шаге снова дала бы квадрат.
const _walk = (
  a: readonly string[],
  b: readonly string[],
  table: readonly Int32Array[],
  i: number,
  j: number,
  out: Op[]
): Op[] =>
  i < a.length && j < b.length && a[i] === b[j]
    ? (out.push({ kind: 'same', value: a[i]! }),
      _walk(a, b, table, i + 1, j + 1, out))
    : i < a.length && (j === b.length || table[i + 1]![j]! >= table[i]![j + 1]!)
      ? (out.push({ kind: 'old', value: a[i]! }),
        _walk(a, b, table, i + 1, j, out))
      : j < b.length
        ? (out.push({ kind: 'new', value: b[j]! }),
          _walk(a, b, table, i, j + 1, out))
        : out;

const _middle = (a: readonly string[], b: readonly string[]): Op[] =>
  (a.length + 1) * (b.length + 1) > _MAX_CELLS
    ? [
        ...a.map((value): Op => ({ kind: 'old', value })),
        ...b.map((value): Op => ({ kind: 'new', value })),
      ]
    : _walk(a, b, _table(a, b), 0, 0, []);

// Общие начало и конец — без таблицы: правка обычно задевает несколько строк длинного исходника.
const _ops = (a: readonly string[], b: readonly string[]): Op[] =>
  ((prefix) =>
    ((suffix) => [
      ...a.slice(0, prefix).map((value): Op => ({ kind: 'same', value })),
      ..._middle(
        a.slice(prefix, a.length - suffix),
        b.slice(prefix, b.length - suffix)
      ),
      ...a
        .slice(a.length - suffix)
        .map((value): Op => ({ kind: 'same', value })),
    ])(_commonSuffix(a, b, prefix)))(_commonPrefix(a, b));

const _words = (line: string): string[] =>
  line.split(/(\s+|[<>"=])/).filter(Boolean);

// Соседние куски с одной отметкой — один кусок: подсветка идёт фразой, а не словом с пробелом.
const _joined = (pieces: readonly Piece[]): Piece[] =>
  pieces.reduce<Piece[]>(
    (out, piece) =>
      ((last) =>
        last && last.changed === piece.changed
          ? [...out.slice(0, -1), { ...last, text: last.text + piece.text }]
          : [...out, piece])(out.at(-1)),
    []
  );

// Пробел между двумя изменёнными словами — часть изменённой фразы, а не общий кусок.
const _bridged = (pieces: readonly Piece[]): Piece[] =>
  pieces.map((piece, index) =>
    !piece.changed &&
    piece.text.trim() === '' &&
    pieces[index - 1]?.changed === true &&
    pieces[index + 1]?.changed === true
      ? { ...piece, changed: true }
      : piece
  );

const _side = (ops: readonly Op[], kind: 'old' | 'new'): Piece[] =>
  _joined(
    _bridged(
      ops
        .filter((_) => _.kind === 'same' || _.kind === kind)
        .map((_) => ({ text: _.value, changed: _.kind === kind }))
    )
  );

const _pair = (before: string, after: string): [DiffLine, DiffLine] =>
  ((ops) => [
    { kind: 'old', pieces: _side(ops, 'old') },
    { kind: 'new', pieces: _side(ops, 'new') },
  ])(_ops(_words(before), _words(after)));

const _whole = (kind: Kind, text: string): DiffLine => ({
  kind,
  pieces: [{ text, changed: kind !== 'same' }],
});

type Run = { readonly kind: Kind; readonly values: readonly string[] };

const _runs = (ops: readonly Op[]): Run[] =>
  ops.reduce<Run[]>(
    (runs, op) =>
      ((last) =>
        last && last.kind === op.kind
          ? [
              ...runs.slice(0, -1),
              { kind: op.kind, values: [...last.values, op.value] },
            ]
          : [...runs, { kind: op.kind, values: [op.value] }])(runs.at(-1)),
    []
  );

const _block = (
  old: readonly string[],
  next: readonly string[]
): DiffLine[] => [
  ...old.flatMap((_, index) =>
    index < next.length ? [_pair(_, next[index]!)[0]] : [_whole('old', _)]
  ),
  ...next.flatMap((_, index) =>
    index < old.length ? [_pair(old[index]!, _)[1]] : [_whole('new', _)]
  ),
];

/** Строки «сейчас» и «предложено» → строки сравнения, изменённые слова отмечены. */
export var diffLines = (
  before: readonly string[],
  after: readonly string[]
): DiffLine[] =>
  _runs(_ops(before, after)).reduce<{ lines: DiffLine[]; old: string[] }>(
    (acc, run, index, all) =>
      run.kind === 'same'
        ? {
            lines: [...acc.lines, ...run.values.map((_) => _whole('same', _))],
            old: [],
          }
        : run.kind === 'old'
          ? all[index + 1]?.kind === 'new'
            ? { ...acc, old: [...run.values] }
            : { lines: [...acc.lines, ..._block(run.values, [])], old: [] }
          : { lines: [...acc.lines, ..._block(acc.old, run.values)], old: [] },
    { lines: [], old: [] }
  ).lines;

/** Длинные общие куски сворачиваются: вокруг правок остаётся по `context` строк. */
export var compact = (lines: readonly DiffLine[], context = 2): DiffLine[] =>
  ((near) =>
    lines.reduce<DiffLine[]>(
      (out, line, index) =>
        near(index)
          ? [...out, line]
          : ((last) =>
              last?.kind === 'skip'
                ? [...out.slice(0, -1), { kind: 'skip', count: last.count + 1 }]
                : [...out, { kind: 'skip', count: 1 }])(out.at(-1)),
      []
    ))((index: number) =>
    lines
      .slice(Math.max(0, index - context), index + context + 1)
      .some((_) => _.kind !== 'same')
  );

// Блочные теги, <br> и теги компонентов начинают строку; сама разметка остаётся в строке.
const _BREAK =
  /(?=<(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tr|section|article|header|footer|aside|figure|figcaption|hr|br)\b)|(?=\[\[)|(?=\[#)/gi;

/** HTML текста страницы строками: по блокам и тегам компонентов, с разметкой. */
export var htmlLines = (html: string): string[] =>
  html
    .split('\n')
    .flatMap((_) => _.split(_BREAK))
    .map((_) => _.trim())
    .filter(Boolean);

/** Исходник строками как есть. */
export var codeLines = (source: string): string[] =>
  source === '' ? [] : source.replace(/\r\n/g, '\n').split('\n');

/** Сравнение двух текстов: `html` — текст страницы, иначе код; общие места свёрнуты. */
export var textDiff = (
  before: string,
  after: string,
  html = false
): DiffLine[] =>
  ((lines) => compact(diffLines(lines(before), lines(after))))(
    html ? htmlLines : codeLines
  );
