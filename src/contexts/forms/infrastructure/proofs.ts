import type { Proofs } from '../domain/ports.ts';
import { PROOF_LIMITS } from '../domain/proof.ts';

// Срок задачи — срок печати: задача живёт ровно столько, сколько печать, к которой она привязана.
const _LIFETIME_MS = 24 * 60 * 60 * 1000;

const _utf8 = new TextEncoder();

const _sha256 = (text: string): string =>
  new Bun.CryptoHasher('sha256').update(text).digest('hex');

const _same = (a: string, b: string): boolean =>
  a.length === b.length &&
  crypto.timingSafeEqual(_utf8.encode(a), _utf8.encode(b));

// Остаток от деления даёт перекос меньше 0,25 % при пределе до 10 млн — для задачи это не важно.
const _secretNumber = (max: number): number =>
  crypto.getRandomValues(new Uint32Array(1))[0]! % (max + 1);

/**
 * Задачи на HMAC от секрета печатей: свой ключ выводится из него с меткой назначения, так что подпись задачи
 * не годится печатью, и наоборот. Секрет едет файлом настроек сервера вместе с печатями (ADR 0045).
 */
export var defineProofs = (secret: () => string, clock: () => Date): Proofs => {
  let key: { readonly secret: string; readonly bytes: Uint8Array } | null =
    null;
  const keyOf = (): Uint8Array =>
    ((current) =>
      key?.secret === current
        ? key.bytes
        : (key = {
            secret: current,
            bytes: new Uint8Array(
              new Bun.CryptoHasher('sha256', current)
                .update('eile/forms/proof/v1')
                .digest()
            ),
          }).bytes)(secret());
  const sign = (
    form: string,
    stamp: string,
    task: {
      readonly salt: string;
      readonly max: number;
      readonly expires: number;
      readonly hash: string;
    }
  ): string =>
    new Bun.CryptoHasher('sha256', keyOf())
      .update(
        `${form}\n${stamp}\nSHA-256.${task.salt}.${task.max}.${task.expires}.${task.hash}`
      )
      .digest('base64url');
  return {
    issue: (form, stamp, difficulty) => {
      const max = PROOF_LIMITS[difficulty];
      const salt = crypto
        .getRandomValues(new Uint8Array(12))
        .toBase64({ alphabet: 'base64url', omitPadding: true });
      const task = {
        salt,
        max,
        expires: clock().getTime() + _LIFETIME_MS,
        hash: _sha256(`${salt}${_secretNumber(max)}`),
      };
      return {
        algorithm: 'SHA-256',
        ...task,
        signature: sign(form, stamp, task),
      };
    },
    // Подпись — первой: чужая задача, чужая печать или подменённый предел не доходят до хэша.
    verify: (form, stamp, solution) =>
      !_same(solution.signature, sign(form, stamp, solution))
        ? 'invalid'
        : solution.expires <= clock().getTime()
          ? 'expired'
          : solution.number <= solution.max &&
              _sha256(`${solution.salt}${solution.number}`) === solution.hash
            ? 'valid'
            : 'invalid',
  };
};
