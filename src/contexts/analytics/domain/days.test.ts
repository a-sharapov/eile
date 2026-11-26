import { describe, expect, it } from 'bun:test';
import {
  addDays,
  addMonths,
  dayBounds,
  dayIn,
  dayIndex,
  dayStart,
  daysBetween,
  isDay,
  isMonth,
  lifeMonth,
  monthDays,
  monthOf,
  monthPeriod,
  monthStarts,
  monthsBetween,
  monthsIn,
  periodDays,
  previousPeriod,
  shiftMonths,
  yearBefore,
} from './days.ts';

const BERLIN = 'Europe/Berlin';

const hours = (from: string, to: string): number =>
  (Date.parse(to) - Date.parse(from)) / 3_600_000;

describe('сутки отчётов', () => {
  it('начало дня в Europe/Berlin: летнее и зимнее время', () => {
    expect(dayStart('2026-10-01', BERLIN)).toBe('2026-09-30T22:00:00.000Z');
    expect(dayStart('2026-11-01', BERLIN)).toBe('2026-10-31T23:00:00.000Z');
    expect(dayStart('2026-01-15', BERLIN)).toBe('2026-01-14T23:00:00.000Z');
  });

  it('29 марта 2026 в Берлине длится 23 часа, 25 октября — 25', () => {
    expect(dayStart('2026-03-29', BERLIN)).toBe('2026-03-28T23:00:00.000Z');
    expect(dayStart('2026-03-30', BERLIN)).toBe('2026-03-29T22:00:00.000Z');
    expect(
      hours(dayStart('2026-03-29', BERLIN), dayStart('2026-03-30', BERLIN))
    ).toBe(23);
    expect(dayStart('2026-10-25', BERLIN)).toBe('2026-10-24T22:00:00.000Z');
    expect(dayStart('2026-10-26', BERLIN)).toBe('2026-10-25T23:00:00.000Z');
    expect(
      hours(dayStart('2026-10-25', BERLIN), dayStart('2026-10-26', BERLIN))
    ).toBe(25);
  });

  it('ряд по дням через переход времени: границы те же, что у начала каждого дня', () => {
    const bounds = dayBounds({ from: '2026-10-23', to: '2026-10-27' }, BERLIN);
    expect(bounds).toEqual(
      [
        '2026-10-23',
        '2026-10-24',
        '2026-10-25',
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
      ].map((_) => dayStart(_, BERLIN))
    );
    expect(dayBounds({ from: '2026-03-28', to: '2026-03-30' }, BERLIN)).toEqual(
      ['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'].map((_) =>
        dayStart(_, BERLIN)
      )
    );
    // 00:30 по Берлину 25 октября — ещё летнее время, 23:30 — уже зимнее: оба в одном дне.
    expect(dayIndex(bounds, '2026-10-24T22:30:00.000Z')).toBe(2);
    expect(dayIndex(bounds, '2026-10-25T22:30:00.000Z')).toBe(2);
    expect(dayIndex(bounds, '2026-10-25T23:00:00.000Z')).toBe(3);
    expect(dayIndex(bounds, '2026-10-22T21:59:59.999Z')).toBe(-1);
    expect(dayIndex(bounds, '2026-10-22T22:00:00.000Z')).toBe(0);
    expect(dayIndex(bounds, '2026-10-27T22:59:59.999Z')).toBe(4);
    expect(dayIndex(bounds, '2026-10-27T23:00:00.000Z')).toBe(-1);
  });

  it('год по дням: момент попадает в свой день пояса', () => {
    const bounds = dayBounds({ from: '2026-01-01', to: '2026-12-31' }, BERLIN);
    expect(bounds).toHaveLength(366);
    for (const moment of [
      '2026-03-29T00:30:00.000Z',
      '2026-06-30T22:00:00.000Z',
      '2026-10-31T23:30:00.000Z',
      '2026-12-31T22:59:59.000Z',
    ]) {
      expect(addDays('2026-01-01', dayIndex(bounds, moment)), moment).toBe(
        dayIn(moment, BERLIN)
      );
    }
  });

  it('пустой пояс — пояс сервера', () => {
    expect(dayStart('2026-10-25', '')).toBe(
      new Date(2026, 9, 25).toISOString()
    );
    expect(dayStart('2026-03-29', '')).toBe(
      new Date(2026, 2, 29).toISOString()
    );
    expect(dayStart('2026-10-25', 'UTC')).toBe('2026-10-25T00:00:00.000Z');
    expect(dayIn('2026-10-31T23:30:00.000Z', BERLIN)).toBe('2026-11-01');
    expect(dayIn('2026-10-31T23:30:00.000Z', 'UTC')).toBe('2026-10-31');
  });

  it('дни: проверка, сдвиг и число дней', () => {
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2026-10-1')).toBe(false);
    expect(isDay(20261001)).toBe(false);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(31);
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1);
  });
});

