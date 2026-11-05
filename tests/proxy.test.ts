import { afterEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';
import { MANAGER_FILES } from './fixtures/manager.ts';

// Аудит: за TLS-прокси вход отвечал 403 (Origin https против http в URL), cookie не получала Secure.

const _PASSWORD = 'correct horse battery';

let app: App;

afterEach(() => app.close());

const start = (trustProxy: boolean) => {
  app = createApp({ scaffold: DEMO, trustProxy, managerFiles: MANAGER_FILES });
  return app.fetch(
    new Request('http://localhost/manager/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: app.identity.setup.token(),
        email: 'admin@example.com',
        password: _PASSWORD,
      }),
    })
  );
};

// Так запрос приходит от nginx: внутренний адрес, публичные протокол и хост — в заголовках.
const behindProxy = (
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
  client = '203.0.113.5'
) =>
  app.fetch(
    new Request(`http://127.0.0.1:8080${path}`, {
      ...init,
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'site.test',
        'x-forwarded-for': `10.9.9.9, ${client}`,
        ...init.headers,
      },
    }),
    { requestIP: () => ({ address: '127.0.0.1' }) }
  );

const login = (password: string, client?: string) =>
  behindProxy(
    '/manager/api/session',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://site.test',
      },
      body: JSON.stringify({ email: 'admin@example.com', password }),
    },
    client
  );

describe('за прокси с --trust-proxy', () => {
  it('вход работает, cookie — __Host- с Secure', async () => {
    await start(true);
    const response = await login(_PASSWORD);
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toStartWith('__Host-cms_session=');
    expect(cookie).toContain('; Secure');
    const session = await behindProxy('/manager/api/session', {
      headers: { cookie: cookie.split(';')[0]! },
    });
    expect(((await session.json()) as { user: unknown }).user).not.toBeNull();
  });

  it('посетитель — из X-Forwarded-For: чужие неудачи не запирают', async () => {
    await start(true);
    for (const _ of [1, 2, 3, 4, 5]) {
      await login('wrong-password', '198.51.100.1');
    }
    expect((await login(_PASSWORD, '198.51.100.1')).status).toBe(429);
    expect((await login(_PASSWORD, '198.51.100.2')).status).toBe(200);
  });
});

describe('без --trust-proxy', () => {
  it('X-Forwarded-* не действуют: подделкой заголовка блокировку не обойти', async () => {
    await start(false);
    app.site.settings.update({ siteUrl: 'https://site.test/' });
    for (const i of [1, 2, 3, 4, 5]) {
      await login('wrong-password', `198.51.100.${i}`);
    }
    expect((await login(_PASSWORD, '198.51.100.99')).status).toBe(429);
  });

  it('адрес сайта https из настроек — свой Origin', async () => {
    await start(false);
    app.site.settings.update({ siteUrl: 'https://site.test/' });
    const response = await app.fetch(
      new Request('http://site.test/manager/api/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://site.test',
        },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: _PASSWORD,
        }),
      })
    );
    expect(response.status).toBe(200);
  });
});

describe('заголовки менеджера', () => {
  it('страница — CSP по хэшу, без фреймов; API — no-store', async () => {
    await start(false);
    const page = await app.fetch(new Request('http://localhost/manager/'));
    const csp = page.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'self' 'sha256-[\w+/=]+'/);
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    const api = await app.fetch(
      new Request('http://localhost/manager/api/session')
    );
    expect(api.headers.get('cache-control')).toBe('no-store');
    expect(api.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
