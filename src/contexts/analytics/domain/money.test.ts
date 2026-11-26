import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import {
  baseSum,
  divideRound,
  inputErrorsOf,
  isCurrency,
  isMoney,
  MINOR_UNITS,
  moneyOf,
  parseRate,
  priceAt,
  rateAt,
  rateSteps,
  rateValue,
  sameRate,
  toBase,
} from './money.ts';
import { cleanText } from './text.ts';

describe('деньги', () => {
  it('в минимальных единицах валюты: знаков после точки — по ISO 4217', () => {
    expect(MINOR_UNITS).toMatchObject({ EUR: 2, JPY: 0, KWD: 3, CLF: 4 });
    expect(moneyOf('109.00', 'EUR')).toBe(10_900);
    expect(moneyOf('109.5', 'EUR')).toBe(10_950);
    expect(moneyOf(109.5, 'EUR')).toBe(10_950);
    expect(moneyOf('109', 'EUR')).toBe(10_900);
    expect(moneyOf('1500', 'JPY')).toBe(1500);
    expect(moneyOf('12.125', 'KWD')).toBe(12_125);
    expect(moneyOf('1500.0', 'JPY')).toBeNull();
    expect(moneyOf('109.001', 'EUR')).toBeNull();
  });

  it('только запись десятичного числа: без знака, запятой, экспоненты и неточной дроби', () => {
    expect(moneyOf('-1', 'EUR')).toBeNull();
    expect(moneyOf('+1', 'EUR')).toBeNull();
    expect(moneyOf('1,50', 'EUR')).toBeNull();
    expect(moneyOf(' 1.50', 'EUR')).toBeNull();
    expect(moneyOf(1e21, 'EUR')).toBeNull();
    expect(moneyOf(0.1 + 0.2, 'EUR')).toBeNull();
    expect(moneyOf('999999999999999', 'EUR')).toBeNull();
    expect(moneyOf(true, 'EUR')).toBeNull();
  });

  it('сумма — больше нуля, комиссия — от нуля; без валюты — до четырёх знаков', () => {
    expect(isMoney('0.00', 'EUR', true)).toBe(false);
    expect(isMoney('0.00', 'EUR', false)).toBe(true);
    expect(isMoney('0.3456', null, false)).toBe(true);
    expect(isMoney('0.34567', null, false)).toBe(false);
  });

  it('валюта — действующий код ISO 4217 заглавными', () => {
    expect(isCurrency('EUR')).toBe(true);
    expect(isCurrency('eur')).toBe(false);
    expect(isCurrency('XAU')).toBe(false);
    expect(isCurrency('ABC')).toBe(false);
    expect(isCurrency('constructor')).toBe(false);
  });
});

describe('чужой текст', () => {
  it('без управляющих знаков, пробелы схлопнуты, длина обрезана', () => {
    expect(cleanText('  Reels\u0000 в\tInstagram\n\n ', 500)).toBe(
      'Reels в Instagram'
    );
    expect(cleanText('a​b‮c', 500)).toBe('abc');
    expect(cleanText('ёжик в тумане', 4)).toBe('ёжик');
    expect(cleanText('😀😀😀', 2)).toBe('😀😀');
  });
});

const BERLIN = 'Europe/Berlin';

const failure = (run: () => unknown) =>
  attempt(
    () => (run(), null),
    (error) =>
      isDomainError(error)
        ? { code: error.code, errors: inputErrorsOf(error) }
        : String(error)
  );

const rate = (currency: string, day: string, value: string, base = 'EUR') => ({
  base,
  currency,
  day,
  rate: value,
});

// Курсы PLN плана тестов этапа 3: июнь, сентябрь, октябрь; июля и августа нет.
const PLN = rateSteps(
  [
    rate('PLN', '2026-06-01', '0.2300'),
    rate('PLN', '2026-09-01', '0.2400'),
    rate('PLN', '2026-10-01', '0.2500'),
    rate('USD', '2026-06-01', '0.9', 'GBP'),
  ],
  'EUR',
  BERLIN
);

