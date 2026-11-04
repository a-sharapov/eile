import { attempt } from '../../../shared/kernel/errors.ts';

/** Типы записей, которые читает проверка домена. */
export type RecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'NS'
  | 'SOA'
  | 'CAA'
  | 'PTR'
  | 'DS';

/**
 * Запись ответа. Имена — в нижнем регистре и без точки на конце, в `data` тоже; TXT — склеенный текст без
 * кавычек, MX — `10 mail.example.com`, CAA — `0 issue "letsencrypt.org"`. ttl null — резолвер его не видит.
 */
export type DnsRecord = {
  readonly name: string;
  readonly type: RecordType;
  readonly ttl: number | null;
  readonly data: string;
};

/**
 * Ответ резолвера вместе с цепочкой CNAME. `nxdomain` — имени нет; `failed` — ответа нет: сеть, SERVFAIL,
 * отказ сервера. Пустой `ok` — имя есть, записей такого типа нет.
 */
export type DnsAnswer = {
  readonly status: 'ok' | 'nxdomain' | 'failed';
  readonly records: readonly DnsRecord[];
  /** Флаг AD: ответ проверен DNSSEC; null — резолвер этого не видит. */
  readonly authenticated: boolean | null;
  readonly error?: string;
};

/** Правка зоны: удалить, создать или оставить с другим TTL (`set`). Значение — как в `DnsRecord.data`, точки на конце ставит `zoneLine`. */
export type RecordChange = {
  readonly op: 'add' | 'remove' | 'set';
  readonly name: string;
  readonly type: RecordType;
  readonly ttl: number | null;
  readonly value: string;
};

/** Имя DNS как сравниваем: нижний регистр, без точки на конце. */
export var bareName = (name: string): string =>
  name.trim().toLowerCase().replace(/\.$/, '');

const _V4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export var isIPv4 = (value: string): boolean => _V4.test(value);

/** IPv6 в каноническом виде (`2001:db8::1`); не IPv6 — null. */
export var canonicalIPv6 = (value: string): string | null =>
  value.includes(':')
    ? attempt(
        () =>
          new URL(`http://[${value.replace(/%.*$/, '')}]/`).hostname.slice(
            1,
            -1
          ),
        () => null
      )
    : null;

export var isIPv6 = (value: string): boolean => canonicalIPv6(value) !== null;

export var isAddress = (value: string): boolean =>
  isIPv4(value) || isIPv6(value);

/** Адрес как сравниваем: IPv4 как есть, IPv6 — канонически, `::ffff:a.b.c.d` — как IPv4. */
export var bareAddress = (value: string): string =>
  ((v4) => (isIPv4(v4) ? v4 : (canonicalIPv6(v4) ?? v4)))(
    value.trim().replace(/^::ffff:(?=\d+\.)/i, '')
  );

// Восемь групп по четыре цифры: `::` раскрыт.
const _groups6 = (ip: string): string[] =>
  ((halves) =>
    ((head, tail) =>
      [
        ...head,
        ...Array.from({ length: 8 - head.length - tail.length }, () => '0'),
        ...tail,
      ].map((_) => _.padStart(4, '0')))(
      halves[0] ? halves[0].split(':') : [],
      halves.length > 1 && halves[1] ? halves[1].split(':') : []
    ))(ip.split('::'));

/** Имя записи PTR для адреса: `4.3.2.1.in-addr.arpa`, для IPv6 — 32 полубайта в `ip6.arpa`. */
export var reverseName = (address: string): string =>
  ((ip) =>
    isIPv4(ip)
      ? `${ip.split('.').reverse().join('.')}.in-addr.arpa`
      : `${[..._groups6(ip).join('')].reverse().join('.')}.ip6.arpa`)(
    bareAddress(address)
  );

// Сети, которых не видно из интернета: частные, CGNAT, петля, link-local, «этот хост».
const _PRIVATE_V4: readonly (readonly [string, number])[] = [
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['0.0.0.0', 8],
];

const _v4Number = (ip: string): number =>
  ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);

