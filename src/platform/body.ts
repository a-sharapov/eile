import { closeSync, openSync, readSync, rmSync } from 'node:fs';

// Большие тела — без лишних копий (ADR 0043). `Response#arrayBuffer()` и `Request#formData()` держат и
// пришедшие куски, и их склейку, а `new Request(…, { body })` копирует тело ещё раз.

/** Тело запроса, которое читается окнами: из памяти или из временного файла на диске. */
export type BodyBytes = {
  readonly size: number;
  /**
   * Байты [start, end). Из памяти — окно в тело без копии. Из файла — буфер, который следующее чтение
   * не длиннее окна (1 МиБ) перезапишет: прочитанное нужно сразу разобрать или скопировать.
   */
  readonly read: (start: number, end: number) => Uint8Array;
  /** Где `needle` встречается впервые не раньше `from`; -1 — нигде. */
  readonly indexOf: (needle: Uint8Array, from: number) => number;
  /** Всё тело текстом UTF-8 — одной копией, без буфера рядом. */
  readonly text: () => Promise<string>;
  /** Временный файл закрывается и удаляется; у тела в памяти — ничего. */
  readonly close: () => void;
};

/** Тело с заголовками: запрос к серверу или ответ на скачивание (`fetch`). */
export type Incoming = Pick<Request, 'headers' | 'body'>;

const _declared = (request: Incoming): number | null =>
  ((raw) => (raw !== null && /^\d+$/.test(raw) ? Number(raw) : null))(
    request.headers.get('content-length')?.trim() ?? null
  );

// Без Content-Length (chunked) буфер растёт вдвое: склеек — логарифм от размера, а не по куску.
const _START = 64 * 1024;

const _grown = (buffer: Uint8Array, length: number, size: number): Uint8Array =>
  ((next) => (next.set(buffer.subarray(0, length)), next))(
    new Uint8Array(size)
  );

const _fill = (
  body: ReadableStream<Uint8Array>,
  size: number,
  limit: number,
  tooLarge: () => Error
): Promise<Uint8Array> => {
  let buffer: Uint8Array = new Uint8Array(size);
  let length = 0;
  const write = (chunk: Uint8Array): Promise<void> | undefined =>
    ((next) =>
      next > limit
        ? Promise.reject(tooLarge())
        : void ((buffer =
            next > buffer.byteLength
              ? _grown(
                  buffer,
                  length,
                  Math.min(limit, Math.max(next, buffer.byteLength * 2))
                )
              : buffer),
          buffer.set(chunk, length),
          (length = next)))(length + chunk.byteLength);
  return body
    .pipeTo(new WritableStream({ write }))
    .then(() => buffer.subarray(0, length));
};

/**
 * Тело запроса одним буфером: при Content-Length — сразу нужной длины, куски копируются в него по мере
 * прихода. Больше `limit` — отказ `tooLarge()`: ни ложный Content-Length, ни chunked больше не протащат.
 */
export var readBody = (
  request: Incoming,
  limit: number,
  tooLarge: () => Error
): Promise<Uint8Array> =>
  ((declared) =>
    declared !== null && declared > limit
      ? Promise.reject(tooLarge())
      : request.body === null
        ? Promise.resolve(new Uint8Array(0))
        : _fill(
            request.body,
            declared ?? Math.min(limit, _START),
            limit,
            tooLarge
          ))(_declared(request));

/** Тело в памяти — как `BodyBytes`: окна без копий. */
export var bytesOf = (buffer: Uint8Array): BodyBytes =>
  ((view) => ({
    size: buffer.byteLength,
    read: (start, end) => buffer.subarray(start, end),
    indexOf: (needle, from) => view.indexOf(needle, from),
    text: () => Promise.resolve(new TextDecoder().decode(buffer)),
    close: () => undefined,
  }))(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));

const _WINDOW = 1024 * 1024;
// Окно с запасом на искомое: разделитель multipart — граница до 70 знаков и ещё четыре.
const _SPARE = 256;

const _fromFile = (path: string, size: number): BodyBytes => {
  const fd = openSync(path, 'r');
  const window = new Uint8Array(_WINDOW + _SPARE);
  let open = true;
  const read = (start: number, end: number): Uint8Array =>
    ((length) =>
      ((target) => target.subarray(0, readSync(fd, target, 0, length, start)))(
        length <= window.byteLength ? window : new Uint8Array(length)
      ))(Math.max(0, Math.min(end, size) - start));
  // Окна по 1 МиБ внахлёст на длину искомого: совпадение на стыке окон не теряется.
  const find = (needle: Uint8Array, at: number): number =>
    at >= size
      ? -1
      : ((part) =>
          ((found) => (found >= 0 ? at + found : find(needle, at + _WINDOW)))(
            Buffer.from(part.buffer, part.byteOffset, part.byteLength).indexOf(
              needle
            )
          ))(read(at, at + _WINDOW + needle.byteLength - 1));
  return {
    size,
    read,
    indexOf: (needle, from) => find(needle, Math.max(0, from)),
    text: () => Bun.file(path).text(),
    close: () =>
      void (
        open && ((open = false), closeSync(fd), rmSync(path, { force: true }))
      ),
  };
};

// Счётчик байтов в потоке: тело без Content-Length (chunked) не протащит больше потолка.
const _counting = (
  limit: number,
  tooLarge: () => Error
): TransformStream<Uint8Array, Uint8Array> => {
  let size = 0;
  return new TransformStream({
    transform: (chunk, controller) =>
      (size += chunk.byteLength) > limit
        ? controller.error(tooLarge())
        : controller.enqueue(chunk),
  });
};

/**
 * Тело запроса — во временный файл `path` на диске: в памяти его нет вовсе. С Content-Length Bun пишет
 * поток в файл сам, без кусков в JS; больше длину тела Bun.serve не пропустит, а размер ещё раз
 * сверяется после записи. Больше `limit` — отказ `tooLarge()`, файл удалён.
 */
export var spoolBody = (
  request: Incoming,
  limit: number,
  tooLarge: () => Error,
  path: string
): Promise<BodyBytes> =>
  ((declared) =>
    declared !== null && declared > limit
      ? Promise.reject(tooLarge())
      : Bun.write(
          path,
          new Response(
            declared === null
              ? (request.body?.pipeThrough(_counting(limit, tooLarge)) ?? null)
              : request.body
          )
        )
          .then((size) =>
            size > limit ? Promise.reject(tooLarge()) : _fromFile(path, size)
          )
          .then(
            undefined,
            (error) => (rmSync(path, { force: true }), Promise.reject(error))
          ))(_declared(request));
