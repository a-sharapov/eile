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
  {
    id: 'assistant/002_vision',
    sql: 'ALTER TABLE assistant_connection ADD COLUMN vision INTEGER NOT NULL DEFAULT 0',
  },
];

/** Таблица, которой не место в копиях сайта: ключ ИИ принадлежит серверу. */
export var ASSISTANT_TABLE = 'assistant_connection';

type Row = {
  url: string;
  model: string;
  key: string;
  instructions: string;
  vision: number;
};

export var defineConnectionRepository = (
  db: Database
): ConnectionRepository => {
  const get = db.query<Row, []>(
    'SELECT url, model, key, instructions, vision FROM assistant_connection WHERE id = 1'
  );
  const upsert = db.query(`
    INSERT INTO assistant_connection (id, url, model, key, instructions, vision, updated_at)
    VALUES (1, $url, $model, $key, $instructions, $vision, $now)
    ON CONFLICT (id) DO UPDATE SET url = excluded.url, model = excluded.model,
      key = excluded.key, instructions = excluded.instructions, vision = excluded.vision,
      updated_at = excluded.updated_at`);
  const remove = db.query('DELETE FROM assistant_connection');
  return {
    get: () =>
      ((row) => row && { ...row, vision: row.vision === 1 })(get.get()),
    save: (connection) =>
      void upsert.run({
        ...connection,
        vision: connection.vision ? 1 : 0,
        now: new Date().toISOString(),
      }),
    remove: () => void remove.run(),
  };
};
