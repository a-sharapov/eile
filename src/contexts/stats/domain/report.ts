import { fail } from '../../../shared/kernel/errors.ts';
import type { Dimension, GoalDimension } from './tally.ts';
import { addDays, type Day, daysBetween, isDay } from './visit.ts';

/** Период отчёта: дни включительно. */
export type Period = { readonly from: Day; readonly to: Day };

/** Запрос отчёта: последние `days` дней или свои `from`–`to`; `limit` — строк в каждом разрезе. */
export type ReportQuery = {
  readonly days?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly limit?: unknown;
};

export type Totals = { readonly visitors: number; readonly views: number };

/** Строка разреза за период: сумма по дням. */
export type Row = Totals & { readonly value: string };

export type DailyRow = Totals & { readonly day: Day };

export type GoalRow = {
  readonly goal: string;
  readonly dimension: GoalDimension;
  readonly value: string;
  readonly visitors: number;
  readonly events: number;
};

/** Цель в разрезе: сколько посетителей с этим значением достигли её из скольких. */
export type GoalSlice = {
  readonly value: string;
  readonly visitors: number;
  readonly events: number;
  /** Посетителей с этим источником или входом за период. */
  readonly base: number;
  /** Доля достигших цели, 0…1. */
  readonly rate: number;
};

export type GoalReport = {
  readonly goal: string;
  readonly kind: 'form' | 'link';
  /** Имя формы или начало адреса ссылки. */
  readonly name: string;
  /** Название для человека: заголовок формы или адрес ссылки. */
  readonly label: string;
  readonly visitors: number;
  readonly events: number;
  readonly rate: number;
  readonly sources: readonly GoalSlice[];
  readonly entries: readonly GoalSlice[];
};

export type StatsReport = Period & {
  readonly today: Day;
  /** Первый день, за который есть данные; null — данных ещё нет. */
  readonly since: Day | null;
  readonly enabled: boolean;
  readonly totals: Totals;
  /** Тот же срок перед периодом — для сравнения. */
  readonly previous: Totals;
  readonly daily: readonly DailyRow[];
  readonly pages: readonly Row[];
  readonly languages: readonly Row[];
  readonly sources: readonly Row[];
  readonly referrers: readonly Row[];
  readonly utmSources: readonly Row[];
  readonly utmMediums: readonly Row[];
  readonly utmCampaigns: readonly Row[];
  readonly entries: readonly Row[];
  readonly devices: readonly Row[];
  readonly browserLanguages: readonly Row[];
  readonly goals: readonly GoalReport[];
};

/** Отчёт — не длиннее года и одного високосного дня. */
export var MAX_PERIOD_DAYS = 366;
const _DEFAULT_DAYS = 30;
const _DEFAULT_LIMIT = 20;

const _invalid = (message: string): never =>
  fail('stats.invalid_period', message);

const _days = (raw: unknown): number =>
  ((days) =>
    Number.isInteger(days) && days >= 1 && days <= MAX_PERIOD_DAYS
      ? days
      : _invalid(`Days are 1 to ${MAX_PERIOD_DAYS}, not "${String(raw)}"`))(
    raw === undefined || raw === '' ? _DEFAULT_DAYS : Number(raw)
  );

const _custom = (from: string, to: string, today: Day): Period =>
  !isDay(from) || !isDay(to)
    ? _invalid(`"${from}" … "${to}" are not days like 2026-11-03`)
    : from > to
      ? _invalid('The period starts after it ends')
      : daysBetween(from, to) > MAX_PERIOD_DAYS
        ? _invalid(`The period is longer than ${MAX_PERIOD_DAYS} days`)
        : { from, to: to > today ? today : to };

/** Период из запроса: свои даты важнее числа дней; конец не позже сегодня. */
export var periodOf = (query: ReportQuery, today: Day): Period =>
  query.from !== undefined || query.to !== undefined
    ? _custom(String(query.from ?? ''), String(query.to ?? today), today)
    : ((days) => ({ from: addDays(today, 1 - days), to: today }))(
        _days(query.days)
      );

