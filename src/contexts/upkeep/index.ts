import type { Database } from '../../platform/database.ts';
import type { Report } from '../../shared/kernel/report.ts';
import { defineUpkeepService } from './application/upkeep-service.ts';
import type { BackupSchedule } from './domain/schedule.ts';
import { startUpkeep } from './infrastructure/background.ts';
import { databaseName, defineCopier } from './infrastructure/copier.ts';
import { defineReleases } from './infrastructure/releases.ts';
import { defineUpkeepRepository } from './infrastructure/sqlite-upkeep.ts';

export type {
  BackupStatus,
  UpdateStatus,
  UpkeepService,
} from './application/upkeep-service.ts';
export type {
  BackupFailure,
  BackupRun,
  BackupSchedule,
} from './domain/schedule.ts';
export type { Release, UpdateInfo } from './domain/version.ts';
export { compareVersions } from './domain/version.ts';
export {
  buildTarget,
  type UpdateResult,
  updateProgram,
} from './infrastructure/installer.ts';
export { upkeepMigrations } from './infrastructure/migrations.ts';
export { defineReleases, GITHUB_API } from './infrastructure/releases.ts';

/** Таблица контекста: настройки сервера, в копию сайта не попадают. */
export var UPKEEP_SERVER_TABLES: readonly string[] = ['upkeep_settings'];

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
  releasesUrl?: string;
  updateCheck: boolean;
}) => {
  let reschedule: (schedule: BackupSchedule) => void = () => undefined;
  const service = defineUpkeepService({
    repository: defineUpkeepRepository(db),
    copier: defineCopier({ db, path, without }),
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
    /** Фон сервера: копии по расписанию и проверка обновлений раз в сутки. */
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
        })
      ),
  };
};

export type Upkeep = ReturnType<typeof defineUpkeep>;
