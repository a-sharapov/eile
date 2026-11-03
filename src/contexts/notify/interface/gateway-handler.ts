import { bytesOf, readBody, spoolBody } from '../../../platform/body.ts';
import { attempt } from '../../../shared/kernel/errors.ts';
import type {
  GatewayOutcome,
  GatewaySent,
  GatewayService,
} from '../application/gateway-service.ts';
import type { GatewayToken } from '../domain/gateway.ts';
import type { SmtpProbe } from '../domain/ports.ts';
import type { GatewayStatus } from '../domain/settings.ts';

/**
 * Потолок тела запроса: письмо с вложениями в base64. Больше почтовые серверы обычно и не принимают,
 * а тело — JSON: оно разбирается в памяти целиком.
 */
export var GATEWAY_BODY_LIMIT = 40 * 1024 * 1024;

// Ответы — всегда JSON и никогда не в кэш: ни прокси, ни браузер не хранят их.
const _HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex',
};

// Коды ответа — как у прежнего PHP-шлюза; 403, 413 и 503 — пределы и состояния шлюза Eile.
const _STATUS: Readonly<Record<GatewayOutcome, number>> = {
  sent: 200,
  invalid_json: 400,
  to_required: 400,
  too_many_recipients: 400,
  subject_required: 400,
  body_required: 400,
  unauthorized: 401,
  recipient_not_allowed: 403,
  too_large: 413,
  rate_limited: 429,
  from_misconfigured: 500,
  send_failed: 502,
  disabled: 503,
  smtp_not_ready: 503,
};

const _EXTRA: Partial<Record<GatewayOutcome, Record<string, string>>> = {
  rate_limited: { 'retry-after': '60' },
  unauthorized: { 'www-authenticate': 'Bearer' },
};

const _json = (
  status: number,
  body: unknown,
  extra: Readonly<Record<string, string>> = {}
): Response =>
  Response.json(body, { status, headers: { ..._HEADERS, ...extra } });

const _answer = (outcome: GatewayOutcome): Response =>
  _json(
    _STATUS[outcome],
    outcome === 'sent' ? { ok: true } : { ok: false, error: outcome },
    _EXTRA[outcome]
  );

const _bearer = (request: Request): string | null =>
  /^\s*Bearer\s+(\S+)\s*$/i.exec(
    request.headers.get('authorization') ?? ''
  )?.[1] ?? null;

const _TOO_LARGE = 'The gateway request body is too large';

type _Read =
  | { readonly body: unknown; readonly size: number }
  | { readonly outcome: 'too_large' | 'invalid_json' };

// После большого тела — полная сборка мусора: текст тела, его base64 и куски письма уходят из памяти
// сразу, а не когда-нибудь потом. Сборка останавливает сервер на 5–20 мс, поэтому только после тел от
// 4 МБ (ADR 0043).
const _BIG = 4 * 1024 * 1024;

const _collect = (size: number): void => void (size >= _BIG && Bun.gc(true));

// Тело — во временный файл на диске, без него — одним буфером; в память оно приходит уже текстом, и
// пока идёт JSON.parse, рядом нет ни буфера, ни кусков, из которых он собран (ADR 0043).
const _read = (request: Request, spool: () => string | null): Promise<_Read> =>
  ((tooLarge, path) =>
    (path === null
      ? readBody(request, GATEWAY_BODY_LIMIT, tooLarge).then(bytesOf)
      : spoolBody(request, GATEWAY_BODY_LIMIT, tooLarge, path)
    ).then((body) =>
      body
        .text()
        .then((text) => ({ text, size: body.size }))
        .finally(body.close)
    ))(() => new Error(_TOO_LARGE), spool()).then(
    ({ text, size }): _Read =>
      attempt<_Read>(
        () => ({ body: JSON.parse(text) as unknown, size }),
        () => ({ outcome: 'invalid_json' })
      ),
    (error): _Read => ({
      outcome:
        error instanceof Error && error.message === _TOO_LARGE
          ? 'too_large'
          : 'invalid_json',
    })
  );

// Как у PHP-шлюза: ?probe=1 — да, пусто и 0 — нет.
const _probeWanted = (url: URL): boolean =>
  ((value) => value !== null && value !== '' && value !== '0')(
    url.searchParams.get('probe')
  );

const _NOTHING: Omit<GatewaySent, 'outcome'> = {
  recipients: 0,
  attachments: 0,
};

