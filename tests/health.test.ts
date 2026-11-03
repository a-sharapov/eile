import { describe, expect, it } from 'bun:test';
import { type App, type ClientSource, createApp } from '../src/app.ts';
import { VERSION } from '../src/cli/version.ts';
import { defineHttpListener } from '../src/contexts/certificates/index.ts';
import { HEALTH_PATH, isHealthRequest, isLoopback } from '../src/health.ts';
import { DEMO } from './fixtures/demo.ts';

const from = (address: string): ClientSource => ({
  requestIP: () => ({ address }),
});

const health = (
  app: App,
  init: RequestInit = {},
  client?: ClientSource,
  url = `http://localhost${HEALTH_PATH}`
) => app.fetch(new Request(url, init), client);

describe('/_cms/health', () => {
  it('200 и крошечное тело без версии: посетителю номер версии незачем', async () => {
    const app = createApp({ scaffold: DEMO });
    const response = await health(app, {}, from('203.0.113.7'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('{"status":"ok"}');
    // Без сведений об адресе (app.fetch в процессе) — тоже без версии.
    expect(await (await health(app)).json()).toEqual({ status: 'ok' });
    app.close();
  });

  it('версию называет только запросу с этой же машины, без заголовков прокси', async () => {
    const app = createApp({ scaffold: DEMO });
    expect(await (await health(app, {}, from('127.0.0.1'))).json()).toEqual({
      status: 'ok',
      version: VERSION,
    });
    expect(
      await (await health(app, {}, from('::ffff:127.0.0.1'))).json()
    ).toMatchObject({ version: VERSION });
    expect(
      await (
        await health(
          app,
          { headers: { 'x-forwarded-for': '198.51.100.1' } },
          from('127.0.0.1')
        )
      ).json()
    ).toEqual({ status: 'ok' });
    app.close();
    // За прокси с петли приходит каждый посетитель: версии нет никому.
    const proxied = createApp({ scaffold: DEMO, trustProxy: true });
    expect(await (await health(proxied, {}, from('127.0.0.1'))).json()).toEqual(
      { status: 'ok' }
    );
    proxied.close();
  });

  it('HEAD — без тела, другие методы — 405; query не мешает, похожий путь — не проверка', async () => {
    const app = createApp({ scaffold: DEMO });
    const head = await health(app, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const post = await health(app, { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    expect(
      (await health(app, {}, undefined, `http://a.de${HEALTH_PATH}?probe=1`))
        .status
    ).toBe(200);
    expect(isHealthRequest('http://a.de/_cms/healthz')).toBe(false);
    expect(isHealthRequest('http://a.de/blog?next=/_cms/health')).toBe(false);
    expect(
      (await health(app, {}, undefined, 'http://localhost/_cms/healthz')).status
    ).toBe(404);
    app.close();
  });

  it('база не читается — 503', async () => {
    const app = createApp({ scaffold: DEMO });
    app.close();
    const response = await health(app, {}, from('127.0.0.1'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'unavailable',
      version: VERSION,
    });
  });

  it('не запускает расписание публикаций: на запрос мониторов сайт не работает', async () => {
    let asked = 0;
    const app = createApp({
      scaffold: DEMO,
      clock: () => (asked++, new Date()),
    });
    const before = asked;
    await Promise.all(Array.from({ length: 20 }, () => health(app)));
    expect(asked).toBe(before);
    // Страница — запускает: значит, проверка выше и правда идёт мимо.
    await app.fetch(new Request('http://localhost/'));
    expect(asked).toBeGreaterThan(before);
    app.close();
  });

  it('петля — 127.0.0.0/8 и ::1', () => {
    expect(
      ['127.0.0.1', '127.8.9.10', '::1', '::ffff:127.0.0.1'].map(isLoopback)
    ).toEqual([true, true, true, true]);
    expect(
      ['10.0.0.1', '::ffff:10.0.0.1', '', '1127.0.0.1'].map(isLoopback)
    ).toEqual([false, false, false, false]);
  });

  it('с доменом HTTP-порт отдаёт проверку сам, остальное ведёт на HTTPS', async () => {
    const site = (request: Request) =>
      Promise.resolve(new Response(new URL(request.url).pathname));
    const handle = defineHttpListener({
      domains: ['a.de'],
      httpsPort: 443,
      challenge: () => null,
      secured: () => true,
      site,
      direct: [HEALTH_PATH],
    });
    const checked = await handle(new Request(`http://a.de${HEALTH_PATH}`));
    expect(checked.status).toBe(200);
    expect(await checked.text()).toBe(HEALTH_PATH);
    expect((await handle(new Request('http://a.de/blog'))).status).toBe(308);
  });
});
