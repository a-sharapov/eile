import { afterAll, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { placeSite } from '../src/cli/service.ts';
import { linkMedia } from '../src/workspace/index.ts';
import { DEMO } from './fixtures/demo.ts';

// Переезд сайта со связанными папками (ADR 0065): копия с папками, восстановление на новом месте,
// служба из папки копии и из живой базы — база и папки едут вместе, пути записаны от базы.
const root = mkdtempSync(join(tmpdir(), 'cms-move-folders-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const put = (path: string, data: string): void => (
  mkdirSync(dirname(path), { recursive: true }), writeFileSync(path, data)
);

const output: string[] = [];
const context = (
  args: readonly string[],
  db: string,
  folders = false
): Context => ({
  args,
  options: {
    port: '0',
    db,
    help: false,
    version: false,
    passwordStdin: false,
    trustProxy: false,
    ...(folders ? { folders: true } : {}),
  },
  paint: definePaint(false),
  language: 'ru',
  tty: false,
  out: (_) => void output.push(_),
});

// Сайт: база в site/, папка assets рядом с ней и папка old вне каталога базы (путь — абсолютный).
const site = (): Promise<string> => {
  const db = join(root, 'site', 'site.db');
  put(join(root, 'site', 'assets', 'docs', 'price.txt'), 'price list');
  put(join(root, 'elsewhere', 'old', 'a.txt'), 'old file');
  utimesSync(
    join(root, 'site', 'assets', 'docs', 'price.txt'),
    1_600_000_000,
    1_600_000_000
  );
  const app = createApp({ databasePath: db, scaffold: DEMO });
  return linkMedia(app, join(root, 'site', 'assets'), {
    into: 'assets',
    serveOriginal: true,
  })
    .then(() => linkMedia(app, join(root, 'elsewhere', 'old'), { into: 'old' }))
    .then(() => (app.close(), db));
};

const roots = (db: string): Record<string, string> =>
  ((app: App) =>
    ((links) => (app.close(), links))(
      Object.fromEntries(app.media.links.list().map((_) => [_.prefix, _.root]))
    ))(createApp({ databasePath: db }));

const served = (db: string, path: string): Promise<string> =>
  ((app: App) =>
    Promise.resolve(app.media.files.read(path))
      .then((_) => (_ ? new TextDecoder().decode(_.data()) : ''))
      .finally(() => app.close()))(createApp({ databasePath: db }));

describe('переезд со связанными папками', () => {
  it('backup --folders → restore → service --from: база и папки вместе, пути — от базы', async () => {
    const db = await site();
    expect(roots(db)).toEqual({
      assets: 'assets',
      old: join(root, 'elsewhere', 'old'),
    });

    // Копия с папками: site.db, assets/ и old/ рядом, время изменения файлов — прежнее.
    const bundle = join(root, 'bundle');
    await RUN.backup!(context([bundle], db, true));
    expect(output.join('\n')).toContain('Копия сайта с папками');
    expect(existsSync(join(bundle, 'site.db'))).toBe(true);
    expect(statSync(join(bundle, 'assets', 'docs', 'price.txt')).mtimeMs).toBe(
      1_600_000_000_000
    );
    expect(existsSync(join(bundle, 'old', 'a.txt'))).toBe(true);
    expect(existsSync(join(bundle, 'site.media-cache'))).toBe(false);
    expect(roots(join(bundle, 'site.db'))).toEqual({
      assets: 'assets',
      old: 'old',
    });
    // Непустая папка — отказ.
    expect(RUN.backup!(context([bundle], db, true))).rejects.toThrow(
      'не пуста'
    );

    // Восстановление из папки копии в новую базу на другом месте.
    const moved = join(root, 'server', 'site.db');
    mkdirSync(dirname(moved), { recursive: true });
    output.length = 0;
    await RUN.restore!(context([bundle], moved));
    expect(output.join('\n')).toContain('assets/ →');
    expect(await served(moved, 'assets/docs/price.txt')).toBe('price list');
    expect(await served(moved, 'old/a.txt')).toBe('old file');

    // Служба из папки копии и прямо из живой базы: папки — в каталог службы.
    mkdirSync(join(root, 'svc-a'), { recursive: true });
    const fromBundle = await placeSite(bundle, join(root, 'svc-a'));
    expect(fromBundle.folders.map((_) => [_.prefix, _.copied])).toEqual([
      ['assets', true],
      ['old', true],
    ]);
    expect(await served(fromBundle.db, 'assets/docs/price.txt')).toBe(
      'price list'
    );
    mkdirSync(join(root, 'svc-b'), { recursive: true });
    const fromLive = await placeSite(db, join(root, 'svc-b'));
    expect(roots(fromLive.db)).toEqual({ assets: 'assets', old: 'old' });
    expect(await served(fromLive.db, 'old/a.txt')).toBe('old file');
  });

  it('папка уже лежит на новом месте — не трогается, база ведёт на неё', async () => {
    const db = join(root, 'site', 'site.db');
    const target = join(root, 'svc-c');
    put(join(target, 'assets', 'docs', 'price.txt'), 'already here');
    const placed = await placeSite(db, target);
    expect(placed.folders.find((_) => _.prefix === 'assets')!.copied).toBe(
      false
    );
    expect(
      await Bun.file(join(target, 'assets', 'docs', 'price.txt')).text()
    ).toBe('already here');
  });
});
