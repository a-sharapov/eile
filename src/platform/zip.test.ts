import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../shared/kernel/errors.ts';
import { posixPath } from './paths.ts';
import { listZip, readZipRecord, unzipFile, ZIP_EPOCH, zip } from './zip.ts';

const _bytes = (text: string) => new TextEncoder().encode(text);

const _code = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : String(error);
  }
};

describe('zip', () => {
  it('что упаковано, то и читается: несколько файлов, пустой, сжатие deflate', () => {
    const big = _bytes('Eile '.repeat(10_000));
    const archive = zip([
      { name: 'cms.exe', data: big },
      { name: 'README.txt', data: _bytes('привет') },
      { name: 'empty', data: new Uint8Array() },
    ]);
    expect(archive.byteLength).toBeLessThan(big.byteLength / 10);
    expect(unzipFile(archive, 'cms.exe')).toEqual(big);
    expect(new TextDecoder().decode(unzipFile(archive, 'README.txt'))).toBe(
      'привет'
    );
    expect(unzipFile(archive, 'empty').byteLength).toBe(0);
  });

  it('заголовки по формату: подписи, время DOS, имена в UTF-8', () => {
    const archive = zip(
      [{ name: 'cms.exe', data: _bytes('x') }],
      new Date(2026, 10, 3, 21, 30, 10)
    );
    const view = new DataView(archive.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true)).toBe(0x0800);
    expect(view.getUint16(8, true)).toBe(8);
    expect(view.getUint16(10, true)).toBe((21 << 11) | (30 << 5) | 5);
    expect(view.getUint16(12, true)).toBe((46 << 9) | (11 << 5) | 3);
    expect(view.getUint32(archive.byteLength - 22, true)).toBe(0x06054b50);
  });

  it('чужой zip с комментарием и файлом без сжатия читается', () => {
    // Собран вручную: один файл «a.txt» методом store и комментарий архива.
    const name = _bytes('a.txt');
    const data = _bytes('stored');
    const crc = Bun.hash.crc32(data);
    const u16 = (n: number) => [n & 0xff, n >>> 8];
    const u32 = (n: number) => [...u16(n & 0xffff), ...u16(n >>> 16)];
    const local = [
      ...u32(0x04034b50),
      ...u16(10),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...data,
    ];
    const central = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(10),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(0),
      ...name,
    ];
    const comment = _bytes('made by hand');
    const end = [
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(1),
      ...u16(1),
      ...u32(central.length),
      ...u32(local.length),
      ...u16(comment.length),
      ...comment,
    ];
    const archive = Uint8Array.from([...local, ...central, ...end]);
    expect(new TextDecoder().decode(unzipFile(archive, 'a.txt'))).toBe(
      'stored'
    );
  });

  it('нет файла, не zip, испорченные данные — понятные отказы', () => {
    const archive = zip([
      { name: 'cms.exe', data: _bytes('Eile '.repeat(50)) },
    ]);
    expect(_code(() => unzipFile(archive, 'eile.exe'))).toBe(
      'archive.zip_missing'
    );
    expect(_code(() => unzipFile(_bytes('not a zip at all, sorry'), 'x'))).toBe(
      'archive.zip_invalid'
    );
    const broken = archive.slice();
    broken[40] = (broken[40] ?? 0) ^ 0xff;
    expect(_code(() => unzipFile(broken, 'cms.exe'))).not.toBeNull();
  });
});

// Смещение записи каталога номер `index`: подпись 0x02014b50.
const _central = (archive: Uint8Array, index: number): number =>
  [...archive.keys()].filter(
    (at) =>
      at + 4 <= archive.byteLength &&
      new DataView(archive.buffer).getUint32(at, true) === 0x02014b50
  )[index]!;

describe('zip: каталог и распаковка с пределом', () => {
  it('store — файлы как есть, один архив при одних файлах и времени', () => {
    const files = [
      { name: 'b.txt', data: _bytes('второй') },
      { name: 'a.txt', data: _bytes('первый '.repeat(100)) },
    ];
    const once = zip(files, ZIP_EPOCH, 'store');
    expect(zip(files, ZIP_EPOCH, 'store')).toEqual(once);
    expect(once.byteLength).toBeGreaterThan(700);
    expect(listZip(once).map((_) => [_.name, _.method, _.size])).toEqual([
      ['b.txt', 0, 12],
      ['a.txt', 0, 1300],
    ]);
    // Время DOS — 1 января 1980 в любом часовом поясе.
    const view = new DataView(once.buffer);
    expect([view.getUint16(10, true), view.getUint16(12, true)]).toEqual([
      0,
      (1 << 5) | 1,
    ]);
    expect(new TextDecoder().decode(unzipFile(once, 'b.txt'))).toBe('второй');
  });

  it('символьная ссылка и шифрование видны по каталогу, до распаковки', () => {
    const archive = zip([
      { name: 'link', data: _bytes('/etc/passwd') },
      { name: 'secret', data: _bytes('x') },
    ]);
    const view = new DataView(archive.buffer);
    view.setUint32(_central(archive, 0) + 38, (0o120777 << 16) >>> 0, true);
    view.setUint16(_central(archive, 1) + 8, 0x0801, true);
    expect(
      listZip(archive).map((_) => [_.name, _.symlink, _.encrypted])
    ).toEqual([
      ['link', true, false],
      ['secret', false, true],
    ]);
    expect(_code(() => readZipRecord(archive, listZip(archive)[1]!))).toBe(
      'archive.zip_unsupported'
    );
  });

  it('заголовок, который занижает размер, не раздувает память: отказ', () => {
    const archive = zip([
      { name: 'bomb', data: new Uint8Array(4 * 1024 * 1024) },
    ]);
    expect(archive.byteLength).toBeLessThan(10_000);
    const view = new DataView(archive.buffer);
    view.setUint32(_central(archive, 0) + 24, 1024, true);
    expect(_code(() => readZipRecord(archive, listZip(archive)[0]!))).toBe(
      'archive.zip_invalid'
    );
  });

  it('смещения за концом файла — понятный отказ, а не RangeError', () => {
    const archive = zip([{ name: 'a', data: _bytes('a') }]);
    const view = new DataView(archive.buffer);
    view.setUint32(archive.byteLength - 22 + 16, 0x7fffffff, true);
    expect(_code(() => listZip(archive))).toBe('archive.zip_invalid');
  });
});

describe('пути через «/»', () => {
  it('разделитель Windows становится «/», на Linux путь как есть', () => {
    expect(posixPath('components\\Menu.svelte', '\\')).toBe(
      'components/Menu.svelte'
    );
    expect(posixPath('_app\\immutable\\a.js', '\\')).toBe(
      '_app/immutable/a.js'
    );
    expect(posixPath('components/Menu.svelte', '/')).toBe(
      'components/Menu.svelte'
    );
  });
});
