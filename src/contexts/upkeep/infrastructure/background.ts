import { type BackupSchedule, cronOf } from '../domain/schedule.ts';

const _log = (error: unknown): void => console.error(error);

// Первая проверка обновлений — не сразу после старта: серверу сначала нужно открыть сайт.
const _FIRST_CHECK_MS = 30_000;

/**
 * Фон обслуживания на `Bun.cron`: автокопии по расписанию и проверка обновлений раз в сутки в
 * случайную минуту — серверы не стучатся в GitHub все разом. Ошибки задач только пишутся в журнал:
 * отклонённый Promise в задаче `Bun.cron` завершил бы процесс.
 */
export var startUpkeep = ({
  schedule,
  backup,
  check,
}: {
  schedule: BackupSchedule;
  backup: () => Promise<unknown>;
  check: () => Promise<unknown>;
}) => {
  let backups: Bun.CronJob | null = null;
  const plan = (next: BackupSchedule): void => (
    backups?.stop(),
    void (backups = next.enabled
      ? Bun.cron(cronOf(next), () => backup().then(undefined, _log))
      : null)
  );
  const checkNow = (): Promise<unknown> => check().then(undefined, _log);
  const updates = Bun.cron(
    `${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 24)} * * *`,
    checkNow
  );
  const first = setTimeout(checkNow, _FIRST_CHECK_MS);
  first.unref();
  plan(schedule);
  return {
    reschedule: plan,
    stop: (): void => (backups?.stop(), updates.stop(), clearTimeout(first)),
  };
};
