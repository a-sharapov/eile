import {
  type CompressionCache,
  negotiate,
} from '../../../platform/compression.ts';
import { attempt } from '../../../shared/kernel/errors.ts';
import {
  errorDetail,
  errorKey,
  NO_REPORT,
  type Report,
} from '../../../shared/kernel/report.ts';
import type { Discovered, Discovery } from '../application/discovery.ts';
import type { Delivery, PageDelivery } from '../application/page-delivery.ts';
import type { RequestInfo } from '../application/ports.ts';
import { isHtml, responseType } from '../domain/content-type.ts';

const _METHODS = ['GET', 'HEAD'];

type Page = Extract<Delivery, { kind: 'page' }>;
type Redirect = Extract<Delivery, { kind: 'redirect' }>;

const _decoded = (value: string): string =>
  attempt(
    () => decodeURIComponent(value),
    () => value
  );

const _cookies = (header: string | null): ReadonlyMap<string, string> =>
  new Map(
    (header ?? '')
      .split(';')
      .map((_) => _.trim())
      .filter((_) => _.includes('='))
      .map((_) => [
        _.slice(0, _.indexOf('=')).trim(),
        _decoded(_.slice(_.indexOf('=') + 1).trim()),
      ])
  );

// Cookie и query разбираются при первом обращении: страница из кэша их обычно не читает.
const _requestInfo = (
  request: Request,
  url: URL,
  path: string
): RequestInfo => {
  let cookies: ReadonlyMap<string, string> | null = null;
  let query: Readonly<Record<string, string>> | null = null;
  return {
    path,
    origin: url.origin,
    get query() {
      return query ?? (query = Object.fromEntries(url.searchParams));
    },
    header: (name) => request.headers.get(name),
    cookie: (name) =>
      (cookies ?? (cookies = _cookies(request.headers.get('cookie')))).get(
        name
      ) ?? null,
  };
};

const _etag = (html: string): string => `"${Bun.hash(html).toString(36)}"`;

const _ETAGS_LIMIT = 8192;

// 500 посетителю — и сообщение владельцу: одинаковые ошибки склеиваются, а не адреса.
const _serverError =
  (report: Report, path: string) =>
  (error: unknown): Response => (
    console.error(error),
    report({
      kind: 'site.error',
      severity: 'critical',
      title: `Сайт ответил 500 на ${path}`,
      detail: errorDetail(error),
      key: errorKey('site.error', error),
    }),
    new Response('Internal Server Error', { status: 500 })
  );

const _badRequest = (): Response =>
  new Response('Bad Request', { status: 400 });

// Страница-файл (SVG, XML, лента), открытая в браузере, скриптов не выполняет — как SVG медиатеки.
const _FILE_POLICY = {
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

// Service worker из страницы-файла захватил бы весь адрес, включая менеджер: такие запросы не отдаём.
const _workerRefused = (): Response =>
  new Response('Not Found', { status: 404 });

const _methodNotAllowed = (): Response =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: _METHODS.join(', ') },
  });

/** HTTP-вход публичного сайта: ETag и 304, сжатие, заголовок `x-cache`. */
const _discovered = (request: Request, found: Discovered): Response =>
  new Response(request.method === 'HEAD' ? null : found.body, {
    status: found.status,
    headers: {
      'content-type': found.contentType,
      'cache-control': 'no-cache',
      'x-robots-tag': 'noindex',
    },
  });

export var defineSiteHandler = (
  delivery: PageDelivery,
  compression: CompressionCache,
  discovery: Discovery,
  report: Report = NO_REPORT
) => {
  // У страницы из кэша HTML — одна и та же строка: её хэш для ETag считаем один раз, а не на каждый запрос.
  const etags = new Map<string, string>();

  const etagOf = (page: Page): string =>
    page.cache !== 'hit'
      ? _etag(page.html)
      : (etags.get(page.html) ??
        ((etag) => (
          etags.size >= _ETAGS_LIMIT &&
            etags.delete(etags.keys().next().value!),
          etags.set(page.html, etag),
          etag
        ))(_etag(page.html)));

  const pageResponse = (request: Request, page: Page): Response => {
    const etag = etagOf(page);
    const encoding = negotiate(request.headers.get('accept-encoding'));
    const headers = {
      'content-type': responseType(page.contentType),
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-cache',
      vary: 'accept-encoding',
      etag,
      'x-cache': page.cache,
      ...(encoding && { 'content-encoding': encoding }),
      ...(!isHtml(page.contentType) && _FILE_POLICY),
    };
    const fresh =
      page.status === 200 && request.headers.get('if-none-match') === etag;
    return fresh
      ? new Response(null, { status: 304, headers })
      : new Response(
          request.method === 'HEAD'
            ? null
            : encoding
              ? compression.compress(etag, encoding, page.html)
              : page.html,
          { status: page.status, headers }
        );
  };

  const redirectResponse = (redirect: Redirect, search: string): Response =>
    new Response(null, {
      status: 301,
      headers: {
        location: redirect.external
          ? redirect.location
          : encodeURI(redirect.location) + search,
      },
    });

  const respond =
    (request: Request, url: URL) =>
    (result: Delivery): Response =>
      result.kind === 'page'
        ? pageResponse(request, result)
        : redirectResponse(result, url.search);

  return (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    return request.headers.get('service-worker') === 'script'
      ? Promise.resolve(_workerRefused())
      : _METHODS.includes(request.method)
        ? Promise.resolve(url.pathname)
            .then(decodeURIComponent)
            .then(
              (path) =>
                ((info) =>
                  (
                    discovery
                      .respond(info)
                      ?.then((_) => _discovered(request, _)) ??
                    delivery.deliver(info).then(respond(request, url))
                  ).then(undefined, _serverError(report, path)))(
                  _requestInfo(request, url, path)
                ),
              _badRequest
            )
        : Promise.resolve(_methodNotAllowed());
  };
};
