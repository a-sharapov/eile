import {
  bareAddress,
  bareName,
  type DnsAnswer,
  type DnsRecord,
  isAddress,
  isIPv4,
  type RecordType,
  reverseName,
} from '../domain/dns.ts';
import { assessDomain, summaryOf } from '../domain/domain-check.ts';
import {
  type Addresses,
  type CaaFacts,
  DKIM_SELECTORS,
  type DkimFacts,
  type DomainFacts,
  type DomainFinding,
  type MailHost,
  type NameFacts,
  type PtrFacts,
  type TargetFacts,
} from '../domain/domain-facts.ts';
import {
  hasMacro,
  isSpf,
  parseSpf,
  type SpfNode,
  spfTargets,
} from '../domain/spf.ts';

/**
 * Чего резолвер не видит: TTL всех типов, кроме A и AAAA; флага DNSSEC; разницы между «нет имени» и «нет
 * записей»; длинных TXT целиком.
 */
export type Blind = 'ttl' | 'dnssec' | 'nxdomain' | 'txt';

/** Резолвер для проверки домена: DNS поверх HTTPS (Cloudflare, Google) или резолвер этой машины. */
export type DnsResolver = {
  readonly kind: 'doh' | 'system';
  readonly query: (name: string, type: RecordType) => Promise<DnsAnswer>;
  /** Кто ответил на запросы: `cloudflare`, `google`, `system`. */
  readonly sources: () => readonly string[];
  readonly blind: readonly Blind[];
};

/** Резолвер, который спрашивает сами DNS-серверы зоны по их адресам: TTL оттуда настоящий, а не остаток кэша. */
export type ZoneResolver = (servers: readonly string[]) => DnsResolver;

export type DomainReport = {
  readonly domain: string;
  readonly resolver: {
    readonly kind: DnsResolver['kind'];
    readonly sources: readonly string[];
    readonly blind: readonly Blind[];
  };
  readonly facts: DomainFacts;
  readonly findings: readonly DomainFinding[];
  readonly summary: { readonly errors: number; readonly warnings: number };
};

type _Query = DnsResolver['query'];

// Селекторов DKIM под сорок: по восемь запросов одновременно, резолверу хватит.
const _PARALLEL = 8;

// Записей SPF за одну проверку: на петлях и длинных цепочках include обход останавливается здесь.
const _SPF_NODES = 30;

const _batches = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );

const _inBatches = <T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>
): Promise<R[]> =>
  _batches(items, _PARALLEL).reduce<Promise<R[]>>(
    (done, batch) =>
      done.then((results) =>
        Promise.all(batch.map(run)).then((more) => [...results, ...more])
      ),
    Promise.resolve([])
  );

// Одно имя и тип — один запрос на всю проверку: MX на сам домен спрашивает те же A, что и сайт.
const _memo = (query: _Query): _Query => {
  const asked = new Map<string, Promise<DnsAnswer>>();
  return (name, type) =>
    ((key) =>
      asked.get(key) ??
      (asked.set(key, query(bareName(name), type)), asked.get(key)!))(
      `${bareName(name)} ${type}`
    );
};

const _ofType = (answer: DnsAnswer, type: RecordType): DnsRecord[] =>
  answer.records.filter((_) => _.type === type);

const _chain = (answer: DnsAnswer): string[] =>
  _ofType(answer, 'CNAME').map((_) => bareName(_.data));

const _texts = (answer: DnsAnswer): string[] =>
  _ofType(answer, 'TXT').map((_) => _.data);

const _parent = (name: string): string => name.slice(name.indexOf('.') + 1);

const _name = (q: _Query, name: string): Promise<NameFacts> =>
  Promise.all([q(name, 'A'), q(name, 'AAAA')]).then(({ 0: a, 1: aaaa }) =>
    ((cname) => ({
      name,
      exists:
        cname.length > 0 ||
        (a.status !== 'nxdomain' && aaaa.status !== 'nxdomain'),
      cname,
      a: _ofType(a, 'A').map((_) => bareAddress(_.data)),
      aaaa: _ofType(aaaa, 'AAAA').map((_) => bareAddress(_.data)),
      ttl: {
        a: _ofType(a, 'A')[0]?.ttl ?? null,
        aaaa: _ofType(aaaa, 'AAAA')[0]?.ttl ?? null,
      },
    }))(_chain(a).length > 0 ? _chain(a) : _chain(aaaa))
  );

