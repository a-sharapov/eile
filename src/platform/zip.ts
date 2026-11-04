import { inflateRawSync } from 'node:zlib';
import {
  attempt,
  fail,
  isDomainError,
  rethrow,
} from '../shared/kernel/errors.ts';

// ZIP по APPNOTE.TXT PKWARE, ровно столько, сколько нужно релизу под Windows (ADR 0049) и пакетам каркасов
// (ADR 0056): файлы со сжатием deflate или без него, без ZIP64, шифрования и многотомных архивов. Bun сам
// zip не читает и не пишет.

/** Файл архива: имя внутри и содержимое. */
export type ZipEntry = { readonly name: string; readonly data: Uint8Array };

/** Как хранить файлы: `deflate` — сжатыми, `store` — как есть (байты архива не зависят от zlib). */
export type ZipMethod = 'deflate' | 'store';

/** Запись каталога архива: что внутри и сколько займёт — до распаковки. */
export type ZipRecord = {
  readonly name: string;
  readonly method: number;
  readonly crc: number;
  readonly packed: number;
  readonly size: number;
  readonly offset: number;
  /** Символьная ссылка: тип файла Unix в старших битах внешних атрибутов. */
  readonly symlink: boolean;
  /** Зашифрован: бит 0 флагов. */
  readonly encrypted: boolean;
};

const _LOCAL = 0x04034b50;
const _CENTRAL = 0x02014b50;
const _END = 0x06054b50;
const _DEFLATE = 8;
const _STORE = 0;
// Версия формата 2.0 — deflate; бит 11 флагов — имена в UTF-8.
const _VERSION = 20;
const _UTF8 = 0x0800;
const _LIMIT = 0xffffffff;
const _S_IFMT = 0o170000;
const _S_IFLNK = 0o120000;

/** Время в архиве, одинаковое в любом часовом поясе: 1 января 1980 — начало времени DOS. */
export var ZIP_EPOCH = new Date(1980, 0, 1);

type _Field = readonly [width: 2 | 4, value: number];

// Поля заголовков — little-endian, по порядку.
const _pack = (fields: readonly _Field[]): Uint8Array =>
  Uint8Array.from(
    fields.flatMap(({ 0: width, 1: value }) =>
      Array.from({ length: width }, (_, i) => (value >>> (8 * i)) & 0xff)
    )
  );

const _concat = (parts: readonly Uint8Array[]): Uint8Array =>
  new Uint8Array(Bun.concatArrayBuffers([...parts]));

// Время DOS: день, месяц и год от 1980 — в дате; часы, минуты и секунды/2 — во времени.
const _dos = (at: Date): { readonly time: number; readonly date: number } => ({
  time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
  date:
    (Math.max(0, at.getFullYear() - 1980) << 9) |
    ((at.getMonth() + 1) << 5) |
    at.getDate(),
});

type _Packed = {
  readonly name: Uint8Array;
  readonly method: number;
  readonly crc: number;
  readonly size: number;
  readonly packed: Uint8Array;
};

const _PACK: Readonly<
  Record<
    ZipMethod,
    { readonly code: number; readonly pack: (data: Uint8Array) => Uint8Array }
  >
> = {
  deflate: {
    code: _DEFLATE,
    pack: (data) =>
      Bun.deflateSync(new Uint8Array(data), { level: 6, windowBits: -15 }),
  },
  store: { code: _STORE, pack: (data) => data },
};

const _packed =
  (method: ZipMethod) =>
  (entry: ZipEntry): _Packed =>
    entry.data.byteLength >= _LIMIT
      ? fail('archive.zip_too_large', `${entry.name} is too large for ZIP`)
      : {
          name: new TextEncoder().encode(entry.name),
          method: _PACK[method].code,
          crc: Bun.hash.crc32(entry.data),
          size: entry.data.byteLength,
          packed: _PACK[method].pack(entry.data),
        };

// Общая часть локального заголовка и записи каталога: от версии до длины имени.
const _common = (file: _Packed, time: number, date: number): _Field[] => [
  [2, _VERSION],
  [2, _UTF8],
  [2, file.method],
  [2, time],
  [2, date],
  [4, file.crc],
  [4, file.packed.byteLength],
  [4, file.size],
  [2, file.name.byteLength],
  [2, 0],
];

/**
 * Архив ZIP из файлов в данном порядке, время — `at`. Одни и те же файлы, порядок, время и `store` дают
 * побайтно один архив: `deflate` зависит ещё от версии zlib.
 */
export var zip = (
  entries: readonly ZipEntry[],
  at = new Date(),
  method: ZipMethod = 'deflate'
): Uint8Array =>
  ((files, { time, date }) => {
    const locals = files.map((_) =>
      _concat([
        _pack([[4, _LOCAL], ..._common(_, time, date)]),
        _.name,
        _.packed,
      ])
    );
    const offsets = locals.reduce<number[]>(
      (acc, _) => [...acc, acc.at(-1)! + _.byteLength],
      [0]
    );
    const central = files.map((_, index) =>
      _concat([
        _pack([
          [4, _CENTRAL],
          [2, _VERSION],
          ..._common(_, time, date),
          [2, 0],
          [2, 0],
          [2, 0],
          [4, 0],
          [4, offsets[index]!],
        ]),
        _.name,
      ])
    );
    const size = central.reduce((sum, _) => sum + _.byteLength, 0);
    return offsets.at(-1)! >= _LIMIT
      ? fail('archive.zip_too_large', 'The archive is too large for ZIP')
      : _concat([
          ...locals,
          ...central,
          _pack([
            [4, _END],
            [2, 0],
            [2, 0],
            [2, files.length],
            [2, files.length],
            [4, size],
            [4, offsets.at(-1)!],
            [2, 0],
          ]),
        ]);
  })(entries.map(_packed(method)), _dos(at));

