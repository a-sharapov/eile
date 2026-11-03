import { describe, expect, it } from 'bun:test';
import {
  classify,
  type Hop,
  parseUrlList,
  rebase,
  shownUrl,
  summarize,
  type UrlEntry,
  uniqueEntries,
} from './redirect-check.ts';

const ORIGIN = 'https://new.example';

const entry = (
  input: string,
  expected: string | null = null
): UrlEntry & { readonly url: string } => ({
  input,
  expected,
  line: 1,
  url: rebase(input, ORIGIN),
});

const hop = (
  url: string,
  status: number | null,
  location: string | null = null
): Hop => ({
  url: new URL(url, ORIGIN).href,
  status,
  location: location === null ? null : new URL(location, ORIGIN).href,
});

const outcome = (
  input: string,
  hops: readonly Hop[],
  expected: string | null = null
) => classify(entry(input, expected), hops, ORIGIN);

describe('список старых адресов', () => {
  it('по адресу в строке; комментарии, пустые строки и стрелки не в счёт', () => {
    expect(
      parseUrlList(
        '﻿# старый сайт\n/uber-uns/ /ueber-uns\n\n  /kontakte/ -> /kontakt  # из меню\nhttps://a.de/x#anker\n'
      )
    ).toEqual([
      { input: '/uber-uns/', expected: '/ueber-uns', line: 2 },
      { input: '/kontakte/', expected: '/kontakt', line: 4 },
      { input: 'https://a.de/x#anker', expected: null, line: 5 },
    ]);
  });

  it('адрес старого сайта — путь и query на проверяемом, без хоста и якоря', () => {
    expect(rebase('https://old.de/a/b/?p=1#top', ORIGIN)).toBe(
      'https://new.example/a/b/?p=1'
    );
    expect(rebase('uber-uns/', ORIGIN)).toBe('https://new.example/uber-uns/');
    expect(rebase('//old.de/x', ORIGIN)).toBe('https://new.example/x');
    expect(rebase('/küche', ORIGIN)).toBe('https://new.example/k%C3%BCche');
    expect(rebase('http://[битый', ORIGIN)).toStartWith('https://new.example/');
  });

  it('одинаковые адреса — один раз, ожидание — у первого, где оно есть', () => {
    expect(
      uniqueEntries(
        [
          { input: 'https://old.de/a/', expected: null, line: 1 },
          { input: '/b', expected: null, line: 2 },
          { input: '/a/', expected: '/neu', line: 3 },
        ],
        ORIGIN
      ).map((_) => [_.input, _.expected, _.line])
    ).toEqual([
      ['https://old.de/a/', '/neu', 1],
      ['/b', null, 2],
    ]);
  });
});

