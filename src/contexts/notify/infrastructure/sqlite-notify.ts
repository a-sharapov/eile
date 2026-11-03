import type { Database } from '../../../platform/database.ts';
import { textIn } from '../../../shared/kernel/manager-language.ts';
import type { Delivery, DeliveryStatus } from '../domain/delivery.ts';
import { DEFAULT_GATEWAY } from '../domain/gateway.ts';
import type { ChannelKind, Message, Severity } from '../domain/message.ts';
import type {
  IncidentRecord,
  IncidentRepository,
  OutboxRepository,
  SettingsRepository,
} from '../domain/ports.ts';
import { EMPTY_SETTINGS, type NotifySettings } from '../domain/settings.ts';

// Одна строка JSON: настройки каналов читаются целиком и целиком меняются.
export var defineSettingsRepository = (db: Database): SettingsRepository => {
  const get = db.query<{ value: string }, []>(
    'SELECT value FROM notify_settings WHERE id = 1'
  );
  const upsert = db.query(`
    INSERT INTO notify_settings (id, value, updated_at) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  const read = (): NotifySettings =>
    ((row) =>
      ((stored) => ({
        ...EMPTY_SETTINGS,
        ...stored,
        gateway: { ...DEFAULT_GATEWAY, ...stored.gateway },
      }))(row ? (JSON.parse(row.value) as Partial<NotifySettings>) : {}))(
      get.get()
    );
  // Адрес почтового шлюза сверяется на каждом запросе сайта: база читается один раз, дальше — до записи.
  // Запись другим процессом пересобирает контексты (data_version), а с ними и этот репозиторий.
  let cached: NotifySettings | null = null;
  return {
    get: (): NotifySettings => (cached ??= read()),
    save: (settings) =>
      void (upsert.run(JSON.stringify(settings), new Date().toISOString()),
      (cached = settings)),
  };
};

type OutboxRow = {
  id: number;
  channel: string;
  recipient: string;
  message: string;
  source: string | null;
  status: string;
  attempts: number;
  next_at: string;
  last_error: string;
  created_at: string;
  sent_at: string | null;
};

const _delivery = (row: OutboxRow): Delivery => ({
  id: row.id,
  channel: row.channel as ChannelKind,
  recipient: row.recipient,
  message: JSON.parse(row.message) as Message,
  source: row.source,
  status: row.status as DeliveryStatus,
  attempts: row.attempts,
  nextAt: row.next_at,
  lastError: row.last_error,
  createdAt: row.created_at,
  sentAt: row.sent_at,
});

export var defineOutboxRepository = (db: Database): OutboxRepository => {
  const insert = db.query<
    { id: number },
    [string, string, string, string | null, string, string]
  >(`
    INSERT INTO notify_outbox (channel, recipient, message, source, next_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id`);
  const due = db.query<OutboxRow, [string, number]>(
    "SELECT * FROM notify_outbox WHERE status = 'pending' AND next_at <= ? ORDER BY next_at, id LIMIT ?"
  );
  const byId = db.query<OutboxRow, [number]>(
    'SELECT * FROM notify_outbox WHERE id = ?'
  );
  const bySource = db.query<OutboxRow, [string]>(
    'SELECT * FROM notify_outbox WHERE source = ? ORDER BY id'
  );
  const recent = db.query<OutboxRow, [number]>(
    'SELECT * FROM notify_outbox ORDER BY id DESC LIMIT ?'
  );
  const mark = db.query(`
    UPDATE notify_outbox SET status = $status, attempts = $attempts, next_at = $nextAt,
      last_error = $lastError, sent_at = $sentAt
    WHERE id = $id`);
  const purge = db.query(
    "DELETE FROM notify_outbox WHERE status <> 'pending' AND created_at < ?"
  );
  return {
    add: (delivery, now) =>
      insert.get(
        delivery.channel,
        delivery.recipient,
        JSON.stringify(delivery.message),
        delivery.source,
        now,
        now
      )!.id,
    due: (now, limit) => due.all(now, limit).map(_delivery),
    get: (id) => ((row) => (row ? _delivery(row) : null))(byId.get(id)),
    bySource: (source) => bySource.all(source).map(_delivery),
    recent: (limit) => recent.all(limit).map(_delivery),
    mark: (id, change) => void mark.run({ id, ...change }),
    purge: (before) => purge.run(before).changes,
  };
};

type IncidentRow = {
  id: number;
  fingerprint: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  texts: string;
  count: number;
  first_at: string;
  last_at: string;
};

// Тексты на языках — в texts; у записей со старой версии их нет, и title с detail — как были.
const _incident = (row: IncidentRow): IncidentRecord =>
  ((texts) => ({
    id: row.id,
    fingerprint: row.fingerprint,
    kind: row.kind,
    severity: row.severity as Severity,
    title: texts?.title ?? row.title,
    detail: texts?.detail ?? row.detail,
    count: row.count,
    firstAt: row.first_at,
    lastAt: row.last_at,
  }))(
    row.texts
      ? (JSON.parse(row.texts) as Pick<IncidentRecord, 'title' | 'detail'>)
      : null
  );

// Повтор того же сбоя — счётчик и время последнего; подробности — от последнего раза.
export var defineIncidentRepository = (db: Database): IncidentRepository => {
  const upsert = db.query<IncidentRow, Record<string, string>>(`
    INSERT INTO notify_incidents (fingerprint, kind, severity, title, detail, texts, first_at, last_at)
    VALUES ($fingerprint, $kind, $severity, $title, $detail, $texts, $now, $now)
    ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1, last_at = excluded.last_at,
      severity = excluded.severity, title = excluded.title, detail = excluded.detail,
      texts = excluded.texts
    RETURNING *`);
  const list = db.query<IncidentRow, [number]>(
    'SELECT * FROM notify_incidents ORDER BY last_at DESC, id DESC LIMIT ?'
  );
  const purge = db.query('DELETE FROM notify_incidents WHERE last_at < ?');
  return {
    record: (incident, now) =>
      _incident(
        upsert.get({
          fingerprint: incident.fingerprint,
          kind: incident.kind,
          severity: incident.severity,
          title: textIn(incident.title, 'en'),
          detail: textIn(incident.detail, 'en'),
          texts: JSON.stringify({
            title: incident.title,
            detail: incident.detail,
          }),
          now,
        })!
      ),
    list: (limit) => list.all(limit).map(_incident),
    purge: (before) => purge.run(before).changes,
  };
};

/** Метка «сервер работает»: осталась с прошлого запуска — значит, он не остановился штатно. */
export var defineRuntimeMark = (db: Database) => {
  const get = db.query<{ running: number; started_at: string }, []>(
    'SELECT running, started_at FROM notify_runtime WHERE id = 1'
  );
  const set = db.query(`
    INSERT INTO notify_runtime (id, running, started_at) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET running = excluded.running, started_at = excluded.started_at`);
  return {
    /** Ставит метку; возвращает момент прошлого запуска, если тот не снял свою. */
    start: (now: string): string | null =>
      ((previous) => (
        set.run(1, now), previous?.running === 1 ? previous.started_at : null
      ))(get.get()),
    stop: (): void =>
      void ((row) => row && set.run(0, row.started_at))(get.get()),
  };
};
