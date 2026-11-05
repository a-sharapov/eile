import { fail } from '../../../shared/kernel/errors.ts';

/** Сертификат HTTPS: цепочка PEM от центра сертификации и ключ к ней. */
export type Certificate = {
  readonly domains: readonly string[];
  readonly chain: string;
  readonly key: string;
  readonly notAfter: string;
  readonly issuedAt: string;
};

/** Что известно о сертификате доменов: он сам (если уже выпущен) и последняя попытка. */
export type CertificateState = {
  readonly domains: readonly string[];
  readonly certificate: Certificate | null;
  readonly lastAttemptAt: string | null;
  /** Пусто — последняя попытка удалась или её не было. */
  readonly lastError: string;
};

/** Продлевать, когда до конца сертификата меньше стольких дней: Let's Encrypt советует за 30 из 90. */
export var RENEW_BEFORE_DAYS = 30;

const _DAY = 24 * 60 * 60 * 1000;
// Без сертификата сайт не открывается по HTTPS — пробуем раз в час, но не чаще: у Let's Encrypt лимит
// неудачных проверок (5 в час на домен). Продлению спешить некуда — раз в сутки.
const _RETRY_ISSUE = 60 * 60 * 1000;
const _RETRY_RENEW = _DAY;

// Имя хоста по RFC 1123: метки до 63 символов из латиницы, цифр и дефиса, хотя бы одна точка. Звёздочки
// нет — HTTP-01 не выдаёт сертификатов на поддомены разом; IP и localhost Let's Encrypt не подписывает.
const _LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

const _host = (raw: string): string =>
  ((name) =>
    name.length <= 253 &&
    name.includes('.') &&
    !/^[\d.]+$/.test(name) &&
    name.split('.').every((_) => _LABEL.test(_))
      ? name
      : fail(
          'certificates.invalid_domain',
          `"${raw}" is not a domain name for a certificate`
        ))(raw.trim().toLowerCase().replace(/\.$/, ''));

/** `example.com,www.example.com` → проверенные имена без повторов; первое — основное, порядок сохраняется. */
export var parseDomains = (raw: string): string[] =>
  ((names) =>
    names.length > 0
      ? [...new Set(names.map(_host))]
      : fail('certificates.no_domain', 'At least one domain is needed'))(
    raw
      .split(',')
      .map((_) => _.trim())
      .filter(Boolean)
  );

/**
 * Дополнительный домен — любой из списка, кроме первого (основного): с него сервер ведёт на основной.
 * Имя из адреса запроса сравнивается без точки на конце: `www.example.com.` — тот же домен.
 */
export var isSecondaryDomain = (
  domains: readonly string[],
  hostname: string
): boolean => domains.indexOf(hostname.replace(/\.$/, '')) > 0;

/**
 * На основной домен по HTTPS ведём не только дополнительные имена из --domain, но и любой чужой домен,
 * наведённый на этот сервер: его зеркалят под своим именем, а так посетитель попадёт на настоящий сайт.
 * IP-литерал, localhost и имя без точки — не домен: их (и сам основной) отдаём как есть, чтобы доступ по
 * адресу и мониторинг не ломались.
 */
export var redirectsToPrimary = (
  domains: readonly string[],
  hostname: string
): boolean =>
  ((host) =>
    domains.length > 0 &&
    host !== domains[0] &&
    host.includes('.') &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))(hostname.replace(/\.$/, ''));

/** Ключ состояния: одни и те же домены в любом порядке — один сертификат. */
export var domainsKey = (domains: readonly string[]): string =>
  [...domains].sort().join(',');

export type Due = 'issue' | 'renew' | null;

const _since = (moment: string | null, now: Date): number =>
  moment === null
    ? Number.POSITIVE_INFINITY
    : now.getTime() - Date.parse(moment);

/**
 * Пора ли идти в центр сертификации: сертификата нет — выпустить, до конца меньше 30 дней — продлить.
 * После неудачи следующая попытка — через час без сертификата и через сутки при продлении.
 */
export var due = (state: CertificateState | null, now: Date): Due =>
  state?.certificate
    ? Date.parse(state.certificate.notAfter) - now.getTime() <
        RENEW_BEFORE_DAYS * _DAY &&
      (state.lastError === '' ||
        _since(state.lastAttemptAt, now) >= _RETRY_RENEW)
      ? 'renew'
      : null
    : !state || _since(state.lastAttemptAt, now) >= _RETRY_ISSUE
      ? 'issue'
      : null;

/** Сертификат ещё действует: его можно отдавать, пока не выпущен новый. */
export var valid = (certificate: Certificate | null, now: Date): boolean =>
  certificate !== null && Date.parse(certificate.notAfter) > now.getTime();
