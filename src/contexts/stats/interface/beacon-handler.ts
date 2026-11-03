import { readBody } from '../../../platform/body.ts';
import { attempt } from '../../../shared/kernel/errors.ts';
import type { StatsService } from '../application/stats-service.ts';

// Тело маячка — начало адреса ссылки-цели: не длиннее, чем позволяют настройки (300 знаков в UTF-8).
const _LIMIT = 1200;

const _NO_STORE = { 'cache-control': 'no-store' };

const _plain = (status: number, text: string, headers = {}): Response =>
  new Response(text, { status, headers: { ..._NO_STORE, ...headers } });

const _tooLarge = (): Error =>
  Object.assign(new Error('Beacon body is too large'), { status: 413 });

// Маячок — только со своих страниц: sendBeacon шлёт Origin, а Sec-Fetch-Site у браузеров — same-origin.
const _foreign = (request: Request, siteUrl: string): boolean =>
  ((origin, site) =>
    origin === null ||
    (origin !== new URL(request.url).origin && origin !== site) ||
    (request.headers.get('sec-fetch-site') ?? 'same-origin') !== 'same-origin')(
    request.headers.get('origin'),
    URL.parse(siteUrl)?.origin ?? null
  );

// Не UTF-8 — не начало адреса.
const _text = (bytes: Uint8Array): string | null =>
  attempt(
    () => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    () => null
  );

/**
 * HTTP-вход маячка: `POST /_cms/goal` с началом адреса ссылки-цели текстом. Проверка строгая: только
 * свои страницы, только text/plain, только настроенная цель. Ответ — 204 и тогда, когда переход не
 * засчитан (бот, посетителя сегодня не было): маячку ответ не нужен.
 */
export var defineBeaconHandler =
  (service: StatsService, siteUrl: () => string) =>
  (request: Request, client: string): Promise<Response> =>
    request.method !== 'POST'
      ? Promise.resolve(_plain(405, 'Method Not Allowed', { allow: 'POST' }))
      : service.beaconLinks().length === 0
        ? Promise.resolve(_plain(404, 'Not Found'))
        : _foreign(request, siteUrl())
          ? Promise.resolve(_plain(403, 'Cross-site beacon'))
          : !(request.headers.get('content-type') ?? '').startsWith(
                'text/plain'
              )
            ? Promise.resolve(_plain(415, 'Unsupported Media Type'))
            : readBody(request, _LIMIT, _tooLarge).then(
                (bytes) =>
                  ((prefix) =>
                    prefix === null || !service.beaconLinks().includes(prefix)
                      ? _plain(400, 'Unknown goal')
                      : (service.link(
                          prefix,
                          {
                            header: (name) => request.headers.get(name),
                            url: new URL(request.url),
                          },
                          client
                        ),
                        new Response(null, {
                          status: 204,
                          headers: _NO_STORE,
                        })))(_text(bytes)),
                (error: { status?: number }) =>
                  error?.status === 413
                    ? _plain(413, 'Payload Too Large')
                    : _plain(400, 'Bad Request')
              );
