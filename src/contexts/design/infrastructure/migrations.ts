import type { Migration } from '../../../platform/database.ts';

export var designMigrations: readonly Migration[] = [
  {
    id: 'design/001_elements',
    sql: `
      CREATE TABLE design_elements (
        kind TEXT NOT NULL CHECK (kind IN ('template', 'component')),
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, name)
      ) WITHOUT ROWID;
    `,
  },
];
