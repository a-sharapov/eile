import type { Migration } from '../../../platform/database.ts';

export var upkeepMigrations: readonly Migration[] = [
  {
    id: 'upkeep/001_settings',
    sql: `
      CREATE TABLE upkeep_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    // Хранилище копий вне сервера: настройки, секрет доступа и ключ копий — одна строка JSON на сервер.
    id: 'upkeep/002_offsite',
    sql: `
      CREATE TABLE upkeep_offsite (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];
