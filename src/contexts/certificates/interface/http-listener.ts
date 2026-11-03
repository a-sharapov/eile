const _CHALLENGE = '/.well-known/acme-challenge/';

/**
 * Обработчик HTTP-порта рядом с HTTPS:
 * - отдаёт ключи проверки HTTP-01;
 * - когда сертификат есть, переадресует остальное на HTTPS (308 сохраняет метод и тело), кроме путей
 *   `direct`: их сайт отдаёт и по HTTP (проверка здоровья — для мониторов и проверки с этой машины);
 * - пока сертификата нет, отдаёт сам сайт, чтобы он работал с первой минуты.
 *
 * В адресе переадресации — только свои домены: подменённый Host не уведёт посетителя на чужой сайт.
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
                headers: {
                  location: `https://${
                    domains.includes(url.hostname) ? url.hostname : domains[0]
                  }${httpsPort === 443 ? '' : `:${httpsPort}`}${url.pathname}${url.search}`,
                },
              })
            )
          : site(request, server))(new URL(request.url));
