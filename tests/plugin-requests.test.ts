import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import type { Transports } from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';

// Плагин отвечает сам (ADR 0067): API для лендинга, приём заявок, CORS — как OnPageNotFound в Evo.

let app: App;

const transports: Transports = {
  telegram: {
    send: () => Promise.resolve(),
    me: () => Promise.resolve('@bot'),
    chats: () => Promise.resolve([]),
  },
  email: {
    send: () => Promise.resolve(),
    mail: () => Promise.resolve(),
    probe: () => Promise.resolve({ ok: true, latencyMs: 1 }),
  },
};

beforeEach(() => {
  app = createApp({ scaffold: DEMO, transports });
});

afterEach(() => app.close());

const request = (
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) => app.fetch(new Request(`http://localhost${path}`, init));

const seen = (): Record<string, unknown> =>
  ((globalThis as Record<string, unknown>).__plugin ??= {}) as Record<
    string,
    unknown
  >;

const _API = `
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
export default {
  handle: (request: Request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/v1/') && url.pathname !== '/kontakty') return null;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/api/v1/health') return Response.json({ status: 'alive' }, { headers: cors });
    if (url.pathname === '/api/v1/echo' && request.method === 'POST')
      return request.json().then((body: unknown) => Response.json({ body }, { headers: cors }));
    return new Response('plugin', { headers: cors });
  },
};`;

