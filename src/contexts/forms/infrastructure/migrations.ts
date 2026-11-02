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
  {
    // Файлы заявок — в базе сайта: личные данные не лежат в каталоге, откуда их мог бы взять кто угодно.
    id: 'forms/002_files',
    sql: `
      CREATE TABLE forms_files (
        id INTEGER PRIMARY KEY,
        submission_id INTEGER NOT NULL,
        field TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        data BLOB NOT NULL
      );
      CREATE INDEX forms_files_submission ON forms_files (submission_id);
    `,
  },
  {
    // Доставка заявки на вебхук формы — рядом с заявкой и в копии сайта вместе с ней: тело запроса собирается
    // из заявки на каждую попытку, личные данные второй раз не хранятся.
    id: 'forms/003_webhooks',
    sql: `
      CREATE TABLE forms_webhooks (
        submission_id INTEGER PRIMARY KEY,
        form TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_at TEXT NOT NULL,
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        delivered_at TEXT
      );
      CREATE INDEX forms_webhooks_due ON forms_webhooks (next_at) WHERE status = 'pending';
    `,
  },
];

/** Секрет печатей — этого сервера: в копию сайта не попадает, у другого сервера свой. */
export var FORMS_SERVER_TABLES: readonly string[] = ['forms_secret'];
