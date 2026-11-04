import { resolve } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

// Значок cms.exe — только из знака менеджера manager/static/favicon.svg, копии в репозитории нет (ADR 0049):
//   bun scripts/icon.ts [файл.ico]      по умолчанию .build/eile.ico
// Каждый размер рисуется из SVG заново, а не уменьшается из большого: мелкие не размыты. Рисует resvg
// (WebAssembly, версия закреплена в bun.lock), поэтому файл побайтно один на Linux, macOS и Windows.
// 256 — PNG, остальные — 32-битный BMP с альфой: так значки хранит сама Windows. Первым идёт 256: Bun
// (--windows-icon) кладёт кадры на места ICON 1…7, а прежняя группа значков бинарника Bun, которую
// Проводник берёт первой, остаётся и ведёт на ICON 1 — пусть там будет самый крупный.

const ROOT = resolve(import.meta.dir, '..');
export var FAVICON = resolve(ROOT, 'manager/static/favicon.svg');
export var ICON = resolve(ROOT, '.build/eile.ico');
export var ICON_SIZES: readonly number[] = [256, 128, 64, 48, 32, 24, 16];

type _Frame = { readonly size: number; readonly data: Uint8Array };
type _Field = readonly [width: 1 | 2 | 4, value: number];

const _pack = (fields: readonly _Field[]): Uint8Array =>
  Uint8Array.from(
    fields.flatMap(({ 0: width, 1: value }) =>
      Array.from({ length: width }, (_, i) => (value >>> (8 * i)) & 0xff)
    )
  );

const _concat = (parts: readonly Uint8Array[]): Uint8Array =>
  new Uint8Array(Bun.concatArrayBuffers([...parts]));

// resvg отдаёт RGBA с предумноженной альфой, BMP значка ждёт BGRA с обычной.
const _straight = (value: number, alpha: number): number =>
  alpha === 0 ? 0 : Math.min(255, Math.round((value * 255) / alpha));

// Строки BMP — снизу вверх. Маска AND (1 — прозрачно) — по биту на точку, строка выровнена до 4 байт.
const _bmp = (size: number, rgba: Uint8Array): Uint8Array =>
  ((rows, stride) =>
    _concat([
      _pack([
        [4, 40],
        [4, size],
        [4, size * 2],
        [2, 1],
        [2, 32],
        [4, 0],
        [4, size * size * 4 + stride * size],
        [4, 0],
        [4, 0],
        [4, 0],
        [4, 0],
      ]),
      Uint8Array.from(
        rows.flatMap((y) =>
          Array.from({ length: size }, (_, x) => (y * size + x) * 4).flatMap(
            (at) =>
              ((alpha) => [
                _straight(rgba[at + 2]!, alpha),
                _straight(rgba[at + 1]!, alpha),
                _straight(rgba[at]!, alpha),
                alpha,
              ])(rgba[at + 3]!)
          )
        )
      ),
      Uint8Array.from(
        rows.flatMap((y) =>
          Array.from({ length: stride }, (_, byte) =>
            Array.from({ length: 8 }, (_, bit) => byte * 8 + bit).reduce(
              (mask, x, bit) =>
                x < size && rgba[(y * size + x) * 4 + 3] === 0
                  ? mask | (0x80 >> bit)
                  : mask,
              0
            )
          )
        )
      ),
    ]))(
    Array.from({ length: size }, (_, i) => size - 1 - i),
    Math.ceil(size / 32) * 4
  );

const _frame =
  (svg: string) =>
  (size: number): _Frame =>
    ((image) => ({
      size,
      data: size >= 256 ? image.asPng() : _bmp(size, image.pixels),
    }))(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render());

// ICONDIR, по записи ICONDIRENTRY на размер, затем сами картинки; размер 256 пишется нулём.
const _ico = (frames: readonly _Frame[]): Uint8Array =>
  ((offsets) =>
    _concat([
      _pack([
        [2, 0],
        [2, 1],
        [2, frames.length],
      ]),
      ...frames.map((_, index) =>
        _pack([
          [1, _.size % 256],
          [1, _.size % 256],
          [1, 0],
          [1, 0],
          [2, 1],
          [2, 32],
          [4, _.data.byteLength],
          [4, offsets[index]!],
        ])
      ),
      ...frames.map((_) => _.data),
    ]))(
    frames.reduce<number[]>(
      (acc, _) => [...acc, acc.at(-1)! + _.data.byteLength],
      [6 + 16 * frames.length]
    )
  );

// WebAssembly resvg поднимается один раз на процесс: повторный initWasm бросает.
let _ready: Promise<void> | undefined;
const _init = (): Promise<void> =>
  (_ready ??= Bun.file(
    Bun.resolveSync('@resvg/resvg-wasm/index_bg.wasm', import.meta.dir)
  )
    .arrayBuffer()
    .then((_) => initWasm(_)));

/** Значок ICO из favicon.svg: все размеры `ICON_SIZES`. */
export var renderIcon = (): Promise<Uint8Array> =>
  Promise.all([_init(), Bun.file(FAVICON).text()]).then(({ 1: svg }) =>
    _ico(ICON_SIZES.map(_frame(svg)))
  );

/** Значок — в файл; ответ — его путь. */
export var writeIcon = (path = ICON): Promise<string> =>
  renderIcon()
    .then((_) => Bun.write(path, _))
    .then(() => path);

void (
  import.meta.main &&
  (await writeIcon(resolve(process.argv[2] ?? ICON)).then((_) =>
    console.log(`${_}: ${ICON_SIZES.join(', ')} px from ${FAVICON}`)
  ))
);
