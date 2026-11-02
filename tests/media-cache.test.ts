import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import {
  defineMediaCache,
  type MediaFile,
  mediaCacheDir,
} from '../src/contexts/media/index.ts';

const root = mkdtempSync(join(tmpdir(), 'cms-media-cache-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let folders = 0;
const fresh = (): string => join(root, `case-${++folders}`);

// Каталог кэша внутри обычного файла: ни создать, ни записать — как диск только для чтения.
const unwritable = (): string =>
  ((blocker) => (writeFileSync(blocker, 'x'), join(blocker, 'cache')))(fresh());

const bytes = (text: string) => new TextEncoder().encode(text);

const versions = (dir: string, path: string): string[] =>
  ((folder) => (existsSync(folder) ? readdirSync(folder).toSorted() : []))(
    join(dir, path.replaceAll('/', '~'))
  );

type Mode = {
  readonly name: string;
  readonly open: () => App;
};

const MODES: readonly Mode[] = [
  { name: 'с кэшем на диске', open: () => createApp({ mediaCache: fresh() }) },
  { name: 'база в памяти, без кэша', open: () => createApp() },
  {
    name: 'кэш не пишется',
    open: () => createApp({ mediaCache: unwritable() }),
  },
];

// Что отдаёт /media по Range и HEAD — одно и то же с диска и из базы.
const CASES: readonly (readonly [
  string,
  string,
  Record<string, string>,
  number,
  string | null,
  string,
])[] = [
  ['весь файл', 'GET', {}, 200, null, '0123456789'],
  ['начало', 'GET', { range: 'bytes=0-1' }, 206, 'bytes 0-1/10', '01'],
  ['середина', 'GET', { range: 'bytes=3-6' }, 206, 'bytes 3-6/10', '3456'],
  ['хвост', 'GET', { range: 'bytes=-3' }, 206, 'bytes 7-9/10', '789'],
  ['до конца', 'GET', { range: 'bytes=8-' }, 206, 'bytes 8-9/10', '89'],
  ['за конец', 'GET', { range: 'bytes=7-100' }, 206, 'bytes 7-9/10', '789'],
  [
    'Bytes заглавными',
    'GET',
    { range: 'Bytes=0-1' },
    206,
    'bytes 0-1/10',
    '01',
  ],
  ['вне файла', 'GET', { range: 'bytes=20-30' }, 416, 'bytes */10', ''],
  ['конец до начала', 'GET', { range: 'bytes=5-2' }, 416, 'bytes */10', ''],
  ['два диапазона', 'GET', { range: 'bytes=0-1,4-5' }, 200, null, '0123456789'],
  ['чужая единица', 'GET', { range: 'items=0-1' }, 200, null, '0123456789'],
  ['HEAD', 'HEAD', {}, 200, null, ''],
  ['HEAD с Range', 'HEAD', { range: 'bytes=0-1' }, 200, null, ''],
];

describe.each(MODES)('отдача медиа: $name', ({ open }) => {
  let app: App;
  let hash: string;
  let logged: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logged = spyOn(console, 'error').mockImplementation(() => undefined);
    app = open();
    hash = app.media.files.save({
      path: 'video/clip.mp4',
      data: bytes('0123456789'),
    }).hash;
  });

  afterEach(() => (app.close(), logged.mockRestore()));

  const get = (headers: Record<string, string> = {}, method = 'GET') =>
    app.fetch(
      new Request('http://localhost/media/video/clip.mp4', { method, headers })
    );

  it.each(CASES)('%s', async (_, method, headers, status, range, body) => {
    const response = await get(headers, method);
    expect(response.status).toBe(status);
    expect(response.headers.get('content-range')).toBe(range);
    expect(await response.text()).toBe(body);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('etag')).toBe(`"${hash}"`);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    void (
      method === 'HEAD' &&
      expect(response.headers.get('content-length')).toBe('10')
    );
  });

  it('ETag совпал — 304; с версией в адресе — навсегда в кэше браузера', async () => {
    const again = await get({
      'if-none-match': `"${hash}"`,
      range: 'bytes=0-1',
    });
    expect([again.status, await again.text()]).toEqual([304, '']);
    const versioned = await app.fetch(
      new Request(`http://localhost/media/video/clip.mp4?v=${hash}`)
    );
    expect(versioned.headers.get('cache-control')).toContain('immutable');
    expect((await get()).headers.get('cache-control')).toBe('no-cache');
  });

  it('по сети: длина, диапазон и HEAD — такие, как их видит браузер', async () => {
    const server = Bun.serve({ port: 0, development: false, fetch: app.fetch });
    const wire = (headers: Record<string, string>, method = 'GET') =>
      fetch(new URL('/media/video/clip.mp4', server.url), { method, headers });
    try {
      const middle = await wire({ range: 'bytes=3-6' });
      expect(middle.status).toBe(206);
      expect(middle.headers.get('content-length')).toBe('4');
      expect(middle.headers.get('content-range')).toBe('bytes 3-6/10');
      expect(middle.headers.get('accept-ranges')).toBe('bytes');
      expect(await middle.text()).toBe('3456');
      const whole = await wire({});
      expect(whole.headers.get('content-length')).toBe('10');
      expect(await whole.text()).toBe('0123456789');
      const head = await wire({ range: 'bytes=3-6' }, 'HEAD');
      expect([head.status, head.headers.get('content-length')]).toEqual([
        200,
        '10',
      ]);
      const beyond = await wire({ range: 'bytes=20-' });
      expect([beyond.status, beyond.headers.get('content-range')]).toEqual([
        416,
        'bytes */10',
      ]);
    } finally {
      server.stop(true);
    }
  });
});

