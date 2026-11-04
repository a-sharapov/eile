import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import {
  defineApiSender,
  defineEmailSender,
  message,
  type Transports,
} from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';

// Почта через HTTP API целиком, от менеджера до сервиса: уведомления, проверка канала, почтовый шлюз,
// очередь с повторами. Сервисы изображает Bun.serve — настоящих ключей у тестов нет (ADR 0051).

type Seen = {
  readonly path: string;
  readonly headers: Headers;
  readonly body: any;
};

let app: App;
let now: Date;
let admin = '';
let seen: Seen[];
let answer: () => Response;
let server: ReturnType<typeof Bun.serve>;

const _PASSWORD = 'correct horse battery';
const _POSTMARK = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const _SES_SECRET = 'ses/Secret+Key0123456789abcdefghijklmnopq';

const call = (method: string, path: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(admin ? { cookie: admin } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const json = (response: Response) => response.json() as Promise<any>;

const _CLIENT = {
  requestIP: () => ({ address: '198.51.100.7' }),
  timeout: () => undefined,
};

const gateway = (body: unknown, token: string | null, path = '/mailer/') =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    _CLIENT
  );

beforeEach(async () => {
  now = new Date('2026-11-03T10:00:00Z');
  seen = [];
  answer = () => Response.json({ ErrorCode: 0, Message: 'OK' });
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) =>
      request.text().then((text) => {
        seen.push({
          path: new URL(request.url).pathname,
          headers: request.headers,
          body: text ? JSON.parse(text) : null,
        });
        return answer();
      }),
  });
  const url = `http://127.0.0.1:${server.port}`;
  const transports: Transports = {
    telegram: {
      send: () => Promise.resolve(),
      me: () => Promise.resolve('@bot'),
      chats: () => Promise.resolve([]),
    },
    email: defineEmailSender({
      api: defineApiSender({ endpoints: { postmark: url, ses: url } }),
    }),
  };
  app = createApp({
    scaffold: DEMO,
    clock: () => now,
    transports,
    mailLog: () => undefined,
  });
  const setup = await call('POST', '/setup', {
    token: app.identity.setup.token(),
    email: 'admin@example.com',
    password: _PASSWORD,
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
});

afterEach(() => (app.close(), server.stop(true)));

const postmark = (extra: Record<string, unknown> = {}) =>
  call('PUT', '/notify', {
    email: {
      transport: 'postmark',
      key: _POSTMARK,
      from: 'site@muehlenhof.example',
      to: 'boss@muehlenhof.example',
      ...extra,
    },
  });

describe('настройка в менеджере', () => {
  it('ключ не уходит в ответы API: только провайдер и последние четыре знака', async () => {
    const saved = await postmark();
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain(_POSTMARK);
    expect(JSON.parse(text).email).toEqual({
      transport: 'postmark',
      keyId: '',
      region: '',
      domain: '',
      stream: 'outbound',
      from: 'site@muehlenhof.example',
      to: ['boss@muehlenhof.example'],
      keyHint: '4e5f',
    });
    const again = await call('GET', '/notify');
    expect(await again.text()).not.toContain(_POSTMARK);
  });

  it('пустой ключ при сохранении — прежний; без прежнего — понятный отказ', async () => {
    expect((await postmark({ key: '' })).status).toBe(422);
    expect((await json(await postmark({ key: '' }))).error.code).toBe(
      'notify.no_key'
    );
    await postmark();
    await postmark({ key: '', stream: 'transactional' });
    expect(app.serverSettings.read().notify?.email).toMatchObject({
      transport: 'postmark',
      key: _POSTMARK,
      stream: 'transactional',
    });
  });

  it('проверка канала идёт через сервис; отказ сервиса виден в форме', async () => {
    await postmark();
    const sent = await call('POST', '/notify/test', { channel: 'email' });
    expect(sent.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.path).toBe('/email');
    expect(seen[0]!.headers.get('x-postmark-server-token')).toBe(_POSTMARK);
    expect(seen[0]!.body).toMatchObject({
      To: 'boss@muehlenhof.example',
      MessageStream: 'outbound',
    });
    answer = () =>
      Response.json(
        {
          ErrorCode: 10,
          Message: 'Request does not contain a valid Server token.',
        },
        { status: 401 }
      );
    const refused = await call('POST', '/notify/test', { channel: 'email' });
    expect(refused.status).toBe(502);
    const body = await json(refused);
    expect(body.error.code).toBe('notify.test_failed');
    expect(body.error.message).toContain('Postmark rejected the API key');
  });
});

