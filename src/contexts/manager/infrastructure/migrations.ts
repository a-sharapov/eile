import type { Migration } from '../../../platform/database.ts';

export var managerMigrations: readonly Migration[] = [
  {
    id: 'manager/001_appearance',
    sql: `
      CREATE TABLE manager_appearance (
        user_id INTEGER PRIMARY KEY,
        accent TEXT NOT NULL,
        scheme TEXT NOT NULL
      );
    `,
  },
  {
    id: 'manager/002_activity',
    sql: `
      CREATE TABLE manager_activity (
        id INTEGER PRIMARY KEY,
        page_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE INDEX manager_activity_at ON manager_activity (at);
    `,
  },
];
