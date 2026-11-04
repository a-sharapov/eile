import { afterEach, describe, expect, it } from 'bun:test';
import { failureOf } from '../domain/delivery.ts';
import type { Mail, MailAttachment } from '../domain/gateway.ts';
import { message } from '../domain/message.ts';
import type { MailProvider } from '../domain/providers.ts';
import type { ApiEmailSettings } from '../domain/settings.ts';
import { defineApiSender } from './mail-api.ts';
import { PROVIDERS } from './mail-providers.ts';
import { mailMime, mimeMessage } from './mime.ts';
import { signV4 } from './sigv4.ts';

// Настоящих ключей у тестов нет: каждый сервис изображает Bun.serve, запросы — по документации сервисов.

type Seen = {
  readonly method: string;
  readonly path: string;
  readonly headers: Headers;
  readonly body: Uint8Array;
};

type Fake = {
  readonly url: string;
  readonly seen: Seen[];
  readonly stop: () => void;
};

let fakes: Fake[] = [];

afterEach(() => {
  fakes.forEach((_) => void _.stop());
  fakes = [];
});

const fake = (
  answer: (seen: Seen) => Response | Promise<Response> = () =>
    Response.json({ id: 'accepted' })
): Fake => {
  const seen: Seen[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) =>
      request.bytes().then((body) => {
        const entry = {
          method: request.method,
          path: new URL(request.url).pathname,
          headers: request.headers,
          body,
        };
        seen.push(entry);
        return answer(entry);
      }),
  });
  const created = {
    url: `http://127.0.0.1:${server.port}`,
    seen,
    stop: () => void server.stop(true),
  };
  fakes = [...fakes, created];
  return created;
};

const _DATE = new Date('2026-11-03T10:00:00Z');
const _ADDRESSES = {
  from: 'site@muehlenhof.example',
  to: ['boss@muehlenhof.example'],
};
const _NONE = { keyId: '', region: '', domain: '', stream: '' };

const _SETTINGS: Readonly<Record<MailProvider, ApiEmailSettings>> = {
  brevo: {
    ..._ADDRESSES,
    ..._NONE,
    transport: 'brevo',
    key: 'xkeysib-0123456789abcdef0123456789abcdef-AbCdEfGh12345678',
  },
  postmark: {
    ..._ADDRESSES,
    ..._NONE,
    transport: 'postmark',
    key: '00000000-1111-2222-3333-444444444444',
    stream: 'outbound',
  },
  mailgun: {
    ..._ADDRESSES,
    ..._NONE,
    transport: 'mailgun',
    key: 'mailgun-test-key-not-a-real-one',
    region: 'eu',
    domain: 'mg.muehlenhof.example',
  },
  resend: {
    ..._ADDRESSES,
    ..._NONE,
    transport: 'resend',
    key: 're_0123456789abcdefghijklmnopqr',
  },
  ses: {
    ..._ADDRESSES,
    ..._NONE,
    transport: 'ses',
    key: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    keyId: 'AKIAIOSFODNN7EXAMPLE',
    region: 'eu-central-1',
  },
};

const _LOGO: MailAttachment = {
  filename: 'logo.png',
  contentType: 'image/png',
  content: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
  contentId: 'logo@k',
  inline: true,
};

const _PDF: MailAttachment = {
  filename: 'Angebot.pdf',
  contentType: 'application/pdf',
  content: new TextEncoder().encode('%PDF-1.7 Angebot'),
  contentId: '',
  inline: false,
};

const _MAIL: Mail = {
  from: { address: 'site@muehlenhof.example', name: 'Mühlenhof Studio' },
  to: ['anna@example.com', 'max@example.com'],
  subject: 'Ihr Angebot',
  html: '<p>Hallo Anna</p><img src="cid:logo@k">',
  text: '',
  attachments: [_LOGO, _PDF],
};

const _ITEM = message({
  topic: 'forms',
  title: 'Neue Anfrage',
  fields: [{ label: 'Name', value: 'Anna' }],
  replyTo: 'anna@example.com',
});

