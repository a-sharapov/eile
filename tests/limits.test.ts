import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Аудит: анонимные тела до 2 ГБ разгоняли память сервера. Потолок — у каждого маршрута, после проверки прав.

let app: App;
let admin: string;

const _PASSWORD = 'correct horse battery';

const api = (path: string, init: RequestInit & { duplex?: 'half' }) =>
  app.fetch(new Request(`http://localhost/manager/api${path}`, init));

const _MB = 1024 * 1024;

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  const setup = await api('/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: app.identity.setup.token(),
      email: 'admin@example.com',
      password: _PASSWORD,
    }),
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
});

afterEach(() => app.close());

describe('потолок тела запроса', () => {
  it('вход без сеанса не принимает больше 64 КБ', async () => {
    const response = await api('/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a'.repeat(_MB), password: 'x' }),
    });
    expect(response.status).toBe(413);
    expect(((await response.json()) as any).error.code).toBe(
      'manager.too_large'
    );
  });

  it('тело без Content-Length считается по ходу чтения', async () => {
    const chunk = new Uint8Array(32 * 1024).fill(97);
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        Array.from({ length: 4 }).forEach(() => void controller.enqueue(chunk));
        controller.close();
      },
    });
    const response = await api('/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    });
    expect(response.status).toBe(413);
  });

  it('JSON вошедшего — до 2 МБ', async () => {
    const big = await api('/pages', {
      method: 'POST',
      headers: { cookie: admin, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Большая',
        template: 'Base',
        content: 'x'.repeat(3 * _MB),
      }),
    });
    expect(big.status).toBe(413);
    const fine = await api('/pages', {
      method: 'POST',
      headers: { cookie: admin, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Обычная',
        template: 'Base',
        content: 'x'.repeat(_MB),
      }),
    });
    expect(fine.status).toBe(201);
  });

  it('загрузка в медиатеку без формы — 400, а не 500', async () => {
    const response = await api('/media', {
      method: 'POST',
      headers: { cookie: admin, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as any).error.code).toBe(
      'manager.invalid_form'
    );
  });

  it('без прав тело не читается: сначала 401', async () => {
    const response = await api('/pages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(8 * _MB),
    });
    expect(response.status).toBe(401);
  });
});
