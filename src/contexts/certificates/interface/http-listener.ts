import { redirectsToPrimary } from '../domain/certificate.ts';

const _CHALLENGE = '/.well-known/acme-challenge/';

// Постоянную переадресацию браузер помнит без срока. Сутки — чтобы смена основного домена (другой порядок
// в --domain) не зациклила тех, кто уже заходил на дополнительный: запись в их кэше уйдёт сама.
const _REMEMBER = 'max-age=86400';

const _onPrimary = (
  domains: readonly string[],
  httpsPort: number,
  url: URL
): string =>
  `https://${domains[0]}${httpsPort === 443 ? '' : `:${httpsPort}`}${url.pathname}${url.search}`;

/**
 * Обработчик HTTP-порта рядом с HTTPS:
 * - отдаёт ключи проверки HTTP-01 на любом домене;
 * - когда сертификат есть, переадресует остальное на HTTPS основного домена (308 сохраняет метод и тело),
 *   кроме путей `direct`: их сайт отдаёт и по HTTP (проверка здоровья — для мониторов и проверки с этой
 *   машины);
 * - пока сертификата нет, отдаёт сам сайт на любом домене, чтобы он работал с первой минуты.
 *
 * Переадресация ведёт всегда на основной домен: с дополнительного — сразу, без шага через его HTTPS, а
 * подменённый Host не уведёт посетителя на чужой сайт.
 */
export var defineHttpListener =
  <Server>({
    domains,
    httpsPort,
    challenge,
    secured,
    site,
    direct = [],
  }: {
    domains: readonly string[];
    httpsPort: number;
    challenge: (token: string) => string | null;
    secured: () => boolean;
    site: (request: Request, server?: Server) => Promise<Response>;
    direct?: readonly string[];
  }) =>
  (request: Request, server?: Server): Promise<Response> =>
    ((url) =>
      url.pathname.startsWith(_CHALLENGE)
        ? Promise.resolve(
            ((answer) =>
              answer === null
                ? new Response('Not Found', { status: 404 })
                : new Response(answer, {
                    headers: { 'content-type': 'text/plain' },
                  }))(challenge(url.pathname.slice(_CHALLENGE.length)))
          )
        : secured() && !direct.includes(url.pathname)
          ? Promise.resolve(
              new Response(null, {
                status: 308,
                headers: { location: _onPrimary(domains, httpsPort, url) },
              })
            )
          : site(request, server))(new URL(request.url));

/**
 * Обработчик HTTPS-порта: запрос на дополнительный домен из --domain или на любой чужой домен, наведённый на
 * этот сервер, переадресуется на тот же путь и query основного (308 сохраняет метод и тело). Основной домен,
 * IP, localhost и пути `direct` идут в сайт как есть.
 */
export var defineHttpsListener =
  <Server>({
    domains,
    httpsPort,
    site,
    direct = [],
  }: {
    domains: readonly string[];
    httpsPort: number;
    site: (request: Request, server?: Server) => Promise<Response>;
    direct?: readonly string[];
  }) =>
  (request: Request, server?: Server): Promise<Response> =>
    ((url) =>
      redirectsToPrimary(domains, url.hostname) &&
      !direct.includes(url.pathname)
        ? Promise.resolve(
            new Response(null, {
              status: 308,
              headers: {
                location: _onPrimary(domains, httpsPort, url),
                'cache-control': _REMEMBER,
              },
            })
          )
        : site(request, server))(new URL(request.url));
