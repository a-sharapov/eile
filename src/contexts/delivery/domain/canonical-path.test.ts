import { describe, expect, it } from 'bun:test';
import { canonicalPath, pageUrl } from './canonical-path.ts';

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
