import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import { inputErrorsOf, type PersonMoney } from './money.ts';
import {
  monthBounds,
  parseStatement,
  type Statement,
  signedMoney,
  siteRevenue,
  statementChanged,
  statementLog,
  statementView,
} from './statements.ts';

const LAST = '2026-10';

const errors = (raw: unknown): Readonly<Record<string, string>> =>
  attempt(
    () => (parseStatement(raw, LAST), {}),
    (error) =>
      isDomainError(error) && error.code === 'analytics.invalid_statement'
        ? inputErrorsOf(error)
        : { thrown: String(error) }
  );

const STATEMENT: Statement = {
  month: '2026-10',
  currency: 'EUR',
  amount: 125_000,
  fees: 'gross',
  note: 'выписка банка',
  author: { name: 'Анна', agent: false },
  updatedAt: '2026-11-03T10:00:00.000Z',
};

describe('выписка из ввода', () => {
  it('месяц, валюта, сумма со знаком; до комиссии по умолчанию, заметка обрезана', () => {
    expect(
      parseStatement(
        {
          month: '2026-10',
          currency: 'EUR',
          amount: '1250.00',
          note: '  банк ',
        },
        LAST
      )
    ).toEqual({
      month: '2026-10',
      currency: 'EUR',
      amount: 125_000,
      fees: 'gross',
      note: 'банк',
    });
    // Месяц, где возвратов больше оплат: сумма со знаком; число JSON — его десятичная запись.
    expect(
      parseStatement(
        { month: '2026-09', currency: 'PLN', amount: -12.5, fees: 'net' },
        LAST
      )
    ).toMatchObject({ amount: -1250, fees: 'net' });
    expect(signedMoney('-0', 'EUR')).toBe(0);
    expect(Object.is(signedMoney('-0', 'EUR'), 0)).toBe(true);
    expect(signedMoney('100', 'JPY')).toBe(100);
    expect(signedMoney('1.5', 'JPY')).toBeNull();
    expect(signedMoney('--1', 'EUR')).toBeNull();
  });

  it('идущий месяц и раньше 2000-01 — отказ; ошибки всех полей сразу', () => {
    expect(
      errors({ month: '2026-11', currency: 'EUR', amount: '1' }).month
    ).toContain('the current month is not over');
    expect(
      errors({ month: '1999-12', currency: 'EUR', amount: '1' }).month
    ).toContain('2000-01');
    expect(
      Object.keys(
        errors({
          month: '2026-1',
          currency: 'eur',
          amount: '1',
          fees: 'after',
          note: 'x'.repeat(501),
          bank: 'Sparkasse',
        })
      ).toSorted()
    ).toEqual(['bank', 'currency', 'fees', 'month', 'note']);
    expect(
      errors({ month: '2026-10', currency: 'EUR', amount: '1.001' }).amount
    ).toContain('digits after the point');
    expect(errors('2026-10')).toEqual({
      '': 'a statement is { month, currency, amount, fees, note }',
    });
  });

  it('изменилась — сумма, комиссия или заметка; журнал — ключ месяц/валюта, без автора', () => {
    expect(
      statementChanged(STATEMENT, {
        month: '2026-10',
        currency: 'EUR',
        amount: 125_000,
        fees: 'gross',
        note: 'выписка банка',
      })
    ).toBe(false);
    expect(
      statementChanged(STATEMENT, {
        month: '2026-10',
        currency: 'EUR',
        amount: 125_000,
        fees: 'net',
        note: 'выписка банка',
      })
    ).toBe(true);
    expect(
      statementLog(
        'created',
        null,
        STATEMENT,
        { id: 1, name: 'Анна', agent: false },
        '2026-11-03T10:00:00.000Z'
      )
    ).toEqual({
      at: '2026-11-03T10:00:00.000Z',
      author: { id: 1, name: 'Анна', agent: false },
      item: 'statement',
      key: '2026-10/EUR',
      action: 'created',
      before: null,
      after: {
        month: '2026-10',
        currency: 'EUR',
        amount: 125_000,
        fees: 'gross',
        note: 'выписка банка',
        updatedAt: '2026-11-03T10:00:00.000Z',
      },
    });
  });
});

describe('выручка сайта за месяц', () => {
  // Оплаты и возвраты — по своему моменту; комиссия — моментом своей оплаты, в своей валюте.
  const LEDGER: PersonMoney[] = [
    {
      money: [
        ['2026-09-30T21:30:00.000Z', 'EUR', 50_000],
        ['2026-10-10T10:00:00.000Z', 'EUR', 50_000],
        ['2026-10-31T22:30:00.000Z', 'EUR', 30_000],
      ],
      fees: [['2026-10-10T10:00:00.000Z', 'EUR', 1_500]],
    },
    {
      money: [
        ['2026-10-02T10:00:00.000Z', 'EUR', 26_000],
        ['2026-10-20T10:00:00.000Z', 'EUR', -2_000, '2026-10-02T10:00:00.000Z'],
        ['2026-10-05T10:00:00.000Z', 'PLN', 38_000],
      ],
      fees: [['2026-10-05T10:00:00.000Z', 'PLN', 1_000]],
    },
  ];

  it('месяц — в поясе отчётов: 30 сентября 23:30 по Берлину — сентябрь, 31 октября 23:30 — октябрь', () => {
    const october = monthBounds('2026-10', 'Europe/Berlin');
    expect(october).toEqual({
      from: '2026-09-30T22:00:00.000Z',
      to: '2026-10-31T23:00:00.000Z',
    });
    // 500 + 260 − 20 + 300: возврат — в своём месяце; 30 сентября 21:30 UTC — ещё сентябрь Берлина.
    expect(siteRevenue(LEDGER, october, 'EUR', 'gross')).toBe(104_000);
    expect(siteRevenue(LEDGER, october, 'EUR', 'net')).toBe(102_500);
    expect(siteRevenue(LEDGER, october, 'PLN', 'net')).toBe(37_000);
    expect(siteRevenue(LEDGER, october, 'CHF', 'gross')).toBe(0);
    expect(
      siteRevenue(
        LEDGER,
        monthBounds('2026-09', 'Europe/Berlin'),
        'EUR',
        'gross'
      )
    ).toBe(50_000);
  });

  it('вид выписки: разница со знаком и доля от выписки до десятых; у нулевой выписки доли нет', () => {
    expect(statementView(STATEMENT, 123_800)).toMatchObject({
      site: 123_800,
      difference: -1_200,
      share: 1,
    });
    expect(statementView({ ...STATEMENT, amount: 0 }, 500).share).toBeNull();
    expect(statementView({ ...STATEMENT, amount: -1_000 }, -1_100).share).toBe(
      10
    );
  });
});
