import { describe, expect, it } from 'bun:test';
import { aliasFromTitle, parseAlias } from './alias.ts';

describe('parseAlias', () => {
  it.each(['about', 'o-proekte', '2026', 'a1-b2', 'feed.xml', 'robots.txt'])(
    'принимает %p',
    (raw) => {
      expect(parseAlias(raw) as string).toBe(raw);
    }
  );

  it.each([
    '',
    'About',
    'a--b',
    '-a',
    'a-',
    'a_b',
    'о-нас',
    'a'.repeat(101),
    '.xml',
    'feed.',
    'a.b.c',
    'feed.XML',
  ])('отклоняет %p', (raw) => {
    expect(() => parseAlias(raw)).toThrow('must be lowercase');
  });
});

describe('aliasFromTitle', () => {
  it.each([
    ['О проекте', 'o-proekte'],
    ['Контакты', 'kontakty'],
    ['Щука и ёж', 'schuka-i-ezh'],
    ['Café — Menu!', 'cafe-menu'],
    ['  Hello,   World  ', 'hello-world'],
    ['Straße', 'strasse'],
    ['Łódź', 'lodz'],
    ['Smørrebrød', 'smorrebrod'],
    ['Ærø', 'aero'],
    ['İstanbul ılık', 'istanbul-ilik'],
    ['Đorđe', 'dorde'],
    ['Œuvre', 'oeuvre'],
    ['Über uns', 'uber-uns'],
  ])('%p → %p', (title, alias) => {
    expect(aliasFromTitle(title) as string).toBe(alias);
  });

  it('у немецкой страницы умлауты — с e, у остальных — без точек', () => {
    expect(aliasFromTitle('Über uns: Größe', 'de') as string).toBe(
      'ueber-uns-groesse'
    );
    expect(aliasFromTitle('Ärzte', 'de-AT') as string).toBe('aerzte');
    expect(aliasFromTitle('Ürünler', 'tr') as string).toBe('urunler');
    expect(aliasFromTitle('Hämeenlinna', 'fi') as string).toBe('hameenlinna');
  });

  it('отказывает, если в заголовке нет букв и цифр', () => {
    expect(() => aliasFromTitle('!!!')).toThrow('Cannot derive');
  });
});
