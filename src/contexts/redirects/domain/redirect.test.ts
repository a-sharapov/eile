import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import { parseCsv, rulesToCsv } from './csv.ts';
import {
  indexRules,
  matchQuery,
  matchRule,
  pageTarget,
  parseFrom,
  parseRule,
  parseTo,
  prefixOf,
  queryOf,
  type RedirectRule,
  refuseChains,
} from './redirect.ts';

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const rule = (id: number, from: string, to: string): RedirectRule => ({
  id,
  from,
  to,
  status: 301,
  note: '',
  hits: 0,
  lastHitAt: null,
  createdAt: '',
  updatedAt: '',
});

describe('адрес «откуда»', () => {
  it('приводит путь к виду сайта и держит звёздочку последним сегментом', () => {
    expect(parseFrom(' /old/page/ ')).toBe('/old/page');
    expect(parseFrom('/a//b')).toBe('/a/b');
    expect(parseFrom('/blog/*')).toBe('/blog/*');
    expect(parseFrom('/*')).toBe('/*');
    expect(parseFrom('/старая-страница')).toBe('/старая-страница');
  });

  it('отказывает адресу без слеша, с query без пар и у раздела, со звёздочкой в середине и служебным', () => {
    expect(code(() => parseFrom('old'))).toBe('redirects.invalid_from');
    expect(code(() => parseFrom('/old?x'))).toBe('redirects.invalid_from');
    expect(code(() => parseFrom('/old?'))).toBe('redirects.invalid_from');
    expect(code(() => parseFrom('/old?a=1&a=2'))).toBe(
      'redirects.invalid_from'
    );
    expect(code(() => parseFrom('/old/*?x=1'))).toBe('redirects.invalid_from');
    expect(code(() => parseFrom('/old?x=1#top'))).toBe(
      'redirects.invalid_from'
    );
    expect(code(() => parseFrom('/bl*og'))).toBe('redirects.invalid_from');
    expect(code(() => parseFrom('/blog*'))).toBe('redirects.invalid_from');
    expect(code(() => parseFrom('//evil.example'))).toBe(
      'redirects.invalid_from'
    );
    expect(code(() => parseFrom('/a/../b'))).toBe('redirects.invalid_from');
    expect(code(() => parseFrom('/manager/x'))).toBe('redirects.reserved');
    expect(code(() => parseFrom('/media/*'))).toBe('redirects.reserved');
  });
});

describe('правило с query', () => {
  it('пары сортируются по имени и раскодируются, путь приводится к виду сайта', () => {
    expect(parseFrom('/?p=12')).toBe('/?p=12');
    expect(parseFrom('/index.php/?page_id=5&lang=de')).toBe(
      '/index.php?lang=de&page_id=5'
    );
    expect(parseFrom('/?s=k%C3%BCche')).toBe('/?s=k%C3%BCche');
    expect(prefixOf('/?a=*')).toBeNull();
    expect(queryOf('/?p=12')).toEqual({ path: '/', params: [['p', '12']] });
    expect(queryOf('/old')).toBeNull();
  });

  it('подходит, если все пары есть в query; лишние параметры не мешают, больше пар — точнее', () => {
    const index = indexRules([
      rule(1, '/?p=12', '[~12~]'),
      rule(2, '/?lang=en&p=12', '/en/post'),
      rule(3, '/old', '/new'),
    ]);
    expect(matchQuery(index, '/', { p: '12', utm_source: 'x' })).toEqual({
      id: 1,
      to: '[~12~]',
      status: 301,
      consumed: ['p'],
    });
    expect(matchQuery(index, '/', { p: '12', lang: 'en' })?.id).toBe(2);
    expect(matchQuery(index, '/', { p: '13' })).toBeNull();
    expect(matchQuery(index, '/', { toString: 'x' })).toBeNull();
    expect(matchQuery(index, '/old', { p: '12' })).toBeNull();
    expect(matchRule(index, '/')).toBeNull();
  });

  it('петля — цель с теми же парами; цель без них — не петля', () => {
    expect(
      code(() => refuseChains(parseRule({ from: '/?p=1', to: '/' }), []))
    ).toBeNull();
    expect(
      code(() =>
        refuseChains(parseRule({ from: '/?p=1', to: '/?p=1&x=2' }), [])
      )
    ).toBe('redirects.loop');
    expect(
      code(() =>
        refuseChains(parseRule({ from: '/a', to: '/?p=1' }), [
          rule(1, '/?p=1', '/b'),
        ])
      )
    ).toBe('redirects.chain');
  });
});