describe('итог адреса', () => {
  it('один постоянный переход и 200 — в порядке; 200 сразу — тоже', () => {
    expect(
      outcome('/a/', [hop('/a/', 301, '/a'), hop('/a', 200)])
    ).toMatchObject({ outcome: 'moved', ok: true, slash: 'removed' });
    expect(
      outcome('/a/', [hop('/a/', 308, '/b/'), hop('/b/', 200)])
    ).toMatchObject({ outcome: 'moved', slash: 'kept' });
    expect(
      outcome('/app/', [hop('/app/', 301, '/'), hop('/', 200)]).slash
    ).toBe('removed');
    expect(outcome('/', [hop('/', 200)])).toMatchObject({
      outcome: 'same',
      ok: true,
      slash: 'none',
      query: 'none',
    });
  });

  it('цепочка, временная переадресация, петля, предел переходов', () => {
    expect(
      outcome('/a/', [
        hop('/a/', 301, '/a'),
        hop('/a', 301, '/b'),
        hop('/b', 200),
      ]).outcome
    ).toBe('chain');
    expect(outcome('/a', [hop('/a', 302, '/b'), hop('/b', 200)]).outcome).toBe(
      'temporary'
    );
    expect(
      outcome('/a', [hop('/a', 301, '/b'), hop('/b', 301, '/a')]).outcome
    ).toBe('loop');
    expect(
      outcome('/a', [hop('/a', 301, '/b'), hop('/b', 301, '/c')]).outcome
    ).toBe('too_many');
  });

  it('другой хост, 404, ошибка, нет ответа', () => {
    expect(
      outcome('/a', [hop('/a', 301, 'https://other.example/a')])
    ).toMatchObject({ outcome: 'external', ok: false });
    expect(
      outcome('/a/', [hop('/a/', 301, '/a'), hop('/a', 404)]).outcome
    ).toBe('not_found');
    expect(outcome('/a', [hop('/a', 410)]).outcome).toBe('not_found');
    expect(outcome('/a', [hop('/a', 500)]).outcome).toBe('error');
    expect(outcome('/a', [hop('/a', 301)]).outcome).toBe('error');
    expect(
      outcome('/a', [{ ...hop('/a', null), error: 'refused' }]).outcome
    ).toBe('unreachable');
  });

  it('ожидание: тот же путь — в порядке, другой — не туда; query сравнивается, если он в ожидании', () => {
    const moved = [
      hop('/uber-uns/', 301, '/ueber-uns'),
      hop('/ueber-uns', 200),
    ];
    expect(outcome('/uber-uns/', moved, '/ueber-uns').outcome).toBe('moved');
    expect(
      outcome('/uber-uns/', moved, 'https://kuechenly.de/ueber-uns').outcome
    ).toBe('moved');
    expect(outcome('/uber-uns/', moved, '/').outcome).toBe('wrong_target');
    expect(
      outcome('/x', [hop('/x', 301, '/y?a=1'), hop('/y?a=1', 200)], '/y?a=2')
        .outcome
    ).toBe('wrong_target');
  });

  it('адрес с query отвечает сам — ошибка; с ожиданием этого адреса — нет', () => {
    expect(outcome('/?p=12', [hop('/?p=12', 200)])).toMatchObject({
      outcome: 'query_ignored',
      query: 'kept',
    });
    expect(outcome('/?p=12', [hop('/?p=12', 200)], '/').outcome).toBe('same');
  });

  it('что стало с query: дошёл, потерялся, изменился', () => {
    expect(
      outcome('/a/?utm=x', [
        hop('/a/?utm=x', 301, '/b?sort=new&utm=x'),
        hop('/b?sort=new&utm=x', 200),
      ]).query
    ).toBe('kept');
    expect(
      outcome('/a?utm=x', [hop('/a?utm=x', 301, '/b'), hop('/b', 200)]).query
    ).toBe('dropped');
    expect(
      outcome('/a?utm=x', [
        hop('/a?utm=x', 301, '/b?utm=y'),
        hop('/b?utm=y', 200),
      ]).query
    ).toBe('changed');
  });

  it('сводка: всего, в порядке, ошибки по итогам, слэши и query', () => {
    const summary = summarize([
      outcome('/a/', [hop('/a/', 301, '/a'), hop('/a', 200)]),
      outcome('/b/', [hop('/b/', 301, '/b'), hop('/b', 404)]),
      outcome('/?p=1', [hop('/?p=1', 200)]),
    ]);
    expect(summary).toEqual({
      total: 3,
      ok: 1,
      failed: 2,
      outcomes: { moved: 1, not_found: 1, query_ignored: 1 },
      query: { kept: 1, dropped: 0, changed: 0 },
      slash: { removed: 2, kept: 0 },
    });
  });

  it('адрес для человека: свой — путь, чужой — целиком, кодировка раскрыта', () => {
    expect(shownUrl('https://new.example/k%C3%BCche?x=1', ORIGIN)).toBe(
      '/küche?x=1'
    );
    expect(shownUrl('https://other.example/a', ORIGIN)).toBe(
      'https://other.example/a'
    );
  });
});
