import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import {
  backupDatabase,
  type Database,
  keepNewest,
} from '../../../platform/database.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import type { Copier } from '../domain/ports.ts';
import { copyPrefix } from '../domain/schedule.ts';

/** Имя файла базы без `.db`: site.db → site. */
export var databaseName = (path: string): string =>
  basename(path).replace(/\.db$/, '');

/**
 * Автокопии — тем же снимком, что и ручная копия: VACUUM INTO без сеансов и ключа ИИ, права 600.
 * Пишется во временный `.part` и переименовывается: оборванная копия не займёт место настоящей.
 */
export var defineCopier = ({
  db,
  path,
  without,
}: {
  db: Database;
  path: string;
  without: readonly string[];
}): Copier => {
  const memory = path === ':memory:';
  const folder: Copier['folder'] = (schedule) =>
    memory
      ? ''
      : ((dir) => (isAbsolute(dir) ? dir : resolve(dirname(path), dir)))(
          schedule.folder || 'backups'
        );
  const write = (dir: string, name: string, keep: number) => {
    const target = join(dir, name);
    const part = `${target}.part`;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    rmSync(part, { force: true });
    backupDatabase(db, part, without);
    renameSync(part, target);
    keepNewest(target, copyPrefix(databaseName(path)), keep);
    return { file: target, size: statSync(target).size };
  };
  return {
    folder,
    copy: (schedule, name) =>
      write(
        memory
          ? fail(
              'upkeep.memory_database',
              'An in-memory database has no file to copy'
            )
          : folder(schedule),
        name,
        schedule.keep
      ),
  };
};
