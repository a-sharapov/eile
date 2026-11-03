import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import type { MediaFile } from '../src/contexts/media/index.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

const bytes = (text: string) => new TextEncoder().encode(text);

const errorCode = (action: () => void): string | undefined =>
  attempt(
    () => void action(),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('медиатека', () => {
  it('отдаёт файл с ETag; с версией — навсегда, без — со сверкой', async () => {
    const file = app.media.files.save({
      path: 'Docs/Price.TXT',
      data: bytes('цены'),
    });
    expect(file.path as string).toBe('docs/price.txt');
    const plain = await get('/media/docs/price.txt');
    expect(await plain.text()).toBe('цены');
    expect(plain.headers.get('cache-control')).toBe('no-cache');
    expect(plain.headers.get('x-content-type-options')).toBe('nosniff');
    const versioned = await get(`/media/docs/price.txt?v=${file.hash}`);
    expect(versioned.headers.get('cache-control')).toContain('immutable');
    const again = await get('/media/docs/price.txt', {
      'if-none-match': plain.headers.get('etag')!,
    });
    expect(again.status).toBe(304);
    expect((await get('/media/docs/none.txt')).status).toBe(404);
  });

  it('отдаёт файл кусками по Range: видео в Safari без этого не играет', async () => {
    app.media.files.save({ path: 'video/clip.mp4', data: bytes('0123456789') });
    const whole = await get('/media/video/clip.mp4');
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    const first = await get('/media/video/clip.mp4', { range: 'bytes=0-1' });
    expect(first.status).toBe(206);
    expect(first.headers.get('content-range')).toBe('bytes 0-1/10');
    expect(await first.text()).toBe('01');
    const tail = await get('/media/video/clip.mp4', { range: 'bytes=-3' });
    expect([tail.headers.get('content-range'), await tail.text()]).toEqual([
      'bytes 7-9/10',
      '789',
    ]);
    const open = await get('/media/video/clip.mp4', { range: 'bytes=8-' });
    expect(await open.text()).toBe('89');
    const beyond = await get('/media/video/clip.mp4', { range: 'bytes=20-30' });
    expect([beyond.status, beyond.headers.get('content-range')]).toEqual([
      416,
      'bytes */10',
    ]);
    const many = await get('/media/video/clip.mp4', { range: 'bytes=0-1,4-5' });
    expect([many.status, await many.text()]).toEqual([200, '0123456789']);
  });

  it('SVG — в песочнице CSP; HTML и обход каталогов не принимаются', async () => {
    app.media.files.save({ path: 'i/logo.svg', data: bytes('<svg/>') });
    expect(
      (await get('/media/i/logo.svg')).headers.get('content-security-policy')
    ).toContain('sandbox');
    expect(
      errorCode(() =>
        app.media.files.save({ path: 'x.html', data: bytes('<p>') })
      )
    ).toBe('media.unsupported_type');
    // Скрипт сайта — элемент с правом на код, а не файл медиатеки (ADR 0039).
    expect(
      errorCode(() =>
        app.media.files.save({ path: 'js/stage.js', data: bytes('alert(1)') })
      )
    ).toBe('media.unsupported_type');
    expect(
      errorCode(() =>
        app.media.files.save({ path: '../db.txt', data: bytes('x') })
      )
    ).toBe('media.invalid_path');
  });

  it('image() собирает srcset из вариантов, замена файла сбрасывает кэш страниц', async () => {
    app.media.files.save({
      path: 'img/sea.jpg',
      data: bytes('jpg'),
      width: 2000,
      height: 1000,
    });
    app.media.files.save({
      path: 'img/sea@960.webp',
      data: bytes('w960'),
      width: 960,
      height: 480,
    });
    app.media.files.save({
      path: 'img/sea@480.webp',
      data: bytes('w480'),
      width: 480,
      height: 240,
    });
    app.design.templates.save(
      'Base',
      "<script>import { image } from '$core'; const sea = image('img/sea.jpg');</script><img src={sea.src} srcset={sea.srcset} width={sea.width} height={sea.height} alt=\"\">"
    );
    const html = await (await get('/kontakty')).text();
    expect(html).toMatch(
      /<img src="\/media\/img\/sea\.jpg\?v=\w+" srcset="\/media\/img\/sea@480\.webp\?v=\w+ 480w, \/media\/img\/sea@960\.webp\?v=\w+ 960w" width="2000" height="1000"/
    );
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('hit');
    app.media.files.save({
      path: 'img/sea.jpg',
      data: bytes('new'),
      width: 2000,
      height: 1000,
    });
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('miss');
  });

  it('описание картинки: сохраняется, переживает замену файла, приходит в image()', () => {
    app.media.files.save({
      path: 'images/cat.png',
      data: bytes('кот'),
      width: 800,
      height: 600,
    });
    expect(
      app.media.files.describe('images/cat.png', '  Рыжий   кот на окне ').alt
    ).toBe('Рыжий кот на окне');
    app.media.files.save({ path: 'images/cat.png', data: bytes('другой кот') });
    expect(app.media.image('images/cat.png')?.alt).toBe('Рыжий кот на окне');
    expect(
      errorCode(() =>
        app.media.files.describe('images/cat.png', 'я'.repeat(501))
      )
    ).toBe('media.invalid_alt');
    expect(
      errorCode(() => app.media.files.describe('images/dog.png', 'Пёс'))
    ).toBe('media.file_not_found');
  });

  it('загрузка через менеджер — multipart', async () => {
    const setup = await app.fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: app.identity.setup.token(),
          email: 'a@example.com',
          password: 'correct horse battery',
        }),
      })
    );
    const cookie = setup.headers.get('set-cookie')!.split(';')[0]!;
    const form = new FormData();
    form.set('file', new Blob([bytes('hello')]), 'hello.txt');
    form.set('path', 'docs/hello.txt');
    const upload = await app.fetch(
      new Request('http://localhost/manager/api/media', {
        method: 'POST',
        headers: { cookie },
        body: form,
      })
    );
    expect(upload.status).toBe(201);
    expect(await (await get('/media/docs/hello.txt')).text()).toBe('hello');
    const removed = await app.fetch(
      new Request('http://localhost/manager/api/media/docs/hello.txt', {
        method: 'DELETE',
        headers: { cookie },
      })
    );
    expect(removed.status).toBe(200);
    expect((await get('/media/docs/hello.txt')).status).toBe(404);
  });

  it('модель .glb: тип model/gltf-binary, nosniff, без размеров картинки', async () => {
    // Заголовок glTF: magic «glTF», версия 2, длина — двоичный файл, а не текст.
    const glb = new Uint8Array([
      0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0,
    ]);
    const file = app.media.files.save({
      path: 'models/Kitchen.GLB',
      data: glb,
    });
    expect(file).toMatchObject({
      path: 'models/kitchen.glb',
      contentType: 'model/gltf-binary',
      size: 12,
      width: null,
    });
    const response = await get(`/media/models/kitchen.glb?v=${file.hash}`);
    expect(response.headers.get('content-type')).toBe('model/gltf-binary');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(glb);
    expect(app.media.url('models/kitchen.glb')).toBe(
      `/media/models/kitchen.glb?v=${file.hash}`
    );
  });

  it('модель .glb до 25 МиБ — через менеджер и с кэша на диске', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cms-glb-'));
    const site = createApp({ mediaCache: join(dir, 'cache') });
    const setup = await site.fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: site.identity.setup.token(),
          email: 'a@example.com',
          password: 'correct horse battery',
        }),
      })
    );
    const cookie = setup.headers.get('set-cookie')!.split(';')[0]!;
    const upload = (size: number) => {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(size).fill(7)]), 'kitchen.glb');
      form.set('path', 'models/kitchen.glb');
      return site.fetch(
        new Request('http://localhost/manager/api/media', {
          method: 'POST',
          headers: { cookie },
          body: form,
        })
      );
    };
    expect((await upload(25 * 1024 * 1024 + 1)).status).toBe(422);
    const saved = await upload(3 * 1024 * 1024);
    expect(saved.status).toBe(201);
    const response = await site.fetch(
      new Request('http://localhost/media/models/kitchen.glb')
    );
    expect(response.headers.get('content-type')).toBe('model/gltf-binary');
    expect((await response.arrayBuffer()).byteLength).toBe(3 * 1024 * 1024);
    // Файл вынесен из базы на диск: дальше его отдаёт sendfile (ADR 0038).
    expect(readdirSync(join(dir, 'cache'))).toContain('models~kitchen.glb');
    site.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];

