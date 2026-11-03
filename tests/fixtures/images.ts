// Картинки для тестов собираются на лету: BMP в памяти, его кодирует Bun.Image. Левая половина кадра —
// красная, правая — синяя: по вариантам видно, повёрнут ли кадр.
import { inflateSync } from 'node:zlib';

type Format = 'jpeg' | 'png' | 'webp';

type Options = {
  /** Ориентация EXIF (1–8) — только у JPEG. */
  readonly orientation?: number;
  readonly progressive?: boolean;
};

const _RED = [0, 0, 255];
const _BLUE = [255, 0, 0];

const _bmp = (width: number, height: number): Uint8Array => {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const out = new Uint8Array(54 + stride * height);
  const view = new DataView(out.buffer);
  out.set([0x42, 0x4d]);
  view.setUint32(2, out.byteLength, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, stride * height, true);
  const row = new Uint8Array(stride);
  Array.from({ length: width }).forEach(
    (_, x) => void row.set(x < width / 2 ? _RED : _BLUE, x * 3)
  );
  Array.from({ length: height }).forEach(
    (_, y) => void out.set(row, 54 + y * stride)
  );
  return out;
};

// APP1 с EXIF: TIFF «MM», один тег Orientation (0x0112, SHORT).
const _exif = (orientation: number): number[] => [
  0xff,
  0xe1,
  0,
  34,
  ...Array.from('Exif\0\0MM', (_) => _.charCodeAt(0)),
  0,
  42,
  0,
  0,
  0,
  8,
  0,
  1,
  0x01,
  0x12,
  0,
  3,
  0,
  0,
  0,
  1,
  0,
  orientation,
  0,
  0,
  0,
  0,
  0,
  0,
];

const _oriented = (jpeg: Uint8Array, orientation: number): Uint8Array =>
  new Uint8Array([
    ...jpeg.subarray(0, 2),
    ..._exif(orientation),
    ...jpeg.subarray(2),
  ]);

const _ENCODE: Readonly<
  Record<Format, (image: Bun.Image, options: Options) => Bun.Image>
> = {
  jpeg: (image, options) =>
    image.jpeg({ quality: 90, progressive: options.progressive ?? false }),
  png: (image) => image.png(),
  webp: (image) => image.webp({ quality: 90 }),
};

/** Настоящая картинка `width`×`height`; ориентация EXIF ставится в уже сжатый JPEG. */
export var picture = (
  width: number,
  height: number,
  format: Format,
  options: Options = {}
): Promise<Uint8Array> =>
  _ENCODE[format](new Bun.Image(_bmp(width, height)), options)
    .bytes()
    .then((_) =>
      options.orientation === undefined ? _ : _oriented(_, options.orientation)
    );

const _paeth = (a: number, b: number, c: number): number =>
  ((p) =>
    Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
      ? a
      : Math.abs(p - b) <= Math.abs(p - c)
        ? b
        : c)(a + b - c);

// Строка PNG после фильтра: байт — от соседа слева (a), сверху (b) и сверху слева (c).
const _unfilter = (
  kind: number,
  line: Uint8Array,
  previous: readonly number[],
  bpp: number
): number[] =>
  Array.from(line).reduce<number[]>((row, byte, i) => {
    const a = row[i - bpp] ?? 0;
    const b = previous[i] ?? 0;
    const c = previous[i - bpp] ?? 0;
    return [
      ...row,
      (byte + [0, a, b, (a + b) >> 1, _paeth(a, b, c)][kind]!) & 0xff,
    ];
  }, []);

type Chunk = { readonly type: string; readonly body: Uint8Array };

const _chunks = (png: Uint8Array, at: number): Chunk[] =>
  at >= png.byteLength
    ? []
    : ((length) => [
        {
          type: new TextDecoder().decode(png.subarray(at + 4, at + 8)),
          body: png.subarray(at + 8, at + 8 + length),
        },
        ..._chunks(png, at + 12 + length),
      ])(new DataView(png.buffer, png.byteOffset).getUint32(at));

// Восьмибитный PNG RGB или RGBA → строки байтов без фильтров.
const _lines = (png: Uint8Array, columns: number, rows: number) => {
  const chunks = _chunks(png, 8);
  const bpp = chunks.find((_) => _.type === 'IHDR')!.body[9] === 6 ? 4 : 3;
  const raw = inflateSync(
    Buffer.concat(chunks.filter((_) => _.type === 'IDAT').map((_) => _.body))
  );
  const stride = columns * bpp;
  return {
    bpp,
    lines: Array.from({ length: rows }).reduce<number[][]>(
      (done, _, y) => [
        ...done,
        _unfilter(
          raw[y * (stride + 1)]!,
          raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
          done.at(-1) ?? [],
          bpp
        ),
      ],
      []
    ),
  };
};

/** Цвета кадра, уменьшенного до `columns`×`rows`: [r, g, b] по строкам слева направо. */
export var colors = (
  data: Uint8Array,
  columns: number,
  rows: number
): Promise<number[][]> =>
  new Bun.Image(data)
    .resize(columns, rows, { fit: 'fill' })
    .png()
    .bytes()
    .then((png) => _lines(png, columns, rows))
    .then(({ bpp, lines }) =>
      lines.flatMap((line) =>
        Array.from({ length: columns }, (_, x) =>
          line.slice(x * bpp, x * bpp + 3)
        )
      )
    );
