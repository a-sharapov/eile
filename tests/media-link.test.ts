import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { MAX_MEDIA_SIZE } from '../src/contexts/media/index.ts';
import {
  linkMedia,
  type MediaLinkOptions,
  pushMedia,
  readMediaFolder,
  unlinkMedia,
} from '../src/workspace/index.ts';
import { DEMO } from './fixtures/demo.ts';
import { picture } from './fixtures/images.ts';
import { WINDOWS } from './fixtures/platform.ts';

const root = mkdtempSync(join(tmpdir(), 'cms-media-link-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let cases = 0;
let folder = '';
let cache = '';

const put = (path: string, data: string | Uint8Array): void => (
  mkdirSync(dirname(join(folder, path)), { recursive: true }),
  writeFileSync(join(folder, path), data)
);

beforeEach(() => {
  const at = join(root, `case-${++cases}`);
  folder = join(at, 'assets');
  cache = join(at, 'cache');
  mkdirSync(folder, { recursive: true });
});

// База в памяти, кэш медиатеки — на диске: в нём живут варианты картинок папки.
const open = (): App => createApp({ scaffold: DEMO, mediaCache: cache });

const link = (app: App, options: MediaLinkOptions = {}) =>
  linkMedia(app, folder, { into: 'assets', ...options });

const get = (app: App, path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

// Сколько строк и кусков хранения у путей под приставкой — прямо из файла базы.
const stored = (db: string, prefix: string) =>
  ((sqlite) =>
    ((counts) => (sqlite.close(), counts))({
      rows: sqlite
        .query<{ n: number }, [string]>(
          'SELECT count(*) AS n FROM media_files WHERE path LIKE ?'
        )
        .get(`${prefix}/%`)!.n,
      chunks: sqlite
        .query<{ n: number }, [string]>(
          'SELECT count(*) AS n FROM media_chunks WHERE path LIKE ?'
        )
        .get(`${prefix}/%`)!.n,
    }))(new Database(db, { readonly: true }));

describe('связанная папка: связывание и сверка', () => {
  it('файлы — в медиатеке без байтов в базе; повтор без изменений ничего не читает', async () => {
    const db = join(dirname(folder), 'site.db');
    const app = createApp({
      databasePath: db,
      scaffold: DEMO,
      mediaCache: cache,
    });
    put('images/proudcts/4a_(5).jpg', await picture(640, 480, 'jpeg'));
    put('files/price list.pdf', '%PDF-1.4 price');
    put('js/app.js', 'alert(1)');
    put('.htaccess', 'deny');
    put('images/.tmb/x.jpg', 'thumb');
    const first = await link(app);
    expect(first).toMatchObject({
      prefix: 'assets',
      created: true,
      added: ['assets/files/price-list.pdf', 'assets/images/proudcts/4a-5.jpg'],
      skipped: [{ file: 'js/app.js', reason: 'type' }],
      files: 2,
      hashed: 2,
      saved: true,
      problems: [],
    });
    const photo = app.media.files.read('assets/images/proudcts/4a-5.jpg')!;
    expect(photo.meta).toMatchObject({
      contentType: 'image/jpeg',
      width: 640,
      height: 480,
      linked: { prefix: 'assets', file: 'images/proudcts/4a_(5).jpg' },
    });
    // Два файла и вариант 480 картинки — строки без единого куска хранения.
    expect(stored(db, 'assets')).toEqual({ rows: 3, chunks: 0 });

    const again = await link(app);
    expect(again).toMatchObject({
      created: false,
      added: [],
      changed: [],
      removed: [],
      same: 2,
      hashed: 0,
    });
    app.close();
  });

  it('сверка: новое, изменённое, исчезнувшее; описание оставшихся сохраняется', async () => {
    const app = open();
    put('a.txt', 'one');
    put('b.txt', 'two');
    put('c.txt', 'three');
    await link(app);
    app.media.files.describe('assets/a.txt', 'Первый файл');
    app.media.files.describe('assets/b.txt', 'Второй файл');
    const before = app.media.url('assets/b.txt');

    put('b.txt', 'two, but longer');
    rmSync(join(folder, 'c.txt'));
    put('d.txt', 'four');
    // Тот же файл с новым временем изменения: хэш тот же — строка просто запоминает время.
    utimesSync(join(folder, 'a.txt'), new Date(), new Date(Date.now() + 5000));
    const report = await link(app);
    expect(report).toMatchObject({
      added: ['assets/d.txt'],
      changed: ['assets/b.txt'],
      removed: ['assets/c.txt'],
      same: 1,
      hashed: 3,
    });
    expect(app.media.files.read('assets/a.txt')!.meta.alt).toBe('Первый файл');
    expect(app.media.files.read('assets/b.txt')!.meta.alt).toBe('Второй файл');
    expect(app.media.url('assets/b.txt')).not.toBe(before);
    expect(app.media.files.read('assets/c.txt')).toBeNull();
    expect(await link(app)).toMatchObject({ same: 3, hashed: 0 });
    app.close();
  });

  it('--dry-run ничего не пишет; media.json — описания, лишний ключ — ничего не записано', async () => {
    const app = open();
    put('images/hero.jpg', await picture(300, 200, 'jpeg'));
    const dry = await link(app, { dryRun: true });
    expect(dry).toMatchObject({
      added: ['assets/images/hero.jpg'],
      saved: false,
    });
    expect(app.media.files.list().some((_) => _.linked)).toBe(false);
    expect(app.media.links.list()).toEqual([]);

    put('media.json', JSON.stringify({ 'images/nope.jpg': { alt: 'Нет' } }));
    const refused = await link(app);
    expect(refused.problems).toEqual([
      expect.objectContaining({ code: 'workspace.unknown_media' }),
    ]);
    expect(app.media.links.list()).toEqual([]);

    put('media.json', JSON.stringify({ 'images/hero.jpg': { alt: 'Кухня' } }));
    expect(await link(app)).toMatchObject({ saved: true, problems: [] });
    expect(app.media.files.read('assets/images/hero.jpg')!.meta.alt).toBe(
      'Кухня'
    );
    app.close();
  });

  it('файл больше 25 МиБ связывается: предел — для байтов в базе', async () => {
    const app = open();
    put('files/videos/c1.mp4', new Uint8Array(MAX_MEDIA_SIZE + 1024).fill(3));
    expect(await link(app)).toMatchObject({
      added: ['assets/files/videos/c1.mp4'],
      problems: [],
    });
    const range = await get(app, '/media/assets/files/videos/c1.mp4', {
      range: `bytes=${MAX_MEDIA_SIZE}-${MAX_MEDIA_SIZE + 9}`,
    });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe(
      `bytes ${MAX_MEDIA_SIZE}-${MAX_MEDIA_SIZE + 9}/${MAX_MEDIA_SIZE + 1024}`
    );
    expect(new Uint8Array(await range.arrayBuffer())).toEqual(
      new Uint8Array(10).fill(3)
    );
    app.close();
  });

  it.skipIf(WINDOWS)(
    'символьная ссылка за пределы папки пропускается и не отдаётся; внутри — файл',
    async () => {
      const app = open();
      const outside = join(dirname(folder), 'secret.txt');
      writeFileSync(outside, 'secret');
      put('docs/real.txt', 'real');
      symlinkSync(outside, join(folder, 'docs/secret.txt'));
      symlinkSync(
        join(folder, 'docs/real.txt'),
        join(folder, 'docs/alias.txt')
      );
      const report = await link(app, { serveOriginal: true });
      expect(report.skipped).toEqual([
        { file: 'docs/secret.txt', reason: 'outside' },
      ]);
      expect(report.added).toEqual([
        'assets/docs/alias.txt',
        'assets/docs/real.txt',
      ]);
      expect((await get(app, '/assets/docs/secret.txt')).status).toBe(404);
      expect((await get(app, '/media/assets/docs/secret.txt')).status).toBe(
        404
      );
      expect(await (await get(app, '/assets/docs/alias.txt')).text()).toBe(
        'real'
      );
      app.close();
    }
  );

  it.skipIf(WINDOWS || process.getuid?.() === 0)(
    'нечитаемый файл пропускается, остальная папка связывается',
    async () => {
      const app = open();
      put('ok.txt', 'ok');
      put('locked.txt', 'locked');
      chmodSync(join(folder, 'locked.txt'), 0o000);
      const report = await link(app);
      chmodSync(join(folder, 'locked.txt'), 0o644);
      expect(report).toMatchObject({
        added: ['assets/ok.txt'],
        skipped: [{ file: 'locked.txt', reason: 'unreadable' }],
        saved: true,
      });
      app.close();
    }
  );

  it('приставки: служебные заняты, вложенные не пересекаются', async () => {
    const app = open();
    put('a.txt', 'a');
    await expect(linkMedia(app, folder, { into: 'manager' })).rejects.toThrow(
      expect.objectContaining({ code: 'media.reserved_prefix' })
    );
    await link(app);
    await expect(
      linkMedia(app, folder, { into: 'assets/images' })
    ).rejects.toThrow(
      expect.objectContaining({ code: 'media.prefix_overlap' })
    );
    app.close();
  });

  it('отвязка убирает файлы папки и их варианты; файлы на диске остаются', async () => {
    const app = open();
    put('images/big.jpg', await picture(1200, 800, 'jpeg'));
    put('a.txt', 'a');
    await link(app);
    expect(app.media.files.list().length).toBeGreaterThan(2);
    expect(await unlinkMedia(app, 'assets', { dryRun: true })).toMatchObject({
      removed: ['assets/a.txt', 'assets/images/big.jpg'],
      variants: 2,
      saved: false,
    });
    expect(await unlinkMedia(app, 'assets')).toMatchObject({ saved: true });
    expect(app.media.files.list().filter((_) => _.linked)).toEqual([]);
    expect(app.media.links.list()).toEqual([]);
    expect(existsSync(join(folder, 'images/big.jpg'))).toBe(true);
    app.close();
  });

  it('cms media push --prune не трогает файлы папки', async () => {
    const app = open();
    put('a.txt', 'a');
    await link(app);
    const other = join(dirname(folder), 'push');
    mkdirSync(other);
    writeFileSync(join(other, 'b.txt'), 'b');
    const report = await readMediaFolder(other, 'assets').then((_) =>
      pushMedia(app, _, { prune: true })
    );
    expect(report).toMatchObject({ added: ['assets/b.txt'], removed: [] });
    expect(app.media.files.read('assets/a.txt')).not.toBeNull();
    app.close();
  });
});

describe('связанная папка: путь к папке', () => {
  it('папка рядом с базой записывается от каталога базы — база и папка переезжают вместе', async () => {
    const site = dirname(folder);
    const db = join(site, 'site.db');
    put('a.txt', 'hello');
    const app = createApp({ databasePath: db });
    const report = await link(app);
    expect(report.root).toBe('assets');
    app.close();

    const moved = join(root, `moved-${cases}`);
    renameSync(site, moved);
    const again = createApp({ databasePath: join(moved, 'site.db') });
    expect(again.media.links.list()[0]).toMatchObject({
      root: 'assets',
      dir: join(moved, 'assets'),
      present: true,
    });
    expect(await (await get(again, '/media/assets/a.txt')).text()).toBe(
      'hello'
    );
    again.close();
  });

  it('папка вне каталога базы — абсолютным путём', async () => {
    const db = join(root, `elsewhere-${cases}`, 'site.db');
    mkdirSync(dirname(db), { recursive: true });
    put('a.txt', 'a');
    const app = createApp({ databasePath: db });
    expect((await link(app)).root).toBe(folder);
    app.close();
  });
});

describe('связанная папка: поиск и отдача', () => {
  it('media() и image() принимают и исходный путь, в том числе с %-кодами', async () => {
    const app = open();
    put('images/Фото/Притыцкого 89.JPG', await picture(800, 600, 'jpeg'));
    // Регистр различает не всякая файловая система: на Windows Photo.jpg и photo.jpg — один файл.
    if (!WINDOWS) {
      put('images/Photo.jpg', 'upper');
      put('images/photo.jpg', 'lower');
    }
    await link(app);
    const library = '/media/assets/images/foto/pritytskogo-89.jpg?v=';
    expect(app.media.url('assets/images/Фото/Притыцкого 89.JPG')).toStartWith(
      library
    );
    expect(
      app.media.url(
        `assets/images/${encodeURIComponent('Фото')}/${encodeURIComponent('Притыцкого 89.JPG')}`
      )
    ).toStartWith(library);
    expect(app.media.url('/assets/images/Фото/Притыцкого 89.JPG')).toStartWith(
      library
    );
    // Путь на диске точнее имени медиатеки: Photo.jpg и photo.jpg — разные файлы.
    if (!WINDOWS) {
      expect(app.media.url('assets/images/Photo.jpg')).toStartWith(
        '/media/assets/images/photo.jpg?v='
      );
      expect(app.media.url('assets/images/photo.jpg')).toStartWith(
        '/media/assets/images/photo-2.jpg?v='
      );
    }
    expect(
      app.media.image('assets/images/Фото/Притыцкого 89.JPG')
    ).toMatchObject({
      src: expect.stringContaining(library),
      width: 800,
      height: 600,
    });
    app.close();
  });

  it('/media/… — с диска: Range, 206, 416, ETag, вечный кэш с ?v=', async () => {
    const app = open();
    put('files/clip.mp4', '0123456789abcdef');
    await link(app);
    const url = app.media.url('assets/files/clip.mp4')!;
    const whole = await get(app, url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('cache-control')).toContain('immutable');
    expect(whole.headers.get('content-type')).toBe('video/mp4');
    const etag = whole.headers.get('etag')!;
    expect(etag).toBe(`"${url.split('?v=')[1]}"`);
    expect(await whole.text()).toBe('0123456789abcdef');
    const part = await get(app, url, { range: 'bytes=4-7' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 4-7/16');
    expect(await part.text()).toBe('4567');
    expect((await get(app, url, { range: 'bytes=40-50' })).status).toBe(416);
    expect((await get(app, url, { 'if-none-match': etag })).status).toBe(304);
    app.close();
  });

  it('файл, изменённый на диске после сверки, отдаётся без ETag и вечного кэша', async () => {
    const app = open();
    put('a.txt', 'before');
    await link(app);
    const url = app.media.url('assets/a.txt')!;
    put('a.txt', 'after, longer');
    const response = await get(app, url);
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toBe('after, longer');
    app.close();
  });

  it('исходный адрес — только с --serve-original; файл важнее страниц и правил, нет файла — дальше страницы', async () => {
    const app = open();
    put('images/proudcts/memorial-08-1/4a_(5).jpg', 'jpeg bytes');
    await link(app);
    const legacy = `/assets/images/proudcts/memorial-08-1/${encodeURIComponent('4a_(5).jpg')}`;
    expect((await get(app, legacy)).status).toBe(404);

    await link(app, { serveOriginal: true });
    app.redirects.rules.create({
      from: '/assets/images/proudcts/memorial-08-1/4a_(5).jpg',
      to: '/',
      status: 301,
    });
    const served = await get(app, legacy);
    expect(served.status).toBe(200);
    expect(served.headers.get('etag')).not.toBeNull();
    expect(await served.text()).toBe('jpeg bytes');
    expect((await get(app, '/assets/images/4a_(5).jpg')).status).toBe(404);
    app.redirects.rules.create({
      from: '/assets/gone.jpg',
      to: '/',
      status: 301,
    });
    expect((await get(app, '/assets/gone.jpg')).status).toBe(301);

    // Выйти из папки не выйдет: ни `..`, ни закодированный слэш.
    expect((await get(app, '/assets/..%2F..%2Fsite.db')).status).toBe(404);
    expect((await get(app, '/assets/images/%2e%2e/%2e%2e/x')).status).toBe(404);
    expect(
      (
        await app.fetch(
          new Request(`http://localhost${legacy}`, { method: 'POST' })
        )
      ).status
    ).not.toBe(200);

    // Без флага — как было; --no-serve-original выключает.
    await link(app);
    expect((await get(app, legacy)).status).toBe(200);
    // Выключили — адрес идёт дальше, к правилу переадресации.
    await link(app, { serveOriginal: false });
    expect((await get(app, legacy)).status).toBe(301);
    app.close();
  });

  it('файла или папки нет на диске — 404, запись в журнал и находка диагностики, не сбой', async () => {
    const app = open();
    put('a.txt', 'a');
    put('b.txt', 'b');
    await link(app, { serveOriginal: true });
    rmSync(join(folder, 'a.txt'));
    expect((await get(app, '/media/assets/a.txt')).status).toBe(404);
    expect((await get(app, '/assets/a.txt')).status).toBe(404);
    const missing = app.diagnostics
      .report(true, 'ru')
      .findings.find((_) => _.id === 'media.linked_missing');
    expect(missing?.items.map((_) => _.label)).toEqual(['assets/a.txt']);

    rmSync(folder, { recursive: true });
    expect((await get(app, '/media/assets/b.txt')).status).toBe(404);
    expect(
      app.diagnostics
        .report(true, 'ru')
        .findings.find((_) => _.id === 'media.linked_missing')?.items[0]?.label
    ).toBe('Вся папка assets/');
    expect((await get(app, '/')).status).toBe(200);
    app.close();
  });
});

describe('связанная папка: варианты картинок', () => {
  it('srcset готов сразу после связывания; варианты — в кэше на диске, не в базе', async () => {
    const app = open();
    put('images/proudcts/4a_(5).jpg', await picture(1200, 900, 'jpeg'));
    const report = await link(app);
    expect(report.variants).toBe(2);
    const image = app.media.image('assets/images/proudcts/4a_(5).jpg')!;
    expect(image.srcset).toContain(
      '/media/assets/images/proudcts/4a-5@480.webp?v='
    );
    expect(image.srcset).toContain(
      '/media/assets/images/proudcts/4a-5@960.webp?v='
    );
    const variant = app.media.files
      .list()
      .find((_) => _.path === 'assets/images/proudcts/4a-5@960.webp')!;
    expect(variant.linked).toEqual({ prefix: 'assets', file: null });
    expect(
      readdirSync(join(cache, 'assets~images~proudcts~4a-5@960.webp'))
    ).toEqual([variant.hash]);
    const served = await get(app, `/media/${variant.path}?v=${variant.hash}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/webp');

    // Кэш стёрли: вариант ведёт на оригинал и делается заново.
    rmSync(cache, { recursive: true });
    const moved = await get(app, `/media/${variant.path}?v=${variant.hash}`);
    expect(moved.status).toBe(307);
    expect(moved.headers.get('location')).toStartWith(
      '/media/assets/images/proudcts/4a-5.jpg?v='
    );
    expect(app.media.variants.pending()).toBe(1);
    expect(await app.media.variants.run()).toBe(2);
    expect(
      app.media.image('assets/images/proudcts/4a-5.jpg')!.srcset
    ).toContain('4a-5@960.webp');
    app.close();
  });

  it('без кэша на диске вариантов у картинок папки нет, а связывание проходит', async () => {
    const app = createApp({ scaffold: DEMO });
    put('big.jpg', await picture(1200, 900, 'jpeg'));
    expect(await link(app)).toMatchObject({
      queued: 0,
      variants: 0,
      problems: [],
    });
    expect(app.media.image('assets/big.jpg')).toMatchObject({ srcset: '' });
    app.close();
  });

  it('изменённая картинка теряет прежние варианты и получает новые', async () => {
    const app = open();
    put('big.jpg', await picture(1200, 900, 'jpeg'));
    await link(app);
    const before = app.media.image('assets/big.jpg')!.srcset;
    put('big.jpg', await picture(1000, 1000, 'png'));
    expect(await link(app)).toMatchObject({
      changed: ['assets/big.jpg'],
      variants: 2,
    });
    expect(app.media.image('assets/big.jpg')!.srcset).not.toBe(before);
    expect(app.media.files.read('assets/big.jpg')!.meta).toMatchObject({
      width: 1000,
      height: 1000,
    });
    app.close();
  });
});

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

describe('связанная папка в менеджере', () => {
  it('описание правится; удалить и заменить нельзя; где используется — и по исходному пути', async () => {
    const app = open();
    put('images/4a_(5).jpg', await picture(300, 200, 'jpeg'));
    await link(app);
    const cookie = await managerCookie(app);
    const call = (method: string, path: string, body?: unknown) =>
      app.fetch(
        new Request(`http://localhost/manager/api${path}`, {
          method,
          headers: { cookie, 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
      );
    const listed = (await (await call('GET', '/media')).json()) as {
      path: string;
      linked?: unknown;
    }[];
    expect(
      listed.find((_) => _.path === 'assets/images/4a-5.jpg')?.linked
    ).toEqual({ prefix: 'assets', file: 'images/4a_(5).jpg' });
    const described = await call('PATCH', '/media/assets/images/4a-5.jpg', {
      alt: 'Памятник',
    });
    expect(described.status).toBe(200);
    expect(app.media.files.read('assets/images/4a-5.jpg')!.meta.alt).toBe(
      'Памятник'
    );
    const removed = await call('DELETE', '/media/assets/images/4a-5.jpg');
    expect(removed.status).toBe(409);
    expect(
      ((await removed.json()) as { error: { code: string } }).error.code
    ).toBe('media.linked_file');
    const form = new FormData();
    form.set('file', new Blob(['x']), '4a-5.jpg');
    form.set('path', 'assets/images/4a-5.jpg');
    const replaced = await app.fetch(
      new Request('http://localhost/manager/api/media', {
        method: 'POST',
        headers: { cookie },
        body: form,
      })
    );
    expect(replaced.status).toBe(409);
    expect(app.media.files.read('assets/images/4a-5.jpg')).not.toBeNull();

    const page = app.content.pages.create({
      title: 'Памятники',
      alias: 'pamyatniki',
      template: 'Base',
      content: '<p><img src="/assets/images/4a_(5).jpg" alt=""></p>',
    });
    const usage = (await (
      await call('GET', '/media-usage/assets/images/4a-5.jpg')
    ).json()) as { pages: { id: number }[] };
    expect(usage.pages.map((_) => _.id)).toEqual([page]);

    const status = (await (await call('GET', '/upkeep')).json()) as {
      linked: { prefix: string; files: number }[];
    };
    expect(status.linked).toEqual([
      expect.objectContaining({ prefix: 'assets', files: 1, present: true }),
    ]);
    app.close();
  });
});

describe('cms media link, cms info и cms backup', () => {
  const output: string[] = [];
  const context = (
    args: readonly string[],
    db: string,
    options: Record<string, unknown> = {}
  ): Context => ({
    args,
    options: {
      port: '0',
      db,
      help: false,
      version: false,
      passwordStdin: false,
      trustProxy: false,
      ...options,
    },
    paint: definePaint(false),
    language: 'ru',
    tty: false,
    out: (_) => void output.push(_),
  });

  it('связать, сверить все, показать в info, напомнить в backup, отвязать', async () => {
    const site = dirname(folder);
    const db = join(site, 'site.db');
    createApp({ databasePath: db, scaffold: DEMO }).close();
    put('images/a.jpg', await picture(200, 100, 'jpeg'));
    put('files/b.pdf', '%PDF');

    output.length = 0;
    await RUN.media!(
      context(['link', folder], db, { into: 'assets', serveOriginal: true })
    );
    expect(output.join('\n')).toContain(
      `Папка ${folder} — в медиатеке под assets/`
    );
    expect(output.join('\n')).toContain('не входит в копию базы');
    expect(output.join('\n')).toContain('Исходные адреса /assets/…');

    output.length = 0;
    await RUN.media!(context(['link'], db, { json: true }));
    expect(JSON.parse(output.join('\n'))).toMatchObject({
      prefix: 'assets',
      root: 'assets',
      same: 2,
      serveOriginal: true,
    });

    output.length = 0;
    await RUN.info!(context([], db));
    expect(output.join('\n')).toMatch(
      /Папка\s+assets\/ ← .*файлов 2.*не в копии базы/
    );
    output.length = 0;
    await RUN.info!(context([], db, { json: true }));
    expect(JSON.parse(output.join('\n')).links).toEqual([
      expect.objectContaining({ prefix: 'assets', files: 2, inBackup: false }),
    ]);

    output.length = 0;
    await RUN.backup!(context([join(site, 'copy.db')], db));
    expect(output.join('\n')).toContain('Связанные папки не входят в копию');
    expect(output.join('\n')).toContain('assets/ ← ');

    await expect(
      RUN.media!(context(['link', join(site, 'nope')], db))
    ).rejects.toThrow('Нет папки');
    await expect(RUN.media!(context(['unlink'], db))).rejects.toThrow(
      'Нужна приставка'
    );
    output.length = 0;
    await RUN.media!(context(['unlink', 'assets'], db));
    expect(output.join('\n')).toContain('Папка assets/ отвязана');
    output.length = 0;
    await RUN.media!(context(['link'], db));
    expect(output.join('\n')).toContain('Связанных папок нет');
  });
});