// NS у самого имени, а нет — у родителя: для поддомена серверы зоны — серверы её корня.
const _nameservers = (q: _Query, name: string): Promise<string[]> =>
  q(name, 'NS').then((answer) =>
    ((ns) =>
      ns.length > 0 || !name.includes('.')
        ? ns
        : _nameservers(q, _parent(name)))(
      _ofType(answer, 'NS')
        .map((_) => bareName(_.data))
        .toSorted()
    )
  );

// Набор CAA — первый непустой, поднимаясь от имени к корню (RFC 8659 §3); CNAME резолвер проходит сам.
const _caa = (q: _Query, name: string, from = name): Promise<CaaFacts> =>
  q(name, 'CAA').then((answer) =>
    ((records) =>
      records.length > 0
        ? {
            name: from,
            at: records[0]!.name,
            records: records.map((_) => _.data),
          }
        : name.includes('.')
          ? _caa(q, _parent(name), from)
          : { name: from, at: null, records: [] })(_ofType(answer, 'CAA'))
  );

const _wildcard = (
  q: _Query,
  domain: string,
  label: string
): Promise<DomainFacts['wildcard']> =>
  ((probe) =>
    Promise.all([_name(q, probe), q(probe, 'TXT')]).then(
      ({ 0: host, 1: txt }) =>
        host.cname.length + host.a.length + host.aaaa.length > 0 ||
        _texts(txt).length > 0
          ? { host: { ...host, name: `*.${domain}` }, txt: _texts(txt) }
          : null
    ))(`${label}.${domain}`);

const _mx = (q: _Query, domain: string): Promise<DomainFacts['mx']> =>
  q(domain, 'MX').then((answer) =>
    ((records) =>
      Promise.all(
        records.map((record) =>
          ((host, priority) =>
            host === ''
              ? Promise.resolve<MailHost>({ priority, host, facts: null })
              : _name(q, host).then(
                  (facts): MailHost => ({ priority, host, facts })
                ))(
            bareName(record.data.trim().split(/\s+/)[1] ?? ''),
            Number(record.data.trim().split(/\s+/)[0] ?? 0)
          )
        )
      ).then((hosts) => ({
        hosts: hosts.toSorted((a, b) => a.priority - b.priority),
        ttl: records[0]?.ttl ?? null,
      })))(_ofType(answer, 'MX'))
  );

// PTR адресов сайта: по нему видно имя почтового сервера у провайдера, если почта живёт там же.
const _ptr = (q: _Query, addresses: readonly string[]): Promise<PtrFacts[]> =>
  Promise.all(
    [...new Set(addresses)].slice(0, 4).map((address) =>
      q(reverseName(address), 'PTR').then(
        (answer): PtrFacts | Promise<PtrFacts> =>
          ((name) =>
            name === null
              ? { address, name, confirmed: false }
              : _name(q, name).then((facts) => ({
                  address,
                  name,
                  confirmed: [...facts.a, ...facts.aaaa].includes(
                    bareAddress(address)
                  ),
                })))(
            ((record) => (record ? bareName(record.data) : null))(
              _ofType(answer, 'PTR')[0]
            )
          )
      )
    )
  );

/** Обход SPF: include и redirect рекурсивно, с петлями и пределом записей на проверку. */
const _spfWalker = (q: _Query) => {
  let left = _SPF_NODES;
  const leaf = (
    domain: string,
    via: SpfNode['via'],
    problem: SpfNode['problem'],
    record: string | null = null
  ): SpfNode => ({ domain, via, record, problem, terms: [], children: [] });
  const node = (
    domain: string,
    via: SpfNode['via'],
    record: string,
    path: readonly string[]
  ): Promise<SpfNode> =>
    ((terms) =>
      Promise.all(
        spfTargets(terms).map((_) => walk(_.domain, _.via, [...path, domain]))
      ).then((children) => ({
        domain,
        via,
        record,
        problem: null,
        terms,
        children,
      })))(parseSpf(record));
  const walk = (
    domain: string,
    via: SpfNode['via'],
    path: readonly string[]
  ): Promise<SpfNode> =>
    path.includes(domain)
      ? Promise.resolve(leaf(domain, via, 'loop'))
      : hasMacro(domain)
        ? Promise.resolve(leaf(domain, via, 'macro'))
        : left <= 0
          ? Promise.resolve(leaf(domain, via, 'limit'))
          : ((left -= 1),
            q(domain, 'TXT').then((answer) =>
              ((records) =>
                records.length === 1
                  ? node(domain, via, records[0]!, path)
                  : leaf(
                      domain,
                      via,
                      records.length > 1
                        ? 'multiple'
                        : answer.status === 'failed'
                          ? 'failed'
                          : 'none'
                    ))(_texts(answer).filter(isSpf))
            ));
  return (domain: string, txt: readonly string[]): Promise<SpfNode | null> =>
    ((records) =>
      records.length === 1
        ? node(domain, 'root', records[0]!, [])
        : Promise.resolve(null))(txt.filter(isSpf));
};

