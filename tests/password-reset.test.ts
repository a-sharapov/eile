import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import type { Message, Transports } from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;
let now: Date;
let letters: { to: string; message: Message }[];

const _PASSWORD = 'correct horse battery';
const _NEW = 'new staple battery horse';

const transports: Transports = {
  telegram: {
    send: () => Promise.resolve(),
    me: () => Promise.resolve('@site_bot'),
    chats: () => Promise.resolve([]),
  },
  email: {
    send: (_settings, to, item) => (
      letters.push({ to: to.join(','), message: item }), Promise.resolve()
    ),
  },
};

const from = (address: string) => ({ requestIP: () => ({ address }) });

const call = (
  method: string,
  path: string,
  body?: unknown,
  { cookie = '', client = '10.0.0.1' } = {}
) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    from(client)
  );

const json = (response: Response) => response.json() as Promise<any>;

const forgot = (email: string, client?: string) =>
  call('POST', '/password/forgot', { email }, { client });

// Сброс работает, когда настроена почта и задан адрес сайта: ссылка в письме строится от него.
const configureEmail = () => (
  app.notify.settings.save({
    email: {
      host: 'smtp.example.com',
      user: 'site@example.com',
      password: 'secret',
      from: 'site@example.com',
      to: 'boss@example.com',
    },
  }),
  app.site.settings.update({ siteUrl: 'http://localhost' })
);

const tokenOf = (letter: { message: Message }): string =>
  new URL(letter.message.link!.url).searchParams.get('token')!;

// Письмо уходит в фоне: даём микрозадачам отработать.
const settle = () => Bun.sleep(5);

let admin = '';

