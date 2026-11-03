import { attempt } from '../../../shared/kernel/errors.ts';

/** Старый адрес из списка: как записан, что от него ждут (необязательно) и номер строки. */
export type UrlEntry = {
  readonly input: string;
  /** Куда адрес должен привести: путь или URL; null — любой живой адрес сайта. */
  readonly expected: string | null;
  readonly line: number;
};

/** Один запрос цепочки: адрес, код ответа и куда ведёт Location; status null — ответа нет. */
export type Hop = {
  readonly url: string;
  readonly status: number | null;
  readonly location: string | null;
  readonly error?: string;
};

/**
 * Итог адреса. В порядке: `moved` — один постоянный переход (301/308) и 200; `same` — 200 сразу. Ошибки:
 * `chain` — переходов больше одного; `temporary` — переход 302/303/307; `loop`; `too_many` — переходов
 * больше предела; `external` — переход на другой хост; `not_found` — 404/410; `error` — другой код;
 * `unreachable` — нет ответа; `wrong_target` — 200, но не там, где ждали; `query_ignored` — адрес с query
 * отвечает 200 сам: страницу выбирает путь, а query она не видит (так `/?p=12` молча открывает главную).
 */
export type Outcome =
  | 'moved'
  | 'same'
  | 'chain'
  | 'temporary'
  | 'loop'
  | 'too_many'
  | 'external'
  | 'not_found'
  | 'error'
  | 'unreachable'
  | 'wrong_target'
  | 'query_ignored';

export var OUTCOMES: readonly Outcome[] = [
  'moved',
  'same',
  'not_found',
  'chain',
  'temporary',
  'external',
  'loop',
  'too_many',
  'wrong_target',
  'query_ignored',
  'error',
  'unreachable',
];

const _OK: ReadonlySet<Outcome> = new Set(['moved', 'same']);

/** Что стало с query старого адреса: не было, дошёл до конца, потерялся или изменился. */
export type QueryFate = 'none' | 'kept' | 'dropped' | 'changed';

/** Слэш на конце старого адреса: не было, конечный адрес без него или с ним. */
export type SlashFate = 'none' | 'removed' | 'kept';

export type RedirectResult = {
  readonly input: string;
  readonly line: number;
  /** Старый адрес на проверяемом сайте: путь и query на его origin. */
  readonly url: string;
  readonly expected: string | null;
  readonly hops: readonly Hop[];
  /** Последний адрес цепочки, на который пришёл ответ. */
  readonly final: string;
  readonly status: number | null;
  readonly outcome: Outcome;
  readonly ok: boolean;
  readonly query: QueryFate;
  readonly slash: SlashFate;
};

export type RedirectSummary = {
  readonly total: number;
  readonly ok: number;
  readonly failed: number;
  readonly outcomes: Readonly<Partial<Record<Outcome, number>>>;
  readonly query: Readonly<Record<Exclude<QueryFate, 'none'>, number>>;
  readonly slash: Readonly<Record<Exclude<SlashFate, 'none'>, number>>;
};

const _ARROWS: ReadonlySet<string> = new Set(['->', '→', '=>']);

