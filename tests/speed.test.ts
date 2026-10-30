import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { brotliDecompressSync } from 'node:zlib';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

const cacheOf = (path: string) =>
  get(path).then((_) => _.headers.get('x-cache'));

const idOf = (path: string) => app.content.published.byPath(path)!.id;

describe('кэш страниц в настройках', () => {
  const manager = (method: string, cookie = '') =>
    app.fetch(
      new Request('http://localhost/manager/api/cache', {
        method,
        headers: cookie ? { cookie } : {},
      })
    );

  it('сводка считает ответы, сброс опустошает кэш и начинает счёт заново', async () => {
    const setup = await app.fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: app.identity.setup.token(),
          email: 'admin@example.com',
          password: 'correct horse battery',
        }),
      })
    );
    const cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await manager('GET')).status).toBe(401);
    await get('/kontakty');
    await get('/kontakty');
    await get('/wp-admin');
    expect(await (await manager('GET', cookie)).json()).toMatchObject({
      pages: 1,
      hits: 1,
      misses: 1,
      bypass: 0,
      manual: false,
    });
    expect(await (await manager('DELETE', cookie)).json()).toMatchObject({
      pages: 0,
      bytes: 0,
      hits: 0,
      misses: 0,
      manual: true,
    });
    expect(await cacheOf('/kontakty')).toBe('miss');
    await app.fetch(
      new Request('http://localhost/manager/api/settings', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ pageCacheMb: 128 }),
      })
    );
    expect(await (await manager('GET', cookie)).json()).toMatchObject({
      budget: 128 * 1024 * 1024,
    });
  });
});

describe('кэш страниц', () => {
  it('первый запрос рендерит, второй отдаёт из кэша', async () => {
    expect(await cacheOf('/kontakty')).toBe('miss');
    expect(await cacheOf('/kontakty')).toBe('hit');
  });

  it('правка компонента сбрасывает только страницы, где он есть', async () => {
    app.design.templates.save(
      'Plain',
      '<script>let { page } = $props();</script><h1>{page.title}</h1>'
    );
    app.content.pages.edit(idOf('/kontakty'), { template: 'Plain' });
    await cacheOf('/kontakty');
    await cacheOf('/o-proekte');
    app.design.components.save(
      'Header',
      '<script>let { siteName } = $props();</script><header>{siteName}!</header>'
    );
    expect(await cacheOf('/kontakty')).toBe('hit');
    expect(await cacheOf('/o-proekte')).toBe('miss');
  });

  it('правка страницы не трогает тех, кто её не читал', async () => {
    const team = app.content.pages.create({
      parentId: idOf('/o-proekte'),
      title: 'Команда',
      template: 'Base',
      publish: true,
    });
    await cacheOf('/kontakty');
    await cacheOf('/o-proekte/komanda');
    app.content.pages.edit(team, { content: '<p>Нас пятеро</p>' });
    expect(await cacheOf('/kontakty')).toBe('hit');
    expect(await cacheOf('/o-proekte/komanda')).toBe('miss');
  });

  it('правка верхнего уровня сбрасывает меню на всех страницах', async () => {
    await cacheOf('/kontakty');
    app.content.pages.edit(idOf('/o-proekte'), { menuTitle: 'Проект' });
    const page = await get('/kontakty');
    expect(page.headers.get('x-cache')).toBe('miss');
    expect(await page.text()).toContain('>Проект</a>');
  });

  it('правка предка сбрасывает потомков: у них наследуемые поля и путь', async () => {
    const about = idOf('/o-proekte');
    app.content.pages.create({
      parentId: about,
      title: 'Команда',
      template: 'Base',
      publish: true,
    });
    await cacheOf('/o-proekte/komanda');
    app.content.pages.edit(about, { alias: 'about' });
    expect((await get('/o-proekte/komanda')).status).toBe(301);
    expect(await cacheOf('/about/komanda')).toBe('miss');
  });
});

describe('некэшируемые регионы', () => {
  beforeEach(() => {
    app.design.components.save(
      'Greeting',
      "<script>import { request } from '$core'; let { prefix } = $props();</script><b>{prefix}, {request().query.name ?? 'гость'}</b>"
    );
    app.design.templates.save(
      'Base',
      "<script>import Uncached from '$core/Uncached'; let { page } = $props();</script><h1>{page.title}</h1><Uncached name=\"Greeting\" props={{ prefix: 'Привет' }} />"
    );
  });

  it('страница из кэша, регион — свежий на каждом запросе', async () => {
    const first = await get('/kontakty?name=Аня');
    expect(first.headers.get('x-cache')).toBe('miss');
    expect(await first.text()).toContain('<b>Привет, Аня</b>');
    const second = await get('/kontakty?name=Боб');
    expect(second.headers.get('x-cache')).toBe('hit');
    expect(await second.text()).toContain('<b>Привет, Боб</b>');
  });

  it('шаблон, читающий запрос сам, в кэш не попадает', async () => {
    app.design.templates.save(
      'Base',
      "<script>import { request } from '$core';</script><p>{request().path}</p>"
    );
    expect(await cacheOf('/kontakty')).toBe('bypass');
    expect(await cacheOf('/kontakty')).toBe('bypass');
  });

  it('сломанный регион не роняет страницу', async () => {
    app.design.templates.save(
      'Base',
      '<script>import Uncached from \'$core/Uncached\';</script><h1>ok</h1><Uncached name="Missing" />'
    );
    const response = await get('/kontakty');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<h1>ok</h1>');
  });

  it('неизвестный встроенный модуль — ошибка вида, а не сохранения', async () => {
    app.design.templates.save(
      'Base',
      "<script>import Nope from '$core/Nope';</script><Nope />"
    );
    expect((await get('/kontakty')).status).toBe(500);
  });
});

describe('HTTP', () => {
  it('ETag и 304', async () => {
    const etag = (await get('/kontakty')).headers.get('etag')!;
    const again = await get('/kontakty', { 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
  });

  it('brotli и gzip по Accept-Encoding, без него — как есть', async () => {
    const plain = await (await get('/kontakty')).text();
    const br = await get('/kontakty', { 'accept-encoding': 'gzip, br' });
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(
      brotliDecompressSync(Buffer.from(await br.arrayBuffer())).toString()
    ).toBe(plain);
    const gzip = await get('/kontakty', {
      'accept-encoding': 'gzip, br;q=0',
    });
    expect(gzip.headers.get('content-encoding')).toBe('gzip');
    expect(
      new TextDecoder().decode(
        Bun.gunzipSync(new Uint8Array(await gzip.arrayBuffer()))
      )
    ).toBe(plain);
    expect((await get('/kontakty')).headers.get('vary')).toBe(
      'accept-encoding'
    );
  });
});
