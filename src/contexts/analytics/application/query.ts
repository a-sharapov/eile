import { fail } from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS, isCode } from '../domain/codes.ts';
import {
  COHORT_BASES,
  COHORT_LIMITS,
  COHORT_METRICS,
  type CohortBasis,
  type CohortMetric,
  type CohortMonth,
} from '../domain/cohorts.ts';
import {
  addDays,
  addMonths,
  type Day,
  type DayPeriod,
  dayIn,
  dayStart,
  daysBetween,
  isDay,
  isMonth,
  type Month,
  monthOf,
  monthStarts,
  monthsIn,
  previousPeriod,
  yearBefore,
} from '../domain/days.ts';
import { dayOf, momentOf } from '../domain/envelope.ts';
import { firstQuestion } from '../domain/person.ts';
import {
  type Attribution,
  type FilterKind,
  type GroupKind,
  NONE,
  type PaymentWindow,
  REPORT_LIMITS,
  type ReportFilter,
  type ReportGroup,
  type ReportParams,
  UNKNOWN,
} from '../domain/report.ts';
import {
  FEES_MODES,
  type FeesMode,
  LIFETIMES,
  type Lifetime,
} from '../domain/revenue.ts';
import type { Funnel, Setup } from '../domain/setup.ts';
import { SPEND_LIMITS } from '../domain/spend.ts';
import { utcDay } from '../domain/tally.ts';

/** Строк на странице списков людей и событий: по умолчанию и не больше. */
export var PAGE_LIMITS = { default: 50, max: 200 } as const;

const _DAY_MS = 86_400_000;

const _absent = (raw: unknown): boolean =>
  raw === undefined || raw === null || raw === '';

const _invalid = (field: string, rule: string): never =>
  fail('analytics.invalid_query', `The ${field} filter ${rule}`);

export var queryLimit = (raw: unknown): number =>
  Number.isInteger(raw) && (raw as number) > 0
    ? Math.min(raw as number, PAGE_LIMITS.max)
    : PAGE_LIMITS.default;

export var queryOffset = (raw: unknown): number =>
  Number.isInteger(raw) && (raw as number) > 0 ? (raw as number) : 0;

/** Номер приёма события или строки журнала, с которого продолжить страницу; нет — с начала. */
export var queryCursor = (raw: unknown): number | null =>
  _absent(raw)
    ? null
    : Number.isInteger(raw) && (raw as number) > 0
      ? (raw as number)
      : _invalid('before', 'is a whole number: next of the previous page');

export var queryCode = (
  raw: unknown,
  max: number,
  field: string
): string | null =>
  _absent(raw)
    ? null
    : isCode(raw, max)
      ? raw
      : _invalid(field, `is a code: a-z 0-9 _ - up to ${max} characters`);

export var queryChoice = <T extends string>(
  raw: unknown,
  choices: readonly T[],
  field: string
): T | null =>
  _absent(raw)
    ? null
    : choices.includes(raw as T)
      ? (raw as T)
      : _invalid(field, `is one of ${choices.join(', ')}`);

/**
 * Граница по времени события: день `ГГГГ-ММ-ДД` или момент ISO 8601. `end` — верхняя граница не включая её:
 * до конца дня, а момент — включительно.
 */
export var queryMoment = (
  raw: unknown,
  field: string,
  end: boolean
): string | null =>
  _absent(raw)
    ? null
    : ((day, moment) =>
        day !== null
          ? new Date(
              Date.parse(`${day}T00:00:00.000Z`) + (end ? _DAY_MS : 0)
            ).toISOString()
          : moment !== null
            ? end
              ? new Date(Date.parse(moment) + 1).toISOString()
              : moment
            : _invalid(
                field,
                'is a day YYYY-MM-DD or ISO 8601 with a time zone'
              ))(dayOf(raw), momentOf(raw));