const sender = (provider: MailProvider, url: string, timeoutMs?: number) =>
  defineApiSender({
    endpoints: { [provider]: url },
    clock: () => _DATE,
    id: () => 'm1',
    ...(timeoutMs ? { timeoutMs } : {}),
  });

const json = (seen: Seen): any =>
  JSON.parse(new TextDecoder().decode(seen.body));

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error) => failureOf(error)
  );

describe('Brevo', () => {
  it('письмо — JSON с ключом в api-key; картинки по cid — обычными вложениями', async () => {
    const brevo = fake(() =>
      Response.json({ messageId: '<1@brevo>' }, { status: 201 })
    );
    await sender('brevo', brevo.url).mail(_SETTINGS.brevo, _MAIL);
    const { 0: seen } = brevo.seen;
    expect(seen!.method).toBe('POST');
    expect(seen!.path).toBe('/v3/smtp/email');
    expect(seen!.headers.get('api-key')).toBe(_SETTINGS.brevo.key);
    expect(seen!.headers.get('content-type')).toBe('application/json');
    expect(json(seen!)).toEqual({
      sender: { name: 'Mühlenhof Studio', email: 'site@muehlenhof.example' },
      to: [{ email: 'anna@example.com' }, { email: 'max@example.com' }],
      subject: 'Ihr Angebot',
      htmlContent: _MAIL.html,
      textContent: 'Hallo Anna',
      attachment: [
        { name: 'logo.png', content: _LOGO.content.toBase64() },
        { name: 'Angebot.pdf', content: _PDF.content.toBase64() },
      ],
    });
  });

  it('уведомление — имя сайта в отправителе, ответ — посетителю', async () => {
    const brevo = fake(() => Response.json({}, { status: 201 }));
    await sender('brevo', brevo.url).send(
      _SETTINGS.brevo,
      ['boss@muehlenhof.example'],
      _ITEM,
      'Mühlenhof'
    );
    const body = json(brevo.seen[0]!);
    expect(body.sender).toEqual({
      name: 'Mühlenhof',
      email: 'site@muehlenhof.example',
    });
    expect(body.replyTo).toEqual({ email: 'anna@example.com' });
    expect(body.subject).toBe('Neue Anfrage — Mühlenhof');
    expect(body.textContent).toContain('Name: Anna');
    expect(body.htmlContent).toContain(
      '<td style="white-space:pre-wrap">Anna</td>'
    );
    expect(body.attachment).toBeUndefined();
  });

  it.each([
    [
      401,
      { code: 'unauthorized', message: 'Key not found' },
      'Brevo rejected the API key (401 unauthorized: Key not found)',
    ],
    [
      401,
      {
        code: 'unauthorized',
        message:
          'We have detected you are using an unrecognised IP address 203.0.113.10',
      },
      "Brevo does not accept requests from this server's IP address",
    ],
    [
      400,
      { code: 'invalid_parameter', message: 'Sender is invalid / inactive' },
      'Brevo has not verified the sender',
    ],
    [
      402,
      { code: 'not_enough_credits', message: 'Not enough credits' },
      'The Brevo account cannot send now',
    ],
  ])('%p %p — насовсем: «%s»', async (status, body, text) => {
    const brevo = fake(() => Response.json(body, { status }));
    const got = await failure(
      sender('brevo', brevo.url).mail(_SETTINGS.brevo, _MAIL)
    );
    expect(got).toMatchObject({ permanent: true, retryAfter: null });
    expect(got!.message).toContain(text);
  });

  it('429 — на время, пауза из x-sib-ratelimit-reset', async () => {
    const brevo = fake(() =>
      Response.json(
        { code: 'too_many_requests', message: 'Too many requests' },
        { status: 429, headers: { 'x-sib-ratelimit-reset': '12' } }
      )
    );
    const got = await failure(
      sender('brevo', brevo.url).mail(_SETTINGS.brevo, _MAIL)
    );
    expect(got).toEqual({
      permanent: false,
      retryAfter: 12_000,
      message:
        'Brevo asks to send slower (429 too_many_requests: Too many requests), retry in 12 s',
    });
  });
});

