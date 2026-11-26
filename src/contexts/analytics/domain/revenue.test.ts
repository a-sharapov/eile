import { describe, expect, it } from 'bun:test';
import { priceAt, rateSteps } from './money.ts';
import type { MoneyEntry } from './person.ts';
import {
  definePricing,
  flowsOf,
  type LifeMember,
  lifeSpec,
  livedBounds,
  livedMonths,
  ltvCacOf,
  ltvOf,
  PAYBACK_MONTHS,
  paybackOf,
  perHead,
  worthOf,
} from './revenue.ts';

// Курсы плана тестов этапа 3: PLN к EUR с июня, сентября и октября; пояс Europe/Berlin.
const STEPS = rateSteps(
  [
    { base: 'EUR', currency: 'PLN', day: '2026-06-01', rate: '0.2300' },
    { base: 'EUR', currency: 'PLN', day: '2026-09-01', rate: '0.2400' },
    { base: 'EUR', currency: 'PLN', day: '2026-10-01', rate: '0.2500' },
  ],
  'EUR',
  'Europe/Berlin'
);
const NOW = '2026-11-15T12:00:00.000Z';

const member = (start: string, money: readonly MoneyEntry[]): LifeMember => ({
  start,
  worth: worthOf(money, definePricing(STEPS)),
});

describe('перевод с памятью', () => {
  it('даёт то же, что priceAt: база к себе, курс прошлого месяца, без курса, сумма с минусом', () => {
    const pricing = definePricing(STEPS);
    for (const [currency, amount, moment] of [
      ['EUR', 1900, '2026-06-12T10:00:00.000Z'],
      ['PLN', 10_000, '2026-06-21T09:00:00.000Z'],
      ['PLN', 20_000, '2026-08-06T12:00:00.000Z'],
      ['PLN', -10_000, '2026-06-21T09:00:00.000Z'],
      ['PLN', 1999, '2026-09-30T22:00:00.000Z'],
      ['CHF', 2000, '2026-10-05T10:00:00.000Z'],
      ['PLN', 100, '2026-05-31T21:59:59.999Z'],
    ] as const) {
      expect(pricing.price(currency, amount, moment)).toEqual(
        priceAt(STEPS, currency, amount, moment)
      );
    }
    // Повтор той же суммы тем же шагом — то же значение, а не новый расчёт.
    expect(pricing.price('PLN', 20_000, '2026-08-20T00:00:00.000Z')).toEqual({
      currency: 'PLN',
      amount: 20_000,
      value: 4_600n,
      stale: true,
    });
  });

  it('после комиссии — комиссии с минусом моментом своей оплаты и в своей валюте; до — только деньги', () => {
    const person = {
      money: [['2026-06-12T10:00:00.000Z', 'PLN', 10_000]] as const,
      feeMoney: [['2026-06-12T10:00:00.000Z', 'EUR', 80]] as const,
    };
    expect(flowsOf(person, 'gross')).toEqual(person.money);
    expect(flowsOf(person, 'net')).toEqual([
      ['2026-06-12T10:00:00.000Z', 'PLN', 10_000],
      ['2026-06-12T10:00:00.000Z', 'EUR', -80],
    ]);
  });

  it('на одного — половина от нуля; LTV / CAC до сотых; CAC ноль — null', () => {
    expect(perHead(19_770, 4)).toBe(4_943);
    expect(perHead(25_700, 8)).toBe(3_213);
    expect(perHead(-5, 2)).toBe(-3);
    expect(perHead(100, 0)).toBeNull();
    expect(ltvCacOf(5_000, 4_900)).toBe(1.02);
    expect(ltvCacOf(7_150, 4_600)).toBe(1.55);
    expect(ltvCacOf(4_943, 4_900)).toBe(1.01);
    expect(ltvCacOf(5_000, 0)).toBeNull();
    expect(ltvCacOf(null, 4_900)).toBeNull();
    expect(ltvCacOf(5_000, null)).toBeNull();
  });
});

