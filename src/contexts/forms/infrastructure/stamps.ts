import type { Stamps } from '../domain/ports.ts';

const _DAY_MS = 24 * 60 * 60 * 1000;
const _MAX_SPENT = 10_000;

/**
 * Печать формы на `Bun.CSRF`: в подписи — имя формы и момент показа (`sessionId`), так что подменить
 * момент нельзя, а срок — сутки. Использованные печати помнятся сутки: повтор той же отправки не
 * создаст вторую заявку. `verify` бросает на пустой и не строковой печати — её отсеиваем раньше.
 */
export var defineStamps = (secret: () => string, clock: () => Date): Stamps => {
  let spent = new Map<string, number>();
  const sessionOf = (form: string, iat: number): string => `${form}:${iat}`;
  return {
    issue: (form) =>
      ((iat) => ({
        iat,
        token: Bun.CSRF.generate(secret(), {
          sessionId: sessionOf(form, iat),
          expiresIn: _DAY_MS,
        }),
      }))(clock().getTime()),
    valid: (form, token, iat) =>
      typeof token === 'string' &&
      token !== '' &&
      Number.isSafeInteger(Number(iat)) &&
      clock().getTime() - Number(iat) < _DAY_MS &&
      Bun.CSRF.verify(token, {
        secret: secret(),
        sessionId: sessionOf(form, Number(iat)),
        maxAge: _DAY_MS,
      }),
    spend: (token) => {
      const now = clock().getTime();
      const fresh = !spent.has(token);
      spent = new Map(
        [...spent, [token, now + _DAY_MS] as const]
          .filter(({ 1: until }) => until > now)
          .slice(-_MAX_SPENT)
      );
      return fresh;
    },
  };
};
