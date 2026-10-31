import type { Migration } from '../../../platform/database.ts';

/** Учётные записи ACME, сертификаты и их ключи — этого сервера, не сайта: в копию сайта не попадают. */
export var CERTIFICATES_TABLES = [
  'certificates_accounts',
  'certificates_issued',
] as const;

export var certificatesMigrations: readonly Migration[] = [
  {
    id: 'certificates/001_accounts_and_issued',
    sql: `
      CREATE TABLE certificates_accounts (
        directory TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        url TEXT NOT NULL
      );
      CREATE TABLE certificates_issued (
        domains TEXT PRIMARY KEY,
        chain TEXT,
        key TEXT,
        not_after TEXT,
        issued_at TEXT,
        last_attempt_at TEXT,
        last_error TEXT NOT NULL DEFAULT ''
      );
    `,
  },
];
