import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { defineAgentSession } from '../src/contexts/manager/index.ts';
import { imageSize } from '../src/contexts/media/domain/image-size.ts';
import {
  defineMedia,
  defineMediaCache,
  type ImageResizer,
  type MediaFile,
  mediaMigrations,
} from '../src/contexts/media/index.ts';
import { migrate, openDatabase } from '../src/platform/database.ts';
import { defineEventBus } from '../src/platform/event-bus.ts';
import { DEMO } from './fixtures/demo.ts';
import { colors, picture } from './fixtures/images.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));

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

const upload = (site: App, cookie: string, path: string, data: Uint8Array) => {
  const form = new FormData();
  form.set('file', new Blob([data]), path.split('/').at(-1)!);
  form.set('path', path);
  return site
    .fetch(
      new Request('http://localhost/manager/api/media', {
        method: 'POST',
        headers: { cookie },
        body: form,
      })
    )
    .then((_) => _.json() as Promise<MediaFile>);
};

// Варианты семейства: путь, тип, размеры из базы и размеры из самого файла.
const variants = (site: App, stem: string) =>
  site.media.files
    .list()
    .filter((_) => _.path.startsWith(`${stem}@`))
    .map((_) => [
      String(_.path),
      _.contentType,
      _.width,
      _.height,
      imageSize(site.media.files.read(_.path)!.data()),
    ]);

const size = (width: number, height: number) => ({ width, height });

// Фон сервера работает сам: ждём, пока не выполнится условие, но не дольше 10 с.
const until = (done: () => boolean, left = 500): Promise<void> =>
  done() || left === 0
    ? Promise.resolve()
    : Bun.sleep(20).then(() => until(done, left - 1));

// Красный и синий — по каналам: JPEG и WebP дают оттенки, а не чистые цвета.
const red = ([r, , b]: number[]) => r! > 150 && b! < 100;
const blue = ([r, , b]: number[]) => b! > 150 && r! < 100;

