import { describe, expect, it } from 'bun:test';
import {
  type AddressNode,
  addressClash,
  addressEnding,
  addressKey,
  addressVariants,
  branchAddresses,
  PLAIN_ADDRESS,
  rivalAliases,
} from './address.ts';

const EVO = { suffix: '.html', folderSlash: true };

const node = (
  id: number,
  parentId: number | null,
  alias: string,
  extra: Partial<AddressNode> = {}
): AddressNode => ({
  id,
  parentId,
  alias,
  folder: false,
  aliasInPath: true,
  ...extra,
});

describe('окончание адреса', () => {
  it('папка — /, документ — суффикс, алиас с точкой — без суффикса', () => {
    expect(addressEnding({ alias: 'katalog', folder: true }, EVO)).toBe('/');
    expect(addressEnding({ alias: 'o-nas', folder: false }, EVO)).toBe('.html');
    expect(addressEnding({ alias: 'sitemap.xml', folder: false }, EVO)).toBe(
      ''
    );
  });

  it('без «папок со слэшем» папка получает суффикс, как в Evo', () => {
    expect(
      addressEnding(
        { alias: 'katalog', folder: true },
        { suffix: '.html', folderSlash: false }
      )
    ).toBe('.html');
  });

  it('по умолчанию окончания нет', () => {
    expect(addressEnding({ alias: 'blog', folder: true }, PLAIN_ADDRESS)).toBe(
      ''
    );
  });
});

describe('ключ адреса', () => {
  it.each([
    ['/katalog/', '/katalog'],
    ['/o-nas.html', '/o-nas'],
    ['/o-nas.html/', '/o-nas'],
    ['/o-nas', '/o-nas'],
    ['/sitemap.xml', '/sitemap.xml'],
    ['/', '/'],
    ['/.html', '/.html'],
    ['/katalog/.html', '/katalog/.html'],
  ])('%p → %p', (path, key) => {
    expect(addressKey(path, EVO)).toBe(key);
  });

  it('варианты: как есть, без /, без окончания, с / и с суффиксом', () => {
    expect(addressVariants('/o-nas', EVO)).toEqual([
      '/o-nas',
      '/o-nas/',
      '/o-nas.html',
    ]);
    expect(addressVariants('/katalog/', PLAIN_ADDRESS)).toEqual([
      '/katalog/',
      '/katalog',
    ]);
    expect(addressVariants('/', EVO)).toEqual(['/']);
  });
});

describe('адреса ветки', () => {
  it('скрытый из адреса алиас не входит в адреса потомков, сама страница — со своим', () => {
    const cities = node(2, null, 'cities', { aliasInPath: false });
    expect(
      branchAddresses(
        cities,
        [node(3, 2, 'baran', { folder: true }), node(4, 3, 'ofis')],
        '',
        EVO
      )
    ).toEqual([
      { id: 2, key: '/cities', url: '/cities.html' },
      { id: 3, key: '/baran', url: '/baran/' },
      { id: 4, key: '/baran/ofis', url: '/baran/ofis.html' },
    ]);
  });

  it('соперники по адресу — тот же алиас, с суффиксом и без него', () => {
    expect(rivalAliases('o-nas', EVO)).toEqual(['o-nas', 'o-nas.html']);
    expect(rivalAliases('o-nas.html', EVO)).toEqual([
      'o-nas.html',
      'o-nas.html.html',
      'o-nas',
    ]);
    expect(rivalAliases('o-nas', PLAIN_ADDRESS)).toEqual(['o-nas']);
  });

  it('совпадение ключа или адреса — столкновение, своя же страница — нет', () => {
    const mine = [{ id: 5, key: '/baran', url: '/baran/' }];
    expect(
      addressClash(mine, [{ id: 9, key: '/baran', url: '/baran.html' }])
    ).toEqual({ page: 5, url: '/baran/', other: 9 });
    expect(
      addressClash(
        [{ id: 5, key: '/o-nas', url: '/o-nas.html' }],
        [{ id: 7, key: '/o-nas.html', url: '/o-nas.html' }]
      )
    ).toEqual({ page: 5, url: '/o-nas.html', other: 7 });
    expect(addressClash(mine, [{ id: 5, key: '/baran', url: '/baran/' }])).toBe(
      null
    );
    expect(
      addressClash(
        [
          { id: 5, key: '/a', url: '/a/' },
          { id: 6, key: '/a', url: '/a.html' },
        ],
        []
      )
    ).toEqual({ page: 6, url: '/a.html', other: 5 });
  });
});
