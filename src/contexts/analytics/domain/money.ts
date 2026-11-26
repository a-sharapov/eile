import {
  domainError,
  isDomainError,
  rethrow,
} from '../../../shared/kernel/errors.ts';
import { addMonths, type Day, dayStart, isDay, monthOf } from './days.ts';
import type { Amounts, FeeEntry, MoneyEntry } from './person.ts';
import type { SetupAuthor, SetupLogDraft } from './setup.ts';

/** Деньги человека из таблицы людей: оплаты и возвраты по времени, комиссии моментом своей оплаты. */
export type PersonMoney = {
  readonly money: readonly MoneyEntry[];
  readonly fees: readonly FeeEntry[];
};

/** Момент курса суммы в валюте. */
export type CurrencyMoment = { readonly currency: string; readonly at: string };

const _byMoment = (a: CurrencyMoment, b: CurrencyMoment): number =>
  a.currency < b.currency
    ? -1
    : a.currency > b.currency
      ? 1
      : a.at < b.at
        ? -1
        : a.at > b.at
          ? 1
          : 0;

// Момент до минуты в общий словарь: первый такой ключ остаётся.
const _moment = (
  all: Map<string, CurrencyMoment>,
  currency: string,
  at: string
): Map<string, CurrencyMoment> =>
  ((minute) =>
    ((key) =>
      all.has(key) ? all : all.set(key, { currency, at: `${minute}:00.000Z` }))(
      `${currency} ${minute}`
    ))(at.slice(0, 16));

/**
 * Моменты курса денег людей до минуты без повторов — граница дня любого пояса на целой минуте: оплаты, возвраты
 * (моментом своей оплаты, без неё — своим), комиссии (моментом оплаты). По валюте, затем по времени. Словарь —
 * один на ответ, без массива на запись: на 4 000 клиентов это треть времени (замер ADR).
 */
export var currencyMomentsOf = (
  ledger: readonly PersonMoney[]
): CurrencyMoment[] =>
  [
    ...ledger
      .reduce(
        (all, person) =>
          person.fees.reduce(
            (inner, _) => _moment(inner, _[1], _[0]),
            person.money.reduce(
              (inner, _) => _moment(inner, _[1], _[3] ?? _[0]),
              all
            )
          ),
        new Map<string, CurrencyMoment>()
      )
      .values(),
  ].toSorted(_byMoment);

// Действующие валюты ISO 4217 по числу знаков после точки; X-коды без минимальной единицы (золото, СДР)
// деньгами не считаются.
const _BY_UNITS: Readonly<Record<number, string>> = {
  0: 'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF',
  2: 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CNY COP COU CRC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD USN UYU UZS VED VES WST XCD XCG YER ZAR ZMW ZWG',
  3: 'BHD IQD JOD KWD LYD OMR TND',
  4: 'CLF UYW',
};

/** Знаков после точки у валюты ISO 4217: EUR — 2, JPY — 0, KWD — 3. */
export var MINOR_UNITS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(_BY_UNITS).flatMap(({ 0: units, 1: codes }) =>
    codes.split(' ').map((_) => [_, Number(units)])
  )
);

/** Больше знаков, чем у любой валюты: так проверяются деньги, валюту которых событие не назвало. */
export var MAX_MINOR_UNITS = 4;

const _DECIMAL = /^(\d{1,15})(?:\.(\d{1,4}))?$/;

export var isCurrency = (raw: unknown): raw is string =>
  typeof raw === 'string' &&
  /^[A-Z]{3}$/.test(raw) &&
  Object.hasOwn(MINOR_UNITS, raw);

// Число JSON — его десятичная запись: 109.5 → "109.5", а 1e21 и 0.30000000000000004 деньгами не станут.
const _decimal = (raw: unknown): RegExpExecArray | null =>
  typeof raw === 'string'
    ? _DECIMAL.exec(raw)
    : typeof raw === 'number' && Number.isFinite(raw)
      ? _DECIMAL.exec(String(raw))
      : null;

const _minor = (raw: unknown, units: number): number | null =>
  ((match) =>
    match === null || (match[2] ?? '').length > units
      ? null
      : ((value) => (Number.isSafeInteger(value) ? value : null))(
          Number(match[1]) * 10 ** units +
            Number((match[2] ?? '').padEnd(units, '0') || '0')
        ))(_decimal(raw));

