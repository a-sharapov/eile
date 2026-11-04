import { promises as dns } from 'node:dns';
import type { DnsResolver } from '../application/domain-check.ts';
import {
  bareName,
  type DnsAnswer,
  type DnsRecord,
  type RecordType,
} from '../domain/dns.ts';

type _Resolver = InstanceType<typeof dns.Resolver>;

type _Found = { readonly data: string; readonly ttl: number | null };

// node:dns отдаёт записи объектами: приводим к виду зоны, как у DoH. TTL есть только у A и AAAA.
const _ASK: Readonly<
  Record<RecordType, (r: _Resolver, name: string) => Promise<_Found[]>>
> = {
  A: (r, name) =>
    r
      .resolve4(name, { ttl: true })
      .then((_) => _.map((x) => ({ data: x.address, ttl: x.ttl }))),
  AAAA: (r, name) =>
    r
      .resolve6(name, { ttl: true })
      .then((_) => _.map((x) => ({ data: x.address, ttl: x.ttl }))),
  CNAME: (r, name) =>
    r
      .resolveCname(name)
      .then((_) => _.map((x) => ({ data: bareName(x), ttl: null }))),
  MX: (r, name) =>
    r.resolveMx(name).then((_) =>
      _.map((x) => ({
        data: `${x.priority} ${bareName(x.exchange)}`,
        ttl: null,
      }))
    ),
  TXT: (r, name) =>
    r
      .resolveTxt(name)
      .then((_) => _.map((x) => ({ data: x.join(''), ttl: null }))),
  NS: (r, name) =>
    r
      .resolveNs(name)
      .then((_) => _.map((x) => ({ data: bareName(x), ttl: null }))),
  SOA: (r, name) =>
    r.resolveSoa(name).then((x) => [
      {
        data: `${x.nsname} ${x.hostmaster} ${x.serial} ${x.refresh} ${x.retry} ${x.expire} ${x.minttl}`,
        ttl: null,
      },
    ]),
  CAA: (r, name) =>
    r.resolveCaa(name).then((_) =>
      _.flatMap((x) =>
        ((entry) =>
          entry === undefined
            ? []
            : [
                {
                  data: `${x.critical} ${entry[0]} "${entry[1]}"`,
                  ttl: null,
                },
              ])(Object.entries(x).find(({ 0: key }) => key !== 'critical'))
      )
    ),
  PTR: (r, name) =>
    r
      .resolvePtr(name)
      .then((_) => _.map((x) => ({ data: bareName(x), ttl: null }))),
  DS: () => Promise.resolve([]),
};

// «Нет имени» и «нет записей» c-ares здесь не различает: оба — пустой ответ.
const _EMPTY: ReadonlySet<string> = new Set(['ENOTFOUND', 'ENODATA']);

// Сеть или сам резолвер недоступны — как у DoH, `unreachable`: тогда проверка не идёт вовсе.
const _UNREACHABLE: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ETIMEOUT',
  'ECONNRESET',
  'ECANCELLED',
  'EFILE',
  'ENOTINITIALIZED',
]);

const _code = (error: unknown): string =>
  error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : 'error';

const _found = (
  r: _Resolver,
  name: string,
  type: RecordType
): Promise<{ readonly found: _Found[]; readonly error: string | null }> =>
  _ASK[type](r, name).then(
    (found) => ({ found, error: null }),
    (error) =>
      ((code) => ({
        found: [],
        error: _EMPTY.has(code)
          ? null
          : _UNREACHABLE.has(code)
            ? 'unreachable'
            : code,
      }))(_code(error))
  );

// Цепочка CNAME, как её показывает DoH: resolve4 и другие проходят её молча.
const _chain = (
  r: _Resolver,
  name: string,
  seen: readonly string[] = []
): Promise<string[]> =>
  seen.length >= 8
    ? Promise.resolve([...seen])
    : _found(r, name, 'CNAME').then(({ found }) =>
        found.length === 0 || seen.includes(found[0]!.data)
          ? [...seen]
          : _chain(r, found[0]!.data, [...seen, found[0]!.data])
      );

/**
 * Резолвер этой машины (`node:dns`, c-ares): видит то же, что сервер, но не TTL записей, кроме A и AAAA, не
 * DNSSEC, не отличает «нет имени» от «нет записей» и режет длинные TXT. `servers` — спросить сами серверы
 * зоны по их адресам.
 */
export var defineSystemResolver = ({
  servers,
  timeoutMs = 3000,
}: {
  servers?: readonly string[];
  timeoutMs?: number;
} = {}): DnsResolver => {
  // Две попытки: локальный stub-резолвер теряет часть ответов, когда запросов под сорок сразу.
  const resolver = new dns.Resolver({ timeout: timeoutMs, tries: 2 });
  void (servers && resolver.setServers([...servers]));
  return {
    kind: 'system',
    blind: ['ttl', 'dnssec', 'nxdomain', 'txt'],
    sources: () => ['system'],
    query: (name, type): Promise<DnsAnswer> =>
      Promise.all([
        type === 'CNAME' ? Promise.resolve([]) : _chain(resolver, name),
        _found(resolver, name, type),
      ]).then(({ 0: chain, 1: { found, error } }) => ({
        status: error === null ? 'ok' : 'failed',
        records: [
          ...chain.map(
            (target, index): DnsRecord => ({
              name: index === 0 ? bareName(name) : chain[index - 1]!,
              type: 'CNAME',
              ttl: null,
              data: target,
            })
          ),
          ...found.map(
            (_): DnsRecord => ({
              name: chain.at(-1) ?? bareName(name),
              type,
              ttl: _.ttl,
              data: _.data,
            })
          ),
        ],
        authenticated: null,
        ...(error === null ? {} : { error }),
      })),
  };
};
