import { describe, expect, it } from 'bun:test';
import {
  type PagerItem,
  pagerWindow,
  pagingPath,
  pagingTail,
  pagingTitle,
  withTitleSuffix,
} from './paging.ts';

describe('pagingTail', () => {
  it.each([
    ['/blog/page-2', { base: '/blog', number: 2 }],
    ['/a/b/page-15', { base: '/a/b', number: 15 }],
    ['/page-3', { base: '/', number: 3 }],
    ['/blog/page-1', { base: '/blog', number: 1 }],
  ])('%p → хвост', (path, paging) => {
    expect(pagingTail(path, 'page')).toEqual(paging);
  });

  it.each([
    '/blog',
    '/blog/page-02',
    '/blog/page-0',
    '/blog/page-x',
    '/blog/page-',
    '/blog/landing-page-2',
    '/blog/page-1234567',
  ])('%p — не страница списка', (path) => {
    expect(pagingTail(path, 'page')).toBeNull();
  });

  it('слово страниц задаёт сайт', () => {
    expect(pagingTail('/blog/stranica-2', 'stranica')).toEqual({
      base: '/blog',
      number: 2,
    });
    expect(pagingTail('/blog/page-2', 'stranica')).toBeNull();
  });
});

describe('pagingPath', () => {
  it('первая страница — адрес самой страницы', () => {
    expect(pagingPath('/blog', 'page', 1)).toBe('/blog');
    expect(pagingPath('/', 'page', 1)).toBe('/');
  });

  it('остальные — с хвостом, у главной без двойного слэша', () => {
    expect(pagingPath('/blog', 'page', 3)).toBe('/blog/page-3');
    expect(pagingPath('/', 'page', 2)).toBe('/page-2');
  });
});

it('«страница N» на языке страницы, перевод сайта важнее', () => {
  expect(pagingTitle(null, 'ru', 2)).toBe('страница 2');
  expect(pagingTitle(null, 'en-GB', 3)).toBe('page 3');
  expect(pagingTitle(null, 'xx', 4)).toBe('page 4');
  expect(pagingTitle('стр. {n}', 'ru', 5)).toBe('стр. 5');
});

it('суффикс дописывается в первый <title> и экранируется', () => {
  expect(
    withTitleSuffix('<title>Блог — Сайт</title><meta>', ' — страница 2')
  ).toBe('<title>Блог — Сайт — страница 2</title><meta>');
  expect(withTitleSuffix('<meta>', ' — 2')).toBe('<meta>');
  expect(withTitleSuffix('<title>A</title>', ' <b>')).toBe(
    '<title>A &lt;b></title>'
  );
});

describe('pagerWindow', () => {
  const show = (items: PagerItem[]): string =>
    items
      .map((_) =>
        _.kind === 'gap' ? '…' : _.current ? `[${_.number}]` : `${_.number}`
      )
      .join(' ');
  const window = (current: number, pages: number, around = 1) =>
    show(pagerWindow(current, pages, around, (_) => `/blog/page-${_}`));

  it.each([
    [1, 1, '[1]'],
    [1, 3, '[1] 2 3'],
    [1, 10, '[1] 2 … 10'],
    [5, 10, '1 … 4 [5] 6 … 10'],
    [10, 10, '1 … 9 [10]'],
    [4, 10, '1 2 3 [4] 5 … 10'],
    [7, 10, '1 … 6 [7] 8 9 10'],
  ])('страница %p из %p: %p', (current, pages, expected) => {
    expect(window(current, pages)).toBe(expected);
  });

  it('ссылки и текущая страница', () => {
    expect(pagerWindow(2, 2, 1, (_) => `/p${_}`)).toEqual([
      { kind: 'page', number: 1, url: '/p1', current: false },
      { kind: 'page', number: 2, url: '/p2', current: true },
    ]);
  });
});