/** Параметры отчётов и списка людей с ними — как пришли из адреса или от агента. */
export type ReportQuery = {
  /** Последние N дней до сегодня, 1–3660. */
  readonly days?: unknown;
  /** Первый и последний день `ГГГГ-ММ-ДД` пояса отчётов; конец — не позже сегодня. */
  readonly from?: unknown;
  readonly to?: unknown;
  /** С первого прихода. */
  readonly all?: unknown;
  readonly attribution?: unknown;
  readonly group?: unknown;
  readonly window?: unknown;
  /** И люди из одних тестовых событий. */
  readonly test?: unknown;
  /** Строк группы, до 50. */
  readonly limit?: unknown;
  /** `part.<код>`, `trait.<код>`, `prop.<код>`, `answer.<вопрос>`, `sender` → код, `~none` или `~unknown`. */
  readonly filters?: Readonly<Record<string, unknown>>;
  /** Срок жизни LTV: 3, 6, 12 месяцев или 0 — всё время. */
  readonly life?: unknown;
  /** `gross` — до комиссии, `net` — после. */
  readonly fees?: unknown;
  /** `previous` — прошлый период той же длины, `year` — те же дни годом раньше. */
  readonly compare?: unknown;
  /** Когорты: `payment` — по первой оплате, `arrival` — по приходу. */
  readonly basis?: unknown;
  /** Когорты по первой оплате: `cumulative`, `monthly`, `active`. */
  readonly metric?: unknown;
};

const _FLAG_VALUES: Readonly<Record<string, boolean>> = {
  '1': true,
  true: true,
  '0': false,
  false: false,
};

/** Отметка из адреса или от агента: `1`, `true`, `0`, `false`; нет — false. */
export var queryFlag = (raw: unknown, field: string): boolean =>
  _absent(raw)
    ? false
    : typeof raw === 'boolean'
      ? raw
      : ((Object.hasOwn(_FLAG_VALUES, String(raw))
          ? _FLAG_VALUES[String(raw)]
          : undefined) ?? _invalid(field, 'is 1 or 0'));

/** Целое из адреса или от агента: строка цифр или число; нет — null. */
export var queryWhole = (
  raw: unknown,
  field: string,
  min: number,
  max: number
): number | null =>
  _absent(raw)
    ? null
    : ((value) =>
        Number.isInteger(value) && value >= min && value <= max
          ? value
          : _invalid(field, `is a whole number ${min} to ${max}`))(
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && /^-?\d+$/.test(raw.trim())
            ? Number(raw)
            : Number.NaN
      );

/** «Сейчас», пояс отчётов и самый ранний приход — для периода `all`. */
export type ReportClock = {
  readonly now: string;
  readonly zone: string;
  readonly firstArrival: () => string | null;
};

const _DEFAULT_DAYS = 30;

const _wrong = (message: string): never =>
  fail('analytics.invalid_query', message);
const _WINDOWS: readonly PaymentWindow[] = [0, 7, 30];
const _ATTRIBUTIONS: readonly Attribution[] = ['first', 'return'];

const _range = (from: unknown, to: unknown, today: string): DayPeriod =>
  !isDay(from) || !isDay(to)
    ? _wrong('The period from … to is days YYYY-MM-DD')
    : to > today
      ? _wrong(`The period ends not later than today, ${today}`)
      : from > to
        ? _wrong('The period starts before it ends')
        : daysBetween(from, to) > REPORT_LIMITS.days
          ? _wrong(`The period is up to ${REPORT_LIMITS.days} days`)
          : { from, to };

/**
 * Период из запроса: `all` — с первого прихода, свои дни `from`–`to` (конец не позже сегодня), `days` — последние
 * дни до сегодня; ничего не задано — null. Дни — в поясе отчётов.
 */
export var reportPeriod = (
  query: ReportQuery,
  clock: ReportClock
): DayPeriod | null =>
  ((today) =>
    queryFlag(query.all, 'all')
      ? ((first) => ({
          from: first === null || first > today ? today : first,
          to: today,
        }))(
          ((at) => (at === null ? null : dayIn(at, clock.zone)))(
            clock.firstArrival()
          )
        )
      : !_absent(query.from) || !_absent(query.to)
        ? _range(query.from, _absent(query.to) ? today : query.to, today)
        : ((days) =>
            days === null
              ? null
              : { from: addDays(today, 1 - days), to: today })(
            queryWhole(query.days, 'days', 1, REPORT_LIMITS.days)
          ))(dayIn(clock.now, clock.zone));

/** Сутки UTC из запроса: счёт приёма и сводки отправителей. */
export type UtcQuery = {
  readonly days?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
};

const _utcRange = (
  from: unknown,
  to: unknown,
  today: Day,
  max: number
): DayPeriod =>
  !isDay(from) || !isDay(to)
    ? _wrong('The days from … to are days YYYY-MM-DD in UTC')
    : to > today
      ? _wrong(`The days end not later than today in UTC, ${today}`)
      : from > to
        ? _wrong('The period starts before it ends')
        : daysBetween(from, to) > max
          ? _wrong(`The period is up to ${max} days`)
          : { from, to };

