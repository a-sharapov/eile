/** День `ГГГГ-ММ-ДД` в поясе отчётов. */
export type Day = string;

/** Календарный месяц `ГГГГ-ММ` в поясе отчётов. */
export type Month = string;

/** Дни отчёта включительно, в поясе отчётов. */
export type DayPeriod = { readonly from: Day; readonly to: Day };

const _DAY_MS = 86_400_000;
const _DAY = /^\d{4}-\d{2}-\d{2}$/;
const _MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;

// Пояс → форматы: Intl.DateTimeFormat дорог в создании, а пояс у сайта один. Пустой пояс — пояс сервера.
const _CLOCKS = new Map<string, Intl.DateTimeFormat>();
const _DATES = new Map<string, Intl.DateTimeFormat>();

const _cached = (
  cache: Map<string, Intl.DateTimeFormat>,
  zone: string,
  make: () => Intl.DateTimeFormat
): Intl.DateTimeFormat =>
  cache.get(zone) ?? ((format) => (cache.set(zone, format), format))(make());

const _clock = (zone: string): Intl.DateTimeFormat =>
  _cached(
    _CLOCKS,
    zone,
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone || undefined,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
  );

// en-CA пишет дату как ISO: 2026-11-03.
const _date = (zone: string): Intl.DateTimeFormat =>
  _cached(
    _DATES,
    zone,
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone || undefined,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
  );

const _part = (parts: readonly Intl.DateTimeFormatPart[], type: string) =>
  Number(parts.find((_) => _.type === type)?.value ?? 0);

/** Смещение пояса в момент `ms`: местные часы минус UTC, в миллисекундах. */
const _offset = (ms: number, zone: string): number =>
  ((parts) =>
    Date.UTC(
      _part(parts, 'year'),
      _part(parts, 'month') - 1,
      _part(parts, 'day'),
      _part(parts, 'hour'),
      _part(parts, 'minute'),
      _part(parts, 'second')
    ) -
    (ms - (((ms % 1000) + 1000) % 1000)))(_clock(zone).formatToParts(ms));

/**
 * Местная полночь: смещение угадывается (у соседнего дня оно почти всегда то же) и проверяется в найденном
 * моменте; не совпало — переход времени, второй шаг берёт смещение после него. Ответ — момент и его смещение.
 */
const _midnight = (
  day: Day,
  zone: string,
  guess: number
): readonly [ms: number, offset: number] =>
  ((wall) =>
    ((first) =>
      first === guess
        ? ([wall - guess, guess] as const)
        : ([wall - first, _offset(wall - first, zone)] as const))(
      _offset(wall - guess, zone)
    ))(Date.parse(`${day}T00:00:00Z`));

export var isDay = (raw: unknown): raw is Day =>
  typeof raw === 'string' &&
  _DAY.test(raw) &&
  !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) &&
  new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) === raw;

/** День через `n` дней: `addDays('2026-11-03', -6)` → `2026-10-28`. */
export var addDays = (day: Day, n: number): Day =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * _DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Дней от `from` до `to` включительно. */
export var daysBetween = (from: Day, to: Day): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / _DAY_MS
  ) + 1;

/** День момента (ISO 8601) в поясе. */
export var dayIn = (moment: string, zone: string): Day =>
  _date(zone).format(Date.parse(moment));

/**
 * Начало дня `day` в поясе — момент UTC с миллисекундами: в Europe/Berlin 2026-10-01 начинается в
 * `2026-09-30T22:00:00.000Z`, а 25 октября 2026 длится 25 часов.
 */
export var dayStart = (day: Day, zone: string): string =>
  new Date(
    _midnight(day, zone, _offset(Date.parse(`${day}T12:00:00Z`), zone))[0]
  ).toISOString();

type _Midnight = readonly [ms: number, offset: number];

// Месяц дней от смещения предыдущего месяца: копия накопленного — не длиннее месяца.
const _month = (
  days: readonly Day[],
  zone: string,
  offset: number | null
): readonly _Midnight[] =>
  days.reduce<readonly _Midnight[]>(
    (bounds, day) => [
      ...bounds,
      _midnight(
        day,
        zone,
        bounds.at(-1)?.[1] ??
          offset ??
          _offset(Date.parse(`${day}T12:00:00Z`), zone)
      ),
    ],
    []
  );

/**
 * Границы дней периода: начало каждого дня и начало дня после последнего — моментами UTC. Intl зовётся по
 * разу на день: смещение соседнего дня — первая догадка.
 */
export var dayBounds = (period: DayPeriod, zone: string): string[] =>
  Array.from(
    Map.groupBy(
      Array.from({ length: daysBetween(period.from, period.to) + 1 }, (_, n) =>
        addDays(period.from, n)
      ),
      (_) => _.slice(0, 7)
    ).values()
  )
    .reduce<readonly (readonly _Midnight[])[]>(
      (months, days) => [
        ...months,
        _month(days, zone, months.at(-1)?.at(-1)?.[1] ?? null),
      ],
      []
    )
    .flat()
    .map((_) => new Date(_[0]).toISOString());

export var isMonth = (raw: unknown): raw is Month =>
  typeof raw === 'string' && _MONTH.test(raw);

/** Месяц дня: `2026-10-31` → `2026-10`. */
export var monthOf = (day: Day): Month => day.slice(0, 7);

const _pad = (value: number, length: number): string =>
  String(value).padStart(length, '0');

const _monthIndex = (month: Month): number =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

