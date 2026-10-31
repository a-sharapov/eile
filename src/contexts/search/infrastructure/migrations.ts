import type { Migration } from '../../../platform/database.ts';

export var searchMigrations: readonly Migration[] = [
  {
    id: 'search/001_index',
    sql: `
      CREATE TABLE search_pages (
        page_id INTEGER PRIMARY KEY,
        language TEXT NOT NULL,
        lineage TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE search_terms USING fts5(
        title,
        body,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TABLE search_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
    `,
  },
];

/**
 * Таблицы индекса вместе со служебными таблицами FTS5. Индекс выводится из страниц: в JSON-копию он не
 * идёт, восстановление его не трогает, а после восстановления он строится заново.
 */
export var SEARCH_TABLES: readonly string[] = [
  'search_pages',
  'search_meta',
  'search_terms',
  'search_terms_data',
  'search_terms_idx',
  'search_terms_content',
  'search_terms_docsize',
  'search_terms_config',
];
