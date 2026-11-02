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
import type { UploadedFile } from '../domain/ports.ts';
import type { Posted } from '../domain/schema.ts';
import { ENHANCE_SCRIPT, ENHANCE_URL } from '../infrastructure/enhance.ts';

/** Приём форм и их скрипт: `/_cms/forms/<имя>`. */
export var FORMS_PREFIX = '/_cms/forms/';

// Тело формы без файлов — до 64 КБ; с файлами (multipart) — до 50 МБ на все файлы заявки.
const _LIMIT = 64 * 1024;
const _MULTIPART_LIMIT = 50 * 1024 * 1024;

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
const _counting = (limit: number): TransformStream<Uint8Array, Uint8Array> => {
  let size = 0;
  return new TransformStream({
    transform: (chunk, controller) =>
      (size += chunk.byteLength) > limit
        ? controller.error(_tooLarge())
        : controller.enqueue(chunk),
  });
};

const _strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .filter((_) => typeof _ === 'string' || typeof _ === 'number')
    .map(String);

type Body = {
  readonly posted: Posted;
  readonly files: Readonly<Record<string, readonly UploadedFile[]>>;
};

const _append = <T>(
  all: Readonly<Record<string, readonly T[]>>,
  name: string,
  value: T
): Record<string, readonly T[]> => ({
  ...all,
  [name]: [...(all[name] ?? []), value],
});

// FormData того же рода, что отдаёт Response: у Bun и у DOM типы разные.
type _Form = Awaited<ReturnType<Response['formData']>>;

// Поля формы и её файлы: строки — в значения, файлы — с содержимым, по имени поля.
const _formData = (form: _Form): Promise<Body> =>
  Promise.all(
    [...form].map(({ 0: name, 1: value }) =>
      typeof value === 'string'
        ? Promise.resolve({ name, value })
        : value.bytes().then((bytes) => ({
            name,
            file: {
              name: value.name,
              type: value.type,
              size: bytes.byteLength,
              bytes,
            },
          }))
    )
  ).then((entries) =>
    entries.reduce<{
      posted: Record<string, readonly string[]>;
      files: Record<string, readonly UploadedFile[]>;
    }>(
      (body, entry) =>
        'value' in entry
          ? { ...body, posted: _append(body.posted, entry.name, entry.value) }
          : {
              ...body,
              files: _append<UploadedFile>(body.files, entry.name, entry.file),
            },
      { posted: {}, files: {} }
    )
  );

// Тело — JSON от скрипта, обычная форма или multipart с файлами; multipart читается сразу в FormData,
// без промежуточной копии всего тела.
const _body = (request: Request, limit: number): Promise<Body> =>
  ((type) =>
    Number(request.headers.get('content-length') ?? 0) > limit
      ? Promise.reject(_tooLarge())
      : ((stream) =>
          type.includes('multipart/form-data')
            ? stream.formData().then(_formData)
            : stream.arrayBuffer().then((body) =>
                type.includes('application/json')
                  ? Promise.resolve(
                      JSON.parse(new TextDecoder().decode(body))
                    ).then((data: unknown) => ({
                      posted: Object.fromEntries(
                        Object.entries(
                          data && typeof data === 'object' ? data : {}
                        ).map(({ 0: name, 1: value }) => [
                          name,
                          _strings(value),
                        ])
                      ),
                      files: {},
                    }))
                  : new Response(body, { headers: { 'content-type': type } })
                      .formData()
                      .then(_formData)
              ))(
          new Response(request.body?.pipeThrough(_counting(limit)) ?? null, {
            headers: { 'content-type': type },
          })
        ))(request.headers.get('content-type') ?? '');

// Больших тел с файлами одновременно — не больше четырёх: память сервера не резиновая.
const _MAX_UPLOADS = 4;
let _uploads = 0;

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
      title: {
        en: `Form ${name} does not accept submissions`,
        de: `Formular ${name} nimmt keine Anfragen an`,
        ru: `Форма ${name} не принимает заявки`,
      },
      detail: errorDetail(error),
      key: errorKey(`forms.submit_failed:${name}`, error),
    }),
    _plain(500, 'Internal Server Error')
  );

// До чтения тела: несуществующая форма — 404, большое тело — только форме с файлами, только в пределах
// частоты отправок и числа одновременных загрузок.
const _accept = (
  service: FormsService,
  request: Request,
  name: string,
  client: string
): Promise<Body> =>
  ((intake, multipart) =>
    intake === 'missing'
      ? Promise.reject(_status(404))
      : intake === 'files' && multipart
        ? _uploads >= _MAX_UPLOADS
          ? Promise.reject(_status(503))
          : (_uploads++,
            _body(request, _MULTIPART_LIMIT).finally(() => void _uploads--))
        : intake === 'limited' && multipart
          ? Promise.reject(_status(429))
          : _body(request, _LIMIT))(
    service.intake(name, client),
    (request.headers.get('content-type') ?? '').includes('multipart/form-data')
  );

// Cookie запроса с заявкой: значения скрытых полей `cookie:имя` сервер берёт отсюда, а не из присланного.
const _cookies = (request: Request): ((name: string) => string | null) =>
  (
    (jar) => (name: string) =>
      jar.get(name)
  )(new Bun.CookieMap(request.headers.get('cookie') ?? ''));

const _status = (status: number): Error =>
  Object.assign(new Error(), { status });

const _REJECTED: Readonly<Record<number, string>> = {
  404: 'Not Found',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  503: 'Busy, try again in a few seconds',
};

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
          : _accept(service, request, name, client)
              .then(
                ({ posted, files }) =>
                  ((result) =>
                    (request.headers.get('accept') ?? '').includes(
                      'application/json'
                    )
                      ? _json(result)
                      : _redirect(request, name, posted, result))(
                    service.submit(name, {
                      fields: posted,
                      files,
                      ip: client,
                      userAgent: request.headers.get('user-agent') ?? '',
                      cookie: _cookies(request),
                    })
                  ),
                (error: { status?: number }) =>
                  ((status) =>
                    new Response(_REJECTED[status] ?? 'Bad Request', {
                      status,
                      headers: {
                        ..._NO_STORE,
                        ...(status === 503 ? { 'retry-after': '5' } : {}),
                      },
                    }))(
                    error?.status && error.status in _REJECTED
                      ? error.status
                      : 400
                  )
              )
              .then(undefined, _failed(report, name));
  };
