import { fail } from '../shared/kernel/errors.ts';
import { pipe } from '../shared/kernel/pipe.ts';

// Запечатанный файл — копия сайта или настройки сервера, зашифрованные до того, как покинуть машину
// (ADR 0045). Заголовок, затем куски по 1 МиБ, каждый — AES-256-GCM со своим номером и меткой
// последнего куска в nonce (схема STREAM): кусок не подменить, не переставить, а файл — не обрезать и не
// дописать незаметно. Заголовок целиком — дополнительные данные каждого куска.
//
//   0  8  'EILESEAL'            24 32  соль: ключ файла — HKDF(секрет, соль)
//   8  1  версия формата, 1     56 16  проверка ключа: вторая половина вывода HKDF
//   9  1  содержимое: 1 — копия сайта (.db), 2 — настройки сервера (JSON)
//  10  1  секрет: 1 — ключ копий, 2 — пароль (PBKDF2-SHA256)
//  11  1  log2 размера куска, 20 — 1 МиБ
//  12  4  итерации PBKDF2 (у ключа — 0)
//  16  8  отпечаток ключа копий (у пароля — нули)

const _MAGIC = new TextEncoder().encode('EILESEAL');
const _VERSION = 1;
const _HEADER = 72;
const _TAG = 16;
const _CHUNK_LOG = 20;
const _INFO = new TextEncoder().encode('eile seal v1');

/** Итерации PBKDF2-SHA256 для пароля: OWASP 2023 — от 600 000. */
export var SEAL_ITERATIONS = 600_000;

export type SealContent = 'site' | 'settings';

/** Байты на собственном ArrayBuffer — их принимает WebCrypto. */
export type Bytes = Uint8Array<ArrayBuffer>;

const _CONTENT: Readonly<Record<SealContent, number>> = {
  site: 1,
  settings: 2,
};

/** Чем запечатан файл: ключ копий сервера (32 байта) или пароль владельца. */
export type SealSecret =
  | { readonly key: Bytes }
  | { readonly passphrase: string };

/** Откуда читать: размер и байты [start, end). */
export type SealSource = {
  readonly size: number;
  readonly read: (start: number, end: number) => Promise<Bytes>;
};

/** Куда писать: `FileSink` файла, `writer()` объекта S3 или память. */
export type SealSink = {
  readonly write: (chunk: Uint8Array) => unknown;
  readonly flush?: () => unknown;
  readonly end: () => unknown;
};

/** Что видно в заголовке без секрета. */
export type SealInfo = {
  readonly content: SealContent;
  readonly secret: 'key' | 'passphrase';
  /** Отпечаток ключа копий; у пароля — null. */
  readonly keyId: string | null;
};

export var fileSource = (path: string): SealSource => ({
  size: Bun.file(path).size,
  read: (start, end) => Bun.file(path).slice(start, end).bytes(),
});

export var bytesSource = (bytes: Bytes): SealSource => ({
  size: bytes.byteLength,
  read: (start, end) => Promise.resolve(bytes.subarray(start, end)),
});

/** Сток в память: `bytes()` — всё записанное одним буфером. */
export var memorySink = () => {
  const parts: Uint8Array[] = [];
  return {
    write: (chunk: Uint8Array) => void parts.push(chunk),
    end: () => undefined,
    bytes: (): Bytes =>
      new Uint8Array(Bun.concatArrayBuffers(parts, Infinity, true)),
  };
};

/** Новый ключ копий: 32 случайных байта. */
export var newBackupKey = (): Bytes =>
  crypto.getRandomValues(new Uint8Array(32));

/** Отпечаток ключа копий — 16 знаков hex: по нему видно, каким ключом запечатана копия. */
export var keyIdOf = (key: Uint8Array): string =>
  new Bun.CryptoHasher('sha256', key)
    .update('eile backup key id')
    .digest()
    .subarray(0, 8)
    .toHex();

// Ключ восстановления — ключ копий и 2 байта контрольной суммы в base32 Крокфорда (без I, L, O, U),
// группами по 5: опечатку видно сразу, а не после скачивания копии.
const _BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const _ALIASES: Readonly<Record<string, string>> = { O: '0', I: '1', L: '1' };

const _checksum = (key: Uint8Array): Uint8Array =>
  new Bun.CryptoHasher('sha256').update(key).digest().subarray(0, 2);

const _bitsOf = (bytes: Uint8Array): string =>
  [...bytes].map((_) => _.toString(2).padStart(8, '0')).join('');

/** Ключ восстановления, который владелец сохраняет у себя: 55 знаков группами по 5. */
export var recoveryKeyOf = (key: Uint8Array): string =>
  pipe(
    (_: Uint8Array) => _bitsOf(new Uint8Array([..._, ..._checksum(_)])),
    (bits) => bits.padEnd(Math.ceil(bits.length / 5) * 5, '0'),
    (bits) =>
      Array.from(
        { length: bits.length / 5 },
        (_, n) => _BASE32[Number.parseInt(bits.slice(n * 5, n * 5 + 5), 2)]
      ).join(''),
    (text) => text.match(/.{1,5}/g)!.join('-')
  )(key);

