import { describe, expect, it } from 'bun:test';
import {
  canonicalPath,
  cleanPath,
  endingOf,
  markdownPath,
  pageUrl,
} from './canonical-path.ts';

describe('canonicalPath', () => {
  it.each([
    ['/', '/'],
    ['/about', '/about'],
    ['/about/', '/about'],
    ['//about//team/', '/about/team'],
  ])('%p → %p', (path, canonical) => {
    expect(canonicalPath(path)).toBe(canonical);
  });

  it.each(['/../etc', '/a/./b', '/a\0b'])(
    '%p не может вести на страницу',
    (path) => {
      expect(canonicalPath(path)).toBeNull();
    }
  );
});

it('главная всегда по /', () => {
  expect(pageUrl({ id: 1, path: '/glavnaya' }, 1)).toBe('/');
  expect(pageUrl({ id: 2, path: '/about' }, 1)).toBe('/about');
});

describe('cleanPath', () => {
  it.each([
    ['/', '/'],
    ['//', '/'],
    ['/katalog/', '/katalog/'],
    ['//katalog//page-2/', '/katalog/page-2/'],
    ['/o-nas.html', '/o-nas.html'],
  ])('%p → %p: завершающий слэш остаётся', (path, clean) => {
    expect(cleanPath(path)).toBe(clean);
  });

  it('небезопасный путь — null', () => {
    expect(cleanPath('/a/../b/')).toBeNull();
  });
});

it('окончание — то, что идёт после алиаса', () => {
  expect(endingOf({ path: '/katalog/', alias: 'katalog' })).toBe('/');
  expect(endingOf({ path: '/baran/ofis.html', alias: 'ofis' })).toBe('.html');
  expect(endingOf({ path: '/sitemap.xml', alias: 'sitemap.xml' })).toBe('');
  expect(endingOf({ path: '/blog', alias: 'blog' })).toBe('');
});

it('Markdown-версия — адрес без окончания и .md, главная — /index.md', () => {
  expect(markdownPath('/katalog/', '/')).toBe('/katalog.md');
  expect(markdownPath('/o-nas.html', '.html')).toBe('/o-nas.md');
  expect(markdownPath('/blog', '')).toBe('/blog.md');
  expect(markdownPath('/', '/')).toBe('/index.md');
});
