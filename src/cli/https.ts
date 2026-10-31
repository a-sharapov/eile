import type { App } from '../app.ts';
import {
  type Certificate,
  defineHttpListener,
  valid,
} from '../contexts/certificates/index.ts';
import { attempt } from '../shared/kernel/errors.ts';

type Server = ReturnType<typeof Bun.serve>;

/** Общие настройки обоих слушателей: потолок тела, без страницы ошибки Bun. */
export type ServeBase = {
  readonly maxRequestBodySize: number;
  readonly development: false;
  readonly error: (error: Error) => Response;
};

export type Secure = {
  readonly http: Server;
  /** Есть ли сейчас HTTPS. */
  readonly secured: () => boolean;
  readonly stop: () => void;
};

// По HTTPS браузер запоминает на год: этот сайт — только по HTTPS, даже если набрали http://.
const _HSTS = 'max-age=31536000';

/** Ответ по HTTPS — с HSTS; у ответа с неизменяемыми заголовками он просто без него. */
export var withHsts =
  (fetch: App['fetch']) =>
  (...args: Parameters<App['fetch']>): Promise<Response> =>
    Promise.resolve(fetch(...args)).then(
      (response) => (
        attempt(
          () => response.headers.set('strict-transport-security', _HSTS),
          () => undefined
        ),
        response
      )
    );

/**
 * HTTPS без прокси: HTTP-порт отвечает на проверку HTTP-01 и ведёт на HTTPS, HTTPS встаёт, как только
 * есть действующий сертификат. Пока его нет (и если он истёк), сайт открывается по HTTP.
 *
 * Новый сертификат — новый слушатель рядом со старым на том же порту (`reusePort`): старый дорабатывает
 * начатые запросы и уходит. `server.reload` сертификат не меняет — проверено на Bun 1.4.4.
 */
export var serveSecure = ({
  app,
  domains,
  port,
  httpsPort,
  base,
  issued,
  failed,
}: {
  app: App;
  domains: readonly string[];
  port: number;
  httpsPort: number;
  base: ServeBase;
  issued: (certificate: Certificate) => void;
  failed: (error: string) => void;
}): Secure => {
  let secure: Server | null = null;

  const listen = (certificate: Certificate): Server =>
    Bun.serve({
      ...base,
      port: httpsPort,
      reusePort: true,
      tls: { cert: certificate.chain, key: certificate.key },
      fetch: withHsts(app.fetch),
    });

  // Где порт делить нельзя, старый слушатель уходит раньше, чем встаёт новый.
  const swap = (certificate: Certificate): void => {
    const previous = secure;
    secure = attempt(
      () => listen(certificate),
      () => (previous?.stop(), listen(certificate))
    );
    previous?.stop();
  };

  ((current) => void (valid(current, new Date()) && swap(current!)))(
    app.certificates.current()
  );

  const http = Bun.serve({
    ...base,
    port,
    fetch: defineHttpListener({
      domains,
      httpsPort,
      challenge: app.certificates.challenge,
      secured: () => secure !== null,
      site: app.fetch,
    }),
  });

  const stopRenewal = app.certificates.start(
    (certificate) => (swap(certificate), issued(certificate)),
    failed
  );

  return {
    http,
    secured: () => secure !== null,
    stop: () => (stopRenewal(), http.stop(), secure?.stop()),
  };
};

/** Адрес сайта по HTTPS: основной домен и порт, если он не 443. */
export var httpsUrl = (domains: readonly string[], httpsPort: number): string =>
  `https://${domains[0]}${httpsPort === 443 ? '' : `:${httpsPort}`}/`;
