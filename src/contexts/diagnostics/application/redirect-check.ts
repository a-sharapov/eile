import {
  classify,
  type Hop,
  isRedirect,
  type RedirectResult,
  type RedirectSummary,
  summarize,
  type UrlEntry,
  uniqueEntries,
} from '../domain/redirect-check.ts';

/** Запрос без переадресаций: `app.fetch` на снимке базы или сеть до живого сайта. */
export type Probe = (url: string) => Promise<Response>;

export type RedirectReport = {
  /** Сайт, на котором проверяли: origin, к нему приставлены пути старых адресов. */
  readonly origin: string;
  readonly summary: RedirectSummary;
  readonly results: readonly RedirectResult[];
};

/** Переходов не больше: дальше — уже не цепочка, а поломка. */
export var MAX_HOPS = 10;

// Адресов одновременно: живому сайту не нужна нагрузка от проверки, а последовательно сотня адресов — долго.
const _PARALLEL = 6;

const _message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const _resolve = (location: string, base: string): string | null =>
  URL.canParse(location, base) ? new URL(location, base).href : null;

// По цепочке, пока ответ — переадресация на свой хост, на ещё не пройденный адрес и в пределах MAX_HOPS.
const _follow = (
  probe: Probe,
  origin: string,
  url: string,
  hops: readonly Hop[] = []
): Promise<Hop[]> =>
  Promise.resolve(url)
    .then(probe)
    .then(
      (response): Hop => (
        void response.body?.cancel(),
        {
          url,
          status: response.status,
          location: ((raw) => (raw === null ? null : _resolve(raw, url)))(
            response.headers.get('location')
          ),
        }
      ),
      (error): Hop => ({
        url,
        status: null,
        location: null,
        error: _message(error),
      })
    )
    .then((hop) =>
      ((next) =>
        isRedirect(hop.status) &&
        hop.location !== null &&
        new URL(hop.location).host === new URL(origin).host &&
        !next.some((_) => _.url === hop.location) &&
        next.length < MAX_HOPS
          ? _follow(probe, origin, hop.location, next)
          : next)([...hops, hop])
    );

const _batches = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );

/**
 * Каждый старый адрес — на сайт `origin`: цепочка ответов без переадресаций в fetch, затем итог. Ждём один
 * постоянный переход (301/308) и 200 на своём хосте; цепочки, петли, 302, 404 и уход на другой хост — ошибки.
 */
export var checkRedirects = ({
  probe,
  origin,
  entries,
}: {
  probe: Probe;
  origin: string;
  entries: readonly UrlEntry[];
}): Promise<RedirectReport> =>
  ((unique) =>
    _batches(unique, _PARALLEL)
      .reduce<Promise<RedirectResult[]>>(
        (done, batch) =>
          done.then((results) =>
            Promise.all(
              batch.map((entry) =>
                _follow(probe, origin, entry.url).then((hops) =>
                  classify(entry, hops, origin)
                )
              )
            ).then((more) => [...results, ...more])
          ),
        Promise.resolve([])
      )
      .then((results) => ({
        origin,
        summary: summarize(results),
        results,
      })))(uniqueEntries(entries, origin));
