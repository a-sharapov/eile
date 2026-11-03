import type { GatewaySecrets } from '../domain/ports.ts';

const _utf8 = new TextEncoder();

// 32 случайных байта — 256 бит: токен не угадать и не перебрать; в заголовке он идёт в base64url.
export var cryptoGatewaySecrets: GatewaySecrets = {
  issue: () =>
    crypto
      .getRandomValues(new Uint8Array(32))
      .toBase64({ alphabet: 'base64url', omitPadding: true }),
  id: () => crypto.getRandomValues(new Uint8Array(6)).toHex(),
  hash: (token) => new Bun.CryptoHasher('sha256').update(token).digest('hex'),
  // timingSafeEqual требует равной длины; хэши sha256 в hex всегда по 64 знака.
  same: (a, b) =>
    a.length === b.length &&
    crypto.timingSafeEqual(_utf8.encode(a), _utf8.encode(b)),
};
