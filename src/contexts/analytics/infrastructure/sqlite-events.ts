import type { Database } from '../../../platform/database.ts';
import type { EventOrigin } from '../domain/envelope.ts';
import type { ErasureOrigin } from '../domain/events.ts';
import type { HistoryEvent } from '../domain/person.ts';
import type { ErasureLog, EventJournal, EventStore } from '../domain/ports.ts';

type Value = string | number | null;

export var defineEventStore = (db: Database): EventStore => {
  const find = db.query<
    { hash: string; subject: string | null },
    [string, string]
  >('SELECT hash, subject FROM analytics_events WHERE sender = ? AND id = ?');
  const insert = db.query<unknown, Value[]>(`
    INSERT INTO analytics_events (sender, id, type, at, subject, test, received_at, origin, body, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const conflict = db.query<unknown, Value[]>(`
    INSERT INTO analytics_conflicts (sender, id, subject, count, first_at, last_at, body, hash)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT (sender, id) DO UPDATE SET
      count = count + 1, last_at = excluded.last_at, body = excluded.body, hash = excluded.hash`);
  const events = db.query<unknown, [string, string]>(
    'DELETE FROM analytics_events WHERE subject = ? AND at <= ?'
  );
  const testEvents = db.query<unknown, [string, string]>(
    'DELETE FROM analytics_events WHERE subject = ? AND at <= ? AND test = 1'
  );
  // Конфликт хранит тело повтора: стирается и тот, где псевдоним только в этом теле.
  const conflicts = db.query<unknown, [string, string]>(`
    DELETE FROM analytics_conflicts WHERE subject = ? OR json_extract(body, '$.subject') = ?`);
  const orphans = db.query<unknown, [string]>(`
    DELETE FROM analytics_conflicts WHERE subject = ? AND NOT EXISTS (
      SELECT 1 FROM analytics_events e
      WHERE e.sender = analytics_conflicts.sender AND e.id = analytics_conflicts.id)`);
  const person = db.query<unknown, [string]>(
    'DELETE FROM analytics_people WHERE subject = ?'
  );
  return {
    find: (sender, id) => find.get(sender, id),
    add: (event) =>
      Number(
        insert.run(
          event.sender,
          event.envelope.id,
          event.envelope.type,
          event.envelope.at,
          event.envelope.subject,
          Number(event.envelope.test),
          event.receivedAt,
          event.origin,
          event.body,
          event.hash
        ).lastInsertRowid
      ),
    conflict: (_) =>
      void conflict.run(_.sender, _.id, _.subject, _.at, _.at, _.body, _.hash),
    // Строка человека уходит всегда: свёртка соберёт её заново из оставшихся событий.
    erase: (subject, before, test) =>
      ((erased) => (
        test ? orphans.run(subject) : conflicts.run(subject, subject),
        person.run(subject),
        erased
      ))((test ? testEvents : events).run(subject, before).changes),
  };
};

type ErasureRow = {
  readonly at: string;
  readonly before: string;
  readonly origin: string;
  readonly sender: string | null;
  readonly user_name: string | null;
  readonly events: number;
  readonly people: number;
};

const _erasure = (_: ErasureRow) => ({
  at: _.at,
  before: _.before,
  origin: _.origin as ErasureOrigin,
  sender: _.sender,
  userName: _.user_name,
  events: _.events,
  people: _.people,
});

export var defineErasureLog = (db: Database): ErasureLog => {
  const insert = db.query<unknown, Value[]>(`
    INSERT INTO analytics_erasures (at, before, origin, sender, user_name, events, people, subject_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const until = db.query<{ until: string | null }, [string]>(
    'SELECT max(before) AS until FROM analytics_erasures WHERE subject_hash = ?'
  );
  const page = db.query<
    ErasureRow & { readonly id: number; readonly marked: number },
    [number, number]
  >(`
    SELECT id, at, before, origin, sender, user_name, events, people, subject_hash IS NOT NULL AS marked
    FROM analytics_erasures WHERE id < ? ORDER BY id DESC LIMIT ?`);
  const marks = db.query<ErasureRow & { readonly subject_hash: string }, []>(`
    SELECT at, before, origin, sender, user_name, events, people, subject_hash
    FROM analytics_erasures WHERE subject_hash IS NOT NULL ORDER BY id`);
  const has = db.query<{ found: number }, [string, string, string]>(
    'SELECT 1 AS found FROM analytics_erasures WHERE subject_hash = ? AND before = ? AND at = ?'
  );
  const moments = db.query<{ hash: string; before: string }, []>(`
    SELECT subject_hash AS hash, max(before) AS before FROM analytics_erasures
    WHERE subject_hash IS NOT NULL GROUP BY subject_hash`);
  return {
    add: (_) =>
      void insert.run(
        _.at,
        _.before,
        _.origin,
        _.sender,
        _.userName,
        _.events,
        _.people,
        _.subjectHash
      ),
    until: (hash) => until.get(hash)?.until ?? null,
    list: (before, limit) =>
      page
        .all(before ?? Number.MAX_SAFE_INTEGER, limit)
        .map((_) => ({ ..._erasure(_), id: _.id, marked: _.marked === 1 })),
    marks: () =>
      marks.all().map((_) => ({ ..._erasure(_), subjectHash: _.subject_hash })),
    has: (_) =>
      _.subjectHash !== null && has.get(_.subjectHash, _.before, _.at) !== null,
    moments: () => new Map(moments.all().map((_) => [_.hash, _.before])),
  };
};

type JournalRow = {
  readonly seq: number;
  readonly sender: string;
  readonly id: string;
  readonly type: string;
  readonly at: string;
  readonly subject: string | null;
  readonly test: number;
  readonly received_at: string;
  readonly origin: string;
  readonly body: string;
};

const _COLUMNS =
  'seq, sender, id, type, at, subject, test, received_at, origin, body';

const _row = (_: JournalRow) => ({
  seq: _.seq,
  sender: _.sender,
  id: _.id,
  type: _.type,
  at: _.at,
  subject: _.subject,
  test: _.test === 1,
  receivedAt: _.received_at,
  origin: _.origin as EventOrigin,
});

type HistoryRow = Pick<
  JournalRow,
  'seq' | 'sender' | 'type' | 'at' | 'test' | 'body'
>;

const _history = (_: HistoryRow): HistoryEvent => ({
  seq: _.seq,
  sender: _.sender,
  type: _.type,
  at: _.at,
  test: _.test === 1,
  body: JSON.parse(_.body) as Readonly<Record<string, unknown>>,
});

type PageParams = {
  readonly sender: string | null;
  readonly type: string | null;
  readonly types: string | null;
  readonly subject: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly test: number | null;
  readonly before: number | null;
  readonly limit: number;
};

// Новые сверху по времени события, затем по приёму; курсор — событие, на котором кончилась страница.
const _PAGE_WHERE = `($sender IS NULL OR e.sender = $sender)
  AND ($type IS NULL OR e.type = $type)
  AND ($types IS NULL OR (e.sender || '/' || e.type) IN (SELECT value FROM json_each($types)))
  AND ($from IS NULL OR e.at >= $from)
  AND ($to IS NULL OR e.at < $to)
  AND ($test IS NULL OR e.test = $test)
  AND ($before IS NULL OR (e.at, e.seq) < (SELECT at, seq FROM analytics_events WHERE seq = $before))`;

export var defineEventJournal = (db: Database): EventJournal => {
  const history = db.query<HistoryRow, [string]>(
    'SELECT seq, sender, type, at, test, body FROM analytics_events WHERE subject = ? ORDER BY at, seq'
  );
  // Запрос на человека стоит ~15 мкс сам по себе: пачка пересборки читает свои истории одним проходом.
  const histories = db.query<
    HistoryRow & { readonly subject: string },
    [string, string]
  >(`
    SELECT subject, seq, sender, type, at, test, body FROM analytics_events
    WHERE subject >= ? AND subject <= ? ORDER BY subject, at, seq`);
  const latest = db.query<{ at: string | null }, [string]>(
    'SELECT max(at) AS at FROM analytics_events WHERE subject = ?'
  );
  // Псевдоним — свой индекс (subject, at): карточка не просматривает чужие события.
  const bySubject = db.query<JournalRow, PageParams>(`
    SELECT ${_COLUMNS} FROM analytics_events e
    WHERE e.subject = $subject AND ${_PAGE_WHERE}
    ORDER BY e.at DESC, e.seq DESC LIMIT $limit`);
  const page = db.query<JournalRow, PageParams>(`
    SELECT ${_COLUMNS} FROM analytics_events e
    WHERE ${_PAGE_WHERE}
    ORDER BY e.at DESC, e.seq DESC LIMIT $limit`);
  const one = db.query<JournalRow, [number]>(
    `SELECT ${_COLUMNS} FROM analytics_events WHERE seq = ?`
  );
  const subjects = db.query<{ n: number }, []>(
    'SELECT count(DISTINCT subject) AS n FROM analytics_events WHERE subject IS NOT NULL'
  );
  // Псевдоним бывает и только в конфликте повтора: в первом событии или в теле повтора.
  const pseudonyms = db.query<{ subject: string }, []>(`
    SELECT subject FROM analytics_events WHERE subject IS NOT NULL
    UNION SELECT subject FROM analytics_conflicts WHERE subject IS NOT NULL
    UNION SELECT json_extract(body, '$.subject') FROM analytics_conflicts
      WHERE json_type(body, '$.subject') = 'text'`);
  const earliest = db.query<
    { subject: string; at: string; test: number },
    [string, string]
  >(`
    SELECT subject, at, test FROM analytics_events
    WHERE sender = ? AND type = ? AND subject IS NOT NULL ORDER BY at, seq LIMIT 1`);
  const expired = db.query<{ subject: string }, [string, number]>(`
    SELECT subject FROM analytics_events WHERE subject IS NOT NULL
    GROUP BY subject HAVING max(at) < ? LIMIT ?`);
  const received = db.query<{ n: number }, [string]>(
    'SELECT count(*) AS n FROM analytics_events WHERE received_at >= ?'
  );
  const last = db.query<{ at: string }, []>(
    'SELECT received_at AS at FROM analytics_events ORDER BY seq DESC LIMIT 1'
  );
  const conflicts = db.query<
    {
      sender: string;
      id: string;
      count: number;
      first_at: string;
      last_at: string;
    },
    [string, string]
  >(`
    SELECT sender, id, count, first_at, last_at FROM analytics_conflicts
    WHERE subject = ? OR json_extract(body, '$.subject') = ? ORDER BY last_at DESC, sender, id`);
  const types = db.query<
    { sender: string; type: string; count: number; last_at: string },
    []
  >(
    'SELECT sender, type, count(*) AS count, max(at) AS last_at FROM analytics_events GROUP BY sender, type'
  );
  const answers = db.query<
    { question: unknown; answer: unknown; count: number },
    [string, string]
  >(`
    SELECT json_extract(body, '$.data.question') AS question, json_extract(body, '$.data.answer') AS answer,
      count(*) AS count
    FROM analytics_events WHERE sender = ? AND type = ? GROUP BY question, answer`);
  const values = db.query<
    { property: string; value: unknown; count: number },
    { sender: string; type: string; keys: string }
  >(`
    SELECT j.key AS property, j.value AS value, count(*) AS count
    FROM analytics_events e, json_each(e.body, '$.data') j
    WHERE e.sender = $sender AND e.type = $type AND j.key IN (SELECT value FROM json_each($keys))
    GROUP BY j.key, j.value`);
  return {
    history: (subject) => history.all(subject).map(_history),
    histories: (first, last) =>
      new Map(
        Object.entries(
          Object.groupBy(histories.all(first, last), (_) => _.subject)
        ).map(({ 0: subject, 1: rows }) => [
          subject,
          (rows ?? []).map(_history),
        ])
      ),
    latest: (subject) => latest.get(subject)?.at ?? null,
    page: (filter) =>
      (filter.subject === null ? page : bySubject)
        .all({
          sender: filter.sender,
          type: filter.type,
          types: filter.types === null ? null : JSON.stringify(filter.types),
          subject: filter.subject,
          from: filter.from,
          to: filter.to,
          test: filter.test === null ? null : Number(filter.test),
          before: filter.before,
          limit: filter.limit,
        })
        .map((_) => ({
          ..._row(_),
          body: JSON.parse(_.body) as Readonly<Record<string, unknown>>,
        })),
    one: (seq) =>
      ((_) => (_ === null ? null : { ..._row(_), body: _.body }))(one.get(seq)),
    subjects: () => subjects.get()?.n ?? 0,
    pseudonyms: () => pseudonyms.all().map((_) => _.subject),
    earliest: (sender, type) =>
      ((_) =>
        _ === null
          ? null
          : { subject: _.subject, at: _.at, test: _.test === 1 })(
        earliest.get(sender, type)
      ),
    expired: (before, limit) =>
      expired.all(before, limit).map((_) => _.subject),
    received: (since) => ({
      count: received.get(since)?.n ?? 0,
      last: last.get()?.at ?? null,
    }),
    conflicts: (subject) =>
      conflicts.all(subject, subject).map((_) => ({
        sender: _.sender,
        id: _.id,
        count: _.count,
        firstAt: _.first_at,
        lastAt: _.last_at,
      })),
    types: () =>
      types.all().map((_) => ({
        sender: _.sender,
        type: _.type,
        count: _.count,
        lastAt: _.last_at,
      })),
    answers: (sender, type) => answers.all(sender, type),
    values: (sender, type, properties) =>
      values.all({ sender, type, keys: JSON.stringify(properties) }),
  };
};
