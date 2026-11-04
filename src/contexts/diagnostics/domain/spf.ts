import { bareAddress, bareName, isIPv4 } from './dns.ts';

export type SpfQualifier = '+' | '-' | '~' | '?';

export type SpfMechanism =
  | 'all'
  | 'include'
  | 'a'
  | 'mx'
  | 'ptr'
  | 'ip4'
  | 'ip6'
  | 'exists';

/**
 * Терм записи SPF (RFC 7208 §4.6.1). У механизма `value` — домен (`a:mail.example.com`) или адрес с маской
 * (`ip4:192.0.2.0/24`); у `a` и `mx` без домена — null. Нераспознанный терм — `invalid`: запись целиком
 * даёт permerror.
 */
export type SpfTerm =
  | {
      readonly kind: 'mechanism';
      readonly raw: string;
      readonly qualifier: SpfQualifier;
      readonly name: SpfMechanism;
      readonly value: string | null;
    }
  | {
      readonly kind: 'modifier';
      readonly raw: string;
      readonly name: string;
      readonly value: string;
    }
  | { readonly kind: 'invalid'; readonly raw: string };

/** Почему запись дальше не прочитана: её нет, их несколько, петля, нет ответа, макрос, кончился запас запросов. */
export type SpfProblem =
  | 'none'
  | 'multiple'
  | 'loop'
  | 'failed'
  | 'macro'
  | 'limit';

/** Запись SPF домена и записи, на которые она ссылается через include и redirect. */
export type SpfNode = {
  readonly domain: string;
  readonly via: 'root' | 'include' | 'redirect';
  readonly record: string | null;
  readonly problem: SpfProblem | null;
  readonly terms: readonly SpfTerm[];
  readonly children: readonly SpfNode[];
};

/** Предел запросов DNS на одну проверку SPF (RFC 7208 §4.6.4): больше — permerror у получателя. */
export var SPF_LOOKUP_LIMIT = 10;

export var isSpf = (txt: string): boolean => /^v=spf1(\s|$)/i.test(txt.trim());

const _MECHANISM =
  /^([+\-~?]?)(all|include|a|mx|ptr|ip4|ip6|exists)(?::([^/]*))?(\/[0-9/]*)?$/i;

const _MODIFIER = /^([a-z][a-z0-9_.-]*)=(.*)$/i;

// У механизма свои правила значения: include и exists без домена, ip4 без адреса, all с доменом — ошибка.
const _VALID: Readonly<
  Record<SpfMechanism, (value: string | null, cidr: string) => boolean>
> = {
  all: (value, cidr) => value === null && cidr === '',
  include: (value, cidr) => !!value && cidr === '',
  exists: (value, cidr) => !!value && cidr === '',
  a: () => true,
  mx: () => true,
  ptr: (_, cidr) => cidr === '',
  ip4: (value) => !!value && isIPv4(value),
  ip6: (value) => !!value && value.includes(':'),
};

const _term = (raw: string): SpfTerm =>
  ((mechanism, modifier) =>
    mechanism
      ? ((name, value, cidr) =>
          _VALID[name](value, cidr)
            ? {
                kind: 'mechanism' as const,
                raw,
                qualifier: (mechanism[1] || '+') as SpfQualifier,
                name,
                value:
                  name === 'ip4' || name === 'ip6'
                    ? `${value}${cidr}`
                    : value === null
                      ? null
                      : bareName(value),
              }
            : { kind: 'invalid' as const, raw })(
          mechanism[2]!.toLowerCase() as SpfMechanism,
          mechanism[3] ?? null,
          mechanism[4] ?? ''
        )
      : modifier
        ? {
            kind: 'modifier' as const,
            raw,
            name: modifier[1]!.toLowerCase(),
            value: modifier[2]!,
          }
        : { kind: 'invalid' as const, raw })(
    // Маска ip6 тоже начинается с «/», а сам адрес содержит «:» — регулярке хватает «до первого /».
    _MECHANISM.exec(raw),
    _MODIFIER.exec(raw)
  );

/** Термы записи по порядку, без `v=spf1`. */
export var parseSpf = (record: string): SpfTerm[] =>
  record.trim().split(/\s+/).slice(1).filter(Boolean).map(_term);

const _LOOKUPS: ReadonlySet<SpfMechanism> = new Set([
  'include',
  'a',
  'mx',
  'ptr',
  'exists',
]);

const _mechanisms = (terms: readonly SpfTerm[]) =>
  terms.flatMap((_) => (_.kind === 'mechanism' ? [_] : []));

/** redirect учитывается, только если в записи нет `all` (RFC 7208 §6.1). */
export var spfRedirect = (terms: readonly SpfTerm[]): string | null =>
  _mechanisms(terms).some((_) => _.name === 'all')
    ? null
    : ((redirect) => (redirect ? bareName(redirect.value) : null))(
        terms.find((_) => _.kind === 'modifier' && _.name === 'redirect') as
          | Extract<SpfTerm, { kind: 'modifier' }>
          | undefined
      );

