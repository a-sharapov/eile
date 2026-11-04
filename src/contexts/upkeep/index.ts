import type { Database } from '../../platform/database.ts';
import type { Report } from '../../shared/kernel/report.ts';
import { defineUpkeepService } from './application/upkeep-service.ts';
import type { Remote } from './domain/ports.ts';
import type { BackupSchedule } from './domain/schedule.ts';
import { startUpkeep } from './infrastructure/background.ts';
import { defineCompactor } from './infrastructure/compactor.ts';
import { databaseName, defineCopier } from './infrastructure/copier.ts';
import { defineReleases } from './infrastructure/releases.ts';
import { backupKeys, s3Remote } from './infrastructure/s3-store.ts';
import {
  defineOffsiteRepository,
  defineUpkeepRepository,
} from './infrastructure/sqlite-upkeep.ts';

export type {
  BackupStatus,
  DatabaseStatus,
  OffsiteChange,
  OffsiteStatus,
  UpdateStatus,
  UpkeepApplied,
  UpkeepServerSettings,
  UpkeepService,
} from './application/upkeep-service.ts';
export type { CompactRun, DatabaseSpace } from './domain/compaction.ts';
export {
  latestCopy,
  type OffsiteSettings,
  parseOffsite,
  type RemoteCopy,
} from './domain/offsite.ts';
export type { RemoteStore, RemoteTarget } from './domain/ports.ts';
export {
  parseReleasesUrl,
  safeDownload,
} from './domain/releases-url.ts';
export type {
  BackupFailure,
  BackupRun,
  BackupSchedule,
} from './domain/schedule.ts';
export type { Release, UpdateInfo } from './domain/version.ts';
export { compareVersions } from './domain/version.ts';
export {
  buildTarget,
  checksumOf,
  restorePrevious,
  type UpdateResult,
  updateProgram,
} from './infrastructure/installer.ts';
export { upkeepMigrations } from './infrastructure/migrations.ts';
export {
  defineReleases,
  type Fetch,
  GITHUB_API,
} from './infrastructure/releases.ts';
export { s3Remote } from './infrastructure/s3-store.ts';

/** Таблицы контекста: настройки сервера, хранилище копий и его ключ — в копию сайта не попадают. */
export var UPKEEP_SERVER_TABLES: readonly string[] = [
  'upkeep_settings',
  'upkeep_offsite',
];

/** Контекст upkeep: автокопии сайта по расписанию и проверка обновлений программы. */
export var defineUpkeep = ({
  db,
  path,
  without,
  clock,
  report,
  version,
  repository,
  releasesUrl,
  updateCheck,
  tidy,
  remote = s3Remote,
}: {
  db: Database;
  /** Файл базы; `:memory:` — автокопий нет. */
  path: string;
  /** Таблицы, которых нет в копиях: сеансы, ключи. */
  without: readonly string[];
  clock: () => Date;
  report: Report;
  version: string;
  /** Репозиторий релизов: owner/name. */
  repository: string;
  /** Проверенный адрес API релизов вместо GitHub (`parseReleasesUrl`). */
  releasesUrl?: string;
  updateCheck: boolean;
  /** Уборка раз в сутки: файлы, которые больше не нужны (кэш медиатеки). */
  tidy: () => unknown;
  /** Хранилище копий; по умолчанию S3 через `Bun.S3Client`. */
  remote?: Remote;
}) => {
  let reschedule: (schedule: BackupSchedule) => void = () => undefined;
  const service = defineUpkeepService({
    repository: defineUpkeepRepository(db),
    offsite: defineOffsiteRepository(db),
    copier: defineCopier({ db, path, without }),
    remote,
    keys: backupKeys,
    compactor: defineCompactor({ db, path }),
    clock,
    report,
    nextRun: (cron, after) => Bun.cron.parse(cron, after),
    releases: defineReleases({ base: releasesUrl, repository, version }),
    version,
    database: databaseName(path),
    updateCheck,
    rescheduled: (schedule) => reschedule(schedule),
  });
  return {
    ...service,
    /** Фон сервера: копии по расписанию, проверка обновлений и уборка раз в сутки. */
    start: (): (() => void) =>
      ((background) => (
        (reschedule = background.reschedule),
        () => (background.stop(), void (reschedule = () => undefined))
      ))(
        startUpkeep({
          schedule: service.backups.schedule(),
          backup: () => service.backups.run(false),
          check: () =>
            service.updates.enabled()
              ? service.updates.check()
              : Promise.resolve(),
          // Сначала кэш, потом база: сжатие — самое долгое, и оно же может не понадобиться.
          tidy: () =>
            Promise.resolve()
              .then(tidy)
              .then(
                () => void (path !== ':memory:' && service.database.tidy())
              ),
        })
      ),
  };
};

export type Upkeep = ReturnType<typeof defineUpkeep>;