describe('адрес «куда»', () => {
  it('принимает путь с query, полный URL и страницу', () => {
    expect(parseTo('/catalog/?sort=new', false)).toBe('/catalog?sort=new');
    expect(parseTo('https://example.com/a?b=1', false)).toBe(
      'https://example.com/a?b=1'
    );
    expect(parseTo('[~12~]', false)).toBe('[~12~]');
    expect(parseTo('/news/*', true)).toBe('/news/*');
  });

  it('цель с якорем: путь, URL и страница; якорь у цели-раздела и звёздочка у страницы — отказ', () => {
    expect(parseTo('/guide/#section', false)).toBe('/guide#section');
    expect(parseTo('/catalog?sort=new#top', false)).toBe(
      '/catalog?sort=new#top'
    );
    expect(parseTo('https://example.com/a#b', false)).toBe(
      'https://example.com/a#b'
    );
    expect(parseTo('[~12~]#map', false)).toBe('[~12~]#map');
    expect(pageTarget('[~12~]#map')).toBe(12);
    expect(code(() => parseTo('/news/*#top', true))).toBe(
      'redirects.invalid_to'
    );
    expect(code(() => parseTo('[~12~]#x*', true))).toBe('redirects.invalid_to');
  });

  it('звёздочка в цели — только у правила-префикса', () => {
    expect(code(() => parseTo('/news/*', false))).toBe('redirects.invalid_to');
    expect(code(() => parseTo('javascript:alert(1)', false))).toBe(
      'redirects.invalid_to'
    );
    expect(code(() => parseTo('//evil.example', false))).toBe(
      'redirects.invalid_to'
    );
    expect(code(() => parseTo('', false))).toBe('redirects.invalid_to');
  });

  it('код — 301 или 302, заметка короткая', () => {
    expect(parseRule({ from: '/a', to: '/b' }).status).toBe(301);
    expect(parseRule({ from: '/a', to: '/b', status: 302 }).status).toBe(302);
    expect(code(() => parseRule({ from: '/a', to: '/b', status: 307 }))).toBe(
      'redirects.invalid_status'
    );
    expect(
      code(() => parseRule({ from: '/a', to: '/b', note: 'x'.repeat(201) }))
    ).toBe('redirects.invalid_note');
  });
});

describe('поиск правила', () => {
  const index = indexRules([
    rule(1, '/old', '/new'),
    rule(2, '/blog/*', '/news/*'),
    rule(3, '/blog/archive/*', '/archive'),
    rule(4, '/shop/*', 'https://shop.example/*'),
  ]);

  it('точный адрес, длинный префикс раньше короткого, остаток адреса — в цель', () => {
    expect(matchRule(index, '/old')?.to).toBe('/new');
    expect(matchRule(index, '/old/more')).toBeNull();
    expect(matchRule(index, '/blog/2024/post')?.to).toBe('/news/2024/post');
    expect(matchRule(index, '/blog')?.to).toBe('/news');
    expect(matchRule(index, '/blogger')).toBeNull();
    expect(matchRule(index, '/blog/archive/2020')?.to).toBe('/archive');
    expect(matchRule(index, '/shop/cart')?.to).toBe(
      'https://shop.example/cart'
    );
  });
});

describe('петли и цепочки', () => {
  const others = [rule(1, '/a', '/b'), rule(2, '/docs/*', '/help/*')];

  it('правило на само себя — петля', () => {
    expect(
      code(() => refuseChains(parseRule({ from: '/x', to: '/x' }), []))
    ).toBe('redirects.loop');
    expect(
      code(() => refuseChains(parseRule({ from: '/a/*', to: '/a/b/*' }), []))
    ).toBe('redirects.loop');
  });

  it('цель, которая переадресуется дальше, и правило, на которое ведёт другое, — цепочки', () => {
    expect(
      code(() => refuseChains(parseRule({ from: '/c', to: '/a' }), others))
    ).toBe('redirects.chain');
    expect(
      code(() => refuseChains(parseRule({ from: '/b', to: '/z' }), others))
    ).toBe('redirects.chain');
    expect(
      code(() =>
        refuseChains(
          parseRule({ from: '/old-docs', to: '/docs/start' }),
          others
        )
      )
    ).toBe('redirects.chain');
    expect(
      code(() => refuseChains(parseRule({ from: '/c', to: '/d' }), others))
    ).toBeNull();
    expect(
      code(() =>
        refuseChains(
          parseRule({ from: '/c', to: 'https://example.com/a' }),
          others
        )
      )
    ).toBeNull();
  });
});

describe('CSV', () => {
  it('выгрузка читается обратно: кавычки, запятые и переносы внутри', () => {
    const rules = [
      { ...rule(1, '/a', '/b'), note: 'акция, «весна»' },
      { ...rule(2, '/c', 'https://example.com/?q="x"'), note: 'две\nстроки' },
    ];
    const rows = parseCsv(rulesToCsv(rules));
    expect(rows[0]!.cells.slice(0, 4)).toEqual(['from', 'to', 'code', 'note']);
    expect(rows[1]!.cells.slice(0, 4)).toEqual([
      '/a',
      '/b',
      '301',
      'акция, «весна»',
    ]);
    expect(rows[2]!.cells[1]).toBe('https://example.com/?q="x"');
    expect(rows[2]!.cells[3]).toBe('две\nстроки');
  });

  it('точка с запятой русского Excel, номера строк и пустые строки', () => {
    const rows = parseCsv('﻿from;to\n\n/a;/b\n/c;/d;302\n');
    expect(rows.map((_) => _.line)).toEqual([1, 3, 4]);
    expect(rows[2]!.cells).toEqual(['/c', '/d', '302']);
  });
});