const _dmarc = (q: _Query, domain: string): Promise<DomainFacts['dmarc']> =>
  q(`_dmarc.${domain}`, 'TXT').then((answer) => ({
    records: _texts(answer),
    cname: _chain(answer),
  }));

const _dkim = (
  q: _Query,
  domain: string,
  requested: readonly string[]
): Promise<DomainFacts['dkim']> =>
  ((tried) =>
    _inBatches(tried, (selector) =>
      q(`${selector}._domainkey.${domain}`, 'TXT').then((answer): DkimFacts[] =>
        _texts(answer)
          .slice(0, 1)
          .map((record) => ({ selector, record, cname: _chain(answer) }))
      )
    ).then((found) => ({ tried, requested, found: found.flat() })))([
    ...new Set([...DKIM_SELECTORS, ...requested]),
  ]);

const _targetPart = (
  q: _Query,
  part: string
): Promise<Addresses & { readonly unresolved: readonly string[] }> =>
  isAddress(part)
    ? Promise.resolve(
        isIPv4(part)
          ? { a: [part], aaaa: [], unresolved: [] }
          : { a: [], aaaa: [bareAddress(part)], unresolved: [] }
      )
    : _name(q, bareName(part)).then((_) => ({
        a: _.a,
        aaaa: _.aaaa,
        unresolved: _.a.length + _.aaaa.length === 0 ? [part] : [],
      }));

/** `--to`: адреса и имена через запятую; без него — адреса этой машины, если они видны из интернета. */
const _target = (
  q: _Query,
  to: string | null,
  local: Addresses
): Promise<TargetFacts> =>
  to === null
    ? Promise.resolve(
        local.a.length + local.aaaa.length > 0
          ? { source: 'local', input: null, ...local, unresolved: [] }
          : { source: 'none', input: null, a: [], aaaa: [], unresolved: [] }
      )
    : Promise.all(
        to
          .split(',')
          .map((_) => _.trim())
          .filter(Boolean)
          .map((_) => _targetPart(q, _))
      ).then((parts) => ({
        source: 'to',
        input: to,
        a: [...new Set(parts.flatMap((_) => _.a))],
        aaaa: [...new Set(parts.flatMap((_) => _.aaaa))],
        unresolved: parts.flatMap((_) => _.unresolved),
      }));

const _withTtl = (
  facts: NameFacts,
  a: DnsAnswer | null,
  aaaa: DnsAnswer | null
): NameFacts => ({
  ...facts,
  ttl: {
    a: (a && _ofType(a, 'A')[0]?.ttl) ?? facts.ttl.a,
    aaaa: (aaaa && _ofType(aaaa, 'AAAA')[0]?.ttl) ?? facts.ttl.aaaa,
  },
});

const _answered = (answer: DnsAnswer | null, type: RecordType): boolean =>
  answer === null ||
  (answer.status === 'ok' &&
    _ofType(answer, type).length > 0 &&
    _ofType(answer, type).every((_) => _.ttl !== null));

// TTL из кэша резолвера — остаток, в зоне он может быть больше. Спрашиваем A и AAAA у самих серверов зоны;
// не ответили (UDP 53 закрыт, сервер молчит) — остаётся то, что видел резолвер.
const _zoneTtl = (
  q: _Query,
  zone: ZoneResolver | undefined,
  nameservers: readonly string[],
  names: readonly NameFacts[]
): Promise<{ readonly names: NameFacts[]; readonly exact: boolean }> =>
  zone === undefined || nameservers.length === 0
    ? Promise.resolve({ names: [...names], exact: false })
    : Promise.all(nameservers.slice(0, 2).map((_) => q(_, 'A')))
        .then((answers) =>
          answers.flatMap((_) => _ofType(_, 'A').map((r) => r.data))
        )
        .then((servers) =>
          servers.length === 0
            ? { names: [...names], exact: false }
            : ((ask) =>
                Promise.all(
                  names.map((facts) =>
                    Promise.all([
                      facts.cname.length === 0 && facts.a.length > 0
                        ? ask(facts.name, 'A')
                        : null,
                      facts.cname.length === 0 && facts.aaaa.length > 0
                        ? ask(facts.name, 'AAAA')
                        : null,
                    ])
                  )
                ).then((answers) =>
                  answers.every(
                    ({ 0: a, 1: aaaa }) =>
                      _answered(a, 'A') && _answered(aaaa, 'AAAA')
                  )
                    ? {
                        names: names.map((facts, index) =>
                          _withTtl(
                            facts,
                            answers[index]![0],
                            answers[index]![1]
                          )
                        ),
                        exact: true,
                      }
                    : { names: [...names], exact: false }
                ))(zone(servers).query)
        );

