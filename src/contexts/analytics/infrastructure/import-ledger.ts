import { Database } from 'bun:sqlite';
import { rmSync } from 'node:fs';
import { tempPath } from '../../../platform/archive.ts';
import type { ImportLedger } from '../domain/ports.ts';

// Своя база на прогон: журнала и синхронизации нет — она живёт, пока идёт прогон, и удаляется после.
const _SCHEMA = [
  'PRAGMA journal_mode = OFF',
  'PRAGMA synchronous = OFF',
  'PRAGMA locking_mode = EXCLUSIVE',
  'CREATE TABLE seen (id TEXT PRIMARY KEY, hash TEXT NOT NULL) WITHOUT ROWID',
];

/**
 * Принятые строки пробного прогона загрузки — во временной базе на диске: в памяти процесса только её
 * кэш страниц. Временная база без имени файла у Bun лежит в памяти, поэтому — файл в своём каталоге (700).
 */
export var defineImportLedger = (): ImportLedger => {
  const path = tempPath();
  const db = new Database(path, { create: true, strict: true });
  _SCHEMA.forEach((_) => void db.run(_));
  const find = db.query<{ hash: string }, [string]>(
    'SELECT hash FROM seen WHERE id = ?'
  );
  const add = db.query<unknown, [string, string]>(
    'INSERT OR IGNORE INTO seen (id, hash) VALUES (?, ?)'
  );
  return {
    find: (id) => find.get(id)?.hash ?? null,
    add: (id, hash) => void add.run(id, hash),
    batch: (run) => db.transaction(run)(),
    close: () => (db.close(), void rmSync(path, { force: true })),
  };
};
