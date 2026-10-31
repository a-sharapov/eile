import type { RedirectRule } from './redirect.ts';

/** Строка CSV с её номером в файле: по номеру человек находит ошибку. */
export type CsvRow = { readonly line: number; readonly cells: string[] };

const _quote = (value: string): string =>
  /[",;\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export var CSV_HEADER = ['from', 'to', 'code', 'note', 'hits', 'last_hit'];

/** Правила в CSV: запятая, кавычки по RFC 4180 — откроется в любой таблице. */
export var rulesToCsv = (rules: readonly RedirectRule[]): string =>
  [
    CSV_HEADER,
    ...rules.map((_) => [
      _.from,
      _.to,
      String(_.status),
      _.note,
      String(_.hits),
      _.lastHitAt ?? '',
    ]),
  ]
    .map((_) => _.map(_quote).join(','))
    .join('\r\n')
    .concat('\r\n');

type Scan = {
  readonly rows: CsvRow[];
  readonly cells: string[];
  readonly cell: string;
  readonly quoted: boolean;
  /** Следующий знак уже прочитан: вторая кавычка из пары `""`. */
  readonly skip: boolean;
  readonly line: number;
  readonly start: number;
};

// Разделитель — запятая или точка с запятой (так сохраняет русский Excel): чего больше в первой строке.
const _delimiter = (text: string): string =>
  ((first) =>
    (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
      ? ';'
      : ',')(text.split(/\r?\n/, 1)[0] ?? '');

const _flush = (scan: Scan): Scan =>
  ((cells) => ({
    ...scan,
    rows: cells.some((_) => _.trim() !== '')
      ? [...scan.rows, { line: scan.start, cells: cells.map((_) => _.trim()) }]
      : scan.rows,
    cells: [],
    cell: '',
    line: scan.line + 1,
    start: scan.line + 1,
  }))([...scan.cells, scan.cell]);

/** Разбор CSV: кавычки, удвоенные кавычки, переводы строк внутри кавычек; пустые строки пропускаются. */
export var parseCsv = (text: string): CsvRow[] => {
  const delimiter = _delimiter(text);
  const chars = [...text.replace(/^\uFEFF/, '')];
  const scan = (state: Scan, char: string, at: number): Scan =>
    state.skip
      ? { ...state, skip: false }
      : state.quoted
        ? char === '"'
          ? chars[at + 1] === '"'
            ? { ...state, cell: `${state.cell}"`, skip: true }
            : { ...state, quoted: false }
          : {
              ...state,
              cell: state.cell + char,
              line: char === '\n' ? state.line + 1 : state.line,
            }
        : char === '"'
          ? { ...state, quoted: true }
          : char === delimiter
            ? { ...state, cells: [...state.cells, state.cell], cell: '' }
            : char === '\n'
              ? _flush(state)
              : char === '\r'
                ? state
                : { ...state, cell: state.cell + char };
  return _flush(
    chars.reduce<Scan>(scan, {
      rows: [],
      cells: [],
      cell: '',
      quoted: false,
      skip: false,
      line: 1,
      start: 1,
    })
  ).rows;
};
