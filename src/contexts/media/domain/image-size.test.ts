import { describe, expect, it } from 'bun:test';
import { imageSize } from './image-size.ts';

// Образцы собираются из байтов прямо в тесте: парсеру нужен заголовок, а не картинка целиком.
type Part = number | readonly number[];

const bytes = (...parts: Part[]): Uint8Array => new Uint8Array(parts.flat());

const u16be = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const u16le = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff];
const u24le = (n: number): number[] => [...u16le(n), (n >> 16) & 0xff];
const u32be = (n: number): number[] => [...u16be(n >>> 16), ...u16be(n)];
const u32le = (n: number): number[] => [...u16le(n), ...u16le(n >>> 16)];
const ascii = (text: string): number[] =>
  Array.from(text, (_) => _.charCodeAt(0));
const zeros = (length: number): number[] => Array(length).fill(0);
const text = (source: string): Uint8Array => new TextEncoder().encode(source);

const size = (width: number, height: number) => ({ width, height });

// PNG: подпись и блоки «длина, тип, данные, CRC».
const pngChunk = (type: string, data: readonly number[]): number[] =>
  ((body) => [
    ...u32be(data.length),
    ...body,
    ...u32be(Bun.hash.crc32(bytes(body))),
  ])([...ascii(type), ...data]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const pngHeader = (width: number, height: number): Uint8Array =>
  bytes(
    PNG_SIGNATURE,
    pngChunk('IHDR', [...u32be(width), ...u32be(height), 8, 2, 0, 0, 0])
  );

// Сжатие zlib без сжатия (блок stored) — чтобы собрать настоящий PNG без node:zlib.
const adler32 = (data: readonly number[]): number =>
  ((sums) => ((sums.b << 16) | sums.a) >>> 0)(
    data.reduce(
      (acc, byte) =>
        ((a) => ({ a, b: (acc.b + a) % 65521 }))((acc.a + byte) % 65521),
      { a: 1, b: 0 }
    )
  );

const stored = (raw: readonly number[]): number[] => [
  0x78,
  0x01,
  0x01,
  ...u16le(raw.length),
  ...u16le(~raw.length & 0xffff),
  ...raw,
  ...u32be(adler32(raw)),
];

const realPng = (width: number, height: number, alpha: boolean): Uint8Array =>
  ((channels) =>
    bytes(
      PNG_SIGNATURE,
      pngChunk('IHDR', [
        ...u32be(width),
        ...u32be(height),
        8,
        alpha ? 6 : 2,
        0,
        0,
        0,
      ]),
      pngChunk(
        'IDAT',
        stored(
          Array.from({ length: height }, (_, y) => [
            0,
            ...Array.from(
              { length: width * channels },
              (_, x) => (x * 7 + y * 13) & 0xff
            ),
          ]).flat()
        )
      ),
      pngChunk('IEND', [])
    ))(alpha ? 4 : 3);

// JPEG: сегменты «FF маркер длина данные»; SOF — точность, высота, ширина, компоненты.
const segment = (marker: number, payload: readonly number[]): number[] => [
  0xff,
  marker,
  ...u16be(payload.length + 2),
  ...payload,
];

const sof = (marker: number, width: number, height: number): number[] =>
  segment(marker, [8, ...u16be(height), ...u16be(width), 1, 1, 0x11, 0]);

const JFIF = segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const DQT = segment(0xdb, [0, ...Array(64).fill(1)]);
const DHT = segment(0xc4, [0, ...zeros(16)]);
const SCAN = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9];

const jpeg = (...segments: Part[]): Uint8Array =>
  bytes([0xff, 0xd8], ...segments, SCAN);

const exif = (orientation: number, little: boolean): number[] =>
  ((u16, u32) =>
    segment(0xe1, [
      ...ascii('Exif'),
      0,
      0,
      ...ascii(little ? 'II' : 'MM'),
      ...u16(42),
      ...u32(8),
      ...u16(2),
      ...u16(0x010f),
      ...u16(2),
      ...u32(4),
      ...ascii('Cam'),
      0,
      ...u16(0x0112),
      ...u16(3),
      ...u32(1),
      ...u16(orientation),
      0,
      0,
      ...u32(0),
    ]))(little ? u16le : u16be, little ? u32le : u32be);

// WebP: RIFF-контейнер, первый блок — VP8, VP8L или VP8X.
const riff = (chunk: string, payload: readonly number[]): Uint8Array =>
  bytes(
    ascii('RIFF'),
    u32le(12 + payload.length),
    ascii('WEBP'),
    ascii(chunk),
    u32le(payload.length),
    payload
  );

const vp8 = (width: number, height: number): Uint8Array =>
  riff('VP8 ', [
    0x50,
    0x02,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...u16le(width),
    ...u16le(height),
    ...zeros(10),
  ]);