describe('LTV', () => {
  const life3 = lifeSpec(3, NOW);

  it('граница срока одна: прожил — начало не позже сейчас − N; у «всё время» прожили все', () => {
    expect(life3.lived).toBe('2026-08-15T12:00:00.000Z');
    expect(lifeSpec(0, NOW).lived).toBe(NOW);
    expect(lifeSpec(6, '2027-02-15T12:00:00.000Z').lived).toBe(
      '2026-08-15T12:00:00.000Z'
    );
  });

  it('выручка в окне на проживших; не прожившие — «ещё живут срок»; возврат — своей датой и только в окне', () => {
    const customers = [
      // M1: три оплаты по 19 EUR, окно [06-12, 09-12) — все три.
      member('2026-06-12T10:00:00.000Z', [
        ['2026-06-12T10:00:00.000Z', 'EUR', 1900],
        ['2026-07-12T10:00:00.000Z', 'EUR', 1900],
        ['2026-08-12T10:00:00.000Z', 'EUR', 1900],
      ]),
      // M2: 100 PLN по июньскому курсу и полный возврат в сентябре — в окне [06-21, 09-21).
      member('2026-06-21T09:00:00.000Z', [
        ['2026-06-21T09:00:00.000Z', 'PLN', 10_000],
        [
          '2026-09-05T09:00:00.000Z',
          'PLN',
          -10_000,
          '2026-06-21T09:00:00.000Z',
        ],
      ]),
      // Ещё живёт срок: в знаменатель не входит.
      member('2026-09-11T10:00:00.000Z', [
        ['2026-09-11T10:00:00.000Z', 'EUR', 1900],
      ]),
    ];
    expect(ltvOf(customers, life3, 10)).toEqual({
      value: 2_850,
      revenue: { value: 5_700, unpriced: {}, staleRate: false },
      base: 2,
      open: 1,
      low: true,
    });
    // Возврат после окна LTV не меняет: окно в 3 месяца — [06-21, 09-21), возврат — 10-05; за всё время — гасит.
    const late = [
      member('2026-06-21T09:00:00.000Z', [
        ['2026-06-21T09:00:00.000Z', 'PLN', 10_000],
        [
          '2026-10-05T09:00:00.000Z',
          'PLN',
          -10_000,
          '2026-06-21T09:00:00.000Z',
        ],
      ]),
    ];
    expect(ltvOf(late, life3, 10).value).toBe(2_300);
    expect(ltvOf(late, lifeSpec(0, NOW), 10).value).toBe(0);
  });

  it('никто не прожил — LTV нет; люди без оплат — в знаменателе; мало данных — по прожившим', () => {
    expect(
      ltvOf([member('2026-10-20T10:00:00.000Z', [])], life3, 30)
    ).toMatchObject({ value: null, base: 0, open: 1 });
    const people = [
      member('2026-06-05T10:00:00.000Z', []),
      member('2026-06-10T10:00:00.000Z', [
        ['2026-06-12T10:00:00.000Z', 'EUR', 1900],
      ]),
    ];
    expect(ltvOf(people, life3, 30)).toMatchObject({
      value: 950,
      base: 2,
      open: 0,
      low: true,
    });
    const many = Array.from({ length: 30 }, () =>
      member('2026-06-05T10:00:00.000Z', [])
    );
    expect(ltvOf(many.slice(0, 29), life3, 30).low).toBe(true);
    expect(ltvOf(many, life3, 30).low).toBe(false);
  });

  it('сумма без курса — в unpriced, в значение не входит', () => {
    expect(
      ltvOf(
        [
          member('2026-06-05T10:00:00.000Z', [
            ['2026-06-06T10:00:00.000Z', 'CHF', 2000],
          ]),
        ],
        life3,
        10
      )
    ).toMatchObject({
      value: 0,
      revenue: { value: 0, unpriced: { CHF: 2000 } },
    });
  });
});

describe('окупаемость', () => {
  const bounds = livedBounds(NOW, PAYBACK_MONTHS);

  it('прожитые месяцы: граница — сейчас минус m месяцев', () => {
    expect(bounds).toHaveLength(25);
    expect(bounds[1]).toBe('2026-10-15T12:00:00.000Z');
    expect(livedMonths('2026-06-12T10:00:00.000Z', bounds)).toBe(5);
    expect(livedMonths('2026-10-05T10:00:00.000Z', bounds)).toBe(1);
    expect(livedMonths('2026-11-03T10:00:00.000Z', bounds)).toBe(0);
    expect(livedMonths('2020-01-01T00:00:00.000Z', bounds)).toBe(24);
    expect(livedMonths('2026-11-16T00:00:00.000Z', bounds)).toBe(0);
  });

  // Строка `ig` плана тестов: накопленное на клиента 15.25, 33.00, 28.50, 28.50, 57.00 против CAC 38.00.
  const ig = [
    member('2026-06-12T10:00:00.000Z', [
      ['2026-06-12T10:00:00.000Z', 'EUR', 1900],
      ['2026-07-12T10:00:00.000Z', 'EUR', 1900],
      ['2026-08-12T10:00:00.000Z', 'EUR', 1900],
    ]),
    member('2026-06-21T09:00:00.000Z', [
      ['2026-06-21T09:00:00.000Z', 'PLN', 10_000],
      ['2026-09-05T09:00:00.000Z', 'PLN', -10_000, '2026-06-21T09:00:00.000Z'],
    ]),
    member('2026-09-11T10:00:00.000Z', [
      ['2026-09-11T10:00:00.000Z', 'EUR', 1900],
      ['2026-10-11T10:00:00.000Z', 'EUR', 1900],
      ['2026-11-11T10:00:00.000Z', 'EUR', 1900],
    ]),
    member('2026-10-05T10:00:00.000Z', [
      ['2026-10-05T10:00:00.000Z', 'CHF', 2000],
    ]),
  ];

  it('первый месяц, когда накопленное на прожившего не меньше CAC; lived — у самого старого', () => {
    expect(paybackOf(ig, 3_800, bounds)).toEqual({ months: 5, lived: 5 });
    expect(paybackOf(ig, 1_525, bounds)).toEqual({ months: 1, lived: 5 });
    expect(paybackOf(ig, 1_526, bounds)).toEqual({ months: 2, lived: 5 });
  });

  it('не окупился — months null; CAC ноль — сразу; CAC нет — окупаемости нет', () => {
    expect(paybackOf(ig, 10_000, bounds)).toEqual({ months: null, lived: 5 });
    expect(paybackOf(ig, 0, bounds)).toEqual({ months: 0, lived: 5 });
    expect(paybackOf(ig, null, bounds)).toBeNull();
    expect(paybackOf([], 100, bounds)).toEqual({ months: null, lived: 0 });
  });
});