describe('варианты размеров делает сервер', () => {
  it('загрузка через API без вариантов: 480, 960 и 1920 webp, image() отдаёт их в srcset', async () => {
    const cookie = await managerCookie(app);
    const file = await upload(
      app,
      cookie,
      'img/sea.jpg',
      await picture(2400, 1200, 'jpeg')
    );
    expect([file.width, file.height]).toEqual([2400, 1200]);
    expect(app.media.variants.pending()).toBe(1);
    app.design.templates.save(
      'Base',
      "<script>import { image } from '$core'; const sea = image('img/sea.jpg');</script><img src={sea.src} srcset={sea.srcset} width={sea.width} height={sea.height} alt=\"\">"
    );
    expect(await (await get('/kontakty')).text()).toContain('srcset=""');
    expect(await app.media.variants.run()).toBe(3);
    expect(app.media.variants.pending()).toBe(0);
    expect(variants(app, 'img/sea')).toEqual([
      ['img/sea@1920.webp', 'image/webp', 1920, 960, size(1920, 960)],
      ['img/sea@480.webp', 'image/webp', 480, 240, size(480, 240)],
      ['img/sea@960.webp', 'image/webp', 960, 480, size(960, 480)],
    ]);
    // Страница из кэша сброшена: новые варианты — в srcset сразу.
    const page = await get('/kontakty');
    expect(page.headers.get('x-cache')).toBe('miss');
    expect(await page.text()).toMatch(
      /<img src="\/media\/img\/sea\.jpg\?v=\w+" srcset="\/media\/img\/sea@480\.webp\?v=\w+ 480w, \/media\/img\/sea@960\.webp\?v=\w+ 960w, \/media\/img\/sea@1920\.webp\?v=\w+ 1920w" width="2400" height="1200"/
    );
    const shown = await get('/media/img/sea@960.webp');
    expect(shown.headers.get('content-type')).toBe('image/webp');
    // Картинка та же: левая половина красная, правая синяя.
    const [left, right] = await colors(
      new Uint8Array(await shown.arrayBuffer()),
      2,
      1
    );
    expect([red(left!), blue(right!)]).toEqual([true, true]);
  });

  it('агент через MCP: upload_media — и сервер делает варианты', async () => {
    const editor = await app.identity.users.create({
      email: 'ed@example.com',
      role: 'editor',
      password: 'another horse battery',
    });
    const tools = (await app.mcp(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      editor,
      defineAgentSession()
    )) as { result: { tools: { name: string; description: string }[] } };
    expect(
      tools.result.tools.find((_) => _.name === 'upload_media')!.description
    ).toContain('made by the server');
    const result = (await app.mcp(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'upload_media',
          arguments: {
            path: 'blog/cover.png',
            data: (await picture(1000, 500, 'png')).toBase64(),
          },
        },
      },
      editor,
      defineAgentSession()
    )) as { result: { isError: boolean } };
    expect(result.result.isError).toBe(false);
    await app.media.variants.run();
    // Оригинал 1000 px шире варианта 960 — он и закрывает верх набора, а не растянутый вариант.
    expect(app.media.image('blog/cover.png')?.srcset).toMatch(
      /^\/media\/blog\/cover@480\.webp\?v=\w+ 480w, \/media\/blog\/cover@960\.webp\?v=\w+ 960w, \/media\/blog\/cover\.png\?v=\w+ 1000w$/
    );
  });

  it('srcset: оригинал шире 1920 в набор не идёт — хватает варианта 1920', async () => {
    app.media.files.save({
      path: 'img/wide.png',
      data: await picture(2400, 1200, 'png'),
    });
    await app.media.variants.run();
    const srcset = app.media.image('img/wide.png')?.srcset ?? '';
    expect(srcset).toContain('wide@1920.webp');
    expect(srcset).not.toContain('2400w');
  });

  it('поворот EXIF: варианты повёрнуты так, как картинку покажет браузер', async () => {
    // Кадр 1200×800 лежит на боку (ориентация 6): браузер покажет 800×1200, красным вверху.
    const photo = await picture(1200, 800, 'jpeg', { orientation: 6 });
    const file = app.media.files.save({ path: 'img/side.jpg', data: photo });
    expect([file.width, file.height]).toEqual([800, 1200]);
    await app.media.variants.run();
    expect(variants(app, 'img/side')).toEqual([
      ['img/side@480.webp', 'image/webp', 480, 720, size(480, 720)],
    ]);
    const [top, bottom] = await colors(
      app.media.files.read('img/side@480.webp')!.data(),
      1,
      2
    );
    expect([red(top!), blue(bottom!)]).toEqual([true, true]);
  });

  it('не растягивает: только ширины меньше оригинала; до 480 px — ни вариантов, ни задания', async () => {
    app.media.files.save({
      path: 'img/mid.png',
      data: await picture(960, 600, 'png'),
    });
    app.media.files.save({
      path: 'img/web.webp',
      data: await picture(1000, 400, 'webp'),
    });
    app.media.files.save({
      path: 'img/icon.png',
      data: await picture(480, 480, 'png'),
    });
    expect(app.media.variants.pending()).toBe(2);
    await app.media.variants.run();
    expect(variants(app, 'img/mid').map((_) => _[0])).toEqual([
      'img/mid@480.webp',
    ]);
    expect(variants(app, 'img/web').map((_) => _[0])).toEqual([
      'img/web@480.webp',
      'img/web@960.webp',
    ]);
    expect(variants(app, 'img/icon')).toEqual([]);
  });

  it('SVG, GIF и анимация остаются без вариантов; анимация — не сбой', async () => {
    app.media.files.save({
      path: 'img/logo.svg',
      data: new TextEncoder().encode('<svg width="2000" height="1000"/>'),
    });
    app.media.files.save({
      path: 'img/old.gif',
      data: new Uint8Array([
        ...new TextEncoder().encode('GIF89a'),
        0xd0,
        0x07,
        0xe8,
        0x03,
        0xf7,
        0,
        0,
      ]),
    });
    expect(app.media.variants.pending()).toBe(0);
    // APNG: блок acTL сразу за IHDR настоящего PNG.
    const png = await picture(800, 600, 'png');
    const actl = new Uint8Array([
      0,
      0,
      0,
      8,
      ...new TextEncoder().encode('acTL'),
      0,
      0,
      0,
      2,
      0,
      0,
      0,
      0,
    ]);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, Bun.hash.crc32(actl.subarray(4)));
    app.media.files.save({
      path: 'img/moving.png',
      data: new Uint8Array([
        ...png.subarray(0, 33),
        ...actl,
        ...crc,
        ...png.subarray(33),
      ]),
    });
    expect(app.media.variants.pending()).toBe(1);
    expect(await app.media.variants.run()).toBe(0);
    expect(app.media.variants.pending()).toBe(0);
    expect(variants(app, 'img/moving')).toEqual([]);
    expect(app.notify.incidents.list().map((_) => _.kind)).not.toContain(
      'media.variants_skipped'
    );
  });

  it('предел пикселей: PNG больше 24 Мп не декодируется, владелец узнаёт почему', async () => {
    // Только заголовок PNG 7000×5000: до декодирования дело не доходит.
    const header = new Uint8Array(33);
    const view = new DataView(header.buffer);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    view.setUint32(8, 13);
    header.set(new TextEncoder().encode('IHDR'), 12);
    view.setUint32(16, 7000);
    view.setUint32(20, 5000);
    header.set([8, 2, 0, 0, 0], 24);
    app.media.files.save({ path: 'img/huge.png', data: header });
    expect(app.media.variants.pending()).toBe(1);
    expect(await app.media.variants.run()).toBe(0);
    expect(variants(app, 'img/huge')).toEqual([]);
    const incident = app.notify.incidents
      .list()
      .find((_) => _.kind === 'media.variants_skipped');
    expect(incident?.severity).toBe('warning');
    expect(JSON.stringify(incident?.detail)).toContain(
      'img/huge.png: 35 megapixels to decode, at most 24'
    );
  });

  it('замена оригинала: прежние варианты уходят сразу, новые — из новой картинки; та же картинка — без работы', async () => {
    const first = await picture(1200, 600, 'jpeg');
    app.media.files.save({ path: 'img/a.jpg', data: first });
    await app.media.variants.run();
    const before = app.media.files.read('img/a@480.webp')!.meta.hash;
    app.media.files.save({ path: 'img/a.jpg', data: first });
    expect(app.media.variants.pending()).toBe(0);
    expect(app.media.files.read('img/a@480.webp')!.meta.hash).toBe(before);
    app.media.files.save({
      path: 'img/a.jpg',
      data: await picture(1000, 1000, 'jpeg'),
    });
    expect(app.media.image('img/a.jpg')?.srcset).toBe('');
    expect(app.media.variants.pending()).toBe(1);
    await app.media.variants.run();
    expect(variants(app, 'img/a').map((_) => _.slice(0, 4))).toEqual([
      ['img/a@480.webp', 'image/webp', 480, 480],
      ['img/a@960.webp', 'image/webp', 960, 960],
    ]);
  });

  it('свои варианты загрузившего важнее: сервер их не трогает и своих не добавляет', async () => {
    const own = await picture(960, 480, 'webp');
    app.media.files.save({
      path: 'img/b.jpg',
      data: await picture(2400, 1200, 'jpeg'),
    });
    app.media.files.save({ path: 'img/b@960.webp', data: own });
    // Варианты до оригинала — тоже свои.
    app.media.files.save({ path: 'img/c@480.webp', data: own });
    app.media.files.save({
      path: 'img/c.png',
      data: await picture(2000, 1000, 'png'),
    });
    expect(app.media.variants.pending()).toBe(1);
    expect(await app.media.variants.run()).toBe(0);
    expect(variants(app, 'img/b').map((_) => _[0])).toEqual(['img/b@960.webp']);
    expect(variants(app, 'img/c').map((_) => _[0])).toEqual(['img/c@480.webp']);
  });
});

