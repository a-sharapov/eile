import type { Migration } from '../../../platform/database.ts';

export var siteMigrations: readonly Migration[] = [
  {
    id: 'site/001_settings',
    sql: `
      CREATE TABLE site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
    `,
  },
  {
    id: 'site/002_dictionary',
    sql: `
      CREATE TABLE site_translations (
        key TEXT NOT NULL,
        language TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (key, language)
      ) WITHOUT ROWID;
      CREATE TABLE site_custom_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
    `,
  },
];
