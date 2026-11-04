import { describe, expect, it } from 'bun:test';
import {
  bareAddress,
  isPublicAddress,
  parseCaa,
  parseDomainName,
  reverseName,
  txtValue,
  zoneLine,
} from './dns.ts';

describe('значения DNS', () => {
  it('TXT: строки в кавычках склеиваются, экранирование раскрывается; без кавычек — как есть', () => {
    expect(txtValue('"v=spf1 " "a mx ~all"')).toBe('v=spf1 a mx ~all');
    expect(txtValue('"say \\"hi\\" \\059"')).toBe('say "hi" ;');
    expect(txtValue('v=spf1 -all')).toBe('v=spf1 -all');
  });

  it('строка зоны: точки на конце имён, TXT длиннее 255 — несколько строк, null MX — «0 .»', () => {
    expect(
      zoneLine({
        op: 'add',
        name: 'a.de',
        type: 'MX',
        ttl: 300,
        value: '10 mail.a.de',
      })
    ).toBe('a.de. 300 IN MX 10 mail.a.de.');
    expect(
      zoneLine({
        op: 'remove',
        name: 'a.de',
        type: 'MX',
        ttl: null,
        value: '0 .',
      })
    ).toBe('a.de. IN MX 0 .');
    expect(
      zoneLine({
        op: 'add',
        name: 'www.a.de',
        type: 'CNAME',
        ttl: 60,
        value: 'a.de',
      })
    ).toBe('www.a.de. 60 IN CNAME a.de.');
    expect(
      zoneLine({
        op: 'add',
        name: 'a.de',
        type: 'TXT',
        ttl: 300,
        value: `v=spf1 "${'x'.repeat(260)}`,
      })
    ).toBe(
      `a.de. 300 IN TXT "v=spf1 \\"${'x'.repeat(247)}" "${'x'.repeat(13)}"`
    );
  });

  it('PTR: IPv4 задом наперёд, IPv6 — 32 полубайта', () => {
    expect(reverseName('46.242.244.215')).toBe('215.244.242.46.in-addr.arpa');
    expect(reverseName('2001:db8::1')).toBe(
      '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
    );
    expect(reverseName('::ffff:192.0.2.1')).toBe('1.2.0.192.in-addr.arpa');
  });

  it('публичный адрес: не частные сети, не петля, не link-local и не ULA', () => {
    expect(
      ['203.0.113.10', '8.8.8.8', '2a01:4f8::1'].map(isPublicAddress)
    ).toEqual([true, true, true]);
    expect(
      [
        '10.1.2.3',
        '172.20.0.1',
        '192.168.1.1',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.1.1',
        '::1',
        'fe80::1',
        'fd00::1',
      ].map(isPublicAddress)
    ).toEqual(Array(9).fill(false));
    expect(bareAddress('2001:DB8:0:0::1')).toBe('2001:db8::1');
  });

  it('CAA: флаг критичности, тег и значение без кавычек', () => {
    expect(
      parseCaa('128 Issue "letsencrypt.org; validationmethods=http-01"')
    ).toEqual({
      critical: true,
      tag: 'issue',
      value: 'letsencrypt.org; validationmethods=http-01',
    });
  });

  it('домен из ввода: регистр, точка, URL и IDN; не домен — null', () => {
    expect(parseDomainName('Muehlenhof.EXAMPLE.')).toBe('muehlenhof.example');
    expect(parseDomainName('https://muehlenhof.example/kontakt')).toBe(
      'muehlenhof.example'
    );
    expect(parseDomainName('пример.рф')).toBe('xn--e1afmkfd.xn--p1ai');
    expect(parseDomainName('localhost')).toBeNull();
    expect(parseDomainName('203.0.113.10')).toBeNull();
    expect(parseDomainName('a b.de')).toBeNull();
  });
});
