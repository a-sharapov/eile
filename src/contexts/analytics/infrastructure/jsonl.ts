import { attempt } from '../../../shared/kernel/errors.ts';
import { EVENT_LIMITS } from '../domain/envelope.ts';
import type { FileLine, LineSource } from '../domain/ports.ts';

const _NEWLINE = 0x0a;
const _RETURN = 0x0d;

function* _breaks(chunk: Uint8Array): Generator<number> {
  let at = chunk.indexOf(_NEWLINE);
  while (at !== -1) {
    yield at;
    at = chunk.indexOf(_NEWLINE, at + 1);
  }
}

const _joined = (parts: readonly Uint8Array[], size: number): Uint8Array =>
  parts.length === 1
    ? (parts[0] as Uint8Array)
    : ((bytes) => (
        parts.reduce((at, part) => (bytes.set(part, at), at + part.length), 0),
        bytes
      ))(new Uint8Array(size));

// Файлы из Windows кончают строки `\r\n`: `\r` в строку не входит.
const _content = (bytes: Uint8Array): Uint8Array =>
  bytes.at(-1) === _RETURN ? bytes.subarray(0, -1) : bytes;

const _lineOf = (
  line: number,
  parts: readonly Uint8Array[],
  size: number,
  limit: number,
  decoder: TextDecoder
): FileLine =>
  ((bytes) =>
    bytes === null || bytes.length > limit
      ? { line, error: `is larger than ${limit} bytes` }
      : attempt<FileLine>(
          () => ({ line, text: decoder.decode(bytes) }),
          () => ({ line, error: 'is not UTF-8' })
        ))(size > limit + 1 ? null : _content(_joined(parts, size)));

/**
 * Строки файла JSON Lines из потока байтов: в памяти — кусок потока и начатая строка, а не файл. Строка
 * длиннее предела не копится — её байты только считаются до перевода строки, и она становится ошибкой.
 * Метку порядка байтов в начале снимает декодер.
 */
export var defineLineSource = (
  stream: ReadableStream<Uint8Array>,
  limit: number = EVENT_LIMITS.body
): LineSource => {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let parts: Uint8Array[] = [];
  let size = 0;
  let number = 0;
  // Кусок потока бывает в тысячи строк: готовые строки копятся без копий массива.
  let ready: FileLine[] = [];
  let ended = false;

  // С запасом на `\r` перед переводом строки.
  const keep = (piece: Uint8Array): void =>
    void ((size += piece.length), size <= limit + 1 && parts.push(piece));

  const close = (): void =>
    void (ready.push(_lineOf(++number, parts, size, limit, decoder)),
    (parts = []),
    (size = 0));

  const feed = (chunk: Uint8Array): void =>
    ((breaks) => (
      breaks.forEach(
        (end, index) =>
          void (keep(chunk.subarray((breaks[index - 1] ?? -1) + 1, end)),
          close())
      ),
      keep(chunk.subarray((breaks.at(-1) ?? -1) + 1))
    ))([..._breaks(chunk)]);

  // Последняя строка без перевода строки — тоже строка; перевод строки в конце файла новой не начинает.
  const finish = (): void => void ((ended = true), size > 0 && close());

  const take = (count: number): readonly FileLine[] =>
    ((lines) => ((ready = ready.slice(count)), lines))(ready.slice(0, count));

  const next = (count: number): Promise<readonly FileLine[]> =>
    ready.length >= count || ended
      ? Promise.resolve(take(count))
      : reader
          .read()
          .then((_) => (_.done ? finish() : feed(_.value), next(count)));

  return {
    next,
    close: () => void reader.cancel().then(undefined, () => undefined),
  };
};
