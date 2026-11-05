import { beforeAll, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

const PASSWORD = 'correct horse battery';
let app: App;
let admin = '';

const api = (
  method: string,
  path: string,
  {
    body,
    cookie,
    token,
    origin,
  }: { body?: unknown; cookie?: string; token?: string; origin?: string } = {}
) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(origin ? { origin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const mcp = (message: unknown, token?: string, init: RequestInit = {}) =>
  app.fetch(
    new Request('http://localhost/manager/mcp', {
      method: 'POST',
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
      body: init.method === 'GET' ? undefined : JSON.stringify(message),
    })
  );

const issue = (cookie: string, name: string) =>
  api('POST', '/tokens', { cookie, body: { name } }).then(
    (_) => _.json() as Promise<any>
  );

beforeAll(async () => {
  app = createApp({ scaffold: DEMO });
  const setup = await api('POST', '/setup', {
    body: {
      token: app.identity.setup.token(),
      email: 'anna@example.com',
      name: 'Анна',
      password: PASSWORD,
    },
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
});

describe('ключи API', () => {
  it('выпуск: ключ виден один раз, в списке — имя и последние символы', async () => {
    const issued = await issue(admin, 'Claude Code');
    expect(issued.token).toStartWith('cms_');
    const list = await api('GET', '/tokens', { cookie: admin }).then(
      (_) => _.json() as Promise<any[]>
    );
    expect(list[0]).toMatchObject({
      name: 'Claude Code',
      hint: issued.token.slice(-4),
      usedAt: null,
    });
    expect(JSON.stringify(list)).not.toContain(issued.token);
    expect(
      (await api('POST', '/tokens', { cookie: admin, body: { name: ' ' } }))
        .status
    ).toBe(422);
  });

  it('ключ входит в API с правами пользователя; неверный — 401; отметка использования', async () => {
    const { token } = await issue(admin, 'скрипт');
    expect((await api('GET', '/pages', { token })).status).toBe(200);
    expect((await api('GET', '/pages', { token: `${token}x` })).status).toBe(
      401
    );
    expect((await api('GET', '/pages', { token: 'not-ours' })).status).toBe(
      401
    );
    const list = await api('GET', '/tokens', { cookie: admin }).then(
      (_) => _.json() as Promise<any[]>
    );
    expect(list.find((_) => _.name === 'скрипт').usedAt).not.toBeNull();
  });

  it('ключом не выпустить ключ, не сменить пароль, не завести пользователя и не скачать копию', async () => {
    const { token } = await issue(admin, 'утёкший');
    for (const [method, path] of [
      ['POST', '/tokens'],
      ['GET', '/tokens'],
      ['PUT', '/session/password'],
      ['POST', '/users'],
      ['GET', '/backup'],
    ] as const) {
      const response = await api(method, path, {
        token,
        body: method === 'GET' ? undefined : {},
      });
      expect(response.status).toBe(403);
      expect(((await response.json()) as any).error.code).toBe(
        'identity.session_required'
      );
    }
  });

  it('ключом не сменить адрес сайта и другие настройки «только для человека»', async () => {
    const { token } = await issue(admin, 'настройки');
    const before = (await api('GET', '/settings', { cookie: admin }).then((_) =>
      _.json()
    )) as any;
    const blocked = await api('PATCH', '/settings', {
      token,
      body: { siteUrl: 'https://evil.example' },
    });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as any).error.code).toBe(
      'manager.settings_restricted'
    );
    const after = (await api('GET', '/settings', { cookie: admin }).then((_) =>
      _.json()
    )) as any;
    expect(after.siteUrl).toBe(before.siteUrl);
    // Безопасное поле ключ менять может.
    const safe = await api('PATCH', '/settings', {
      token,
      body: { description: 'От бота' },
    });
    expect(safe.status).toBe(200);
    // Человек в менеджере — может и адрес; вернём как было, чтобы не влиять на другие тесты.
    const human = await api('PATCH', '/settings', {
      cookie: admin,
      body: { siteUrl: 'https://ok.example' },
    });
    expect(human.status).toBe(200);
    expect(((await human.json()) as any).siteUrl).toBe('https://ok.example');
    await api('PATCH', '/settings', {
      cookie: admin,
      body: { siteUrl: before.siteUrl, description: before.description },
    });
  });

  it('права — роли: ключ редактора не сохраняет код', async () => {
    await app.identity.users.create({
      email: 'ed@example.com',
      role: 'editor',
      password: PASSWORD,
    });
    const login = await api('POST', '/session', {
      body: { email: 'ed@example.com', password: PASSWORD },
    });
    const editor = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { token } = await issue(editor, 'редактор');
    const saved = await api('PUT', '/elements/component/Hack', {
      token,
      body: { source: '<p/>' },
    });
    expect(saved.status).toBe(403);
  });

  it('отозванный ключ больше не входит; чужой не отозвать', async () => {
    const { id, token } = await issue(admin, 'на час');
    expect(
      (await api('DELETE', `/tokens/${id}`, { cookie: admin })).status
    ).toBe(200);
    expect((await api('GET', '/pages', { token })).status).toBe(401);
    expect(
      (await api('DELETE', `/tokens/${id}`, { cookie: admin })).status
    ).toBe(404);
  });

  it('ключи — свойство сервера: в копию сайта не попадают', async () => {
    await issue(admin, 'для копии');
    const archive = app.archive();
    expect(JSON.stringify(archive)).not.toContain('для копии');
  });
});

describe('MCP по HTTP', () => {
  it('без ключа — 401 с WWW-Authenticate, GET — 405, чужой Origin — 403', async () => {
    const anonymous = await mcp({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toBe('Bearer');
    const { token } = await issue(admin, 'mcp');
    expect((await mcp(null, token, { method: 'GET' })).status).toBe(405);
    expect(
      (
        await mcp({ jsonrpc: '2.0', id: 1, method: 'ping' }, token, {
          headers: { origin: 'https://evil.example' },
        })
      ).status
    ).toBe(403);
  });

  it('сообщение — ответ JSON, уведомление — 202, инструмент — от имени владельца ключа', async () => {
    const { token } = await issue(admin, 'mcp-2');
    const hello = await mcp(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      },
      token
    );
    expect(hello.status).toBe(200);
    expect(((await hello.json()) as any).result.instructions).toContain('Анна');
    expect(
      (
        await mcp(
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          token
        )
      ).status
    ).toBe(202);
    const templates = await mcp(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_templates', arguments: {} },
      },
      token
    ).then((_) => _.json() as Promise<any>);
    expect(JSON.parse(templates.result.content[0].text)).toContain('Base');
    const broken = await app.fetch(
      new Request('http://localhost/manager/mcp', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: '{ nope',
      })
    );
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as any).error.code).toBe(-32700);
  });

  it('сессия MCP помнит прочитанные заявки; без своего id — сессия ключа', async () => {
    const { token } = await issue(admin, 'mcp-3');
    const tool = (name: string, args: object, session?: string) =>
      mcp(
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: { name, arguments: args },
        },
        token,
        session ? { headers: { 'mcp-session-id': session } } : {}
      ).then((_) => _.json() as Promise<any>);
    const open = () =>
      mcp(
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        token
      ).then((_) => _.headers.get('mcp-session-id')!);
    const first = await open();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    await tool('list_submissions', {}, first);
    const blocked = await tool(
      'save_element',
      { kind: 'component', name: 'Door', source: '<p/>' },
      first
    );
    expect(blocked.result.content[0].text).toStartWith('agent.tainted');
    const second = await open();
    const allowed = await tool(
      'save_element',
      { kind: 'component', name: 'Door', source: '<p/>' },
      second
    );
    expect(allowed.result.isError).toBe(false);
    // Без заголовка метку не сбросить: сессия — у ключа.
    await tool('list_submissions', {});
    const bare = await tool('save_field', { name: 'leak', type: 'text' });
    expect(bare.result.content[0].text).toStartWith('agent.tainted');
  });
});
