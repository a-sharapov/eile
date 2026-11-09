import {
  BLOB_CHUNK,
  chunkNumbers,
  chunkSpan,
  chunksOf,
  joinChunks,
} from '../../../platform/chunks.ts';
import type { Database, Migration } from '../../../platform/database.ts';
import { imageSize } from '../domain/image-size.ts';
import type { MediaLink } from '../domain/linked.ts';
import {
  type MediaFile,
  type MediaPath,
  stemOf,
  variantWidth,
} from '../domain/media.ts';
import type {
  LinkedRow,
  LinkTotals,
  MediaPiece,
  MediaRepository,
  UploadContent,
  VariantJob,
  VariantQueue,
} from '../domain/ports.ts';
import { takesVariants } from '../domain/variants.ts';

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

// Содержимое — в куски, файл за файлом: страницы, освобождённые одним файлом, занимают куски следующего,
// и база не вырастает на всю медиатеку. Запросы — свои и закрываются: колонка data исчезает.
const _toChunks = (db: Database): void => {
  db.run(`
    CREATE TABLE media_chunks (
      path TEXT NOT NULL,
      n INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (path, n)
    )`);
  const read = db.prepare<{ data: Uint8Array }, [string]>(
    'SELECT data FROM media_files WHERE path = ?'
  );
  const insert = db.prepare<unknown, [string, number, Uint8Array]>(
    'INSERT INTO media_chunks (path, n, data) VALUES (?, ?, ?)'
  );
  const clear = db.prepare<unknown, [string]>(
    "UPDATE media_files SET data = x'' WHERE path = ?"
  );
  db.query<{ path: string }, []>(
    'SELECT path FROM media_files INDEXED BY media_files_meta'
  )
    .all()
    .forEach(
      ({ path }) =>
        void (chunksOf(read.get(path)?.data ?? new Uint8Array(0)).forEach(
          (data, n) => void insert.run(path, n, data)
        ),
        clear.run(path))
    );
  [read, insert, clear].forEach((_) => void _.finalize());
  db.run('ALTER TABLE media_files DROP COLUMN data');
};

// Варианты размеров делает сервер (ADR 0046). Очередь сразу получает картинки, загруженные без вариантов
// (агентом, через API); у картинок с вариантами ничего не меняется, даже если их набор неполный.
const _queueVariants = (db: Database): void => {
  db.run(`
    CREATE TABLE media_variant_jobs (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      queued_at TEXT NOT NULL
    )`);
  const files = db
    .query<
      {
        path: string;
        content_type: string;
        hash: string;
        width: number | null;
      },
      []
    >('SELECT path, content_type, hash, width FROM media_files ORDER BY path')
    .all();
  const resized = new Set(
    files
      .filter((_) => variantWidth(_.path) !== null)
      .map((_) => stemOf(_.path))
  );
  const insert = db.query<unknown, [string, string, string]>(
    'INSERT INTO media_variant_jobs (path, hash, queued_at) VALUES (?, ?, ?)'
  );
  const now = new Date().toISOString();
  files
    .filter(
      (_) =>
        takesVariants({
          path: _.path as MediaPath,
          contentType: _.content_type,
          width: _.width,
        }) && !resized.has(stemOf(_.path))
    )
    .forEach((_) => void insert.run(_.path, _.hash, now));
};

// Файлы — в той же базе: бэкап сайта остаётся копией одного файла.
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
  { id: 'media/005_chunks', run: _toChunks },
  { id: 'media/006_variant_jobs', run: _queueVariants },
  {
    // Связанные папки (ADR 0065): у файла папки — приставка папки и путь на диске, кусков нет; у его варианта
    // путь на диске пустой, байты — в кэше медиатеки. Индексы описания снова покрывающие.
    id: 'media/007_linked_folders',
    sql: `
      ALTER TABLE media_files ADD COLUMN link TEXT;
      ALTER TABLE media_files ADD COLUMN file TEXT;
      ALTER TABLE media_files ADD COLUMN mtime INTEGER;
      DROP INDEX media_files_meta;
      DROP INDEX media_files_stem;
      CREATE INDEX media_files_meta
        ON media_files (path, content_type, size, hash, width, height, alt, link, file);
      CREATE INDEX media_files_stem
        ON media_files (stem, path, content_type, size, hash, width, height, alt, link, file);
      CREATE UNIQUE INDEX media_files_linked ON media_files (link, file) WHERE file IS NOT NULL;
      CREATE TABLE media_links (
        prefix TEXT PRIMARY KEY,
        root TEXT NOT NULL,
        serve_original INTEGER NOT NULL DEFAULT 0,
        linked_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );
    `,
  },
  {
    // Папка-сайт (ADR 0068): связанная папка, которая отдаётся статическим сайтом; строк файлов у неё нет.
    id: 'media/008_static_sites',
    sql: 'ALTER TABLE media_links ADD COLUMN static_site INTEGER NOT NULL DEFAULT 0;',
  },
];

