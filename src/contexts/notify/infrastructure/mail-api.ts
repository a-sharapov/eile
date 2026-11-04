import { attempt } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { SendFailure } from '../domain/delivery.ts';
import type { Mail } from '../domain/gateway.ts';
import type { Message } from '../domain/message.ts';
import type { EmailSender, SmtpProbe } from '../domain/ports.ts';
import { type MailProvider, PROVIDER_NAMES } from '../domain/providers.ts';
import type { ApiEmailSettings } from '../domain/settings.ts';
import { measured, streamed } from './api-body.ts';
import {
  type Fault,
  type Letter,
  PROVIDERS,
  type ProblemKind,
} from './mail-providers.ts';
import {
  htmlOf,
  mailParts,
  mimeMessage,
  notificationOf,
  oneLine,
  plainOf,
} from './mime.ts';

const _TIMEOUT_MS = 30_000;
const _PROBE_MS = 8_000;
// Пауза по просьбе сервиса — не дольше суток: дальше очередь всё равно сдаётся.
const _MAX_PAUSE_MS = 24 * 60 * 60 * 1000;
const _DETAIL = 300;

const _SAY: Readonly<Record<ProblemKind, (name: string) => string>> = {
  auth: (name) => `${name} rejected the API key`,
  ip: (name) =>
    `${name} does not accept requests from this server's IP address`,
  sender: (name) => `${name} has not verified the sender address or its domain`,
  domain: (name) => `${name} does not know this sending domain in this region`,
  size: (name) => `The letter is too large for ${name}`,
  rate: (name) => `${name} asks to send slower`,
  quota: (name) => `The ${name} sending quota is used up`,
  account: (name) => `The ${name} account cannot send now`,
  rejected: (name) => `${name} rejected the letter`,
  unavailable: (name) => `${name} is unavailable`,
};

// Повтор не поможет, пока владелец не поправит ключ, отправителя или аккаунт; лимит, квота и сбой
// сервиса проходят сами — очередь повторит, как у SMTP.
const _PERMANENT: Readonly<Record<ProblemKind, boolean>> = {
  auth: true,
  ip: true,
  sender: true,
  domain: true,
  size: true,
  rate: false,
  quota: false,
  account: true,
  rejected: true,
  unavailable: false,
};

const _byStatus = (status: number): ProblemKind =>
  status === 401 || status === 403
    ? 'auth'
    : status === 413
      ? 'size'
      : status === 429
        ? 'rate'
        : status >= 500
          ? 'unavailable'
          : 'rejected';

const _failure = (
  message: string,
  permanent: boolean,
  retryAfter: number | null = null
): SendFailure & Error =>
  Object.assign(new Error(message), { permanent, retryAfter });

// Retry-After — секунды или дата HTTP; Brevo и Resend называют паузу по-своему.
const _pause = (value: string | null, now: number): number | null =>
  value === null || value.trim() === ''
    ? null
    : /^\d+(?:\.\d+)?$/.test(value.trim())
      ? Number(value) * 1000
      : ((at) => (Number.isNaN(at) ? null : Math.max(0, at - now)))(
          Date.parse(value)
        );

const _retryAfter = (headers: Headers, now: number): number | null =>
  ((pause) => (pause === null ? null : Math.min(pause, _MAX_PAUSE_MS)))(
    _pause(headers.get('retry-after'), now) ??
      _pause(headers.get('x-sib-ratelimit-reset'), now) ??
      _pause(headers.get('ratelimit-reset'), now)
  );

const _clip = (text: string): string =>
  ((line) => (line.length > _DETAIL ? `${line.slice(0, _DETAIL)}…` : line))(
    text.replace(/\s+/g, ' ').trim()
  );

// Повторит сервис ключ в тексте ошибки — в очередь, журнал сбоев и менеджер он всё равно не попадёт.
const _redacted = (text: string, settings: ApiEmailSettings): string =>
  settings.key.length >= 8 ? text.replaceAll(settings.key, '…') : text;

const _record = (text: string): Readonly<Record<string, unknown>> =>
  attempt(
    () =>
      ((value) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {})(JSON.parse(text) as unknown),
    () => ({})
  );

const _detail = (fault: Fault, raw: string): string =>
  `${fault.status}${fault.code ? ` ${fault.code}` : ''}: ${_clip(fault.message || raw) || 'no details'}`;

/** Ответ сервиса с ошибкой — в отказ очереди: понятная причина, насовсем или на время, пауза. */
export var apiFailure = (
  settings: ApiEmailSettings,
  status: number,
  text: string,
  headers: Headers,
  now: number
): SendFailure & Error => {
  const provider = PROVIDERS[settings.transport];
  const fault = provider.fault(status, _record(text), headers);
  const kind = provider.kind(fault) ?? _byStatus(status);
  const pause = _PERMANENT[kind] ? null : _retryAfter(headers, now);
  return _failure(
    _redacted(
      `${_SAY[kind](PROVIDER_NAMES[settings.transport])} (${_detail(fault, text)})${pause === null ? '' : `, retry in ${Math.ceil(pause / 1000)} s`}`,
      settings
    ),
    _PERMANENT[kind],
    pause
  );
};

// Ошибки TLS — насовсем, как у SMTP: сертификат сервиса не сменится сам; остальное — сеть, повтор.
const _TLS = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i;

const _string = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const _code = (error: unknown): string =>
  _string((error as { code?: unknown } | null)?.code) ||
  (error instanceof Error ? error.name : String(error));

