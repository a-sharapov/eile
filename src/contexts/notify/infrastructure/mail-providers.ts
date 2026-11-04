import type { MailAttachment } from '../domain/gateway.ts';
import type { MailProvider } from '../domain/providers.ts';
import type { ApiEmailSettings } from '../domain/settings.ts';
import {
  type Base64Of,
  type Json,
  jsonPieces,
  type Measure,
  type Piece,
} from './api-body.ts';
import { signV4 } from './sigv4.ts';

/**
 * Письмо для HTTP API. Поля — для сервисов, которые собирают письмо сами из JSON; `mime` — то же письмо
 * байтами, что ушло бы по SMTP: его берут сервисы, которые принимают письмо целиком.
 */
export type Letter = {
  /** Отправитель конверта — почта сайта, как MAIL FROM у SMTP. */
  readonly envelope: string;
  readonly from: { readonly address: string; readonly name: string };
  readonly to: readonly string[];
  readonly replyTo: string | null;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments: readonly MailAttachment[];
  /** Письмо MIME кусками; каждый вызов даёт те же байты (тело собирается в два прохода). */
  readonly mime: () => Iterable<string | Uint8Array>;
};

export type ProviderRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: () => Iterable<Piece>;
};

/** Чем кончилась отправка, если не письмом: по этому решается текст ошибки и будут ли повторы. */
export type ProblemKind =
  | 'auth'
  | 'ip'
  | 'sender'
  | 'domain'
  | 'size'
  | 'rate'
  | 'quota'
  | 'account'
  | 'rejected'
  | 'unavailable';

/** Ответ сервиса с ошибкой: код и текст — из тела, как их называет сам сервис. */
export type Fault = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
};

type Provider = {
  /** Адрес API без пути: туда же ходит проверка связи, без ключа. */
  readonly base: (settings: ApiEmailSettings) => string;
  readonly request: (
    settings: ApiEmailSettings,
    letter: Letter,
    base: string
  ) => ProviderRequest;
  /** Подписи нужен SHA-256 тела: первый проход считает и его. */
  readonly hashed: boolean;
  /** Заголовки запроса с длиной тела, а у SES — с подписью по его хэшу. */
  readonly sign: (
    settings: ApiEmailSettings,
    request: ProviderRequest,
    body: Measure,
    now: Date
  ) => Readonly<Record<string, string>>;
  readonly fault: (
    status: number,
    body: Readonly<Record<string, unknown>>,
    headers: Headers
  ) => Fault;
  /** Что значит ошибка у этого сервиса; null — понять по статусу. */
  readonly kind: (fault: Fault) => ProblemKind | null;
};

const _utf8 = new TextEncoder();

const _string = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const _bytes = (content: Uint8Array): Base64Of => ({
  base64: () => [content],
});

// Простое имя — как есть («Mühlenhof <site@muehlenhof.example>», так в примерах сервисов); с запятой, точкой,
// скобками и кавычками — в кавычках, иначе адрес разберётся не так.
const _PLAIN_NAME = /^[\p{L}\p{N} !#$%&'*+\-/=?^_`{|}~]+$/u;

/** Адрес с именем для поля JSON: `Имя <адрес>`. */
export var mailboxOf = (from: Letter['from']): string =>
  from.name === ''
    ? from.address
    : `${_PLAIN_NAME.test(from.name) ? from.name : `"${from.name.replace(/["\\]/g, '\\$&')}"`} <${from.address}>`;

const _json = (body: Json) => () => jsonPieces(body);

const _unsigned: Provider['sign'] = (_settings, request) => request.headers;

const _JSON_HEADERS = {
  accept: 'application/json',
  'content-type': 'application/json',
};

// Brevo, Postmark, Mailgun и Resend отвечают JSON с кодом и текстом под своими именами.
const _faultOf =
  (code: string, message: string): Provider['fault'] =>
  (status, body) => ({
    status,
    code: _string(body[code]),
    message: _string(body[message]),
  });