beforeEach(async () => {
  now = new Date('2026-10-31T10:00:00Z');
  letters = [];
  app = createApp({ scaffold: DEMO, clock: () => now, transports });
  const setup = await call('POST', '/setup', {
    token: app.identity.setup.token(),
    email: 'admin@example.com',
    password: _PASSWORD,
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
});

afterEach(() => app.close());

describe('«Забыли пароль?»', () => {
  it('без почты в уведомлениях сброса нет', async () => {
    expect((await json(await call('GET', '/session'))).passwordReset).toBe(
      false
    );
    expect((await forgot('admin@example.com')).status).toBe(409);
    expect(letters).toHaveLength(0);
  });

  it('с настроенной почтой — флаг в сеансе и письмо со ссылкой самому пользователю', async () => {
    configureEmail();
    expect((await json(await call('GET', '/session'))).passwordReset).toBe(
      true
    );
    expect((await forgot('Admin@Example.com')).status).toBe(202);
    await settle();
    expect(letters).toHaveLength(1);
    expect(letters[0]!.to).toBe('admin@example.com');
    expect(letters[0]!.message.link!.url).toStartWith(
      'http://localhost/manager/reset?token='
    );
    // Ссылки нет ни в очереди уведомлений, ни в журнале.
    expect(JSON.stringify(app.notify.outbox.recent())).not.toContain(
      tokenOf(letters[0]!)
    );
  });

  it('без адреса сайта сброса нет: ссылку не собрать из подделанного Host', async () => {
    configureEmail();
    app.site.settings.update({ siteUrl: '' });
    expect((await json(await call('GET', '/session'))).passwordReset).toBe(
      false
    );
    const response = await forgot('admin@example.com');
    expect((await json(response)).error.code).toBe('manager.reset_unavailable');
    app.site.settings.update({ siteUrl: 'https://site.example' });
    await app.fetch(
      new Request('http://attacker.example/manager/api/password/forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com' }),
      }),
      from('10.0.0.9')
    );
    await settle();
    expect(letters.at(-1)!.message.link!.url).toStartWith(
      'https://site.example/manager/reset?token='
    );
  });

  it('адрес сайта из настроек — в ссылке письма', async () => {
    configureEmail();
    app.site.settings.update({ siteUrl: 'https://site.example' });
    await forgot('admin@example.com');
    await settle();
    expect(letters[0]!.message.link!.url).toStartWith(
      'https://site.example/manager/reset?token='
    );
  });

  it('письмо — на языке страницы, с которой попросили сброс', async () => {
    configureEmail();
    const ask = (language: string) =>
      app.fetch(
        new Request('http://localhost/manager/api/password/forgot', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'accept-language': language,
          },
          body: JSON.stringify({ email: 'admin@example.com' }),
        }),
        from(`10.0.0.${language.length}`)
      );
    await ask('de');
    await settle();
    expect(letters.at(-1)!.message.title).toBe(
      'Neues Passwort für den Website-Manager'
    );
    await ask('ru-RU,ru;q=0.9');
    await settle();
    expect(letters.at(-1)!.message.link!.label).toBe('Задать новый пароль');
  });

  it('ответ одинаковый, есть такая почта или нет', async () => {
    configureEmail();
    const known = await forgot('admin@example.com');
    const unknown = await forgot('nobody@example.com', '10.0.0.2');
    expect([known.status, await known.text()]).toEqual([
      unknown.status,
      await unknown.text(),
    ]);
    await settle();
    expect(letters).toHaveLength(1);
  });

  it('запросы ограничены на почту и на адрес посетителя', async () => {
    configureEmail();
    const pair = await Promise.all(
      Array.from({ length: 5 }, () => forgot('admin@example.com'))
    );
    expect(pair.map((_) => _.status)).toEqual([202, 202, 202, 429, 429]);
    // С одного адреса — не больше 20 запросов на любые почты.
    const spray = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        forgot(`user${i}@example.com`, '10.0.0.9')
      )
    );
    expect(spray.filter((_) => _.status === 429)).toHaveLength(5);
    // Через 15 минут — снова можно.
    now = new Date(now.getTime() + 16 * 60_000);
    expect((await forgot('admin@example.com')).status).toBe(202);
  });

  it('ссылка задаёт новый пароль один раз и закрывает все сеансы', async () => {
    configureEmail();
    await forgot('admin@example.com');
    await settle();
    const token = tokenOf(letters[0]!);
    expect(
      await json(await call('POST', '/password/check', { token }))
    ).toEqual({ valid: true });
    // Короткий пароль ссылку не тратит.
    expect(
      (await call('POST', '/password/reset', { token, password: 'short' }))
        .status
    ).toBe(422);
    const done = await call('POST', '/password/reset', {
      token,
      password: _NEW,
    });
    expect([done.status, await json(done)]).toEqual([
      200,
      { email: 'admin@example.com' },
    ]);
    expect(
      (await json(await call('GET', '/session', undefined, { cookie: admin })))
        .user
    ).toBeNull();
    expect(
      (
        await call('POST', '/session', {
          email: 'admin@example.com',
          password: _NEW,
        })
      ).status
    ).toBe(200);
    // Второй раз та же ссылка не работает.
    expect(
      (await call('POST', '/password/reset', { token, password: _NEW })).status
    ).toBe(410);
    expect(
      await json(await call('POST', '/password/check', { token }))
    ).toEqual({ valid: false });
    expect(app.notify.incidents.list().map((_) => _.kind)).toContain(
      'identity.password_reset'
    );
  });

  it('ссылка живёт 30 минут', async () => {
    configureEmail();
    await forgot('admin@example.com');
    await settle();
    now = new Date(now.getTime() + 31 * 60_000);
    expect(
      (
        await call('POST', '/password/reset', {
          token: tokenOf(letters[0]!),
          password: _NEW,
        })
      ).status
    ).toBe(410);
  });

  it('новая ссылка отменяет прежнюю', async () => {
    configureEmail();
    await forgot('admin@example.com');
    await forgot('admin@example.com');
    await settle();
    const { 0: first, 1: second } = letters.map(tokenOf);
    expect(
      (await call('POST', '/password/reset', { token: first, password: _NEW }))
        .status
    ).toBe(410);
    expect(
      (await call('POST', '/password/reset', { token: second, password: _NEW }))
        .status
    ).toBe(200);
  });

  it('ссылка сброса — не содержимое сайта: в копию не попадает', async () => {
    configureEmail();
    await forgot('admin@example.com');
    expect(Object.keys(app.archive().tables)).not.toContain(
      'identity_password_resets'
    );
  });
});
