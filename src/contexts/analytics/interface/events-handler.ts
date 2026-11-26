import { readBody } from '../../../platform/body.ts';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import type { Intake, IntakeOutcome } from '../application/intake.ts';
import { EVENT_LIMITS, type FieldErrors } from '../domain/envelope.ts';

// Ответы — всегда JSON и никогда не в кэш. CORS нет: отправитель — сервер, ключу не место в браузере.
const _HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex',
};

const _json = (
  status: number,
  body: unknown,
  extra: Readonly<Record<string, string>> = {}
): Response =>
  Response.json(body, { status, headers: { ..._HEADERS, ...extra } });

// Выключенный приём — 503, как у почтового шлюза: отправитель повторит позже и не потеряет события.
const _disabled = (): Response =>
  _json(503, { ok: false, error: 'disabled' }, { 'retry-after': '3600' });

const _accepted = (warnings: readonly string[]): Response =>
  _json(200, warnings.length > 0 ? { ok: true, warnings } : { ok: true });

const _OUTCOMES: {
  readonly [K in IntakeOutcome['kind']]: (
    outcome: Extract<IntakeOutcome, { kind: K }>
  ) => Response;
} = {
  accepted: (_) => _accepted(_.warnings),
  erasure: (_) => _accepted(_.warnings),
  duplicate: (_) =>
    _json(
      200,
      _.conflict
        ? { ok: true, duplicate: true, conflict: true }
        : { ok: true, duplicate: true }
    ),
  erased: () => _json(200, { ok: true, erased: true }),
  invalid: (_) => _json(400, { ok: false, errors: _.errors }),
};

const _answer = (outcome: IntakeOutcome): Response =>
  (_OUTCOMES[outcome.kind] as (outcome: IntakeOutcome) => Response)(outcome);

const _bearer = (request: Request): string | null =>
  /^\s*Bearer\s+(\S+)\s*$/i.exec(
    request.headers.get('authorization') ?? ''
  )?.[1] ?? null;

const _TOO_LARGE = 'The event body is too large';

// Тело читается только после ключа: неизвестный клиент не заставит сервер читать 64 КБ.
const _read = (
  request: Request
): Promise<{ readonly text: string } | { readonly error: string }> =>
  readBody(request, EVENT_LIMITS.body, () => new Error(_TOO_LARGE)).then(
    (bytes) =>
      attempt<{ readonly text: string } | { readonly error: string }>(
        () => ({
          text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        }),
        () => ({ error: 'is not UTF-8' })
      ),
    (error) => ({
      error:
        error instanceof Error && error.message === _TOO_LARGE
          ? `is larger than ${EVENT_LIMITS.body} bytes`
          : 'could not be read',
    })
  );

/**
 * HTTP приёмника `POST /_cms/events`, проверки — в порядке ADR 0072: выключатель → метод → перебор ключа →
 * ключ → тело → событие (повтор, проверка, отметка удаления, запись). Отказы 400, 401 и 429 — в память, с ними и
 * 503 — в счёт отказов.
 */
export var defineEventsHandler = (intake: Intake) => {
  const unavailable = (): Response => (intake.unavailable(), _disabled());

  const invalid = (
    sender: string,
    id: string | null,
    errors: FieldErrors
  ): Response => (
    intake.refuse({ reason: 'invalid', sender, id, errors }),
    _json(400, { ok: false, errors })
  );

  const receive = (sender: string, request: Request): Promise<Response> =>
    _read(request).then((read) =>
      'error' in read
        ? invalid(sender, null, { body: read.error })
        : ((outcome) =>
            outcome.kind === 'invalid'
              ? invalid(sender, outcome.id, outcome.errors)
              : _answer(outcome))(intake.accept(sender, read.text, 'http'))
    );

  const post = (request: Request, client: string): Promise<Response> =>
    ((wait) =>
      wait !== null
        ? Promise.resolve(
            (intake.refuse({
              reason: 'throttled',
              sender: null,
              id: null,
              errors: {},
            }),
            _json(
              429,
              { ok: false, error: 'throttled' },
              { 'retry-after': String(wait) }
            ))
          )
        : ((sender) =>
            sender === null
              ? Promise.resolve(
                  (intake.refuse({
                    reason: 'unauthorized',
                    sender: null,
                    id: null,
                    errors: {},
                  }),
                  _json(
                    401,
                    { ok: false, error: 'unauthorized' },
                    { 'www-authenticate': 'Bearer' }
                  ))
                )
              : receive(sender, request))(
            intake.authorize(_bearer(request), client)
          ))(intake.throttled(client));

  const _METHODS: Readonly<
    Record<string, (request: Request, client: string) => Promise<Response>>
  > = { POST: post };

  const notAllowed = (): Promise<Response> =>
    Promise.resolve(
      _json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'POST' })
    );

  // Неожиданная ошибка — 500 без подробностей: отправитель повторит с тем же id, в журнал сервера — всё.
  // Приём выключили между проверкой и записью — тот же 503.
  return (request: Request, client: string): Promise<Response> =>
    Promise.resolve()
      .then(() =>
        intake.enabled()
          ? (_METHODS[request.method] ?? notAllowed)(request, client)
          : unavailable()
      )
      .then(undefined, (error) =>
        isDomainError(error) && error.code === 'analytics.disabled'
          ? unavailable()
          : (console.error(error), _json(500, { ok: false, error: 'internal' }))
      );
};
