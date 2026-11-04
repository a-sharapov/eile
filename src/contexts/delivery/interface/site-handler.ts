import {
  type CompressionCache,
  compressBody,
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
import type { EditBar, PageViews, RequestInfo } from '../application/ports.ts';
import { isHtml, responseType } from '../domain/content-type.ts';
import { prefersMarkdown } from '../domain/discovery.ts';

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

// У цели может быть свой query: `/catalog?sort=new` и `?utm=x` → `/catalog?sort=new&utm=x`.
const _withSearch = (location: string, search: string): string =>
  search === ''
    ? location
    : ((hash) =>
        ((base, anchor) =>
          `${base}${base.includes('?') ? `&${search.slice(1)}` : search}${anchor}`)(
          hash < 0 ? location : location.slice(0, hash),
          hash < 0 ? '' : location.slice(hash)
        ))(location.indexOf('#'));

// Параметры, которые узнало правило с query, остаются на старом адресе; остальные (utm) идут дальше.
const _without = (search: string, names: readonly string[]): string =>
  names.length === 0
    ? search
    : ((params) => (
        names.forEach((_) => void params.delete(_)),
        params.size === 0 ? '' : `?${params}`
      ))(new URLSearchParams(search));

const _etag = (html: string): string => `"${Bun.hash(html).toString(36)}"`;

// Полоса — перед последним </body>; нет его — в конец документа.
const _withBar = (html: string, bar: string): string =>
  ((at) => (at < 0 ? html + bar : html.slice(0, at) + bar + html.slice(at)))(
    html.toLowerCase().lastIndexOf('</body>')
  );

const _NO_BAR: EditBar = () => null;

const _NO_VIEWS: PageViews = () => undefined;

// 500 посетителю — и сообщение владельцу: одинаковые ошибки склеиваются, а не адреса.
const _serverError =
  (report: Report, path: string) =>
  (error: unknown): Response => (
    console.error(error),
    report({
      kind: 'site.error',
      severity: 'critical',
      title: {
        en: `The site answered 500 on ${path}`,
        de: `Die Website antwortete 500 auf ${path}`,
        ru: `Сайт ответил 500 на ${path}`,
      },
      detail: errorDetail(error),
      key: errorKey('site.error', error),
    }),
    new Response('Internal Server Error', { status: 500 })
  );

const _badRequest = (): Response =>
  new Response('Bad Request', { status: 400 });

// Страница-файл (SVG, XML, лента), открытая в браузере, скриптов не выполняет — как SVG медиатеки.
// HTML сайта: адрес страницы уходит чужим сайтам только доменом, встроить страницу во фрейм может
// только сам сайт — кликджекинг форм на чужой странице не выйдет.
const _PAGE_POLICY = {
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "frame-ancestors 'self'",
};

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

// Markdown по Accept — на том же адресе, что HTML: кэш различает ответы по Accept. noindex не ставим:
// это адрес самой страницы, а не её копия /путь.md.
const _negotiated = (request: Request, found: Discovered): Response =>
  new Response(request.method === 'HEAD' ? null : found.body, {
    status: found.status,
    headers: {
      'content-type': found.contentType,
      'cache-control': 'no-cache',
      vary: 'accept',
      'x-content-type-options': 'nosniff',
    },
  });

const _markdownPath = (path: string): string =>
  path === '/' ? '/index.md' : `${path}.md`;

export var defineSiteHandler = (
  delivery: PageDelivery,
  compression: CompressionCache,
  discovery: Discovery,
  report: Report = NO_REPORT,
  editBar: EditBar = _NO_BAR,
  views: PageViews = _NO_VIEWS
) => {
  // Страница с полосой правки — только тому, кто вошёл в менеджер: без ETag, общего кэша и сжатия впрок.
  const personalResponse = (
    request: Request,
    page: Page,
    bar: string
  ): Response => {
    const encoding = negotiate(request.headers.get('accept-encoding'));
    const html = _withBar(page.html, bar);
    return new Response(
      request.method === 'HEAD'
        ? null
        : encoding
          ? compressBody(encoding, html)
          : html,
      {
        status: page.status,
        headers: {
          'content-type': responseType(page.contentType),
          'x-content-type-options': 'nosniff',
          'cache-control': 'private, no-store',
          vary: 'accept-encoding, cookie',
          'x-cache': page.cache,
          ...(encoding && { 'content-encoding': encoding }),
          ..._PAGE_POLICY,
        },
      }
    );
  };

  const barOf = (request: Request, page: Page): string | null =>
    page.pageId !== null && isHtml(page.contentType)
      ? editBar(request, { id: page.pageId, status: page.status })
      : null;

  // Просмотр — HTML-страница 200 на GET тому, у кого нет полосы правки: вошедшие в менеджер — не посетители.
  const pageResponse = (
    request: Request,
    page: Page,
    path: string,
    client: string
  ): Response =>
    ((bar) =>
      bar === null
        ? (void (
            request.method === 'GET' &&
            page.status === 200 &&
            page.pageId !== null &&
            isHtml(page.contentType) &&
            views(request, client, { path, language: page.language })
          ),
          sharedResponse(request, page))
        : personalResponse(request, page, bar))(barOf(request, page));

  const sharedResponse = (request: Request, page: Page): Response => {
    // Хэш считается на каждый запрос: 150 КБ — несколько микросекунд. Запоминать его по строке HTML нельзя:
    // у страницы с формой каждый ответ новый, и такой словарь держал бы тысячи документов целиком.
    const etag = _etag(page.html);
    const encoding = negotiate(request.headers.get('accept-encoding'));
    const headers = {
      'content-type': responseType(page.contentType),
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-cache',
      // Тот же адрес отдаёт Markdown агенту, который просит его заголовком Accept.
      vary: isHtml(page.contentType)
        ? 'accept-encoding, accept'
        : 'accept-encoding',
      etag,
      'x-cache': page.cache,
      ...(encoding && { 'content-encoding': encoding }),
      ...(isHtml(page.contentType) ? _PAGE_POLICY : _FILE_POLICY),
    };
    const fresh =
      page.status === 200 && request.headers.get('if-none-match') === etag;
    return fresh
      ? new Response(null, { status: 304, headers })
      : new Response(
          request.method === 'HEAD'
            ? null
            : encoding
              ? page.shared
                ? compression.compress(etag, encoding, page.html)
                : compressBody(encoding, page.html)
              : page.html,
          { status: page.status, headers }
        );
  };

  const redirectResponse = (redirect: Redirect, search: string): Response =>
    new Response(null, {
      status: redirect.status,
      headers: {
        location: _withSearch(
          redirect.external ? redirect.location : encodeURI(redirect.location),
          redirect.query ? _without(search, redirect.consumed ?? []) : ''
        ),
      },
    });

  const respond =
    (request: Request, url: URL, client: string, path: string) =>
    (result: Delivery): Response =>
      result.kind === 'page'
        ? pageResponse(request, result, path, client)
        : redirectResponse(result, url.search);

  /** `client` — адрес посетителя из сервера: для статистики. */
  return (request: Request, client = ''): Promise<Response> => {
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
                    (prefersMarkdown(request.headers.get('accept'))
                      ? (discovery
                          .respond({ ...info, path: _markdownPath(path) })
                          ?.then((_) =>
                            _.status === 200
                              ? _negotiated(request, _)
                              : delivery
                                  .deliver(info)
                                  .then(respond(request, url, client, path))
                          ) ??
                        delivery
                          .deliver(info)
                          .then(respond(request, url, client, path)))
                      : delivery
                          .deliver(info)
                          .then(respond(request, url, client, path)))
                  ).then(undefined, _serverError(report, path)))(
                  _requestInfo(request, url, path)
                ),
              _badRequest
            )
        : Promise.resolve(_methodNotAllowed());
  };
};
