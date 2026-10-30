import { expect, it } from 'bun:test';
import { failureOf, nextAttempt, RETRY_DELAYS_MS } from './delivery.ts';

const _TRANSIENT = { permanent: false, retryAfter: null, message: 'timeout' };

it('паузы растут, после последней — отказ', () => {
  expect(nextAttempt(1, _TRANSIENT, 0)).toBe(60_000);
  expect(nextAttempt(2, _TRANSIENT, 0)).toBe(5 * 60_000);
  expect(nextAttempt(RETRY_DELAYS_MS.length, _TRANSIENT, 0)).toBe(
    12 * 60 * 60_000
  );
  expect(nextAttempt(RETRY_DELAYS_MS.length + 1, _TRANSIENT, 0)).toBeNull();
});

it('канал просит подождать дольше — ждём; отказ насовсем — без повторов', () => {
  expect(nextAttempt(1, { ..._TRANSIENT, retryAfter: 90_000 }, 10)).toBe(
    90_010
  );
  expect(nextAttempt(1, { ..._TRANSIENT, permanent: true }, 0)).toBeNull();
});

it('незнакомая ошибка — временная, сообщение как есть', () => {
  expect(failureOf(new Error('ECONNRESET'))).toEqual({
    permanent: false,
    retryAfter: null,
    message: 'ECONNRESET',
  });
  expect(
    failureOf(
      Object.assign(new Error('Forbidden: bot was blocked'), {
        permanent: true,
      })
    ).permanent
  ).toBe(true);
});