describe('Postmark', () => {
  it('токен сервера, поток, вложения; картинка — с ContentID cid:…', async () => {
    const postmark = fake(() => Response.json({ ErrorCode: 0, Message: 'OK' }));
    await sender('postmark', postmark.url).mail(
      { ..._SETTINGS.postmark, stream: 'transactional' },
      {
        ..._MAIL,
        from: { address: 'site@muehlenhof.example', name: 'Mühlenhof, Studio' },
      }
    );
    const { 0: seen } = postmark.seen;
    expect(seen!.path).toBe('/email');
    expect(seen!.headers.get('x-postmark-server-token')).toBe(
      _SETTINGS.postmark.key
    );
    expect(seen!.headers.get('accept')).toBe('application/json');
    expect(json(seen!)).toEqual({
      From: '"Mühlenhof, Studio" <site@muehlenhof.example>',
      To: 'anna@example.com, max@example.com',
      Subject: 'Ihr Angebot',
      HtmlBody: _MAIL.html,
      TextBody: 'Hallo Anna',
      MessageStream: 'transactional',
      Attachments: [
        {
          Name: 'logo.png',
          Content: _LOGO.content.toBase64(),
          ContentType: 'image/png',
          ContentID: 'cid:logo@k',
        },
        {
          Name: 'Angebot.pdf',
          Content: _PDF.content.toBase64(),
          ContentType: 'application/pdf',
        },
      ],
    });
  });

  it.each([
    [
      401,
      {
        ErrorCode: 10,
        Message: 'Request does not contain a valid Server token.',
      },
      'Postmark rejected the API key',
      true,
    ],
    [
      422,
      {
        ErrorCode: 400,
        Message:
          "The 'From' address you supplied (site@muehlenhof.example) is not a Sender Signature on your account.",
      },
      'Postmark has not verified the sender',
      true,
    ],
    [
      422,
      {
        ErrorCode: 1480,
        Message:
          "You are not authorized to send emails from your current IP address: '203.0.113.10'.",
      },
      "Postmark does not accept requests from this server's IP address",
      true,
    ],
    [
      413,
      { Message: 'Payload too large' },
      'The letter is too large for Postmark',
      true,
    ],
    [
      503,
      { ErrorCode: 100, Message: 'Maintenance' },
      'Postmark is unavailable',
      false,
    ],
  ])('%p %p — «%s»', async (status, body, text, permanent) => {
    const postmark = fake(() => Response.json(body, { status }));
    const got = await failure(
      sender('postmark', postmark.url).mail(_SETTINGS.postmark, _MAIL)
    );
    expect(got).toMatchObject({ permanent });
    expect(got!.message).toContain(text);
  });
});