describe('месяцы', () => {
  it('shiftMonths: то же число и время по UTC, нет такого числа — последний день месяца', () => {
    expect(shiftMonths('2026-01-31T10:00:00Z', 1)).toBe(
      '2026-02-28T10:00:00.000Z'
    );
    expect(shiftMonths('2028-01-31T10:00:00Z', 1)).toBe(
      '2028-02-29T10:00:00.000Z'
    );
    expect(shiftMonths('2028-02-29T23:59:59.999Z', -12)).toBe(
      '2027-02-28T23:59:59.999Z'
    );
    expect(shiftMonths('2026-11-15T12:00:00.000Z', -3)).toBe(
      '2026-08-15T12:00:00.000Z'
    );
    // Вперёд и назад через год.
    expect(shiftMonths('2026-11-30T08:00:00.000Z', 3)).toBe(
      '2027-02-28T08:00:00.000Z'
    );
    expect(shiftMonths('2027-02-15T12:00:00.000Z', -6)).toBe(
      '2026-08-15T12:00:00.000Z'
    );
    expect(shiftMonths('2026-01-10T00:00:00.000Z', -13)).toBe(
      '2024-12-10T00:00:00.000Z'
    );
    expect(shiftMonths('2026-05-31T22:00:00.000Z', 0)).toBe(
      '2026-05-31T22:00:00.000Z'
    );
  });

  it('месяц: проверка, сдвиг, число дней, первый и последний день', () => {
    expect(isMonth('2026-10')).toBe(true);
    for (const raw of ['2026-13', '2026-00', '2026-1', '2026-10-01', 202610]) {
      expect([raw, isMonth(raw)]).toEqual([raw, false]);
    }
    expect(monthOf('2026-10-31')).toBe('2026-10');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 14)).toBe('2028-01');
    expect(monthsBetween('2026-06', '2026-11')).toBe(6);
    expect(monthsBetween('2026-11', '2026-06')).toBe(0);
    expect(monthDays('2026-02')).toBe(28);
    expect(monthDays('2028-02')).toBe(29);
    expect(monthDays('2026-10')).toBe(31);
    expect(monthPeriod('2026-02')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('месяцы периода и дни периода в каждом из них', () => {
    const period = { from: '2026-10-15', to: '2026-11-14' };
    expect(monthsIn(period)).toEqual(['2026-10', '2026-11']);
    expect(periodDays(period, '2026-10')).toBe(17);
    expect(periodDays(period, '2026-11')).toBe(14);
    expect(periodDays(period, '2026-09')).toBe(0);
    expect(
      periodDays({ from: '2026-10-31', to: '2026-10-31' }, '2026-10')
    ).toBe(1);
    expect(monthsIn({ from: '2025-12-20', to: '2026-02-03' })).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('прошлый период той же длины встык и те же дни годом раньше', () => {
    expect(previousPeriod({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
      from: '2026-08-31',
      to: '2026-09-30',
    });
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-01' })).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
    expect(yearBefore({ from: '2028-02-01', to: '2028-02-29' })).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    });
    expect(yearBefore({ from: '2026-06-01', to: '2026-10-31' })).toEqual({
      from: '2025-06-01',
      to: '2025-10-31',
    });
  });
});

describe('месяцы жизни', () => {
  it('месяц жизни момента: тот же час через k месяцев — уже месяц k; конец месяца — последний день', () => {
    const start = '2026-06-12T10:00:00.000Z';
    expect(lifeMonth(start, start)).toBe(0);
    expect(lifeMonth(start, '2026-07-12T09:59:59.999Z')).toBe(0);
    expect(lifeMonth(start, '2026-07-12T10:00:00.000Z')).toBe(1);
    expect(lifeMonth(start, '2027-06-12T10:00:00.000Z')).toBe(12);
    expect(lifeMonth(start, '2026-06-01T00:00:00.000Z')).toBe(-1);
    // 31 января + 1 месяц = 28 февраля 10:00: 28 февраля 09:00 — ещё месяц 0, 1 марта — месяц 1.
    const january = '2026-01-31T10:00:00.000Z';
    expect(lifeMonth(january, '2026-02-28T09:00:00.000Z')).toBe(0);
    expect(lifeMonth(january, '2026-02-28T10:00:00.000Z')).toBe(1);
    expect(lifeMonth(january, '2026-03-01T00:00:00.000Z')).toBe(1);
    expect(lifeMonth(january, '2026-03-31T10:00:00.000Z')).toBe(2);
    // Совпадает с границами shiftMonths на каждом месяце года: и у конца месяца, и у числа до 28-го (строками).
    const before = (moment: string) =>
      new Date(Date.parse(moment) - 1).toISOString();
    for (const from of [january, start, '2026-02-28T23:59:59.999Z']) {
      for (let k = 1; k <= 12; k++) {
        expect([from, k, lifeMonth(from, shiftMonths(from, k))]).toEqual([
          from,
          k,
          k,
        ]);
        expect(lifeMonth(from, before(shiftMonths(from, k)))).toBe(k - 1);
      }
    }
  });

  it('начала месяцев в поясе — по разу на месяц', () => {
    expect(
      Object.fromEntries(monthStarts(['2026-10', '2026-11', '2026-10'], BERLIN))
    ).toEqual({
      '2026-10': '2026-09-30T22:00:00.000Z',
      '2026-11': '2026-10-31T23:00:00.000Z',
    });
  });
});
