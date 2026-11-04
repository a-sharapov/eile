import type { DnsResolver } from '../application/domain-check.ts';
import {
  bareName,
  type DnsAnswer,
  type DnsRecord,
  type RecordType,
  txtValue,
} from '../domain/dns.ts';

/** Запрос HTTP: `fetch`, в тестах — подмена с ответами из зоны. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type DohProvider = { readonly id: string; readonly url: string };

/** JSON API DNS поверх HTTPS: Cloudflare, затем Google — если первый недоступен. */
export var DOH_PROVIDERS: readonly DohProvider[] = [
  { id: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { id: 'google', url: 'https://dns.google/resolve' },
];

const _TYPES: Readonly<Record<number, RecordType>> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  43: 'DS',
  257: 'CAA',
};

type _Json = {
  readonly Status?: number;
  readonly AD?: boolean;
  readonly Answer?: readonly {
    readonly name: string;
    readonly type: number;
    readonly TTL?: number;
    readonly data: string;
  }[];
};

const _latin = (bytes: readonly number[]): string =>
  String.fromCharCode(...bytes);

// Неизвестный резолверу тип приходит в общем виде RFC 3597: `\# 19 00 05 69 73 …` — флаги, длина тега, тег,
// значение. Так Cloudflare отдавал CAA.
const _genericCaa = (data: string): string =>
  ((bytes) =>
    ((flags, length) =>
      `${flags} ${_latin(bytes.slice(2, 2 + length))} "${_latin(bytes.slice(2 + length))}"`)(
      bytes[0] ?? 0,
      bytes[1] ?? 0
    ))(
    data
      .replace(/^\\#\s+\d+\s*/, '')
      .replace(/\s+/g, '')
      .match(/../g)
      ?.map((_) => Number.parseInt(_, 16)) ?? []
  );

const _DATA: Readonly<Partial<Record<RecordType, (data: string) => string>>> = {
  TXT: txtValue,
  CNAME: bareName,
  NS: bareName,
  PTR: bareName,
  MX: (data) =>
    ((parts) => `${parts[0] ?? '0'} ${bareName(parts[1] ?? '')}`)(
      data.trim().split(/\s+/)
    ),
  CAA: (data) => (data.startsWith('\\#') ? _genericCaa(data) : data),
};

const _record = (raw: NonNullable<_Json['Answer']>[number]): DnsRecord[] =>
  ((type) =>
    type === undefined
      ? []
      : [
          {
            name: bareName(raw.name),
            type,
            ttl: raw.TTL ?? null,
            data: (_DATA[type] ?? ((_: string) => _))(raw.data),
          },
        ])(_TYPES[raw.type]);

/** Ответ JSON API → ответ резолвера: 0 — есть, 3 — NXDOMAIN, остальное (SERVFAIL, REFUSED) — нет ответа. */
export var dohAnswer = (json: _Json): DnsAnswer =>
  ((status) => ({
    status: status === 0 ? 'ok' : status === 3 ? 'nxdomain' : 'failed',
    records: (json.Answer ?? []).flatMap(_record),
    authenticated: json.AD ?? null,
    ...(status === 0 || status === 3 ? {} : { error: `rcode ${status}` }),
  }))(json.Status ?? 2);

const _UNREACHABLE: DnsAnswer = {
  status: 'failed',
  records: [],
  authenticated: null,
  error: 'unreachable',
};

/**
 * Резолвер DNS поверх HTTPS (JSON API): все типы записей, TTL и флаг AD. Провайдер, до которого не
 * достучались, уходит в конец очереди: остальные запросы не ждут его таймаута.
 */
export var defineDohResolver = ({
  fetch,
  providers = DOH_PROVIDERS,
  timeoutMs = 5000,
}: {
  fetch: Fetch;
  providers?: readonly DohProvider[];
  timeoutMs?: number;
}): DnsResolver => {
  const used = new Set<string>();
  const down = new Set<string>();
  const ask = (
    provider: DohProvider,
    name: string,
    type: RecordType
  ): Promise<DnsAnswer | null> =>
    fetch(`${provider.url}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<_Json>)
          : Promise.reject(new Error(`HTTP ${response.status}`))
      )
      .then(
        (json) => (
          used.add(provider.id), down.delete(provider.id), dohAnswer(json)
        ),
        () => (down.add(provider.id), null)
      );
  return {
    kind: 'doh',
    blind: [],
    sources: () => [...used],
    query: (name, type) =>
      providers
        .toSorted((a, b) => Number(down.has(a.id)) - Number(down.has(b.id)))
        .reduce<Promise<DnsAnswer | null>>(
          (done, provider) =>
            done.then((found) => found ?? ask(provider, name, type)),
          Promise.resolve(null)
        )
        .then((answer) => answer ?? _UNREACHABLE),
  };
};
