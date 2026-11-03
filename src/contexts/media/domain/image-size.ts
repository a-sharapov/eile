// Размеры картинки из заголовка файла, без декодирования пикселей: так их узнаёт сервер, когда клиент
// (агент, API) их не прислал. Bun.Image.metadata() асинхронна и на Linux не читает AVIF, GIF и SVG.

import { pipe } from '../../../shared/kernel/pipe.ts';

/** Ширина и высота в пикселях — так, как картинку покажет браузер (с учётом поворота). */
export type ImageSize = { readonly width: number; readonly height: number };

type Reader = (data: Uint8Array) => ImageSize | null;

type Box = {
  readonly type: string;
  readonly body: number;
  readonly end: number;
};

type Properties = {
  readonly size: ImageSize | null;
  readonly turned: boolean;
};

// За концом данных — NaN: размер из него не пройдёт проверку `_size`.
const _at = (data: Uint8Array, at: number): number => data[at] ?? Number.NaN;

const _u16be = (data: Uint8Array, at: number): number =>
  _at(data, at) * 0x100 + _at(data, at + 1);

const _u16le = (data: Uint8Array, at: number): number =>
  _at(data, at) + _at(data, at + 1) * 0x100;

const _u24le = (data: Uint8Array, at: number): number =>
  _u16le(data, at) + _at(data, at + 2) * 0x10000;

const _u32be = (data: Uint8Array, at: number): number =>
  _u16be(data, at) * 0x10000 + _u16be(data, at + 2);

const _u32le = (data: Uint8Array, at: number): number =>
  _u16le(data, at) + _u16le(data, at + 2) * 0x10000;

const _ascii = (data: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...data.subarray(at, at + length));

const _starts = (
  data: Uint8Array,
  signature: readonly number[],
  at = 0
): boolean => signature.every((byte, k) => data[at + k] === byte);

const _size = (width: number, height: number): ImageSize | null =>
  Number.isSafeInteger(width) &&
  Number.isSafeInteger(height) &&
  width > 0 &&
  height > 0
    ? { width, height }
    : null;

const _turn = (size: ImageSize | null, turned: boolean): ImageSize | null =>
  size && turned ? { width: size.height, height: size.width } : size;

const _PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Первый блок PNG — всегда IHDR: ширина и высота сразу за его типом.
const _png: Reader = (data) =>
  _starts(data, _PNG) && _ascii(data, 12, 4) === 'IHDR'
    ? _size(_u32be(data, 16), _u32be(data, 20))
    : null;

const _gif: Reader = (data) =>
  /^GIF8[79]a$/.test(_ascii(data, 0, 6))
    ? _size(_u16le(data, 6), _u16le(data, 8))
    : null;

// Первый блок после «WEBP»: VP8 — с потерями, VP8L — без потерь, VP8X — расширенный (холст целиком).
const _WEBP: Readonly<Record<string, Reader>> = {
  'VP8 ': (data) =>
    _starts(data, [0x9d, 0x01, 0x2a], 23)
      ? _size(_u16le(data, 26) & 0x3fff, _u16le(data, 28) & 0x3fff)
      : null,
  // 14 бит ширины и 14 бит высоты, каждое минус один, сразу за байтом 0x2f.
  VP8L: (data) =>
    data.length >= 25 && _at(data, 20) === 0x2f
      ? ((bits) => _size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1))(
          _u32le(data, 21)
        )
      : null,
  VP8X: (data) => _size(_u24le(data, 24) + 1, _u24le(data, 27) + 1),
};

const _webp: Reader = (data) =>
  ((chunk) =>
    _ascii(data, 0, 4) === 'RIFF' &&
    _ascii(data, 8, 4) === 'WEBP' &&
    Object.hasOwn(_WEBP, chunk)
      ? _WEBP[chunk]!(data)
      : null)(_ascii(data, 12, 4));

