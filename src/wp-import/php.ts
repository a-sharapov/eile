import { attempt } from '../shared/kernel/errors.ts';

/** Значение `serialize()` PHP: массивы и объекты — словари с ключами-строками в исходном порядке. */
export type PhpValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: PhpValue };

type Cursor = { readonly bytes: Uint8Array; at: number };

// Разбор — автомат по байтам, как у дампа MySQL (evo-import/sql-dump.ts): так проще не ошибиться в длинах.

const _decoder = new TextDecoder();

// Длина строки в `s:5:"…"` — в байтах UTF-8, поэтому разбор идёт по байтам, а не по символам JS.
const _until = (c: Cursor, stop: number): string => {
  const end = c.bytes.indexOf(stop, c.at);
  const text = _decoder.decode(
    c.bytes.subarray(c.at, end < 0 ? c.bytes.length : end)
  );
  c.at = end < 0 ? c.bytes.length : end + 1;
  return text;
};

const _COLON = 0x3a;
const _SEMICOLON = 0x3b;
const _BRACE = 0x7b;

const _fail = (): never => {
  throw new SyntaxError('Not a PHP serialized value');
};

const _value = (c: Cursor, depth: number): PhpValue => {
  const type = String.fromCharCode(c.bytes[c.at] ?? 0);
  c.at += 2;
  return type === 'N'
    ? null
    : type === 'b'
      ? _until(c, _SEMICOLON) === '1'
      : type === 'i' || type === 'd'
        ? Number(_until(c, _SEMICOLON))
        : type === 's'
          ? _string(c)
          : type === 'a'
            ? _array(c, depth)
            : type === 'O'
              ? (_until(c, _COLON), _until(c, _COLON), _array(c, depth))
              : _fail();
};

const _string = (c: Cursor): string => {
  const length = Number(_until(c, _COLON));
  const text = _decoder.decode(c.bytes.subarray(c.at + 1, c.at + 1 + length));
  c.at += length + 3;
  return text;
};

const _array = (c: Cursor, depth: number): { [key: string]: PhpValue } => {
  _until(c, _COLON);
  return _entries(c, depth);
};

// `{ключ;значение;…}` — число пар уже прочитано, конец — по `}`.
const _entries = (c: Cursor, depth: number): { [key: string]: PhpValue } => {
  void (c.bytes[c.at] === _BRACE || _fail());
  void (depth > 64 && _fail());
  c.at++;
  const out: { [key: string]: PhpValue } = {};
  while (c.at < c.bytes.length && c.bytes[c.at] !== 0x7d) {
    const key = _value(c, depth + 1);
    out[String(key)] = _value(c, depth + 1);
  }
  c.at++;
  return out;
};

/** `a:1:{s:3:"key";i:5;}` → `{ key: 5 }`; не сериализованное PHP — null. */
export var unserialize = (raw: string): PhpValue | null => {
  const text = raw.trim();
  return /^(?:[abdiOs]:|N;)/.test(text)
    ? ((c: Cursor) =>
        attempt(
          () =>
            ((value) => (c.at >= c.bytes.length - 1 ? value : null))(
              _value(c, 0)
            ),
          () => null
        ))({ bytes: new TextEncoder().encode(text), at: 0 })
    : null;
};

/** Значения массива PHP по порядку: `a:2:{i:0;s:1:"x";i:1;s:1:"y";}` → `['x', 'y']`. */
export var phpList = (value: PhpValue | null): PhpValue[] =>
  value !== null && typeof value === 'object' ? Object.values(value) : [];

/** Поле словаря PHP; нет его или это не словарь — null. */
export var phpField = (value: PhpValue | null, key: string): PhpValue | null =>
  value !== null && typeof value === 'object' && Object.hasOwn(value, key)
    ? (value[key] ?? null)
    : null;