const _inV4 = (ip: string, net: string, bits: number): boolean =>
  Math.floor(_v4Number(ip) / 2 ** (32 - bits)) ===
  Math.floor(_v4Number(net) / 2 ** (32 - bits));

/** Адрес виден из интернета: не петля, не link-local, не частные сети, не ULA и не multicast. */
export var isPublicAddress = (address: string): boolean =>
  ((ip) =>
    isIPv4(ip)
      ? !_PRIVATE_V4.some(({ 0: net, 1: bits }) => _inV4(ip, net, bits))
      : isIPv6(ip) &&
        ip !== '::1' &&
        ip !== '::' &&
        !/^(fe[89ab]|f[cd]|ff)/i.test(_groups6(ip)[0]!))(bareAddress(address));

/** Запись MX: приоритет и хост; `0 .` — null MX (RFC 7505): домен почту не принимает. */
export var parseMx = (
  data: string
): { readonly priority: number; readonly host: string } =>
  ((parts) => ({
    priority: Number(parts[0] ?? 0),
    host: bareName(parts[1] ?? ''),
  }))(data.trim().split(/\s+/));

/** Запись CAA: флаги, тег и значение без кавычек. Критический флаг — бит 128. */
export var parseCaa = (
  data: string
): {
  readonly critical: boolean;
  readonly tag: string;
  readonly value: string;
} =>
  ((match) => ({
    critical: (Number(match?.[1] ?? 0) & 128) !== 0,
    tag: (match?.[2] ?? '').toLowerCase(),
    value: (match?.[3] ?? '').replace(/^"([\s\S]*)"$/, '$1'),
  }))(/^\s*(\d+)\s+([A-Za-z0-9]+)\s+([\s\S]*?)\s*$/.exec(data));

// Строки символов зоны: `"a" "b"` → `ab`; `\"`, `\\` и `\DDD` раскрываются.
const _CHAR_STRING = /"((?:[^"\\]|\\.)*)"/g;

const _unescape = (text: string): string =>
  text.replace(/\\(\d{3}|.)/g, (_, code: string) =>
    /^\d{3}$/.test(code) ? String.fromCharCode(Number(code)) : code
  );

/** TXT из ответа: Cloudflare отдаёт строки в кавычках, Google — уже склеенный текст. */
export var txtValue = (data: string): string =>
  data.trimStart().startsWith('"')
    ? [...data.matchAll(_CHAR_STRING)].map((_) => _unescape(_[1]!)).join('')
    : data;

// Строка TXT в зоне — не длиннее 255 байт: длинную запись режем на несколько строк в кавычках.
const _quoted = (text: string): string =>
  (text.match(/[\s\S]{1,255}/g) ?? [''])
    .map((_) => `"${_.replace(/["\\]/g, '\\$&')}"`)
    .join(' ');

const _dotted = (name: string): string => (name === '' ? '.' : `${name}.`);

const _VALUE: Readonly<Partial<Record<RecordType, (value: string) => string>>> =
  {
    MX: (value) =>
      ((mx) => `${mx.priority} ${_dotted(mx.host)}`)(parseMx(value)),
    CNAME: (value) => _dotted(bareName(value)),
    NS: (value) => _dotted(bareName(value)),
    PTR: (value) => _dotted(bareName(value)),
    TXT: _quoted,
  };

/** Правка одной строкой файла зоны: `example.com. 300 IN MX 10 mail.example.com.` — её и вставляют в панель DNS. */
export var zoneLine = (change: RecordChange): string =>
  [
    _dotted(change.name),
    ...(change.ttl === null ? [] : [String(change.ttl)]),
    'IN',
    change.type,
    (_VALUE[change.type] ?? ((_: string) => _))(change.value),
  ].join(' ');

const _DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Домен из ввода: `muehlenhof.example`, `https://muehlenhof.example/` или IDN (станет punycode); не домен — null. */
export var parseDomainName = (raw: string): string | null =>
  ((host) =>
    host !== null && _DOMAIN.test(host) && !isIPv4(host) ? host : null)(
    attempt(
      () =>
        bareName(
          new URL(raw.includes('://') ? raw.trim() : `http://${bareName(raw)}/`)
            .hostname
        ),
      () => null
    )
  );
