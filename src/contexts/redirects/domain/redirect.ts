import { fail } from '../../../shared/kernel/errors.ts';

export type RedirectStatus = 301 | 302;

/**
 * Правило переадресации. `from` — точный адрес или префикс со звёздочкой (`/blog/*`), `to` — адрес,
 * полный URL или страница `[~12~]`: такая цель идёт за страницей, куда бы её ни перенесли. У цели может
 * быть якорь `#…`. Звёздочка в `to` получает остаток адреса после префикса.
 */
export type RedirectRule = {
  readonly id: number;
  readonly from: string;
  readonly to: string;
  readonly status: RedirectStatus;
  readonly note: string;
  readonly hits: number;
  readonly lastHitAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RuleInput = {
  readonly from: string;
  readonly to: string;
  readonly status?: number;
  readonly note?: string;
};

/** Проверенное правило без счётчиков: то, что пишется в базу. */
export type RuleDraft = {
  readonly from: string;
  readonly to: string;
  readonly status: RedirectStatus;
  readonly note: string;
};

/** Куда ведёт подошедшее правило: адрес, URL или страница `[~id~]`. */
export type RuleMatch = {
  readonly id: number;
  readonly to: string;
  readonly status: RedirectStatus;
  /** Параметры query, которые узнало правило с query: в адрес цели они не переходят. */
  readonly consumed?: readonly string[];
};

export type RedirectsEvent = {
  readonly type: 'redirects.rules_changed';
};

// Эти адреса до сайта не доходят: их забирают менеджер, служебные файлы и медиатека.
const _RESERVED = ['/manager', '/_cms', '/media'];
// Страница, можно с якорем: `[~12~]#sec`. Звёздочки у цели-страницы не бывает.
const _PAGE = /^\[~([1-9]\d{0,9})~\](?:#[^\s*]*)?$/;
const _URL = /^https?:\/\/[^\s/?#]+[^\s]*$/i;
const _MAX_PATH = 2048;
const _MAX_NOTE = 200;

const _segments = (path: string): string[] => path.split('/').filter(Boolean);

const _unsafe = (segment: string): boolean =>
  segment === '.' || segment === '..' || segment.includes('\0');

// `/a//b/` → `/a/b`; null — путь не может вести на страницу.
const _canonical = (path: string): string | null =>
  ((segments) => (segments.some(_unsafe) ? null : `/${segments.join('/')}`))(
    _segments(path)
  );

/** Префикс правила `/blog/*` → `/blog`; у точного адреса и у правила с query префикса нет. */
export var prefixOf = (from: string): string | null =>
  from.endsWith('*') && !from.includes('?') ? from.slice(0, -2) : null;

const _reserved = (path: string): boolean =>
  _RESERVED.some((_) => path === _ || path.startsWith(`${_}/`));

/** Пара query `name=value`: имя и значение уже раскодированы. */
export type QueryParam = [string, string];

const _MAX_PARAMS = 5;

// `p=12&x=` → пары по имени, без повторов; null — это не query правила.
const _params = (raw: string): QueryParam[] | null =>
  ((pairs) =>
    pairs.length > 0 &&
    pairs.length <= _MAX_PARAMS &&
    pairs.every(({ 0: name }) => name !== '') &&
    new Set(pairs.map(({ 0: name }) => name)).size === pairs.length &&
    raw.split('&').every((_) => _.includes('='))
      ? pairs.toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
      : null)([...new URLSearchParams(raw)] as QueryParam[]);

/** Правило с query `/?p=12`: путь и пары, которые должны быть в адресе посетителя; null — query нет. */
export var queryOf = (
  from: string
): { readonly path: string; readonly params: QueryParam[] } | null =>
  ((mark) =>
    mark < 0
      ? null
      : {
          path: from.slice(0, mark),
          params: [...new URLSearchParams(from.slice(mark + 1))],
        })(from.indexOf('?'));

/**
 * Адрес «откуда»: путь сайта; звёздочка — только целым последним сегментом. Точный адрес может требовать
 * query (`/?p=12`, `/index.php?page_id=5`): пары сортируются по имени, другие параметры адреса не мешают.
 */
export var parseFrom = (raw: string): string => {
  const text = raw.trim();
  const mark = text.indexOf('?');
  const bare = mark < 0 ? text : text.slice(0, mark);
  const params = mark < 0 ? null : _params(text.slice(mark + 1));
  const star = bare.endsWith('*');
  const base = star ? bare.slice(0, -1) : bare;
  const path =
    bare.startsWith('/') &&
    !bare.startsWith('//') &&
    !/[?#\s]/.test(bare) &&
    !/[#\s]/.test(text) &&
    !base.includes('*') &&
    text.length <= _MAX_PATH &&
    (!star || base.endsWith('/')) &&
    (mark < 0 || (params !== null && !star))
      ? _canonical(base)
      : null;
  return path === null
    ? fail(
        'redirects.invalid_from',
        'From is a site path like /old, a prefix like /old/* or a path with a query like /?p=12'
      )
    : _reserved(path)
      ? fail(
          'redirects.reserved',
          `${path} belongs to the manager or service files`
        )
      : star
        ? `${path === '/' ? '' : path}/*`
        : params
          ? `${path}?${new URLSearchParams(params)}`
          : path;
};

const _invalidTo = (): never =>
  fail(
    'redirects.invalid_to',
    'To is a site path, a full URL or a page like [~12~]'
  );

// query и якорь цели остаются как есть: `/catalog?sort=new`; у цели-префикса их не бывает.
const _internal = (base: string, star: boolean): string => {
  const cut = base.search(/[?#]/);
  const path = _canonical(cut < 0 ? base : base.slice(0, cut));
  return path === null || (star && cut >= 0)
    ? _invalidTo()
    : star
      ? `${path === '/' ? '' : path}/*`
      : `${path}${cut < 0 ? '' : base.slice(cut)}`;
};

/** Куда: путь сайта (со звёздочкой, если «откуда» — префикс), полный URL или `[~id~]`. */
export var parseTo = (raw: string, prefix: boolean): string => {
  const text = raw.trim();
  const star = text.endsWith('*');
  const base = star ? text.slice(0, -1) : text;
  return text.length === 0 ||
    text.length > _MAX_PATH ||
    base.includes('*') ||
    (star && !prefix)
    ? _invalidTo()
    : _PAGE.test(text) || _URL.test(text)
      ? text
      : text.startsWith('/') && !text.startsWith('//') && !/\s/.test(text)
        ? _internal(base, star)
        : _invalidTo();
};

const _status = (raw: number | undefined): RedirectStatus =>
  raw === undefined || raw === 301
    ? 301
    : raw === 302
      ? 302
      : fail('redirects.invalid_status', 'Code is 301 or 302');

export var parseRule = (input: RuleInput): RuleDraft =>
  ((from) => ({
    from,
    to: parseTo(String(input.to ?? ''), prefixOf(from) !== null),
    status: _status(input.status),
    note:
      String(input.note ?? '').trim().length <= _MAX_NOTE
        ? String(input.note ?? '').trim()
        : fail(
            'redirects.invalid_note',
            `Note is up to ${_MAX_NOTE} characters`
          ),
  }))(parseFrom(String(input.from ?? '')));

/** Страница цели `[~12~]`; null — цель не страница. */
export var pageTarget = (to: string): number | null =>
  ((match) => (match ? Number(match[1]) : null))(_PAGE.exec(to));

export var isExternal = (to: string): boolean => _URL.test(to);

type QueryRule = {
  readonly params: readonly QueryParam[];
  readonly rule: RedirectRule;
};

/**
 * Правила для быстрого поиска: точные адреса — таблицей, префиксы — от длинного к короткому, правила с
 * query — по пути, от большего числа пар к меньшему.
 */
export type RuleIndex = {
  readonly exact: ReadonlyMap<string, RedirectRule>;
  readonly prefixes: readonly {
    readonly base: string;
    readonly rule: RedirectRule;
  }[];
  readonly queries: ReadonlyMap<string, readonly QueryRule[]>;
};

/**
 * Индекс, который пополняется по правилу: пачка новых правил (перенос сайта) проверяется без пересборки
 * индекса на каждое. Таблицы живут в замыкании и растут на месте — снаружи индекс только читают.
 */
export var growingIndex = (
  rules: readonly RedirectRule[]
): {
  readonly index: () => RuleIndex;
  readonly add: (rule: RedirectRule) => void;
} => {
  const exact = new Map<string, RedirectRule>();
  const queries = new Map<string, QueryRule[]>();
  let prefixes: { readonly base: string; readonly rule: RedirectRule }[] = [];
  const add = (rule: RedirectRule): void =>
    ((base, query) =>
      void (base !== null
        ? (prefixes = [...prefixes, { base, rule }].toSorted(
            (a, b) => b.base.length - a.base.length
          ))
        : query !== null
          ? ((list) =>
              void queries.set(query.path, [
                ...list.filter((_) => _.params.length >= query.params.length),
                { params: query.params, rule },
                ...list.filter((_) => _.params.length < query.params.length),
              ]))(queries.get(query.path) ?? [])
          : exact.set(rule.from, rule)))(
      prefixOf(rule.from),
      queryOf(rule.from)
    );
  rules.forEach(add);
  return { index: () => ({ exact, prefixes, queries }), add };
};

export var indexRules = (rules: readonly RedirectRule[]): RuleIndex =>
  growingIndex(rules).index();

// `/blog` подходит к `/blog/*` с пустым остатком, `/blogger` — нет.
const _rest = (base: string, path: string): string | null =>
  base === ''
    ? path.slice(1)
    : path === base
      ? ''
      : path.startsWith(`${base}/`)
        ? path.slice(base.length + 1)
        : null;

const _target = (to: string, rest: string): string =>
  to.endsWith('*')
    ? ((head) =>
        rest === ''
          ? head.replace(/\/$/, '') || '/'
          : `${head}${head.endsWith('/') ? '' : '/'}${rest}`)(to.slice(0, -1))
    : to;

/** Правило для адреса: точное важнее префикса, длинный префикс важнее короткого. */
export var matchRule = (index: RuleIndex, path: string): RuleMatch | null =>
  ((exact) =>
    exact
      ? { id: exact.id, to: exact.to, status: exact.status }
      : index.prefixes.reduce<RuleMatch | null>(
          (found, { base, rule }) =>
            found ??
            ((rest) =>
              rest === null
                ? null
                : {
                    id: rule.id,
                    to: _target(rule.to, rest),
                    status: rule.status,
                  })(_rest(base, path)),
          null
        ))(index.exact.get(path));

/**
 * Правило с query для адреса посетителя: все его пары есть в query (лишние параметры вроде utm не мешают),
 * правило с большим числом пар важнее.
 */
export var matchQuery = (
  index: RuleIndex,
  path: string,
  query: Readonly<Record<string, string>>
): RuleMatch | null =>
  ((found) =>
    found
      ? {
          id: found.rule.id,
          to: found.rule.to,
          status: found.rule.status,
          consumed: found.params.map(({ 0: name }) => name),
        }
      : null)(
    (index.queries.get(path) ?? []).find(({ params }) =>
      params.every(
        ({ 0: name, 1: value }) =>
          Object.hasOwn(query, name) && query[name] === value
      )
    )
  );

/** Адрес, по которому проверяется цель-префикс: `*` заменяется сегментом. */
export var sampleOf = (to: string): string =>
  to.endsWith('*') ? `${to.slice(0, -1)}x` : to;

// Адрес цели без query и якоря — с ним сравниваются правила.
const _pathOf = (to: string): string => to.replace(/[?#].*$/, '') || '/';

// Query цели — с ним сравниваются правила с query.
const _queryOf = (to: string): Record<string, string> =>
  ((mark) =>
    mark < 0
      ? {}
      : Object.fromEntries(
          new URLSearchParams(to.slice(mark + 1).replace(/#.*$/, ''))
        ))(to.indexOf('?'));

// Куда отправит адрес цели одно из правил: с query или по пути.
const _matchTarget = (index: RuleIndex, to: string): RuleMatch | null =>
  ((target) =>
    matchQuery(index, _pathOf(target), _queryOf(target)) ??
    matchRule(index, _pathOf(target)))(sampleOf(to));

/**
 * Петли и цепочки: цель правила сама переадресуется, или на адрес правила ведёт другое правило.
 * Каждый переход — лишний запрос посетителю и поисковику, петля — ошибка в браузере.
 */
export var refuseChains = (
  draft: RuleDraft,
  others: readonly RedirectRule[],
  index: RuleIndex = indexRules(others)
): void => {
  const internal = !isExternal(draft.to) && pageTarget(draft.to) === null;
  const self = indexRules([
    {
      ...draft,
      id: 0,
      hits: 0,
      lastHitAt: null,
      createdAt: '',
      updatedAt: '',
    },
  ]);
  const next = internal ? _matchTarget(index, draft.to) : null;
  const into = others.find(
    (_) =>
      !isExternal(_.to) &&
      pageTarget(_.to) === null &&
      _matchTarget(self, _.to) !== null
  );
  void (
    internal &&
    _matchTarget(self, draft.to) !== null &&
    fail('redirects.loop', `${draft.from} leads to itself`)
  );
  void (
    next &&
    fail(
      'redirects.chain',
      `${draft.to} is redirected again to ${next.to}: point to the final address`
    )
  );
  void (
    into &&
    fail(
      'redirects.chain',
      `Rule ${into.from} → ${into.to} leads here: it would become a chain`
    )
  );
};
