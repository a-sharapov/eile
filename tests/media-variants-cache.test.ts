import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';
import { picture } from './fixtures/images.ts';

// Варианты картинок из базы — в кэше медиатеки, как у связанных папок: база и её копии не растут от того,
// что сервер сделает заново. Без кэша на диске — в базе, как раньше.
const root = mkdtempSync(join(tmpdir(), 'cms-variants-cache-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let cases = 0;

// Кэш не пишется — его каталог внутри обычного файла, как на диске только для чтения.
const site = (cache = true): { app: App; db: string; cache: string } =>
  ((dir) => (
    mkdirSync(dir, { recursive: true }),
    writeFileSync(join(dir, 'blocker'), 'x'),
    {
      app: createApp({
        databasePath: join(dir, 'site.db'),
        scaffold: DEMO,
        mediaCache: cache ? join(dir, 'cache') : join(dir, 'blocker', 'cache'),
      }),
      db: join(dir, 'site.db'),
      cache: join(dir, 'cache'),
    }
  ))(join(root, `case-${++cases}`));

// Кусков хранения у путей вариантов — прямо из файла базы.
const chunks = (db: string, like: string): number =>
  ((sqlite) =>
    ((n) => (sqlite.close(), n))(
      sqlite
        .query<{ n: number }, [string]>(
          'SELECT count(*) AS n FROM media_chunks WHERE path LIKE ?'
        )
        .get(like)!.n
    ))(new Database(db, { readonly: true }));

const get = (app: App, path: string) =>
  app.fetch(new Request(`http://localhost${path}`));

describe('варианты картинок из базы — в кэше на диске', () => {
  it('в базе — строки без байтов, отдача из кэша; кэш стёрли — на оригинал и делаются заново', async () => {
    const { app, db, cache } = site();
    app.media.files.save({
      path: 'img/sea.jpg',
      data: await picture(1200, 600, 'jpeg'),
    });
    await app.media.variants.run();
    const variant = app.media.files
      .list()
      .find((_) => _.path === 'img/sea@960.webp')!;
    expect(variant.linked).toEqual({ prefix: '', file: null });
    expect(chunks(db, 'img/sea@%')).toBe(0);
    expect(
      (await get(app, `/media/${variant.path}?v=${variant.hash}`)).status
    ).toBe(200);
    expect(app.media.image('img/sea.jpg')!.srcset).toContain('sea@960.webp');

    rmSync(cache, { recursive: true });
    const moved = await get(app, `/media/${variant.path}?v=${variant.hash}`);
    expect(moved.status).toBe(307);
    expect(moved.headers.get('location')).toStartWith('/media/img/sea.jpg?v=');
    expect(await app.media.variants.run()).toBe(2);
    expect((await get(app, '/media/img/sea@960.webp')).status).toBe(200);
    app.close();
  });

  it('кэш не пишется — варианты в базе, как раньше', async () => {
    const { app, db } = site(false);
    app.media.files.save({
      path: 'img/sea.jpg',
      data: await picture(1200, 600, 'jpeg'),
    });
    await app.media.variants.run();
    expect(
      app.media.files.list().find((_) => _.path === 'img/sea@960.webp')!.linked
    ).toBeUndefined();
    expect(chunks(db, 'img/sea@%')).toBeGreaterThan(0);
    expect(app.media.variants.rebuild()).toBe(0);
    app.close();
  });

  it('rebuild: варианты, что лежат в базе, — заново сервером в кэш; свои тоже', async () => {
    const { app, db } = site();
    app.media.files.save({
      path: 'img/own.jpg',
      data: await picture(1200, 600, 'jpeg'),
    });
    // Свой вариант, загруженный файлом, — в базе.
    app.media.files.save({
      path: 'img/own@960.webp',
      data: await picture(960, 480, 'webp'),
    });
    expect(chunks(db, 'img/own@%')).toBeGreaterThan(0);
    expect(app.media.variants.rebuild()).toBe(1);
    expect(await app.media.variants.run()).toBe(2);
    expect(chunks(db, 'img/own@%')).toBe(0);
    expect(
      app.media.files
        .list()
        .filter((_) => _.path.startsWith('img/own@'))
        .map((_) => [String(_.path), _.linked?.prefix])
    ).toEqual([
      ['img/own@480.webp', ''],
      ['img/own@960.webp', ''],
    ]);
    expect(app.media.variants.rebuild()).toBe(0);
    app.close();
  });

  it('свой вариант поверх сделанного сервером — можно: он ложится в базу', async () => {
    const { app } = site();
    app.media.files.save({
      path: 'img/b.jpg',
      data: await picture(2400, 1200, 'jpeg'),
    });
    await app.media.variants.run();
    app.media.files.save({
      path: 'img/b@960.webp',
      data: await picture(960, 480, 'webp'),
    });
    expect(
      app.media.files.list().find((_) => _.path === 'img/b@960.webp')!.linked
    ).toBeUndefined();
    app.media.files.remove('img/b.jpg');
    expect(
      app.media.files.list().filter((_) => _.path.startsWith('img/b'))
    ).toEqual([]);
    app.close();
  });
});