/** Тот же срок сразу перед периодом. */
export var previousOf = ({ from, to }: Period): Period => ({
  from: addDays(from, -daysBetween(from, to)),
  to: addDays(from, -1),
});

export var limitOf = (raw: unknown): number =>
  ((limit) =>
    Number.isInteger(limit) && limit >= 1 && limit <= 100
      ? limit
      : _DEFAULT_LIMIT)(raw === undefined ? _DEFAULT_LIMIT : Number(raw));

/** Каждый день периода, дни без данных — нулями: на графике нет пропусков. */
export var dailyOf = (period: Period, rows: readonly DailyRow[]): DailyRow[] =>
  ((known) =>
    Array.from({ length: daysBetween(period.from, period.to) }, (_, n) =>
      ((day) => known.get(day) ?? { day, visitors: 0, views: 0 })(
        addDays(period.from, n)
      )
    ))(new Map(rows.map((_) => [_.day, _])));

/** Разрез посещения — по посетителям, разрез страницы — по просмотрам; потом по значению. */
export var topOf = (
  rows: readonly Row[],
  by: 'visitors' | 'views',
  limit: number
): Row[] =>
  rows
    .toSorted(
      (a, b) =>
        b[by] - a[by] || b.views - a.views || a.value.localeCompare(b.value)
    )
    .slice(0, limit);

const _rate = (part: number, base: number): number =>
  base > 0 ? Math.min(1, part / base) : 0;

const _slices = (
  rows: readonly GoalRow[],
  bases: ReadonlyMap<string, number>,
  limit: number
): GoalSlice[] =>
  rows
    .map((_) =>
      ((base) => ({
        value: _.value,
        visitors: _.visitors,
        events: _.events,
        base,
        rate: _rate(_.visitors, base),
      }))(bases.get(_.value) ?? 0)
    )
    .toSorted(
      (a, b) =>
        b.visitors - a.visitors ||
        b.events - a.events ||
        a.value.localeCompare(b.value)
    )
    .slice(0, limit);

/**
 * Цели периода с долей достигших: от всех посетителей, по источнику и по странице входа. `bases` —
 * посетители периода по значениям разрезов `source` и `entry`.
 */
export var goalsOf = (
  rows: readonly GoalRow[],
  visitors: number,
  bases: Readonly<Record<'source' | 'entry', ReadonlyMap<string, number>>>,
  label: (goal: string) => string,
  limit: number
): GoalReport[] =>
  [...new Set(rows.map((_) => _.goal))]
    .map((goal) => {
      const own = rows.filter((_) => _.goal === goal);
      const total = own.find((_) => _.dimension === 'total');
      const kind = goal.startsWith('form:') ? 'form' : 'link';
      return {
        goal,
        kind,
        name: goal.slice(goal.indexOf(':') + 1),
        label: label(goal),
        visitors: total?.visitors ?? 0,
        events: total?.events ?? 0,
        rate: _rate(total?.visitors ?? 0, visitors),
        sources: _slices(
          own.filter((_) => _.dimension === 'source'),
          bases.source,
          limit
        ),
        entries: _slices(
          own.filter((_) => _.dimension === 'entry'),
          bases.entry,
          limit
        ),
      } satisfies GoalReport;
    })
    .toSorted(
      (a, b) => b.visitors - a.visitors || a.goal.localeCompare(b.goal)
    );

/** Разрезы отчёта и поле ответа для каждого. */
export var REPORT_DIMENSIONS = {
  pages: 'page',
  languages: 'language',
  sources: 'source',
  referrers: 'referrer',
  utmSources: 'utm_source',
  utmMediums: 'utm_medium',
  utmCampaigns: 'utm_campaign',
  entries: 'entry',
  devices: 'device',
  browserLanguages: 'browser_language',
} as const satisfies Readonly<Record<string, Dimension>>;