type MetaRow = {
  path: string;
  content_type: string;
  size: number;
  hash: string;
  width: number | null;
  height: number | null;
  alt: string;
  link: string | null;
  file: string | null;
};

const _META = 'path, content_type, size, hash, width, height, alt, link, file';

const _toFile = (row: MetaRow): MediaFile => ({
  path: row.path as MediaPath,
  contentType: row.content_type,
  size: row.size,
  hash: row.hash,
  width: row.width,
  height: row.height,
  alt: row.alt,
  ...(row.link === null
    ? {}
    : { linked: { prefix: row.link, file: row.file } }),
});

type LinkRow = {
  prefix: string;
  root: string;
  serve_original: number;
  static_site: number;
  linked_at: string;
  synced_at: string;
};

const _toLink = (row: LinkRow): MediaLink => ({
  prefix: row.prefix,
  root: row.root,
  serveOriginal: row.serve_original === 1,
  staticSite: row.static_site === 1,
  linkedAt: row.linked_at,
  syncedAt: row.synced_at,
});

const _LINK = 'prefix, root, serve_original, static_site, linked_at, synced_at';

export var defineMediaRepository = (
  db: Database,
  stemOf: (path: string) => string
): MediaRepository => {
  // Без INDEXED BY планировщик ищет по первичному ключу, то есть через BLOB.
  const meta = db.query<MetaRow, [string]>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_meta WHERE path = ?`
  );
  // Кусок и хэш — одним запросом: кусок другой версии файла не выдаст себя за эту.
  const piece = db.query<MediaPiece, [string, number]>(
    `SELECT f.hash, c.data FROM media_chunks c
     JOIN media_files f INDEXED BY media_files_meta ON f.path = c.path
     WHERE c.path = ? AND c.n = ?`
  );
  const span = db.query<{ data: Uint8Array }, [string, number, number]>(
    'SELECT data FROM media_chunks WHERE path = ? AND n BETWEEN ? AND ? ORDER BY n'
  );
  const list = db.query<MetaRow, []>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_meta ORDER BY path`
  );
  const family = db.query<MetaRow, [string]>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_stem WHERE stem = ?`
  );
  const upsert = db.query(`
    INSERT INTO media_files (path, stem, content_type, size, hash, width, height, alt, link, file, mtime, updated_at)
    VALUES ($path, $stem, $contentType, $size, $hash, $width, $height, $alt, $link, $file, $mtime, $now)
    ON CONFLICT (path) DO UPDATE SET
      content_type = excluded.content_type, size = excluded.size, hash = excluded.hash,
      width = excluded.width, height = excluded.height, alt = excluded.alt,
      link = excluded.link, file = excluded.file, mtime = excluded.mtime,
      updated_at = excluded.updated_at`);
  const original = db.query<MetaRow, [string, string]>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_linked WHERE link = ? AND file = ?`
  );
  const linked = db.query<MetaRow & { mtime: number | null }, [string]>(
    `SELECT ${_META}, mtime FROM media_files WHERE link = ? AND file IS NOT NULL ORDER BY file`
  );
  const mtime = db.query<{ mtime: number | null }, [string]>(
    'SELECT mtime FROM media_files WHERE path = ?'
  );
  const derived = db.query<MetaRow, []>(
    `SELECT ${_META} FROM media_files INDEXED BY media_files_meta
     WHERE link IS NOT NULL AND file IS NULL ORDER BY path`
  );
  const links = db.query<LinkRow, []>(
    `SELECT ${_LINK} FROM media_links ORDER BY prefix`
  );
  const link = db.query<LinkRow, [string]>(
    `SELECT ${_LINK} FROM media_links WHERE prefix = ?`
  );
  const saveLink = db.query(`
    INSERT INTO media_links (${_LINK})
    VALUES ($prefix, $root, $serveOriginal, $staticSite, $linkedAt, $syncedAt)
    ON CONFLICT (prefix) DO UPDATE SET
      root = excluded.root, serve_original = excluded.serve_original,
      static_site = excluded.static_site, synced_at = excluded.synced_at`);
  const removeLink = db.query('DELETE FROM media_links WHERE prefix = ?');
  const totals = db.query<{ link: string; files: number; bytes: number }, []>(
    `SELECT link, count(*) AS files, coalesce(sum(size), 0) AS bytes FROM media_files
     WHERE link IS NOT NULL AND file IS NOT NULL GROUP BY link`
  );
  const removeFile = db.query('DELETE FROM media_files WHERE path = ?');
  const removeChunks = db.query('DELETE FROM media_chunks WHERE path = ?');
  const insertChunk = db.query<unknown, [string, number, Uint8Array]>(
    'INSERT INTO media_chunks (path, n, data) VALUES (?, ?, ?)'
  );
  const describe = db.query('UPDATE media_files SET alt = ? WHERE path = ?');
  const row = (file: MediaFile, mtime: number | null) => ({
    path: file.path,
    stem: stemOf(file.path),
    contentType: file.contentType,
    size: file.size,
    hash: file.hash,
    width: file.width,
    height: file.height,
    alt: file.alt,
    link: file.linked?.prefix ?? null,
    file: file.linked?.file ?? null,
    mtime,
    now: new Date().toISOString(),
  });
  // Описание и куски меняются вместе: читатель не увидит хэш одной версии рядом с кусками другой. У файла
  // связанной папки и его варианта кусков нет: байты на диске.
  const save = db.transaction((file: MediaFile, content: UploadContent) => {
    upsert.run(row(file, null));
    removeChunks.run(file.path);
    (file.linked ? [] : chunkNumbers(content.size)).forEach(
      (n) =>
        void insertChunk.run(
          file.path,
          n,
          content.read(n * BLOB_CHUNK, (n + 1) * BLOB_CHUNK)
        )
    );
  });
  const remove = db.transaction((path: MediaPath) => {
    removeFile.run(path);
    removeChunks.run(path);
  });

  return {
    meta: (path) => {
      const row = meta.get(path);
      return row && _toFile(row);
    },
    piece: (path, n) => piece.get(path, n),
    chunk: (path, start, length) =>
      ((rows) =>
        rows.length === 0
          ? null
          : joinChunks(
              rows.map((_) => _.data),
              start,
              length
            ))(length > 0 ? span.all(path, ...chunkSpan(start, length)) : []),
    list: () => list.all().map(_toFile),
    family: (stem) => family.all(stem).map(_toFile),
    save: (file, content) => void save(file, content),
    remove: (path) => void remove(path),
    describe: (path, alt) => void describe.run(alt, path),
    transaction: (run) => db.transaction(run)(),
    original: (prefix, file) =>
      ((found) => found && _toFile(found))(original.get(prefix, file)),
    linked: (prefix): LinkedRow[] =>
      linked.all(prefix).map((_) => ({ ..._toFile(_), mtime: _.mtime })),
    mtime: (path) => mtime.get(path)?.mtime ?? null,
    place: (file, mtime) => void upsert.run(row(file, mtime)),
    derived: () => derived.all().map(_toFile),
    links: {
      list: () => links.all().map(_toLink),
      get: (prefix) => ((found) => found && _toLink(found))(link.get(prefix)),
      save: (_) =>
        void saveLink.run({
          prefix: _.prefix,
          root: _.root,
          serveOriginal: _.serveOriginal ? 1 : 0,
          staticSite: _.staticSite ? 1 : 0,
          linkedAt: _.linkedAt,
          syncedAt: _.syncedAt,
        }),
      remove: (prefix) => void removeLink.run(prefix),
      totals: () =>
        new Map<string, LinkTotals>(
          totals
            .all()
            .map((_) => [_.link, { files: _.files, bytes: _.bytes }] as const)
        ),
    },
  };
};

