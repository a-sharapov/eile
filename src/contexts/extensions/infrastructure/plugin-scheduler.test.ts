import { afterEach, describe, expect, it } from 'bun:test';
import type { PluginScheduler, ScheduledJob } from '../domain/ports.ts';
import { definePluginScheduler } from './plugin-scheduler.ts';

let scheduler: PluginScheduler | null = null;

afterEach(() => scheduler?.stop());

const until = async (check: () => boolean, ms = 2000): Promise<void> => {
  const started = performance.now();
  while (!check() && performance.now() - started < ms) await Bun.sleep(5);
};

const job = (
  name: string,
  key: string,
  every: number,
  run: () => Promise<void>
): ScheduledJob => ({ name, key, every, run });

describe('таймеры расписаний плагинов', () => {
  it('первый запуск — через delay, дальше — каждый период', async () => {
    const runs: number[] = [];
    const started = performance.now();
    scheduler = definePluginScheduler({ delay: 20 });
    scheduler.sync([
      job('Rate', 'v1', 40, () =>
        Promise.resolve(void runs.push(performance.now() - started))
      ),
    ]);
    await until(() => runs.length >= 3);
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(runs[0]!).toBeGreaterThanOrEqual(15);
    expect(runs[0]!).toBeLessThan(40);
  });

  it('та же версия сохраняет ход и получает новый run; другая — заменяет задание', async () => {
    const runs: string[] = [];
    scheduler = definePluginScheduler({ delay: 30 });
    scheduler.sync([
      job('Rate', 'v1', 1000, () => Promise.resolve(void runs.push('old'))),
    ]);
    await Bun.sleep(10);
    // Пересборка контекстов: та же версия плагина, новый контекст — таймер прежний.
    scheduler.sync([
      job('Rate', 'v1', 1000, () => Promise.resolve(void runs.push('rebound'))),
    ]);
    await until(() => runs.length === 1);
    expect(runs).toEqual(['rebound']);
    // Правка плагина: прежнее задание снято, новое — через delay.
    scheduler.sync([
      job('Rate', 'v2', 1000, () => Promise.resolve(void runs.push('v2'))),
    ]);
    await until(() => runs.length === 2);
    expect(runs).toEqual(['rebound', 'v2']);
    // Выключили плагин — заданий нет.
    scheduler.sync([]);
    await Bun.sleep(60);
    expect(runs).toEqual(['rebound', 'v2']);
  });

  it('запуски одного плагина не идут внахлёст: тик во время запуска пропускается', async () => {
    let running = 0;
    let most = 0;
    let runs = 0;
    const skipped: string[] = [];
    scheduler = definePluginScheduler({
      delay: 5,
      log: (_) => void skipped.push(_),
    });
    scheduler.sync([
      job('Slow', 'v1', 20, () => {
        running += 1;
        runs += 1;
        most = Math.max(most, running);
        return Bun.sleep(70).then(() => void (running -= 1));
      }),
    ]);
    await until(() => runs >= 2, 1000);
    expect(most).toBe(1);
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped[0]).toContain('Plugin Slow');
  });

  it('stop снимает все таймеры', async () => {
    let runs = 0;
    scheduler = definePluginScheduler({ delay: 20 });
    scheduler.sync([
      job('Rate', 'v1', 20, () => Promise.resolve(void (runs += 1))),
    ]);
    scheduler.stop();
    await Bun.sleep(60);
    expect(runs).toBe(0);
  });
});
