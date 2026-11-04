import { describe, expect, it } from 'bun:test';
import { windowsInfo, windowsVersion } from '../scripts/binary.ts';
import { ICON_SIZES, renderIcon } from '../scripts/icon.ts';

// Сборка под Windows (ADR 0049): значок из favicon.svg и сведения о файле .exe.

describe('значок cms.exe', () => {
  it('ICO из favicon.svg: семь размеров, первым 256 в PNG, остальные — 32-битный BMP с маской', async () => {
    const ico = await renderIcon();
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect([view.getUint16(0, true), view.getUint16(2, true)]).toEqual([0, 1]);
    expect(view.getUint16(4, true)).toBe(7);
    const entries = ICON_SIZES.map((size, index) => {
      const at = 6 + 16 * index;
      return {
        size,
        width: view.getUint8(at) || 256,
        bits: view.getUint16(at + 6, true),
        length: view.getUint32(at + 8, true),
        offset: view.getUint32(at + 12, true),
      };
    });
    expect(entries.map((_) => _.width)).toEqual([256, 128, 64, 48, 32, 24, 16]);
    expect(entries.every((_) => _.bits === 32)).toBe(true);
    // PNG — по подписи, BMP — заголовок BITMAPINFOHEADER: ширина и удвоенная высота (картинка + маска).
    const first = entries[0]!;
    expect([...ico.subarray(first.offset, first.offset + 4)]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    entries.slice(1).forEach((_) => {
      expect(view.getUint32(_.offset, true)).toBe(40);
      expect(view.getInt32(_.offset + 4, true)).toBe(_.size);
      expect(view.getInt32(_.offset + 8, true)).toBe(_.size * 2);
      expect(_.length).toBe(
        40 + _.size * _.size * 4 + Math.ceil(_.size / 32) * 4 * _.size
      );
    });
    const last = entries.at(-1)!;
    expect(last.offset + last.length).toBe(ico.byteLength);
  });

  it('один и тот же файл при каждой сборке', async () => {
    expect(await renderIcon()).toEqual(await renderIcon());
  });
});

describe('сведения о файле', () => {
  it('версия — четыре числа: номер пре-релиза — четвёртым', () => {
    expect(windowsVersion('0.1.0-alpha.9')).toBe('0.1.0.9');
    expect(windowsVersion('0.1.0-beta.12')).toBe('0.1.0.12');
    expect(windowsVersion('1.2.3')).toBe('1.2.3.0');
    expect(windowsVersion('2.0.0-rc')).toBe('2.0.0.0');
  });

  it('название, описание, издатель и лицензия — из продукта', () => {
    expect(windowsInfo('eile.ico', '0.1.0-alpha.9')).toMatchObject({
      icon: 'eile.ico',
      title: 'Eile',
      description: 'Eile CMS',
      version: '0.1.0.9',
    });
    expect(windowsInfo('eile.ico', '1.0.0').copyright).toContain(
      'GPL-3.0-or-later'
    );
  });
});