// Brevo (developers.brevo.com/reference/sendtransacemail): картинок по Content-ID у API нет — они
// уходят обычными вложениями; имя отправителя — до 70 знаков.
const _brevo: Provider = {
  base: () => 'https://api.brevo.com',
  request: (settings, letter, base) => ({
    url: `${base}/v3/smtp/email`,
    headers: { ..._JSON_HEADERS, 'api-key': settings.key },
    body: _json({
      sender: {
        name: [...letter.from.name].slice(0, 70).join('') || undefined,
        email: letter.from.address,
      },
      to: letter.to.map((email) => ({ email })),
      replyTo: letter.replyTo ? { email: letter.replyTo } : undefined,
      subject: letter.subject,
      htmlContent: letter.html,
      textContent: letter.text,
      attachment:
        letter.attachments.length > 0
          ? letter.attachments.map((_) => ({
              name: _.filename,
              content: _bytes(_.content),
            }))
          : undefined,
    }),
  }),
  hashed: false,
  sign: _unsigned,
  fault: _faultOf('code', 'message'),
  kind: ({ status, code, message }) =>
    status === 401 && /\bIP\b/i.test(message)
      ? 'ip'
      : status === 402 ||
          code === 'not_enough_credits' ||
          code === 'account_under_validation'
        ? 'account'
        : code === 'permission_denied'
          ? 'auth'
          : status === 400 && /sender/i.test(message)
            ? 'sender'
            : null,
};

// Postmark (postmarkapp.com/developer/api/email-api): ContentID — с приставкой cid:, поток — MessageStream.
const _postmark: Provider = {
  base: () => 'https://api.postmarkapp.com',
  request: (settings, letter, base) => ({
    url: `${base}/email`,
    headers: { ..._JSON_HEADERS, 'x-postmark-server-token': settings.key },
    body: _json({
      From: mailboxOf(letter.from),
      To: letter.to.join(', '),
      ReplyTo: letter.replyTo ?? undefined,
      Subject: letter.subject,
      HtmlBody: letter.html,
      TextBody: letter.text,
      MessageStream: settings.stream,
      Attachments:
        letter.attachments.length > 0
          ? letter.attachments.map((_) => ({
              Name: _.filename,
              Content: _bytes(_.content),
              ContentType: _.contentType,
              ContentID: _.inline ? `cid:${_.contentId}` : undefined,
            }))
          : undefined,
    }),
  }),
  hashed: false,
  sign: _unsigned,
  fault: _faultOf('ErrorCode', 'Message'),
  // ErrorCode 10 — токен, 1480 — IP, 400/401 — подпись отправителя, 412/413 — аккаунт ещё на проверке.
  kind: ({ code, message }) =>
    code === '10'
      ? 'auth'
      : code === '1480'
        ? 'ip'
        : code === '400' || code === '401' || /sender signature/i.test(message)
          ? 'sender'
          : code === '412' || code === '413'
            ? 'account'
            : null,
};

const _basic = (key: string): string =>
  `Basic ${_utf8.encode(`api:${key}`).toBase64()}`;