describe('курс', () => {
  it('десятичная строка или число JSON больше нуля: до 9 знаков до точки и 10 после', () => {
    expect(rateValue('0.2310')).toBe(2_310_000_000n);
    expect(rateValue(0.231)).toBe(2_310_000_000n);
    expect(rateValue('4.329')).toBe(43_290_000_000n);
    expect(rateValue('0.0000222')).toBe(222_000n);
    expect(rateValue('999999999.9999999999')).toBe(9_999_999_999_999_999_999n);
    expect(rateValue('0.0000000001')).toBe(1n);
    for (const raw of [
      '0',
      '0.0000000000',
      '-0.23',
      '+0.23',
      '0,23',
      '.23',
      '1e-3',
      '1000000000',
      '0.00000000001',
      ' 0.23',
      1e-7,
      1e21,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0.1 + 0.2,
      null,
      true,
    ]) {
      expect([raw, rateValue(raw)]).toEqual([raw, null]);
    }
  });

  it('ввод курса: валюта не базовая, день до сегодня, ошибки по всем полям сразу', () => {
    expect(
      parseRate(
        { currency: 'PLN', day: '2026-06-01', rate: 0.23 },
        'EUR',
        '2026-11-15'
      )
    ).toEqual({ currency: 'PLN', day: '2026-06-01', rate: '0.23' });
    expect(
      failure(() =>
        parseRate(
          { currency: 'EUR', day: '2026-11-16', rate: '0', extra: 1 },
          'EUR',
          '2026-11-15'
        )
      )
    ).toEqual({
      code: 'analytics.invalid_rate',
      errors: {
        extra: expect.stringContaining('not a field'),
        currency: expect.stringContaining('base currency'),
        day: expect.stringContaining('to today, 2026-11-15'),
        rate: expect.stringContaining('above zero'),
      },
    });
    expect(
      failure(() =>
        parseRate(
          { currency: 'pln', day: '1999-12-31', rate: '1' },
          'EUR',
          '2026-11-15'
        )
      )
    ).toMatchObject({
      code: 'analytics.invalid_rate',
      errors: { currency: expect.any(String), day: expect.any(String) },
    });
    expect(failure(() => parseRate([], 'EUR', '2026-11-15'))).toMatchObject({
      code: 'analytics.invalid_rate',
    });
  });

  it('шаг курса — с начала дня записи в поясе отчётов, до следующей записи; курс назад не распространяется', () => {
    // 1 июня в Берлине начинается в 22:00 по UTC 31 мая.
    expect(rateAt(PLN, 'PLN', '2026-05-31T21:59:59.999Z')).toBeNull();
    expect(rateAt(PLN, 'PLN', '2026-05-31T22:00:00.000Z')?.rate).toBe('0.2300');
    expect(rateAt(PLN, 'PLN', '2026-08-31T21:59:59.999Z')?.rate).toBe('0.2300');
    expect(rateAt(PLN, 'PLN', '2026-08-31T22:00:00.000Z')?.rate).toBe('0.2400');
    expect(rateAt(PLN, 'PLN', '2027-01-10T10:00:00.000Z')?.rate).toBe('0.2500');
    expect(rateAt(PLN, 'CHF', '2026-10-05T10:00:00.000Z')).toBeNull();
    // Курсы к другой базе отчёт не берёт.
    expect(rateAt(PLN, 'USD', '2026-10-05T10:00:00.000Z')).toBeNull();
  });

  it('перевод — каждая сумма отдельно, до минимальной единицы базы, половина — от нуля', () => {
    const at = (value: string) => rateValue(value) as bigint;
    expect(toBase(10_000, 'PLN', 'EUR', at('0.2300'))).toBe(2_300n);
    expect(toBase(1_999, 'PLN', 'EUR', at('0.2310'))).toBe(462n);
    expect(toBase(-4_900, 'PLN', 'EUR', at('0.2310'))).toBe(-1_132n);
    expect(toBase(2_000, 'JPY', 'EUR', at('0.0061'))).toBe(1_220n);
    // Половина — от нуля у положительной и отрицательной суммы.
    expect(toBase(1, 'PLN', 'EUR', at('0.5'))).toBe(1n);
    expect(toBase(-1, 'PLN', 'EUR', at('0.5'))).toBe(-1n);
    expect(toBase(1, 'PLN', 'EUR', at('0.4999999999'))).toBe(0n);
    expect(toBase(-1, 'PLN', 'EUR', at('0.4999999999'))).toBe(0n);
    // KWD — три знака: 1.000 EUR по 0.3 → 300 филсов; 1.235 KWD по 3.25 → 4.01375 → 401 цент.
    expect(toBase(100, 'EUR', 'KWD', at('0.3'))).toBe(300n);
    expect(toBase(1_235, 'KWD', 'EUR', at('3.25'))).toBe(401n);
    // JPY в базе: 1.50 EUR по 162.5 → 243.75 → 244 иены.
    expect(toBase(150, 'EUR', 'JPY', at('162.5'))).toBe(244n);
  });

  it('большие суммы и длинные курсы — без потери точности, без NaN и Infinity', () => {
    const at = (value: string) => rateValue(value) as bigint;
    // 65 399.07 PLN по курсу из 9 знаков до точки и 10 после: в float вышло бы …362.
    expect(toBase(6_539_907, 'PLN', 'EUR', at('123456789.0123456789'))).toBe(
      807_395_918_659_363n
    );
    expect(
      baseSum([
        priceAt(
          rateSteps(
            [rate('PLN', '2026-01-01', '987654321.1234567891')],
            'EUR',
            BERLIN
          ),
          'PLN',
          5_613_708,
          '2026-01-15T10:00:00.000Z'
        ),
      ]).value
    ).toBe(5_544_402_963_725_318);
    expect(toBase(9_007_199, 'PLN', 'EUR', at('999999999.9999999999'))).toBe(
      9_007_199_000_000_000n
    );
    // Самая большая сумма в иенах по самому мелкому курсу.
    expect(
      toBase(Number.MAX_SAFE_INTEGER, 'JPY', 'EUR', at('0.0000000001'))
    ).toBe(90_071_993n);
    // Итог, который не помещается в целое JSON, в число не идёт: записи — по валютам, без NaN и Infinity.
    const huge = baseSum([
      {
        currency: 'PLN',
        amount: 9_007_199,
        value: 9_007_199_254_740_900n,
        stale: false,
      },
      { currency: 'EUR', amount: 100, value: 100n, stale: false },
    ]);
    expect(huge).toEqual({
      value: 0,
      unpriced: { PLN: 9_007_199, EUR: 100 },
      staleRate: false,
    });
    expect(Number.isSafeInteger(huge.value)).toBe(true);
  });

  it('примеры ADR: возврат, иены, без курса, курс прошлого месяца, база к себе', () => {
    const price = (currency: string, amount: number, moment: string) =>
      priceAt(PLN, currency, amount, moment);
    // 100.00 PLN 21 июня по июньскому 0.2300 — 23.00 EUR.
    expect(price('PLN', 10_000, '2026-06-21T09:00:00.000Z')).toEqual({
      currency: 'PLN',
      amount: 10_000,
      value: 2_300n,
      stale: false,
    });
    // Август — по июньскому курсу: «курс прошлого месяца».
    expect(price('PLN', 20_000, '2026-08-06T12:00:00.000Z')).toMatchObject({
      value: 4_600n,
      stale: true,
    });
    // Май — раньше первой записи: без курса.
    expect(price('PLN', 5_000, '2026-05-20T10:00:00.000Z').value).toBeNull();
    expect(price('EUR', 1_900, '2026-05-20T10:00:00.000Z')).toEqual({
      currency: 'EUR',
      amount: 1_900,
      value: 1_900n,
      stale: false,
    });
    expect(
      baseSum([
        price('EUR', 1_900, '2026-06-12T10:00:00.000Z'),
        price('PLN', 10_000, '2026-06-21T09:00:00.000Z'),
        price('PLN', -10_000, '2026-06-21T09:00:00.000Z'),
        price('PLN', 20_000, '2026-08-06T12:00:00.000Z'),
        price('CHF', 2_000, '2026-10-05T10:00:00.000Z'),
        price('CHF', 500, '2026-10-06T10:00:00.000Z'),
      ])
    ).toEqual({ value: 6_500, unpriced: { CHF: 2_500 }, staleRate: true });
    expect(baseSum([])).toEqual({ value: 0, unpriced: {}, staleRate: false });
  });

  it('курс тот же — по числу, а не по записи', () => {
    expect(sameRate('0.23', '0.2300')).toBe(true);
    expect(sameRate('0.23', '0.2301')).toBe(false);
    expect(divideRound(5n, 2n)).toBe(3n);
    expect(divideRound(-5n, 2n)).toBe(-3n);
    expect(divideRound(4n, 3n)).toBe(1n);
  });
});