describe('основа картинки — одна на оригинал', () => {
  it('новая картинка с основой другой — отказ; замена тем же путём — можно; SVG с той же основой чужих вариантов не берёт', async () => {
    app.media.files.save({
      path: 'img/d.jpg',
      data: await picture(1200, 600, 'jpeg'),
    });
    await app.media.variants.run();
    const webp = await picture(1000, 1000, 'webp');
    expect(() =>
      app.media.files.save({ path: 'img/d.webp', data: webp })
    ).toThrow('image sizes are named after it');
    expect(app.media.files.read('img/d.webp')).toBeNull();
    app.media.files.save({
      path: 'img/d.svg',
      data: new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"/>'
      ),
    });
    expect(app.media.image('img/d.svg')?.srcset).toBe('');
    expect(app.media.image('img/d.jpg')?.srcset).toContain('img/d@960.webp');
    app.media.files.save({
      path: 'img/d.jpg',
      data: await picture(1000, 1000, 'jpeg'),
    });
    await app.media.variants.run();
    expect(variants(app, 'img/d').map((_) => _.slice(0, 4))).toEqual([
      ['img/d@480.webp', 'image/webp', 480, 480],
      ['img/d@960.webp', 'image/webp', 960, 960],
    ]);
  });
});

describe('удаление картинки', () => {
  it('варианты уходят вместе с ней: новой картинке с тем же именем чужие не достанутся', async () => {
    app.media.files.save({
      path: 'img/e.jpg',
      data: await picture(1200, 600, 'jpeg'),
    });
    await app.media.variants.run();
    expect(variants(app, 'img/e').length).toBe(2);
    app.media.files.remove('img/e.jpg');
    expect(variants(app, 'img/e')).toEqual([]);
    app.media.files.save({
      path: 'img/e.webp',
      data: await picture(1000, 1000, 'webp'),
    });
    await app.media.variants.run();
    expect(variants(app, 'img/e').map((_) => _.slice(0, 4))).toEqual([
      ['img/e@480.webp', 'image/webp', 480, 480],
      ['img/e@960.webp', 'image/webp', 960, 960],
    ]);
    // SVG с той же основой — без чужих вариантов: удаление его их не трогает.
    app.media.files.save({
      path: 'img/e.svg',
      data: new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"/>'
      ),
    });
    app.media.files.remove('img/e.svg');
    expect(variants(app, 'img/e').length).toBe(2);
  });
});

