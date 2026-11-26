import { describe, expect, it } from 'bun:test';
import {
  acceptedCounts,
  erasedSince,
  intakeRows,
  keptSince,
  sumIntake,
  utcDay,
} from './tally.ts';

const NOW = '2026-11-25T03:00:00.000Z';

describe('счёт приёма', () => {
  it('принятое: future — по предупреждению приёма, late — позже суток и только по сети', () => {
    expect(acceptedCounts('2026-11-25T02:00:00.000Z', NOW, 'http', [])).toEqual(
      ['accepted']
    );
    expect(
      acceptedCounts('2026-11-25T05:00:00.000Z', NOW, 'http', [
        'unknown_type',
        'future',
      ])
    ).toEqual(['accepted', 'future']);
    // Ровно сутки — ещё не опоздание; на миллисекунду больше — опоздание.
    expect(acceptedCounts('2026-11-24T03:00:00.000Z', NOW, 'http', [])).toEqual(
      ['accepted']
    );
    expect(acceptedCounts('2026-11-24T02:59:59.999Z', NOW, 'http', [])).toEqual(
      ['accepted', 'late']
    );
    // История из файла и должна быть старой.
    expect(acceptedCounts('2025-01-01T00:00:00.000Z', NOW, 'file', [])).toEqual(
      ['accepted']
    );
  });

  it('строки с одним ключом складываются, разные — остаются', () => {
    expect(
      sumIntake([
        ...intakeRows(['accepted', 'late'], '2026-11-25', 'bot', 'http'),
        ...intakeRows(['accepted'], '2026-11-25', 'bot', 'http'),
        ...intakeRows(['accepted'], '2026-11-25', 'bot', 'file'),
        ...intakeRows(['unauthorized'], '2026-11-25', '', 'http'),
        {
          day: '2026-11-25',
          sender: '',
          origin: 'http',
          outcome: 'unauthorized',
          count: 4,
        },
        ...intakeRows(['accepted'], '2026-11-24', 'bot', 'http'),
      ])
    ).toEqual([
      {
        day: '2026-11-25',
        sender: 'bot',
        origin: 'http',
        outcome: 'accepted',
        count: 2,
      },
      {
        day: '2026-11-25',
        sender: 'bot',
        origin: 'http',
        outcome: 'late',
        count: 1,
      },
      {
        day: '2026-11-25',
        sender: 'bot',
        origin: 'file',
        outcome: 'accepted',
        count: 1,
      },
      {
        day: '2026-11-25',
        sender: '',
        origin: 'http',
        outcome: 'unauthorized',
        count: 5,
      },
      {
        day: '2026-11-24',
        sender: 'bot',
        origin: 'http',
        outcome: 'accepted',
        count: 1,
      },
    ]);
    expect(sumIntake([])).toEqual([]);
  });

  it('сутки UTC — и у момента с поясом; окно стёртого — 40 суток, счёт приёма живёт 400', () => {
    expect(utcDay('2026-11-25T01:30:00+03:00')).toBe('2026-11-24');
    expect(utcDay(NOW)).toBe('2026-11-25');
    expect(erasedSince(NOW)).toBe('2026-10-16T00:00:00.000Z');
    expect(keptSince(NOW, 40)).toBe('2026-10-16');
    expect(keptSince(NOW, 400)).toBe('2025-10-21');
  });
});