// Подпись PNG и блок IHDR: серверу хватает заголовка, чтобы узнать размер.
const png = (width: number, height: number): Uint8Array =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    ...bytes('IHDR'),
    ...u32(width),
    ...u32(height),
    8,
    2,
    0,
    0,
    0,
    ...u32(0),
  ]);

const sides = (file: { width: number | null; height: number | null }) => [
  file.width,
  file.height,
];

const managerCookie = (site: App): Promise<string> =>
  site
    .fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: site.identity.setup.token(),
          email: 'a@example.com',
          password: 'correct horse battery',
        }),
      })
    )
    .then((_) => _.headers.get('set-cookie')!.split(';')[0]!);

describe('размеры картинок', () => {
  it('без width и height сервер читает их из файла — и при замене тоже', () => {
    expect(
      sides(
        app.media.files.save({ path: 'img/cover.png', data: png(1600, 900) })
      )
    ).toEqual([1600, 900]);
    expect(app.media.image('img/cover.png')).toMatchObject({
      width: 1600,
      height: 900,
    });
    app.media.files.save({ path: 'img/cover.png', data: png(800, 1200) });
    expect(sides(app.media.image('img/cover.png')!)).toEqual([800, 1200]);
    expect(
      sides(
        app.media.files.save({
          path: 'img/logo.svg',
          data: bytes('<svg viewBox="0 0 64 32"/>'),
        })
      )
    ).toEqual([64, 32]);
    expect(
      sides(
        app.media.files.save({ path: 'img/broken.png', data: bytes('png') })
      )
    ).toEqual([null, null]);
    // Читаются только картинки: текст с разметкой SVG — всё ещё текст.
    expect(
      sides(
        app.media.files.save({
          path: 'docs/a.txt',
          data: bytes('<svg width="5" height="5"/>'),
        })
      )
    ).toEqual([null, null]);
  });

  it('присланные размеры важнее файла; ноль, дробь, NaN и одна сторона — как не присланные', () => {
    expect(
      sides(
        app.media.files.save({
          path: 'img/a.png',
          data: png(1600, 900),
          width: 800,
          height: 450,
        })
      )
    ).toEqual([800, 450]);
    expect(
      [
        { width: 0, height: 450 },
        { width: -5, height: 450 },
        { width: 1.5, height: 450 },
        { width: Number.NaN, height: 450 },
        { width: 800, height: null },
      ].map((sent) =>
        sides(
          app.media.files.save({
            path: 'img/a.png',
            data: png(1600, 900),
            ...sent,
          })
        )
      )
    ).toEqual(Array(5).fill([1600, 900]));
    // Файл не читается — остаётся то, что прислали.
    expect(
      sides(
        app.media.files.save({
          path: 'img/b.png',
          data: bytes('png'),
          width: 640,
        })
      )
    ).toEqual([640, null]);
  });

  it('загрузка через менеджер без размеров или с пустыми — размеры из файла', async () => {
    const cookie = await managerCookie(app);
    const upload = (fields: Record<string, string>) => {
      const form = new FormData();
      form.set('file', new Blob([png(1920, 1280)]), 'hero.png');
      form.set('path', 'img/hero.png');
      Object.entries(fields).forEach(
        ({ 0: name, 1: value }) => void form.set(name, value)
      );
      return app
        .fetch(
          new Request('http://localhost/manager/api/media', {
            method: 'POST',
            headers: { cookie },
            body: form,
          })
        )
        .then((_) => _.json() as Promise<MediaFile>);
    };
    expect(sides(await upload({}))).toEqual([1920, 1280]);
    expect(sides(await upload({ width: '', height: '' }))).toEqual([
      1920, 1280,
    ]);
    expect(sides(await upload({ width: '960', height: '640' }))).toEqual([
      960, 640,
    ]);
  });

  it('миграция дописывает размеры картинкам, которые лежат без них', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cms-sizes-'));
    const path = join(dir, 'site.db');
    const site = createApp({ databasePath: path });
    site.media.files.save({ path: 'img/old.png', data: png(1024, 768) });
    site.media.files.save({
      path: 'img/old.svg',
      data: bytes('<svg width="40" height="30"/>'),
    });
    site.media.files.save({ path: 'img/broken.jpg', data: bytes('jpg') });
    site.media.files.save({ path: 'docs/a.txt', data: bytes('a') });
    site.close();
    // Строки без размеров и база, где миграция ещё не прошла.
    const db = new Database(path);
    db.run('UPDATE media_files SET width = NULL, height = NULL');
    db.run("DELETE FROM _migrations WHERE id = 'media/004_image_size'");
    db.close();
    const again = createApp({ databasePath: path });
    expect(
      again.media.files.list().map((_) => [String(_.path), ...sides(_)])
    ).toEqual([
      ['docs/a.txt', null, null],
      ['img/broken.jpg', null, null],
      ['img/old.png', 1024, 768],
      ['img/old.svg', 40, 30],
    ]);
    again.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