describe('Resend', () => {
  it('Bearer-ключ, reply_to, вложения с content_id', async () => {
    const resend = fake(() => Response.json({ id: 'e1' }));
    await sender('resend', resend.url).send(
      _SETTINGS.resend,
      ['boss@muehlenhof.example', 'sales@muehlenhof.example'],
      _ITEM,
      'Mühlenhof'
    );
    await sender('resend', resend.url).mail(_SETTINGS.resend, _MAIL);
    const { 0: notification, 1: letter } = resend.seen;
    expect(notification!.path).toBe('/emails');
    expect(notification!.headers.get('authorization')).toBe(
      `Bearer ${_SETTINGS.resend.key}`
    );
    expect(json(notification!)).toMatchObject({
      from: 'Mühlenhof <site@muehlenhof.example>',
      to: ['boss@muehlenhof.example', 'sales@muehlenhof.example'],
      reply_to: 'anna@example.com',
      subject: 'Neue Anfrage — Mühlenhof',
    });
    expect(json(letter!).attachments).toEqual([
      {
        filename: 'logo.png',
        content: _LOGO.content.toBase64(),
        content_type: 'image/png',
        content_id: 'logo@k',
      },
      {
        filename: 'Angebot.pdf',
        content: _PDF.content.toBase64(),
        content_type: 'application/pdf',
      },
    ]);
  });

  it('429 с Retry-After — на время, с паузой; 403 о домене — отправитель не подтверждён', async () => {
    let answer = Response.json(
      {
        statusCode: 429,
        name: 'rate_limit_exceeded',
        message: 'Too many requests.',
      },
      { status: 429, headers: { 'retry-after': '7' } }
    );
    const resend = fake(() => answer);
    expect(
      await failure(sender('resend', resend.url).mail(_SETTINGS.resend, _MAIL))
    ).toMatchObject({
      permanent: false,
      retryAfter: 7000,
    });
    answer = Response.json(
      {
        statusCode: 403,
        name: 'validation_error',
        message:
          'The muehlenhof.example domain is not verified. Please, add and verify your domain on https://resend.com/domains',
      },
      { status: 403 }
    );
    const got = await failure(
      sender('resend', resend.url).mail(_SETTINGS.resend, _MAIL)
    );
    expect(got).toMatchObject({ permanent: true });
    expect(got!.message).toStartWith(
      'Resend has not verified the sender address or its domain (403 validation_error:'
    );
  });

  it('квота дня — на время: очередь повторит', async () => {
    const resend = fake(() =>
      Response.json(
        {
          name: 'daily_quota_exceeded',
          message: 'You have reached your daily email sending quota.',
        },
        { status: 429 }
      )
    );
    const got = await failure(
      sender('resend', resend.url).mail(_SETTINGS.resend, _MAIL)
    );
    expect(got).toMatchObject({ permanent: false, retryAfter: null });
    expect(got!.message).toContain('The Resend sending quota is used up');
  });
});

describe('Mailgun', () => {
  it('письмо MIME файлом формы — те же байты, что ушли бы по SMTP; адресаты — полями to', async () => {
    let form: Awaited<ReturnType<Response['formData']>> | null = null;
    const mailgun = fake((seen) =>
      new Response(seen.body, {
        headers: { 'content-type': seen.headers.get('content-type')! },
      })
        .formData()
        .then(
          (_) => (
            (form = _),
            Response.json({ id: '<1@mg>', message: 'Queued. Thank you.' })
          )
        )
    );
    await sender('mailgun', mailgun.url).mail(_SETTINGS.mailgun, _MAIL);
    const { 0: seen } = mailgun.seen;
    expect(seen!.path).toBe('/v3/mg.muehlenhof.example/messages.mime');
    expect(seen!.headers.get('authorization')).toBe(
      `Basic ${new TextEncoder().encode(`api:${_SETTINGS.mailgun.key}`).toBase64()}`
    );
    expect(form!.getAll('to')).toEqual(['anna@example.com', 'max@example.com']);
    const file = form!.get('message') as File;
    expect(await file.text()).toBe(
      mailMime({
        envelope: 'site@muehlenhof.example',
        mail: _MAIL,
        date: _DATE,
        id: 'm1',
      })
    );
  });

  it('регион EU — api.eu.mailgun.net, US — api.mailgun.net; SES — по региону', () => {
    expect(PROVIDERS.mailgun.base(_SETTINGS.mailgun)).toBe(
      'https://api.eu.mailgun.net'
    );
    expect(PROVIDERS.mailgun.base({ ..._SETTINGS.mailgun, region: 'us' })).toBe(
      'https://api.mailgun.net'
    );
    expect(PROVIDERS.ses.base(_SETTINGS.ses)).toBe(
      'https://email.eu-central-1.amazonaws.com'
    );
    expect(PROVIDERS.brevo.base(_SETTINGS.brevo)).toBe('https://api.brevo.com');
    expect(PROVIDERS.postmark.base(_SETTINGS.postmark)).toBe(
      'https://api.postmarkapp.com'
    );
    expect(PROVIDERS.resend.base(_SETTINGS.resend)).toBe(
      'https://api.resend.com'
    );
  });

  it.each([
    [401, 'Forbidden', 'Mailgun rejected the API key (401: Forbidden)', true],
    [
      404,
      '{"message":"Domain not found: mg.muehlenhof.example"}',
      'Mailgun does not know this sending domain in this region',
      true,
    ],
    [
      413,
      '{"message":"Message too large"}',
      'The letter is too large for Mailgun',
      true,
    ],
    [500, '{"message":"Internal error"}', 'Mailgun is unavailable', false],
  ])('%p %p — «%s»', async (status, body, text, permanent) => {
    const mailgun = fake(() => new Response(body, { status }));
    const got = await failure(
      sender('mailgun', mailgun.url).mail(_SETTINGS.mailgun, _MAIL)
    );
    expect(got).toMatchObject({ permanent });
    expect(got!.message).toContain(text);
  });
});

