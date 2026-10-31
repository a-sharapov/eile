// Минимальный кодировщик ASN.1 DER — ровно на запрос сертификата (PKCS#10) и подпись ECDSA. Своё, а не
// пакет: нужно с десяток конструкций, а WebCrypto сам отдаёт ключ в SubjectPublicKeyInfo.

const _concat = (parts: readonly Uint8Array[]): Uint8Array =>
  parts.reduce<{ bytes: Uint8Array; at: number }>(
    (acc, part) => (
      acc.bytes.set(part, acc.at), { ...acc, at: acc.at + part.length }
    ),
    {
      bytes: new Uint8Array(parts.reduce((sum, _) => sum + _.length, 0)),
      at: 0,
    }
  ).bytes;

// Длина: до 127 — одним байтом, дальше — 0x80 | число байт и сама длина старшими вперёд.
const _length = (n: number): number[] =>
  n < 0x80
    ? [n]
    : ((bytes) => [0x80 | bytes.length, ...bytes])(
        [...Array(4)]
          .map((_, i) => (n >>> (8 * (3 - i))) & 0xff)
          .filter((_, i, all) => all.slice(0, i + 1).some((b) => b !== 0))
      );

export var tlv = (tag: number, ...content: readonly Uint8Array[]): Uint8Array =>
  ((body) => _concat([new Uint8Array([tag, ..._length(body.length)]), body]))(
    _concat(content)
  );

export var sequence = (...items: readonly Uint8Array[]): Uint8Array =>
  tlv(0x30, ...items);

export var set = (...items: readonly Uint8Array[]): Uint8Array =>
  tlv(0x31, ...items);

// Старшие нулевые байты не нужны; ноль — один байт.
const _trimmed = (bytes: Uint8Array): Uint8Array =>
  ((first) => (first === -1 ? new Uint8Array([0]) : bytes.subarray(first)))(
    bytes.findIndex((_) => _ !== 0)
  );

/** Неотрицательное целое из байтов старшими вперёд: с нулём впереди, если старший бит занят. */
export var integer = (bytes: Uint8Array): Uint8Array =>
  ((value) =>
    tlv(
      0x02,
      value[0]! & 0x80 ? _concat([new Uint8Array([0]), value]) : value
    ))(_trimmed(bytes));

export var small = (n: number): Uint8Array => integer(new Uint8Array([n]));

// Компонента OID в base-128: старшие группы с битом продолжения.
const _base128 = (n: number): number[] =>
  [...Array(5)]
    .map((_, i) => (n >>> (7 * (4 - i))) & 0x7f)
    .filter((_, i, all) => i === 4 || all.slice(0, i + 1).some((b) => b !== 0))
    .map((b, i, all) => (i < all.length - 1 ? b | 0x80 : b));

export var oid = (dotted: string): Uint8Array =>
  ((parts) =>
    tlv(
      0x06,
      new Uint8Array([
        parts[0]! * 40 + parts[1]!,
        ...parts.slice(2).flatMap(_base128),
      ])
    ))(dotted.split('.').map(Number));

export var utf8 = (text: string): Uint8Array =>
  tlv(0x0c, new TextEncoder().encode(text));

export var octetString = (bytes: Uint8Array): Uint8Array => tlv(0x04, bytes);

/** BIT STRING без неиспользуемых бит — так кодируют подписи и ключи. */
export var bitString = (bytes: Uint8Array): Uint8Array =>
  tlv(0x03, new Uint8Array([0]), bytes);

/** Тег контекста `[n]`: конструированный — для вложенных структур, простой — для строк вроде dNSName. */
export var context = (
  n: number,
  constructed: boolean,
  ...content: readonly Uint8Array[]
): Uint8Array => tlv((constructed ? 0xa0 : 0x80) | n, ...content);

export var OID = {
  commonName: '2.5.4.3',
  subjectAltName: '2.5.29.17',
  extensionRequest: '1.2.840.113549.1.9.14',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
} as const;

/** Имя субъекта из одного CN. */
export var commonName = (name: string): Uint8Array =>
  sequence(set(sequence(oid(OID.commonName), utf8(name))));

/** Расширение subjectAltName: список dNSName. */
export var altNames = (domains: readonly string[]): Uint8Array =>
  sequence(
    oid(OID.subjectAltName),
    octetString(
      sequence(
        ...domains.map((_) => context(2, false, new TextEncoder().encode(_)))
      )
    )
  );

/** Подпись WebCrypto (r‖s по 32 байта) → Ecdsa-Sig-Value, как её ждут X.509 и PKCS#10. */
export var ecdsaSignature = (raw: Uint8Array): Uint8Array =>
  sequence(
    integer(raw.subarray(0, raw.length / 2)),
    integer(raw.subarray(raw.length / 2))
  );

export var ecdsaWithSha256 = (): Uint8Array =>
  sequence(oid(OID.ecdsaWithSha256));

const _sign = (key: CryptoKey, data: Uint8Array): Promise<Uint8Array> =>
  crypto.subtle
    .sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      data as Uint8Array<ArrayBuffer>
    )
    .then((_) => new Uint8Array(_));

/** Подписать структуру ключом P-256: структура, алгоритм и подпись — как у сертификата и запроса. */
export var signed = (body: Uint8Array, key: CryptoKey): Promise<Uint8Array> =>
  _sign(key, body).then((raw) =>
    sequence(body, ecdsaWithSha256(), bitString(ecdsaSignature(raw)))
  );

/**
 * Запрос сертификата PKCS#10: субъект — первое имя, все имена — в subjectAltName (центр смотрит только
 * на них), открытый ключ — как его отдал WebCrypto.
 */
export var certificateRequest = (
  domains: readonly string[],
  keys: CryptoKeyPair
): Promise<Uint8Array> =>
  crypto.subtle
    .exportKey('spki', keys.publicKey)
    .then((spki) =>
      signed(
        sequence(
          small(0),
          commonName(domains[0]!),
          new Uint8Array(spki),
          context(
            0,
            true,
            sequence(
              oid(OID.extensionRequest),
              set(sequence(altNames(domains)))
            )
          )
        ),
        keys.privateKey
      )
    );

/** DER → PEM с заголовком: строки по 64 символа. */
export var pem = (label: string, der: Uint8Array): string =>
  [
    `-----BEGIN ${label}-----`,
    ...(der.toBase64().match(/.{1,64}/g) ?? []),
    `-----END ${label}-----`,
    '',
  ].join('\n');