/**
 * Сутки UTC служебных цифр: свои `from`–`to` (конец не позже сегодняшних суток UTC; без начала — 30 суток до
 * конца), `days` — последние сутки до сегодня; ничего не задано — 30 суток. Не больше `max` суток.
 */
export var utcPeriod = (query: UtcQuery, now: string, max: number): DayPeriod =>
  ((today) =>
    !_absent(query.from) || !_absent(query.to)
      ? ((to) =>
          _utcRange(
            _absent(query.from)
              ? isDay(to)
                ? addDays(to, 1 - _DEFAULT_DAYS)
                : to
              : query.from,
            to,
            today,
            max
          ))(_absent(query.to) ? today : query.to)
      : ((days) => ({ from: addDays(today, 1 - days), to: today }))(
          queryWhole(query.days, 'days', 1, max) ?? _DEFAULT_DAYS
        ))(utcDay(now));

/** Месяцы «Расходов» из запроса: как пришли из адреса или от агента. */
export type MonthQuery = {
  /** Месяц `ГГГГ-ММ` или день `ГГГГ-ММ-ДД` — берётся его месяц. */
  readonly from?: unknown;
  readonly to?: unknown;
  /** Месяцы последних N дней до сегодня. */
  readonly days?: unknown;
  /** С первой строки расхода или первого прихода. */
  readonly all?: unknown;
};

/** Первый и последний месяц включительно. */
export type MonthRange = { readonly from: Month; readonly to: Month };

const _MONTHS_BACK = 5;

const _monthOfQuery = (raw: unknown, field: string): Month =>
  isMonth(raw)
    ? raw
    : isDay(raw)
      ? monthOf(raw)
      : _wrong(`The ${field} of spend is a month YYYY-MM or a day YYYY-MM-DD`);

/**
 * Месяцы «Расходов»: `all` — с самого раннего месяца данных, свои `from`–`to` (месяцы или дни; конец — не позже
 * нынешнего месяца), `days` — месяцы последних дней; ничего не задано — нынешний и пять прошлых месяцев.
 */
export var monthRange = (
  query: MonthQuery,
  clock: ReportClock & { readonly firstMonth: () => Month | null }
): MonthRange =>
  ((today) =>
    ((current) =>
      queryFlag(query.all, 'all')
        ? ((first) => ({
            from: first === null || first > current ? current : first,
            to: current,
          }))(clock.firstMonth())
        : !_absent(query.from) || !_absent(query.to)
          ? ((to) =>
              ((from) =>
                to > current
                  ? _wrong(`Spend ends not later than this month, ${current}`)
                  : from > to
                    ? _wrong('The period starts before it ends')
                    : from < SPEND_LIMITS.firstMonth
                      ? _wrong(
                          `Spend starts not earlier than ${SPEND_LIMITS.firstMonth}`
                        )
                      : { from, to })(
                _absent(query.from)
                  ? addMonths(to, -_MONTHS_BACK)
                  : _monthOfQuery(query.from, 'start')
              ))(_absent(query.to) ? current : _monthOfQuery(query.to, 'end'))
          : ((days) =>
              days === null
                ? { from: addMonths(current, -_MONTHS_BACK), to: current }
                : { from: monthOf(addDays(today, 1 - days)), to: current })(
              queryWhole(query.days, 'days', 1, REPORT_LIMITS.days)
            ))(monthOf(today)))(dayIn(clock.now, clock.zone));

/** Моменты UTC периода: от начала первого дня до начала дня после последнего. */
export var momentsOf = (period: DayPeriod, zone: string) => ({
  from: dayStart(period.from, zone),
  to: dayStart(addDays(period.to, 1), zone),
});

// Группы и фильтры по кодам настройки; признак и свойство — только с отметкой «разрез».
const _KNOWN: Readonly<
  Record<
    Exclude<GroupKind, 'label' | 'sender'>,
    (code: string, setup: Setup) => boolean
  >
> = {
  part: (code, setup) =>
    setup.dictionaries.some((_) => _.code === code && _.purpose === 'parts'),
  trait: (code, setup) =>
    setup.properties.some(
      (_) => _.scope === 'person' && _.code === code && _.dimension
    ),
  prop: (code, setup) =>
    setup.properties.some(
      (_) => _.scope === 'event' && _.code === code && _.dimension
    ),
  answer: (code, setup) =>
    setup.dictionaries.some((_) => _.code === code && _.purpose === 'answers'),
};

