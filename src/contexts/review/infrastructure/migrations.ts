import type { Migration } from '../../../platform/database.ts';

export var reviewMigrations: readonly Migration[] = [
  {
    id: 'review/001_review',
    sql: `
      CREATE TABLE review_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        agents INTEGER NOT NULL DEFAULT 0,
        link_days INTEGER NOT NULL DEFAULT 7
      );
      CREATE TABLE review_change_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        token_id INTEGER,
        token_name TEXT NOT NULL DEFAULT '',
        agent_group TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        submitted_at TEXT,
        closed_at TEXT
      );
      CREATE INDEX review_change_sets_open
        ON review_change_sets (user_id, agent_group) WHERE status = 'open';
      CREATE INDEX review_change_sets_status ON review_change_sets (status, updated_at);
      CREATE TABLE review_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_id INTEGER NOT NULL REFERENCES review_change_sets (id) ON DELETE CASCADE,
        target TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX review_proposals_set ON review_proposals (set_id, target);
      CREATE INDEX review_proposals_pending ON review_proposals (status) WHERE status = 'pending';
      CREATE TABLE review_share_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        selector TEXT NOT NULL UNIQUE,
        verifier_hash TEXT NOT NULL,
        page_id INTEGER NOT NULL,
        set_id INTEGER,
        label TEXT NOT NULL DEFAULT '',
        created_by INTEGER,
        created_by_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_used_at TEXT,
        uses INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX review_share_links_target ON review_share_links (page_id, set_id);
    `,
  },
];

/**
 * Ссылки предпросмотра — этого сервера, как ключи API: из копии сайта они открыли бы черновики на
 * чужом сервере. Наборы правок и настройка проверки — часть сайта и едут в копии.
 */
export var REVIEW_SERVER_TABLES = ['review_share_links'] as const;
