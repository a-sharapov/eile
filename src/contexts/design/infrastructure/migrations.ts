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
  {
    // CHECK в SQLite не меняется: таблица пересоздаётся с новым видом элемента, строки — как были.
    id: 'design/002_scripts',
    sql: `
      CREATE TABLE design_elements_next (
        kind TEXT NOT NULL CHECK (kind IN ('template', 'component', 'script')),
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, name)
      ) WITHOUT ROWID;
      INSERT INTO design_elements_next (kind, name, source, revision, updated_at)
        SELECT kind, name, source, revision, updated_at FROM design_elements;
      DROP TABLE design_elements;
      ALTER TABLE design_elements_next RENAME TO design_elements;
    `,
  },
];
