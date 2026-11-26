import type { Database } from '../../../platform/database.ts';
import type { QualityStore } from '../domain/ports.ts';
import type {
  CheckDay,
  CheckKey,
  CheckState,
  DayEvent,
} from '../domain/quality.ts';
import type { SetupLogItem } from '../domain/setup.ts';

type DayRow = {
  readonly check_code: string;
  readonly scope: string;
  readonly test: number;
  readonly day: string;
  readonly state: string;
  readonly reason: string | null;
  readonly value: number | null;
  readonly detail: string;
  readonly version: string | null;
  readonly evaluated_at: string;
  readonly resolved_at: string | null;
  readonly resolved_by: string | null;
  readonly resolved_agent: number;
  readonly resolution: string | null;
  readonly notified_at: string | null;
  readonly episode: string | null;
  readonly recovered_at: string | null;
};

type KeyParams = {
  readonly check: string;
  readonly scope: string;
  readonly test: number;
  readonly day: string;
};

const _COLUMNS = `check_code, scope, test, day, state, reason, value, detail, version, evaluated_at, resolved_at,
  resolved_by, resolved_agent, resolution, notified_at, episode, recovered_at`;

const _WHERE_KEY =
  'check_code = $check AND scope = $scope AND test = $test AND day = $day';

const _key = (key: CheckKey): KeyParams => ({
  check: key.check,
  scope: key.scope,
  test: Number(key.test),
  day: key.day,
});

const _rowOf = (_: DayRow): CheckDay => ({
  check: _.check_code,
  scope: _.scope,
  test: _.test === 1,
  day: _.day,
  state: _.state as CheckState,
  reason: _.reason,
  value: _.value,
  detail: JSON.parse(_.detail) as Record<string, unknown>,
  version: _.version,
  evaluatedAt: _.evaluated_at,
  resolution:
    _.resolved_at === null
      ? null
      : {
          at: _.resolved_at,
          by: _.resolved_by ?? '',
          agent: _.resolved_agent === 1,
          note: _.resolution ?? '',
        },
  notifiedAt: _.notified_at,
  episode: _.episode,
  recoveredAt: _.recovered_at,
});

type EventRow = {
  readonly seq: number;
  readonly sender: string;
  readonly type: string;
  readonly subject: string | null;
  readonly test: number;
  readonly at: string;
  readonly received_at: string;
  readonly body: string;
};

const _parse = (text: string): Readonly<Record<string, unknown>> =>
  ((parsed) =>
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {})(JSON.parse(text) as unknown);

const _flag = (raw: unknown): boolean | null =>
  raw === 1 ? true : raw === 0 ? false : null;

/**
 * Строки дней проверок и курсор такта, а ещё чтения, которых проверкам не дают другие порты: события суток по
 * индексу момента, конфликты, номер оплаты по частичному индексу, начало событий и счёта, журнал выключателя.
 */
