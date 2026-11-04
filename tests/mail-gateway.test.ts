import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, type AppOptions, createApp } from '../src/app.ts';
import type {
  Mail,
  SmtpProbe,
  Transports,
} from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';

// Почтовый шлюз: замена PHP-релея — тот же контракт POST/GET, токены из менеджера, предел, отправитель.

let app: App;
let now: Date;
let admin = '';
let mails: Mail[];
let lines: string[];
let mailFails: Error | null;
let probe: SmtpProbe;
let timeouts: number[];

const _PASSWORD = 'correct horse battery';
const _SMTP_PASSWORD = 'smtp-secret-123';

const transports: Transports = {
  telegram: {
    send: () => Promise.resolve(),
    me: () => Promise.resolve('@bot'),
    chats: () => Promise.resolve([]),
  },
  email: {
    send: () => Promise.resolve(),
    mail: (_settings, mail) =>
      mailFails
        ? Promise.reject(mailFails)
        : (mails.push(mail), Promise.resolve()),
    probe: () => Promise.resolve(probe),
  },
};

const start = async (options: Partial<AppOptions> = {}) => {
  app = createApp({
    scaffold: DEMO,
    clock: () => now,
    transports,
    mailLog: (line) => void lines.push(line),
    ...options,
  });
  const setup = await call('POST', '/setup', {
    token: app.identity.setup.token(),
    email: 'admin@example.com',
    password: _PASSWORD,
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
};

beforeEach(async () => {
  now = new Date('2026-11-03T10:00:00Z');
  admin = '';
  mails = [];
  lines = [];
  mailFails = null;
  probe = { ok: true, latencyMs: 12 };
  timeouts = [];
  await start();
});

afterEach(() => app.close());

const call = (method: string, path: string, body?: unknown, cookie = admin) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const json = (response: Response) => response.json() as Promise<any>;

const configureEmail = () =>
  app.notify.settings.save({
    email: {
      host: 'smtp.example.com',
      user: 'site@example.com',
      password: _SMTP_PASSWORD,
      from: 'site@example.com',
      to: 'boss@example.com',
    },
  });

/** Почта, включённый шлюз и токен — как после настройки в менеджере. */
const ready = async (gateway: Record<string, unknown> = {}) => {
  configureEmail();
  await call('PUT', '/notify', { gateway: { enabled: true, ...gateway } });
  return (await json(
    await call('POST', '/notify/gateway/tokens', { label: 'Plattform' })
  )) as { id: string; token: string; hint: string };
};

const client = (address: string) => ({
  requestIP: () => ({ address }),
  timeout: (_request: Request, seconds: number) => void timeouts.push(seconds),
});

const gateway = (
  body: unknown,
  {
    token,
    path = '/mailer/',
    method = 'POST',
    from = '198.51.100.7',
    headers = {},
  }: {
    token?: string;
    path?: string;
    method?: string;
    from?: string;
    headers?: Record<string, string>;
  } = {}
) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body:
        method === 'GET' || method === 'HEAD'
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    }),
    client(from)
  );

const _LETTER = {
  to: 'kunde@example.org',
  subject: 'Ihr Termin',
  html: '<p>Hallo</p>',
  text: 'Hallo',
};