const _withoutComment = (line: string): string =>
  line.trimStart().startsWith('#') ? '' : line.replace(/\s+#.*$/, '');

/**
 * Список старых адресов текстом: по одному в строке, путь или URL; `#` в начале строки или после пробела —
 * комментарий. Второе слово строки — куда адрес должен вести (`/uber-uns/ /ueber-uns`, можно через `->`).
 */
export var parseUrlList = (text: string): UrlEntry[] =>
  text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .flatMap((raw, index) =>
      ((words) =>
        words.length === 0
          ? []
          : [
              {
                input: words[0]!,
                expected: words[1] ?? null,
                line: index + 1,
              },
            ])(
        _withoutComment(raw)
          .trim()
          .split(/\s+/)
          .filter((_) => _ !== '' && !_ARROWS.has(_))
      )
    );

const _ABSOLUTE = /^https?:\/\//i;

/**
 * Старый адрес — на проверяемый сайт: путь и query, хост старого сайта не в счёт, `#` не уходит на сервер.
 * `uber-uns/` — то же, что `/uber-uns/`.
 */
export var rebase = (input: string, origin: string): string =>
  ((url) => new URL(`${url.pathname}${url.search}`, origin).href)(
    attempt(
      () =>
        new URL(
          _ABSOLUTE.test(input) || input.startsWith('/') ? input : `/${input}`,
          origin
        ),
      // `http://[битый` — не URL: проверяем как путь, сайт ответит на него как ответит.
      () => new URL(`/${input.replace(/^\/+/, '')}`, origin)
    )
  );

/** Одинаковые адреса после переноса на сайт — один раз; ожидание берётся у первого, где оно есть. */
export var uniqueEntries = (
  entries: readonly UrlEntry[],
  origin: string
): (UrlEntry & { readonly url: string })[] =>
  [
    ...Map.groupBy(
      entries.map((_) => ({ ..._, url: rebase(_.input, origin) })),
      (_) => _.url
    ).values(),
  ].map((same) => ({
    ...same[0]!,
    expected: same.find((_) => _.expected !== null)?.expected ?? null,
  }));

/** Переадресация: 3xx с адресом. 300 и 304 — не переход. */
export var isRedirect = (status: number | null): boolean =>
  status !== null && [301, 302, 303, 307, 308].includes(status);

const _PERMANENT: ReadonlySet<number> = new Set([301, 308]);

const _host = (url: string): string => new URL(url).host;

const _params = (url: string): URLSearchParams => new URL(url).searchParams;

const _queryFate = (from: string, to: string): QueryFate =>
  ((before, after) =>
    before.size === 0
      ? 'none'
      : before.toString() === after.toString()
        ? 'kept'
        : [...before].every(({ 0: key, 1: value }) =>
              after.getAll(key).includes(value)
            )
          ? 'kept'
          : [...before.keys()].some((_) => after.has(_))
            ? 'changed'
            : 'dropped')(_params(from), _params(to));

// У корня `/` слэша на конце нет: `/app/` → `/` — слэш убран.
const _slashFate = (from: string, to: string): SlashFate =>
  ((path, target) =>
    path === '/' || !path.endsWith('/')
      ? 'none'
      : target !== '/' && target.endsWith('/')
        ? 'kept'
        : 'removed')(new URL(from).pathname, new URL(to).pathname);

// Ожидаемый адрес совпал: тот же путь; query сравнивается, только если он есть в ожидании.
const _matches = (final: string, expected: string, origin: string): boolean =>
  ((want, got) =>
    want.pathname === got.pathname &&
    (want.search === '' || want.search === got.search))(
    new URL(rebase(expected, origin)),
    new URL(final)
  );

const _outcome = (
  url: string,
  hops: readonly Hop[],
  expected: string | null,
  origin: string
): Outcome => {
  const last = hops.at(-1)!;
  const moves = hops.filter((_) => isRedirect(_.status) && _.location);
  return last.status === null
    ? 'unreachable'
    : isRedirect(last.status) && last.location
      ? hops.some((_) => _.url === last.location)
        ? 'loop'
        : _host(last.location) !== _host(origin)
          ? 'external'
          : 'too_many'
      : last.status === 404 || last.status === 410
        ? 'not_found'
        : last.status !== 200
          ? 'error'
          : expected !== null && !_matches(last.url, expected, origin)
            ? 'wrong_target'
            : moves.length === 0
              ? expected === null && new URL(url).search !== ''
                ? 'query_ignored'
                : 'same'
              : moves.some((_) => !_PERMANENT.has(_.status!))
                ? 'temporary'
                : moves.length > 1
                  ? 'chain'
                  : 'moved';
};

/** Итог адреса по цепочке ответов — без сети: цепочку собирает тот, кто ходит по адресам. */
export var classify = (
  entry: UrlEntry & { readonly url: string },
  hops: readonly Hop[],
  origin: string
): RedirectResult =>
  ((outcome, last) => ({
    input: entry.input,
    line: entry.line,
    url: entry.url,
    expected: entry.expected,
    hops,
    final: last.url,
    status: last.status,
    outcome,
    ok: _OK.has(outcome),
    query: _queryFate(entry.url, last.location ?? last.url),
    slash: _slashFate(entry.url, last.location ?? last.url),
  }))(_outcome(entry.url, hops, entry.expected, origin), hops.at(-1)!);

const _count = <K extends string>(
  keys: readonly K[]
): Readonly<Partial<Record<K, number>>> =>
  keys.reduce<Partial<Record<K, number>>>(
    (acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }),
    {}
  );

export var summarize = (
  results: readonly RedirectResult[]
): RedirectSummary => ({
  total: results.length,
  ok: results.filter((_) => _.ok).length,
  failed: results.filter((_) => !_.ok).length,
  outcomes: _count(results.map((_) => _.outcome)),
  query: {
    kept: 0,
    dropped: 0,
    changed: 0,
    ..._count(results.flatMap((_) => (_.query === 'none' ? [] : [_.query]))),
  },
  slash: {
    removed: 0,
    kept: 0,
    ..._count(results.flatMap((_) => (_.slash === 'none' ? [] : [_.slash]))),
  },
});

/** Адрес для человека: свой — путь с query, чужой — целиком; %-кодировка раскрыта, где можно. */
export var shownUrl = (url: string, origin: string): string =>
  ((parsed) =>
    ((text) =>
      attempt(
        () => decodeURI(text),
        () => text
      ))(
      parsed.host === new URL(origin).host
        ? `${parsed.pathname}${parsed.search}`
        : parsed.href
    ))(new URL(url));