export var defineQualityStore = (db: Database): QualityStore => {
  const rows = db.query<DayRow, [string, string]>(
    `SELECT ${_COLUMNS} FROM analytics_check_days WHERE day >= ? AND day <= ? ORDER BY check_code, scope, test, day`
  );
  const rowsOf = db.query<DayRow, [string, string, string]>(
    `SELECT ${_COLUMNS} FROM analytics_check_days WHERE check_code = ? AND day >= ? AND day <= ? ORDER BY scope, test, day`
  );
  const row = db.query<DayRow, KeyParams>(
    `SELECT ${_COLUMNS} FROM analytics_check_days WHERE ${_WHERE_KEY}`
  );
  const put = db.query(`
    INSERT OR REPLACE INTO analytics_check_days (${_COLUMNS})
    VALUES ($check, $scope, $test, $day, $state, $reason, $value, $detail, $version, $evaluatedAt, $resolvedAt,
      $resolvedBy, $resolvedAgent, $resolution, $notifiedAt, $episode, $recoveredAt)`);
  // У каждой не тестовой пары — строка с уведомлением за самые поздние сутки: голый столбец берётся из строки max.
  const notified = db.query<DayRow, []>(`
    SELECT ${_COLUMNS.replace('day,', 'max(day) AS day,')} FROM analytics_check_days
    WHERE test = 0 AND notified_at IS NOT NULL GROUP BY check_code, scope`);
  // Отметка — сравнением с прежней: второй процесс, прочитавший ту же строку, её не повторит.
  const mark = db.query<
    unknown,
    KeyParams & {
      readonly at: string;
      readonly episode: string;
      readonly previous: string | null;
    }
  >(
    `UPDATE analytics_check_days SET notified_at = $at, episode = $episode WHERE ${_WHERE_KEY} AND notified_at IS $previous`
  );
  const recover = db.query<unknown, KeyParams & { readonly at: string }>(
    `UPDATE analytics_check_days SET recovered_at = $at WHERE ${_WHERE_KEY} AND recovered_at IS NULL`
  );
  const expire = db.query<unknown, [string]>(
    'DELETE FROM analytics_check_days WHERE day < ?'
  );
  const cursor = db.query<{ seq: number; revision: number; marks: string }, []>(
    'SELECT seq, revision, marks FROM analytics_quality_cursor WHERE id = 1'
  );
  const keep = db.query<unknown, [number, number, string]>(`
    INSERT INTO analytics_quality_cursor (id, seq, revision, marks) VALUES (1, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET seq = excluded.seq, revision = excluded.revision, marks = excluded.marks`);
  // Три чтения по rowid: такт без работы стоит только их.
  const marks = db.query<{ seq: number; log: number; erasures: number }, []>(`
    SELECT (SELECT coalesce(max(seq), 0) FROM analytics_events) AS seq,
      (SELECT coalesce(max(id), 0) FROM analytics_setup_log) AS log,
      (SELECT coalesce(max(id), 0) FROM analytics_erasures) AS erasures`);
  // По rowid, а не по индексу: с DISTINCT планировщик читал весь индекс типа (замер ADR).
  const changes = db.query<
    {
      sender: string;
      type: string;
      at: string;
      test: number;
      day: unknown;
    },
    [number]
  >(`
    SELECT sender, type, at, test, json_extract(body, '$.data.day') AS day
    FROM analytics_events NOT INDEXED WHERE seq > ?`);
  const logged = db.query<{ item: string }, [number]>(
    'SELECT DISTINCT item FROM analytics_setup_log WHERE id > ?'
  );
  const switches = db.query<
    { at: string; before: unknown; after: unknown },
    []
  >(`
    SELECT at, json_extract(before, '$.enabled') AS before, json_extract(after, '$.enabled') AS after
    FROM analytics_setup_log WHERE item = 'settings' ORDER BY id`);
  const events = db.query<EventRow, [string, string]>(`
    SELECT seq, sender, type, subject, test, at, received_at, body FROM analytics_events
    WHERE at >= ? AND at < ? ORDER BY at, seq`);
  const conflicts = db.query<
    { sender: string; count: number },
    [string, string]
  >(`
    SELECT sender, count(*) AS count FROM analytics_conflicts
    WHERE last_at >= ? AND last_at < ? GROUP BY sender ORDER BY sender`);
  // То же выражение, что у частичного индекса analytics_events_payment: иначе SQLite его не возьмёт.
  const payments = db.query<
    { seq: number; type: string; test: number },
    [string, string]
  >(`
    SELECT seq, type, test FROM analytics_events
    WHERE sender = ? AND json_extract(body, '$.data.payment_id') = ?`);
  // Самый ранний момент события — по индексу момента: история из файла приходит позже своих суток.
  const firstOf = db.query<{ at: string | null }, []>(
    'SELECT min(at) AS at FROM analytics_events'
  );
  const tallied = db.query<{ day: string | null }, []>(
    'SELECT min(day) AS day FROM analytics_intake_daily'
  );
  const talliedBy = db.query<{ day: string | null }, [string]>(
    'SELECT min(day) AS day FROM analytics_intake_daily WHERE sender = ?'
  );
  const firstEvent = db.query<{ at: string }, []>(
    'SELECT received_at AS at FROM analytics_events WHERE test = 0 ORDER BY seq LIMIT 1'
  );
  // Свои пороговые: события типа — по индексу (sender, type, at), люди — по индексам прихода и первой оплаты.
  const count = db.query<{ n: number }, [string, string, string, string]>(
    'SELECT count(*) AS n FROM analytics_events WHERE sender = ? AND type = ? AND at >= ? AND at < ? AND test = 0'
  );
  const arrivals = db.query<{ n: number }, [string, string]>(
    'SELECT count(*) AS n FROM analytics_people WHERE arrived_at >= ? AND arrived_at < ? AND test = 0'
  );
  const firstPayments = db.query<{ n: number }, [string, string]>(
    'SELECT count(*) AS n FROM analytics_people WHERE first_paid_at >= ? AND first_paid_at < ? AND test = 0'
  );
  return {
    rows: (from, to) => rows.all(from, to).map(_rowOf),
    rowsOf: (check, from, to) => rowsOf.all(check, from, to).map(_rowOf),
    row: (key) => ((_) => (_ === null ? null : _rowOf(_)))(row.get(_key(key))),
    put: (_) =>
      void put.run({
        ..._key(_),
        state: _.state,
        reason: _.reason,
        value: _.value,
        detail: JSON.stringify(_.detail),
        version: _.version,
        evaluatedAt: _.evaluatedAt,
        resolvedAt: _.resolution?.at ?? null,
        resolvedBy: _.resolution?.by ?? null,
        resolvedAgent: Number(_.resolution?.agent === true),
        resolution: _.resolution?.note ?? null,
        notifiedAt: _.notifiedAt,
        episode: _.episode,
        recoveredAt: _.recoveredAt,
      }),
    notified: () => notified.all().map(_rowOf),
    mark: (key, at, episode, previous) =>
      mark.run({ ..._key(key), at, episode, previous }).changes > 0,
    recover: (key, at) => recover.run({ ..._key(key), at }).changes > 0,
    expire: (before) => expire.run(before).changes,
    cursor: () =>
      ((_) =>
        _ === null
          ? null
          : {
              seq: _.seq,
              revision: _.revision,
              marks: {
                log: 0,
                erasures: 0,
                ...(JSON.parse(_.marks) as Record<string, number>),
              },
            })(cursor.get()),
    keep: (_) => void keep.run(_.seq, _.revision, JSON.stringify(_.marks)),
    marks: () => marks.get() ?? { seq: 0, log: 0, erasures: 0 },
    changes: (after) =>
      changes.all(after).map((_) => ({
        sender: _.sender,
        type: _.type,
        at: _.at,
        test: _.test === 1,
        day: typeof _.day === 'string' ? _.day : null,
      })),
    logged: (after) => logged.all(after).map((_) => _.item as SetupLogItem),
    switches: () =>
      switches.all().map((_) => ({
        at: _.at,
        before: _flag(_.before),
        after: _flag(_.after),
      })),
    events: (from, to) =>
      events.all(from, to).map(
        (_): DayEvent => ({
          seq: _.seq,
          sender: _.sender,
          type: _.type,
          subject: _.subject,
          test: _.test === 1,
          at: _.at,
          receivedAt: _.received_at,
          body: _parse(_.body),
        })
      ),
    conflicts: (from, to) => conflicts.all(from, to),
    payments: (sender, paymentId) =>
      payments
        .all(sender, paymentId)
        .map((_) => ({ seq: _.seq, type: _.type, test: _.test === 1 })),
    // У сайта — самое раннее событие и первые сутки счёта; у отправителя — его счёт приёма (маленькая таблица):
    // искать первое событие отправителя пришлось бы по всем его событиям.
    started: (sender) =>
      sender === null
        ? ((received, day) =>
            [received === null ? null : received.slice(0, 10), day]
              .filter((_): _ is string => _ !== null)
              .toSorted()[0] ?? null)(
            firstOf.get()?.at ?? null,
            tallied.get()?.day ?? null
          )
        : (talliedBy.get(sender)?.day ?? null),
    firstEvent: () => firstEvent.get()?.at ?? null,
    count: (sender, type, from, to) =>
      count.get(sender, type, from, to)?.n ?? 0,
    arrivals: (from, to) => arrivals.get(from, to)?.n ?? 0,
    firstPayments: (from, to) => firstPayments.get(from, to)?.n ?? 0,
  };
};
