import { describe, expect, it } from 'bun:test';
import { attempt } from '../../../shared/kernel/errors.ts';
import {
  type Certificate,
  type CertificateState,
  domainsKey,
  due,
  isSecondaryDomain,
  parseDomains,
  valid,
} from './certificate.ts';

const _codeOf = (run: () => unknown): string =>
  attempt(
    () => (run(), ''),
    (error) => (error as { code: string }).code
  );

const now = new Date('2026-11-01T12:00:00Z');
const days = (n: number): string =>
  new Date(now.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
const hours = (n: number): string =>
  new Date(now.getTime() + n * 60 * 60 * 1000).toISOString();

const certificate = (notAfter: string): Certificate => ({
  domains: ['example.com'],
  chain: 'PEM',
  key: 'KEY',
  notAfter,
  issuedAt: days(-60),
});

const state = (patch: Partial<CertificateState>): CertificateState => ({
  domains: ['example.com'],
  certificate: null,
  lastAttemptAt: null,
  lastError: '',
  ...patch,
});

describe('домены сайта', () => {
  it('имена в нижнем регистре, без повторов, основное — первое', () => {
    expect(parseDomains(' Example.com, www.example.com ,example.com.')).toEqual(
      ['example.com', 'www.example.com']
    );
  });

  it('звёздочка, IP, localhost и пустая строка — не домены для сертификата', () => {
    expect(_codeOf(() => parseDomains('*.example.com'))).toBe(
      'certificates.invalid_domain'
    );
    expect(_codeOf(() => parseDomains('203.0.113.7'))).toBe(
      'certificates.invalid_domain'
    );
    expect(_codeOf(() => parseDomains('localhost'))).toBe(
      'certificates.invalid_domain'
    );
    expect(_codeOf(() => parseDomains('-bad.example.com'))).toBe(
      'certificates.invalid_domain'
    );
    expect(_codeOf(() => parseDomains(' , '))).toBe('certificates.no_domain');
  });

  it('ключ состояния не зависит от порядка', () => {
    expect(domainsKey(['www.example.com', 'example.com'])).toBe(
      domainsKey(['example.com', 'www.example.com'])
    );
  });

  it('дополнительный — любой из списка, кроме первого; точка на конце не в счёт', () => {
    const domains = ['example.com', 'www.example.com', 'example.net'];
    expect(
      [
        'www.example.com',
        'example.net',
        'www.example.com.',
        'example.com',
        'example.com.',
        'evil.example',
        '127.0.0.1',
        'localhost',
        '',
      ].map((_) => isSecondaryDomain(domains, _))
    ).toEqual([true, true, true, false, false, false, false, false, false]);
    expect(isSecondaryDomain(['example.com'], 'example.com')).toBe(false);
  });
});

describe('когда идти за сертификатом', () => {
  it('сертификата нет — выпустить сразу', () => {
    expect(due(null, now)).toBe('issue');
  });

  it('выпуск не удался — следующая попытка через час', () => {
    expect(
      due(state({ lastAttemptAt: hours(-0.5), lastError: 'boom' }), now)
    ).toBeNull();
    expect(
      due(state({ lastAttemptAt: hours(-1), lastError: 'boom' }), now)
    ).toBe('issue');
  });

  it('до конца больше 30 дней — ничего, меньше — продлить', () => {
    expect(due(state({ certificate: certificate(days(40)) }), now)).toBeNull();
    expect(due(state({ certificate: certificate(days(20)) }), now)).toBe(
      'renew'
    );
  });

  it('продление не удалось — снова через сутки, сертификат пока служит', () => {
    const failed = state({
      certificate: certificate(days(20)),
      lastAttemptAt: hours(-5),
      lastError: 'boom',
    });
    expect(due(failed, now)).toBeNull();
    expect(due({ ...failed, lastAttemptAt: hours(-24) }, now)).toBe('renew');
    expect(valid(failed.certificate, now)).toBe(true);
    expect(valid(certificate(days(-1)), now)).toBe(false);
  });
});