/**
 * Деньги — строка десятичного числа (`"109.00"`) или число JSON, знаков после точки не больше, чем у валюты;
 * ответ — целое минимальных единиц, null — не деньги в этой валюте.
 */
export var moneyOf = (raw: unknown, currency: string): number | null =>
  _minor(raw, MINOR_UNITS[currency] ?? MAX_MINOR_UNITS);

/**
 * Годится ли значение в деньги: `positive` — больше нуля (сумма), иначе от нуля (комиссия). Валюта не
 * известна (null, уточнение без `currency`) — проверяется только запись, до четырёх знаков после точки.
 */
export var isMoney = (
  raw: unknown,
  currency: string | null,
  positive: boolean
): boolean =>
  ((minor) => minor !== null && (positive ? minor > 0 : minor >= 0))(
    currency === null ? _minor(raw, MAX_MINOR_UNITS) : moneyOf(raw, currency)
  );

/**
 * Курс: с дня `day` (пояс отчётов) одна единица `currency` стоит `rate` единиц `base` — до следующей записи той
 * же пары. Курс — десятичной строкой, как прислали.
 */
export type ExchangeRate = {
  readonly base: string;
  readonly currency: string;
  readonly day: Day;
  readonly rate: string;
  /** Кто внёс или правил последним; null — команда или тест. */
  readonly author: { readonly name: string; readonly agent: boolean } | null;
  readonly updatedAt: string;
};

/** Сумма в базовой валюте: минимальные единицы; суммы без курса — по валютам, в value не вошли. */
export type BaseSum = {
  readonly value: number;
  readonly unpriced: Amounts;
  /** Хоть одна запись переведена по курсу более раннего месяца. */
  readonly staleRate: boolean;
};

/** Проверенный ввод курса. */
export type RateInput = {
  readonly currency: string;
  readonly day: Day;
  readonly rate: string;
};

export var RATE_LIMITS = {
  /** Знаков до точки и после. */
  whole: 9,
  fraction: 10,
  rates: 20_000,
  batch: 100,
  firstDay: '2000-01-01',
} as const;

// Курс внутри отчёта — целое с масштабом 10^10: десять знаков после точки без потерь.
const _SCALE = 10n ** BigInt(RATE_LIMITS.fraction);
const _RATE = /^(\d{1,9})(?:\.(\d{1,10}))?$/;

// Число JSON — его десятичная запись: 0.231 → "0.231", а 1e-7 и 0.30000000000000004 курсом не станут.
const _rateText = (raw: unknown): string | null =>
  typeof raw === 'string'
    ? raw
    : typeof raw === 'number' && Number.isFinite(raw)
      ? String(raw)
      : null;

/** Курс целым с масштабом 10^10; null — не курс: ноль, знак, экспонента, больше 9 знаков до точки или 10 после. */
export var rateValue = (raw: unknown): bigint | null =>
  ((text) =>
    ((match) =>
      match === null
        ? null
        : ((value) => (value > 0n ? value : null))(
            BigInt(match[1] as string) * _SCALE +
              BigInt((match[2] ?? '').padEnd(RATE_LIMITS.fraction, '0'))
          ))(text === null ? null : _RATE.exec(text)))(_rateText(raw));

const _RATE_FIELDS = ['currency', 'day', 'rate'];

const _isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

/** Ошибки ввода по полям: поле → причина; пусто — ввод годен. */
export type InputErrors = Readonly<Record<string, string>>;

const _MAX_LISTED = 10;

/**
 * Отказ с ошибками по полям или путям (`rates[2].rate`): сообщение перечисляет первые десять, `errors` у
 * ошибки — все, как у набора.
 */
export var refuseInput = (
  code: string,
  what: string,
  errors: InputErrors
): never =>
  ((entries) =>
    rethrow(
      Object.assign(
        domainError(
          code,
          `${what}: ${entries
            .slice(0, _MAX_LISTED)
            .map(({ 0: path, 1: message }) =>
              path === '' ? message : `${path} — ${message}`
            )
            .join(
              '; '
            )}${entries.length > _MAX_LISTED ? `; and ${entries.length - _MAX_LISTED} more` : ''}`
        ),
        { errors }
      )
    ))(Object.entries(errors));