const _anything = (facts: Omit<DomainFacts, 'scope'>): boolean =>
  facts.apex.cname.length +
    facts.apex.a.length +
    facts.apex.aaaa.length +
    facts.mx.hosts.length +
    facts.txt.length >
  0;

/**
 * Проверка домена перед переездом: всё нужное из DNS одним проходом (запросы одинаковых имён — один раз),
 * затем правила `assessDomain`. `local` — адреса этой машины: цель, если нет `to`. `scope: 'mail'` — только
 * адреса, MX и SPF, для предупреждения при установке службы.
 */
export var checkDomain = ({
  resolver,
  zone,
  domain,
  to = null,
  local = { a: [], aaaa: [] },
  selectors = [],
  scope = 'full',
  label = `eile-check-${crypto.randomUUID().slice(0, 8)}`,
}: {
  resolver: DnsResolver;
  zone?: ZoneResolver;
  domain: string;
  to?: string | null;
  local?: Addresses;
  selectors?: readonly string[];
  scope?: DomainFacts['scope'];
  /** Метка случайного имени, по которому видно wildcard. */
  label?: string;
}): Promise<DomainReport> =>
  ((q, full) =>
    Promise.all([
      _name(q, domain),
      q(domain, 'A'),
      full ? _nameservers(q, domain) : Promise.resolve([]),
      full ? _name(q, `www.${domain}`) : Promise.resolve(null),
      full ? _wildcard(q, domain, label) : Promise.resolve(null),
      _mx(q, domain),
      q(domain, 'TXT').then(_texts),
      full ? _dmarc(q, domain) : Promise.resolve(null),
      full ? _dkim(q, domain, selectors) : Promise.resolve(null),
      full
        ? Promise.all([_caa(q, domain), _caa(q, `www.${domain}`)])
        : Promise.resolve([]),
      _target(q, to, local),
    ]).then(
      ({
        0: apex,
        1: apexAnswer,
        2: nameservers,
        3: www,
        4: wildcard,
        5: mx,
        6: txt,
        7: dmarc,
        8: dkim,
        9: caa,
        10: target,
      }) =>
        Promise.all([
          _spfWalker(q)(domain, txt),
          full && mx.hosts.some((_) => _.host !== '')
            ? _ptr(q, [...apex.a, ...apex.aaaa])
            : Promise.resolve([]),
          full
            ? _zoneTtl(q, zone, nameservers, [apex, ...(www ? [www] : [])])
            : Promise.resolve({ names: [apex], exact: false }),
        ]).then(({ 0: spf, 1: ptr, 2: ttl }) =>
          ((base) =>
            ((facts: DomainFacts) =>
              ((findings) => ({
                domain,
                resolver: {
                  kind: resolver.kind,
                  sources: resolver.sources(),
                  blind: resolver.blind,
                },
                facts,
                findings,
                summary: summaryOf(findings),
              }))(assessDomain(facts)))({
              ...base,
              scope,
              apex: {
                ...base.apex,
                exists:
                  base.apex.exists &&
                  (resolver.kind === 'doh' || _anything(base)),
              },
            }))({
            domain,
            answered: apexAnswer.status !== 'failed',
            nameservers,
            dnssec: resolver.blind.includes('dnssec')
              ? null
              : apexAnswer.authenticated,
            apex: ttl.names[0]!,
            www: www && (ttl.names[1] ?? www),
            wildcard,
            ttlFrom: ttl.exact ? ('zone' as const) : ('resolver' as const),
            mx,
            ptr,
            txt,
            spf,
            dmarc,
            dkim,
            caa: www?.exists
              ? (caa as CaaFacts[])
              : (caa as CaaFacts[]).slice(0, 1),
            target,
          })
        )
    ))(_memo(resolver.query), scope === 'full');
