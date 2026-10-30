import type { Migration } from '../../../platform/database.ts';

export var notifyMigrations: readonly Migration[] = [
  {
    id: 'notify/001_channels_outbox_incidents',
    sql: `
      CREATE TABLE notify_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE notify_outbox (
        id INTEGER PRIMARY KEY,
        channel TEXT NOT NULL,
        recipient TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_at TEXT NOT NULL,
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        sent_at TEXT
      );
      CREATE INDEX notify_outbox_due ON notify_outbox (status, next_at);
      CREATE INDEX notify_outbox_source ON notify_outbox (source);
      CREATE TABLE notify_incidents (
        id INTEGER PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        first_at TEXT NOT NULL,
        last_at TEXT NOT NULL
      );
      CREATE INDEX notify_incidents_last ON notify_incidents (last_at);
      CREATE TABLE notify_runtime (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        running INTEGER NOT NULL,
        started_at TEXT NOT NULL
      );
    `,
  },
];

/**
 * Таблицы этого сервера, а не сайта: токен бота и пароль почты, очередь с текстами заявок и журнал сбоев
 * в копию не попадают и при восстановлении остаются свои.
 */
export var NOTIFY_TABLES: readonly string[] = [
  'notify_settings',
  'notify_outbox',
  'notify_incidents',
  'notify_runtime',
];
