import { Database } from 'bun:sqlite';
import { chmodSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pipe } from '../shared/kernel/pipe.ts';

export type { Database };

/**
 * Изменение схемы одного контекста. `id` — `context/NNN_description`, после выпуска не меняется. `run` —
 * перенос данных, которому мало SQL (разбор BLOB); идёт в той же транзакции, что и запись в журнал.
 */
export type Migration = { readonly id: string } & (
  | { readonly sql: string }
  | { readonly run: (db: Database) => void }
);

const _PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  // Сервер и CLI пишут в одну базу: вторая запись ждёт первую, а не падает с SQLITE_BUSY.
  'PRAGMA busy_timeout = 5000',
];

export var openDatabase = (path: string): Database =>
  pipe(
    (_: string) => new Database(_, { create: true, strict: true }),
    (db: Database) => (_PRAGMAS.forEach((pragma) => void db.run(pragma)), db)
  )(path);

const _apply = (db: Database) => (migration: Migration) => {
  void ('sql' in migration ? db.run(migration.sql) : migration.run(db));
  db.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [
    migration.id,
    new Date().toISOString(),
  ]);
};

export var migrate = (db: Database, migrations: readonly Migration[]): void =>
  pipe(
    () =>
      db.run(
        'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
      ),
    () =>
      new Set(
        db
          .query<{ id: string }, []>('SELECT id FROM _migrations')
          .all()
          .map((_) => _.id)
      ),
    (applied: Set<string>) =>
      migrations
        .filter((_) => !applied.has(_.id))
        .forEach((_) => void db.transaction(_apply(db))(_))
  )();

// Таблицы, которым в копии не место, вычищаются, и файл пересобирается: удалённые строки иначе
// остались бы в свободных страницах.
const _strip = (path: string, tables: readonly string[]): void => {
  const copy = new Database(path);
  try {
    const present = new Set(
      copy
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
        .all()
        .map((_) => _.name)
    );
    tables
      .filter((_) => present.has(_))
      .forEach((_) => void copy.run(`DELETE FROM "${_}"`));
    copy.run('VACUUM');
  } finally {
    copy.close();
  }
};

/**
 * Согласованная копия базы, пока сайт работает: VACUUM INTO не блокирует читателей. Файл — только
 * владельцу: в нём хэши паролей. `without` — таблицы, которые не уходят с сервера (сеансы, ключ ИИ).
 */
export var backupDatabase = (
  db: Database,
  target: string,
  without: readonly string[] = []
): void => {
  db.run('VACUUM INTO ?', [target]);
  chmodSync(target, 0o600);
  void (without.length > 0 && _strip(target, without));
};

/** Рядом с базой остаются только `keep` последних копий с этим префиксом имени. */
export var keepNewest = (path: string, prefix: string, keep: number): void =>
  readdirSync(dirname(path))
    .filter((_) => _.startsWith(prefix) && _.endsWith('.db'))
    .toSorted()
    .slice(0, -keep)
    .forEach((_) => void rmSync(join(dirname(path), _), { force: true }));

export var copyPrefix = (databasePath: string, label: string): string =>
  `${basename(databasePath).replace(/\.db$/, '')}.${label}-`;
