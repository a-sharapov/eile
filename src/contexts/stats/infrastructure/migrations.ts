import type { Migration } from '../../../platform/database.ts';

export var statsMigrations: readonly Migration[] = [
  {
    // Сводки по дням — данные сайта, в копии вместе с ним. Разрезы посещения считают посетителей и их
    // просмотры, разрезы страницы (page, language) — только просмотры: visitors у них 0.
    // Посетители дня — сервера: короткий хэш и посещение, только за текущие сутки.
    id: 'stats/001_stats',
    sql: `
      CREATE TABLE stats_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE stats_daily (
        day TEXT NOT NULL,
        dimension TEXT NOT NULL,
        value TEXT NOT NULL,
        visitors INTEGER NOT NULL DEFAULT 0,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, dimension, value)
      ) WITHOUT ROWID;
      CREATE INDEX stats_daily_dimension ON stats_daily (dimension, day);
      CREATE TABLE stats_goals (
        day TEXT NOT NULL,
        goal TEXT NOT NULL,
        dimension TEXT NOT NULL,
        value TEXT NOT NULL,
        visitors INTEGER NOT NULL DEFAULT 0,
        events INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, goal, dimension, value)
      ) WITHOUT ROWID;
      CREATE TABLE stats_visitors (
        day TEXT NOT NULL,
        id TEXT NOT NULL,
        visit TEXT NOT NULL,
        PRIMARY KEY (day, id)
      ) WITHOUT ROWID;
    `,
  },
];

/** Посетители дня — этого сервера: без соли из его памяти их хэши ничего не значат. */
export var STATS_SERVER_TABLES: readonly string[] = ['stats_visitors'];
