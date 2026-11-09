import { readBody } from '../../../platform/body.ts';
import type { RequestBody } from '../domain/ports.ts';

/** 64 КБ — как у формы без файлов (ADR 0021): JSON заявки, ответ платёжной системы. */
export var PLUGIN_BODY_LIMIT = 64 * 1024;

const _TOO_LARGE = 'extensions.body_too_large';

const _tooLarge = (): Error => new Error(_TOO_LARGE);

// Тело больше предела — 413 до плагина, оборванное посетителем — 400: читать плагину нечего.
const _refused = (error: unknown): Response =>
  error instanceof Error && error.message === _TOO_LARGE
    ? new Response('Payload Too Large', { status: 413 })
    : new Response('Bad Request', { status: 400 });

/**
 * Тело запроса к плагину — одним буфером не больше `limit` (по Content-Length сразу, chunked — по ходу), как у
 * приёма форм: 2 ГиБ, которые Bun.serve пропускает ради восстановления копии, до плагина не дойдут.
 */
export var bufferedBody =
  (limit = PLUGIN_BODY_LIMIT): RequestBody =>
  (request) =>
    request.body === null
      ? Promise.resolve(request)
      : readBody(request, limit, _tooLarge).then(
          (bytes) =>
            new Request(request.url, {
              method: request.method,
              headers: request.headers,
              body: bytes,
            }),
          _refused
        );
