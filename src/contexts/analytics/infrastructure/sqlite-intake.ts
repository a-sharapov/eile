import type { Database } from '../../../platform/database.ts';
import { attempt } from '../../../shared/kernel/errors.ts';
import type { EventOrigin } from '../domain/envelope.ts';
import type {
  ErasedTally,
  IntakeTally,
  RefusalTally,
  SummaryStore,
} from '../domain/ports.ts';
import {
  type ErasedDay,
  type IntakeDay,
  sumIntake,
  type TallyOutcome,
} from '../domain/tally.ts';

type IntakeRow = {
  readonly day: string;
  readonly sender: string;
  readonly origin: string;
  readonly outcome: string;
  readonly count: number;
};

export var defineIntakeTally = (db: Database): IntakeTally => {
  const add = db.query<unknown, [string, string, string, string, number]>(`
    INSERT INTO analytics_intake_daily (day, sender, origin, outcome, count) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (day, sender, origin, outcome) DO UPDATE SET count = count + excluded.count`);
  const daily = db.query<IntakeRow, [string, string]>(`
    SELECT day, sender, origin, outcome, count FROM analytics_intake_daily
    WHERE day >= ? AND day <= ? ORDER BY day, sender, origin, outcome`);
  const expire = db.query<unknown, [string]>(
    'DELETE FROM analytics_intake_daily WHERE day < ?'
  );
  return {
    add: (rows) =>
      rows.forEach(
        (_) => void add.run(_.day, _.sender, _.origin, _.outcome, _.count)
      ),
    daily: (from, to) =>
      daily.all(from, to).map((_) => ({
        day: _.day,
        sender: _.sender,
        origin: _.origin as EventOrigin,
        outcome: _.outcome as TallyOutcome,
        count: _.count,
      })),
    expire: (before) => expire.run(before).changes,
  };
};

type ErasedRow = {
  readonly day: string;
  readonly sender: string;
  readonly type: string;
  readonly test: number;
  readonly events: number;
};

// Те же события, что сотрёт EventStore.erase: псевдоним, не позже момента, у тестового удаления — тестовые. По
// индексу (subject, at).
const _ERASING = `FROM analytics_events e
    WHERE e.subject = $subject AND e.at <= $before AND e.at >= $since AND ($test = 0 OR e.test = 1)`;

export var defineErasedTally = (db: Database): ErasedTally => {
  const add = db.query<unknown, [string, string, string, number, number]>(`
    INSERT INTO analytics_erased_daily (day, sender, type, test, events) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (day, sender, type, test) DO UPDATE SET events = events + excluded.events`);
  // Одной записью на сутки, отправителя и тип; события, чей отпечаток уже есть, посчитаны раньше.
  const erasing = db.query<
    unknown,
    { subject: string; before: string; test: number; since: string }
  >(`
    INSERT INTO analytics_erased_daily (day, sender, type, test, events)
    SELECT substr(e.at, 1, 10), e.sender, e.type, e.test, count(*) ${_ERASING}
      AND NOT EXISTS (SELECT 1 FROM analytics_erased_events x WHERE x.sender = e.sender AND x.hash = e.hash)
    GROUP BY substr(e.at, 1, 10), e.sender, e.type, e.test
    ON CONFLICT (day, sender, type, test) DO UPDATE SET events = events + excluded.events`);
  const fingerprints = db.query<
    unknown,
    { subject: string; before: string; test: number; since: string }
  >(`
    INSERT OR IGNORE INTO analytics_erased_events (sender, hash, day)
    SELECT e.sender, e.hash, substr(e.at, 1, 10) ${_ERASING}`);
  const fingerprint = db.query<unknown, [string, string, string]>(
    'INSERT OR IGNORE INTO analytics_erased_events (sender, hash, day) VALUES (?, ?, ?)'
  );
  const daily = db.query<ErasedRow, [string, string]>(`
    SELECT day, sender, type, test, events FROM analytics_erased_daily
    WHERE day >= ? AND day <= ? ORDER BY day, sender, type, test`);
  const expire = db.query<unknown, [string]>(
    'DELETE FROM analytics_erased_daily WHERE day < ?'
  );
  const forget = db.query<unknown, [string]>(
    'DELETE FROM analytics_erased_events WHERE day < ?'
  );
  const write = (rows: readonly ErasedDay[]): void =>
    rows.forEach(
      (_) => void add.run(_.day, _.sender, _.type, Number(_.test), _.events)
    );
  return {
    add: write,
    erasing: (subject, before, test, since) =>
      ((params) => void (erasing.run(params), fingerprints.run(params)))({
        subject,
        before,
        test: Number(test),
        since,
      }),
    once: (row, hash) =>
      void (
        fingerprint.run(row.sender, hash, row.day).changes > 0 && write([row])
      ),
    daily: (from, to) =>
      daily.all(from, to).map((_) => ({
        day: _.day,
        sender: _.sender,
        type: _.type,
        test: _.test === 1,
        events: _.events,
      })),
    expire: (before) => (forget.run(before), expire.run(before).changes),
  };
};

const _log = (error: unknown): void => console.error(error);

/**
 * Счёт отказов — один на процесс, как счётчик статистики: пересборка контекстов его не теряет. Ключей мало
 * (сутки × отправитель × исход), поэтому память не растёт; сбой записи оставляет счёт до следующей попытки.
 */
export var defineRefusalTally = (db: Database): RefusalTally => {
  const tally = defineIntakeTally(db);
  let rows: readonly IntakeDay[] = [];
  const write = db.transaction((pending: readonly IntakeDay[]) =>
    tally.add(pending)
  );
  return {
    add: (row) => void (rows = sumIntake([...rows, row])),
    pending: () => [...rows],
    flush: () =>
      void (
        rows.length > 0 &&
        attempt(() => void (write.immediate(rows), (rows = [])), _log)
      ),
  };
};

type SummaryRow = {
  readonly seq: number;
  readonly at: string;
  readonly received_at: string;
  readonly test: number;
  readonly body: string;
};

export var defineSummaryStore = (db: Database): SummaryStore => {
  const events = db.query<SummaryRow, [string, string, string]>(`
    SELECT seq, at, received_at, test, body FROM analytics_events
    WHERE sender = ? AND type = ? AND at >= ? AND subject IS NULL ORDER BY at, seq`);
  return {
    events: (sender, type, since) =>
      events.all(sender, type, since).map((_) => ({
        sender,
        seq: _.seq,
        at: _.at,
        receivedAt: _.received_at,
        test: _.test === 1,
        body: JSON.parse(_.body) as Readonly<Record<string, unknown>>,
      })),
  };
};
