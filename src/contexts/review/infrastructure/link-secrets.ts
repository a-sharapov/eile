import type { LinkSecrets } from '../domain/ports.ts';
import { SELECTOR_LENGTH, VERIFIER_LENGTH } from '../domain/share-link.ts';

const _random = (length: number): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array((length * 3) / 4)))
    .toString('base64url')
    .slice(0, length);

const _encoder = new TextEncoder();

/** 72 бита на поиск и 192 бита секрета; в базе — SHA-256 секрета. */
export var cryptoLinkSecrets: LinkSecrets = {
  issue: () => ({
    selector: _random(SELECTOR_LENGTH),
    verifier: _random(VERIFIER_LENGTH),
  }),
  hash: (verifier) =>
    new Bun.CryptoHasher('sha256').update(verifier).digest('hex'),
  // Хэши одной длины; пустой (нет ссылки) сравнивается с собой же, чтобы время не выдавало ответ.
  same: (a, b) =>
    ((left, right) =>
      left.length === right.length
        ? crypto.timingSafeEqual(left, right)
        : (crypto.timingSafeEqual(left, left), false))(
      _encoder.encode(a),
      _encoder.encode(b)
    ),
};