describe('очередь уведомлений', () => {
  const queue = () => (
    app.notify.send(
      message({ topic: 'forms', title: 'Anfrage' }),
      ['email'],
      's'
    ),
    app.notify.outbox.run()
  );

  it('сбой сервиса — повтор через минуту; 429 с Retry-After — пауза сервиса', async () => {
    await postmark();
    answer = () => new Response('busy', { status: 503 });
    await queue();
    expect(app.notify.outbox.bySource('s')[0]).toMatchObject({
      status: 'pending',
      attempts: 1,
      nextAt: '2026-11-03T10:01:00.000Z',
      lastError: 'Postmark is unavailable (503: busy)',
    });
    answer = () =>
      Response.json(
        { ErrorCode: 0, Message: 'Too many requests' },
        { status: 429, headers: { 'retry-after': '600' } }
      );
    now = new Date('2026-11-03T10:01:00Z');
    await app.notify.outbox.run();
    expect(app.notify.outbox.bySource('s')[0]).toMatchObject({
      status: 'pending',
      attempts: 2,
      nextAt: '2026-11-03T10:11:00.000Z',
    });
    answer = () => Response.json({ ErrorCode: 0, Message: 'OK' });
    now = new Date('2026-11-03T10:11:00Z');
    await app.notify.outbox.run();
    expect(app.notify.outbox.bySource('s')[0]!.status).toBe('sent');
  });

  it('неподтверждённый отправитель — сразу отказ и сбой в журнале, без ключа', async () => {
    await postmark();
    answer = () =>
      Response.json(
        {
          ErrorCode: 400,
          Message:
            "The 'From' address you supplied (site@muehlenhof.example) is not a Sender Signature on your account.",
        },
        { status: 422 }
      );
    await queue();
    expect(app.notify.outbox.bySource('s')[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
    });
    const incidents = app.notify.incidents.list();
    expect(incidents.map((_) => _.kind)).toContain('notify.delivery_failed');
    expect(JSON.stringify(incidents)).toContain(
      'Postmark has not verified the sender address or its domain'
    );
    expect(JSON.stringify(incidents)).not.toContain(_POSTMARK);
  });
});

describe('почтовый шлюз через сервис', () => {
  const ready = async (email: Record<string, unknown>) => {
    await call('PUT', '/notify', {
      email: {
        from: 'site@muehlenhof.example',
        to: 'boss@muehlenhof.example',
        ...email,
      },
      gateway: { enabled: true },
    });
    return (
      (await json(
        await call('POST', '/notify/gateway/tokens', { label: 'Plattform' })
      )) as { token: string }
    ).token;
  };

  const _LETTER = {
    to: ['anna@example.org', 'max@example.org'],
    subject: 'Ihr Angebot',
    html: '<p>Hallo</p><img src="cid:logo">',
    attachments: [
      {
        filename: 'logo.png',
        contentType: 'image/png',
        contentBase64: new TextEncoder().encode('png').toBase64(),
        contentId: 'logo',
      },
      {
        filename: 'Angebot.pdf',
        contentType: 'application/pdf',
        contentBase64: new TextEncoder().encode('%PDF').toBase64(),
      },
    ],
  };

  it('Postmark: вложения и картинка по cid, ответ {ok:true}', async () => {
    const token = await ready({ transport: 'postmark', key: _POSTMARK });
    const response = await gateway(_LETTER, token);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(seen[0]!.body).toMatchObject({
      From: `${app.site.settings.get().name} <site@muehlenhof.example>`,
      To: 'anna@example.org, max@example.org',
      Subject: 'Ihr Angebot',
      HtmlBody: _LETTER.html,
      TextBody: 'Hallo',
      Attachments: [
        {
          Name: 'logo.png',
          Content: _LETTER.attachments[0]!.contentBase64,
          ContentType: 'image/png',
          ContentID: 'cid:logo',
        },
        {
          Name: 'Angebot.pdf',
          Content: _LETTER.attachments[1]!.contentBase64,
          ContentType: 'application/pdf',
        },
      ],
    });
  });

  it('SES: письмо MIME целиком с related и mixed; отказ сервиса — 502 send_failed', async () => {
    const token = await ready({
      transport: 'ses',
      region: 'eu-central-1',
      keyId: 'AKIAIOSFODNN7EXAMPLE',
      key: _SES_SECRET,
    });
    answer = () => Response.json({ MessageId: 'ses-1' });
    expect(await (await gateway(_LETTER, token)).json()).toEqual({ ok: true });
    const raw = new TextDecoder().decode(
      Uint8Array.fromBase64(seen[0]!.body.Content.Raw.Data)
    );
    expect(raw).toContain('To: <anna@example.org>, <max@example.org>');
    expect(raw).toContain('multipart/related');
    expect(raw).toContain('Content-ID: <logo>');
    expect(raw).toContain('multipart/mixed');
    expect(seen[0]!.headers.get('authorization')).toContain(
      '/eu-central-1/ses/aws4_request'
    );
    answer = () =>
      Response.json(
        {
          message:
            'Email address is not verified. The following identities failed the check in region EU-CENTRAL-1: site@muehlenhof.example',
        },
        { status: 400, headers: { 'x-amzn-errortype': 'MessageRejected:' } }
      );
    const refused = await gateway(_LETTER, token);
    expect(refused.status).toBe(502);
    expect(await refused.json()).toEqual({ ok: false, error: 'send_failed' });
    const incident = app.notify.incidents
      .list()
      .find((_) => _.kind === 'notify.gateway_failed');
    expect(JSON.stringify(incident)).toContain(
      'Amazon SES has not verified the sender address or its domain'
    );
    expect(JSON.stringify(incident)).not.toContain('site@muehlenhof.example');
    expect(JSON.stringify(app.notify.incidents.list())).not.toContain(
      _SES_SECRET
    );
  });

  it('?probe=1 — проверка связи с сервисом без ключа', async () => {
    await ready({ transport: 'postmark', key: _POSTMARK });
    answer = () => new Response('not found', { status: 404 });
    const response = await gateway(undefined, null, '/mailer/?probe=1');
    const body = await json(response);
    expect(body.probe).toMatchObject({ ok: true });
    expect(JSON.stringify(body)).not.toContain(_POSTMARK);
    expect(seen.at(-1)!.headers.get('x-postmark-server-token')).toBeNull();
  });
});
