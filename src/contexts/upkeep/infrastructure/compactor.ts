import { statfsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  compactDatabase,
  type Database,
  databaseSpace,
} from '../../../platform/database.ts';
import type { Compactor } from '../domain/ports.ts';

/** Сжатие файла базы; у базы в памяти места на диске не считается. */
export var defineCompactor = ({
  db,
  path,
}: {
  db: Database;
  path: string;
}): Compactor => ({
  space: () => databaseSpace(db),
  compact: () =>
    ((started) => (
      compactDatabase(db), Math.round(performance.now() - started)
    ))(performance.now()),
  diskFree: () =>
    path === ':memory:'
      ? Number.POSITIVE_INFINITY
      : ((_) => _.bavail * _.bsize)(statfsSync(dirname(path))),
});
