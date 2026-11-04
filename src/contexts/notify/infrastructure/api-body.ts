import { Buffer } from 'node:buffer';

/**
 * Байты, которые войдут в тело запроса строкой base64: вложение или письмо целиком. Поток проходится
 * дважды — сначала ради длины (и хэша), потом ради отправки, — и оба раза должен дать одно и то же.
 */
export type Base64Of = {
  readonly base64: () => Iterable<string | Uint8Array>;
};

/** Значение JSON, где строки base64 ещё не собраны; `undefined` у ключа — ключа нет, как у JSON.stringify. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Base64Of
  | readonly Json[]
  | { readonly [key: string]: Json | undefined };

/**
 * Кусок тела: строка, байты или base64 потока. Байты годятся, пока не попросили следующий кусок:
 * `mailParts` пишет base64 вложений в общий буфер.
 */
export type Piece = string | Uint8Array | Base64Of;

const _utf8 = new TextEncoder();
const _EMPTY = new Uint8Array(0);

// Кратно трём: base64 блока без «=» — продолжение base64 всего потока.
const _BLOCK = 3 * 16_384;

const _isBase64 = (value: unknown): value is Base64Of =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Partial<Base64Of>).base64 === 'function';

const _joined = (a: Uint8Array, b: Uint8Array): Uint8Array =>
  ((out) => (out.set(a), out.set(b, a.length), out))(
    new Uint8Array(a.length + b.length)
  );

// Поток кусками, кратными трём байтам (кроме последнего): остаток в один-два байта переходит в
// следующий кусок копией, а не ссылкой на чужой буфер.
function* _aligned(
  chunks: Iterable<string | Uint8Array>
): Generator<Uint8Array> {
  let carry: Uint8Array = _EMPTY;
  for (const chunk of chunks) {
    const bytes = typeof chunk === 'string' ? _utf8.encode(chunk) : chunk;
    const take = Math.min((3 - carry.length) % 3, bytes.length);
    const head =
      carry.length + take === 0
        ? _EMPTY
        : _joined(carry, bytes.subarray(0, take));
    const tail = bytes.subarray(take);
    const end = tail.length - (tail.length % 3);
    if (head.length === 3) yield head;
    for (let at = 0; head.length % 3 === 0 && at < end; at += _BLOCK)
      yield tail.subarray(at, Math.min(end, at + _BLOCK));
    carry = head.length % 3 === 0 ? tail.slice(end) : head;
  }
  if (carry.length > 0) yield carry;
}

const _streamLength = (chunks: Iterable<string | Uint8Array>): number =>
  Iterator.from(chunks).reduce(
    (size, chunk) =>
      size +
      (typeof chunk === 'string'
        ? Buffer.byteLength(chunk, 'utf8')
        : chunk.byteLength),
    0
  );

const _length = (piece: Piece): number =>
  typeof piece === 'string'
    ? Buffer.byteLength(piece, 'utf8')
    : piece instanceof Uint8Array
      ? piece.byteLength
      : Math.ceil(_streamLength(piece.base64()) / 3) * 4;

// Байты тела по порядку. Кусок годится, пока не попросили следующий: base64 вложений письма MIME
// лежит в общем буфере.
function* _bytes(pieces: Iterable<Piece>): Generator<Uint8Array> {
  for (const piece of pieces)
    yield* typeof piece === 'string'
      ? [_utf8.encode(piece)]
      : piece instanceof Uint8Array
        ? [piece]
        : Iterator.from(_aligned(piece.base64())).map((_) =>
            _utf8.encode(_.toBase64())
          );
}

// Порция потока — 256 КиБ: меньше записей в сокет, а в памяти — порция, не тело.
const _PORTION = 256 * 1024;

// Порции из кусков тела; каждая — свой буфер: кусок годится только до следующего, порция — пока её
// не отправили.
function* _portions(chunks: Iterable<Uint8Array>): Generator<Uint8Array> {
  let out = new Uint8Array(_PORTION);
  let at = 0;
  for (const chunk of chunks)
    for (let from = 0; from < chunk.length; ) {
      const take = Math.min(chunk.length - from, _PORTION - at);
      out.set(chunk.subarray(from, from + take), at);
      at += take;
      from += take;
      if (at === _PORTION) {
        yield out;
        out = new Uint8Array(_PORTION);
        at = 0;
      }
    }
  if (at > 0) yield out.subarray(0, at);
}

/** Длина тела, а для подписи — и его SHA-256; тело при этом не собирается. */
export type Measure = {
  readonly length: number;
  readonly sha256: string | null;
};

/**
 * Первый проход по кускам: длина для Content-Length и, если `hash`, SHA-256 для подписи SigV4. Без хэша
 * длина base64 считается по длине байтов, base64 не строится.
 */
export var measured = (
  pieces: () => Iterable<Piece>,
  hash: boolean
): Measure =>
  hash
    ? ((hasher) => ({
        length: Iterator.from(_bytes(pieces())).reduce(
          (size, chunk) => (hasher.update(chunk), size + chunk.byteLength),
          0
        ),
        sha256: hasher.digest('hex'),
      }))(new Bun.CryptoHasher('sha256'))
    : {
        length: Iterator.from(pieces()).reduce(
          (size, _) => size + _length(_),
          0
        ),
        sha256: null,
      };

const _CHANGED = 'The request body changed between the two passes';

/**
 * Второй проход: тело потоком, порция за порцией, по мере того как fetch их забирает (ADR 0043, 0051).
 * Целиком тело в памяти не лежит; разошлось с длиной первого прохода — поток обрывается ошибкой.
 */
export var streamed = (
  pieces: () => Iterable<Piece>,
  length: number
): ReadableStream<Uint8Array<ArrayBuffer>> => {
  const portions = _portions(_bytes(pieces()));
  let sent = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull: (controller) =>
      ((next) =>
        next.done
          ? sent === length
            ? controller.close()
            : controller.error(new Error(_CHANGED))
          : sent + next.value.length > length
            ? controller.error(new Error(_CHANGED))
            : ((sent += next.value.length),
              controller.enqueue(next.value as Uint8Array<ArrayBuffer>)))(
        portions.next()
      ),
  });
};

function* _list(items: readonly Json[]): Generator<Piece> {
  yield '[';
  for (const [index, item] of items.entries()) {
    yield index > 0 ? ',' : '';
    yield* jsonPieces(item);
  }
  yield ']';
}

function* _object(
  value: Readonly<Record<string, Json | undefined>>
): Generator<Piece> {
  const entries = Object.entries(value).filter(
    (entry): entry is [string, Json] => entry[1] !== undefined
  );
  yield '{';
  for (const [index, { 0: key, 1: item }] of entries.entries()) {
    yield `${index > 0 ? ',' : ''}${JSON.stringify(key)}:`;
    yield* jsonPieces(item);
  }
  yield '}';
}

/** JSON кусками: строки base64 остаются потоками и пишутся в тело прямо из байтов. */
export function* jsonPieces(value: Json): Generator<Piece> {
  yield* _isBase64(value)
    ? ['"', value, '"']
    : Array.isArray(value)
      ? _list(value as readonly Json[])
      : value !== null && typeof value === 'object'
        ? _object(value as Readonly<Record<string, Json | undefined>>)
        : [JSON.stringify(value)];
}
