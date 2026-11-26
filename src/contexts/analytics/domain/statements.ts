import { addMonths, dayStart, isMonth, type Month } from './days.ts';
import {
  type InputErrors,
  isCurrency,
  moneyOf,
  type PersonMoney,
  refuseInput,
} from './money.ts';
import type { SetupAuthor, SetupLogDraft } from './setup.ts';

/** До или после комиссии платёжного сервиса. */
export type StatementFees = 'gross' | 'net';

export var STATEMENT_FEES: readonly StatementFees[] = ['gross', 'net'];

/**
 * Выписка: сумма за календарный месяц пояса отчётов по выписке банка или платёжного сервиса. Данные сайта, а не
 * настройка: ревизии не повышает и в набор не идёт; ключ — месяц и валюта.
 */
export type Statement = {
  readonly month: Month;
  readonly currency: string;
  /** Минимальные единицы, со знаком: в месяце возвратов бывает больше оплат. */
  readonly amount: number;
  readonly fees: StatementFees;
  readonly note: string;
  /** Кто внёс или правил последним; null — команда или тест. */
  readonly author: { readonly name: string; readonly agent: boolean } | null;
  readonly updatedAt: string;
};

/** Проверенный ввод выписки. */
export type StatementInput = Pick<
  Statement,
  'month' | 'currency' | 'amount' | 'fees' | 'note'
>;

/** Выписка рядом с выручкой сайта за месяц: разница — в минимальных единицах, доля — от выписки. */
export type StatementView = Statement & {
  readonly site: number;
  readonly difference: number;
  /** Расхождение в процентах до десятых; null — у выписки ноль. */
  readonly share: number | null;
};

export var STATEMENT_LIMITS = {
  /** Выписок за раз. */
  batch: 24,
  note: 500,
  firstMonth: '2000-01',
} as const;

const _FIELDS = ['month', 'currency', 'amount', 'fees', 'note'];

const _isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _text = (raw: unknown): string | null =>
  typeof raw === 'string'
    ? raw
    : typeof raw === 'number' && Number.isFinite(raw)
      ? String(raw)
      : null;

/** Деньги со знаком: `"-12.50"` EUR — минус 1250; null — не деньги в этой валюте. */
export var signedMoney = (raw: unknown, currency: string): number | null =>
  ((text) =>
    text === null
      ? null
      : text.startsWith('-')
        ? ((minor) => (minor === null ? null : 0 - minor))(
            moneyOf(text.slice(1), currency)
          )
        : moneyOf(text, currency))(_text(raw));

const _errors = (
  input: Readonly<Record<string, unknown>>,
  last: Month
): InputErrors => ({
  ...Object.fromEntries(
    Object.keys(input)
      .filter((_) => !_FIELDS.includes(_))
      .map((_) => [
        _,
        'is not a field of a statement: month, currency, amount, fees, note',
      ])
  ),
  ...(!isMonth(input.month)
    ? { month: 'is a month YYYY-MM' }
    : input.month < STATEMENT_LIMITS.firstMonth || input.month > last
      ? {
          month: `is from ${STATEMENT_LIMITS.firstMonth} to the last month, ${last}: the current month is not over`,
        }
      : {}),
  ...(!isCurrency(input.currency)
    ? { currency: 'is an ISO 4217 code of three capital letters' }
    : signedMoney(input.amount, input.currency) === null
      ? {
          amount:
            'is a decimal string or a number, with a minus for a month of more refunds than payments, no more digits after the point than the currency has',
        }
      : {}),
  ...(input.fees !== undefined &&
  !STATEMENT_FEES.includes(input.fees as StatementFees)
    ? { fees: 'is gross (before fees, by default) or net (after fees)' }
    : {}),
  ...(input.note !== undefined &&
  (typeof input.note !== 'string' ||
    [...input.note.trim()].length > STATEMENT_LIMITS.note)
    ? { note: `is a text up to ${STATEMENT_LIMITS.note} characters` }
    : {}),
});

/**
 * Выписка из ввода: месяц от 2000-01 до прошлого месяца (`last`: выписку за идущий месяц не сверить), валюта ISO
 * 4217, сумма со знаком, до или после комиссии, заметка до 500 знаков. Ошибки — все поля сразу,
 * `analytics.invalid_statement`.
 */
export var parseStatement = (raw: unknown, last: Month): StatementInput =>
  _isRecord(raw)
    ? ((errors) =>
        Object.keys(errors).length > 0
          ? refuseInput(
              'analytics.invalid_statement',
              'The statement is not valid',
              errors
            )
          : {
              month: raw.month as Month,
              currency: raw.currency as string,
              amount: signedMoney(raw.amount, raw.currency as string) as number,
              fees: (raw.fees as StatementFees | undefined) ?? 'gross',
              note: typeof raw.note === 'string' ? raw.note.trim() : '',
            })(_errors(raw, last))
    : refuseInput('analytics.invalid_statement', 'The statement is not valid', {
        '': 'a statement is { month, currency, amount, fees, note }',
      });

/** Изменилась ли выписка: сумма, комиссия или заметка. */
export var statementChanged = (
  before: Statement,
  input: StatementInput
): boolean =>
  before.amount !== input.amount ||
  before.fees !== input.fees ||
  before.note !== input.note;

const _withoutAuthor = ({
  author: _author,
  ...record
}: Statement): Omit<Statement, 'author'> => record;

/** Строка журнала настройки о выписке: ключ — `месяц/валюта`, было и стало — запись без автора. */
export var statementLog = (
  action: 'created' | 'changed' | 'removed',
  before: Statement | null,
  after: Statement | null,
  author: SetupAuthor | null,
  at: string
): SetupLogDraft =>
  ((record) => ({
    at,
    author,
    item: 'statement',
    key: `${record.month}/${record.currency}`,
    action,
    before: before === null ? null : _withoutAuthor(before),
    after: after === null ? null : _withoutAuthor(after),
  }))((after ?? before) as Statement);

/** Границы месяца пояса отчётов моментами UTC: с начала первого дня до начала первого дня следующего. */
export var monthBounds = (
  month: Month,
  zone: string
): { readonly from: string; readonly to: string } => ({
  from: dayStart(`${month}-01`, zone),
  to: dayStart(`${addMonths(month, 1)}-01`, zone),
});

/**
 * Выручка сайта за месяц в валюте: оплаты минус возвраты по их моменту, при `net` — ещё минус комиссии в этой
 * валюте (моментом их оплаты); тестовых людей в `ledger` нет.
 */
export var siteRevenue = (
  ledger: readonly PersonMoney[],
  bounds: { readonly from: string; readonly to: string },
  currency: string,
  fees: StatementFees
): number =>
  ledger.reduce(
    (sum, person) =>
      sum +
      person.money.reduce(
        (all, _) =>
          _[1] === currency && _[0] >= bounds.from && _[0] < bounds.to
            ? all + _[2]
            : all,
        0
      ) -
      (fees === 'net'
        ? person.fees.reduce(
            (all, _) =>
              _[1] === currency && _[0] >= bounds.from && _[0] < bounds.to
                ? all + _[2]
                : all,
            0
          )
        : 0),
    0
  );

/** Выписка рядом с выручкой сайта: разница и доля от выписки до десятых процента. */
export var statementView = (
  statement: Statement,
  site: number
): StatementView => ({
  ...statement,
  site,
  difference: site - statement.amount,
  share:
    statement.amount === 0
      ? null
      : Math.round(
          (Math.abs(site - statement.amount) / Math.abs(statement.amount)) *
            1000
        ) / 10,
});