describe('кэш медиатеки на диске', () => {
  it('файл выносится из базы один раз и дальше отдаётся с диска', async () => {
    const dir = fresh();
    const app = createApp({ mediaCache: dir });
    const { hash } = app.media.files.save({
      path: 'video/clip.mp4',
      data: bytes('0123456789'),
    });
    const middle = () =>
      app
        .fetch(
          new Request('http://localhost/media/video/clip.mp4', {
            headers: { range: 'bytes=3-6' },
          })
        )
        .then((_) => _.text());
    expect(await middle()).toBe('3456');
    expect(versions(dir, 'video/clip.mp4')).toEqual([hash]);
    // Подменили файл кэша той же длины — второй запрос читает его, а не базу.
    writeFileSync(join(dir, 'video~clip.mp4', hash), 'abcdefghij');
    expect(await middle()).toBe('defg');
    app.close();
  });

  it('одновременные промахи по файлу — одна выгрузка, недописанного файла нет', async () => {
    const dir = fresh();
    const cache = defineMediaCache({ dir });
    const file = {
      path: 'video/clip.mp4',
      contentType: 'video/mp4',
      size: 10,
      hash: '0123456789abcdef',
      width: null,
      height: null,
      alt: '',
    } as unknown as MediaFile;
    let reads = 0;
    const content = () => (
      (reads += 1), { hash: file.hash, data: bytes('0123456789') }
    );
    const blobs = await Promise.all(
      Array.from({ length: 5 }, () => cache.local(file, content))
    );
    expect(reads).toBe(1);
    expect(await Promise.all(blobs.map((_) => _!.text()))).toEqual(
      Array.from({ length: 5 }, () => '0123456789')
    );
    expect(versions(dir, 'video/clip.mp4')).toEqual([file.hash]);
  });

  it('файл кэша другой длины не отдаётся: он выносится из базы заново', async () => {
    const dir = fresh();
    const app = createApp({ mediaCache: dir });
    const { hash } = app.media.files.save({
      path: 'docs/a.txt',
      data: bytes('целый файл'),
    });
    mkdirSync(join(dir, 'docs~a.txt'), { recursive: true });
    writeFileSync(join(dir, 'docs~a.txt', hash), 'обрыв');
    const response = await app.fetch(
      new Request('http://localhost/media/docs/a.txt')
    );
    expect(await response.text()).toBe('целый файл');
    app.close();
  });

  it('замена и удаление файла убирают с диска его версии; варианты — так же', async () => {
    const dir = fresh();
    const app = createApp({ mediaCache: dir });
    const fetchOf = (path: string) =>
      app
        .fetch(new Request(`http://localhost/media/${path}`))
        .then((_) => _.text());
    const first = app.media.files.save({
      path: 'img/sea.jpg',
      data: bytes('jpg'),
    });
    const variant = app.media.files.save({
      path: 'img/sea@960.webp',
      data: bytes('w960'),
    });
    await fetchOf('img/sea.jpg');
    await fetchOf('img/sea@960.webp');
    expect(versions(dir, 'img/sea.jpg')).toEqual([first.hash]);
    expect(versions(dir, 'img/sea@960.webp')).toEqual([variant.hash]);

    const next = app.media.files.save({
      path: 'img/sea.jpg',
      data: bytes('new'),
    });
    expect(versions(dir, 'img/sea.jpg')).toEqual([]);
    expect(await fetchOf('img/sea.jpg')).toBe('new');
    expect(versions(dir, 'img/sea.jpg')).toEqual([next.hash]);
    // Описание — то же содержимое: файл кэша остаётся.
    app.media.files.describe('img/sea.jpg', 'Море');
    expect(versions(dir, 'img/sea.jpg')).toEqual([next.hash]);

    app.media.files.remove('img/sea.jpg');
    app.media.files.remove('img/sea@960.webp');
    expect(versions(dir, 'img/sea.jpg')).toEqual([]);
    expect(versions(dir, 'img/sea@960.webp')).toEqual([]);
    app.close();
  });

  it('уборка убирает то, чего нет в базе, и не трогает чужие файлы', async () => {
    const dir = fresh();
    const app = createApp({ mediaCache: dir });
    const live = app.media.files.save({ path: 'docs/a.txt', data: bytes('a') });
    await app.fetch(new Request('http://localhost/media/docs/a.txt'));
    const put = (path: string, hoursAgo = 0) =>
      ((file, at) => (
        mkdirSync(join(file, '..'), { recursive: true }),
        writeFileSync(file, 'x'),
        utimesSync(file, at, at)
      ))(join(dir, path), new Date(Date.now() - hoursAgo * 3_600_000));
    put('gone~old.mp4/0123456789abcdef');
    put('docs~a.txt/fedcba9876543210');
    put(`docs~a.txt/.${live.hash}.0199aaaa-bbbb.part`, 2);
    put(`docs~a.txt/.${live.hash}.0199cccc-dddd.part`);
    put('docs~a.txt/readme');
    put('notes.txt');
    put('backups/site.db');

    expect(app.media.cache.sweep()).toBe(3);
    expect(existsSync(join(dir, 'gone~old.mp4'))).toBe(false);
    expect(versions(dir, 'docs/a.txt')).toEqual([
      `.${live.hash}.0199cccc-dddd.part`,
      live.hash,
      'readme',
    ]);
    expect(readdirSync(dir).toSorted()).toEqual([
      'backups',
      'docs~a.txt',
      'notes.txt',
    ]);
    app.close();
  });

  it('по умолчанию кэш — рядом с базой, восстановление копии его стирает', async () => {
    const dir = fresh();
    mkdirSync(dir);
    const app = createApp({ databasePath: join(dir, 'site.db') });
    const { hash } = app.media.files.save({
      path: 'docs/a.txt',
      data: bytes('до копии'),
    });
    app.backup(join(dir, 'copy.db'));
    await app.fetch(new Request('http://localhost/media/docs/a.txt'));
    const cache = join(dir, 'site.media-cache');
    expect(versions(cache, 'docs/a.txt')).toEqual([hash]);
    await app.restore(await Bun.file(join(dir, 'copy.db')).bytes());
    expect(existsSync(join(cache, 'docs~a.txt'))).toBe(false);
    expect(
      await (
        await app.fetch(new Request('http://localhost/media/docs/a.txt'))
      ).text()
    ).toBe('до копии');
    app.close();
  });

  it('имя каталога по умолчанию: site.db → site.media-cache; у базы в памяти кэша нет', () => {
    expect(mediaCacheDir('/srv/cms/site.db')).toBe('/srv/cms/site.media-cache');
    expect(mediaCacheDir('data/blog')).toBe('data/blog.media-cache');
    expect(mediaCacheDir(':memory:')).toBeNull();
  });
});

