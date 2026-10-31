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
];