const _unreachable = (
  settings: ApiEmailSettings,
  url: string,
  error: unknown,
  timeoutMs: number
): SendFailure & Error =>
  ((name, code) =>
    code === 'TimeoutError'
      ? _failure(`${name} did not answer in ${timeoutMs / 1000} s`, false)
      : code === 'UnexpectedRedirect'
        ? _failure(
            `${name} answered with a redirect: the letter and the key were not sent there`,
            false
          )
        : _failure(
            `Cannot reach ${new URL(url).host}: ${code}`,
            _TLS.test(code)
          ))(PROVIDER_NAMES[settings.transport], _code(error));

const _probeError = (error: unknown): NonNullable<SmtpProbe['error']> =>
  ((code) =>
    code === 'TimeoutError'
      ? 'timeout'
      : _TLS.test(code)
        ? 'tls_failed'
        : 'connect_failed')(_code(error));

type Options = {
  /** Адреса API вместо настоящих — поддельный сервис в тестах. */
  readonly endpoints?: Partial<Record<MailProvider, string>>;
  readonly timeoutMs?: number;
  readonly clock?: () => Date;
  /** Message-ID и границы частей письма MIME. */
  readonly id?: () => string;
};

/**
 * Отправка через HTTP API почтового сервиса (ADR 0051). SES и Mailgun получают письмо MIME целиком —
 * те же байты, что ушли бы по SMTP; Brevo, Postmark и Resend — его поля в JSON. Тело уходит потоком
 * порциями, base64 вложений собирается по ходу из байтов. Срок ответа — 30 секунд, переадресации не
 * идут: ключ уходит только на адрес сервиса.
 */
export var defineApiSender = ({
  endpoints = {},
  timeoutMs = _TIMEOUT_MS,
  clock = () => new Date(),
  id = () => Bun.randomUUIDv7(),
}: Options = {}): EmailSender<ApiEmailSettings> => {
  const base = (settings: ApiEmailSettings): string =>
    endpoints[settings.transport] ??
    PROVIDERS[settings.transport].base(settings);

  const answered =
    (settings: ApiEmailSettings) =>
    (response: Response): Promise<void> =>
      response.ok
        ? response.arrayBuffer().then(() => undefined)
        : response
            .text()
            .then((text) =>
              Promise.reject(
                apiFailure(
                  settings,
                  response.status,
                  text,
                  response.headers,
                  clock().getTime()
                )
              )
            );

  // Письмо собирается внутри цепочки: ошибка сборки — отказ, а не исключение у вызывающего. Тело — в
  // два прохода: длина (у SES и хэш для подписи), затем поток по мере отправки.
  const transmit = (
    settings: ApiEmailSettings,
    letter: () => Letter
  ): Promise<void> =>
    Promise.resolve(settings).then(
      pipe(
        (_: ApiEmailSettings) =>
          PROVIDERS[_.transport].request(_, letter(), base(_)),
        (request) => ({
          request,
          body: measured(request.body, PROVIDERS[settings.transport].hashed),
        }),
        ({ request, body }) =>
          fetch(request.url, {
            method: 'POST',
            headers: {
              ...PROVIDERS[settings.transport].sign(
                settings,
                request,
                body,
                clock()
              ),
              'content-length': String(body.length),
            },
            body: streamed(request.body, body.length),
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
          }).then(answered(settings), (error) =>
            Promise.reject(
              _unreachable(settings, request.url, error, timeoutMs)
            )
          )
      )
    );

  const notification = (
    settings: ApiEmailSettings,
    to: readonly string[],
    item: Message,
    site: string
  ): Letter => {
    const date = clock();
    const messageId = id();
    const parts = notificationOf(item, site);
    return {
      envelope: settings.from,
      from: { address: settings.from, name: oneLine(site) },
      to,
      replyTo: item.replyTo ? oneLine(item.replyTo) : null,
      subject: oneLine(parts.subject),
      html: parts.html,
      text: parts.text,
      attachments: [],
      mime: () => [
        mimeMessage({
          from: settings.from,
          to,
          item,
          site,
          date,
          id: messageId,
        }),
      ],
    };
  };

  // Текст и HTML — всегда оба, как в письме SMTP: недостающее собирается из другого.
  const gateway = (settings: ApiEmailSettings, mail: Mail): Letter => {
    const date = clock();
    const messageId = id();
    return {
      envelope: settings.from,
      from: { address: mail.from.address, name: oneLine(mail.from.name) },
      to: mail.to,
      replyTo: null,
      subject: oneLine(mail.subject),
      html: mail.html || htmlOf(mail.text),
      text: mail.text || plainOf(mail.html),
      attachments: mail.attachments,
      mime: () =>
        mailParts({ envelope: settings.from, mail, date, id: messageId }),
    };
  };

  return {
    send: (settings, to, item, site) =>
      transmit(settings, () => notification(settings, to, item, site)),
    mail: (settings, mail) => transmit(settings, () => gateway(settings, mail)),
    // Связь с сервисом — любой ответ HTTPS на адрес API, без ключа: как приветствие SMTP без входа.
    probe: (settings) => {
      const started = performance.now();
      const elapsed = (): number => Math.round(performance.now() - started);
      return fetch(`${base(settings)}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(_PROBE_MS),
      }).then(
        (response): SmtpProbe => (
          void response.body?.cancel(), { ok: true, latencyMs: elapsed() }
        ),
        (error): SmtpProbe => ({
          ok: false,
          latencyMs: elapsed(),
          error: _probeError(error),
        })
      );
    },
  };
};
