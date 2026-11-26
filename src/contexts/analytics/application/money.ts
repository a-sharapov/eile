import {
  attempt,
  fail,
  isDomainError,
  rethrow,
} from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  addMonths,
  type Day,
  dayIn,
  dayIndex,
  dayStart,
  isMonth,
  type Month,
  monthOf,
  monthStarts,
  monthsBetween,
} from '../domain/days.ts';
import {
  type BaseSum,
  baseSum,
  type ExchangeRate,
  type InputErrors,
  inputErrorsOf,
  type Priced,
  parseRate,
  priceAt,
  RATE_LIMITS,
  type RateInput,
  type RateSteps,
  rateAt,
  rateLog,
  rateSteps,
  refuseInput,
  sameRate,
} from '../domain/money.ts';
import type {
  MoneyStore,
  ReportStore,
  SetupLog,
  SetupRepository,
  Transaction,
} from '../domain/ports.ts';
import type { ReportNeeds } from '../domain/report.ts';
import type { AnalyticsSettings } from '../domain/settings.ts';
import type { Setup, SetupAuthor, SetupLogDraft } from '../domain/setup.ts';
import {
  type Arrival,
  awaitingSpend,
  type PartState,
  parseSpend,
  partStates,
  SPEND_LIMITS,
  type SpendDraft,
  type SpendHint,
  type SpendRow,
  spendChanged,
  spendHints,
  spendLog,
} from '../domain/spend.ts';
import {
  monthBounds,
  parseStatement,
  STATEMENT_LIMITS,
  type Statement,
  type StatementInput,
  type StatementView,
  siteRevenue,
  statementChanged,
  statementLog,
  statementView,
} from '../domain/statements.ts';
import { type MonthQuery, type MonthRange, monthRange } from './query.ts';

export type MoneyPorts = {
  readonly money: MoneyStore;
  readonly reports: ReportStore;
  /** Настройка из памяти — для чтения; запись проверяет ввод по настройке из базы в своей транзакции. */
  readonly setup: () => Setup;
  readonly setups: SetupRepository;
  readonly settings: () => AnalyticsSettings;
  readonly log: SetupLog;
  readonly transaction: Transaction;
  readonly clock: () => Date;
  /** Пояс отчётов — пояс статистики. */
  readonly zone: () => string;
  /** Без фона сервера — пересчитать отставших по ревизии до чтения денег людей. */
  readonly ensure: () => void;
};

/** Сохранённые курсы: в порядке ввода; `created` и `changed` — сколько записей стало новыми и изменилось. */
export type RatesSaved = {
  readonly rates: readonly ExchangeRate[];
  readonly created: number;
  readonly changed: number;
};

/** Чем переводится месяц валюты: курс самой ранней суммы месяца. */
export type RateMonth = {
  readonly month: Month;
  /** День записи курса; null — курса нет. */
  readonly day: Day | null;
  readonly rate: string | null;
  readonly stale: boolean;
};

/** Экран курсов: курсы к нынешней базе по валютам сайта и чем переводятся месяцы с суммами. */
export type RatesReport = {
  readonly baseCurrency: string | null;
  readonly currencies: readonly {
    readonly currency: string;
    readonly rates: readonly ExchangeRate[];
    /** Месяцы, где у сайта есть суммы в этой валюте (по моменту курса), и чем они переводятся. */
    readonly months: readonly RateMonth[];
  }[];
  /** Курсы к другим базовым валютам — остались после смены базы. */
  readonly other: readonly { readonly base: string; readonly count: number }[];
};

/** Строка расхода для экрана и агента: в базовой валюте и с состоянием частей. */
export type SpendView = SpendRow & {
  /** Вся строка в базовой валюте; null — нет базы или курса. */
  readonly base: number | null;
  readonly staleRate: boolean;
  /** Часть → known, archived или unknown: значение удалили из справочника мимо расхода (копия, набор). */
  readonly states: Readonly<Record<string, PartState>>;
};

export type SpendSaved = {
  readonly rows: readonly SpendView[];
  readonly created: number;
  readonly changed: number;
};

/** Выписки месяцев рядом с выручкой сайта; `from` и `to` — месяцы, null — без границы. */
export type StatementsReport = {
  readonly from: Month | null;
  readonly to: Month | null;
  readonly statements: readonly StatementView[];
};