describe('отправка', () => {
  it('Bearer и JSON — 200 {ok:true}, письмо уходит через почту сайта', async () => {
    const { token } = await ready();
    const response = await gateway(_LETTER, { token });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ ok: true });
    expect(mails).toEqual([
      {
        from: {
          address: 'site@example.com',
          name: app.site.settings.get().name,
        },
        to: ['kunde@example.org'],
        subject: 'Ihr Termin',
        html: '<p>Hallo</p>',
        text: 'Hallo',
        attachments: [],
      },
    ]);
  });

  it('адрес и без косой черты: POST /mailer не уходит в переадресацию', async () => {
    const { token } = await ready();
    const response = await gateway(_LETTER, { token, path: '/mailer' });
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('срок ответа запросу продлевается: SMTP бывает дольше 10 секунд', async () => {
    const { token } = await ready();
    await gateway(_LETTER, { token });
    expect(timeouts).toEqual([120]);
  });

  it('адресаты списком и объектами, имя отправителя — от клиента', async () => {
    const { token } = await ready();
    await gateway(
      {
        ..._LETTER,
        to: [{ address: 'a@example.org', name: 'A' }, 'b@example.org'],
        from: { name: 'Muehlenhof', address: '' },
      },
      { token }
    );
    expect(mails[0]).toMatchObject({
      from: { address: 'site@example.com', name: 'Muehlenhof' },
      to: ['a@example.org', 'b@example.org'],
    });
  });

  it('чужой отправитель заменяется почтой сайта; разрешённый — остаётся', async () => {
    const { token } = await ready({ senders: 'info@example.com' });
    await gateway(
      { ..._LETTER, from: { name: 'Bank', address: 'ceo@bank.example' } },
      { token }
    );
    await gateway(
      { ..._LETTER, from: { name: 'Info', address: 'info@example.com' } },
      { token }
    );
    expect(mails.map((_) => _.from)).toEqual([
      { address: 'site@example.com', name: 'Bank' },
      { address: 'info@example.com', name: 'Info' },
    ]);
  });

  it('вложения: встроенная картинка по cid и файл; негодные отброшены', async () => {
    const { token } = await ready();
    await gateway(
      {
        ..._LETTER,
        html: '<img src="cid:logo">',
        attachments: [
          {
            filename: 'logo.png',
            contentType: 'image/png',
            contentBase64: new TextEncoder().encode('png').toBase64(),
            contentId: 'logo',
            inline: true,
          },
          { filename: 'a.txt', contentType: 'text/plain', content: 'x' },
          { filename: 'broken', contentBase64: '%%%' },
        ],
      },
      { token }
    );
    expect(
      mails[0]!.attachments.map((_) => [_.filename, _.contentId, _.inline])
    ).toEqual([
      ['logo.png', 'logo', true],
      ['a.txt', '', false],
    ]);
  });

  it.each([
    ['{oops', 'invalid_json'],
    ['[1,2]', 'invalid_json'],
    [JSON.stringify({ subject: 'x', text: 'y' }), 'to_required'],
    [JSON.stringify({ to: 'a@example.org', text: 'y' }), 'subject_required'],
    [JSON.stringify({ to: 'a@example.org', subject: 'x' }), 'body_required'],
  ])('%p — 400 %p', async (body, error) => {
    const { token } = await ready();
    const response = await gateway(body, { token });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error });
    expect(mails).toEqual([]);
  });

  it('домены получателей заданы — письмо на чужой домен: 403 recipient_not_allowed', async () => {
    const { token } = await ready({ domains: 'example.org' });
    expect((await gateway(_LETTER, { token })).status).toBe(200);
    const response = await gateway(
      { ..._LETTER, to: 'x@elsewhere.test' },
      { token }
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'recipient_not_allowed',
    });
  });

  it('тело больше потолка — 413 too_large, письма нет', async () => {
    const { token } = await ready();
    const response = await gateway(_LETTER, {
      token,
      headers: { 'content-length': String(41 * 1024 * 1024) },
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: 'too_large' });
  });

  it('почтовый сервер отказал — 502 send_failed без подробностей; сбой — в журнал без адреса', async () => {
    const { token } = await ready();
    mailFails = Object.assign(
      new Error('SMTP RCPT: 550 <kunde@example.org> mailbox unavailable'),
      { permanent: true }
    );
    const response = await gateway(_LETTER, { token });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"ok":false,"error":"send_failed"}');
    const incident = app.notify.incidents
      .list()
      .find((_) => _.kind === 'notify.gateway_failed')!;
    expect(incident.severity).toBe('warning');
    expect(String(incident.detail)).toContain('Plattform');
    expect(String(incident.detail)).not.toContain('kunde@example.org');
  });

  it('другие методы — 405 method_not_allowed', async () => {
    const { token } = await ready();
    const response = await gateway(_LETTER, { token, method: 'PUT' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, POST');
    expect(await response.json()).toEqual({
      ok: false,
      error: 'method_not_allowed',
    });
  });
});