/** Ошибки по полям из отказа ввода; у другого отказа — пусто. */
export var inputErrorsOf = (error: unknown): InputErrors =>
  isDomainError(error) && 'errors' in error && _isRecord(error.errors)
    ? (error.errors as InputErrors)
    : {};

const _rateErrors = (
  input: Readonly<Record<string, unknown>>,
  base: string,
  today: Day
): InputErrors => ({
  ...Object.fromEntries(
    Object.keys(input)
      .filter((_) => !_RATE_FIELDS.includes(_))
      .map((_) => [_, 'is not a field of a rate: currency, day, rate'])
  ),
  ...(!isCurrency(input.currency)
    ? { currency: 'is an ISO 4217 code of three capital letters' }
    : input.currency === base
      ? { currency: `is the base currency ${base}: its rate is always 1` }
      : {}),
  ...(!isDay(input.day)
    ? { day: 'is a day YYYY-MM-DD' }
    : input.day < RATE_LIMITS.firstDay || input.day > today
      ? { day: `is from ${RATE_LIMITS.firstDay} to today, ${today}` }
      : {}),
  ...(rateValue(input.rate) === null
    ? {
        rate: `is a decimal above zero: up to ${RATE_LIMITS.whole} digits before the point and ${RATE_LIMITS.fraction} after`,
      }
    : {}),
});

/**
 * Курс из ввода: валюта ISO 4217, не базовая; день от 2000-01-01 до сегодня; курс больше нуля. Курс хранится,
 * как прислали; ошибки — все поля сразу, `analytics.invalid_rate`.
 */
export var parseRate = (raw: unknown, base: string, today: Day): RateInput =>
  _isRecord(raw)
    ? ((errors) =>
        Object.keys(errors).length > 0
          ? refuseInput(
              'analytics.invalid_rate',
              'The rate is not valid',
              errors
            )
          : {
              currency: raw.currency as string,
              day: raw.day as Day,
              rate: _rateText(raw.rate) as string,
            })(_rateErrors(raw, base, today))
    : refuseInput('analytics.invalid_rate', 'The rate is not valid', {
        '': 'a rate is { currency, day, rate }',
      });

/** Курс изменился: другое число, а не другая запись того же числа (`0.23` и `0.2300` — один курс). */
export var sameRate = (a: string, b: string): boolean =>
  rateValue(a) === rateValue(b);

/** Строка журнала настройки о курсе: ключ — `база/валюта/день`, было и стало — запись без автора. */
export var rateLog = (
  action: 'created' | 'changed' | 'removed',
  before: ExchangeRate | null,
  after: ExchangeRate | null,
  author: SetupAuthor | null,
  at: string
): SetupLogDraft =>
  ((record) => ({
    at,
    author,
    item: 'rate',
    key: `${record.base}/${record.currency}/${record.day}`,
    action,
    before: before === null ? null : _withoutAuthor(before),
    after: after === null ? null : _withoutAuthor(after),
  }))((after ?? before) as ExchangeRate);

const _withoutAuthor = ({
  author: _author,
  ...record
}: ExchangeRate): Omit<ExchangeRate, 'author'> => record;

/** Шаг курса: действует с начала своего дня; с начала месяца после своего — «курс прошлого месяца». */
export type RateStep = {
  readonly day: Day;
  readonly rate: string;
  readonly value: bigint;
  /** Начало дня записи в поясе отчётов. */
  readonly from: string;
  /** Начало первого дня следующего месяца: сумма с этого момента переведена по курсу прошлого месяца. */
  readonly staleFrom: string;
};

/** Шаги курсов к базе по валютам, от ранних к поздним: готовятся раз на запрос. */
export type RateSteps = {
  readonly base: string;
  readonly steps: ReadonlyMap<string, readonly RateStep[]>;
};

/**
 * Шаги курсов к базе `base`: по `dayStart` на запись, а не `Intl` на сумму. Курсы к другой базе (остались после
 * её смены) не берутся.
 */