// Mailgun (documentation.mailgun.com, POST /v3/{domain}/messages.mime): письмо MIME файлом формы,
// адресаты — полями to; домены региона EU — только через api.eu.mailgun.net.
const _mailgun: Provider = {
  base: (settings) =>
    settings.region === 'eu'
      ? 'https://api.eu.mailgun.net'
      : 'https://api.mailgun.net',
  request: (settings, letter, base) =>
    ((boundary) => ({
      url: `${base}/v3/${encodeURIComponent(settings.domain)}/messages.mime`,
      headers: {
        accept: 'application/json',
        authorization: _basic(settings.key),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: function* () {
        for (const address of letter.to)
          yield `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${address}\r\n`;
        yield `--${boundary}\r\nContent-Disposition: form-data; name="message"; filename="message.mime"\r\nContent-Type: application/octet-stream\r\n\r\n`;
        yield* letter.mime();
        yield `\r\n--${boundary}--\r\n`;
      },
    }))(`eile-form-${Bun.randomUUIDv7()}`),
  hashed: false,
  sign: _unsigned,
  fault: _faultOf('code', 'message'),
  kind: ({ status, message }) =>
    status === 404
      ? 'domain'
      : /not allowed to send|sandbox|authorized recipients/i.test(message)
        ? 'account'
        : null,
};

// Resend (resend.com/docs/api-reference/emails/send-email): reply_to, content_id без cid:.
const _resend: Provider = {
  base: () => 'https://api.resend.com',
  request: (settings, letter, base) => ({
    url: `${base}/emails`,
    headers: { ..._JSON_HEADERS, authorization: `Bearer ${settings.key}` },
    body: _json({
      from: mailboxOf(letter.from),
      to: [...letter.to],
      subject: letter.subject,
      html: letter.html,
      text: letter.text,
      reply_to: letter.replyTo ?? undefined,
      attachments:
        letter.attachments.length > 0
          ? letter.attachments.map((_) => ({
              filename: _.filename,
              content: _bytes(_.content),
              content_type: _.contentType,
              content_id: _.inline ? _.contentId : undefined,
            }))
          : undefined,
    }),
  }),
  hashed: false,
  sign: _unsigned,
  fault: _faultOf('name', 'message'),
  kind: ({ status, code, message }) =>
    code === 'daily_quota_exceeded' || code === 'monthly_quota_exceeded'
      ? 'quota'
      : status === 403 && /domain|verify|testing emails/i.test(message)
        ? 'sender'
        : null,
};

const _SES_AUTH: readonly string[] = [
  'AccessDeniedException',
  'IncompleteSignature',
  'InvalidClientTokenId',
  'InvalidSignatureException',
  'MissingAuthenticationToken',
  'SignatureDoesNotMatch',
  'UnrecognizedClientException',
];

const _SES_KIND: Readonly<Record<string, ProblemKind>> = {
  MailFromDomainNotVerifiedException: 'sender',
  AccountSuspendedException: 'account',
  SendingPausedException: 'account',
  TooManyRequestsException: 'rate',
  ThrottlingException: 'rate',
  Throttling: 'rate',
  LimitExceededException: 'quota',
  ...Object.fromEntries(_SES_AUTH.map((_) => [_, 'auth' as const])),
};

// Тип ошибки AWS — в x-amzn-ErrorType («MessageRejected:http://…») или в __type тела («…#MessageRejected»).
const _sesFault: Provider['fault'] = (status, body, headers) => ({
  status,
  code:
    (headers.get('x-amzn-errortype') ?? '').split(':')[0] ||
    (_string(body.__type).split('#').at(-1) ?? ''),
  message: _string(body.message ?? body.Message),
});

// Amazon SES v2 (docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html): письмо MIME
// целиком в Content.Raw.Data (base64), конверт — FromEmailAddress и Destination; подпись SigV4.
const _ses: Provider = {
  base: (settings) => `https://email.${settings.region}.amazonaws.com`,
  request: (_settings, letter, base) => ({
    url: `${base}/v2/email/outbound-emails`,
    headers: { 'content-type': 'application/json' },
    body: _json({
      FromEmailAddress: letter.envelope,
      Destination: { ToAddresses: [...letter.to] },
      Content: { Raw: { Data: { base64: letter.mime } } },
    }),
  }),
  hashed: true,
  sign: (settings, request, body, now) =>
    signV4({
      method: 'POST',
      url: request.url,
      headers: request.headers,
      body: { sha256: body.sha256 ?? '' },
      region: settings.region,
      service: 'ses',
      credentials: {
        accessKeyId: settings.keyId,
        secretAccessKey: settings.key,
      },
      date: now,
    }).headers,
  fault: _sesFault,
  kind: ({ code, message }) =>
    code === 'MessageRejected'
      ? /not verified/i.test(message)
        ? 'sender'
        : /too (long|large)|size/i.test(message)
          ? 'size'
          : 'rejected'
      : (_SES_KIND[code] ?? null),
};

/** Пять сервисов: адрес, запрос, подпись и смысл ошибок — каждый по своей документации. */
export var PROVIDERS: Readonly<Record<MailProvider, Provider>> = {
  brevo: _brevo,
  postmark: _postmark,
  mailgun: _mailgun,
  resend: _resend,
  ses: _ses,
};