describe('токены', () => {
  it('без токена и с чужим — 401 unauthorized', async () => {
    await ready();
    for (const token of [undefined, 'mail_wrong']) {
      const response = await gateway(_LETTER, { token });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        error: 'unauthorized',
      });
    }
    expect(mails).toEqual([]);
  });

  it('токен показан один раз: в настройках — только подпись и последние знаки', async () => {
    const issued = await ready();
    expect(issued.token).toStartWith('mail_');
    expect(issued.hint).toBe(issued.token.slice(-4));
    const status = await call('GET', '/notify');
    const text = await status.text();
    expect(text).not.toContain(issued.token);
    expect(text).not.toContain(
      new Bun.CryptoHasher('sha256').update(issued.token).digest('hex')
    );
    expect(JSON.parse(text).gateway.tokens).toEqual([
      {
        id: issued.id,
        label: 'Plattform',
        hint: issued.hint,
        createdAt: now.toISOString(),
        usedAt: null,
      },
    ]);
  });

  it('несколько токенов: каждый работает, время запроса — у своего', async () => {
    const first = await ready();
    const second = await json(
      await call('POST', '/notify/gateway/tokens', { label: 'CRM' })
    );
    expect((await gateway(_LETTER, { token: second.token })).status).toBe(200);
    const tokens = (await json(await call('GET', '/notify'))).gateway.tokens;
    expect(
      tokens.map((_: { label: string; usedAt: string | null }) => [
        _.label,
        _.usedAt,
      ])
    ).toEqual([
      ['Plattform', null],
      ['CRM', now.toISOString()],
    ]);
    expect((await gateway(_LETTER, { token: first.token })).status).toBe(200);
  });

  it('отозванный токен больше не работает', async () => {
    const { id, token } = await ready();
    expect((await call('DELETE', `/notify/gateway/tokens/${id}`)).status).toBe(
      200
    );
    expect((await gateway(_LETTER, { token })).status).toBe(401);
    expect((await call('DELETE', `/notify/gateway/tokens/${id}`)).status).toBe(
      404
    );
  });

  it('без подписи токен не выпускается', async () => {
    configureEmail();
    const response = await call('POST', '/notify/gateway/tokens', {
      label: ' ',
    });
    expect(response.status).toBe(422);
    expect((await json(response)).error.code).toBe('notify.token_label');
  });

  it('ключом API токен шлюза не выпустить и не отозвать — только войдя в менеджер', async () => {
    const { id } = await ready();
    const key = (await json(await call('POST', '/tokens', { name: 'agent' })))
      .token as string;
    const byKey = (method: string, path: string, body?: unknown) =>
      app.fetch(
        new Request(`http://localhost/manager/api${path}`, {
          method,
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
    expect(
      (await byKey('POST', '/notify/gateway/tokens', { label: 'x' })).status
    ).toBe(403);
    expect((await byKey('DELETE', `/notify/gateway/tokens/${id}`)).status).toBe(
      403
    );
  });

  it('выпуск токена — сведения в журнале сбоев', async () => {
    await ready();
    expect(
      app.notify.incidents
        .list()
        .some((_) => _.kind === 'notify.gateway_token_issued')
    ).toBe(true);
  });
});

describe('предел запросов', () => {
  it('15 в минуту с адреса: шестнадцатый — 429, другой адрес — свой счёт, через минуту — снова', async () => {
    const { token } = await ready();
    for (let index = 0; index < 15; index++) {
      expect((await gateway(_LETTER, { token })).status).toBe(200);
    }
    const limited = await gateway(_LETTER, { token });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(await limited.json()).toEqual({ ok: false, error: 'rate_limited' });
    expect(
      (await gateway(_LETTER, { token, from: '203.0.113.9' })).status
    ).toBe(200);
    now = new Date(now.getTime() + 61_000);
    expect((await gateway(_LETTER, { token })).status).toBe(200);
  });

  it('предел считает и запросы без токена: перебором его не обойти', async () => {
    const { token } = await ready({ rateLimit: 2 });
    expect((await gateway(_LETTER, { token: 'mail_x' })).status).toBe(401);
    expect((await gateway(_LETTER, { token: 'mail_y' })).status).toBe(401);
    expect((await gateway(_LETTER, { token })).status).toBe(429);
  });

  it('0 — без предела', async () => {
    const { token } = await ready({ rateLimit: 0 });
    for (let index = 0; index < 20; index++) {
      expect((await gateway(_LETTER, { token })).status).toBe(200);
    }
  });

  it('за своим прокси адрес клиента — из X-Forwarded-For', async () => {
    app.close();
    await start({ trustProxy: true });
    const { token } = await ready({ rateLimit: 1 });
    const behind = (forwarded: string) =>
      gateway(_LETTER, {
        token,
        from: '127.0.0.1',
        headers: { 'x-forwarded-for': forwarded },
      });
    expect((await behind('203.0.113.1')).status).toBe(200);
    expect((await behind('203.0.113.1')).status).toBe(429);
    expect((await behind('203.0.113.2')).status).toBe(200);
  });
});

describe('состояние шлюза', () => {
  it('выключен и без токенов — адрес у сайта', async () => {
    configureEmail();
    const response = await gateway(_LETTER);
    expect(response.headers.get('content-type') ?? '').not.toContain(
      'application/json'
    );
    expect(await response.text()).not.toContain('"ok"');
    // Сайт приводит адрес к канонному — без косой черты; так и было бы с POST без шлюза.
    const site = await gateway(undefined, { method: 'GET' });
    expect(site.status).toBe(301);
    expect(site.headers.get('location')).toBe('/mailer');
  });

  it('выключен, но с токенами — 503 disabled', async () => {
    const { token } = await ready();
    await call('PUT', '/notify', { gateway: { enabled: false } });
    const response = await gateway(_LETTER, { token });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: 'disabled' });
  });

  it('почта не настроена — 503 smtp_not_ready', async () => {
    const { token } = await ready();
    await call('PUT', '/notify', { email: null });
    const response = await gateway(_LETTER, { token });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'smtp_not_ready',
    });
  });

  it('GET — документ состояния без секретов: 200, когда готов', async () => {
    const { token } = await ready();
    const response = await gateway(undefined, { method: 'GET' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    expect(text).not.toContain(token);
    expect(text).not.toContain(_SMTP_PASSWORD);
    expect(text).not.toContain('smtp.example.com');
    expect(text).not.toContain('site@example.com');
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      service: 'eile-mail-gateway',
      time: now.toISOString(),
      checks: { enabled: true, token: true, sender: true, smtp: true },
      rate_limit_per_minute: 15,
      endpoints: {
        'GET /mailer/': 'status (this)',
        'GET /mailer/?probe=1': expect.any(String),
        'POST /mailer/': expect.any(String),
      },
    });
    expect(JSON.parse(text).probe).toBeUndefined();
  });

  it('GET — 503 и что не готово', async () => {
    configureEmail();
    await call('PUT', '/notify', { gateway: { enabled: true } });
    const response = await gateway(undefined, { method: 'GET' });
    expect(response.status).toBe(503);
    expect((await json(response)).checks).toEqual({
      enabled: true,
      token: false,
      sender: true,
      smtp: true,
    });
  });

  it('GET ?probe=1 — ещё и проверка почтового сервера; она в пределе запросов', async () => {
    await ready({ rateLimit: 1 });
    probe = { ok: false, latencyMs: 8000, error: 'timeout' };
    const response = await gateway(undefined, {
      method: 'GET',
      path: '/mailer/?probe=1',
    });
    expect((await json(response)).probe).toEqual({
      ok: false,
      latency_ms: 8000,
      error: 'timeout',
    });
    expect(
      (await gateway(undefined, { method: 'GET', path: '/mailer?probe=1' }))
        .status
    ).toBe(429);
    expect(
      (await gateway(undefined, { method: 'GET', path: '/mailer?probe=0' }))
        .status
    ).toBe(200);
  });
});