export type StatementsSaved = {
  readonly statements: readonly StatementView[];
  readonly created: number;
  readonly changed: number;
};

/** Месяцы списка выписок: с какого и по какой, включительно. */
export type StatementQuery = {
  readonly from?: unknown;
  readonly to?: unknown;
};

/** «Расходы»: месяцы периода от старых к новым со строками и итогом и подсказки «ждёт расхода». */
export type SpendReport = {
  readonly baseCurrency: string | null;
  readonly from: Month;
  readonly to: Month;
  readonly months: readonly {
    readonly month: Month;
    /** Итог месяца в базовой валюте; null — нет базы или строк. */
    readonly total: BaseSum | null;
    readonly rows: readonly SpendView[];
  }[];
  readonly hints: readonly SpendHint[];
};

const _NEEDS: ReportNeeds = {
  returns: false,
  answers: false,
  firsts: false,
  dims: false,
  traits: false,
  fees: false,
  access: false,
};

const _RATES_REFUSED = 'The rates are not saved, nothing changed';
const _SPEND_REFUSED = 'The spend is not saved, nothing changed';
const _STATEMENTS_REFUSED = 'The statements are not saved, nothing changed';

type _Action = 'created' | 'changed' | null;

type _Written<T> = {
  readonly record: T;
  readonly before: T | null;
  readonly action: _Action;
};

const _authorOf = (author: SetupAuthor | null): SpendRow['author'] =>
  author === null ? null : { name: author.name, agent: author.agent };

const _counts = (written: readonly { readonly action: _Action }[]) => ({
  created: written.filter((_) => _.action === 'created').length,
  changed: written.filter((_) => _.action === 'changed').length,
});

const _list = (
  raw: unknown,
  code: string,
  what: string,
  field: string,
  limit: number = SPEND_LIMITS.batch
): readonly unknown[] =>
  Array.isArray(raw) && raw.length >= 1 && raw.length <= limit
    ? raw
    : refuseInput(code, what, {
        [field]: `is a list of 1 to ${limit}`,
      });

// Ошибки строки — под её путём: `rows[2]` и `rows[2].parts.source`.
const _at = (path: string, errors: InputErrors): InputErrors =>
  Object.fromEntries(
    Object.entries(errors).map(({ 0: field, 1: message }) => [
      field === '' ? path : `${path}.${field}`,
      message,
    ])
  );

type _Parsed<T> = {
  readonly values: readonly (T | null)[];
  readonly errors: InputErrors;
};

// Все строки пачки проверяются до записи, ошибки собираются сразу по всем.
const _parseAll = <T>(
  inputs: readonly unknown[],
  code: string,
  field: string,
  parse: (raw: unknown) => T
): _Parsed<T> =>
  inputs.reduce<_Parsed<T>>(
    (all, raw, index) =>
      attempt(
        () => ({ values: [...all.values, parse(raw)], errors: all.errors }),
        (error) =>
          isDomainError(error) && error.code === code
            ? {
                values: [...all.values, null],
                errors: {
                  ...all.errors,
                  ..._at(`${field}[${index}]`, inputErrorsOf(error)),
                },
              }
            : rethrow(error)
      ),
    { values: [], errors: {} }
  );

// Повтор внутри пачки — ошибка второго: какая запись осталась бы, решал бы порядок.
const _repeats = (
  keys: readonly (string | null)[],
  field: string,
  what: string
): InputErrors =>
  Object.fromEntries(
    keys.flatMap((key, index) =>
      ((first) =>
        key === null || first === index
          ? []
          : [[`${field}[${index}]`, `the same ${what} as ${field}[${first}]`]])(
        keys.indexOf(key)
      )
    )
  );

// Ошибки ввода и повторов — одним отказом; нет ошибок — проверенные записи.
const _checked = <T>(
  parsed: _Parsed<T>,
  repeats: (values: readonly (T | null)[]) => InputErrors,
  code: string,
  what: string
): readonly T[] =>
  ((errors) =>
    Object.keys(errors).length > 0
      ? refuseInput(code, what, errors)
      : (parsed.values as readonly T[]))({
    ...parsed.errors,
    ...repeats(parsed.values),
  });