// Конец каталога — последние 22 байта, если у архива нет комментария; с комментарием — раньше, до 64 КиБ.
const _end = (view: DataView): number =>
  ((from) =>
    Array.from(
      { length: Math.max(0, Math.min(from + 1, 65_536)) },
      (_, i) => from - i
    ).find((at) => view.getUint32(at, true) === _END) ??
    fail('archive.zip_invalid', 'Not a ZIP archive'))(view.byteLength - 22);

const _records = (bytes: Uint8Array, view: DataView): readonly ZipRecord[] =>
  ((end) =>
    Array.from({ length: view.getUint16(end + 10, true) }).reduce<{
      readonly at: number;
      readonly list: readonly ZipRecord[];
    }>(
      ({ at, list }) =>
        view.getUint32(at, true) !== _CENTRAL
          ? fail('archive.zip_invalid', 'The ZIP directory is damaged')
          : ((length) => ({
              at:
                at +
                46 +
                length +
                view.getUint16(at + 30, true) +
                view.getUint16(at + 32, true),
              list: [
                ...list,
                {
                  name: new TextDecoder().decode(
                    bytes.subarray(at + 46, at + 46 + length)
                  ),
                  method: view.getUint16(at + 10, true),
                  crc: view.getUint32(at + 16, true),
                  packed: view.getUint32(at + 20, true),
                  size: view.getUint32(at + 24, true),
                  offset: view.getUint32(at + 42, true),
                  symlink:
                    ((view.getUint32(at + 38, true) >>> 16) & _S_IFMT) ===
                    _S_IFLNK,
                  encrypted: (view.getUint16(at + 8, true) & 1) === 1,
                },
              ],
            }))(view.getUint16(at + 28, true)),
      { at: view.getUint32(end + 16, true), list: [] }
    ).list)(_end(view));

// Распаковка не длиннее заявленного размера: заголовок, который врёт о размере (zip-бомба), не раздует
// память — zlib остановится на пределе.
const _inflate = (data: Uint8Array, size: number): Uint8Array =>
  attempt(
    () =>
      ((out) => new Uint8Array(out.buffer, out.byteOffset, out.byteLength))(
        inflateRawSync(data, { maxOutputLength: Math.max(1, size) })
      ),
    () =>
      fail('archive.zip_invalid', 'The packed data is larger than it claims')
  );

const _UNPACK: Readonly<
  Record<number, (data: Uint8Array, size: number) => Uint8Array>
> = {
  [_DEFLATE]: _inflate,
  [_STORE]: (data) => data.slice(),
};

const _read = (bytes: Uint8Array, view: DataView, record: ZipRecord) =>
  view.getUint32(record.offset, true) !== _LOCAL
    ? fail('archive.zip_invalid', `${record.name}: the ZIP entry is damaged`)
    : ((start) =>
        (
          _UNPACK[record.method] ??
          (() =>
            fail(
              'archive.zip_unsupported',
              `${record.name}: ZIP method ${record.method} is not supported`
            ))
        )(bytes.subarray(start, start + record.packed), record.size))(
        record.offset +
          30 +
          view.getUint16(record.offset + 26, true) +
          view.getUint16(record.offset + 28, true)
      );

const _view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// Смещения из битого или подделанного каталога уводят за конец файла: DataView бросает RangeError.
const _damaged = <T>(run: () => T): T =>
  attempt(run, (error) =>
    isDomainError(error)
      ? rethrow(error)
      : fail('archive.zip_invalid', 'The ZIP archive is damaged')
  );

/** Каталог архива: имена, размеры и флаги файлов — без распаковки. Архив не zip или битый — отказ. */
export var listZip = (bytes: Uint8Array): readonly ZipRecord[] =>
  bytes.byteLength < 22
    ? fail('archive.zip_invalid', 'Not a ZIP archive')
    : _damaged(() => _records(bytes, _view(bytes)));

/**
 * Файл по записи каталога (`listZip`): распаковка не длиннее заявленного размера, затем сверка размера и
 * CRC. ZIP64 и шифрование — отказ.
 */
export var readZipRecord = (
  bytes: Uint8Array,
  record: ZipRecord
): Uint8Array =>
  record.packed === _LIMIT || record.size === _LIMIT
    ? fail('archive.zip_unsupported', 'ZIP64 is not supported')
    : record.encrypted
      ? fail('archive.zip_unsupported', `${record.name} is encrypted`)
      : ((data) =>
          data.byteLength === record.size && Bun.hash.crc32(data) === record.crc
            ? data
            : fail(
                'archive.zip_invalid',
                `${record.name}: the unpacked file does not match its CRC`
              ))(_damaged(() => _read(bytes, _view(bytes), record)));

/** Файл `name` из архива ZIP; нет его, архив битый или сумма CRC не сошлась — отказ. */
export var unzipFile = (bytes: Uint8Array, name: string): Uint8Array =>
  ((record) =>
    record === undefined
      ? fail('archive.zip_missing', `The ZIP archive has no ${name}`)
      : readZipRecord(bytes, record))(
    listZip(bytes).find((_) => _.name === name)
  );
