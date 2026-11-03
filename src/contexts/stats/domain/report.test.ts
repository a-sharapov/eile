import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import {
  dailyOf,
  goalsOf,
  limitOf,
  periodOf,
  previousOf,
  topOf,
} from './report.ts';

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('период отчёта', () => {
  it('последние N дней до сегодня, по умолчанию 30', () => {
    expect(periodOf({}, '2026-11-03')).toEqual({
      from: '2026-10-05',
      to: '2026-11-03',
    });
    expect(periodOf({ days: '7' }, '2026-11-03')).toEqual({
      from: '2026-10-28',
      to: '2026-11-03',
    });
  });

  it('свои даты; конец после сегодня — сегодня', () => {
    expect(
      periodOf({ from: '2026-10-01', to: '2026-12-01' }, '2026-11-03')
    ).toEqual({ from: '2026-10-01', to: '2026-11-03' });
  });

  it('неверный период — отказ stats.invalid_period', () => {
    for (const query of [
      { days: '0' },
      { days: '400' },
      { days: 'много' },
      { from: '2026-11-02', to: '2026-11-01' },
      { from: '2025-01-01', to: '2026-11-01' },
      { from: '1.11.2026' },
    ]) {
      expect(code(() => periodOf(query, '2026-11-03'))).toBe(
        'stats.invalid_period'
      );
    }
  });

  it('прошлый период — той же длины, сразу перед', () => {
    expect(previousOf({ from: '2026-10-28', to: '2026-11-03' })).toEqual({
      from: '2026-10-21',
      to: '2026-10-27',
    });
  });

  it('строк в разрезе — 20 по умолчанию, от 1 до 100', () => {
    expect(limitOf(undefined)).toBe(20);
    expect(limitOf('5')).toBe(5);
    expect(limitOf('500')).toBe(20);
  });
});

describe('сборка отчёта', () => {
  it('дни без данных — нулями', () => {
    expect(
      dailyOf({ from: '2026-11-01', to: '2026-11-03' }, [
        { day: '2026-11-02', visitors: 3, views: 5 },
      ])
    ).toEqual([
      { day: '2026-11-01', visitors: 0, views: 0 },
      { day: '2026-11-02', visitors: 3, views: 5 },
      { day: '2026-11-03', visitors: 0, views: 0 },
    ]);
  });

  it('разрез — по посетителям или просмотрам, с пределом', () => {
    const rows = [
      { value: '/a', visitors: 0, views: 3 },
      { value: '/b', visitors: 0, views: 9 },
      { value: '/c', visitors: 0, views: 1 },
    ];
    expect(topOf(rows, 'views', 2).map((_) => _.value)).toEqual(['/b', '/a']);
  });

  it('цель: доля от всех, от источника и от страницы входа', () => {
    const goals = goalsOf(
      [
        {
          goal: 'link:https://app.example.com/new',
          dimension: 'total',
          value: '',
          visitors: 4,
          events: 6,
        },
        {
          goal: 'link:https://app.example.com/new',
          dimension: 'source',
          value: 'google.com',
          visitors: 3,
          events: 5,
        },
        {
          goal: 'link:https://app.example.com/new',
          dimension: 'entry',
          value: '/',
          visitors: 4,
          events: 6,
        },
        {
          goal: 'form:bestellung',
          dimension: 'total',
          value: '',
          visitors: 1,
          events: 1,
        },
      ],
      40,
      {
        source: new Map([['google.com', 10]]),
        entry: new Map([['/', 20]]),
      },
      (goal) => (goal === 'form:bestellung' ? 'Bestellung' : goal.slice(5)),
      20
    );
    expect(goals.map((_) => _.goal)).toEqual([
      'link:https://app.example.com/new',
      'form:bestellung',
    ]);
    expect(goals[0]).toMatchObject({
      kind: 'link',
      name: 'https://app.example.com/new',
      visitors: 4,
      events: 6,
      rate: 0.1,
      sources: [{ value: 'google.com', visitors: 3, base: 10, rate: 0.3 }],
      entries: [{ value: '/', visitors: 4, base: 20, rate: 0.2 }],
    });
    expect(goals[1]).toMatchObject({
      kind: 'form',
      name: 'bestellung',
      label: 'Bestellung',
      rate: 0.025,
    });
  });
});