// Ориентация EXIF 5–8 — кадр лежит на боку: браузер покажет его со сторонами наоборот.
const _exifTurned = (data: Uint8Array, tiff: number): boolean => {
  const little = _ascii(data, tiff, 2) === 'II';
  const u16 = little ? _u16le : _u16be;
  const ifd = tiff + (little ? _u32le : _u32be)(data, tiff + 4);
  return Array.from(
    { length: Math.min(u16(data, ifd), 0x100) || 0 },
    (_, k) => ifd + 2 + k * 12
  ).some(
    (entry) =>
      u16(data, entry) === 0x0112 &&
      u16(data, entry + 8) >= 5 &&
      u16(data, entry + 8) <= 8
  );
};

// SOF0–SOF15 несут размер кадра; C4 (DHT), C8 (JPG) и CC (DAC) — другие маркеры с тем же началом.
const _isFrame = (marker: number): boolean =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

const _jpegKind = (marker: number): string =>
  marker === 0xff
    ? 'fill'
    : _isFrame(marker)
      ? 'frame'
      : marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)
        ? 'bare'
        : marker === 0xd9 || marker === 0xda || Number.isNaN(marker)
          ? 'end'
          : 'segment';

type JpegStep = (
  data: Uint8Array,
  at: number,
  turned: boolean
) => ImageSize | null;

// Маркеры JPEG по одному: APPn и прочие сегменты перепрыгиваются по длине, до кадра (SOFn).
const _JPEG: Readonly<Record<string, JpegStep>> = {
  fill: (data, at, turned) => _segments(data, at + 1, turned),
  frame: (data, at, turned) =>
    _turn(_size(_u16be(data, at + 7), _u16be(data, at + 5)), turned),
  bare: (data, at, turned) => _segments(data, at + 2, turned),
  end: () => null,
  segment: (data, at, turned) =>
    _segments(
      data,
      at + 2 + _u16be(data, at + 2),
      _at(data, at + 1) === 0xe1 && _ascii(data, at + 4, 6) === 'Exif\0\0'
        ? _exifTurned(data, at + 10)
        : turned
    ),
};

const _segments: JpegStep = (data, at, turned) =>
  _at(data, at) === 0xff
    ? _JPEG[_jpegKind(_at(data, at + 1))]!(data, at, turned)
    : null;

const _jpeg: Reader = (data) =>
  _starts(data, [0xff, 0xd8]) ? _segments(data, 2, false) : null;

// Блок ISOBMFF: размер (1 — 64-битный следом, 0 — до конца родителя) и тип.
const _box = (data: Uint8Array, at: number, limit: number): Box | null => {
  const size = _u32be(data, at);
  const header = size === 1 ? 16 : 8;
  const length =
    size === 1
      ? _u32be(data, at + 8) * 0x100000000 + _u32be(data, at + 12)
      : size === 0
        ? limit - at
        : size;
  return at < limit && length >= header
    ? { type: _ascii(data, at + 4, 4), body: at + header, end: at + length }
    : null;
};

const _find = (
  data: Uint8Array,
  at: number,
  limit: number,
  type: string
): Box | null =>
  ((box) =>
    box === null || box.type === type
      ? box
      : _find(data, box.end, limit, type))(_box(data, at, limit));

const _area = (size: ImageSize | null): number =>
  size ? size.width * size.height : 0;

// ispe — размер кадра; у сетки, миниатюры и альфы свои, поэтому берётся наибольший. irot — поворот на
// 90° × угол против часовой стрелки.
const _PROPERTY: Readonly<
  Record<string, (data: Uint8Array, box: Box, found: Properties) => Properties>
> = {
  ispe: (data, box, found) =>
    ((size) => (_area(size) > _area(found.size) ? { ...found, size } : found))(
      _size(_u32be(data, box.body + 4), _u32be(data, box.body + 8))
    ),
  irot: (data, box, found) => ({
    ...found,
    turned: (_at(data, box.body) & 1) === 1,
  }),
};

const _properties = (
  data: Uint8Array,
  at: number,
  limit: number,
  found: Properties
): Properties =>
  ((box) =>
    box === null
      ? found
      : _properties(
          data,
          box.end,
          limit,
          Object.hasOwn(_PROPERTY, box.type)
            ? _PROPERTY[box.type]!(data, box, found)
            : found
        ))(_box(data, at, limit));