describe('адрес шлюза', () => {
  it('свой адрес; прежний отдаётся сайту', async () => {
    const { token } = await ready({ path: 'api/mail' });
    expect((await gateway(_LETTER, { token, path: '/api/mail' })).status).toBe(
      200
    );
    expect((await gateway(_LETTER, { token })).status).not.toBe(200);
  });

  it.each(['/manager/', '/media/', '/_cms/mail', '/robots.txt', '/'])(
    'служебный адрес %p — отказ при сохранении',
    async (path) => {
      configureEmail();
      const response = await call('PUT', '/notify', {
        gateway: { enabled: true, path },
      });
      expect(response.status).toBe(422);
      expect((await json(response)).error.code).toBe(
        'notify.invalid_gateway_path'
      );
    }
  );

  it('перекрывает опубликованную страницу и переадресацию с тем же адресом; менеджер это показывает', async () => {
    const page = app.content.pages.create({
      title: 'Mailer',
      alias: 'mailer',
      template: 'Base',
      publish: true,
    });
    app.redirects.rules.create({ from: '/mailer/old', to: '/' });
    expect(
      (await gateway(undefined, { method: 'GET', path: '/mailer' })).status
    ).toBe(200);
    const { token } = await ready({ path: '/mailer/' });
    const response = await gateway(undefined, {
      method: 'GET',
      path: '/mailer',
    });
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await gateway(_LETTER, { token, path: '/mailer' })).status).toBe(
      200
    );
    expect((await json(await call('GET', '/notify'))).gateway.shadows).toEqual({
      id: page,
      title: 'Mailer',
    });
    const moved = await ready({ path: '/mailer/old' });
    expect(
      (await gateway(_LETTER, { token: moved.token, path: '/mailer/old' }))
        .status
    ).toBe(200);
  });
});