/** Документ состояния: что готово, предел и адреса — без токенов, паролей и адресов почты. */
const _status = (
  status: GatewayStatus,
  time: string,
  probe: SmtpProbe | null | undefined
): Response =>
  _json(status.ready ? 200 : 503, {
    ok: status.ready,
    service: 'eile-mail-gateway',
    time,
    checks: status.checks,
    rate_limit_per_minute: status.rateLimit,
    endpoints: {
      [`GET ${status.path}`]: 'status (this)',
      [`GET ${status.path}?probe=1`]:
        'status + SMTP TCP/greeting probe, no AUTH',
      [`POST ${status.path}`]:
        'send mail: Authorization: Bearer <token>, JSON { to, subject, html?, text?, from?, attachments? }',
    },
    hint: status.ready
      ? 'POST JSON with Authorization: Bearer <token>'
      : 'Fix the checks in the manager: Settings → Notifications → Email → Mail gateway',
    ...(probe === undefined
      ? {}
      : {
          probe:
            probe === null
              ? { ok: null, skipped: true, reason: 'smtp_not_ready' }
              : {
                  ok: probe.ok,
                  latency_ms: probe.latencyMs,
                  ...(probe.error ? { error: probe.error } : {}),
                },
          probe_note: 'TCP + greeting only, no AUTH; may take a few seconds',
        }),
  });

/**
 * HTTP почтового шлюза. POST: состояние шлюза → предел запросов с адреса → токен → тело → письмо;
 * каждый POST — строка журнала. GET — документ состояния, `?probe=1` — ещё и проверка почтового сервера.
 */
export var defineGatewayHandler = ({
  gateway,
  clock,
  spool,
}: {
  gateway: GatewayService;
  clock: () => Date;
  /** Временный файл для тела запроса на диске; null — тело читается в память. */
  spool: () => string | null;
}) => {
  const finish = (sent: GatewaySent, token: string | null = null): Response => (
    gateway.record({ ...sent, token }), _answer(sent.outcome)
  );

  const refused = (outcome: GatewayOutcome): Promise<Response> =>
    Promise.resolve(finish({ outcome, ..._NOTHING }));

  // Тело — аргументом: замыкание ответа держит размер, а не разобранное письмо.
  const deliver = (
    token: GatewayToken,
    size: number,
    body: unknown
  ): Promise<Response> => (
    _collect(size),
    gateway
      .send(body, token)
      .then((sent) => (_collect(size), finish(sent, token.label)))
  );

  const post = (request: Request, client: string): Promise<Response> =>
    ((state) =>
      state !== 'ready'
        ? refused(state)
        : !gateway.allowed(client)
          ? refused('rate_limited')
          : ((token) =>
              token === null
                ? refused('unauthorized')
                : _read(request, spool).then((read) =>
                    'outcome' in read
                      ? finish(
                          { outcome: read.outcome, ..._NOTHING },
                          token.label
                        )
                      : deliver(token, read.size, read.body)
                  ))(gateway.authorize(_bearer(request))))(gateway.state());

  // Проверка почтового сервера открывает соединение: она — в пределе запросов, простой GET — нет.
  const get = (request: Request, client: string): Promise<Response> =>
    _probeWanted(new URL(request.url))
      ? gateway.allowed(client)
        ? gateway
            .probe()
            .then((probe) =>
              _status(gateway.status(), clock().toISOString(), probe)
            )
        : Promise.resolve(_answer('rate_limited'))
      : Promise.resolve(
          _status(gateway.status(), clock().toISOString(), undefined)
        );

  const _METHODS: Readonly<
    Record<string, (request: Request, client: string) => Promise<Response>>
  > = { GET: get, POST: post };

  const notAllowed = (): Promise<Response> =>
    Promise.resolve(
      _json(
        405,
        { ok: false, error: 'method_not_allowed' },
        { allow: 'GET, POST' }
      )
    );

  return {
    claims: gateway.claims,
    // Неожиданная ошибка — 500 без подробностей: клиенту внутренности не нужны, в журнал сервера — всё.
    handle: (request: Request, client: string): Promise<Response> =>
      Promise.resolve()
        .then(() => (_METHODS[request.method] ?? notAllowed)(request, client))
        .then(
          undefined,
          (error) => (
            console.error(error), _json(500, { ok: false, error: 'internal' })
          )
        ),
  };
};
