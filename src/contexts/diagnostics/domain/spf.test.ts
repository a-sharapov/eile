import { describe, expect, it } from 'bun:test';
import {
  isSpf,
  movingMechanisms,
  parseSpf,
  rewriteSpf,
  type SpfNode,
  spfAll,
  spfListsAddress,
  spfLookups,
  spfLoops,
  spfRedirect,
  spfTargets,
} from './spf.ts';

const node = (
  domain: string,
  record: string,
  children: SpfNode[] = [],
  via: SpfNode['via'] = 'root'
): SpfNode => ({
  domain,
  via,
  record,
  problem: null,
  terms: parseSpf(record),
  children,
});

describe('SPF', () => {
  it('термы: квалификатор, механизм, домен и маска; модификаторы; нераспознанное — invalid', () => {
    expect(
      parseSpf(
        'v=spf1 -a:Mail.Example.com/24 ip6:2001:db8::/32 exp=x.example ipv4:1.2.3.4'
      )
    ).toEqual([
      {
        kind: 'mechanism',
        raw: '-a:Mail.Example.com/24',
        qualifier: '-',
        name: 'a',
        value: 'mail.example.com',
      },
      {
        kind: 'mechanism',
        raw: 'ip6:2001:db8::/32',
        qualifier: '+',
        name: 'ip6',
        value: '2001:db8::/32',
      },
      {
        kind: 'modifier',
        raw: 'exp=x.example',
        name: 'exp',
        value: 'x.example',
      },
      { kind: 'invalid', raw: 'ipv4:1.2.3.4' },
    ]);
    expect(
      parseSpf('v=spf1 include all:x ip4:300.1.1.1').map((_) => _.kind)
    ).toEqual(['invalid', 'invalid', 'invalid']);
    expect(isSpf('V=SPF1 mx')).toBe(true);
    expect(isSpf('v=spf10')).toBe(false);
  });

  it('redirect учитывается только без all; include — по порядку', () => {
    expect(spfRedirect(parseSpf('v=spf1 mx redirect=_spf.example'))).toBe(
      '_spf.example'
    );
    expect(
      spfRedirect(parseSpf('v=spf1 mx -all redirect=_spf.example'))
    ).toBeNull();
    expect(
      spfTargets(
        parseSpf(
          'v=spf1 include:a.example include:b.example redirect=c.example'
        )
      )
    ).toEqual([
      { via: 'include', domain: 'a.example' },
      { via: 'include', domain: 'b.example' },
      { via: 'redirect', domain: 'c.example' },
    ]);
  });

  it('запросы DNS считаются по всему дереву: include, a, mx, ptr, exists и redirect', () => {
    const tree = node(
      'a.example',
      'v=spf1 a mx ptr exists:%{i}.x include:b.example ip4:192.0.2.1 redirect=c.example',
      [
        node(
          'b.example',
          'v=spf1 a:x.example mx:y.example ~all',
          [],
          'include'
        ),
        node(
          'c.example',
          'v=spf1 include:d.example -all',
          [node('d.example', 'v=spf1 ip4:192.0.2.0/24 -all', [], 'include')],
          'redirect'
        ),
      ]
    );
    expect(spfLookups(tree)).toBe(6 + 2 + 1);
    expect(spfAll(tree)).toBe('-');
  });

  it('петля — цепочка доменов до повтора', () => {
    const loop: SpfNode = {
      domain: 'a.example',
      via: 'include',
      record: null,
      problem: 'loop',
      terms: [],
      children: [],
    };
    expect(
      spfLoops(
        node('a.example', 'v=spf1 include:b.example', [
          node('b.example', 'v=spf1 include:a.example', [loop], 'include'),
        ])
      )
    ).toEqual([['a.example', 'b.example', 'a.example']]);
  });

  it('a и mx на адрес домена; mx — только если MX переедет', () => {
    const terms = parseSpf(
      'v=spf1 a a:mail.example a:shop.example mx -mx ~all'
    );
    expect(
      movingMechanisms(terms, new Set(['shop.example']), false).map(
        (_) => _.raw
      )
    ).toEqual(['a', 'a:shop.example']);
    expect(
      movingMechanisms(terms, new Set(['shop.example']), true).map((_) => _.raw)
    ).toEqual(['a', 'a:shop.example', 'mx']);
  });

  it('ip4 с маской покрывает адрес', () => {
    const terms = parseSpf(
      'v=spf1 ip4:192.0.2.0/24 -ip4:198.51.100.7 ip6:2001:db8::1'
    );
    expect(spfListsAddress(terms, '192.0.2.77')).toBe(true);
    expect(spfListsAddress(terms, '198.51.100.7')).toBe(false);
    expect(spfListsAddress(terms, '2001:DB8:0::1')).toBe(true);
  });

  it('правка: a — на явные адреса на его месте, +all — на ~all, остальное как было', () => {
    const terms = parseSpf('v=spf1 a mx include:_spf.example +all');
    expect(
      rewriteSpf(terms, [terms[0]!], ['198.51.100.7', '2001:db8::7'])
    ).toBe(
      'v=spf1 ip4:198.51.100.7 ip6:2001:db8::7 mx include:_spf.example ~all'
    );
    const plain = parseSpf('v=spf1 ip4:198.51.100.7 mx ~all');
    expect(rewriteSpf(plain, [], ['198.51.100.7', '192.0.2.1'])).toBe(
      'v=spf1 ip4:198.51.100.7 mx ip4:192.0.2.1 ~all'
    );
  });
});
