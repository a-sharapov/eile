import type { PluginScheduler, ScheduledJob } from '../domain/ports.ts';
import { FIRST_RUN_DELAY, firstRun } from '../domain/schedule.ts';

type _Armed = ScheduledJob & {
  readonly timer: ReturnType<typeof setTimeout> | undefined;
};

/**
 * Таймеры расписаний плагинов — одни на процесс (ADR 0067). Задание той же версии плагина при `sync` сохраняет
 * свой ход и получает новый `run` (контексты собраны заново); новое и изменённое ждут `delay`, но не дольше
 * периода. Запуски одного плагина не идут внахлёст: тик, пока прежний запуск не кончился, пропускается.
 */
export var definePluginScheduler = ({
  delay = FIRST_RUN_DELAY,
  log = (line: string): void => console.warn(line),
}: {
  /** Первый запуск после старта или замены задания, мс. */
  delay?: number;
  log?: (line: string) => void;
} = {}): PluginScheduler => {
  const jobs = new Map<string, _Armed>();
  const busy = new Set<string>();

  const tick = (name: string): void => {
    const job = jobs.get(name);
    void (
      job &&
      (busy.has(name)
        ? log(
            `Plugin ${name}: the previous scheduled run is still going, this one is skipped`
          )
        : (busy.add(name), job.run().finally(() => void busy.delete(name))))
    );
  };

  const arm = (name: string, wait: number): void => {
    const job = jobs.get(name);
    void (
      job &&
      jobs.set(name, {
        ...job,
        timer: setTimeout(() => (arm(name, job.every), tick(name)), wait),
      })
    );
  };

  const cancel = (name: string): void => (
    clearTimeout(jobs.get(name)?.timer), void jobs.delete(name)
  );

  return {
    sync: (list) => {
      const wanted = new Map(list.map((_) => [_.name, _]));
      [...jobs.values()]
        .filter((_) => wanted.get(_.name)?.key !== _.key)
        .forEach((_) => void cancel(_.name));
      list.forEach(
        (job) =>
          void ((current) =>
            current
              ? jobs.set(job.name, { ...current, run: job.run })
              : (jobs.set(job.name, { ...job, timer: undefined }),
                arm(job.name, firstRun(job.every, delay))))(jobs.get(job.name))
      );
    },
    stop: () => [...jobs.keys()].forEach((_) => void cancel(_)),
  };
};