describe('плагин отвечает на запрос (handle)', () => {
  it('отвечает на адрес без страницы любым методом, с CORS и preflight', async () => {
    app.extensions.plugins.save('Api', _API);
    const health = await request('/api/v1/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'alive' });
    expect(health.headers.get('access-control-allow-origin')).toBe('*');
    // Мимо кэша страниц: ни x-cache, ни заголовков страницы.
    expect(health.headers.get('x-cache')).toBeNull();

    const preflight = await request('/api/v1/landing?type=process', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://granitmemorial.by',
        'access-control-request-method': 'POST',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, OPTIONS'
    );

    const echo = await request('/api/v1/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Анна' }),
    });
    expect(await echo.json()).toEqual({ body: { name: 'Анна' } });

    const head = await request('/api/v1/health', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toContain('application/json');
    expect(await head.text()).toBe('');

    // Плагин вернул null — дальше страница 404 и 405, как раньше.
    expect((await request('/missing')).status).toBe(404);
    expect((await request('/missing', { method: 'POST' })).status).toBe(405);
  });

  it('страница, правило переадресации и прежний адрес важнее плагина', async () => {
    app.extensions.plugins.save(
      'Api',
      'export default { handle: () => new Response("plugin") };'
    );
    app.redirects.rules.create({ from: '/old-price', to: '/kontakty' });
    const about = app.content.published.byPath('/o-proekte')!.id;
    app.content.pages.edit(about, { alias: 'about' });

    expect(await (await request('/kontakty')).text()).not.toBe('plugin');
    const ruled = await request('/old-price');
    expect(ruled.status).toBe(301);
    expect(ruled.headers.get('location')).toBe('/kontakty');
    const moved = await request('/o-proekte');
    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('/about');
    // Служебные адреса — раньше всех.
    expect((await request('/_cms/health')).headers.get('content-type')).toBe(
      'application/json'
    );
    expect(await (await request('/nothing-here')).text()).toBe('plugin');
    // Страницы отвечают только GET: POST на её адрес — плагину.
    expect(await (await request('/kontakty', { method: 'POST' })).text()).toBe(
      'plugin'
    );
  });

  it('первый ответ по порядку имён плагинов; handle раньше notFound', async () => {
    app.extensions.plugins.save(
      'Beta',
      `export default {
        handle: (r: Request) => new URL(r.url).pathname === '/x' ? new Response('beta') : null,
        notFound: () => '/kontakty',
      };`
    );
    app.extensions.plugins.save(
      'Alpha',
      `export default {
        handle: (r: Request) => new URL(r.url).pathname === '/x' ? new Response('alpha') : null,
      };`
    );
    expect(await (await request('/x')).text()).toBe('alpha');
    const other = await request('/y');
    expect(other.status).toBe(301);
    expect(other.headers.get('location')).toBe('/kontakty');
  });

  it('упавший или зависший плагин записан, запрос идёт к 404', async () => {
    app.close();
    app = createApp({
      scaffold: DEMO,
      transports,
      pluginTimings: { handle: 50 },
    });
    seen().aborted = false;
    app.extensions.plugins.save(
      'Broken',
      `export default { handle: (r: Request) => {
        if (new URL(r.url).pathname === '/boom') throw new Error('boom');
        return null;
      } };`
    );
    app.extensions.plugins.save(
      'Slow',
      `export default { handle: (r: Request, context: any) =>
        new URL(r.url).pathname === '/slow'
          ? new Promise(() => context.signal.addEventListener('abort', () => { (globalThis as any).__plugin.aborted = true; }))
          : null,
      };`
    );
    const boom = await request('/boom');
    expect(boom.status).toBe(404);
    expect(await boom.text()).toContain('Такой страницы нет');
    const started = performance.now();
    expect((await request('/slow')).status).toBe(404);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(seen().aborted).toBe(true);
    expect((await request('/boom', { method: 'POST' })).status).toBe(405);
    expect(
      app.notify.incidents
        .list()
        .filter((_) => _.kind === 'extensions.plugin_failed')
        .map((_) => (typeof _.title === 'string' ? _.title : _.title.en))
    ).toEqual(expect.arrayContaining(['Plugin Broken crashed']));
    expect(JSON.stringify(app.notify.incidents.list())).toContain(
      'handle did not answer'
    );
  });

  it('ответ плагина не кэшируется и не правится хуком render', async () => {
    seen().calls = 0;
    app.extensions.plugins.save(
      'Counter',
      `export default { handle: (r: Request) => new URL(r.url).pathname === '/counter'
        ? new Response('<html><head></head><body>' + (++(globalThis as any).__plugin.calls) + '</body></html>', { headers: { 'content-type': 'text/html' } })
        : null };`
    );
    app.extensions.plugins.save(
      'Mark',
      "export default { render: (html: string) => html.replace('</body>', '<!--mark--></body>') };"
    );
    expect(await (await request('/counter')).text()).toContain(
      '<body>1</body>'
    );
    expect(await (await request('/counter')).text()).toContain(
      '<body>2</body>'
    );
    app.extensions.plugins.setEnabled('Counter', false);
    expect((await request('/counter')).status).toBe(404);
  });

  it('тело больше 64 КБ — 413 до плагина; без плагинов с handle — 405, как раньше', async () => {
    const big = 'x'.repeat(70 * 1024);
    expect(
      (await request('/api/v1/echo', { method: 'POST', body: big })).status
    ).toBe(405);
    app.extensions.plugins.save('Api', _API);
    expect(
      (await request('/api/v1/echo', { method: 'POST', body: big })).status
    ).toBe(413);
  });
});

