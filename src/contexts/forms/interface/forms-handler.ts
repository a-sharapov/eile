import {
  errorDetail,
  errorKey,
  type Report,
} from '../../../shared/kernel/report.ts';
import {
  encodeFlash,
  FLASH_COOKIE,
  type FormsService,
  type SubmitResult,
} from '../application/forms-service.ts';
import type { Posted } from '../domain/schema.ts';
import { ENHANCE_SCRIPT, ENHANCE_URL } from '../infrastructure/enhance.ts';

/** Приём форм и их скрипт: `/_cms/forms/<имя>`. */
export var FORMS_PREFIX = '/_cms/forms/';

const _LIMIT = 64 * 1024;

type Kind = SubmitResult['kind'];

const _STATUS: Readonly<Record<Kind, number>> = {
  sent: 200,
  invalid: 422,
  stale: 409,
  wait: 429,
  missing: 404,
};

const _NO_STORE = { 'cache-control': 'no-store' };

const _tooLarge = (): Error =>
  Object.assign(new Error('Request body is too large'), { status: 413 });

// Счётчик байтов в потоке: ни ложный Content-Length, ни chunked не протащат больше потолка.
const _counting = (): TransformStream<Uint8Array, Uint8Array> => {
  let size = 0;
  return new TransformStream({
    transform: (chunk, controller) =>
      (size += chunk.byteLength) > _LIMIT
        ? controller.error(_tooLarge())
        : controller.enqueue(chunk),
  });
};

const _strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .filter((_) => typeof _ === 'string' || typeof _ === 'number')
    .map(String);

// Тело — JSON от скрипта или обычная форма; файлы не принимаются.
const _posted = (request: Request): Promise<Posted> =>
  Number(request.headers.get('content-length') ?? 0) > _LIMIT
    ? Promise.reject(_tooLarge())
    : new Response(request.body?.pipeThrough(_counting()) ?? null, {
        headers: { 'content-type': request.headers.get('content-type') ?? '' },
      })
        .arrayBuffer()
        .then((body) =>
          (request.headers.get('content-type') ?? '').includes(
            'application/json'
          )
            ? Promise.resolve(JSON.parse(new TextDecoder().decode(body))).then(
                (data: unknown) =>
                  Object.fromEntries(
                    Object.entries(
                      data && typeof data === 'object' ? data : {}
                    ).map(({ 0: name, 1: value }) => [name, _strings(value)])
                  )
              )
            : new Response(body, {
                headers: {
                  'content-type': request.headers.get('content-type') ?? '',
                },
              })
                .formData()
                .then((form) =>
                  [...form].reduce<Record<string, string[]>>(
                    (all, { 0: name, 1: value }) =>
                      typeof value === 'string'
                        ? { ...all, [name]: [...(all[name] ?? []), value] }
                        : all,
                    {}
                  )
                )
        );

// Форму с чужого сайта не принимаем: браузер честно говорит, откуда запрос.
const _foreign = (request: Request, siteUrl: string): boolean => {
  const origin = request.headers.get('origin');
  const own = new URL(request.url).origin;
  return (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin !== null && origin !== own && origin !== siteUrl)
  );
};

const _json = (result: SubmitResult): Response =>
  Response.json(
    result.kind === 'sent'
      ? {
          ok: true,
          message: result.message,
          redirect: result.redirect,
          goal: result.goal,
        }
      : result.kind === 'invalid'
        ? { ok: false, message: result.message, errors: result.errors }
        : result.kind === 'stale'
          ? { ok: false, message: result.message, stamp: result.stamp }
          : result.kind === 'wait'
            ? { ok: false, message: result.message }
            : { ok: false, message: 'Form not found' },
    { status: _STATUS[result.kind], headers: _NO_STORE }
  );

const _cookie = (request: Request, value: string, maxAge: number): string =>
  new Bun.Cookie(FLASH_COOKIE, value, {
    path: '/',
    maxAge,
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(request.url).protocol === 'https:',
  }).serialize();

// Без JS — переход обратно (Post/Redirect/Get): F5 не отправит форму второй раз.
const _redirect = (
  request: Request,
  name: string,
  posted: Posted,
  result: SubmitResult
): Response =>
  result.kind === 'missing'
    ? new Response('Not Found', { status: 404 })
    : new Response(null, {
        status: 303,
        headers: {
          ..._NO_STORE,
          location:
            result.kind === 'sent'
              ? (result.redirect ??
                `${encodeURI(result.back)}?sent=${name}#form-${name}`)
              : `${encodeURI(result.back)}#form-${name}`,
          'set-cookie':
            result.kind === 'sent'
              ? _cookie(request, '', 0)
              : _cookie(
                  request,
                  encodeFlash({
                    form: name,
                    values: posted,
                    errors: result.kind === 'invalid' ? result.errors : {},
                    message: result.message,
                  }),
                  120
                ),
        },
      });

const _script = (): Response =>
  new Response(ENHANCE_SCRIPT, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });

const _plain = (status: number, text: string): Response =>
  new Response(text, { status, headers: _NO_STORE });

// Заявка не сохранилась — это сбой, о котором владелец сайта должен узнать сразу.
const _failed =
  (report: Report, name: string) =>
  (error: unknown): Response => (
    console.error(error),
    report({
      kind: 'forms.submit_failed',
      severity: 'critical',
      title: `Форма ${name} не принимает заявки`,
      detail: errorDetail(error),
      key: errorKey(`forms.submit_failed:${name}`, error),
    }),
    _plain(500, 'Internal Server Error')
  );

/** HTTP-вход форм: приём заявки, скрипт улучшения. `client` — адрес посетителя для лимита. */
export var defineFormsHandler =
  (service: FormsService, siteUrl: () => string, report: Report) =>
  (request: Request, client: string): Promise<Response> => {
    const url = new URL(request.url);
    const name = url.pathname.slice(FORMS_PREFIX.length);
    return url.pathname === ENHANCE_URL
      ? Promise.resolve(_script())
      : request.method !== 'POST'
        ? Promise.resolve(
            new Response('Method Not Allowed', {
              status: 405,
              headers: { allow: 'POST' },
            })
          )
        : _foreign(request, siteUrl())
          ? Promise.resolve(_plain(403, 'Cross-site form submission'))
          : _posted(request)
              .then(
                (posted) =>
                  ((result) =>
                    (request.headers.get('accept') ?? '').includes(
                      'application/json'
                    )
                      ? _json(result)
                      : _redirect(request, name, posted, result))(
                    service.submit(name, {
                      fields: posted,
                      ip: client,
                      userAgent: request.headers.get('user-agent') ?? '',
                    })
                  ),
                (error: { status?: number }) =>
                  _plain(error?.status === 413 ? 413 : 400, 'Bad Request')
              )
              .then(undefined, _failed(report, name));
  };