describe('Amazon SES', () => {
  it('письмо MIME в Content.Raw.Data, конверт — FromEmailAddress и Destination, подпись SigV4', async () => {
    const ses = fake(() => Response.json({ MessageId: 'ses-1' }));
    await sender('ses', ses.url).mail(_SETTINGS.ses, _MAIL);
    const { 0: seen } = ses.seen;
    expect(seen!.path).toBe('/v2/email/outbound-emails');
    const body = json(seen!);
    expect(body.FromEmailAddress).toBe('site@muehlenhof.example');
    expect(body.Destination).toEqual({
      ToAddresses: ['anna@example.com', 'max@example.com'],
    });
    expect(
      new TextDecoder().decode(Uint8Array.fromBase64(body.Content.Raw.Data))
    ).toBe(
      mailMime({
        envelope: 'site@muehlenhof.example',
        mail: _MAIL,
        date: _DATE,
        id: 'm1',
      })
    );
    expect(seen!.headers.get('x-amz-date')).toBe('20261103T100000Z');
    expect(seen!.headers.get('authorization')).toBe(
      signV4({
        method: 'POST',
        url: `${ses.url}/v2/email/outbound-emails`,
        headers: { 'content-type': 'application/json' },
        body: seen!.body,
        region: 'eu-central-1',
        service: 'ses',
        credentials: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: _SETTINGS.ses.key,
        },
        date: _DATE,
      }).headers.authorization!
    );
    expect(seen!.headers.get('authorization')).toStartWith(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261103/eu-central-1/ses/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature='
    );
  });

  it('уведомление — то же письмо MIME, что у SMTP: с Reply-To и именем сайта', async () => {
    const ses = fake(() => Response.json({ MessageId: 'ses-2' }));
    await sender('ses', ses.url).send(
      _SETTINGS.ses,
      ['boss@muehlenhof.example'],
      _ITEM,
      'Mühlenhof'
    );
    const raw = new TextDecoder().decode(
      Uint8Array.fromBase64(json(ses.seen[0]!).Content.Raw.Data)
    );
    expect(raw).toBe(
      mimeMessage({
        from: 'site@muehlenhof.example',
        to: ['boss@muehlenhof.example'],
        item: _ITEM,
        site: 'Mühlenhof',
        date: _DATE,
        id: 'm1',
      })
    );
    expect(raw).toContain('Reply-To: <anna@example.com>');
  });

  it.each([
    [
      400,
      {
        'x-amzn-errortype':
          'MessageRejected:http://internal.amazon.com/coral/com.amazonaws.sailfish/',
      },
      {
        message:
          'Email address is not verified. The following identities failed the check in region EU-CENTRAL-1: site@muehlenhof.example',
      },
      'Amazon SES has not verified the sender address or its domain (400 MessageRejected: Email address is not verified.',
      true,
    ],
    [
      403,
      {},
      {
        __type: 'com.amazon.coral.service#UnrecognizedClientException',
        message: 'The security token included in the request is invalid.',
      },
      'Amazon SES rejected the API key (403 UnrecognizedClientException:',
      true,
    ],
    [
      400,
      { 'x-amzn-errortype': 'SendingPausedException:' },
      { message: 'Sending is paused for this account.' },
      'The Amazon SES account cannot send now',
      true,
    ],
    [
      429,
      { 'x-amzn-errortype': 'TooManyRequestsException:' },
      { message: 'Maximum sending rate exceeded.' },
      'Amazon SES asks to send slower',
      false,
    ],
  ])('%p — «%s»', async (status, headers, body, text, permanent) => {
    const ses = fake(() => Response.json(body, { status, headers }));
    const got = await failure(
      sender('ses', ses.url).mail(_SETTINGS.ses, _MAIL)
    );
    expect(got).toMatchObject({ permanent });
    expect(got!.message).toStartWith(text);
  });
});

