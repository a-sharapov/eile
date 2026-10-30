import { Database } from 'bun:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail } from '../shared/kernel/errors.ts';
import { backupDatabase, type Migration, migrate } from './database.ts';

// Копия сайта — сама база SQLite (.db) или её записи в JSON. Оба вида восстанавливаются одним путём:
// JSON собирается во временную базу, база приводится к текущей схеме, записи переносятся в рабочую.

type Row = Record<string, unknown>;

/** Записи сайта текстом: таблица → строки; BLOB — `{ "$base64": "…" }`. */
export type Archive = {
  readonly format: 'cms-archive';
  readonly version: 1;
  readonly createdAt: string;
  /** Применённые миграции: по ним восстановление поймёт схему копии. */
  readonly migrations: readonly string[];
  readonly tables: Readonly<Record<string, readonly Row[]>>;
};

const _SQLITE_HEADER = 'SQLite format 3\u0000';

export var isSqlite = (bytes: Uint8Array): boolean =>
  new TextDecoder().decode(bytes.subarray(0, 16)) === _SQLITE_HEADER;

// Временные копии — в своём каталоге (700): в общем /tmp их прочёл бы любой пользователь машины.
let _private: string | null = null;

/** Временный файл для копии; удалить — `Bun.file(path).delete()`. */
export var tempPath = (): string =>
  join(
    (_private ??= mkdtempSync(join(tmpdir(), 'cms-'))),
    `${crypto.randomUUID()}.db`
  );

// Временная база закрывается и при ошибке: иначе файл останется занятым.
const _using = <T>(path: string, run: (db: Database) => T): T => {
  const db = new Database(path, { create: true, strict: true });
  try {
    return run(db);
  } finally {
    db.close();
  }
};

const _tables = (db: Database, schema = 'main'): string[] =>
  db
    .query<{ name: string }, []>(
      `SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations' ORDER BY name`
    )
    .all()
    .map((_) => _.name);

const _columns = (db: Database, table: string, schema = 'main'): string[] =>
  db
    .query<{ name: string }, []>(`PRAGMA ${schema}.table_info("${table}")`)
    .all()
    .map((_) => _.name);

const _applied = (db: Database): string[] =>
  db
    .query<{ id: string }, []>('SELECT id FROM _migrations ORDER BY rowid')
    .all()
    .map((_) => _.id);

const _hasLog = (db: Database): boolean =>
  db
    .query<{ n: number }, []>(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = '_migrations'"
    )
    .get()!.n > 0;

/** Снимок базы, пока сайт работает: VACUUM INTO во временный файл без `skip`, файл — в память. */
export var snapshot = (
  db: Database,
  skip: readonly string[] = []
): Promise<Uint8Array> =>
  ((path) => (
    backupDatabase(db, path, skip),
    Bun.file(path)
      .bytes()
      .then((bytes) =>
        Bun.file(path)
          .delete()
          .then(() => bytes)
      )
  ))(tempPath());

const _toJson = (value: unknown): unknown =>
  value instanceof Uint8Array
    ? { $base64: Buffer.from(value).toString('base64') }
    : value;

const _fromJson = (value: unknown): unknown =>
  value !== null &&
  typeof value === 'object' &&
  '$base64' in value &&
  typeof value.$base64 === 'string'
    ? new Uint8Array(Buffer.from(value.$base64, 'base64'))
    : value;

/** Записи всех таблиц текстом; `skip` — таблицы, которым в копии не место (сеансы входа). */
export var exportArchive = (
  db: Database,
  skip: readonly string[] = []
): Archive => ({
  format: 'cms-archive',
  version: 1,
  createdAt: new Date().toISOString(),
  migrations: _applied(db),
  tables: Object.fromEntries(
    _tables(db)
      .filter((_) => !skip.includes(_))
      .map((table) => [
        table,
        db
          .query<Row, []>(`SELECT * FROM "${table}"`)
          .all()
          .map((row) =>
            Object.fromEntries(
              Object.entries(row).map(({ 0: key, 1: value }) => [
                key,
                _toJson(value),
              ])
            )
          ),
      ])
  ),
});