const _spendRepeats = (
  values: readonly (SpendDraft | null)[]
): InputErrors => ({
  ..._repeats(
    values.map((_) => _?.key ?? null),
    'rows',
    'month, parts and currency'
  ),
  ..._repeats(
    values.map((_) => (_ === null || _.id === null ? null : String(_.id))),
    'rows',
    'spend row'
  ),
});

const _rateRepeats = (values: readonly (RateInput | null)[]): InputErrors =>
  _repeats(
    values.map((_) => (_ === null ? null : `${_.currency}/${_.day}`)),
    'rates',
    'currency and day'
  );

const _statementRepeats = (
  values: readonly (StatementInput | null)[]
): InputErrors =>
  _repeats(
    values.map((_) => (_ === null ? null : `${_.month}/${_.currency}`)),
    'statements',
    'month and currency'
  );

// Месяц списка выписок: нет — без границы, не месяц — отказ запроса.
const _monthOf = (raw: unknown, field: string): Month | null =>
  raw === undefined || raw === null || raw === ''
    ? null
    : isMonth(raw)
      ? raw
      : fail('analytics.invalid_query', `${field} is a month YYYY-MM`);

// Сумма строки из её вида: база уже посчитана — у итога месяца складываются те же записи.
const _priced = (view: SpendView): Priced => ({
  currency: view.currency,
  amount: view.amount,
  value: view.base === null ? null : BigInt(view.base),
  stale: view.staleRate,
});

const _months = (range: MonthRange): Month[] =>
  Array.from({ length: monthsBetween(range.from, range.to) }, (_, n) =>
    addMonths(range.from, n)
  );

const _earlier = (a: Month | null, b: Month | null): Month | null =>
  a === null ? b : b === null || a < b ? a : b;

type _Sum = { readonly currency: string; readonly at: string };

// Самая ранняя сумма каждого месяца каждой валюты: месяц — по границам месяцев пояса, Intl — по разу на месяц.
const _earliest = (
  entries: readonly _Sum[],
  zone: string
): ReadonlyMap<string, ReadonlyMap<Month, string>> =>
  entries.length === 0
    ? new Map()
    : pipe(
        (_: readonly _Sum[]) =>
          _.toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
        (sorted) => ({
          sorted,
          months: _months({
            from: monthOf(dayIn((sorted[0] as _Sum).at, zone)),
            to: monthOf(dayIn((sorted.at(-1) as _Sum).at, zone)),
          }),
        }),
        ({ sorted, months }) =>
          ((bounds) =>
            sorted.reduce<Map<string, Map<Month, string>>>(
              (all, entry) =>
                ((index) =>
                  index < 0
                    ? all
                    : ((byMonth, month) => (
                        void (
                          byMonth.has(month) || byMonth.set(month, entry.at)
                        ),
                        all.set(entry.currency, byMonth)
                      ))(
                        all.get(entry.currency) ?? new Map<Month, string>(),
                        months[index] as Month
                      ))(dayIndex(bounds, entry.at)),
              new Map()
            ))(
            [...months, addMonths(months.at(-1) as Month, 1)].map((_) =>
              dayStart(`${_}-01`, zone)
            )
          )
      )(entries);

const _rateMonths = (
  months: ReadonlyMap<Month, string> | undefined,
  steps: RateSteps | null,
  currency: string
): RateMonth[] =>
  Array.from(months ?? new Map<Month, string>())
    .toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(({ 0: month, 1: moment }) =>
      ((step) => ({
        month,
        day: step?.day ?? null,
        rate: step?.rate ?? null,
        stale: step !== null && moment >= step.staleFrom,
      }))(steps === null ? null : rateAt(steps, currency, moment))
    );

/**
 * Курсы, расходы и выписки (ADR 0072, «Базовая валюта и курсы», «Расходы», «Выписки»): данные сайта, а не
 * настройка — ревизии не повышают и людей не пересчитывают. Правки пишет журнал настройки строками `rate`, `spend`
 * и `statement`; пачка — одной транзакцией, все записи или ни одной.
 */
