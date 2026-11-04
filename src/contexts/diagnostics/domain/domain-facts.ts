import type { RecordChange } from './dns.ts';
import type { SpfNode } from './spf.ts';

// Факты и находки проверки домена перед переездом (ADR 0052): что собрано из DNS и что из этого следует.

/** Что известно об имени: есть ли оно, цепочка CNAME и адреса в её конце. */
export type NameFacts = {
  readonly name: string;
  /** Имя есть в DNS: не NXDOMAIN. */
  readonly exists: boolean;
  /** Цели CNAME по порядку: `www → example.com` даёт `['example.com']`. */
  readonly cname: readonly string[];
  readonly a: readonly string[];
  readonly aaaa: readonly string[];
  readonly ttl: {
    readonly a: number | null;
    readonly aaaa: number | null;
  };
};

export type MailHost = {
  readonly priority: number;
  /** Пусто — null MX `0 .`. */
  readonly host: string;
  readonly facts: NameFacts | null;
};

/** PTR адреса и подтверждён ли он: имя из PTR само ведёт на этот адрес. */
export type PtrFacts = {
  readonly address: string;
  readonly name: string | null;
  readonly confirmed: boolean;
};

export type DkimFacts = {
  readonly selector: string;
  readonly record: string;
  readonly cname: readonly string[];
};

/** Набор CAA для имени: где он нашёлся, поднимаясь к корню (RFC 8659 §3); at null — нигде. */
export type CaaFacts = {
  readonly name: string;
  readonly at: string | null;
  readonly records: readonly string[];
};

/** Куда переезжает сайт: `--to`, адреса этой машины или неизвестно. */
export type TargetFacts = {
  readonly source: 'to' | 'local' | 'none';
  readonly input: string | null;
  readonly a: readonly string[];
  readonly aaaa: readonly string[];
  /** В `--to` имя, у которого нет адресов. */
  readonly unresolved: readonly string[];
};

/** Всё, что проверка узнала о домене из DNS: дальше — только чистые правила. */
export type DomainFacts = {
  readonly domain: string;
  /** full — всё; mail — только адреса, MX и SPF (предупреждение `cms service install`). */
  readonly scope: 'full' | 'mail';
  /** На запрос адреса домена пришёл ответ; false — SERVFAIL или молчание серверов зоны. */
  readonly answered: boolean;
  readonly nameservers: readonly string[];
  /** Флаг AD в ответе: зона подписана и проверена; null — резолвер этого не видит. */
  readonly dnssec: boolean | null;
  readonly apex: NameFacts;
  readonly www: NameFacts | null;
  /** Ответ на случайное имя: есть — в зоне wildcard `*`. */
  readonly wildcard: {
    readonly host: NameFacts;
    readonly txt: readonly string[];
  } | null;
  /** Откуда TTL адресов: от DNS-серверов зоны (точно) или из кэша резолвера (не больше настоящего). */
  readonly ttlFrom: 'zone' | 'resolver';
  readonly mx: {
    readonly hosts: readonly MailHost[];
    readonly ttl: number | null;
  };
  readonly ptr: readonly PtrFacts[];
  readonly txt: readonly string[];
  readonly spf: SpfNode | null;
  readonly dmarc: {
    readonly records: readonly string[];
    readonly cname: readonly string[];
  } | null;
  readonly dkim: {
    readonly tried: readonly string[];
    /** Селекторы из `--dkim-selector`: их отсутствие — предупреждение. */
    readonly requested: readonly string[];
    readonly found: readonly DkimFacts[];
  } | null;
  readonly caa: readonly CaaFacts[];
  readonly target: TargetFacts;
};

/** ok — в порядке; info — на заметку; warn — стоит поправить; error — сломается или уже сломано. */
export type DomainStatus = 'ok' | 'info' | 'warn' | 'error';

/** Когда скажется: при переключении A на новый сервер или уже сейчас. */
export type DomainWhen = 'switch' | 'now';

export type Addresses = {
  readonly a: readonly string[];
  readonly aaaa: readonly string[];
};

export type TtlEntry = {
  readonly name: string;
  readonly type: 'A' | 'AAAA' | 'MX';
  readonly ttl: number;
  /** TTL из зоны; false — остаток в кэше резолвера, в зоне может быть больше. */
  readonly exact: boolean;
};

export type DkimKey = {
  readonly selector: string;
  readonly key: string;
  /** Длина ключа RSA по длине `p=`; null — не RSA или не понять. */
  readonly bits: number | null;
};

type _Finding<Id extends string, Data> = {
  readonly id: Id;
  readonly status: DomainStatus;
  readonly when: DomainWhen;
  readonly data: Data;
  /** Что поменять в зоне; пусто — менять нечего. */
  readonly changes: readonly RecordChange[];
  /** Другой путь к тому же: первый — только предложение. */
  readonly alternative: readonly RecordChange[];
};