/** Месяц через `n` месяцев: `addMonths('2026-01', -1)` → `2025-12`. */
export var addMonths = (month: Month, n: number): Month =>
  ((index) =>
    `${_pad(Math.floor(index / 12), 4)}-${_pad((index % 12) + 1, 2)}`)(
    _monthIndex(month) + n
  );

/** Месяцев от `from` до `to` включительно; `to` раньше — ноль. */
export var monthsBetween = (from: Month, to: Month): number =>
  Math.max(_monthIndex(to) - _monthIndex(from) + 1, 0);

/** Дней в месяце: в феврале 2028 — 29. */
export var monthDays = (month: Month): number =>
  new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  ).getUTCDate();

/** Первый и последний день месяца. */
export var monthPeriod = (month: Month): DayPeriod => ({
  from: `${month}-01`,
  to: `${month}-${_pad(monthDays(month), 2)}`,
});

/** Месяцы, которых касается период, от старых к новым. */
export var monthsIn = (period: DayPeriod): Month[] =>
  Array.from(
    { length: monthsBetween(monthOf(period.from), monthOf(period.to)) },
    (_, n) => addMonths(monthOf(period.from), n)
  );

/** Сколько дней периода приходится на месяц; месяц вне периода — ноль. */
export var periodDays = (period: DayPeriod, month: Month): number =>
  // Пересечение двух отрезков — самый короткий из отрезков «начало одного — конец другого».
  ((days) =>
    Math.max(
      Math.min(
        daysBetween(days.from, days.to),
        daysBetween(period.from, days.to),
        daysBetween(days.from, period.to),
        daysBetween(period.from, period.to)
      ),
      0
    ))(monthPeriod(month));

/**
 * Тот же момент по UTC через `n` календарных месяцев (назад — с минусом); такого числа в том месяце нет —
 * последний день месяца: `2026-01-31T10:00Z` + 1 = `2026-02-28T10:00Z`. Так же считается граница срока хранения.
 */
export var shiftMonths = (moment: string, n: number): string =>
  ((date) =>
    ((index) =>
      ((year, month) =>
        new Date(
          Date.UTC(
            year,
            month,
            Math.min(
              date.getUTCDate(),
              new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
            ),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds()
          )
        ).toISOString())(Math.floor(index / 12), ((index % 12) + 12) % 12))(
      date.getUTCFullYear() * 12 + date.getUTCMonth() + n
    ))(new Date(moment));

// Номер месяца момента ISO 8601 по UTC: год × 12 + месяц с нуля, без разбора даты.
const _utcMonth = (moment: string): number =>
  Number(moment.slice(0, 4)) * 12 + Number(moment.slice(5, 7)) - 1;

// Полная запись `toISOString`: `ГГГГ-ММ-ДДTЧЧ:ММ:СС.мммZ`.
const _ISO_LENGTH = 24;

/**
 * Месяц жизни момента `at` от начала `start` (оба — UTC ISO 8601): k, при котором `shiftMonths(start, k)` ≤ `at` <
 * `shiftMonths(start, k + 1)`; раньше начала — −1. Число месяца начала до 28-го есть в любом месяце: тогда граница —
 * те же день и время в месяце момента, и сравниваются строки; иначе — `shiftMonths` (последний день месяца).
 */
export var lifeMonth = (start: string, at: string): number =>
  at < start
    ? -1
    : ((months) =>
        (
          start.length === _ISO_LENGTH &&
          at.length === _ISO_LENGTH &&
          start.slice(8, 10) <= '28'
            ? at.slice(7) < start.slice(7)
            : at < shiftMonths(start, months)
        )
          ? months - 1
          : months)(_utcMonth(at) - _utcMonth(start));

/** Начало первого дня каждого месяца в поясе — моментом UTC; по разу на месяц. */
export var monthStarts = (
  months: readonly Month[],
  zone: string
): ReadonlyMap<Month, string> =>
  new Map([...new Set(months)].map((_) => [_, dayStart(`${_}-01`, zone)]));

/** Прошлый период той же длины встык: 1–30 сентября → 2–31 августа. */
export var previousPeriod = (period: DayPeriod): DayPeriod =>
  ((length) => ({
    from: addDays(period.from, -length),
    to: addDays(period.from, -1),
  }))(daysBetween(period.from, period.to));

// День годом раньше; 29 февраля невисокосного года нет — 28-е.
const _yearBefore = (day: Day): Day =>
  ((month) =>
    `${month}-${_pad(Math.min(Number(day.slice(8, 10)), monthDays(month)), 2)}`)(
    addMonths(monthOf(day), -12)
  );

/** Те же дни годом раньше: 29 февраля → 28-е. */
export var yearBefore = (period: DayPeriod): DayPeriod => ({
  from: _yearBefore(period.from),
  to: _yearBefore(period.to),
});

/** Номер дня периода, в который попал момент: поиск делением пополам по границам; вне периода — -1. */
export var dayIndex = (bounds: readonly string[], moment: string): number =>
  moment < (bounds[0] ?? '') || moment >= (bounds.at(-1) ?? '')
    ? -1
    : _search(bounds, moment, 0, bounds.length - 1);

// Инвариант: bounds[low] <= moment < bounds[high].
const _search = (
  bounds: readonly string[],
  moment: string,
  low: number,
  high: number
): number =>
  high - low <= 1
    ? low
    : ((middle) =>
        moment < (bounds[middle] as string)
          ? _search(bounds, moment, low, middle)
          : _search(bounds, moment, middle, high))(
        Math.floor((low + high) / 2)
      );
