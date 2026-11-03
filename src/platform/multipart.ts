import { attempt } from '../shared/kernel/errors.ts';
import type { BodyBytes } from './body.ts';

/** Часть тела multipart/form-data: поле или файл. Байты — [start, end) тела, без копии. */
export type FormPart = {
  readonly name: string;
  /** Имя файла как прислано; null — это поле, а не файл. */
  readonly filename: string | null;
  /** Тип файла: из заголовка части, без него — по расширению имени, как у FormData в Bun. */
  readonly type: string;
  readonly start: number;
  readonly end: number;
};

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();
const _CRLF = 0x0d0a;
const _DASHES = 0x2d2d;
const _HEADERS_END = _encoder.encode('\r\n\r\n');
// Заголовки части — пара строк; больше — не форма, а попытка занять память сервера.
const _MAX_HEAD = 16 * 1024;

// Граница — параметр `boundary` типа multipart/form-data, в кавычках или без (RFC 2046: до 70 знаков).
const _boundaryOf = (contentType: string): string | null =>
  /^\s*multipart\/form-data\s*;/i.test(contentType)
    ? ((match) => match?.[1] ?? match?.[2] ?? null)(
        /;\s*boundary=(?:"([^"]{1,70})"|([^\s;"]{1,70}))/i.exec(contentType)
      )
    : null;

const _param = (header: string, name: string): string | null =>
  ((match) => (match ? (match[1] ?? match[2] ?? '') : null))(
    new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i').exec(
      header
    )
  );

const _headers = (head: string): ReadonlyMap<string, string> =>
  new Map(
    head
      .split('\r\n')
      .map((line) => ({ line, at: line.indexOf(':') }))
      .filter((_) => _.at > 0)
      .map(
        ({ line, at }) =>
          [
            line.slice(0, at).trim().toLowerCase(),
            line.slice(at + 1).trim(),
          ] as const
      )
  );

const _guessed = (filename: string): string =>
  attempt(
    () => Bun.file(filename || 'file').type,
    () => 'application/octet-stream'
  );

// Тип без пробелов вокруг `;` и в нижнем регистре: `Text/Plain; Charset=UTF-8` → `text/plain;charset=utf-8`.
const _type = (raw: string | undefined, filename: string | null): string =>
  raw === undefined
    ? filename === null
      ? ''
      : _guessed(filename)
    : raw.toLowerCase().replace(/\s*;\s*/g, ';');

// Часть без имени или не form-data FormData в Bun пропускает — здесь так же.
const _part = (head: string, start: number, end: number): FormPart | null =>
  ((headers) =>
    ((disposition) =>
      ((name) =>
        name === null
          ? null
          : ((filename) => ({
              name,
              filename,
              type: _type(headers.get('content-type'), filename),
              start,
              end,
            }))(_param(disposition, 'filename')))(
        /^form-data\s*(;|$)/i.test(disposition)
          ? _param(disposition, 'name')
          : null
      ))(headers.get('content-disposition') ?? ''))(_headers(head));

const _u16 = (bytes: BodyBytes, at: number): number =>
  ((pair) => (pair.byteLength === 2 ? pair[0]! * 0x100 + pair[1]! : -1))(
    at >= 0 ? bytes.read(at, at + 2) : new Uint8Array(0)
  );

const _startsWith = (bytes: BodyBytes, prefix: Uint8Array): boolean =>
  ((head) =>
    Buffer.from(head.buffer, head.byteOffset, head.byteLength).equals(prefix))(
    bytes.read(0, prefix.byteLength)
  );

const _BROKEN = Symbol('broken');

// Проход по разделителям `\r\n--граница`: indexOf ищет прямо в теле, в памяти или в файле, без копий.
// Первый разделитель может стоять в самом начале тела, без перевода строки перед ним.
function* _scan(
  bytes: BodyBytes,
  delimiter: Uint8Array
): Generator<FormPart | null | typeof _BROKEN> {
  let at = _startsWith(bytes, delimiter.subarray(2))
    ? -2
    : bytes.indexOf(delimiter, 0);
  let done = false;
  while (!done) {
    const after = at + delimiter.byteLength;
    const marker = at === -1 ? -1 : _u16(bytes, after);
    // Заголовки части кончаются пустой строкой; части без заголовков у формы не бывает.
    const end = marker === _CRLF ? bytes.indexOf(_HEADERS_END, after) : -1;
    const next =
      end > after && end - after <= _MAX_HEAD
        ? bytes.indexOf(delimiter, end + 4)
        : -1;
    done = marker === _DASHES || next < 0;
    yield marker === _DASHES
      ? null
      : next < 0
        ? _BROKEN
        : _part(_decoder.decode(bytes.read(after + 2, end)), end + 4, next);
    at = next;
  }
}

/** Части multipart/form-data по порядку, без копий тела; null — тело не multipart или битое. */
export var parseMultipart = (
  bytes: BodyBytes,
  contentType: string
): FormPart[] | null =>
  ((boundary) =>
    boundary === null
      ? null
      : ((parts) =>
          parts.includes(_BROKEN)
            ? null
            : parts.filter((_): _ is FormPart => _ !== null && _ !== _BROKEN))([
          ..._scan(bytes, _encoder.encode(`\r\n--${boundary}`)),
        ]))(_boundaryOf(contentType));

/** Текст поля формы. */
export var fieldText = (bytes: BodyBytes, part: FormPart): string =>
  _decoder.decode(bytes.read(part.start, part.end));
