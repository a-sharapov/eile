import type { DailyRow, GoalRow, Period, Row, Totals } from './report.ts';
import type { StatsSettings } from './settings.ts';
import type { Dimension } from './tally.ts';
import type { Day, Visit } from './visit.ts';

export type StatsSettingsRepository = {
  readonly get: () => StatsSettings;
  readonly save: (settings: StatsSettings) => void;
};

/** Сводки по дням для отчёта: суммы за период. */
export type StatsReader = {
  readonly daily: (period: Period) => DailyRow[];
  readonly totals: (period: Period) => Totals;
  readonly sums: (dimension: Dimension, period: Period) => Row[];
  readonly goals: (period: Period) => GoalRow[];
  /** Первый день со сводкой; null — сводок нет. */
  readonly since: () => Day | null;
};

/** Просмотренная страница: путь и язык. */
export type ViewedPage = { readonly path: string; readonly language: string };

/**
 * Счётчик процесса: соль дня, хэш посетителя и буфер прибавок в памяти. Один на процесс: пересборка
 * контекстов (чужая запись в базу, восстановление копии) не меняет соль и не теряет буфер.
 */
export type Recorder = {
  readonly configure: (settings: StatsSettings) => void;
  /** Просмотр; `visit` нужен только новому за день посетителю. */
  readonly view: (
    client: string,
    userAgent: string,
    visit: () => Visit,
    page: ViewedPage
  ) => void;
  /** Цель посетителя дня; false — посетителя сегодня не было или повторов слишком много. */
  readonly goal: (client: string, userAgent: string, goal: string) => boolean;
  /** Записать буфер в базу. */
  readonly flush: () => void;
  readonly today: () => Day;
};