describe('контекст плагина', () => {
  it('site и setCustom: страницы с настройкой перерисовываются, то же значение кэш не трогает', async () => {
    app.site.customSettings.save('usdRate', '3.10', 'Курс USD');
    const page = app.content.pages.create({
      title: 'Цены',
      alias: 'prices',
      template: 'Base',
      content: '<p>Курс: [@usdRate]</p>',
      publish: true,
    });
    expect(page).toBeGreaterThan(0);
    app.extensions.plugins.save(
      'Rate',
      `export default { handle: (r: Request, context: any) => {
        const url = new URL(r.url);
        if (url.pathname === '/api/v1/cy') return Response.json({ course: context.site().custom.usdRate, missing: context.site().custom.nope ?? null, name: context.site().name });
        if (url.pathname === '/api/v1/set') return Response.json({ changed: context.setCustom('usdRate', url.searchParams.get('v')) });
        return null;
      } };`
    );
    expect(await (await request('/api/v1/cy')).json()).toEqual({
      course: '3.10',
      missing: null,
      name: 'Eile',
    });
    expect(await (await request('/prices')).text()).toContain('Курс: 3.10');
    expect((await request('/prices')).headers.get('x-cache')).toBe('hit');

    expect(await (await request('/api/v1/set?v=3.25')).json()).toEqual({
      changed: true,
    });
    const fresh = await request('/prices');
    expect(fresh.headers.get('x-cache')).toBe('miss');
    expect(await fresh.text()).toContain('Курс: 3.25');
    // Пояснение из менеджера осталось.
    expect(
      app.site.customSettings.list().find((_) => _.key === 'usdRate')
    ).toMatchObject({ value: '3.25', note: 'Курс USD' });

    expect(await (await request('/api/v1/set?v=3.25')).json()).toEqual({
      changed: false,
    });
    expect((await request('/prices')).headers.get('x-cache')).toBe('hit');
    // Проверки — как в менеджере: неверный ключ — сбой плагина, запрос идёт к 404.
    app.extensions.plugins.save(
      'Bad',
      `export default { handle: (r: Request, context: any) =>
        new URL(r.url).pathname === '/bad' ? (context.setCustom('1bad', 'x'), new Response('ok')) : null };`
    );
    expect((await request('/bad')).status).toBe(404);
  });

  it('submit: заявка формы без печати — правила полей, уведомление, вебхук, ошибки', async () => {
    app.notify.settings.save({
      email: {
        host: 'smtp.test',
        security: 'none',
        from: 'site@example.com',
        to: 'boss@example.com',
      },
    });
    app.forms.forms.save('lead', {
      title: 'Заявка с лендинга',
      source: `<div class="field" data-field="text" data-label="Имя">
  <label for="f-name">Имя</label><input id="f-name" name="name" required>
</div>
<div class="field" data-field="tel" data-label="Телефон">
  <label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" required>
</div>
<div class="field" data-field="textarea" data-label="Комментарий">
  <label for="f-text">Комментарий</label><textarea id="f-text" name="text"></textarea>
</div>`,
      webhook: { url: 'http://127.0.0.1:9/hook' },
    });
    app.extensions.plugins.save(
      'Landing',
      `export default { handle: (r: Request, context: any) =>
        new URL(r.url).pathname === '/api/v1/landing' && r.method === 'POST'
          ? r.json().then((body: any) => Response.json(context.submit('lead', body, {
              origin: r.headers.get('origin') ?? undefined,
              referrer: r.headers.get('referer') ?? undefined,
            })))
          : null };`
    );
    const post = (body: unknown, origin = 'https://granitmemorial.by') =>
      request('/api/v1/landing?token=t&type=process', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          referer: 'https://granitmemorial.by/razbor/',
        },
        body: JSON.stringify(body),
      }).then(
        (_) =>
          _.json() as Promise<{
            ok: boolean;
            id?: number;
            spam?: boolean;
            errors?: Record<string, string>;
          }>
      );

    const done = await post({
      name: 'Анна',
      phone: '+375 29 000-00-00',
      text: 'Перезвоните',
      utmCampaign: 'лишнее',
      _stamp: 'x',
    });
    expect(done).toMatchObject({ ok: true, spam: false });
    const stored = app.forms.inbox.list({ limit: 1 })[0]!;
    expect(stored.id).toBe(done.id!);
    expect(stored.values.map((_) => _.name)).toEqual(['name', 'phone', 'text']);
    expect(stored.status).toBe('new');
    expect(stored.context).toMatchObject({
      pageId: null,
      pageTitle: 'granitmemorial.by',
      url: 'https://granitmemorial.by/',
      referrer: 'https://granitmemorial.by/razbor/',
    });
    expect(app.notify.outbox.bySource(`submission:${done.id}`)).toHaveLength(1);
    expect(app.forms.webhooks.of(done.id!)).toMatchObject({
      status: 'pending',
    });

    expect(await post({ name: 'Без телефона' })).toEqual({
      ok: false,
      errors: { phone: expect.any(String) },
    });

    const spam = await post(
      { name: 'Бот', phone: '1', text: 'Купить https://spam.example' },
      'javascript:alert(1)'
    );
    expect(spam).toMatchObject({ ok: true, spam: true });
    expect(app.notify.outbox.bySource(`submission:${spam.id}`)).toEqual([]);
    expect(
      app.forms.inbox.list({ status: 'spam', limit: 1 })[0]!.context
    ).toMatchObject({ pageTitle: '', url: '' });
  });
});