describe('кэш не пишется', () => {
  let logged: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logged = spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => logged.mockRestore());

  it('файлы идут из базы кусками, в журнал — одна строка', async () => {
    const app = createApp({ mediaCache: unwritable() });
    const big = new Uint8Array(9 * 1024 * 1024).map((_, i) => i % 251);
    app.media.files.save({ path: 'video/big.mp4', data: big });
    app.media.files.save({ path: 'docs/a.txt', data: bytes('0123456789') });
    const response = await app.fetch(
      new Request('http://localhost/media/video/big.mp4')
    );
    expect(response.headers.get('content-length')).toBe(String(big.length));
    const parts = await Array.fromAsync(response.body!);
    expect(parts.map((_) => _.byteLength)).toEqual([
      4 * 1024 * 1024,
      4 * 1024 * 1024,
      1024 * 1024,
    ]);
    const tail = await app.fetch(
      new Request('http://localhost/media/video/big.mp4', {
        headers: { range: `bytes=${big.length - 3}-` },
      })
    );
    expect([...new Uint8Array(await tail.arrayBuffer())]).toEqual([
      ...big.subarray(big.length - 3),
    ]);
    expect(
      await (
        await app.fetch(new Request('http://localhost/media/docs/a.txt'))
      ).text()
    ).toBe('0123456789');
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[0])).toContain(
      'served from the database'
    );
    app.close();
  });

  it('из базы читается только нужный кусок', () => {
    const app = createApp();
    app.media.files.save({ path: 'docs/a.txt', data: bytes('0123456789') });
    const file = app.media.files.read('docs/a.txt')!;
    const text = (_: Uint8Array) => new TextDecoder().decode(_);
    expect(text(file.chunk(3, 4))).toBe('3456');
    expect(text(file.chunk(8, 4))).toBe('89');
    expect(file.chunk(20, 4).byteLength).toBe(0);
    app.close();
  });

  it('после сбоя кэш минуту отдыхает, потом пишет снова', async () => {
    let now = 0;
    const blocker = fresh();
    writeFileSync(blocker, 'x');
    const dir = join(blocker, 'cache');
    const cache = defineMediaCache({ dir, now: () => now });
    const file = {
      path: 'docs/a.txt',
      contentType: 'text/plain',
      size: 1,
      hash: '0123456789abcdef',
      width: null,
      height: null,
      alt: '',
    } as unknown as MediaFile;
    const content = () => ({ hash: file.hash, data: bytes('a') });
    expect(await cache.local(file, content)).toBeNull();
    rmSync(blocker);
    expect(await cache.local(file, content)).toBeNull();
    now += 61_000;
    expect(await (await cache.local(file, content))!.text()).toBe('a');
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
