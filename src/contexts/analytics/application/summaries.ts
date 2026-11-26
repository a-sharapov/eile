import { fail } from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS } from '../domain/codes.ts';
import { addDays, type Day, type DayPeriod } from '../domain/days.ts';
import type { SummaryStore } from '../domain/ports.ts';
import type { Setup } from '../domain/setup.ts';
import {
  latestSummaries,
  type SummaryDay,
  type VersionMark,
  versionMarks,
} from '../domain/summary.ts';
import { TALLY_LIMITS } from '../domain/tally.ts';
import { queryCode, queryFlag, type UtcQuery, utcPeriod } from './query.ts';

/** Сводки отправителей: сутки UTC, отправитель (не задан — все), тестовые — вместе с настоящими. */
export type SummariesQuery = UtcQuery & {
  readonly sender?: unknown;
  readonly test?: unknown;
};

/** Сводки по суткам и смены версий за эти сутки UTC; смены — только по настоящим сводкам. */
export type SummariesReport = {
  readonly from: Day;
  readonly to: Day;
  readonly summaries: readonly SummaryDay[];
  readonly versions: readonly VersionMark[];
};

// Сводки до начала периода: первая версия периода сравнивается с прежней — не дальше срока счёта приёма.
const _LOOKBACK_DAYS = TALLY_LIMITS.intakeDays;

const _within = (day: Day, period: DayPeriod): boolean =>
  day >= period.from && day <= period.to;

/**
 * Сводки отправителей без своей таблицы: события типов с ролью «сводка», запрос на тип, последняя за сутки —
 * `latestSummaries`, смены версий — `versionMarks`; `matched` — сошёлся ли счёт по строкам дня проверок.
 */
export var defineSummaries = ({
  store,
  setup,
  clock,
  matched = () => () => null,
}: {
  readonly store: SummaryStore;
  readonly setup: () => Setup;
  readonly clock: () => Date;
  /** Итог «События дошли» и «Выручка сходится» за сутки отправителя по строкам дней периода. */
  readonly matched?: (
    period: DayPeriod
  ) => (sender: string, day: Day) => boolean | null;
}) => {
  const read = (
    snapshot: Setup,
    sender: string | null,
    from: Day
  ): SummaryDay[] =>
    ((since) =>
      latestSummaries(
        snapshot.types
          .filter(
            (_) =>
              _.role === 'summary' && (sender === null || _.sender === sender)
          )
          .flatMap((_) => store.events(_.sender, _.code, since))
      ))(`${addDays(from, -_LOOKBACK_DAYS)}T00:00:00.000Z`);

  const marks = (
    snapshot: Setup,
    summaries: readonly SummaryDay[],
    period: DayPeriod
  ): VersionMark[] =>
    versionMarks(
      summaries,
      (code) => snapshot.senders.find((_) => _.code === code)?.name ?? code,
      matched(period)
    ).filter((_) => _within(_.day, period));

  const senderOf = (raw: unknown, snapshot: Setup): string | null =>
    ((code) =>
      code === null || snapshot.senders.some((_) => _.code === code)
        ? code
        : fail(
            'analytics.invalid_query',
            'The sender filter is a sender of the setup'
          ))(queryCode(raw, CODE_LIMITS.sender, 'sender'));

  return {
    /** Сводки за сутки UTC (до 400) и смены версий в них; `test` — и тестовые сводки. */
    list: (query: SummariesQuery = {}): SummariesReport =>
      ((period, snapshot, test) =>
        ((sender) =>
          ((summaries) => ({
            from: period.from,
            to: period.to,
            summaries: summaries.filter(
              (_) => _within(_.day, period) && (test || !_.test)
            ),
            versions: marks(snapshot, summaries, period),
          }))(read(snapshot, sender, period.from)))(
          senderOf(query.sender, snapshot)
        ))(
        utcPeriod(query, clock().toISOString(), TALLY_LIMITS.intakeDays),
        setup(),
        queryFlag(query.test, 'test')
      ),
    /** Смены версий всех отправителей с сутками сводки в периоде: отметки графика «Обзора». */
    versions: (period: DayPeriod): VersionMark[] =>
      ((snapshot) =>
        marks(snapshot, read(snapshot, null, period.from), period))(setup()),
  };
};

export type Summaries = ReturnType<typeof defineSummaries>;
