import { expect, it } from 'bun:test';
import {
  admit,
  EMPTY_THROTTLE,
  fingerprintOf,
  HOURLY_CAP,
  REPEAT_WINDOW_MS,
  type Throttle,
  type Verdict,
} from './incident.ts';

const run = (
  events: readonly (readonly [fingerprint: string, at: number])[],
  start: Throttle = EMPTY_THROTTLE
): Verdict[] =>
  events.reduce<{ state: Throttle; verdicts: Verdict[] }>(
    (acc, { 0: fingerprint, 1: at }) =>
      ((next) => ({
        state: next.state,
        verdicts: [...acc.verdicts, next.verdict],
      }))(admit(acc.state, fingerprint, at)),
    { state: start, verdicts: [] }
  ).verdicts;

const _MIN = 60_000;

it('первый сбой — сразу, повторы в окне — в журнал, после окна — со счётчиком', () => {
  expect(
    run([
      ['a', 0],
      ['a', _MIN],
      ['a', 2 * _MIN],
      ['b', 3 * _MIN],
      ['a', REPEAT_WINDOW_MS + _MIN],
    ])
  ).toEqual([
    { kind: 'send', repeats: 0 },
    { kind: 'hold' },
    { kind: 'hold' },
    { kind: 'send', repeats: 0 },
    { kind: 'send', repeats: 2 },
  ]);
});

it('часовой потолок: дальше одно «слишком много» и тишина до конца часа', () => {
  const flood = Array.from(
    { length: HOURLY_CAP + 3 },
    (_, index) => [`f${index}`, index] as const
  );
  const verdicts = run(flood);
  expect(verdicts.filter((_) => _.kind === 'send')).toHaveLength(HOURLY_CAP);
  expect(verdicts[HOURLY_CAP]).toEqual({ kind: 'flood' });
  expect(verdicts.slice(HOURLY_CAP + 1)).toEqual([
    { kind: 'hold' },
    { kind: 'hold' },
  ]);
  expect(run([...flood, ['next-hour', 61 * _MIN]]).at(-1)).toEqual({
    kind: 'send',
    repeats: 0,
  });
});

it('отпечаток — источник и заголовок, если не задан свой', () => {
  expect(
    fingerprintOf({
      kind: 'site.error',
      severity: 'critical',
      title: 'boom',
      detail: '',
    })
  ).toBe('site.error:boom');
  expect(
    fingerprintOf({
      kind: 'site.error',
      severity: 'critical',
      title: '500 на /a',
      detail: '',
      key: 'site.error:TypeError',
    })
  ).toBe('site.error:TypeError');
});