const _invalidRecovery = (): never =>
  fail(
    'seal.invalid_recovery_key',
    'This is not a recovery key: 55 letters and digits in groups of 5'
  );

/** Ключ копий из ключа восстановления; регистр, пробелы и дефисы не важны, O читается как 0, I и L — как 1. */
export var parseRecoveryKey = (text: string): Bytes =>
  pipe(
    (_: string) =>
      [..._.toUpperCase().replace(/[\s-]/g, '')].map((c) => _ALIASES[c] ?? c),
    (chars) =>
      chars.length === 55 && chars.every((_) => _BASE32.includes(_))
        ? chars
            .map((_) => _BASE32.indexOf(_).toString(2).padStart(5, '0'))
            .join('')
        : _invalidRecovery(),
    (bits) =>
      new Uint8Array(
        Array.from({ length: 34 }, (_, n) =>
          Number.parseInt(bits.slice(n * 8, n * 8 + 8), 2)
        )
      ),
    (bytes) =>
      ((key, sum) =>
        sum.every((_, n) => _ === _checksum(key)[n])
          ? key
          : _invalidRecovery())(bytes.subarray(0, 32), bytes.subarray(32))
  )(text);

type _Keys = { readonly aes: CryptoKey; readonly check: Bytes };

const _material = (
  secret: SealSecret,
  salt: Bytes,
  iterations: number
): Promise<Bytes> =>
  'key' in secret
    ? Promise.resolve(secret.key)
    : crypto.subtle
        .importKey(
          'raw',
          new TextEncoder().encode(secret.passphrase.normalize('NFC')),
          'PBKDF2',
          false,
          ['deriveBits']
        )
        .then((base) =>
          crypto.subtle.deriveBits(
            { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
            base,
            256
          )
        )
        .then((_) => new Uint8Array(_));

// Ключ файла — свой у каждого файла (случайная соль): nonce можно считать от номера куска.
const _keys = (
  secret: SealSecret,
  salt: Bytes,
  iterations: number
): Promise<_Keys> =>
  _material(secret, salt, iterations)
    .then((ikm) =>
      crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    )
    .then((base) =>
      crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info: _INFO },
        base,
        384
      )
    )
    .then((bits) => new Uint8Array(bits))
    .then((bits) =>
      crypto.subtle
        .importKey('raw', bits.subarray(0, 32), 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ])
        .then((aes) => ({ aes, check: bits.slice(32, 48) }))
    );

const _nonce = (index: number, last: boolean): Bytes =>
  ((nonce) => (
    new DataView(nonce.buffer).setUint32(7, index),
    (nonce[11] = last ? 1 : 0),
    nonce
  ))(new Uint8Array(12));

const _header = (
  content: SealContent,
  secret: SealSecret,
  salt: Bytes,
  check: Bytes
): Bytes =>
  ((header) => {
    const view = new DataView(header.buffer);
    header.set(_MAGIC, 0);
    header[8] = _VERSION;
    header[9] = _CONTENT[content];
    header[10] = 'key' in secret ? 1 : 2;
    header[11] = _CHUNK_LOG;
    view.setUint32(12, 'key' in secret ? 0 : SEAL_ITERATIONS);
    void (
      'key' in secret && header.set(Uint8Array.fromHex(keyIdOf(secret.key)), 16)
    );
    header.set(salt, 24);
    header.set(check, 56);
    return header;
  })(new Uint8Array(_HEADER));

/** Размер запечатанного файла для `size` байт: заголовок, куски и метка каждого (последний — неполный). */
export var sealedSize = (size: number): number =>
  _HEADER + size + (Math.floor(size / 2 ** _CHUNK_LOG) + 1) * _TAG;

const _chunkCount = (size: number): number =>
  Math.floor(size / 2 ** _CHUNK_LOG) + 1;

// Куски — строго по очереди: в стоке не больше одного куска сверх его буфера.
const _inOrder = (
  count: number,
  step: (index: number) => Promise<unknown>
): Promise<void> =>
  Array.from({ length: count }, (_, index) => index).reduce<Promise<void>>(
    (previous, index) => previous.then(() => step(index)).then(() => undefined),
    Promise.resolve()
  );

/**
 * Запечатать `source` в `sink`: заголовок и куски по очереди. `end()` стока зовётся только после
 * последнего куска: при сбое по пути загрузка в S3 не завершится и неполного объекта не будет.
 */
export var seal = (
  source: SealSource,
  content: SealContent,
  secret: SealSecret,
  sink: SealSink
): Promise<number> => {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const size = 2 ** _CHUNK_LOG;
  const count = _chunkCount(source.size);
  return _keys(secret, salt, SEAL_ITERATIONS).then(({ aes, check }) => {
    const header = _header(content, secret, salt, check);
    sink.write(header);
    return _inOrder(count, (index) =>
      source
        .read(index * size, Math.min(source.size, (index + 1) * size))
        .then((plain) =>
          crypto.subtle.encrypt(
            {
              name: 'AES-GCM',
              iv: _nonce(index, index === count - 1),
              additionalData: header,
            },
            aes,
            plain
          )
        )
        .then((cipher) => sink.write(new Uint8Array(cipher)))
        .then(() => sink.flush?.())
    )
      .then(() => sink.end())
      .then(() => sealedSize(source.size));
  });
};

