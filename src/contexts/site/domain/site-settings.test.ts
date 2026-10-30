import { expect, it } from 'bun:test';
import { changeSettings, DEFAULT_SETTINGS } from './site-settings.ts';

it('патч не трогает остальные настройки; null сбрасывает страницу', () => {
  const withHome = changeSettings(DEFAULT_SETTINGS, {
    name: ' Blog ',
    homePageId: 3,
    language: undefined,
  });
  expect(withHome).toEqual({
    ...DEFAULT_SETTINGS,
    name: 'Blog',
    homePageId: 3,
  });
  expect(changeSettings(withHome, { homePageId: null }).homePageId).toBeNull();
});

it.each([
  [{ name: ' ' }, 'cannot be empty'],
  [{ language: 'Russian' }, 'not a language tag'],
  [{ notFoundPageId: -1 }, 'Invalid page id'],
  [{ siteUrl: 'example.com' }, 'not a site address'],
  [{ socialImage: '/media/x.jpg' }, 'not a media path'],
  [{ pagingSegment: 'Page' }, 'not a paging word'],
  [{ pagingSegment: 'page/' }, 'not a paging word'],
  [{ pagingSegment: '-page' }, 'not a paging word'],
  [{ pagingSegment: '' }, 'not a paging word'],
  [{ pagingCanonical: 'next' as 'self' }, 'Paging canonical'],
])('%p отклоняется', (patch, message) => {
  expect(() => changeSettings(DEFAULT_SETTINGS, patch)).toThrow(message);
});

it('адрес сайта — без завершающей косой черты', () => {
  expect(
    changeSettings(DEFAULT_SETTINGS, { siteUrl: ' https://example.com/ ' })
      .siteUrl
  ).toBe('https://example.com');
});

it('слово страниц — латиница через дефис', () => {
  expect(
    changeSettings(DEFAULT_SETTINGS, { pagingSegment: 'stranica-spiska' })
      .pagingSegment
  ).toBe('stranica-spiska');
});

it('объём кэша — целое число мегабайт от 16 до 4096', () => {
  expect(
    changeSettings(DEFAULT_SETTINGS, { pageCacheMb: 256 }).pageCacheMb
  ).toBe(256);
  [8, 5000, 64.5, '64' as unknown as number].forEach(
    (_) =>
      void expect(() =>
        changeSettings(DEFAULT_SETTINGS, { pageCacheMb: _ })
      ).toThrow('Page cache size')
  );
});