/** Куда ведёт запись: include по порядку, затем redirect. */
export var spfTargets = (
  terms: readonly SpfTerm[]
): { readonly via: 'include' | 'redirect'; readonly domain: string }[] => [
  ..._mechanisms(terms)
    .filter((_) => _.name === 'include')
    .map((_) => ({ via: 'include' as const, domain: _.value! })),
  ...((redirect) =>
    redirect === null ? [] : [{ via: 'redirect' as const, domain: redirect }])(
    spfRedirect(terms)
  ),
];

/** В домене макрос `%{…}`: что он даст, известно только при проверке письма. */
export var hasMacro = (domain: string): boolean => domain.includes('%');

const _ownLookups = (terms: readonly SpfTerm[]): number =>
  _mechanisms(terms).filter((_) => _LOOKUPS.has(_.name)).length +
  (spfRedirect(terms) === null ? 0 : 1);

/** Запросы DNS всей проверки: термы записи и всех записей, до которых она доходит. */
export var spfLookups = (node: SpfNode): number =>
  node.children.reduce(
    (sum, _) => sum + spfLookups(_),
    _ownLookups(node.terms)
  );

/** Все записи дерева: корень и всё, до чего он доходит. */
export var spfNodes = (node: SpfNode): SpfNode[] => [
  node,
  ...node.children.flatMap(spfNodes),
];

/** Цепочки до петли: домены от корня до того, что ведёт обратно. */
export var spfLoops = (
  node: SpfNode,
  path: readonly string[] = []
): string[][] =>
  node.problem === 'loop'
    ? [[...path, node.domain]]
    : node.children.flatMap((_) => spfLoops(_, [...path, node.domain]));

/** Итог проверки для писем, не попавших ни под один механизм: `all` записи или её redirect. */
export var spfAll = (node: SpfNode): SpfQualifier | null =>
  _mechanisms(node.terms).find((_) => _.name === 'all')?.qualifier ??
  ((redirect) => (redirect ? spfAll(redirect) : null))(
    node.children.find((_) => _.via === 'redirect')
  );

const _octets = (ip: string): number =>
  ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);

// ip4:192.0.2.0/24 покрывает адрес, если совпадают первые 24 бита.
const _covers = (term: string, address: string): boolean =>
  ((parts) =>
    ((network, bits) =>
      isIPv4(address) && isIPv4(network)
        ? Math.floor(_octets(address) / 2 ** (32 - bits)) ===
          Math.floor(_octets(network) / 2 ** (32 - bits))
        : bareAddress(network) === bareAddress(address))(
      parts[0]!,
      Math.min(32, Number(parts[1] ?? 32))
    ))(term.split('/'));

/** Адрес разрешён явным ip4 или ip6 этой записи. */
export var spfListsAddress = (
  terms: readonly SpfTerm[],
  address: string
): boolean =>
  _mechanisms(terms).some(
    (_) =>
      (_.name === 'ip4' || _.name === 'ip6') &&
      _.qualifier === '+' &&
      _covers(_.value!, address)
  );

/**
 * Механизмы корня, которые смотрят на адрес самого домена: `a` и `a:<домен>`, а `mx` — если MX ведёт на сам
 * домен. После переключения A они разрешают новый сервер вместо старого.
 */
export var movingMechanisms = (
  terms: readonly SpfTerm[],
  moving: ReadonlySet<string>,
  mxMoves: boolean
): SpfTerm[] =>
  _mechanisms(terms).filter(
    (_) =>
      _.qualifier === '+' &&
      ((_.name === 'a' && (_.value === null || moving.has(_.value))) ||
        (_.name === 'mx' &&
          mxMoves &&
          (_.value === null || moving.has(_.value))))
  );

const _address = (ip: string): string =>
  isIPv4(ip) ? `ip4:${ip}` : `ip6:${bareAddress(ip)}`;

/**
 * Запись SPF с правками: убрать термы `drop`, на место первого из них (или перед `all`) поставить явные адреса
 * `add`, `+all` заменить на `~all`. Остальное — как было.
 */
export var rewriteSpf = (
  terms: readonly SpfTerm[],
  drop: readonly SpfTerm[],
  add: readonly string[]
): string =>
  ((kept, at, added) =>
    [
      'v=spf1',
      ...kept.slice(0, at).map((_) => _.raw),
      ...added,
      ...kept.slice(at).map((_) => _.raw),
    ].join(' '))(
    terms
      .filter((_) => !drop.includes(_))
      .map((_) =>
        _.kind === 'mechanism' && _.name === 'all' && _.qualifier === '+'
          ? { ..._, qualifier: '~' as const, raw: '~all' }
          : _
      ),
    ((first) =>
      first >= 0
        ? terms.filter((_, index) => index < first && !drop.includes(_)).length
        : ((all) =>
            all >= 0
              ? terms.filter((_, index) => index < all && !drop.includes(_))
                  .length
              : terms.filter((_) => !drop.includes(_)).length)(
            terms.findIndex(
              (_) =>
                (_.kind === 'mechanism' && _.name === 'all') ||
                (_.kind === 'modifier' && _.name === 'redirect')
            )
          ))(terms.findIndex((_) => drop.includes(_))),
    add.filter((_) => !spfListsAddress(terms, _)).map(_address)
  );
