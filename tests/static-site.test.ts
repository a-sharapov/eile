import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { type App, createApp } from '../src/app.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { linkMedia, unlinkMedia } from '../src/workspace/index.ts';
import { DEMO } from './fixtures/demo.ts';
import { WINDOWS } from './fixtures/platform.ts';

// Папка-сайт (ADR 0068): сборка Astro с `base: '/razbor'` и `trailingSlash: 'always'` рядом с сайтом Eile.

const root = mkdtempSync(join(tmpdir(), 'cms-static-site-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let cases = 0;
let folder = '';
let app: App;

const put = (path: string, data: string | Uint8Array): void => (
  mkdirSync(dirname(join(folder, path)), { recursive: true }),
  writeFileSync(join(folder, path), data)
);

const _CSS = `body{color:#123;}${'.a{margin:0}'.repeat(200)}`;

beforeEach(() => {
  folder = join(root, `case-${++cases}`, 'dist');
  mkdirSync(folder, { recursive: true });
  put('index.html', '<!doctype html><title>Разбор</title><h1>Главная</h1>');
  put('about/index.html', '<!doctype html><h1>О нас</h1>');
  put('_astro/x.Cx1FBVJX.css', _CSS);
  put('images/a.png', new Uint8Array(4096).fill(7));
  put('css/index.html', '');
  put('.env', 'SECRET=1');
  put('send.php', '<?php mail();');
  put('site.webmanifest', '{"name":"razbor"}');
  writeFileSync(join(root, `case-${cases}`, 'site.db.txt'), 'outside');
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

const link = () => linkMedia(app, folder, { into: 'razbor', staticSite: true });

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('папка-сайт', () => {
  it('index.html, слэш у каталога, типы и заголовки кэша', async () => {
    const report = await link();
    expect(report).toMatchObject({
      prefix: 'razbor',
      staticSite: true,
      serveOriginal: false,
      created: true,
      added: [],
      saved: true,
    });
    // index.html, about, css, png, css/index.html, webmanifest; .env не видно, PHP не отдаётся.
    expect(report.files).toBe(6);
    expect(report.skipped).toEqual([{ file: 'send.php', reason: 'type' }]);
    // Файлов в медиатеке нет: это не её файлы.
    expect(
      app.media.files.list().filter((_) => _.path.startsWith('razbor/'))
    ).toEqual([]);

    const bare = await get('/razbor?utm=1');
    expect(bare.status).toBe(301);
    expect(bare.headers.get('location')).toBe('/razbor/?utm=1');

    const home = await get('/razbor/');
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(home.headers.get('cache-control')).toBe('no-cache');
    expect(home.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(home.headers.get('etag')).toMatch(/^"[0-9a-z]+-[0-9a-z]+"$/);
    expect(await home.text()).toContain('<h1>Главная</h1>');
    expect(
      (await get('/razbor/', { 'if-none-match': home.headers.get('etag')! }))
        .status
    ).toBe(304);

    const about = await get('/razbor/about');
    expect(about.status).toBe(301);
    expect(about.headers.get('location')).toBe('/razbor/about/');
    expect(await (await get('/razbor/about/')).text()).toContain('О нас');
    expect(await (await get('/razbor/about/index.html')).text()).toContain(
      'О нас'
    );
    // Пустой index.html сборки (заглушка каталога) — тоже файл.
    const empty = await get('/razbor/css/');
    expect(empty.status).toBe(200);
    expect(await empty.text()).toBe('');

    const css = await get('/razbor/_astro/x.Cx1FBVJX.css');
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(css.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(css.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await css.text()).toBe(_CSS);

    const packed = await get('/razbor/_astro/x.Cx1FBVJX.css', {
      'accept-encoding': 'br, gzip',
    });
    expect(packed.headers.get('content-encoding')).toBe('br');
    expect(packed.headers.get('vary')).toBe('accept-encoding');
    expect(
      brotliDecompressSync(Buffer.from(await packed.arrayBuffer())).toString()
    ).toBe(_CSS);

    const png = await get('/razbor/images/a.png');
    expect(png.headers.get('content-type')).toBe('image/png');
    expect(png.headers.get('cache-control')).toBe('no-cache');
    expect(png.headers.get('accept-ranges')).toBe('bytes');
    const part = await get('/razbor/images/a.png', { range: 'bytes=0-99' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 0-99/4096');
    expect((await part.arrayBuffer()).byteLength).toBe(100);

    expect(
      (await get('/razbor/site.webmanifest')).headers.get('content-type')
    ).toBe('application/manifest+json');
    const head = await app.fetch(
      new Request('http://localhost/razbor/', { method: 'HEAD' })
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('нет файла — своя 404.html папки, без неё — страница 404 сайта', async () => {
    await link();
    // Адреса под приставкой принадлежат папке: плагин, который отвечает на всё, их не получает.
    app.extensions.plugins.save(
      'Everything',
      'export default { handle: () => new Response("plugin") };'
    );
    const site = await get('/razbor/missing/');
    expect(site.status).toBe(404);
    expect(await site.text()).toContain('Такой страницы нет');
    put('404.html', '<!doctype html><h1>Нет такой страницы разбора</h1>');
    const own = await get('/razbor/missing/');
    expect(own.status).toBe(404);
    expect(own.headers.get('cache-control')).toBe('no-cache');
    expect(own.headers.get('etag')).toBeNull();
    expect(await own.text()).toContain('Нет такой страницы разбора');
    // Новый файл виден сразу: папка-сайт не сверяется, файл ищется на каждый запрос.
    put('new/index.html', '<h1>Новое</h1>');
    expect(await (await get('/razbor/new/')).text()).toContain('Новое');
  });

  it('выход из папки, скрытое и чужие типы не отдаются', async () => {
    await link();
    void (
      WINDOWS ||
      symlinkSync(
        join(dirname(folder), 'site.db.txt'),
        join(folder, 'leak.txt')
      )
    );
    for (const path of [
      '/razbor/..%2Fsite.db.txt',
      '/razbor/%2e%2e/site.db.txt',
      '/razbor/images/..%2F..%2Fsite.db.txt',
      '/razbor//index.html',
    ])
      expect((await get(path)).status).toBe(404);
    expect(await (await get('/razbor/..%2Fsite.db.txt')).text()).not.toContain(
      'outside'
    );
    expect((await get('/razbor/leak.txt')).status).toBe(404);
    expect(await (await get('/razbor/.env')).text()).not.toContain('SECRET');
    expect((await get('/razbor/.env')).status).toBe(404);
    expect(await (await get('/razbor/send.php')).text()).not.toContain('<?php');
    // Только GET и HEAD: POST идёт к сайту — 405.
    expect(
      (
        await app.fetch(
          new Request('http://localhost/razbor/', { method: 'POST' })
        )
      ).status
    ).toBe(405);
  });

  it('вид папки выбирается при связке; unlink — адреса больше не отвечают', async () => {
    await link();
    // Повтор без флага — та же папка-сайт.
    expect((await linkMedia(app, folder, { into: 'razbor' })).staticSite).toBe(
      true
    );
    expect(
      code(() =>
        app.media.links.sync({
          dir: folder,
          prefix: 'razbor',
          staticSite: false,
        })
      )
    ).toBe('media.link_kind');
    expect(
      code(() =>
        app.media.links.sync({
          dir: folder,
          prefix: 'razbor',
          staticSite: true,
          serveOriginal: true,
        })
      )
    ).toBe('media.static_original');
    expect(app.media.links.list()).toEqual([
      expect.objectContaining({ prefix: 'razbor', staticSite: true, files: 6 }),
    ]);
    expect((await unlinkMedia(app, 'razbor')).staticSite).toBe(true);
    expect((await get('/razbor/index.html')).status).toBe(404);
  });

  it('cms media link --static, cms info и cms backup', async () => {
    const output: string[] = [];
    const db = join(dirname(folder), 'site.db');
    createApp({ databasePath: db, scaffold: DEMO }).close();
    const context = (
      args: readonly string[],
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
    await RUN.media!(
      context(['link', folder], { into: 'razbor', staticSite: true })
    );
    expect(output.join('\n')).toContain(
      `Папка ${folder} — сайт по адресу /razbor/`
    );
    expect(output.join('\n')).toContain('тип не для статического сайта: 1');
    output.length = 0;
    await RUN.info!(context([]));
    expect(output.join('\n')).toMatch(
      /Папка\s+razbor\/ ← .* · сайт · файлов 6.*не в копии базы/
    );
    output.length = 0;
    await RUN.backup!(context([join(dirname(folder), 'copy.db')]));
    expect(output.join('\n')).toContain('razbor/ ← ');
    output.length = 0;
    await RUN.media!(context(['unlink', 'razbor']));
    expect(output.join('\n')).toContain('Папка-сайт razbor/ отвязана');
  });
});
