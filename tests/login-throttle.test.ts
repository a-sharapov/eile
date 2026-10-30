import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Аудит: параллельные попытки обходили блокировку, а чужой адрес запирал администратора навсегда.

let app: App;
let admin: string;

const _PASSWORD = 'correct horse battery';

const from = (address: string) => ({ requestIP: () => ({ address }) });

const login = (email: string, password: string, address = '10.0.0.1') =>
  app
    .fetch(
      new Request('http://localhost/manager/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
      from(address)
    )
    .then((_) => _.status);

const call = (method: string, path: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: { cookie: admin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  const setup = await app.fetch(
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
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
});

afterEach(() => app.close());

const count = (statuses: number[], status: number) =>
  statuses.filter((_) => _ === status).length;

describe('неудачные входы', () => {
  it('параллельные попытки не проскакивают блокировку', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        login('admin@example.com', i === 30 ? _PASSWORD : `wrong-${i}`)
      )
    );
    expect(count(statuses, 401)).toBeLessThanOrEqual(5);
    expect(count(statuses, 200)).toBe(0);
    expect(await login('admin@example.com', _PASSWORD)).toBe(429);
  });

  it('чужой адрес не запирает владельца', async () => {
    const attacker = await Promise.all(
      Array.from({ length: 6 }, () =>
        login('admin@example.com', 'wrong-password', '203.0.113.9')
      )
    );
    expect(attacker.at(-1)).toBe(429);
    expect(await login('admin@example.com', _PASSWORD, '198.51.100.7')).toBe(
      200
    );
  });

  // 50 проверок argon2 — секунды процессора. Пачками по 10 (меньше потолка одновременных проверок) они идут
  // на разных ядрах; запас по времени — для медленного CI: тест, брошенный по таймауту, продолжал бы
  // стучаться в приложение следующего теста.
  it('перебор с многих адресов упирается в общий потолок на почту', async () => {
    const statuses: number[] = [];
    for (const batch of [0, 1, 2, 3, 4]) {
      statuses.push(
        ...(await Promise.all(
          Array.from({ length: 10 }, (_, k) =>
            login('admin@example.com', 'wrong-password', `10.1.${batch}.${k}`)
          )
        ))
      );
    }
    expect(count(statuses, 401)).toBe(50);
    expect(await login('admin@example.com', _PASSWORD, '10.2.0.1')).toBe(429);
  }, 30_000);

  it('пароль длиннее 1024 знаков не хешируется и не входит', async () => {
    expect(await login('admin@example.com', 'x'.repeat(5000))).toBe(401);
  });

  it('не больше 16 проверок пароля одновременно', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        login(`user${i}@example.com`, 'wrong-password', `10.3.0.${i}`)
      )
    );
    expect(count(statuses, 429)).toBeGreaterThan(0);
    expect(count(statuses, 401)).toBeGreaterThanOrEqual(16);
  });
});

describe('пароли и первичная настройка', () => {
  it('пароль — только строка: объект с длиной не проходит', async () => {
    const created = await call('POST', '/users', {
      email: 'e@example.com',
      name: 'E',
      role: 'editor',
      password: _PASSWORD,
    });
    const { id } = (await created.json()) as { id: number };
    const response = await call('PATCH', `/users/${id}`, {
      password: { length: 12 },
    });
    expect(response.status).toBe(422);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code
    ).toBe('identity.weak_password');
  });

  it('два одновременных запроса с одним токеном создают одного администратора', async () => {
    const fresh = createApp({ scaffold: DEMO });
    const token = fresh.identity.setup.token();
    const setup = (email: string) =>
      fresh
        .fetch(
          new Request('http://localhost/manager/api/setup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token, email, password: _PASSWORD }),
          })
        )
        .then((_) => _.status);
    const statuses = await Promise.all([
      setup('one@example.com'),
      setup('two@example.com'),
    ]);
    expect(statuses.toSorted()).toEqual([200, 403]);
    fresh.close();
  });
});
