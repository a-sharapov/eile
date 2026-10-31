import type { SearchService } from '../application/search-service.ts';

/** Поиск для островов и своих скриптов: `GET /_cms/search?q=…`, ответ — JSON. */
export var SEARCH_PATH = '/_cms/search';

// Запросов в минуту с одного адреса: поиск дороже страницы из кэша, перебор им не устроить.
const _PER_MINUTE = 60;
const _MAX_CLIENTS = 10_000;

const _json = (
  status: number,
  body: unknown,
  extra: Readonly<Record<string, string>> = {}
) =>
  Response.json(body, {
    status,
    headers: {
      // Выдача зависит от запроса: ни браузер, ни прокси её не хранят; поисковикам она не нужна.
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...extra,
    },
  });

const _int = (value: string | null): number | null =>
  value !== null && /^\d{1,9}$/.test(value) ? Number(value) : null;

export var defineSearchHandler = ({
  search,
  urlOf,
  language,
  now = Date.now,
}: {
  search: SearchService['search'];
  /** Адрес опубликованной страницы; null — её уже нет. */
  urlOf: (id: number) => string | null;
  /** Язык выдачи по умолчанию — язык сайта. */
  language: () => string;
  now?: () => number;
}) => {
  // Окно в минуту на адрес: начало окна и сколько запросов в нём.
  const windows = new Map<string, { start: number; count: number }>();

  const allowed = (client: string): boolean => {
    const at = now();
    const window = windows.get(client);
    const current =
      window && at - window.start < 60_000
        ? { start: window.start, count: window.count + 1 }
        : { start: at, count: 1 };
    void (windows.size >= _MAX_CLIENTS && windows.clear());
    windows.set(client, current);
    return current.count <= _PER_MINUTE;
  };

  const answer = (url: URL): Response =>
    ((params) =>
      ((limit, page) =>
        ((result) =>
          _json(200, {
            query: result.query,
            total: result.total,
            page,
            items: result.hits.flatMap((_) =>
              ((href) =>
                href === null
                  ? []
                  : [
                      {
                        id: _.id,
                        title: _.title,
                        url: href,
                        snippet: _.snippet,
                      },
                    ])(urlOf(_.id))
            ),
          }))(
          search(params.get('q') ?? '', {
            language: params.get('lang')?.slice(0, 35) || language(),
            parent: _int(params.get('parent')),
            limit,
            offset: (page - 1) * limit,
          })
        ))(
        Math.min(20, Math.max(1, _int(params.get('limit')) ?? 10)),
        Math.max(1, _int(params.get('page')) ?? 1)
      ))(url.searchParams);

  return {
    handle: (request: Request, client: string): Response =>
      request.method !== 'GET' && request.method !== 'HEAD'
        ? _json(405, { error: 'method' }, { allow: 'GET, HEAD' })
        : allowed(client)
          ? answer(new URL(request.url))
          : _json(429, { error: 'too_many_requests' }, { 'retry-after': '60' }),
  };
};
