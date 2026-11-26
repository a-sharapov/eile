import { pipe } from '../../../shared/kernel/pipe.ts';
import { CODE_LIMITS, isCode } from './codes.ts';
import {
  type DayPeriod,
  isMonth,
  type Month,
  monthDays,
  monthsIn,
  periodDays,
} from './days.ts';
import {
  type BaseSum,
  baseSum,
  divideRound,
  type InputErrors,
  isCurrency,
  MINOR_UNITS,
  moneyOf,
  type Priced,
  refuseInput,
} from './money.ts';
import {
  type Attribution,
  type ReportFilter,
  type ReportGroup,
  type ReportLookups,
  UNKNOWN,
} from './report.ts';
import type { Parts, Setup, SetupAuthor, SetupLogDraft } from './setup.ts';

/**
 * Строка расхода: деньги, потраченные за календарный месяц (пояс отчётов) на источник, заданный значениями частей
 * метки. Ноль — «расхода не было», это не то же, что «расход не введён». Ключ — месяц, части и валюта.
 */
export type SpendRow = {
  readonly id: number;
  readonly month: Month;
  /** { часть: значение }, ключи по алфавиту; {} — общий расход. */
  readonly parts: Parts;
  readonly currency: string;
  /** Минимальные единицы валюты строки, от нуля. */
  readonly amount: number;
  readonly note: string;
  /** Кто внёс или правил последним; null — команда или тест. */
  readonly author: { readonly name: string; readonly agent: boolean } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** Строка расхода, как её присылают. */
export type SpendInput = {
  /** Есть — правка этой строки (можно сменить месяц, части и валюту); нет — запись по ключу. */
  readonly id?: number;
  readonly month: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly currency: string;
  /** Деньги: строка десятичного числа или число JSON, от нуля, знаков — по валюте. */
  readonly amount: string | number;
  readonly note?: string;
};

/** Проверенная строка расхода: ещё без номера, автора и времени. */
export type SpendDraft = Pick<
  SpendRow,
  'month' | 'parts' | 'currency' | 'amount' | 'note'
> & {
  readonly id: number | null;
  readonly key: string;
};

export var SPEND_LIMITS = {
  rows: 20_000,
  month: 500,
  parts: 8,
  note: 500,
  batch: 100,
  firstMonth: '2000-01',
} as const;

const _FIELDS = ['id', 'month', 'parts', 'currency', 'amount', 'note'];

const _isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _byKey = <T>(a: readonly [string, T], b: readonly [string, T]): number =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;

/** Части с ключами по алфавиту: так их хранит база и так они входят в ключ. */
export var sortedParts = (parts: Parts): Parts =>
  Object.fromEntries(Object.entries(parts).toSorted(_byKey));

/** Ключ строки расхода: месяц, части по алфавиту и валюта; порядок частей во входе не важен. */
export var spendKey = (
  row: Pick<SpendRow, 'month' | 'parts' | 'currency'>
): string =>
  `${row.month}|${JSON.stringify(sortedParts(row.parts))}|${row.currency}`;

const _length = (text: string): number => [...text].length;

const _monthError = (raw: unknown, current: Month): string | null =>
  isMonth(raw) && raw >= SPEND_LIMITS.firstMonth && raw <= current
    ? null
    : `is a month YYYY-MM from ${SPEND_LIMITS.firstMonth} to this month, ${current}: a budget is not spend`;

// Форма частей: объект кодов частей со строками-значениями, не больше восьми.
const _partsShape = (raw: unknown): string | null =>
  !_isRecord(raw) ||
  Object.keys(raw).length > SPEND_LIMITS.parts ||
  !Object.entries(raw).every(
    ({ 0: part, 1: value }) =>
      isCode(part, CODE_LIMITS.dictionary) && isCode(value, CODE_LIMITS.value)
  )
    ? `is { part: value } with up to ${SPEND_LIMITS.parts} parts of the label; {} — spend of the whole site`
    : null;

// Часть и значение — из справочника части; в архиве — только если прежняя строка уже стояла на них.
const _partError = (
  setup: Setup,
  part: string,
  value: string,
  previous: SpendRow | null
): string | null =>
  ((dictionary, found, kept) =>
    dictionary === undefined || dictionary.purpose !== 'parts'
      ? `${part} is not a part of the label`
      : found === undefined
        ? `the part ${part} has no value ${value}`
        : dictionary.archivedAt !== null &&
            !Object.hasOwn(previous?.parts ?? {}, part)
          ? `the part ${part} is archived`
          : found.archivedAt !== null && !kept
            ? `the value ${part}/${value} is archived`
            : null)(
    setup.dictionaries.find((_) => _.code === part),
    setup.values.find((_) => _.dictionary === part && _.code === value),
    Object.hasOwn(previous?.parts ?? {}, part) &&
      previous?.parts[part] === value
  );

const _amountError = (raw: unknown, currency: unknown): string | null =>
  !isCurrency(currency)
    ? null
    : moneyOf(raw, currency) === null
      ? `is money from 0 with up to ${MINOR_UNITS[currency]} digits after the point in ${currency}`
      : null;

const _noteError = (raw: unknown): string | null =>
  raw === undefined ||
  (typeof raw === 'string' && _length(raw.trim()) <= SPEND_LIMITS.note)
    ? null
    : `is text up to ${SPEND_LIMITS.note} characters`;

const _idError = (raw: unknown): string | null =>
  raw === undefined || (Number.isSafeInteger(raw) && (raw as number) > 0)
    ? null
    : 'is the number of a spend row';

const _only = (entries: readonly (readonly [string, string | null])[]) =>
  Object.fromEntries(entries.filter((_) => _[1] !== null)) as InputErrors;

/** Ошибки формы строки: поля, месяц, части, валюта, сумма, заметка — без справочников. */
const _shapeErrors = (
  input: Readonly<Record<string, unknown>>,
  current: Month
): InputErrors =>
  _only([
    ...Object.keys(input)
      .filter((_) => !_FIELDS.includes(_))
      .map(
        (_) =>
          [
            _,
            'is not a field of a spend row: id, month, parts, currency, amount, note',
          ] as const
      ),
    ['id', _idError(input.id)],
    ['month', _monthError(input.month, current)],
    ['parts', _partsShape(input.parts)],
    [
      'currency',
      isCurrency(input.currency)
        ? null
        : 'is an ISO 4217 code of three capital letters',
    ],
    ['amount', _amountError(input.amount, input.currency)],
    ['note', _noteError(input.note)],
  ]);

/** Что знает проверка строки: настройку, нынешний месяц и прежнюю строку по номеру или ключу. */
export type SpendContext = {
  readonly setup: Setup;
  /** Нынешний месяц пояса отчётов: будущих месяцев нет — бюджет не расход. */
  readonly month: Month;
  /** Строка, которую правит ввод: по номеру, а без него — по ключу; null — новая. */
  readonly previous: (
    id: number | null,
    key: Pick<SpendRow, 'month' | 'parts' | 'currency'>
  ) => SpendRow | null;
};

/**
 * Строка расхода из ввода: месяц `ГГГГ-ММ` от `2000-01` до нынешнего; части — справочники с назначением
 * `parts`, значения — из них, до восьми, новой ссылке — не в архиве; валюта ISO 4217; сумма от нуля по валюте;
 * заметка до 500 знаков; незнакомое поле — отказ. Ошибки — по всем полям сразу, `analytics.invalid_spend`.
 */
const _invalid = (errors: InputErrors): never =>
  refuseInput('analytics.invalid_spend', 'The spend row is not valid', errors);

// Ошибки есть — отказ со всеми; нет — дальше то же значение.
const _valid = <T>(value: T, errors: InputErrors): T =>
  Object.keys(errors).length > 0 ? _invalid(errors) : value;

// Прежняя строка: по номеру; без номера — по ключу, если он есть (форма месяца и валюты годна).
const _previous = (
  context: SpendContext,
  id: number | null,
  row: Pick<SpendRow, 'month' | 'parts' | 'currency'>,
  keyed: boolean
): SpendRow | null => (id !== null || keyed ? context.previous(id, row) : null);

const _partErrors = (
  parts: Parts,
  setup: Setup,
  previous: SpendRow | null
): InputErrors =>
  _only(
    Object.entries(parts).map(
      ({ 0: part, 1: value }) =>
        [`parts.${part}`, _partError(setup, part, value, previous)] as const
    )
  );

export var parseSpend = (raw: unknown, context: SpendContext): SpendDraft =>
  pipe(
    (_: unknown) =>
      _isRecord(_)
        ? _
        : _invalid({
            '': 'a spend row is { month, parts, currency, amount, note }',
          }),
    (input) => ({ input, shape: _shapeErrors(input, context.month) }),
    ({ input, shape }) => ({
      input,
      shape,
      id:
        shape.id === undefined
          ? ((input.id as number | undefined) ?? null)
          : null,
      row: {
        month: input.month as Month,
        parts:
          shape.parts === undefined ? sortedParts(input.parts as Parts) : {},
        currency: input.currency as string,
      },
    }),
    // Части проверяются по справочникам, как только годна их форма: ошибки — по всем полям сразу. В архиве —
    // только то, на чём прежняя строка уже стояла.
    (_) =>
      _valid(_, {
        ..._.shape,
        ..._partErrors(
          _.row.parts,
          context.setup,
          _previous(
            context,
            _.id,
            _.row,
            _.shape.month === undefined && _.shape.currency === undefined
          )
        ),
      }),
    ({ input, id, row }): SpendDraft => ({
      id,
      key: spendKey(row),
      ...row,
      amount: moneyOf(input.amount, row.currency) as number,
      note: typeof input.note === 'string' ? input.note.trim() : '',
    })
  )(raw);

/** Состояние части строки расхода: значение есть, в архиве или удалено мимо расхода (копия, набор). */
export type PartState = 'known' | 'archived' | 'unknown';

/** Состояние каждой части строки по настройке. */
export var partStates = (
  parts: Parts,
  setup: Setup
): Readonly<Record<string, PartState>> =>
  Object.fromEntries(
    Object.entries(parts).map(({ 0: part, 1: value }) =>
      ((dictionary, found) => [
        part,
        dictionary === undefined ||
        dictionary.purpose !== 'parts' ||
        found === undefined
          ? 'unknown'
          : dictionary.archivedAt !== null || found.archivedAt !== null
            ? 'archived'
            : 'known',
      ])(
        setup.dictionaries.find((_) => _.code === part),
        setup.values.find((_) => _.dictionary === part && _.code === value)
      )
    )
  );

const _record = (row: SpendRow): Omit<SpendRow, 'author'> => ({
  id: row.id,
  month: row.month,
  parts: row.parts,
  currency: row.currency,
  amount: row.amount,
  note: row.note,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Строка журнала настройки о строке расхода: было и стало — строка без автора, ключ — её номер. */
export var spendLog = (
  action: 'created' | 'changed' | 'removed',
  before: SpendRow | null,
  after: SpendRow | null,
  author: SetupAuthor | null,
  at: string
): SetupLogDraft => ({
  at,
  author,
  item: 'spend',
  key: String((after ?? before)?.id ?? ''),
  action,
  before: before === null ? null : _record(before),
  after: after === null ? null : _record(after),
});

/** Строка расхода изменилась: другой месяц, части, валюта, сумма или заметка. */
export var spendChanged = (before: SpendRow, draft: SpendDraft): boolean =>
  spendKey(before) !== draft.key ||
  before.amount !== draft.amount ||
  before.note !== draft.note;

/** Где у отчёта расход: по строкам, только у итога, нигде. */
export type SpendScope = 'rows' | 'total' | 'none';

/** Почему не по строкам: группа не по части, фильтр не по части, атрибуция возврата. */
export type SpendReason = 'group' | 'filter' | 'return' | null;

/** Параметры отчёта, от которых зависит расход. */
export type SpendParams = {
  readonly period: DayPeriod;
  readonly attribution: Attribution;
  readonly group: ReportGroup;
  readonly filters: readonly ReportFilter[];
};

/** Расход отчёта: по значениям части группы, итог, без части группы и шире фильтра. */
export type ReportSpend = {
  readonly scope: SpendScope;
  readonly reason: SpendReason;
  /** Период не по границам месяцев: расход разложен по дням. */
  readonly prorated: boolean;
  /** Значение части группы → расход строки; у `scope` не `rows` — пусто. */
  readonly rows: ReadonlyMap<string, BaseSum>;
  /** Те же строки записями к сложению: расход «остальных» — сумма записей свёрнутых значений. */
  readonly entries: ReadonlyMap<string, readonly Priced[]>;
  /** Все строки расхода не шире фильтров; null — таких нет или расхода у отчёта нет. */
  readonly total: BaseSum | null;
  /** Совпали с фильтрами, но без части группы: в итоге и ни в одной строке. */
  readonly unassigned: BaseSum | null;
  /** Шире фильтра: не входят никуда. */
  readonly broader: BaseSum | null;
};

// Доля дней периода в месяце: каждая строка-месяц округляется до минимальной единицы, половина — от нуля;
// сначала перевод в базовую валюту, потом доля.
const _share = (priced: Priced, days: number, of: number): Priced =>
  days === of
    ? priced
    : {
        ...priced,
        amount: Number(
          divideRound(BigInt(priced.amount) * BigInt(days), BigInt(of))
        ),
        value:
          priced.value === null
            ? null
            : divideRound(priced.value * BigInt(days), BigInt(of)),
      };

const _sumOf = (entries: readonly Priced[]): BaseSum | null =>
  entries.length === 0 ? null : baseSum(entries);

type _Fit = 'fits' | 'broader' | 'unrelated';

// Значение части у строки расхода — как у людей в отчёте: код из справочника, иначе «не из справочника».
const _valueOf = (
  lookups: Pick<ReportLookups, 'values'>,
  part: string,
  value: string
): string => (lookups.values.get(part)?.has(value) === true ? value : UNKNOWN);

// Строка расхода не шире фильтров: для каждой части фильтра у неё то же значение; части нет — шире; другое
// значение — строка не о фильтре.
const _fit = (
  row: SpendRow,
  filters: readonly ReportFilter[],
  lookups: Pick<ReportLookups, 'values'>
): _Fit =>
  filters.some(
    (_) =>
      Object.hasOwn(row.parts, _.code) &&
      _valueOf(lookups, _.code, row.parts[_.code] as string) !== _.value
  )
    ? 'unrelated'
    : filters.some((_) => !Object.hasOwn(row.parts, _.code))
      ? 'broader'
      : 'fits';

const _NO_SPEND = (reason: SpendReason, prorated: boolean): ReportSpend => ({
  scope: 'none',
  reason,
  prorated,
  rows: new Map(),
  entries: new Map(),
  total: null,
  unassigned: null,
  broader: null,
});

/** Строка расхода в периоде: доля дней периода в её месяце, уже в базовой валюте. */
type _Placed = { readonly row: SpendRow; readonly priced: Priced };

const _placed = (
  spend: readonly SpendRow[],
  period: DayPeriod,
  price: (row: SpendRow) => Priced
): _Placed[] =>
  ((days) =>
    spend
      .filter((_) => days.has(_.month))
      .map((row) => ({
        row,
        priced: _share(
          price(row),
          days.get(row.month) as number,
          monthDays(row.month)
        ),
      })))(
    new Map(monthsIn(period).map((_) => [_, periodDays(period, _)] as const))
  );

// Расход строк отчёта: строки расхода с частью группы — по её значению.
const _byValue = (
  fitting: readonly _Placed[],
  code: string,
  lookups: Pick<ReportLookups, 'values'>
): ReadonlyMap<string, readonly Priced[]> =>
  new Map(
    Array.from(
      Map.groupBy(
        fitting.filter((_) => Object.hasOwn(_.row.parts, code)),
        (_) => _valueOf(lookups, code, _.row.parts[code] as string)
      ),
      ({ 0: value, 1: members }) => [value, members.map((_) => _.priced)]
    )
  );

const _sums = (
  entries: ReadonlyMap<string, readonly Priced[]>
): ReadonlyMap<string, BaseSum> =>
  new Map(
    Array.from(entries, ({ 0: value, 1: priced }) => [value, baseSum(priced)])
  );

/**
 * Расход отчёта (ADR 0072, «Расходы»): строка отчёта получает строки расхода не шире её — для каждой части,
 * которой она задана (фильтры по частям и значение группы-части), у строки расхода то же значение. Строки не
 * вкладываются: `{ ig }` — не сумма `{ ig, paid }` и `{ ig, organic }`. Расход месяца ложится на период долей
 * дней. Группа не по части — только итог; фильтр не по части и атрибуция возврата — расхода нет. `price` —
 * строка целиком в базовой валюте моментом начала её месяца.
 */
export var spendOf = (
  spend: readonly SpendRow[],
  params: SpendParams,
  price: (row: SpendRow) => Priced,
  lookups: Pick<ReportLookups, 'values'>
): ReportSpend =>
  ((prorated) =>
    params.attribution === 'return'
      ? _NO_SPEND('return', prorated)
      : params.filters.some((_) => _.kind !== 'part')
        ? _NO_SPEND('filter', prorated)
        : pipe(
            (_: readonly SpendRow[]) => _placed(_, params.period, price),
            (placed) => ({
              fitting: placed.filter(
                (_) => _fit(_.row, params.filters, lookups) === 'fits'
              ),
              broader: _sumOf(
                placed
                  .filter(
                    (_) => _fit(_.row, params.filters, lookups) === 'broader'
                  )
                  .map((_) => _.priced)
              ),
            }),
            ({ fitting, broader }): ReportSpend =>
              params.group.kind === 'part'
                ? ((entries) => ({
                    scope: 'rows' as const,
                    reason: null,
                    prorated,
                    rows: _sums(entries),
                    entries,
                    total: _sumOf(fitting.map((_) => _.priced)),
                    unassigned: _sumOf(
                      fitting
                        .filter(
                          (_) => !Object.hasOwn(_.row.parts, params.group.code)
                        )
                        .map((_) => _.priced)
                    ),
                    broader,
                  }))(_byValue(fitting, params.group.code, lookups))
                : {
                    scope: 'total',
                    reason: 'group',
                    prorated,
                    rows: new Map(),
                    entries: new Map(),
                    total: _sumOf(fitting.map((_) => _.priced)),
                    unassigned: null,
                    broader,
                  }
          )(spend))(
    monthsIn(params.period).some(
      (_) => periodDays(params.period, _) < monthDays(_)
    )
  );

/** «Ждёт расхода»: у значения за месяц есть новые люди, а строк расхода с ним нет. */
export type SpendHint = {
  readonly month: Month;
  readonly part: string;
  readonly value: string;
  readonly name: string;
  readonly people: number;
};

/** Новый человек для подсказок: месяц прихода в поясе отчётов и части первого касания. */
export type Arrival = { readonly month: Month; readonly parts: Parts };

/** Значения частей с отметкой «ждёт расхода», не в архиве: в форму расхода их можно взять. */
export var awaitingSpend = (setup: Setup) =>
  setup.values.filter(
    (value) =>
      value.awaitsSpend === true &&
      value.archivedAt === null &&
      setup.dictionaries.some(
        (_) =>
          _.code === value.dictionary &&
          _.purpose === 'parts' &&
          _.archivedAt === null
      )
  );

/**
 * Подсказки «ждёт расхода»: за месяц у значения есть новые люди (по частям первого касания), а ни у одной строки
 * расхода этого месяца нет этого значения своей части. Строка с нулём — тоже расход: подсказка уходит.
 */
export var spendHints = (
  months: readonly Month[],
  arrivals: readonly Arrival[],
  spend: readonly Pick<SpendRow, 'month' | 'parts'>[],
  setup: Setup
): SpendHint[] =>
  ((values) =>
    values.length === 0
      ? []
      : months.flatMap((month) =>
          values.flatMap((value) =>
            ((people) =>
              people === 0 ||
              spend.some(
                (_) =>
                  _.month === month &&
                  Object.hasOwn(_.parts, value.dictionary) &&
                  _.parts[value.dictionary] === value.code
              )
                ? []
                : [
                    {
                      month,
                      part: value.dictionary,
                      value: value.code,
                      name: value.name,
                      people,
                    },
                  ])(
              arrivals.filter(
                (_) =>
                  _.month === month &&
                  Object.hasOwn(_.parts, value.dictionary) &&
                  _.parts[value.dictionary] === value.code
              ).length
            )
          )
        ))(awaitingSpend(setup));