export var defineVariantQueue = (db: Database): VariantQueue => {
  const add = db.query<unknown, [string, string, string]>(`
    INSERT INTO media_variant_jobs (path, hash, attempts, queued_at) VALUES (?, ?, 0, ?)
    ON CONFLICT (path) DO UPDATE SET
      hash = excluded.hash, attempts = 0, queued_at = excluded.queued_at`);
  const next = db.query<VariantJob, []>(
    'SELECT path, hash, attempts FROM media_variant_jobs ORDER BY queued_at, path LIMIT 1'
  );
  const attempt = db.query<unknown, [string]>(
    'UPDATE media_variant_jobs SET attempts = attempts + 1 WHERE path = ?'
  );
  const done = db.query<unknown, [string, string]>(
    'DELETE FROM media_variant_jobs WHERE path = ? AND hash = ?'
  );
  const size = db.query<{ n: number }, []>(
    'SELECT count(*) AS n FROM media_variant_jobs'
  );
  const take = db.transaction((): VariantJob | null =>
    ((job) =>
      job && (attempt.run(job.path), { ...job, attempts: job.attempts + 1 }))(
      next.get()
    )
  );
  return {
    add: (path, hash) => void add.run(path, hash, new Date().toISOString()),
    take: () => take(),
    done: (path, hash) => void done.run(path, hash),
    size: () => size.get()!.n,
  };
};
