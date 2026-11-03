import type { Database } from './platform/database.ts';
import { attempt } from './shared/kernel/errors.ts';

/** Проверка здоровья для мониторов: 200 — сервер читает базу, 503 — нет. */
export var HEALTH_PATH = '/_cms/health';

const _HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
};

const _LOOPBACK = /^(?:127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/;

// Эти заголовки ставит прокси: запрос пришёл с петли, но не с этой машины.
const _FORWARDED = ['forwarded', 'x-forwarded-for', 'x-real-ip'];

/** Адрес петли: 127.0.0.0/8 и ::1, в том числе в виде IPv6 для IPv4. */
export var isLoopback = (address: string): boolean => _LOOPBACK.test(address);

/** Запрос к проверке здоровья: путь ровно `/_cms/health`, query не в счёт. */
export var isHealthRequest = (url: string): boolean =>
  url.includes(HEALTH_PATH) && new URL(url).pathname === HEALTH_PATH;

const _body = (status: string, version: string | null): string =>
  JSON.stringify(version === null ? { status } : { status, version });

/**
 * `GET /_cms/health` без входа и кэша. База отвечает на чтение — 200 `{"status":"ok"}`, нет — 503
 * `{"status":"unavailable"}`. Версию видит только запрос прямо с этой машины: с петли, без заголовков прокси
 * и у сервера не за прокси (за прокси с петли приходит каждый посетитель). `proxied` — сервер за прокси.
 */
export var defineHealth = ({
  db,
  version,
  proxied,
}: {
  db: Database;
  version: string;
  proxied: boolean;
}) => {
  const probe = db.query('SELECT id FROM _migrations LIMIT 1');
  const readable = (): boolean =>
    attempt(
      () => (probe.get(), true),
      () => false
    );
  const direct = (request: Request, peer: string): boolean =>
    !proxied &&
    isLoopback(peer) &&
    _FORWARDED.every((_) => !request.headers.has(_));
  return (request: Request, peer: string): Response =>
    request.method === 'GET' || request.method === 'HEAD'
      ? ((ok) =>
          new Response(
            request.method === 'HEAD'
              ? null
              : _body(
                  ok ? 'ok' : 'unavailable',
                  direct(request, peer) ? version : null
                ),
            { status: ok ? 200 : 503, headers: _HEADERS }
          ))(readable())
      : new Response(null, {
          status: 405,
          headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' },
        });
};
