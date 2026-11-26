import { attempt } from '../../../shared/kernel/errors.ts';

const _log = (error: unknown): void => console.error(error);

// Между пачками — пауза: приёмник и менеджер отвечают как обычно, пока идёт пересчёт.
const _PAUSE_MS = 20;

// Срок хранения — ночью по часам сервера, в стороне от уборки (4:15) и круглого часа автокопий.
const _RETENTION = '40 3 * * *';

// Пачка за пачкой, пока работа есть; толчок во время работы ничего не добавляет — пачка сама увидит новое.
const _drive = (step: () => boolean, alive: () => boolean) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = (): void =>
    void ((timer = null),
    alive() &&
      attempt(step, (error) => (_log(error), false)) &&
      (timer = setTimeout(run, _PAUSE_MS)));
  return {
    kick: (): void =>
      void (timer === null && alive() && (timer = setTimeout(run, 0))),
    stop: (): void => void (timer !== null && clearTimeout(timer)),
  };
};

const _safe = (run: () => void): void => void attempt(run, _log);

/**
 * Фон аналитики у сервера: пересчёт людей пачками — при запуске, после правки настройки и раз в минуту
 * (настройку мог изменить другой процесс, `cms mcp`); счёт отказов в базу и такт проверок данных шагами — раз в
 * минуту, такт — и при запуске (простой сервера); счёт отказов — и при остановке; срок хранения людей, счёта и
 * строк дней — раз в сутки, людей пачками. Ошибка шага только пишется в журнал: исключение в таймере или в
 * задании `Bun.cron` уронило бы сервер.
 */
export var startAnalyticsBackground = ({
  people,
  retention,
  refusals,
  tallies,
  quality,
}: {
  people: () => boolean;
  retention: () => boolean;
  /** Счёт отказов из памяти — в базу. */
  refusals: () => void;
  /** Срок хранения счёта приёма, стёртого и строк дней проверок. */
  tallies: () => void;
  /** Шаг такта проверок: план, сутки одного отправителя или сайта, уведомления. */
  quality: () => boolean;
}) => {
  let stopped = false;
  const alive = (): boolean => !stopped;
  const rebuild = _drive(people, alive);
  const expire = _drive(retention, alive);
  const checks = _drive(quality, alive);
  const jobs = [
    Bun.cron(
      '* * * * *',
      () => (_safe(refusals), rebuild.kick(), checks.kick())
    ),
    Bun.cron(_RETENTION, () => (_safe(tallies), expire.kick())),
  ];
  rebuild.kick();
  checks.kick();
  return {
    /** Настройка сменилась: пересчитать людей. */
    kick: rebuild.kick,
    stop: (): void => (
      (stopped = true),
      rebuild.stop(),
      expire.stop(),
      checks.stop(),
      jobs.forEach((_) => void _.stop()),
      _safe(refusals)
    ),
  };
};