const _HEIF_BRANDS = new Set([
  'avif',
  'avis',
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
]);

const _isHeif = (data: Uint8Array, ftyp: Box): boolean =>
  [
    ftyp.body,
    ...Array.from(
      { length: Math.min(Math.max(0, (ftyp.end - ftyp.body - 8) / 4), 64) | 0 },
      (_, k) => ftyp.body + 8 + k * 4
    ),
  ].some((at) => _HEIF_BRANDS.has(_ascii(data, at, 4)));

// AVIF и HEIF: ftyp → meta (FullBox: 4 байта версии) → iprp → ipco со свойствами картинок.
const _heif: Reader = (data) => {
  const ftyp = _box(data, 0, data.length);
  const meta =
    ftyp?.type === 'ftyp' && _isHeif(data, ftyp)
      ? _find(data, ftyp.end, data.length, 'meta')
      : null;
  const iprp = meta && _find(data, meta.body + 4, meta.end, 'iprp');
  const ipco = iprp && _find(data, iprp.body, iprp.end, 'ipco');
  const found =
    ipco &&
    _properties(data, ipco.body, ipco.end, { size: null, turned: false });
  return found ? _turn(found.size, found.turned) : null;
};

// Корневой тег SVG ищется в начале файла: дальше — содержимое, а не размеры.
const _SVG_HEAD = 64 * 1024;
const _SVG_ROOT = /<svg(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/;
const _SVG_ATTRIBUTE =
  /\s(width|height|viewBox)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
// Число без единиц или в px — то же, что пиксели; проценты и em от вёрстки, их не посчитать.
const _PLAIN = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:px)?\s*$/;

const _plain = (value: string | undefined): number | null =>
  value !== undefined && _PLAIN.test(value) ? Number.parseFloat(value) : null;

const _viewBox = (
  value: string | undefined
): { width: number; height: number } | null =>
  ((parts) =>
    parts.length === 4 &&
    parts.every(Number.isFinite) &&
    parts[2]! > 0 &&
    parts[3]! > 0
      ? { width: parts[2]!, height: parts[3]! }
      : null)(
    (value ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number)
  );

const _rounded = (width: number, height: number): ImageSize | null =>
  _size(Math.round(width), Math.round(height));

// Нет одной стороны — её даёт пропорция viewBox, как у браузера; нет обеих — сам viewBox.
const _svgSize = (
  attributes: Readonly<Record<string, string>>
): ImageSize | null =>
  ((width, height, box) =>
    width !== null && height !== null
      ? _rounded(width, height)
      : box === null
        ? null
        : width !== null
          ? _rounded(width, (width * box.height) / box.width)
          : height !== null
            ? _rounded((height * box.width) / box.height, height)
            : _rounded(box.width, box.height))(
    _plain(attributes.width),
    _plain(attributes.height),
    _viewBox(attributes.viewBox)
  );

const _svgAttributes = (root: string): Record<string, string> =>
  Object.fromEntries(
    Array.from(root.matchAll(_SVG_ATTRIBUTE), (_) => [
      _[1]!,
      _[2] ?? _[3] ?? '',
    ])
  );

const _svg: Reader = pipe(
  (data: Uint8Array) => new TextDecoder().decode(data.subarray(0, _SVG_HEAD)),
  (_) => (/^\s*</.test(_) ? (_SVG_ROOT.exec(_)?.[0] ?? null) : null),
  (_) => (_ === null ? null : _svgSize(_svgAttributes(_)))
);

const _READERS: readonly Reader[] = [_png, _jpeg, _webp, _gif, _heif, _svg];

/** Размеры картинки PNG, JPEG, WebP, GIF, AVIF/HEIF или SVG; null — формат не узнан или размера нет. */
export var imageSize = (data: Uint8Array): ImageSize | null =>
  _READERS.reduce<ImageSize | null>((found, read) => found ?? read(data), null);

