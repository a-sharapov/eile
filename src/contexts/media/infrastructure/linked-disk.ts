import { type Dirent, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { openFile } from '../../../platform/body.ts';
import { isJunk, posixPath } from '../../../platform/paths.ts';
import { attempt } from '../../../shared/kernel/errors.ts';
import type {
  DiskEntry,
  DiskFile,
  FolderScan,
  LinkedDisk,
  ScannedFile,
} from '../domain/ports.ts';

const _inside = (root: string, path: string): boolean =>
  path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);

// Сам корень папки — тоже внутри неё: адрес `/<приставка>/` ведёт на её index.html.
const _within = (root: string, path: string): boolean =>
  path === root || _inside(root, path);

const _real = (path: string): string | null =>
  attempt(
    () => realpathSync(path),
    () => null
  );

const _EMPTY: FolderScan = { files: [], escaped: [] };

const _merge = (a: FolderScan, b: FolderScan): FolderScan => ({
  files: [...a.files, ...b.files],
  escaped: [...a.escaped, ...b.escaped],
});

const _entry = (file: string, real: string): ScannedFile | null =>
  ((stat) =>
    stat?.isFile()
      ? { file, size: stat.size, mtime: Math.trunc(stat.mtimeMs) }
      : null)(
    attempt(
      () => statSync(real),
      () => null
    )
  );

// Символьная ссылка внутри папки — файл или папка по её настоящему пути; наружу — в `escaped`, не читается.
// Папка, где обход уже был (петля ссылок), второй раз не обходится. Порядок — по кодам символов имён, а не как
// отдаёт файловая система (ext4 — по хэшу): одна папка — один отчёт и одни пути `-2` на любой машине.
const _walk = (root: string, at: string, seen: Set<string>): FolderScan =>
  attempt(
    () =>
      readdirSync(at === '' ? root : join(root, at), { withFileTypes: true }),
    () => [] as Dirent[]
  )
    .filter((_) => !_.name.startsWith('.'))
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((dirent): FolderScan => {
      const file = at === '' ? dirent.name : `${at}/${dirent.name}`;
      const real = dirent.isSymbolicLink()
        ? _real(join(root, file))
        : join(root, file);
      const folder =
        real !== null &&
        (dirent.isDirectory() ||
          (dirent.isSymbolicLink() &&
            attempt(
              () => statSync(real).isDirectory(),
              () => false
            )));
      return isJunk(folder ? `${file}/` : file)
        ? _EMPTY
        : real === null || (dirent.isSymbolicLink() && !_inside(root, real))
          ? { files: [], escaped: [file] }
          : folder
            ? seen.has(real)
              ? _EMPTY
              : (seen.add(real), _walk(root, file, seen))
            : ((found) => (found ? { files: [found], escaped: [] } : _EMPTY))(
                _entry(file, real)
              );
    })
    .reduce(_merge, _EMPTY);

/**
 * Диск связанных папок. `base` — каталог файла базы: путь к папке внутри него записывается от него, и база с
 * папкой переезжают вместе; у базы в памяти — от текущего каталога.
 */
export var defineLinkedDisk = (base: string | null): LinkedDisk => ({
  absolute: (root) =>
    isAbsolute(root) ? root : resolve(base ?? process.cwd(), root),
  stored: (dir) =>
    ((absolute) =>
      ((path) =>
        base !== null &&
        path !== '' &&
        !path.startsWith('..') &&
        !isAbsolute(path)
          ? posixPath(path)
          : absolute)(base === null ? '' : relative(base, absolute)))(
      resolve(dir)
    ),
  scan: (dir) =>
    ((root) =>
      root !== null &&
      attempt(
        () => statSync(root).isDirectory(),
        () => false
      )
        ? _walk(root, '', new Set([root]))
        : null)(_real(dir)),
  locate: (dir, file): DiskFile | null =>
    ((root) =>
      ((real) =>
        root !== null && real !== null && _inside(root, real)
          ? ((stat) =>
              stat?.isFile()
                ? {
                    path: real,
                    size: stat.size,
                    mtime: Math.trunc(stat.mtimeMs),
                  }
                : null)(
              attempt(
                () => statSync(real),
                () => null
              )
            )
          : null)(root === null ? null : _real(join(root, file))))(_real(dir)),
  entry: (dir, file): DiskEntry | null =>
    ((root) =>
      ((real) =>
        root !== null && real !== null && _within(root, real)
          ? ((stat) =>
              stat?.isFile()
                ? {
                    kind: 'file' as const,
                    path: real,
                    size: stat.size,
                    mtime: Math.trunc(stat.mtimeMs),
                  }
                : stat?.isDirectory()
                  ? { kind: 'folder' as const }
                  : null)(
              attempt(
                () => statSync(real),
                () => null
              )
            )
          : null)(root === null ? null : _real(join(root, file))))(_real(dir)),
  exists: (dir) =>
    attempt(
      () => statSync(dir).isDirectory(),
      () => false
    ),
  open: (path) => openFile(path),
  blob: (path) => Bun.file(path),
});