describe('журнал и менеджер', () => {
  it('строка журнала на запрос: подпись токена, адресатов, итог — без адресов и темы', async () => {
    const { token } = await ready();
    await gateway(_LETTER, { token });
    await gateway(_LETTER, { token: 'mail_wrong' });
    expect(lines).toEqual([
      `mail-gateway ${now.toISOString()} token="Plattform" to=1 files=0 sent`,
      `mail-gateway ${now.toISOString()} token=- to=0 files=0 unauthorized`,
    ]);
    expect(lines.join('\n')).not.toContain('kunde@example.org');
    expect(lines.join('\n')).not.toContain('Ihr Termin');
    const recent = (await json(await call('GET', '/notify'))).gateway.recent;
    expect(
      recent.map((_: { outcome: string; token: string | null }) => [
        _.outcome,
        _.token,
      ])
    ).toEqual([
      ['unauthorized', null],
      ['sent', 'Plattform'],
    ]);
  });

  it('настройки шлюза сохраняются вместе с уведомлениями и видны в менеджере', async () => {
    configureEmail();
    const saved = await json(
      await call('PUT', '/notify', {
        gateway: {
          enabled: true,
          path: '/relay',
          rateLimit: '30',
          senders: 'info@example.com',
          domains: 'example.org',
        },
      })
    );
    expect(saved.gateway).toMatchObject({
      enabled: true,
      path: '/relay/',
      rateLimit: 30,
      senders: ['info@example.com'],
      domains: ['example.org'],
      tokens: [],
      checks: { enabled: true, token: false, sender: true, smtp: true },
      ready: false,
      recent: [],
      shadows: null,
    });
  });

  it('по умолчанию шлюз выключен, адрес /mailer/, предел 15', async () => {
    expect((await json(await call('GET', '/notify'))).gateway).toMatchObject({
      enabled: false,
      path: '/mailer/',
      rateLimit: 15,
      senders: [],
      domains: [],
      tokens: [],
      ready: false,
    });
  });

  it('«Отправить письмо себе» — через шлюз на адрес того, кто нажал', async () => {
    await ready();
    const response = await call('POST', '/notify/gateway/test');
    expect(await json(response)).toEqual({
      ok: true,
      to: 'admin@example.com',
    });
    expect(mails[0]).toMatchObject({
      from: { address: 'site@example.com', name: app.site.settings.get().name },
      to: ['admin@example.com'],
    });
    mailFails = new Error('SMTP AUTH: 535 Authentication failed');
    const failed = await call('POST', '/notify/gateway/test');
    expect(failed.status).toBe(502);
    expect((await json(failed)).error.code).toBe('notify.test_failed');
  });

  it('без почты проверка — 409 not_configured', async () => {
    const response = await call('POST', '/notify/gateway/test');
    expect(response.status).toBe(409);
  });
});