/** Что видно по заголовку картинки: формат по подписи, анимация, прогрессивный JPEG. */
export type ImageTraits = {
  readonly format: 'jpeg' | 'png' | 'webp' | 'gif' | null;
  readonly animated: boolean;
  readonly progressive: boolean;
  /** Отсчётов на пиксель: у JPEG — по субдискретизации (3 при 4:4:4, 1,5 при 4:2:0, 1 у серого), у прочих 4. */
  readonly samples: number;
};

// Блоков до первого IDAT в настоящих файлах единицы; предел — от глубокой рекурсии на подделке.
const _MAX_CHUNKS = 1000;

// APNG: блок acTL стоит до первого IDAT.
const _apng = (data: Uint8Array, at: number, left: number): boolean =>
  ((type) =>
    type === 'acTL' ||
    (left > 0 &&
      type !== 'IDAT' &&
      type !== 'IEND' &&
      at + 12 <= data.length &&
      _apng(data, at + 12 + _u32be(data, at), left - 1)))(
    _ascii(data, at + 4, 4)
  );

type FrameStep = (data: Uint8Array, at: number) => number | null;

// Где начинается кадр JPEG (SOFn): тот же обход сегментов, что у размеров.
const _FRAME: Readonly<Record<string, FrameStep>> = {
  fill: (data, at) => _frame(data, at + 1),
  frame: (_data, at) => at,
  bare: (data, at) => _frame(data, at + 2),
  end: () => null,
  segment: (data, at) => _frame(data, at + 2 + _u16be(data, at + 2)),
};

const _frame: FrameStep = (data, at) =>
  _at(data, at) === 0xff
    ? _FRAME[_jpegKind(_at(data, at + 1))]!(data, at)
    : null;

// SOF2, SOF6, SOF10 и SOF14 — прогрессивные кадры: декодеру нужны коэффициенты всего кадра сразу.
const _PROGRESSIVE = new Set([0xc2, 0xc6, 0xca, 0xce]);

// Компоненты кадра: число за размерами, у каждого — байт «по горизонтали × по вертикали». Битый
// заголовок — как худший случай, 4:4:4.
const _samples = (data: Uint8Array, at: number): number =>
  ((factors) =>
    ((h, v) =>
      factors.reduce(
        (sum, _, k) =>
          sum + (h[k]! * v[k]!) / (Math.max(...h) * Math.max(...v)),
        0
      ) || 3)(
      factors.map((_) => _ >> 4),
      factors.map((_) => _ & 0x0f)
    ))(
    Array.from({ length: Math.min(_at(data, at + 9), 4) || 0 }, (_, k) =>
      _at(data, at + 11 + k * 3)
    )
  );

const _format = (data: Uint8Array): ImageTraits['format'] =>
  _starts(data, _PNG)
    ? 'png'
    : _starts(data, [0xff, 0xd8])
      ? 'jpeg'
      : _ascii(data, 0, 4) === 'RIFF' && _ascii(data, 8, 4) === 'WEBP'
        ? 'webp'
        : /^GIF8[79]a$/.test(_ascii(data, 0, 6))
          ? 'gif'
          : null;

const _STILL = { animated: false, progressive: false, samples: 4 };

// У WebP флаг анимации — второй бит первого байта флагов VP8X.
const _TRAITS: Readonly<
  Record<string, (data: Uint8Array) => Omit<ImageTraits, 'format'>>
> = {
  png: (data) => ({ ..._STILL, animated: _apng(data, 8, _MAX_CHUNKS) }),
  jpeg: (data) =>
    ((at) => ({
      animated: false,
      progressive: at !== null && _PROGRESSIVE.has(_at(data, at + 1)),
      samples: at === null ? 3 : _samples(data, at),
    }))(_frame(data, 2)),
  webp: (data) => ({
    ..._STILL,
    animated: _ascii(data, 12, 4) === 'VP8X' && (_at(data, 20) & 0x02) !== 0,
  }),
  gif: () => _STILL,
};

export var imageTraits = (data: Uint8Array): ImageTraits =>
  ((format) => ({
    format,
    ...(format === null ? _STILL : _TRAITS[format]!(data)),
  }))(_format(data));
