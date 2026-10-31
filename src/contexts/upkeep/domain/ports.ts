import type { BackupFailure, BackupRun, BackupSchedule } from './schedule.ts';
import type { Release } from './version.ts';

/** Всё, что обслуживание помнит между запусками: расписание копий, их итог и проверку обновлений. */
export type UpkeepState = {
  readonly schedule: BackupSchedule;
  readonly last: BackupRun | null;
  readonly failure: BackupFailure | null;
  readonly checkUpdates: boolean;
};

export type UpkeepRepository = {
  readonly get: () => UpkeepState;
  readonly save: (state: UpkeepState) => void;
};

/** Копия сайта в каталог расписания: файл и размер; старые автокопии сверх `keep` удаляются. */
export type Copier = {
  readonly copy: (
    schedule: BackupSchedule,
    name: string
  ) => { readonly file: string; readonly size: number };
  /** Полный путь каталога копий — показать владельцу, куда они ложатся. */
  readonly folder: (schedule: BackupSchedule) => string;
};

/** Выпуски программы, новые первыми. */
export type ReleaseSource = () => Promise<readonly Release[]>;