const _byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Группа по умолчанию: первая часть схемы первого по коду отправителя со схемой (схемы в архиве — если других нет);
 * схем нет — первый вопрос опроса; нет и его — отправитель.
 */
export var defaultGroup = (setup: Setup): ReportGroup =>
  ((part) =>
    part !== undefined
      ? { kind: 'part', code: part }
      : ((question) =>
          question === null
            ? { kind: 'sender', code: '' }
            : { kind: 'answer', code: question })(firstQuestion(setup)))(
    setup.schemas.toSorted(
      (a, b) =>
        Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
        _byCode(a.sender, b.sender)
    )[0]?.parts[0]
  );

const _GROUP_RULE =
  'is part:<code>, trait:<code>, prop:<code>, answer:<question>, label or sender of the setup; a trait or a property needs the mark dimension';

/** Группа из запроса: код должен быть в настройке. */
export var reportGroup = (raw: unknown, setup: Setup): ReportGroup =>
  _absent(raw)
    ? defaultGroup(setup)
    : raw === 'label' || raw === 'sender'
      ? { kind: raw, code: '' }
      : ((text) =>
          ((kind, code) =>
            Object.hasOwn(_KNOWN, kind) &&
            isCode(code, CODE_LIMITS.dictionary) &&
            _KNOWN[kind as keyof typeof _KNOWN](code, setup)
              ? { kind: kind as GroupKind, code }
              : _wrong(`The group ${_GROUP_RULE}`))(
            text.slice(0, Math.max(0, text.indexOf(':'))),
            text.slice(text.indexOf(':') + 1)
          ))(String(raw));

// Значение фильтра: код значения, число или да/нет строкой, `~none`, `~unknown`.
const _FILTER_VALUE = /^[a-z0-9_.-]{1,60}$/;

const _filterValue = (raw: unknown, key: string): string =>
  ((value) =>
    value === NONE || value === UNKNOWN || _FILTER_VALUE.test(value)
      ? value
      : _wrong(`The filter ${key} is a code of a value, ~none or ~unknown`))(
    typeof raw === 'number' || typeof raw === 'boolean'
      ? String(raw)
      : typeof raw === 'string'
        ? raw.trim()
        : ''
  );

const _filter = (key: string, raw: unknown, setup: Setup): ReportFilter =>
  key === 'sender'
    ? isCode(raw, CODE_LIMITS.sender) &&
      setup.senders.some((_) => _.code === raw)
      ? { kind: 'sender', code: '', value: raw }
      : _wrong('The filter sender is a sender of the setup')
    : ((kind, code) =>
        Object.hasOwn(_KNOWN, kind) &&
        isCode(code, CODE_LIMITS.dictionary) &&
        _KNOWN[kind as keyof typeof _KNOWN](code, setup)
          ? {
              kind: kind as FilterKind,
              code,
              value: _filterValue(raw, key),
            }
          : _wrong(
              `The filter ${key} is part.<code>, trait.<code>, prop.<code>, answer.<question> or sender of the setup; a trait or a property needs the mark dimension`
            ))(
        key.slice(0, Math.max(0, key.indexOf('.'))),
        key.slice(key.indexOf('.') + 1)
      );

/** Фильтры отчёта: до 10, все сразу; коды — из настройки. */
export var reportFilters = (
  raw: Readonly<Record<string, unknown>> | undefined,
  setup: Setup
): ReportFilter[] =>
  ((entries) =>
    entries.length > REPORT_LIMITS.filters
      ? _wrong(`A report has up to ${REPORT_LIMITS.filters} filters`)
      : entries.map(({ 0: key, 1: value }) => _filter(key, value, setup)))(
    Object.entries(raw ?? {}).filter(({ 1: value }) => !_absent(value))
  );

const _limit = (raw: unknown): number =>
  _absent(raw)
    ? REPORT_LIMITS.rows
    : Math.min(
        queryWhole(raw, 'limit', 1, Number.MAX_SAFE_INTEGER) as number,
        REPORT_LIMITS.rows
      );

/**
 * Параметры отчёта: период (по умолчанию 30 дней, у когорт — 365), атрибуция, группа, фильтры, окно оплаты,
 * тестовые, строки.
 */