const _damaged = (): never =>
  fail('seal.damaged', 'The sealed file is damaged or was changed');

const _CONTENT_OF: Readonly<Record<number, SealContent>> = {
  1: 'site',
  2: 'settings',
};

/** Заголовок запечатанного файла; не он — `seal.not_sealed`, другая версия формата — `seal.unsupported`. */
export var sealInfo = (header: Uint8Array): SealInfo =>
  header.byteLength >= _HEADER && _MAGIC.every((_, n) => header[n] === _)
    ? header[8] === _VERSION &&
      _CONTENT_OF[header[9]!] !== undefined &&
      (header[10] === 1 || header[10] === 2) &&
      header[11] === _CHUNK_LOG
      ? {
          content: _CONTENT_OF[header[9]!]!,
          secret: header[10] === 1 ? 'key' : 'passphrase',
          keyId: header[10] === 1 ? header.subarray(16, 24).toHex() : null,
        }
      : fail('seal.unsupported', 'The sealed file has an unknown format')
    : fail('seal.not_sealed', 'Not a sealed file');

const _checkSecret = (info: SealInfo, secret: SealSecret): void =>
  void (info.secret === ('key' in secret ? 'key' : 'passphrase')
    ? 'key' in secret &&
      info.keyId !== keyIdOf(secret.key) &&
      fail(
        'seal.wrong_key',
        `The copy was sealed with another backup key (${info.keyId})`
      )
    : fail(
        'seal.wrong_secret',
        info.secret === 'key'
          ? 'The file is sealed with a backup key, not a passphrase'
          : 'The file is sealed with a passphrase, not a backup key'
      ));

const _sameCheck = (a: Uint8Array, b: Uint8Array): boolean =>
  a.byteLength === b.byteLength && crypto.timingSafeEqual(a, b);

/**
 * Распечатать `source` в `sink`, проверяя каждый кусок. Чужой ключ или пароль — `seal.wrong_key` /
 * `seal.wrong_passphrase` до первого куска; подмена, перестановка, обрезка или хвост — `seal.damaged`.
 * Сток мог получить начало: при отказе записанное нужно выбросить.
 */
export var unseal = (
  source: SealSource,
  content: SealContent,
  secret: SealSecret,
  sink: SealSink
): Promise<number> =>
  source.read(0, Math.min(source.size, _HEADER)).then((header) => {
    const info = sealInfo(header);
    void (
      info.content === content ||
      fail(
        'seal.other_content',
        info.content === 'site'
          ? 'This is a sealed site copy, not server settings'
          : 'This is a sealed server settings file, not a site copy'
      )
    );
    _checkSecret(info, secret);
    const head = header.slice(0, _HEADER);
    const view = new DataView(head.buffer);
    const size = 2 ** _CHUNK_LOG;
    const body = source.size - _HEADER;
    const tail = body % (size + _TAG);
    const count = Math.floor(body / (size + _TAG)) + 1;
    return _keys(secret, head.slice(24, 56), view.getUint32(12)).then(
      ({ aes, check }) =>
        _sameCheck(check, head.subarray(56, 72))
          ? tail < _TAG
            ? _damaged()
            : _inOrder(count, (index) =>
                source
                  .read(
                    _HEADER + index * (size + _TAG),
                    Math.min(source.size, _HEADER + (index + 1) * (size + _TAG))
                  )
                  .then((cipher) =>
                    crypto.subtle
                      .decrypt(
                        {
                          name: 'AES-GCM',
                          iv: _nonce(index, index === count - 1),
                          additionalData: head,
                        },
                        aes,
                        cipher
                      )
                      .then(undefined, _damaged)
                  )
                  .then((plain) => sink.write(new Uint8Array(plain)))
                  .then(() => sink.flush?.())
              )
                .then(() => sink.end())
                .then(() => body - count * _TAG)
          : // Отпечаток ключа совпал, а проверка — нет: заголовок испорчен. У пароля это не различить.
            info.secret === 'key'
            ? _damaged()
            : fail(
                'seal.wrong_passphrase',
                'The passphrase does not open this file'
              )
    );
  });

/** Небольшое содержимое (настройки сервера) — запечатать в память. */
export var sealBytes = (
  bytes: Bytes,
  content: SealContent,
  secret: SealSecret
): Promise<Bytes> =>
  ((sink) =>
    seal(bytesSource(bytes), content, secret, sink).then(() => sink.bytes()))(
    memorySink()
  );

export var unsealBytes = (
  bytes: Bytes,
  content: SealContent,
  secret: SealSecret
): Promise<Bytes> =>
  ((sink) =>
    unseal(bytesSource(bytes), content, secret, sink).then(() => sink.bytes()))(
    memorySink()
  );
