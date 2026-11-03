import type { Database, Migration } from '../../../platform/database.ts';
import { imageSize } from '../domain/image-size.ts';
import type { MediaFile, MediaPath } from '../domain/media.ts';
import type { MediaContent, MediaRepository } from '../domain/ports.ts';

// Картинки, загруженные без размеров (агентом, через API): размеры — из заголовка самого файла. Список
// путей берётся из покрывающего индекса, BLOB читается по одному.
const _measureStored = (db: Database): void => {
  const read = db.query<{ data: Uint8Array }, [string]>(
    'SELECT data FROM media_files WHERE path = ?'
  );
  const update = db.query<unknown, [number, number, string]>(
    'UPDATE media_files SET width = ?, height = ? WHERE path = ?'
  );
  db.query<{ path: string }, []>(
    `SELECT path FROM media_files INDEXED BY media_files_meta
     WHERE (width IS NULL OR height IS NULL) AND content_type LIKE 'image/%'`
  )
    .all()
    .forEach(
      ({ path }) =>
        void ((size) => size && update.run(size.width, size.height, path))(
          imageSize(read.get(path)?.data ?? new Uint8Array(0))
        )
    );
};

// Файлы — BLOB в той же базе: бэкап сайта остаётся копией одного файла.
export var mediaMigrations: readonly Migration[] = [
  {
    id: 'media/001_files',
    sql: `
      CREATE TABLE media_files (
        path TEXT PRIMARY KEY,
        stem TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        data BLOB NOT NULL,
        updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX media_files_stem ON media_files (stem);
    `,
  },
  {
    id: 'media/002_alt',
    sql: `ALTER TABLE media_files ADD COLUMN alt TEXT NOT NULL DEFAULT '';`,
  },
  {
    // В таблице WITHOUT ROWID строка — это ключ целиком: поиск по path читает BLOB нужной строки и соседних
    // (десятки МБ, если рядом видео). Описание файла читается из покрывающих индексов, без BLOB.
    id: 'media/003_covering_indexes',
    sql: `
      DROP INDEX media_files_stem;
      CREATE INDEX media_files_meta
        ON media_files (path, content_type, size, hash, width, height, alt);
      CREATE INDEX media_files_stem
        ON media_files (stem, path, content_type, size, hash, width, height, alt);
    `,
  },
  { id: 'media/004_image_size', run: _measureStored },
];

type MetaRow = {
  path: string;
  content_type: string;
  size: number;
  hash: string;
  width: number | null;
  height: number | null;
  alt: string;
};

const _META = 'path, content_type, size, hash, width, height, alt';

const _toFile = (row: MetaRow): MediaFile => ({
  path: row.path as MediaPath,
  contentType: row.content_type,
  size: row.size,
  hash: row.hash,
  width: row.width,
  height: row.height,
  alt: row.alt,
});

export var defineMediaRepository = (
  db: Database,
  stemOf: (path: string) => string
): MediaRepository => {
  // Без INDEXED BY планировщик ищет по первичному ключу, то есть через BLOB.
  const meta = db.query<MetaRow, [string]>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_meta WHERE path = ?`
  );
  const content = db.query<MediaContent, [string]>(
    'SELECT hash, data FROM media_files WHERE path = ?'
  );
  // substr у BLOB считает байты с единицы.
  const chunk = db.query<{ data: Uint8Array }, [number, number, string]>(
    'SELECT substr(data, ?, ?) AS data FROM media_files WHERE path = ?'
  );
  const list = db.query<MetaRow, []>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_meta ORDER BY path`
  );
  const family = db.query<MetaRow, [string]>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_stem WHERE stem = ?`
  );
  const upsert = db.query(`
    INSERT INTO media_files (path, stem, content_type, size, hash, width, height, alt, data, updated_at)
    VALUES ($path, $stem, $contentType, $size, $hash, $width, $height, $alt, $data, $now)
    ON CONFLICT (path) DO UPDATE SET
      content_type = excluded.content_type, size = excluded.size, hash = excluded.hash,
      width = excluded.width, height = excluded.height, alt = excluded.alt,
      data = excluded.data, updated_at = excluded.updated_at`);
  const remove = db.query('DELETE FROM media_files WHERE path = ?');
  const describe = db.query('UPDATE media_files SET alt = ? WHERE path = ?');

  return {
    meta: (path) => {
      const row = meta.get(path);
      return row && _toFile(row);
    },
    content: (path) => content.get(path),
    chunk: (path, start, length) =>
      chunk.get(start + 1, length, path)?.data ?? null,
    list: () => list.all().map(_toFile),
    family: (stem) => family.all(stem).map(_toFile),
    save: (file, bytes) =>
      void upsert.run({
        ...file,
        stem: stemOf(file.path),
        data: bytes,
        now: new Date().toISOString(),
      }),
    remove: (path) => void remove.run(path),
    describe: (path, alt) => void describe.run(alt, path),
  };
};