export var reportParams = (
  query: ReportQuery,
  setup: Setup,
  clock: ReportClock,
  days: number = _DEFAULT_DAYS
): ReportParams =>
  ((period) => ({
    period,
    moments: momentsOf(period, clock.zone),
    attribution:
      queryChoice(query.attribution, _ATTRIBUTIONS, 'attribution') ?? 'first',
    group: reportGroup(query.group, setup),
    filters: reportFilters(query.filters, setup),
    window: ((window) =>
      window === null
        ? 30
        : _WINDOWS.includes(window as PaymentWindow)
          ? (window as PaymentWindow)
          : _wrong('The payment window is 7, 30 or 0 — without a limit'))(
      queryWhole(query.window, 'window', 0, 30)
    ),
    test: queryFlag(query.test, 'test'),
    limit: _limit(query.limit),
  }))(
    reportPeriod(query, clock) ??
      ((today) => ({ from: addDays(today, 1 - days), to: today }))(
        dayIn(clock.now, clock.zone)
      )
  );

/** Срок жизни LTV из запроса: 3, 6, 12 месяцев или 0 — всё время, по умолчанию. */
export var queryLife = (raw: unknown): Lifetime =>
  ((life) =>
    life === null
      ? 0
      : LIFETIMES.includes(life as Lifetime)
        ? (life as Lifetime)
        : _wrong('The lifetime is 3, 6 or 12 months, or 0 — the whole time'))(
    queryWhole(raw, 'life', 0, 12)
  );

/** Комиссия из запроса: `gross` — до неё, по умолчанию; `net` — после. */
export var queryFees = (raw: unknown): FeesMode =>
  queryChoice(raw, FEES_MODES, 'fees') ?? 'gross';

/** С чем сравнить период: прошлый той же длины встык или те же дни годом раньше. */
export type CompareKind = 'previous' | 'year';

const _COMPARES: readonly CompareKind[] = ['previous', 'year'];

/** Период сравнения; без параметра и при «всё время» — нет: параметр переносят вкладки, это не ошибка. */
export var comparePeriod = (
  query: ReportQuery,
  period: DayPeriod
): { readonly kind: CompareKind; readonly period: DayPeriod } | null =>
  ((kind) =>
    kind === null || queryFlag(query.all, 'all')
      ? null
      : {
          kind,
          period:
            kind === 'previous' ? previousPeriod(period) : yearBefore(period),
        })(queryChoice(query.compare, _COMPARES, 'compare'));

/** Основа когорт: по умолчанию — по первой оплате, если у сайта есть роль «оплата», иначе по приходу. */
export var queryBasis = (raw: unknown, payment: boolean): CohortBasis =>
  ((basis) =>
    basis === 'payment' && !payment
      ? _wrong(
          'Cohorts by the first payment need an event type with the role payment: use basis arrival'
        )
      : basis)(
    queryChoice(raw, COHORT_BASES, 'basis') ?? (payment ? 'payment' : 'arrival')
  );

export var queryMetric = (raw: unknown): CohortMetric =>
  queryChoice(raw, COHORT_METRICS, 'metric') ?? 'cumulative';

/** Месяцы-строки когорт: все месяцы, которых касается период, целиком — моментами UTC пояса; до 121. */
export var cohortMonths = (period: DayPeriod, zone: string): CohortMonth[] =>
  ((months) =>
    months.length > COHORT_LIMITS.months
      ? _wrong(`Cohorts are up to ${COHORT_LIMITS.months} months`)
      : ((starts) =>
          months.map((month) => ({
            month,
            from: starts.get(month) as string,
            to: starts.get(addMonths(month, 1)) as string,
          })))(
          monthStarts([...months, addMonths(months.at(-1) as Month, 1)], zone)
        ))(monthsIn(period));

/** Воронка по коду; не задана — основная (не отмечена ни одна — первая по порядку), в архиве — если других нет. */
export var reportFunnel = (raw: unknown, setup: Setup): Funnel =>
  (_absent(raw)
    ? setup.funnels.toSorted(
        (a, b) =>
          Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
          Number(b.main) - Number(a.main) ||
          a.position - b.position ||
          _byCode(a.code, b.code)
      )[0]
    : setup.funnels.find((_) => _.code === raw)) ??
  fail(
    'analytics.funnel_not_found',
    _absent(raw)
      ? 'The site has no funnel'
      : `There is no funnel ${String(raw)}`
  );

/** Вопрос «Метки и ответа»: справочник ответов; не задан — первый по коду. */
export var reportQuestion = (raw: unknown, setup: Setup): string =>
  _absent(raw)
    ? (firstQuestion(setup) ?? _wrong('The site has no survey question'))
    : _KNOWN.answer(String(raw), setup)
      ? String(raw)
      : _wrong('The question is a survey question of the setup');
