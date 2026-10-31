import { domainError } from '../../../shared/kernel/errors.ts';
import type { Report } from '../../../shared/kernel/report.ts';
import type {
  Copier,
  ReleaseSource,
  UpkeepRepository,
  UpkeepState,
} from '../domain/ports.ts';
import {
  type BackupFailure,
  type BackupRun,
  type BackupSchedule,
  copyName,
  cronOf,
  parseSchedule,
} from '../domain/schedule.ts';
import { newerRelease, type UpdateInfo } from '../domain/version.ts';

/** Автокопии для менеджера: расписание, куда ложатся, итог последней и когда следующая. */
export type BackupStatus = {
  readonly schedule: BackupSchedule;
  readonly folder: string;
  readonly last: BackupRun | null;
  readonly failure: BackupFailure | null;
  readonly next: string | null;
  readonly running: boolean;
};

/** Проверка обновлений: включена ли, кем выключена и что нашла. */
export type UpdateStatus = {
  readonly enabled: boolean;
  /** Выключена переменной окружения CMS_NO_UPDATE_CHECK=1: в менеджере не включить. */
  readonly locked: boolean;
  readonly current: string;
  readonly latest: UpdateInfo | null;
  readonly checkedAt: string | null;
};

export type UpkeepPorts = {
  readonly repository: UpkeepRepository;
  readonly copier: Copier;
  readonly clock: () => Date;
  readonly report: Report;
  /** Следующий запуск по выражению cron; null — не будет. */
  readonly nextRun: (cron: string, after: Date) => Date | null;
  readonly releases: ReleaseSource;
  readonly version: string;
  /** Имя файла базы без `.db`: начало имён автокопий. */
  readonly database: string;
  /** Проверку обновлений не выключили переменной окружения. */
  readonly updateCheck: boolean;
  /** Расписание сменилось: фону — перезапустить задачу. */
  readonly rescheduled: (schedule: BackupSchedule) => void;
};

export var defineUpkeepService = ({
  repository,
  copier,
  clock,
  report,
  nextRun,
  releases,
  version,
  database,
  updateCheck,
  rescheduled,
}: UpkeepPorts) => {
  let running = false;
  let latest: UpdateInfo | null = null;
  let checkedAt: string | null = null;

  const save = (change: Partial<UpkeepState>): UpkeepState =>
    ((next) => (repository.save(next), next))({
      ...repository.get(),
      ...change,
    });

  // Копия пишется синхронно (VACUUM INTO), но очередь Promise не даёт двум запускам наложиться.
  const copy = (manual: boolean): BackupRun =>
    ((at, schedule) => ({
      at: at.toISOString(),
      ...copier.copy(schedule, copyName(database, at)),
      manual,
    }))(clock(), repository.get().schedule);

  const failed = (error: unknown): never => {
    const message = error instanceof Error ? error.message : String(error);
    save({ failure: { at: clock().toISOString(), message } });
    report({
      kind: 'upkeep.backup_failed',
      severity: 'error',
      title: {
        en: 'The automatic site backup failed',
        de: 'Die automatische Sicherung der Website ist fehlgeschlagen',
        ru: 'Не сделалась автоматическая копия сайта',
      },
      detail: ((folder) => ({
        en: `${message}\nBackup folder: ${folder}`,
        de: `${message}\nOrdner der Sicherungen: ${folder}`,
        ru: `${message}\nКаталог копий: ${folder}`,
      }))(copier.folder(repository.get().schedule)),
      key: 'upkeep.backup_failed',
    });
    throw domainError('upkeep.backup_failed', message);
  };

  const run = (manual: boolean): Promise<BackupRun> =>
    running
      ? Promise.reject(
          domainError('upkeep.backup_running', 'A backup is already running')
        )
      : ((running = true),
        Promise.resolve(manual)
          .then(copy)
          .then((last) => (save({ last, failure: null }), last), failed)
          .finally(() => void (running = false)));

  const status = (): BackupStatus =>
    ((state) => ({
      schedule: state.schedule,
      folder: copier.folder(state.schedule),
      last: state.last,
      failure: state.failure,
      next: state.schedule.enabled
        ? (nextRun(cronOf(state.schedule), clock())?.toISOString() ?? null)
        : null,
      running,
    }))(repository.get());

  const updatesEnabled = (): boolean =>
    updateCheck && repository.get().checkUpdates;

  const updateStatus = (): UpdateStatus => ({
    enabled: updatesEnabled(),
    locked: !updateCheck,
    current: version,
    latest,
    checkedAt,
  });

  return {
    backups: {
      schedule: (): BackupSchedule => repository.get().schedule,
      /** Правка расписания; фоновая задача сразу переходит на новое. */
      configure: (patch: Record<string, unknown>): BackupStatus =>
        ((schedule) => (save({ schedule }), rescheduled(schedule), status()))(
          parseSchedule(patch, repository.get().schedule)
        ),
      /** По расписанию — `manual: false`, кнопкой — `true`. */
      run,
      status,
    },
    updates: {
      enabled: updatesEnabled,
      configure: (enabled: boolean): UpdateStatus => (
        save({ checkUpdates: enabled }), updateStatus()
      ),
      /** Спросить страницу релизов; найденное — в памяти до следующей проверки. */
      check: (): Promise<UpdateStatus> =>
        releases()
          .then((list) => newerRelease(version, list))
          .then(
            (found) => (
              (latest = found
                ? { current: version, latest: found.version, url: found.url }
                : null),
              (checkedAt = clock().toISOString()),
              updateStatus()
            )
          ),
      /** Что нашла последняя проверка; null — новее нет или проверка выключена. */
      latest: (): UpdateInfo | null => (updatesEnabled() ? latest : null),
      status: updateStatus,
    },
  };
};

export type UpkeepService = ReturnType<typeof defineUpkeepService>;
