import type { Database } from '../../../platform/database.ts';
import type { StatsReader, StatsSettingsRepository } from '../domain/ports.ts';
import type { DailyRow, GoalRow, Row, Totals } from '../domain/report.ts';
import {
  DEFAULT_STATS_SETTINGS,
  type StatsSettings,
} from '../domain/settings.ts';
import type { GoalIncrement, Increment, Visitor } from '../domain/tally.ts';
import type { Day } from '../domain/visit.ts';

// Настройки читаются на каждом просмотре: в памяти, база — при сохранении и при сборке контекстов.
export var defineStatsSettingsRepository = (
  db: Database
): StatsSettingsRepository => {
  const read = db.query<{ value: string }, []>(
    'SELECT value FROM stats_settings WHERE id = 1'
  );
  const write = db.query(`
    INSERT INTO stats_settings (id, value, updated_at) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  let cached: StatsSettings | null = null;
  return {
    get: () =>
      cached ??
      (cached = ((row) =>
        row
          ? {
              ...DEFAULT_STATS_SETTINGS,
              ...(JSON.parse(row.value) as Partial<StatsSettings>),
            }
          : DEFAULT_STATS_SETTINGS)(read.get())),
    save: (settings) => (
      write.run(JSON.stringify(settings), new Date().toISOString()),
      void (cached = settings)
    ),
  };
};

export var defineStatsReader = (db: Database): StatsReader => {
  const daily = db.query<DailyRow, [Day, Day]>(`
    SELECT day, visitors, views FROM stats_daily
    WHERE dimension = 'total' AND day BETWEEN ? AND ? ORDER BY day`);
  const totals = db.query<Totals, [Day, Day]>(`
    SELECT coalesce(sum(visitors), 0) AS visitors, coalesce(sum(views), 0) AS views
    FROM stats_daily WHERE dimension = 'total' AND day BETWEEN ? AND ?`);
  const sums = db.query<Row, [string, Day, Day]>(`
    SELECT value, sum(visitors) AS visitors, sum(views) AS views FROM stats_daily
    WHERE dimension = ? AND day BETWEEN ? AND ? GROUP BY value`);
  const goals = db.query<GoalRow, [Day, Day]>(`
    SELECT goal, dimension, value, sum(visitors) AS visitors, sum(events) AS events
    FROM stats_goals WHERE day BETWEEN ? AND ? GROUP BY goal, dimension, value`);
  const since = db.query<{ day: Day | null }, []>(
    "SELECT min(day) AS day FROM stats_daily WHERE dimension = 'total'"
  );
  return {
    daily: ({ from, to }) => daily.all(from, to),
    totals: ({ from, to }) => totals.get(from, to)!,
    sums: (dimension, { from, to }) => sums.all(dimension, from, to),
    goals: ({ from, to }) => goals.all(from, to),
    since: () => since.get()?.day ?? null,
  };
};

/** Запись счётчика: сводки дня прибавками, посетители дня, уборка. */
export type StatsStore = {
  readonly visitor: (day: Day, id: string) => Visitor | null;
  /** Прибавки и посетители одного дня — одной транзакцией. */
  readonly write: (
    day: Day,
    traffic: readonly Increment[],
    goals: readonly GoalIncrement[],
    visitors: readonly (readonly [string, Visitor])[]
  ) => void;
  /** Забыть посетителей: их хэши без соли дня ничего не значат. */
  readonly forgetVisitors: () => void;
  /** Удалить сводки раньше дня. */
  readonly purgeBefore: (day: Day) => void;
};

export var defineStatsStore = (db: Database): StatsStore => {
  const visitor = db.query<{ visit: string }, [Day, string]>(
    'SELECT visit FROM stats_visitors WHERE day = ? AND id = ?'
  );
  const traffic = db.query<unknown, [Day, string, string, number, number]>(`
    INSERT INTO stats_daily (day, dimension, value, visitors, views) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (day, dimension, value) DO UPDATE SET
      visitors = visitors + excluded.visitors, views = views + excluded.views`);
  const goal = db.query<
    unknown,
    [Day, string, string, string, number, number]
  >(`
    INSERT INTO stats_goals (day, goal, dimension, value, visitors, events) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (day, goal, dimension, value) DO UPDATE SET
      visitors = visitors + excluded.visitors, events = events + excluded.events`);
  const remember = db.query<unknown, [Day, string, string]>(`
    INSERT INTO stats_visitors (day, id, visit) VALUES (?, ?, ?)
    ON CONFLICT (day, id) DO UPDATE SET visit = excluded.visit`);
  const forget = db.query('DELETE FROM stats_visitors');
  const purgeDaily = db.query<unknown, [Day]>(
    'DELETE FROM stats_daily WHERE day < ?'
  );
  const purgeGoals = db.query<unknown, [Day]>(
    'DELETE FROM stats_goals WHERE day < ?'
  );
  const write = db.transaction(
    (
      day: Day,
      increments: readonly Increment[],
      goals: readonly GoalIncrement[],
      visitors: readonly (readonly [string, Visitor])[]
    ) => {
      increments.forEach(
        (_) => void traffic.run(day, _.dimension, _.value, _.visitors, _.views)
      );
      goals.forEach(
        (_) =>
          void goal.run(day, _.goal, _.dimension, _.value, _.visitors, _.events)
      );
      visitors.forEach(
        ({ 0: id, 1: _ }) => void remember.run(day, id, JSON.stringify(_))
      );
    }
  );
  return {
    visitor: (day, id) =>
      ((row) => (row ? (JSON.parse(row.visit) as Visitor) : null))(
        visitor.get(day, id)
      ),
    write: (day, increments, goals, visitors) =>
      void write(day, increments, goals, visitors),
    forgetVisitors: () => void forget.run(),
    purgeBefore: (day) => void (purgeDaily.run(day), purgeGoals.run(day)),
  };
};