describe('очередь вариантов в базе', () => {
  const dirs: string[] = [];
  const fresh = () => (
    dirs.push(mkdtempSync(join(tmpdir(), 'cms-variants-'))),
    join(dirs.at(-1)!, 'site.db')
  );
  afterEach(
    () =>
      void dirs
        .splice(0)
        .forEach((_) => void rmSync(_, { recursive: true, force: true }))
  );

  it('задание переживает остановку процесса; после трёх падений картинку оставляют', async () => {
    const path = fresh();
    const first = createApp({ databasePath: path });
    first.media.files.save({
      path: 'img/a.jpg',
      data: await picture(1200, 600, 'jpeg'),
    });
    first.media.files.save({
      path: 'img/b.jpg',
      data: await picture(1200, 600, 'jpeg'),
    });
    first.close();
    // Задание img/b брали уже трижды, и каждый раз процесс падал.
    const db = new Database(path);
    db.run(
      "UPDATE media_variant_jobs SET attempts = 3 WHERE path = 'img/b.jpg'"
    );
    db.close();
    const again = createApp({ databasePath: path });
    expect(again.media.variants.pending()).toBe(2);
    expect(await again.media.variants.run()).toBe(2);
    expect(variants(again, 'img/a').map((_) => _[0])).toEqual([
      'img/a@480.webp',
      'img/a@960.webp',
    ]);
    expect(variants(again, 'img/b')).toEqual([]);
    expect(
      JSON.stringify(
        again.notify.incidents
          .list()
          .find((_) => _.kind === 'media.variants_skipped')?.detail
      )
    ).toContain('img/b.jpg: the server stopped 3 times');
    again.close();
  });

  it('у сервера варианты появляются сами, без вызова run', async () => {
    const site = createApp({
      databasePath: fresh(),
      background: true,
      updateCheck: false,
    });
    site.media.files.save({
      path: 'img/a.webp',
      data: await picture(1000, 500, 'webp'),
    });
    await until(() => variants(site, 'img/a').length === 2);
    expect(variants(site, 'img/a').map((_) => _[0])).toEqual([
      'img/a@480.webp',
      'img/a@960.webp',
    ]);
    site.close();
  });

  it('миграция старой базы ставит в очередь картинки без вариантов; с вариантами — не трогает', async () => {
    const path = fresh();
    const db = new Database(path, { strict: true });
    migrate(
      db,
      mediaMigrations.filter((_) => _.id < 'media/006_variant_jobs')
    );
    const insert = (file: string, type: string, data: Uint8Array) => {
      const measured = imageSize(data);
      const hash = new Bun.CryptoHasher('sha256')
        .update(data)
        .digest('hex')
        .slice(0, 16);
      db.query(
        `INSERT INTO media_files (path, stem, content_type, size, hash, width, height, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01')`
      ).run(
        file,
        file.slice(0, file.lastIndexOf('.')).replace(/@\d+$/, ''),
        type,
        data.byteLength,
        hash,
        measured?.width ?? null,
        measured?.height ?? null
      );
      db.query('INSERT INTO media_chunks (path, n, data) VALUES (?, 0, ?)').run(
        file,
        data
      );
      return hash;
    };
    insert('img/agent.jpg', 'image/jpeg', await picture(1200, 800, 'jpeg'));
    insert('img/hand.png', 'image/png', await picture(1200, 800, 'png'));
    const own = insert(
      'img/hand@480.webp',
      'image/webp',
      await picture(480, 320, 'webp')
    );
    insert('img/small.png', 'image/png', await picture(300, 200, 'png'));
    insert(
      'img/logo.svg',
      'image/svg+xml',
      new TextEncoder().encode('<svg width="900" height="300"/>')
    );
    db.close();
    const site = createApp({ databasePath: path });
    expect(site.media.variants.pending()).toBe(1);
    expect(await site.media.variants.run()).toBe(2);
    expect(variants(site, 'img/agent').map((_) => _[0])).toEqual([
      'img/agent@480.webp',
      'img/agent@960.webp',
    ]);
    expect(
      site.media.files.list().filter((_) => _.path.startsWith('img/hand@'))
    ).toMatchObject([{ path: 'img/hand@480.webp', hash: own }]);
    site.close();
  });

  it('оригинал заменили, пока резались варианты прежнего: они не пишутся, задание новой версии остаётся', async () => {
    const db = openDatabase(':memory:');
    migrate(db, mediaMigrations);
    let release = (): void => undefined;
    const resize: ImageResizer = (_data, _source, list) =>
      new Promise((done) => {
        release = () => done(list.map(() => new Uint8Array([1, 2, 3])));
      });
    const media = defineMedia({
      db,
      bus: defineEventBus(),
      cache: defineMediaCache({ dir: null }),
      resize,
      report: () => undefined,
    });
    media.files.save({
      path: 'img/a.png',
      data: await picture(1000, 500, 'png'),
    });
    const running = media.variants.run();
    await Bun.sleep(10);
    media.files.save({
      path: 'img/a.png',
      data: await picture(800, 400, 'png'),
    });
    release();
    await Bun.sleep(10);
    // Первый разбор взял и новое задание: оно ждёт своей нарезки.
    expect(media.files.list().map((_) => String(_.path))).toEqual([
      'img/a.png',
    ]);
    release();
    await running;
    expect(media.files.list().map((_) => [String(_.path), _.width])).toEqual([
      ['img/a.png', 800],
      ['img/a@480.webp', 480],
    ]);
    db.close();
  });
});
