// Сравнение версии страницы с нынешней: по строкам (абзацам), а в изменённой строке — по словам.

/** Кусок строки: общий с другой стороной или изменённый. */
export type Piece = { readonly text: string; readonly changed: boolean };

/** Строка сравнения: общая, только в версии (`old`), только сейчас (`new`) или свёрнутые общие. */
export type DiffLine =
  | { readonly kind: 'same' | 'old' | 'new'; readonly pieces: readonly Piece[] }
  | { readonly kind: 'skip'; readonly count: number };

type Kind = 'same' | 'old' | 'new';
type Op = { readonly kind: Kind; readonly value: string };

// Больше — сравнение было бы долгим: показываем «было целиком → стало целиком».
const _LIMIT = 1500;

// Длины общей подпоследовательности суффиксов: table[i][j] — для a[i…] и b[j…].
const _table = (a: readonly string[], b: readonly string[]): Int32Array[] =>
  a.reduceRight<Int32Array[]>(
    (rows, x) => [
      // Строка таблицы заполняется на месте: копия на каждом шаге стоила бы квадрат от длины текста.
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

// Проход по таблице: общее — дальше, иначе сначала то, что было в версии, потом то, что сейчас.
const _walk = (
  a: readonly string[],
  b: readonly string[],
  table: readonly Int32Array[],
  i: number,
  j: number
): Op[] =>
  i < a.length && j < b.length && a[i] === b[j]
    ? [{ kind: 'same', value: a[i]! }, ..._walk(a, b, table, i + 1, j + 1)]
    : i < a.length && (j === b.length || table[i + 1]![j]! >= table[i]![j + 1]!)
      ? [{ kind: 'old', value: a[i]! }, ..._walk(a, b, table, i + 1, j)]
      : j < b.length
        ? [{ kind: 'new', value: b[j]! }, ..._walk(a, b, table, i, j + 1)]
        : [];

const _ops = (a: readonly string[], b: readonly string[]): Op[] =>
  a.length > _LIMIT || b.length > _LIMIT
    ? [
        ...a.map((value): Op => ({ kind: 'old', value })),
        ...b.map((value): Op => ({ kind: 'new', value })),
      ]
    : _walk(a, b, _table(a, b), 0, 0);

const _words = (line: string): string[] => line.split(/(\s+)/).filter(Boolean);

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

const _side = (ops: readonly Op[], kind: 'old' | 'new'): Piece[] =>
  _joined(
    ops
      .filter((_) => _.kind === 'same' || _.kind === kind)
      .map((_) => ({ text: _.value, changed: _.kind === kind }))
  );

// Пара «было → стало»: в каждой строке отмечены слова, которых нет на другой стороне.
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

// Подряд идущие «было» и «стало» — один блок правки: их строки сравниваются попарно по словам.
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

/** Строки «было» и «стало» → строки сравнения со словами, отмеченными в изменённых строках. */
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
export var compact = (lines: readonly DiffLine[], context = 1): DiffLine[] =>
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

const _ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  hellip: '…',
};

const _decode = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) =>
    code.startsWith('#')
      ? String.fromCodePoint(
          code[1] === 'x' || code[1] === 'X'
            ? Number.parseInt(code.slice(2), 16)
            : Number(code.slice(1))
        )
      : (_ENTITIES[code.toLowerCase()] ?? entity)
  );

// Блочные теги и <br> — граница абзаца; пункт списка начинается с точки, как его видит читатель.
const _BLOCK =
  /<\/?(?:p|div|h[1-6]|ul|ol|blockquote|pre|table|tr|section|article|header|footer|aside|figure|figcaption|hr)\b[^>]*>|<br\s*\/?>/gi;

/** Текст страницы как его читают: абзацы строками, без разметки; теги компонентов остаются. */
export var textLines = (html: string): string[] =>
  html
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(_BLOCK, '\n')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((_) => _decode(_).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