export var rateSteps = (
  rates: readonly Pick<ExchangeRate, 'base' | 'currency' | 'day' | 'rate'>[],
  base: string,
  zone: string
): RateSteps => ({
  base,
  steps: new Map(
    Array.from(
      Map.groupBy(
        rates.filter((_) => _.base === base && _.currency !== base),
        (_) => _.currency
      ),
      ({ 0: currency, 1: records }) => [
        currency,
        records
          .toSorted((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
          .flatMap((_): RateStep[] =>
            ((value) =>
              value === null
                ? []
                : [
                    {
                      day: _.day,
                      rate: _.rate,
                      value,
                      from: dayStart(_.day, zone),
                      staleFrom: dayStart(
                        `${addMonths(monthOf(_.day), 1)}-01`,
                        zone
                      ),
                    },
                  ])(rateValue(_.rate))
          ),
      ]
    )
  ),
});

// Инвариант: steps[low].from <= moment < steps[high].from.
const _latest = (
  steps: readonly RateStep[],
  moment: string,
  low: number,
  high: number
): number =>
  high - low <= 1
    ? low
    : ((middle) =>
        moment < (steps[middle] as RateStep).from
          ? _latest(steps, moment, low, middle)
          : _latest(steps, moment, middle, high))(Math.floor((low + high) / 2));

/** Курс валюты в момент: запись с самым поздним днём, начало которого не позже момента; нет — null. */
export var rateAt = (
  steps: RateSteps,
  currency: string,
  moment: string
): RateStep | null =>
  ((list) =>
    list.length === 0 || moment < (list[0] as RateStep).from
      ? null
      : (list[_latest(list, moment, 0, list.length)] as RateStep))(
    steps.steps.get(currency) ?? []
  );

/** Деление целых с округлением половины от нуля. */
export var divideRound = (numerator: bigint, denominator: bigint): bigint =>
  ((quotient, remainder) =>
    (remainder < 0n ? -remainder : remainder) * 2n >= denominator
      ? quotient + (numerator < 0n ? -1n : 1n)
      : quotient)(numerator / denominator, numerator % denominator);

/**
 * Сумма в минимальных единицах базы: `amount × rate × 10^(units(base) − units(currency))` точной арифметикой
 * целых, половина — от нуля. 19.99 PLN по 0.2310 — 461.769 → 462 цента.
 */
export var toBase = (
  amount: number,
  currency: string,
  base: string,
  rate: bigint
): bigint =>
  ((shift) =>
    divideRound(
      BigInt(amount) * rate * 10n ** BigInt(Math.max(shift, 0)),
      _SCALE * 10n ** BigInt(Math.max(-shift, 0))
    ))(
    (MINOR_UNITS[base] ?? MAX_MINOR_UNITS) -
      (MINOR_UNITS[currency] ?? MAX_MINOR_UNITS)
  );

/** Запись денег к сложению в базовой валюте: `value` null — без курса; `stale` — по курсу прошлого месяца. */
export type Priced = {
  readonly currency: string;
  readonly amount: number;
  readonly value: bigint | null;
  readonly stale: boolean;
};

/** Запись в базовой валюте в момент курса: база к себе — 1, курс назад не распространяется. */
export var priceAt = (
  steps: RateSteps,
  currency: string,
  amount: number,
  moment: string
): Priced =>
  currency === steps.base
    ? { currency, amount, value: BigInt(amount), stale: false }
    : ((step) =>
        step === null
          ? { currency, amount, value: null, stale: false }
          : {
              currency,
              amount,
              value: toBase(amount, currency, steps.base, step.value),
              stale: moment >= step.staleFrom,
            })(rateAt(steps, currency, moment));

const _SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const _unpriced = (entries: readonly Priced[]): Amounts =>
  Object.fromEntries(
    Array.from(
      Map.groupBy(entries, (_) => _.currency),
      (entry) => [entry[0], entry[1].reduce((sum, _) => sum + _.amount, 0)]
    )
  );

/**
 * Сумма в базовой валюте — сумма переведённых записей, а не перевод суммы; записи без курса — по валютам в
 * `unpriced`. Итог, который не помещается в целое JSON без потерь (больше 2^53 − 1 минимальных единиц, для евро —
 * 90 трлн), в число не идёт: его записи остаются по валютам в `unpriced`.
 */
export var baseSum = (entries: readonly Priced[]): BaseSum =>
  ((priced) =>
    ((total) =>
      total > _SAFE || total < -_SAFE
        ? { value: 0, unpriced: _unpriced(entries), staleRate: false }
        : {
            value: Number(total),
            unpriced: _unpriced(entries.filter((_) => _.value === null)),
            staleRate: priced.some((_) => _.stale),
          })(priced.reduce((sum, _) => sum + (_.value as bigint), 0n)))(
    entries.filter((_) => _.value !== null)
  );
