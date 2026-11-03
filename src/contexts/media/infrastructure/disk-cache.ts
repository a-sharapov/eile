import { mkdirSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { attempt } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { MediaFile } from '../domain/media.ts';
import type { MediaCache, MediaPiece } from '../domain/ports.ts';

/** Каталог кэша рядом с базой: site.db → site.media-cache; у базы в памяти кэша нет. */
export var mediaCacheDir = (databasePath: string): string | null =>
  databasePath === ':memory:'
    ? null
    : join(
        dirname(databasePath),
        `${basename(databasePath).replace(/\.db$/, '')}.media-cache`
      );

// Папка файла — его путь, где «/» стал «~»: в пути медиатеки только латиница, цифры и `._@-`, сегмент
// начинается с буквы или цифры. Имя обратимо, не длиннее 255 и не выходит из каталога кэша.
const _FOLDER = /^[a-z0-9][a-z0-9._@-]*(~[a-z0-9][a-z0-9._@-]*)*$/;
// Версия — хэш содержимого (`MediaFile.hash`); недописанная — `.<хэш>.<uuid>.part` рядом.
const _VERSION = /^[0-9a-f]{16}$/;
const _PART = /^\.[0-9a-f]{16}\.[0-9a-f-]+\.part$/;
// Тело загрузки, пока оно разбирается, — в корне каталога: `.upload.<uuid>.part`.
const _UPLOAD = /^\.upload\.[0-9a-f-]+\.part$/;

// Недописанный файл старше часа — остаток упавшего процесса; моложе — его, возможно, ещё пишут.
const _STALE_PART_MS = 3_600_000;
// После сбоя записи кэш минуту не пишет: не перечитывать большие файлы из базы на каждом промахе.
const _PAUSE_MS = 60_000;

const _folderOf = (path: string): string | null =>
  ((name) => (name.length <= 255 && _FOLDER.test(name) ? name : null))(
    path.replaceAll('/', '~')
  );

// Файл версии: <каталог>/<папка файла>/<хэш>; null — путь или хэш в имя не годятся.
const _target = (dir: string, file: MediaFile): string | null =>
  ((folder) =>
    folder !== null && _VERSION.test(file.hash)
      ? join(dir, folder, file.hash)
      : null)(_folderOf(file.path));

const _isFolder = (name: string): boolean =>
  _FOLDER.test(name) && name.includes('.');

const _fresh = (file: string, size: number): boolean =>
  attempt(
    () => statSync(file, { throwIfNoEntry: false })?.size === size,
    () => false
  );

const _modified = (file: string): number =>
  attempt(
    () => statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? Infinity,
    () => Infinity
  );

const _unlink = (file: string): number =>
  attempt(
    () => (rmSync(file, { force: true }), 1),
    () => 0
  );

// Удаляются только свои имена: версии, кроме `keep`, и недописанные файлы старше `before`.
const _prune = (folder: string, keep: string | null, before: number): number =>
  attempt(
    () => readdirSync(folder),
    () => [] as string[]
  )
    .filter(
      (_) =>
        (_VERSION.test(_) && _ !== keep) ||
        (_PART.test(_) && _modified(join(folder, _)) < before)
    )
    .reduce((removed, _) => removed + _unlink(join(folder, _)), 0);

// Опустевшая папка уходит; непустую rmdir не тронет.
const _tidy = (folder: string, keep: string | null, before: number): number =>
  ((removed) => (
    attempt(
      () => rmdirSync(folder),
      () => undefined
    ),
    removed
  ))(_prune(folder, keep, before));

// Куски из базы — в файл по одному: в памяти один кусок, а не весь файл. Кусок другой версии (файл
// заменили, пока шла выгрузка) обрывает поток: под этим хэшем другого содержимого быть не может.
const _pieces = (
  file: MediaFile,
  piece: (n: number) => MediaPiece | null
): ReadableStream<Uint8Array> => {
  let n = 0;
  let size = 0;
  return new ReadableStream(
    {
      pull: (controller) =>
        ((found) =>
          found === null || found.hash !== file.hash
            ? controller.close()
            : ((n += 1),
              (size += found.data.byteLength),
              controller.enqueue(found.data)))(
          size < file.size ? piece(n) : null
        ),
    },
    { highWaterMark: 0 }
  );
};

// Временный файл в той же папке и переименование: недописанный файл не отдаётся никогда. Ответ false —
// выгрузка оборвалась на другой версии файла, временный файл удалён.
const _write = (
  target: string,
  file: MediaFile,
  piece: (n: number) => MediaPiece | null
): Promise<boolean> =>
  ((part) =>
    Promise.resolve(dirname(target))
      .then(
        pipe(
          (_: string) => mkdir(_, { recursive: true, mode: 0o700 }),
          () => Bun.write(part, new Response(_pieces(file, piece))),
          (written) =>
            written === file.size
              ? rename(part, target).then(() => true)
              : rm(part, { force: true }).then(() => false)
        )
      )
      .then(undefined, (error) =>
        rm(part, { force: true }).then(
          () => Promise.reject(error),
          () => Promise.reject(error)
        )
      ))(
    join(dirname(target), `.${basename(target)}.${Bun.randomUUIDv7()}.part`)
  );

const _NONE: MediaCache = {
  local: () => Promise.resolve(null),
  forget: () => undefined,
  sweep: () => 0,
  spool: () => null,
};

const _disk = (dir: string, now: () => number): MediaCache => {
  const pending = new Map<string, Promise<Blob | null>>();
  let resumeAt = 0;
  let warned = false;

  const failed = (error: unknown): null => (
    void (
      warned ||
      console.error(
        `Media cache ${dir} is not writable, media are served from the database: ${error instanceof Error ? error.message : String(error)}`
      )
    ),
    (warned = true),
    (resumeAt = now() + _PAUSE_MS),
    null
  );

  // Файл заменили или удалили, пока шёл запрос, — этот ответ уйдёт из базы.
  const extract = (
    target: string,
    file: MediaFile,
    piece: (n: number) => MediaPiece | null
  ): Promise<Blob | null> =>
    _write(target, file, piece).then(
      (whole) => (whole ? Bun.file(target) : null),
      failed
    );

  // Одновременные промахи по одному файлу ждут одну выгрузку.
  const once = (
    target: string,
    run: () => Promise<Blob | null>
  ): Promise<Blob | null> =>
    pending.get(target) ??
    ((started) => (pending.set(target, started), started))(
      run().finally(() => void pending.delete(target))
    );

  const local: MediaCache['local'] = (file, piece) =>
    ((target) =>
      target === null
        ? Promise.resolve(null)
        : _fresh(target, file.size)
          ? Promise.resolve(Bun.file(target))
          : now() < resumeAt
            ? Promise.resolve(null)
            : once(target, () => extract(target, file, piece)))(
      _target(dir, file)
    );

  return {
    local,
    forget: (path, keep) =>
      void ((folder) => folder && _prune(join(dir, folder), keep, -Infinity))(
        _folderOf(path)
      ),
    sweep: (live) =>
      ((keep, before, entries) =>
        entries
          .filter((_) => _.isDirectory() && _isFolder(_.name))
          .reduce(
            (removed, _) =>
              removed +
              _tidy(join(dir, _.name), keep.get(_.name) ?? null, before),
            0
          ) +
        entries
          .filter(
            (_) =>
              _.isFile() &&
              _UPLOAD.test(_.name) &&
              _modified(join(dir, _.name)) < before
          )
          .reduce((removed, _) => removed + _unlink(join(dir, _.name)), 0))(
        new Map(live.map((_) => [_folderOf(_.path), _.hash])),
        now() - _STALE_PART_MS,
        attempt(
          () => readdirSync(dir, { withFileTypes: true }),
          () => []
        )
      ),
    // Пока кэш отдыхает после сбоя записи, тело загрузки идёт в память.
    spool: () =>
      now() < resumeAt
        ? null
        : attempt(
            () => (
              mkdirSync(dir, { recursive: true, mode: 0o700 }),
              join(dir, `.upload.${Bun.randomUUIDv7()}.part`)
            ),
            failed
          ),
  };
};

/** Кэш медиатеки в каталоге `dir`; null — без кэша, файлы отдаются из базы. */
export var defineMediaCache = ({
  dir,
  now = Date.now,
}: {
  dir: string | null;
  now?: () => number;
}): MediaCache => (dir === null ? _NONE : _disk(dir, now));