const vp8l = (width: number, height: number): Uint8Array =>
  riff('VP8L', [
    0x2f,
    ...u32le(((width - 1) | ((height - 1) << 14)) >>> 0),
    ...zeros(4),
  ]);

const vp8x = (width: number, height: number): Uint8Array =>
  riff('VP8X', [0x10, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);

const gif = (version: string, width: number, height: number): Uint8Array =>
  bytes(ascii(`GIF${version}`), u16le(width), u16le(height), [0xf7, 0, 0]);

// AVIF/HEIF: блоки ISOBMFF «размер, тип, данные»; у FullBox впереди 4 байта версии и флагов.
const box = (type: string, ...payload: Part[]): number[] =>
  ((body) => [...u32be(8 + body.length), ...ascii(type), ...body])(
    payload.flat()
  );

const full = (type: string, ...payload: Part[]): number[] =>
  box(type, zeros(4), ...payload);

const ispe = (width: number, height: number): number[] =>
  full('ispe', u32be(width), u32be(height));

const irot = (angle: number): number[] => box('irot', [angle]);

const ftyp = (major: string, ...compatible: string[]): number[] =>
  box('ftyp', ascii(major), u32be(0), ...compatible.map(ascii));

const meta = (...properties: number[][]): number[] =>
  full(
    'meta',
    full('hdlr', u32be(0), ascii('pict'), zeros(12), [0]),
    full('pitm', u16be(1)),
    box(
      'iprp',
      box('ipco', ...properties),
      full('ipma', u32be(1), u16be(1), [
        properties.length,
        ...properties.map((_, k) => 0x80 | (k + 1)),
      ])
    )
  );

const heif = (brand: Part, ...properties: number[][]): Uint8Array =>
  bytes(brand, meta(...properties), box('mdat', [1, 2, 3]));

const svg = (source: string) => imageSize(text(source));

describe('размеры картинки из заголовка', () => {
  it('PNG — из IHDR', () => {
    expect(imageSize(pngHeader(1920, 1080))).toEqual(size(1920, 1080));
    expect(imageSize(pngHeader(0, 1080))).toBeNull();
    expect(imageSize(pngHeader(1920, 1080).subarray(0, 22))).toBeNull();
  });

  it('JPEG — из SOF, мимо APPn, таблиц, заполняющих байтов и длинных сегментов', () => {
    expect(imageSize(jpeg(JFIF, DQT, sof(0xc0, 640, 480)))).toEqual(
      size(640, 480)
    );
    expect(imageSize(jpeg(JFIF, DHT, sof(0xc2, 1200, 800)))).toEqual(
      size(1200, 800)
    );
    expect(
      imageSize(
        jpeg(
          JFIF,
          segment(0xe2, zeros(65_533)),
          segment(0xed, zeros(4000)),
          [0xff, 0xff, 0xff],
          sof(0xc1, 3000, 2000)
        )
      )
    ).toEqual(size(3000, 2000));
  });

  it('JPEG без кадра до SOS или обрезанный — без размеров', () => {
    expect(imageSize(jpeg(JFIF, DQT))).toBeNull();
    expect(
      imageSize(bytes([0xff, 0xd8], JFIF, sof(0xc0, 640, 480)).subarray(0, 26))
    ).toBeNull();
    expect(imageSize(bytes([0xff, 0xd8], 0x00, 0x00))).toBeNull();
  });

  it('JPEG с ориентацией EXIF 5–8 — стороны наоборот, как его покажет браузер', () => {
    expect(
      imageSize(jpeg(exif(6, false), JFIF, sof(0xc0, 4032, 3024)))
    ).toEqual(size(3024, 4032));
    expect(imageSize(jpeg(exif(8, true), sof(0xc0, 4032, 3024)))).toEqual(
      size(3024, 4032)
    );
    expect(imageSize(jpeg(exif(1, true), sof(0xc0, 4032, 3024)))).toEqual(
      size(4032, 3024)
    );
    expect(imageSize(jpeg(exif(3, false), sof(0xc0, 4032, 3024)))).toEqual(
      size(4032, 3024)
    );
  });

  it('WebP — VP8 с потерями, VP8L без потерь и VP8X с холстом', () => {
    expect(imageSize(vp8(800, 600))).toEqual(size(800, 600));
    // Два старших бита — масштаб для декодера, не размер.
    expect(imageSize(vp8(0xc000 | 800, 0x4000 | 600))).toEqual(size(800, 600));
    expect(imageSize(vp8l(1, 16_384))).toEqual(size(1, 16_384));
    expect(imageSize(vp8l(1023, 767))).toEqual(size(1023, 767));
    expect(imageSize(vp8x(20_000, 10_000))).toEqual(size(20_000, 10_000));
    expect(imageSize(vp8l(1023, 767).subarray(0, 23))).toBeNull();
    expect(imageSize(riff('ALPH', zeros(10)))).toBeNull();
  });

  it('GIF — логический экран', () => {
    expect(imageSize(gif('89a', 320, 240))).toEqual(size(320, 240));
    expect(imageSize(gif('87a', 1, 65_535))).toEqual(size(1, 65_535));
    expect(imageSize(gif('89a', 320, 240).subarray(0, 9))).toBeNull();
  });

  it('AVIF и HEIF — ispe, у сетки — наибольший, irot поворачивает', () => {
    expect(
      imageSize(heif(ftyp('avif', 'mif1', 'miaf'), ispe(1200, 800)))
    ).toEqual(size(1200, 800));
    expect(
      imageSize(
        heif(
          ftyp('avif', 'mif1'),
          ispe(512, 512),
          ispe(2048, 1024),
          ispe(160, 80)
        )
      )
    ).toEqual(size(2048, 1024));
    expect(
      imageSize(heif(ftyp('heic', 'mif1', 'heic'), ispe(4032, 3024), irot(1)))
    ).toEqual(size(3024, 4032));
    expect(
      imageSize(heif(ftyp('mif1', 'avif'), ispe(640, 480), irot(2)))
    ).toEqual(size(640, 480));
    // Видео MP4 — тот же ISOBMFF, но не картинка.
    expect(imageSize(heif(ftyp('isom', 'mp42'), ispe(1920, 1080)))).toBeNull();
  });

  it('AVIF: meta после mdat с 64-битным размером тоже находится', () => {
    // Размер 1 — настоящий размер следом, 64 бита: 16 байт заголовка и 4 байта данных.
    const mdat = [...u32be(1), ...ascii('mdat'), ...u32be(0), ...u32be(20)];
    expect(
      imageSize(
        bytes(ftyp('avif', 'mif1'), mdat, [1, 2, 3, 4], meta(ispe(300, 200)))
      )
    ).toEqual(size(300, 200));
  });

  it('SVG — width и height числами или в px, иначе viewBox', () => {
    expect(
      svg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"/>')
    ).toEqual(size(120, 80));
    expect(svg("<svg width='120px' height='80.4px'></svg>")).toEqual(
      size(120, 80)
    );
    expect(svg('<svg viewBox="0 0 300 150"></svg>')).toEqual(size(300, 150));
    expect(
      svg('<svg width="100%" height="100%" viewBox="0,0,24,24"></svg>')
    ).toEqual(size(24, 24));
    expect(svg('<svg width="48" viewBox="0 0 24 12"></svg>')).toEqual(
      size(48, 24)
    );
    expect(svg('<svg height="30" viewBox="0 0 60 20"></svg>')).toEqual(
      size(90, 30)
    );
    expect(
      svg('<svg stroke-width="5" data-height="7" viewBox="0 0 10 20"/>')
    ).toEqual(size(10, 20));
  });

  it('SVG: пролог, комментарий, DOCTYPE и BOM перед корнем не мешают', () => {
    expect(
      svg(
        `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Inkscape -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg
   xmlns="http://www.w3.org/2000/svg"
   aria-label="a > b"
   width="210"
   height="297">
  <rect width="10" height="10"/>
</svg>`
      )
    ).toEqual(size(210, 297));
    expect(
      imageSize(
        bytes([0xef, 0xbb, 0xbf], [...text('<svg width="5" height="6"/>')])
      )
    ).toEqual(size(5, 6));
  });

  it('SVG без чисел, не SVG и мусор — без размеров', () => {
    expect(svg('<svg/>')).toBeNull();
    expect(svg('<svg width="10em" height="2em"></svg>')).toBeNull();
    expect(svg('<svg viewBox="0 0 0 10"></svg>')).toBeNull();
    expect(svg('<html><body>hi</body></html>')).toBeNull();
    expect(svg('price: <svg width="1" height="1">')).toBeNull();
    expect(imageSize(new Uint8Array(0))).toBeNull();
    expect(imageSize(bytes(zeros(64)))).toBeNull();
    expect(imageSize(text('просто текст'))).toBeNull();
  });

  it('файлы настоящих кодеров Bun.Image читаются', async () => {
    const rgb = realPng(37, 21, false);
    const rgba = realPng(37, 21, true);
    const files = await Promise.all([
      new Bun.Image(rgb).jpeg({ quality: 80 }).bytes(),
      new Bun.Image(rgb).jpeg({ quality: 80, progressive: true }).bytes(),
      new Bun.Image(rgb).webp({ quality: 80 }).bytes(),
      new Bun.Image(rgba).webp({ quality: 80 }).bytes(),
      new Bun.Image(rgb).webp({ lossless: true }).bytes(),
      new Bun.Image(rgba).png().bytes(),
    ]);
    expect(await new Bun.Image(rgb).metadata()).toMatchObject(size(37, 21));
    expect([rgb, rgba, ...files].map(imageSize)).toEqual(
      Array(8).fill(size(37, 21))
    );
  });
});
