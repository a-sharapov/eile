import type { Migration } from '../../../platform/database.ts';

export var redirectsMigrations: readonly Migration[] = [
  {
    id: 'redirects/001_rules',
    sql: `
      CREATE TABLE redirects_rules (
        id INTEGER PRIMARY KEY,
        from_path TEXT NOT NULL UNIQUE,
        target TEXT NOT NULL,
        status INTEGER NOT NULL DEFAULT 301,
        note TEXT NOT NULL DEFAULT '',
        hits INTEGER NOT NULL DEFAULT 0,
        last_hit_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];