/** Находка проверки домена; тексты к ней — по id, на языке того, кто показывает. */
export type DomainFinding =
  | _Finding<'domain.missing', Record<string, never>>
  | _Finding<'domain.unanswered', Record<string, never>>
  | _Finding<'web.switch', { readonly from: Addresses; readonly to: Addresses }>
  | _Finding<'web.none', { readonly to: Addresses }>
  | _Finding<'web.already', { readonly to: Addresses }>
  | _Finding<'web.no_target', { readonly from: Addresses }>
  | _Finding<'web.target_unresolved', { readonly names: readonly string[] }>
  | _Finding<'web.aaaa_stays', { readonly aaaa: readonly string[] }>
  | _Finding<'www.missing', Record<string, never>>
  | _Finding<'www.follows', { readonly how: 'cname' | 'wildcard' | 'target' }>
  | _Finding<
      'www.stays',
      {
        readonly cname: string | null;
        readonly addresses: readonly string[];
        readonly viaWildcard: boolean;
      }
    >
  | _Finding<
      'wildcard',
      {
        readonly moves: boolean;
        readonly cname: string | null;
        readonly addresses: readonly string[];
      }
    >
  | _Finding<'mx.none', { readonly addresses: readonly string[] }>
  | _Finding<'mx.null', Record<string, never>>
  | _Finding<'mx.unresolved', { readonly hosts: readonly string[] }>
  | _Finding<
      'mx.moves',
      {
        readonly hosts: readonly string[];
        readonly addresses: readonly string[];
        readonly suggestion: string | null;
        readonly confirmed: boolean;
        readonly already: boolean;
      }
    >
  | _Finding<
      'mx.shares',
      {
        readonly hosts: readonly string[];
        readonly addresses: readonly string[];
      }
    >
  | _Finding<'mx.elsewhere', { readonly hosts: readonly string[] }>
  | _Finding<'spf.none', { readonly suggestion: string }>
  | _Finding<'spf.multiple', { readonly records: readonly string[] }>
  | _Finding<'spf.syntax', { readonly terms: readonly string[] }>
  | _Finding<'spf.loop', { readonly chain: readonly string[] }>
  | _Finding<
      'spf.broken_include',
      {
        readonly domains: readonly string[];
        readonly macros: readonly string[];
      }
    >
  | _Finding<'spf.lookups', { readonly count: number }>
  | _Finding<'spf.pass_all', { readonly record: string }>
  | _Finding<'spf.neutral', { readonly record: string }>
  | _Finding<
      'spf.moves',
      {
        readonly mechanisms: readonly string[];
        readonly lost: readonly string[];
        readonly mailOnOld: boolean;
        readonly already: boolean;
        readonly dkim: boolean;
      }
    >
  | _Finding<'spf.ok', { readonly record: string; readonly lookups: number }>
  | _Finding<'dkim.found', { readonly keys: readonly DkimKey[] }>
  | _Finding<'dkim.revoked', { readonly selectors: readonly string[] }>
  | _Finding<'dkim.missing', { readonly selectors: readonly string[] }>
  | _Finding<'dkim.none', { readonly tried: number }>
  | _Finding<'dmarc.none', Record<string, never>>
  | _Finding<'dmarc.wildcard', { readonly via: string }>
  | _Finding<'dmarc.invalid', { readonly records: readonly string[] }>
  | _Finding<'dmarc.multiple', { readonly records: readonly string[] }>
  | _Finding<
      'dmarc.ok',
      {
        readonly policy: string;
        readonly rua: readonly string[];
        readonly pct: number;
      }
    >
  | _Finding<'caa.none', Record<string, never>>
  | _Finding<
      'caa.allows',
      { readonly at: string; readonly issuers: readonly string[] }
    >
  | _Finding<
      'caa.blocks',
      {
        readonly name: string;
        readonly at: string;
        readonly reason: 'issuer' | 'method' | 'critical';
        readonly issuers: readonly string[];
      }
    >
  | _Finding<'caa.account', { readonly at: string }>
  | _Finding<
      'ttl.high',
      { readonly entries: readonly TtlEntry[]; readonly wait: number }
    >
  | _Finding<'ttl.ok', { readonly entries: readonly TtlEntry[] }>
  | _Finding<'dnssec', { readonly signed: boolean | null }>;

export type DomainFindingId = DomainFinding['id'];

/** TTL, до которого снижать перед переездом: пять минут — новый адрес разойдётся быстро. */
export var SWITCH_TTL = 300;

/** Селекторы DKIM, которые пробуем: в DNS их не перечислить, только угадать по провайдерам. */
export var DKIM_SELECTORS: readonly string[] = [
  'default',
  'dkim',
  'mail',
  'google',
  'selector1',
  'selector2',
  's1',
  's2',
  'k1',
  'k2',
  'k3',
  'mx',
  'smtp',
  'key1',
  'key2',
  'dkim1',
  'dkim2',
  'sig1',
  // Brevo: mail — прежний, brevo1/brevo2 — CNAME нынешних доменов.
  'brevo1',
  'brevo2',
  // Mailgun.
  'mailo',
  'krs',
  'mg',
  'pic',
  // Postmark: обычно `<дата>pm` — его не угадать, только `--dkim-selector`.
  'pm',
  // Mandrill, Zoho, Fastmail, Proton, HubSpot, Mailjet.
  'mte1',
  'mte2',
  'zmail',
  'fm1',
  'fm2',
  'fm3',
  'protonmail',
  'protonmail2',
  'protonmail3',
  'hs1',
  'hs2',
  'mailjet',
];