describe('связь и сроки', () => {
  it('ключ, повторённый сервисом в ответе, в ошибку не попадает', async () => {
    const brevo = fake(() =>
      Response.json(
        {
          code: 'unauthorized',
          message: `Key ${_SETTINGS.brevo.key} not found`,
        },
        { status: 401 }
      )
    );
    const got = await failure(
      sender('brevo', brevo.url).mail(_SETTINGS.brevo, _MAIL)
    );
    expect(got!.message).not.toContain(_SETTINGS.brevo.key);
    expect(got!.message).toContain('Key … not found');
  });

  it('сервис молчит дольше срока — на время, очередь повторит', async () => {
    const slow = fake(() => Bun.sleep(1000).then(() => Response.json({})));
    const got = await failure(
      sender('postmark', slow.url, 100).mail(_SETTINGS.postmark, _MAIL)
    );
    expect(got).toEqual({
      permanent: false,
      retryAfter: null,
      message: 'Postmark did not answer in 0.1 s',
    });
  });

  it('сервис недоступен — на время; переадресация — не идёт, ключ не уходит дальше', async () => {
    const closed = fake();
    const url = closed.url;
    closed.stop();
    expect(
      await failure(sender('brevo', url).mail(_SETTINGS.brevo, _MAIL))
    ).toMatchObject({
      permanent: false,
      message: expect.stringMatching(/^Cannot reach 127\.0\.0\.1:\d+: \w+/),
    });
    const elsewhere = fake();
    const moved = fake(
      () =>
        new Response(null, {
          status: 307,
          headers: { location: `${elsewhere.url}/v3/smtp/email` },
        })
    );
    expect(
      await failure(sender('brevo', moved.url).mail(_SETTINGS.brevo, _MAIL))
    ).toEqual({
      permanent: false,
      retryAfter: null,
      message:
        'Brevo answered with a redirect: the letter and the key were not sent there',
    });
    expect(elsewhere.seen).toHaveLength(0);
  });

  it('проверка связи — ответ HTTPS без ключа; закрытый порт — connect_failed', async () => {
    const brevo = fake(() => new Response('not found', { status: 404 }));
    expect(
      await sender('brevo', brevo.url).probe(_SETTINGS.brevo)
    ).toMatchObject({ ok: true });
    expect(brevo.seen[0]!.headers.get('api-key')).toBeNull();
    const url = brevo.url;
    brevo.stop();
    expect(await sender('brevo', url).probe(_SETTINGS.brevo)).toMatchObject({
      ok: false,
      error: 'connect_failed',
    });
  });

  it('вложение в 2 МБ — тело ровно на его base64 больше письма без него', async () => {
    const brevo = fake(() => Response.json({}, { status: 201 }));
    const big = {
      ..._PDF,
      content: crypto.getRandomValues(new Uint8Array(2_000_000)),
    };
    await sender('brevo', brevo.url).mail(_SETTINGS.brevo, {
      ..._MAIL,
      attachments: [],
    });
    await sender('brevo', brevo.url).mail(_SETTINGS.brevo, {
      ..._MAIL,
      attachments: [big],
    });
    const { 0: small, 1: large } = brevo.seen;
    const extra = `,"attachment":[{"name":"Angebot.pdf","content":""}]`.length;
    expect(large!.body.length - small!.body.length).toBe(
      extra + Math.ceil(2_000_000 / 3) * 4
    );
    expect(json(large!).attachment[0].content).toBe(big.content.toBase64());
  });
});
