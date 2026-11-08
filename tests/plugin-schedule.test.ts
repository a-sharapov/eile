import { afterEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Расписание плагина (ADR 0067): у сервера — вскоре после старта и по периоду; CLI его не запускает.

let app: App | null = null;

afterEach(() => app?.close());

const runs = (): string[] =>
  ((globalThis as Record<string, unknown>).__scheduleRuns ??= []) as string[];

const until = async (check: () => boolean, ms = 3000): Promise<void> => {
  const started = performance.now();
  while (!check() && performance.now() - started < ms) await Bun.sleep(10);
};

const _PLUGIN = (mark: string) => `export default {
  schedule: {
    every: '1h',
    run: (context: any) => {
      (globalThis as any).__scheduleRuns.push('${mark}');
      context.setCustom('tick', '${mark}');
    },
  },
};`;

const serve = (): App =>
  createApp({
    scaffold: DEMO,
    background: true,
    updateCheck: false,
    pluginTimings: { delay: 30 },
  });

describe('расписание плагина', () => {
  it('сервер запускает задание вскоре после старта; задание пишет свою настройку', async () => {
    runs().length = 0;
    const first = createApp({ scaffold: DEMO });
    first.extensions.plugins.save('Rate', _PLUGIN('v1'));
    // CLI и тесты без фона расписаний не запускают.
    await Bun.sleep(100);
    expect(runs()).toEqual([]);
    first.close();

    app = serve();
    app.extensions.plugins.save('Rate', _PLUGIN('v1'));
    await until(() => runs().length > 0);
    expect(runs()).toEqual(['v1']);
    expect(app.site.customSettings.value('tick')).toBe('v1');
  });

  it('правка плагина заменяет задание, выключение снимает его', async () => {
    runs().length = 0;
    app = serve();
    app.extensions.plugins.save('Rate', _PLUGIN('v1'));
    await until(() => runs().length === 1);
    app.extensions.plugins.save('Rate', _PLUGIN('v2'));
    await until(() => runs().length === 2);
    expect(runs()).toEqual(['v1', 'v2']);
    app.extensions.plugins.setEnabled('Rate', false);
    await Bun.sleep(100);
    expect(runs()).toHaveLength(2);
    app.extensions.plugins.setEnabled('Rate', true);
    await until(() => runs().length === 3);
    expect(runs()).toEqual(['v1', 'v2', 'v2']);
    app.extensions.plugins.remove('Rate');
    await Bun.sleep(100);
    expect(runs()).toHaveLength(3);
  });

  it('сбой задания и неверный период — в журнал сбоев; сайт работает', async () => {
    app = serve();
    app.extensions.plugins.save(
      'Broken',
      "export default { schedule: { every: '1h', run: () => { throw new Error('floatrates is down'); } } };"
    );
    app.extensions.plugins.save(
      'Often',
      "export default { schedule: { every: '10ms', run: () => undefined } };"
    );
    await until(
      () =>
        app!.notify.incidents
          .list()
          .filter((_) => _.kind === 'extensions.schedule_failed').length === 2
    );
    expect(
      app.notify.incidents
        .list()
        .filter((_) => _.kind === 'extensions.schedule_failed')
        .map((_) => (typeof _.title === 'string' ? _.title : _.title.en))
        .toSorted()
    ).toEqual([
      'The scheduled job of plugin Broken failed',
      'The scheduled job of plugin Often failed',
    ]);
    expect(
      (await app.fetch(new Request('http://localhost/kontakty'))).status
    ).toBe(200);
  });
});