// Копия из более новой версии: в ней миграции, которых эта программа не знает.
const _checkKnown = (
  applied: readonly string[],
  migrations: readonly Migration[]
): void =>
  void (
    applied.every((id) => migrations.some((_) => _.id === id)) ||
    fail(
      'backup.newer',
      'The backup was made by a newer version: update before restoring'
    )
  );

// Загруженный файл — чужой: его представления и триггеры не исполняют функций, целостность проверяется.
const _distrust = (copy: Database): void => {
  copy.run('PRAGMA trusted_schema = OFF');
  void (
    copy.query<{ quick_check: string }, []>('PRAGMA quick_check').get()
      ?.quick_check === 'ok' ||
    fail('backup.corrupt', 'The database file is damaged')
  );
};

/** Копия .db проверяется и приводится к текущей схеме прямо в своём временном файле. */
export var prepareDatabase = (
  path: string,
  migrations: readonly Migration[]
): void =>
  _using(
    path,
    (copy) => (
      _distrust(copy),
      _hasLog(copy)
        ? (_checkKnown(_applied(copy), migrations), migrate(copy, migrations))
        : fail('backup.foreign', 'Not a site database')
    )
  );

const _insert = (db: Database, table: string, row: Row): void =>
  ((known) =>
    ((keys) =>
      void (
        keys.length > 0 &&
        db
          .query(
            `INSERT INTO "${table}" (${keys.map((_) => `"${_}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
          )
          .run(...(keys.map((_) => _fromJson(row[_])) as never[]))
      ))(Object.keys(row).filter((_) => known.has(_))))(
    new Set(_columns(db, table))
  );

/** JSON копии — в базу по `path`: схема как у копии, её записи, затем недостающие миграции. */
export var databaseFromArchive = (
  archive: Archive,
  path: string,
  migrations: readonly Migration[]
): void =>
  archive?.format === 'cms-archive' && archive.version === 1
    ? (_checkKnown(archive.migrations, migrations),
      _using(path, (copy) => {
        migrate(
          copy,
          migrations.filter((_) => archive.migrations.includes(_.id))
        );
        // Таблицы — только те, что создали миграции: имя из JSON не попадает в SQL как есть.
        ((known) =>
          copy.transaction(() =>
            Object.entries(archive.tables ?? {})
              .filter(({ 0: table }) => known.has(table))
              .forEach(
                ({ 0: table, 1: rows }) =>
                  void (Array.isArray(rows) ? rows : []).forEach(
                    (row) => void _insert(copy, table, row)
                  )
              )
          )())(new Set(_tables(copy)));
        migrate(copy, migrations);
      }))
    : fail('backup.invalid', 'The JSON is not a site backup');

const _copyTable = (db: Database, table: string): void =>
  ((shared) => {
    db.run(`DELETE FROM main."${table}"`);
    void (
      shared &&
      db.run(
        `INSERT INTO main."${table}" (${shared}) SELECT ${shared} FROM backup."${table}"`
      )
    );
  })(
    _columns(db, table, 'backup')
      .filter((_) => _columns(db, table).includes(_))
      .map((_) => `"${_}"`)
      .join(', ')
  );

/**
 * Записи копии — в рабочую базу одной транзакцией: каждая таблица очищается и заполняется из копии
 * по общим столбцам. `keep` — таблицы, которые остаются как есть (сеансы тех, кто сейчас вошёл).
 */
export var restoreDatabase = (
  db: Database,
  source: string,
  keep: readonly string[] = []
): void => {
  db.run('ATTACH DATABASE ? AS backup', [source]);
  db.run('PRAGMA foreign_keys = OFF');
  db.run('PRAGMA trusted_schema = OFF');
  try {
    // Из копии берутся только настоящие таблицы: представление под именем таблицы не читается.
    const tables = new Set(_tables(db, 'backup'));
    db.transaction(() =>
      _tables(db)
        .filter((_) => !keep.includes(_))
        .forEach(
          (_) =>
            void (tables.has(_)
              ? _copyTable(db, _)
              : db.run(`DELETE FROM main."${_}"`))
        )
    )();
  } finally {
    db.run('PRAGMA trusted_schema = ON');
    db.run('PRAGMA foreign_keys = ON');
    db.run('DETACH DATABASE backup');
  }
};
