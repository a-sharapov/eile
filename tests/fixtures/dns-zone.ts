import type {
  DnsAnswer,
  DnsResolver,
  RecordType,
} from '../../src/contexts/diagnostics/index.ts';

// Зона DNS для тестов проверки домена: без сети, с CNAME, wildcard и NXDOMAIN, как у настоящего резолвера.

export type ZoneNode = Readonly<
  Partial<Record<RecordType, readonly string[]>>
> & {
  /** TTL записей узла в зоне; по умолчанию 3600. */
  readonly ttl?: number;
};

export type Zone = Readonly<Record<string, ZoneNode>>;

type Found = {
  readonly status: 0 | 3;
  readonly records: readonly {
    readonly name: string;
    readonly type: RecordType;
    readonly ttl: number;
    readonly data: string;
  }[];
};

const NUMBERS: Readonly<Record<RecordType, number>> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  DS: 43,
  CAA: 257,
};

const parentOf = (name: string): string | null =>
  name.includes('.') ? name.slice(name.indexOf('.') + 1) : null;

// Имя есть в зоне, если у него есть записи или оно предок чьих-то записей (пустой нетерминал).
const exists = (zone: Zone, name: string): boolean =>
  name in zone || Object.keys(zone).some((_) => _.endsWith(`.${name}`));

// Wildcard RFC 4592: ближайший существующий предок и `*` под ним.
const nodeOf = (zone: Zone, name: string): ZoneNode | null => {
  if (name in zone) return zone[name]!;
  if (exists(zone, name)) return {};
  let parent = parentOf(name);
  while (parent !== null && !exists(zone, parent)) parent = parentOf(parent);
  return parent !== null && `*.${parent}` in zone ? zone[`*.${parent}`]! : null;
};

export var resolveIn = (
  zone: Zone,
  question: string,
  type: RecordType,
  ttlShift = 0
): Found => {
  const records: Found['records'][number][] = [];
  let name = question.toLowerCase().replace(/\.$/, '');
  for (let hop = 0; hop < 8; hop += 1) {
    const node = nodeOf(zone, name);
    if (node === null) return { status: 3, records };
    const ttl = Math.max(0, (node.ttl ?? 3600) - ttlShift);
    const cname = node.CNAME?.[0];
    if (cname !== undefined && type !== 'CNAME') {
      records.push({ name, type: 'CNAME', ttl, data: cname });
      name = cname;
      continue;
    }
    for (const data of node[type] ?? [])
      records.push({ name, type, ttl, data });
    return { status: 0, records };
  }
  return { status: 0, records };
};

const quoted = (text: string): string =>
  (text.match(/[\s\S]{1,255}/g) ?? [''])
    .map((_) => `"${_.replace(/["\\]/g, '\\$&')}"`)
    .join(' ');

const DOTTED: ReadonlySet<RecordType> = new Set(['CNAME', 'NS', 'PTR']);

// Cloudflare: имена без точки, TXT в кавычках; Google: имена с точкой, TXT склеен.
const presented = (google: boolean, type: RecordType, data: string): string =>
  type === 'TXT'
    ? google
      ? data
      : quoted(data)
    : DOTTED.has(type)
      ? `${data}.`
      : type === 'MX'
        ? `${data.split(' ')[0]} ${data.split(' ')[1] === '.' ? '.' : `${data.split(' ')[1]}.`}`
        : data;

export type ZoneFetchOptions = {
  /** На сколько секунд TTL в ответах DoH меньше зонного: остаток в кэше резолвера. */
  readonly ttlShift?: number;
  /** Флаг AD в ответах. */
  readonly ad?: boolean;
  /** Провайдеры, которые не отвечают: cloudflare, google. */
  readonly down?: readonly string[];
  /** Сюда пишутся адреса запросов. */
  readonly calls?: string[];
};

/** fetch для DoH-резолвера: отвечает JSON API Cloudflare или Google из зоны. */
export var zoneFetch =
  (zone: Zone, options: ZoneFetchOptions = {}) =>
  (url: string): Promise<Response> => {
    options.calls?.push(url);
    const parsed = new URL(url);
    const google = parsed.host === 'dns.google';
    if (options.down?.includes(google ? 'google' : 'cloudflare'))
      return Promise.reject(new TypeError('fetch failed'));
    const type = parsed.searchParams.get('type') as RecordType;
    const name = parsed.searchParams.get('name') ?? '';
    const found = resolveIn(zone, name, type, options.ttlShift ?? 0);
    const dot = google ? '.' : '';
    return Promise.resolve(
      Response.json({
        Status: found.status,
        AD: options.ad ?? false,
        Question: [{ name: `${name}${dot}`, type: NUMBERS[type] }],
        ...(found.records.length > 0
          ? {
              Answer: found.records.map((_) => ({
                name: `${_.name}${dot}`,
                type: NUMBERS[_.type],
                TTL: _.ttl,
                data: presented(google, _.type, _.data),
              })),
            }
          : {}),
      })
    );
  };

/** Резолвер «этой машины» из той же зоны: без TTL, кроме A и AAAA, без AD — как node:dns. */
export var zoneResolver = (zone: Zone, calls?: string[]): DnsResolver => ({
  kind: 'system',
  blind: ['ttl', 'dnssec', 'nxdomain', 'txt'],
  sources: () => ['system'],
  query: (name, type) => {
    calls?.push(`${name} ${type}`);
    const found = resolveIn(zone, name, type);
    return Promise.resolve<DnsAnswer>({
      status: 'ok',
      records: found.records.map((_) => ({
        ..._,
        ttl: _.type === 'A' || _.type === 'AAAA' ? _.ttl : null,
      })),
      authenticated: null,
    });
  },
});
