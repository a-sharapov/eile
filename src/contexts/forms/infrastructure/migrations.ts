import type { Migration } from '../../../platform/database.ts';

export var formsMigrations: readonly Migration[] = [
  {
    id: 'forms/001_forms_submissions',
    sql: `
      CREATE TABLE forms_forms (
        name TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        settings TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE forms_submissions (
        id INTEGER PRIMARY KEY,
        form TEXT NOT NULL,
        form_title TEXT NOT NULL,
        field_values TEXT NOT NULL,
        context TEXT NOT NULL,
        search TEXT NOT NULL,
        ip TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        read_at TEXT,
        read_by INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX forms_submissions_form ON forms_submissions (form, id);
      CREATE INDEX forms_submissions_created ON forms_submissions (created_at);
      CREATE INDEX forms_submissions_unread ON forms_submissions (id) WHERE read_at IS NULL;
      CREATE TABLE forms_secret (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL
      );
    `,
  },
];

/** Секрет печатей — этого сервера: в копию сайта не попадает, у другого сервера свой. */
export var FORMS_SERVER_TABLES: readonly string[] = ['forms_secret'];
