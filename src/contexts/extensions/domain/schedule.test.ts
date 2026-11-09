import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import { firstRun, parseEvery } from './schedule.ts';

const code = (raw: unknown): string | null =>
  attempt(
    () => (parseEvery(raw), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('период расписания плагина', () => {
  it('строкой с единицей или числом миллисекунд', () => {
    expect(parseEvery('12h')).toBe(12 * 3_600_000);
    expect(parseEvery('15m')).toBe(900_000);
    expect(parseEvery(' 30s ')).toBe(30_000);
    expect(parseEvery('1d')).toBe(86_400_000);
    expect(parseEvery('1.5h')).toBe(5_400_000);
    expect(parseEvery('2500ms')).toBe(2500);
    expect(parseEvery(60_000)).toBe(60_000);
  });

  it('чаще секунды, дольше 24 дней и не по форме — ошибка', () => {
    expect(code('500ms')).toBe('extensions.invalid_schedule');
    expect(code(999)).toBe('extensions.invalid_schedule');
    expect(code('25d')).toBe('extensions.invalid_schedule');
    expect(code('12 hours')).toBe('extensions.invalid_schedule');
    expect(code('')).toBe('extensions.invalid_schedule');
    expect(code(null)).toBe('extensions.invalid_schedule');
    expect(code(Number.NaN)).toBe('extensions.invalid_schedule');
  });

  it('первый запуск — вскоре после старта, но не позже периода', () => {
    expect(firstRun(12 * 3_600_000, 5000)).toBe(5000);
    expect(firstRun(2000, 5000)).toBe(2000);
  });
});
