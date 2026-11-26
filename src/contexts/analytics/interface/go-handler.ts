import type { Labels } from '../application/labels.ts';
import { CODE_LIMITS, isCode } from '../domain/codes.ts';
import { GO_PREFIX } from '../domain/labels.ts';
import type { GoSources } from '../domain/ports.ts';

export { GO_PREFIX };

/**
 * Источники метки перехода от статистики — той же формы, что `stats.go`: корень передаёт её сюда, и аналитика не
 * импортирует `stats`. Нажатие браузера посетителя дня статистика засчитывает целью.
 */
export type GoVisits = (
  link: string,
  request: Request,
  client: string
) => GoSources;

const _METHODS = ['GET', 'HEAD'];

// Ответ не остаётся ни в кэше, ни в поиске; тела нет, cookie нет: чужой сайт получает только адрес с меткой.
const _HEADERS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

const _notAllowed = (): Response =>
  new Response(null, {
    status: 405,
    headers: { ..._HEADERS, allow: _METHODS.join(', ') },
  });

const _redirect = (location: string): Response =>
  new Response(null, { status: 302, headers: { ..._HEADERS, location } });

/**
 * HTTP перехода `GET /_cms/go/<код>` (ADR 0072): `302` к адресу назначения с меткой; null — имя не код или
 * перехода нет, корень отвечает страницей 404 сайта. Бот, HEAD и предзагрузка получают ту же переадресацию — цель
 * им не засчитывается. `Location` — адрес после `URL`: без переводов строк и знаков вне ASCII, годный заголовок.
 */
export var defineGoHandler =
  (labels: Pick<Labels, 'target'>, visits: GoVisits) =>
  (request: Request, client: string): Response | null =>
    !_METHODS.includes(request.method)
      ? _notAllowed()
      : ((code) =>
          isCode(code, CODE_LIMITS.link)
            ? ((target) =>
                target === null
                  ? null
                  : ((url) => (url === null ? null : _redirect(url.href)))(
                      URL.parse(target)
                    ))(labels.target(code, () => visits(code, request, client)))
            : null)(new URL(request.url).pathname.slice(GO_PREFIX.length));
