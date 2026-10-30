import type { Database, Migration } from '../../../platform/database.ts';
import type { ConnectionRepository } from '../domain/ports.ts';

// Одна строка на сервер: подключение ИИ — настройка этой установки, а не содержимое сайта.
export var assistantMigrations: readonly Migration[] = [
  {
    id: 'assistant/001_connection',
    sql: `
      CREATE TABLE assistant_connection (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        url TEXT NOT NULL,
        model TEXT NOT NULL,
        key TEXT NOT NULL,
        instructions TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `,
  },
];

/** Таблица, которой не место в копиях сайта: ключ ИИ принадлежит серверу. */
export var ASSISTANT_TABLE = 'assistant_connection';

type Row = { url: string; model: string; key: string; instructions: string };

export var defineConnectionRepository = (
  db: Database
): ConnectionRepository => {
  const get = db.query<Row, []>(
    'SELECT url, model, key, instructions FROM assistant_connection WHERE id = 1'
  );
  const upsert = db.query(`
    INSERT INTO assistant_connection (id, url, model, key, instructions, updated_at)
    VALUES (1, $url, $model, $key, $instructions, $now)
    ON CONFLICT (id) DO UPDATE SET url = excluded.url, model = excluded.model,
      key = excluded.key, instructions = excluded.instructions, updated_at = excluded.updated_at`);
  const remove = db.query('DELETE FROM assistant_connection');
  return {
    get: () => get.get() ?? null,
    save: (connection) =>
      void upsert.run({ ...connection, now: new Date().toISOString() }),
    remove: () => void remove.run(),
  };
};
