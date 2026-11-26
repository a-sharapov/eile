import { decimalOf } from './money.ts';

// Выгрузка таблиц аналитики в CSV (ADR 0072, «Выгрузка CSV»): файл собирается из того же ответа, что на экране.
// UTF-8 с BOM, строки — CRLF, разделитель и десятичный знак — как список по умолчанию в Excel языка менеджера,
// числа — числами, текст — с защитой от формул и кавычками по RFC 4180.

/** Ячейка: текст, целое, десятичное число записью с точкой (`{ number: '60.00' }`) или пусто. */
export type CsvCell =
  | string
  | number
  | { readonly number: string }
  | null
  | undefined;

export type CsvRow = readonly CsvCell[];

/** Разделитель и десятичный знак: `en` — запятая и точка; `de` и `ru` — точка с запятой и запятая. */
export var csvFormat = (
  language: string
): { readonly separator: string; readonly decimal: string } =>
  language === 'en'
    ? { separator: ',', decimal: '.' }
    : { separator: ';', decimal: ',' };

// Начало ячейки, которое таблица примет за формулу: =, +, -, @, табуляция, возврат каретки.
const _FORMULA = /^[=+\-@\t\r]/;

const _quoted = (text: string, separator: string): string =>
  text.includes(separator) ||
  text.includes('"') ||
  text.includes('\r') ||
  text.includes('\n')
    ? `"${text.replaceAll('"', '""')}"`
    : text;

// Ноль со знаком (−0.04 до десятых) — просто ноль.
const _unsigned = (text: string): string =>
  /^-0(?:\.0+)?$/.test(text) ? text.slice(1) : text;

const _cell = (
  cell: CsvCell,
  format: { readonly separator: string; readonly decimal: string }
): string =>
  cell === null || cell === undefined
    ? ''
    : typeof cell === 'string'
      ? _quoted(_FORMULA.test(cell) ? `'${cell}` : cell, format.separator)
      : _quoted(
          _unsigned(
            typeof cell === 'number' ? String(cell) : cell.number
          ).replace('.', format.decimal),
          format.separator
        );

/** Деньги ячейкой: минимальные единицы → основные, без знака валюты (валюта — в заголовке). */
export var csvMoney = (
  minor: number | null | undefined,
  currency: string
): CsvCell =>
  minor === null || minor === undefined
    ? null
    : { number: decimalOf(minor, currency) };

/** Число с `digits` знаками после точки; null — пусто. */
export var csvDecimal = (
  value: number | null | undefined,
  digits: number
): CsvCell =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : { number: value.toFixed(digits) };

/** Доля процентом до десятых: 0.4 → 40,0. */
export var csvPercent = (rate: number | null | undefined): CsvCell =>
  rate === null || rate === undefined ? null : csvDecimal(rate * 100, 1);

// Метка порядка байтов — escape-последовательностью: невидимый знак в строке молча стирают форматтер и редактор.
const _BOM = '\uFEFF';

/** Текст файла: BOM, строки через CRLF. */
export var csvText = (rows: readonly CsvRow[], language: string): string =>
  ((format) =>
    `${_BOM}${rows
      .map((row) => row.map((_) => _cell(_, format)).join(format.separator))
      .join('\r\n')}\r\n`)(csvFormat(language));

/** Имя файла: `eile-<таблица>-<с>-<по>.csv`. */
export var csvName = (table: string, from: string, to: string): string =>
  `eile-${table}-${from}-${to}.csv`;

/** Момент в поясе отчётов: `ГГГГ-ММ-ДД ЧЧ:ММ`; пустой пояс — пояс браузера. */
export var csvMoment = (
  moment: string | null | undefined,
  zone: string
): string | null =>
  moment
    ? ((parts) =>
        `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`)(
        Object.fromEntries(
          new Intl.DateTimeFormat('en-CA', {
            timeZone: zone || undefined,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          })
            .formatToParts(Date.parse(moment))
            .map((_) => [_.type, _.value])
        )
      )
    : null;