export var defineMoney = ({
  money,
  reports,
  setup,
  setups,
  settings,
  log,
  transaction,
  clock,
  zone,
  ensure,
}: MoneyPorts) => {
  const now = (): string => clock().toISOString();
  const today = (): Day => dayIn(now(), zone());

  // Начало первого дня месяца — момент курса строки расхода; по разу на месяц.
  const startsOf = (months: readonly Month[]): ReadonlyMap<Month, string> =>
    monthStarts(months, zone());

  const viewOf =
    (
      steps: RateSteps | null,
      starts: ReadonlyMap<Month, string>,
      snapshot: Setup
    ) =>
    (row: SpendRow): SpendView =>
      ((sum) => ({
        ...row,
        base:
          sum === null || Object.keys(sum.unpriced).length > 0
            ? null
            : sum.value,
        staleRate: sum?.staleRate ?? false,
        states: partStates(row.parts, snapshot),
      }))(
        steps === null
          ? null
          : baseSum([
              priceAt(
                steps,
                row.currency,
                row.amount,
                starts.get(row.month) as string
              ),
            ])
      );

  const views = (rows: readonly SpendRow[], snapshot: Setup): SpendView[] =>
    ((base) =>
      rows.map(
        viewOf(
          base === null ? null : rateSteps(money.rates(), base, zone()),
          startsOf(rows.map((_) => _.month)),
          snapshot
        )
      ))(settings().baseCurrency);

  // Новые люди месяцев для подсказок: месяц прихода — по границам месяцев, а не Intl на человека.
  const arrivals = (months: readonly Month[]): Arrival[] =>
    ((bounds) =>
      reports
        .arrived(
          bounds[0] as string,
          bounds.at(-1) as string,
          false,
          months.length > 3,
          _NEEDS
        )
        .flatMap((person) =>
          ((index) =>
            index < 0
              ? []
              : [{ month: months[index] as Month, parts: person.firstParts }])(
            dayIndex(bounds, person.arrivedAt)
          )
        ))(
      [...months, addMonths(months.at(-1) as Month, 1)].map((_) =>
        dayStart(`${_}-01`, zone())
      )
    );

  const hintsOf = (
    months: readonly Month[],
    rows: readonly SpendRow[],
    snapshot: Setup
  ): SpendHint[] =>
    awaitingSpend(snapshot).length === 0
      ? []
      : (ensure(), spendHints(months, arrivals(months), rows, setup()));

  // Курс по ключу «валюта и день»: тот же курс (по числу) — без записи; новый сверх предела — отказ.
  const writeRate =
    (base: string, at: string, author: SetupAuthor | null) =>
    (input: RateInput): _Written<ExchangeRate> =>
      ((before) =>
        before !== null && sameRate(before.rate, input.rate)
          ? { record: before, before, action: null }
          : before === null && money.rateCount() >= RATE_LIMITS.rates
            ? fail(
                'analytics.too_many',
                `A site has up to ${RATE_LIMITS.rates} rates: remove old ones first`
              )
            : ((record) => (
                money.putRate(record),
                {
                  record,
                  before,
                  action: before === null ? 'created' : 'changed',
                }
              ))({
                base,
                currency: input.currency,
                day: input.day,
                rate: input.rate,
                author: _authorOf(author),
                updatedAt: at,
              } satisfies ExchangeRate))(
        money.rate(base, input.currency, input.day)
      );

  // Выписки рядом с выручкой сайта: деньги людей — раз на ответ, по частичному индексу.
  const statementViews = (statements: readonly Statement[]): StatementView[] =>
    statements.length === 0
      ? []
      : ((ledger) =>
          statements.map((_) =>
            statementView(
              _,
              siteRevenue(
                ledger,
                monthBounds(_.month, zone()),
                _.currency,
                _.fees
              )
            )
          ))((ensure(), money.ledger()));

  // Выписка по ключу «месяц и валюта»: та же сумма, комиссия и заметка — без записи.
  const writeStatement =
    (at: string, author: SetupAuthor | null) =>
    (input: StatementInput): _Written<Statement> =>
      ((before) =>
        before !== null && !statementChanged(before, input)
          ? { record: before, before, action: null }
          : ((record) => (
              money.putStatement(record),
              {
                record,
                before,
                action: before === null ? 'created' : 'changed',
              } as _Written<Statement>
            ))({
              ...input,
              author: _authorOf(author),
              updatedAt: at,
            } satisfies Statement))(
        money.statement(input.month, input.currency)
      );

  // Новая строка — в пределах сайта и месяца.
  const addSpend = (
    draft: SpendDraft,
    index: number,
    at: string,
    author: SetupAuthor | null
  ): _Written<SpendRow> =>
    money.spendCount(null) >= SPEND_LIMITS.rows
      ? fail(
          'analytics.too_many',
          `A site has up to ${SPEND_LIMITS.rows} spend rows: remove old ones first`
        )
      : money.spendCount(draft.month) >= SPEND_LIMITS.month
        ? fail(
            'analytics.too_many',
            `rows[${index}]: a month has up to ${SPEND_LIMITS.month} spend rows`
          )
        : {
            record: money.addSpend({
              month: draft.month,
              parts: draft.parts,
              currency: draft.currency,
              amount: draft.amount,
              note: draft.note,
              author: _authorOf(author),
              createdAt: at,
              updatedAt: at,
            }),
            before: null,
            action: 'created',
          };

  // Правка строки: ключ другой строки — `analytics.spend_exists`; ничего не изменилось — без записи.
  const editSpend = (
    before: SpendRow,
    draft: SpendDraft,
    index: number,
    at: string,
    author: SetupAuthor | null
  ): _Written<SpendRow> =>
    ((other) =>
      other !== null && other.id !== before.id
        ? fail(
            'analytics.spend_exists',
            `rows[${index}]: spend row ${other.id} has the same month, parts and currency`
          )
        : !spendChanged(before, draft)
          ? { record: before, before, action: null }
          : ((record) => (
              money.putSpend(record),
              { record, before, action: 'changed' as const }
            ))({
              ...before,
              month: draft.month,
              parts: draft.parts,
              currency: draft.currency,
              amount: draft.amount,
              note: draft.note,
              author: _authorOf(author),
              updatedAt: at,
            }))(draft.id === null ? before : money.spendByKey(draft));

  // Строка без номера — по ключу; с номером — эта строка, нет её — `analytics.spend_not_found`.
  const writeSpend =
    (at: string, author: SetupAuthor | null) =>
    (draft: SpendDraft, index: number): _Written<SpendRow> =>
      ((before) =>
        before === null
          ? addSpend(draft, index, at, author)
          : editSpend(before, draft, index, at, author))(
        draft.id === null
          ? money.spendByKey(draft)
          : (money.spendRow(draft.id) ??
              fail(
                'analytics.spend_not_found',
                `rows[${index}]: there is no spend row ${draft.id}`
              ))
      );

  return {
    rates: {
      /** Курсы к нынешней базе по валютам сайта: месяцы с суммами и чем они переводятся; к прежним базам — числом. */
      list: (): RatesReport =>
        pipe(
          (base: string | null) => ({
            base,
            all: (ensure(), money.rates()),
            moments: money.currencyMoments(),
            spend: money.spend(null, null),
          }),
          (_) => ({
            ..._,
            current: _.all.filter(
              (rate) => _.base !== null && rate.base === _.base
            ),
            starts: startsOf(_.spend.map((row) => row.month)),
          }),
          (_) => ({
            ..._,
            steps:
              _.base === null ? null : rateSteps(_.current, _.base, zone()),
            earliest: _earliest(
              [
                ..._.moments,
                ..._.spend.map((row) => ({
                  currency: row.currency,
                  at: _.starts.get(row.month) as string,
                })),
              ],
              zone()
            ),
          }),
          (_): RatesReport => ({
            baseCurrency: _.base,
            currencies: [
              ...new Set([
                ..._.moments.map((sum) => sum.currency),
                ..._.spend.map((row) => row.currency),
                ..._.current.map((rate) => rate.currency),
              ]),
            ]
              .filter((currency) => currency !== _.base)
              .toSorted()
              .map((currency) => ({
                currency,
                rates: _.current.filter((rate) => rate.currency === currency),
                months: _rateMonths(
                  _.earliest.get(currency),
                  _.steps,
                  currency
                ),
              })),
            other: Array.from(
              Map.groupBy(
                _.all.filter((rate) => rate.base !== _.base),
                (rate) => rate.base
              ),
              ({ 0: base, 1: records }) => ({ base, count: records.length })
            ).toSorted((a, b) => (a.base < b.base ? -1 : 1)),
          })
        )(settings().baseCurrency),
      /**
       * Курсы к нынешней базе пачкой 1–100: запись по ключу «валюта и день», тот же курс — без записи и строки
       * журнала. Базовой валюты нет — `analytics.no_base_currency`.
       */
      save: (raw: unknown, author: SetupAuthor | null = null): RatesSaved =>
        ((base) =>
          base === null
            ? fail(
                'analytics.no_base_currency',
                'Set the base currency of reports first: rates are to it'
              )
            : transaction(() =>
                ((at) =>
                  pipe(
                    (_: unknown) =>
                      _list(
                        _,
                        'analytics.invalid_rate',
                        _RATES_REFUSED,
                        'rates'
                      ),
                    (_) =>
                      _parseAll(_, 'analytics.invalid_rate', 'rates', (input) =>
                        parseRate(input, base, today())
                      ),
                    (_) =>
                      _checked(
                        _,
                        _rateRepeats,
                        'analytics.invalid_rate',
                        _RATES_REFUSED
                      ),
                    (_) => _.map(writeRate(base, at, author)),
                    (written) => (
                      log.append(
                        written.flatMap((_): SetupLogDraft[] =>
                          _.action === null
                            ? []
                            : [
                                rateLog(
                                  _.action,
                                  _.before,
                                  _.record,
                                  author,
                                  at
                                ),
                              ]
                        )
                      ),
                      {
                        rates: written.map((_) => _.record),
                        ..._counts(written),
                      }
                    )
                  )(raw))(now())
              ))(settings().baseCurrency),
      /** Удалить курс к нынешней базе; нет такого — `analytics.rate_not_found`. */
      remove: (
        currency: unknown,
        day: unknown,
        author: SetupAuthor | null = null
      ): void =>
        transaction(
          () =>
            void ((base) =>
              ((before) =>
                before === null
                  ? fail(
                      'analytics.rate_not_found',
                      `There is no rate of ${String(currency)} from ${String(day)} to the base currency`
                    )
                  : (money.removeRate(before.base, before.currency, before.day),
                    log.append([
                      rateLog('removed', before, null, author, now()),
                    ])))(
                base === null ||
                  typeof currency !== 'string' ||
                  typeof day !== 'string'
                  ? null
                  : money.rate(base, currency, day)
              ))(settings().baseCurrency)
        ),
    },
    statements: {
      /** Выписки месяцев от `from` до `to` (без них — все) рядом с выручкой сайта за месяц, разницей и долей. */
      list: (query: StatementQuery = {}): StatementsReport =>
        ((from, to) => ({
          from,
          to,
          statements: statementViews(money.statements(from, to)),
        }))(_monthOf(query.from, 'from'), _monthOf(query.to, 'to')),
      /**
       * Выписки пачкой 1–24: запись по ключу «месяц и валюта», та же — без записи и строки журнала. Месяц — до
       * прошлого включительно: идущий не сверить. Все или ни одной: ошибки — по всем путям сразу.
       */
      save: (
        raw: unknown,
        author: SetupAuthor | null = null
      ): StatementsSaved =>
        pipe(
          (_: unknown) =>
            transaction(() =>
              ((at) =>
                pipe(
                  (input: unknown) =>
                    _list(
                      input,
                      'analytics.invalid_statement',
                      _STATEMENTS_REFUSED,
                      'statements',
                      STATEMENT_LIMITS.batch
                    ),
                  (inputs) =>
                    _parseAll(
                      inputs,
                      'analytics.invalid_statement',
                      'statements',
                      (input) =>
                        parseStatement(input, addMonths(monthOf(today()), -1))
                    ),
                  (parsed) =>
                    _checked(
                      parsed,
                      _statementRepeats,
                      'analytics.invalid_statement',
                      _STATEMENTS_REFUSED
                    ),
                  (inputs) => inputs.map(writeStatement(at, author)),
                  (written) => (
                    log.append(
                      written.flatMap((_): SetupLogDraft[] =>
                        _.action === null
                          ? []
                          : [
                              statementLog(
                                _.action,
                                _.before,
                                _.record,
                                author,
                                at
                              ),
                            ]
                      )
                    ),
                    written
                  )
                )(_))(now())
            ),
          (written): StatementsSaved => ({
            statements: statementViews(written.map((_) => _.record)),
            ..._counts(written),
          })
        )(raw),
      /** Удалить выписку месяца в валюте; нет такой — `analytics.statement_not_found`. */
      remove: (
        month: unknown,
        currency: unknown,
        author: SetupAuthor | null = null
      ): void =>
        transaction(
          () =>
            void ((before) =>
              before === null
                ? fail(
                    'analytics.statement_not_found',
                    `There is no statement of ${String(month)} in ${String(currency)}`
                  )
                : (money.removeStatement(before.month, before.currency),
                  log.append([
                    statementLog('removed', before, null, author, now()),
                  ])))(
              typeof month === 'string' && typeof currency === 'string'
                ? money.statement(month, currency)
                : null
            )
        ),
    },
    spend: {
      /**
       * Месяцы периода (по умолчанию нынешний и пять прошлых) со строками в базовой валюте и итогом, подсказки
       * «ждёт расхода» — по новым людям месяца.
       */
      list: (query: MonthQuery = {}): SpendReport =>
        pipe(
          (_: MonthQuery) =>
            monthRange(_, {
              now: now(),
              zone: zone(),
              firstArrival: () => reports.firstArrival(false),
              firstMonth: () =>
                _earlier(
                  money.firstSpendMonth(),
                  ((at) => (at === null ? null : monthOf(dayIn(at, zone()))))(
                    reports.firstArrival(false)
                  )
                ),
            }),
          (range) => ({
            range,
            months: _months(range),
            rows: money.spend(range.from, range.to),
            snapshot: setup(),
            base: settings().baseCurrency,
          }),
          (_): SpendReport =>
            ((shown) => ({
              baseCurrency: _.base,
              from: _.range.from,
              to: _.range.to,
              months: _.months.map((month) =>
                ((inMonth) => ({
                  month,
                  total:
                    _.base === null || inMonth.length === 0
                      ? null
                      : baseSum(inMonth.map(_priced)),
                  rows: inMonth,
                }))(shown.filter((row) => row.month === month))
              ),
              hints: hintsOf(_.months, _.rows, _.snapshot),
            }))(views(_.rows, _.snapshot))
        )(query),
      /**
       * Строки расхода пачкой 1–100: строка без номера — запись по ключу (месяц, части, валюта), с номером — правка
       * этой строки. Все строки или ни одной: ошибки ввода — сразу по всем путям (`analytics.invalid_spend`).
       */
      save: (raw: unknown, author: SetupAuthor | null = null): SpendSaved =>
        pipe(
          (_: unknown) =>
            transaction(() =>
              ((at, snapshot) =>
                pipe(
                  (input: unknown) =>
                    _list(
                      input,
                      'analytics.invalid_spend',
                      _SPEND_REFUSED,
                      'rows'
                    ),
                  (inputs) =>
                    _parseAll(
                      inputs,
                      'analytics.invalid_spend',
                      'rows',
                      (row) =>
                        parseSpend(row, {
                          setup: snapshot,
                          month: monthOf(today()),
                          previous: (id, key) =>
                            id === null
                              ? money.spendByKey(key)
                              : money.spendRow(id),
                        })
                    ),
                  (parsed) =>
                    _checked(
                      parsed,
                      _spendRepeats,
                      'analytics.invalid_spend',
                      _SPEND_REFUSED
                    ),
                  (drafts) => drafts.map(writeSpend(at, author)),
                  (written) => (
                    log.append(
                      written.flatMap((row): SetupLogDraft[] =>
                        row.action === null
                          ? []
                          : [
                              spendLog(
                                row.action,
                                row.before,
                                row.record,
                                author,
                                at
                              ),
                            ]
                      )
                    ),
                    written
                  )
                )(_))(now(), setups.load())
            ),
          (written): SpendSaved => ({
            rows: views(
              written.map((_) => _.record),
              setup()
            ),
            ..._counts(written),
          })
        )(raw),
      /** Удалить строку расхода; нет такой — `analytics.spend_not_found`. */
      remove: (id: unknown, author: SetupAuthor | null = null): void =>
        transaction(
          () =>
            void ((before) =>
              before === null
                ? fail(
                    'analytics.spend_not_found',
                    `There is no spend row ${String(id)}`
                  )
                : (money.removeSpend(before.id),
                  log.append([
                    spendLog('removed', before, null, author, now()),
                  ])))(
              Number.isSafeInteger(id) && (id as number) > 0
                ? money.spendRow(id as number)
                : null
            )
        ),
    },
  };
};

export type Money = ReturnType<typeof defineMoney>;
