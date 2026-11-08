import { describe, expect, it } from 'bun:test';
import {
  assignLinkedPaths,
  linkedPath,
  linkedSegment,
  parseLinkPrefix,
  prefixesOverlap,
  takenBy,
} from './linked.ts';
import { type MediaPath, parseMediaPath } from './media.ts';

describe('имя файла связанной папки', () => {
  it.each([
    ['4a_(5).jpg', '4a-5.jpg'],
    ['4a_-(10).jpg', '4a-10.jpg'],
    ['Screenshot_19.jpg', 'screenshot_19.jpg'],
    ['Притыцкого 89.jpg', 'pritytskogo-89.jpg'],
    ['балтийский 2.JPG', 'baltiyskiy-2.jpg'],
    ['ЛС_010.jpg', 'ls_010.jpg'],
    ['2 (1).png', '2-1.png'],
    ['logo@2x.png', 'logo-2x.png'],
    ['Café Menü.webp', 'cafe-menu.webp'],
    ['Мінск_ўезд.jpg', 'minsk_uezd.jpg'],
    ['  --file--.pdf', 'file.pdf'],
    ['proudcts', 'proudcts'],
  ])('%p → %p', (raw, name) => {
    expect(linkedSegment(raw)).toBe(name);
  });

  it('от части без латиницы и цифр остаётся хэш, а не пустота', () => {
    expect(linkedSegment('文件')).toMatch(/^x-[0-9a-f]{8}$/);
    expect(linkedSegment('文件')).toBe(linkedSegment('文件'));
    expect(linkedSegment('文件')).not.toBe(linkedSegment('写真'));
  });

  it('путь медиатеки — приставка и части по правилу, и он проходит правила медиатеки', () => {
    const path = linkedPath('assets', 'images/Фото/Притыцкого 89.JPG');
    expect(path).toBe('assets/images/foto/pritytskogo-89.jpg');
    expect(parseMediaPath(path)).toBe(path as MediaPath);
  });

  it('длинный путь укорачивается до 255 знаков с хэшем исходного пути', () => {
    const long = `${'очень длинное имя '.repeat(20)}.jpg`;
    const path = linkedPath('assets', long);
    expect(path.length).toBeLessThanOrEqual(255);
    expect(path.endsWith('.jpg')).toBe(true);
    expect(linkedPath('assets', `${long.slice(0, -4)}2.jpg`)).not.toBe(path);
  });
});

const plain = (names: ReadonlyMap<string, MediaPath>): Record<string, string> =>
  Object.fromEntries(names);

describe('столкновения имён', () => {
  it('одинаковые имена — -2, -3 по порядку путей на диске', () => {
    const names = assignLinkedPaths(
      'assets',
      ['images/photo.jpg', 'images/Photo.jpg', 'images/PHOTO.JPG'],
      takenBy([])
    );
    expect(plain(names)).toEqual({
      'images/PHOTO.JPG': 'assets/images/photo.jpg',
      'images/Photo.jpg': 'assets/images/photo-2.jpg',
      'images/photo.jpg': 'assets/images/photo-3.jpg',
    });
  });

  it('картинки с одной основой разводятся: у них были бы общие варианты; документ — нет', () => {
    const names = assignLinkedPaths(
      'assets',
      ['x.jpg', 'x.png', 'x.pdf'],
      takenBy([])
    );
    expect(plain(names)).toEqual({
      'x.jpg': 'assets/x.jpg',
      'x.pdf': 'assets/x.pdf',
      'x.png': 'assets/x-2.png',
    });
  });

  it('занятое файлами медиатеки не отдаётся', () => {
    const names = assignLinkedPaths(
      'assets',
      ['logo.png', 'a.txt'],
      takenBy([
        { path: 'assets/logo.png' as MediaPath },
        { path: 'assets/a.txt' as MediaPath },
        { path: 'assets/a-2.txt' as MediaPath },
      ])
    );
    expect(plain(names)).toEqual({
      'a.txt': 'assets/a-3.txt',
      'logo.png': 'assets/logo-2.png',
    });
  });
});

describe('приставка связанной папки', () => {
  it('путь медиатеки без файла; «/» по краям не в счёт', () => {
    expect(parseLinkPrefix('/assets/')).toBe('assets');
    expect(parseLinkPrefix('old/images')).toBe('old/images');
  });

  it.each([
    ['', 'media.invalid_prefix'],
    ['Assets', 'media.invalid_prefix'],
    ['a b', 'media.invalid_prefix'],
    ['manager', 'media.reserved_prefix'],
    ['media/old', 'media.reserved_prefix'],
  ])('%p — отказ %p', (raw, code) => {
    expect(() => parseLinkPrefix(raw)).toThrow(
      expect.objectContaining({ code })
    );
  });

  it('вложенные приставки пересекаются', () => {
    expect(prefixesOverlap('assets', 'assets/images')).toBe(true);
    expect(prefixesOverlap('assets', 'assets')).toBe(true);
    expect(prefixesOverlap('assets', 'assets2')).toBe(false);
  });
});
