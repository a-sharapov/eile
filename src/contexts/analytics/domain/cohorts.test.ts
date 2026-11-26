import { describe, expect, it } from 'bun:test';
import {
  arrivalCohortsOf,
  type CohortMetric,
  type CohortMonth,
  paymentCohortsOf,
} from './cohorts.ts';
import { rateSteps } from './money.ts';
import type { ReportPerson } from './report.ts';
import { definePricing, type FeesMode, livedBounds } from './revenue.ts';
import { applySet, EMPTY_SETUP, readSet } from './setup.ts';

const SETUP = applySet(
  readSet({
    format: 'eile-analytics-set',
    version: 1,
    name: 'Когорты',
    senders: [{ code: 'bot', name: 'Бот' }],
    types: [
      { sender: 'bot', code: 'start', name: 'Старт', role: 'touch' },
      { sender: 'bot', code: 'trial', name: 'Пробный', role: 'trial' },
      { sender: 'bot', code: 'paid', name: 'Оплата', role: 'payment' },
      { sender: 'bot', code: 'task', name: 'Задание', role: 'action' },
    ],
    milestones: [
      {
        code: 'm1',
        name: 'Задание',
        sender: 'bot',
        type: 'task',
        days: 3,
      },
    ],
  })
)(EMPTY_SETUP).state;

const NOW = '2026-11-15T12:00:00.000Z';
// Пояс UTC: месяцы — от полуночи UTC.
const month = (code: string, next: string): CohortMonth => ({
  month: code,
  from: `${code}-01T00:00:00.000Z`,
  to: `${next}-01T00:00:00.000Z`,
});
const MONTHS = [
  month('2026-06', '2026-07'),
  month('2026-07', '2026-08'),
  month('2026-08', '2026-09'),
  month('2026-09', '2026-10'),
  month('2026-10', '2026-11'),
  month('2026-11', '2026-12'),
];

const PRICING = definePricing(
  rateSteps(
    [{ base: 'EUR', currency: 'PLN', day: '2026-06-01', rate: '0.2500' }],
    'EUR',
    'UTC'
  )
);

let n = 0;

const customer = (
  firstPaidAt: string,
  facts: Partial<ReportPerson> = {}
): ReportPerson => ({
  subject: `u_cohort_${String(++n).padStart(4, '0')}`,
  lastAt: firstPaidAt,
  senders: ['bot'],
  arrivedAt: firstPaidAt,
  firstTouch: null,
  firstTouchConflict: false,
  firstParts: {},
  returns: [],
  answers: {},
  trialAt: null,
  payments: 1,
  firstPaidAt,
  paidUntil: null,
  firstTermEnd: null,
  lapsedAt: null,
  returnedAt: null,
  money: [[firstPaidAt, 'EUR', 1000]],
  feeMoney: [],
  access: [],
  milestones: {},
  firsts: {},
  dims: {},
  traits: {},
  ...facts,
});

const spec = (metric: CohortMetric, fees: FeesMode = 'gross') => ({
  metric,
  fees,
  pricing: PRICING,
  now: NOW,
  bounds: livedBounds(NOW, 13),
});

describe('когорты по первой оплате', () => {
  // Июнь: двое (12-го и 21-го), второй прожил на месяц меньше; июль — один клиент в злотых; ноябрь — идёт.
  const june = customer('2026-06-12T10:00:00.000Z', {
    money: [
      ['2026-06-12T10:00:00.000Z', 'EUR', 1000],
      ['2026-07-12T10:00:00.000Z', 'EUR', 1000],
    ],
    feeMoney: [['2026-06-12T10:00:00.000Z', 'EUR', 100]],
    access: [['2026-06-12T10:00:00.000Z', '2026-08-12T10:00:00.000Z']],
  });
  const later = customer('2026-06-21T09:00:00.000Z', {
    money: [
      ['2026-06-21T09:00:00.000Z', 'EUR', 3000],
      ['2026-09-01T09:00:00.000Z', 'EUR', -3000],
    ],
    access: [['2026-06-21T09:00:00.000Z', '2026-07-21T09:00:00.000Z']],
  });
  const july = customer('2026-07-20T08:00:00.000Z', {
    money: [['2026-07-20T08:00:00.000Z', 'PLN', 4000]],
  });
  const swiss = customer('2026-10-05T10:00:00.000Z', {
    money: [['2026-10-05T10:00:00.000Z', 'CHF', 2000]],
  });
  const now = customer('2026-11-03T10:00:00.000Z');
  const people = [june, later, july, swiss, now];

  it('три состояния ячейки: полная, неполная по прожившим, будущая; месяц без оплат — пустая строка', () => {
    const { rows } = paymentCohortsOf(people, MONTHS, spec('cumulative'));
    const june = rows[0]!;
    expect(june).toMatchObject({ month: '2026-06', customers: 2, open: false });
    expect(
      june.cells.slice(0, 6).map((_) => [_.state, _.base, _.value])
    ).toEqual([
      ['complete', 2, 2000],
      ['complete', 2, 2500],
      ['complete', 2, 1000],
      ['complete', 2, 1000],
      ['incomplete', 1, 2000],
      ['incomplete', 0, null],
    ]);
    expect(june.cells[6]).toEqual({
      state: 'future',
      base: 0,
      value: null,
      unpriced: false,
      staleRate: false,
    });
    expect(june.cells).toHaveLength(13);
    // Август и сентябрь без первых оплат: ноль клиентов и только будущие ячейки.
    expect(rows[2]).toMatchObject({ customers: 0, lowData: true });
    expect(rows[2]!.cells.every((_) => _.state === 'future')).toBe(true);
  });

  it('месяц, который идёт, — неполный, полных ячеек нет; без курса — отметка, в среднее не входят', () => {
    const { rows, average } = paymentCohortsOf(
      people,
      MONTHS,
      spec('cumulative')
    );
    expect(rows[5]).toMatchObject({ month: '2026-11', open: true });
    // Порог людей из поправки low_data: 2 вместо 30 — у июня с двумя новыми флага нет.
    expect(
      arrivalCohortsOf(
        people,
        MONTHS,
        {
          ...SETUP,
          checks: [
            {
              code: 'low_data',
              name: '',
              note: '',
              enabled: true,
              notify: 'off',
              params: { people: 2 },
              archivedAt: null,
            },
          ],
        },
        NOW
      ).rows[0]?.lowData
    ).toBe(false);
    expect(rows[5]!.cells[0]).toMatchObject({ state: 'incomplete', base: 0 });
    expect(rows[4]!.cells[0]).toMatchObject({
      state: 'complete',
      value: 0,
      unpriced: true,
    });
    // Среднее месяца 0: июнь (4000 на двоих) и июль (1000) — ноябрь и октябрь без курса не входят.
    expect(average[0]).toEqual({ value: 1667, cohorts: 2, customers: 3 });
    expect(average[4]).toEqual({ value: null, cohorts: 0, customers: 0 });
  });

  it('выручка месяца — со своим возвратом; после комиссии — комиссия месяцем оплаты', () => {
    const monthly = paymentCohortsOf(people, MONTHS, spec('monthly')).rows[0]!;
    expect(monthly.cells.slice(0, 3).map((_) => _.value)).toEqual([
      2000, 500, -1500,
    ]);
    const net = paymentCohortsOf(people, MONTHS, spec('cumulative', 'net'))
      .rows[0]!;
    expect(net.cells[0]?.value).toBe(1950);
  });

  it('доступ в месяце жизни: сколько с доступом из проживших; считается и без базовой валюты', () => {
    const active = paymentCohortsOf(people, MONTHS, {
      ...spec('active'),
      pricing: null,
    });
    expect(
      active.rows[0]!.cells.slice(0, 4).map((_) => [_.value, _.base])
    ).toEqual([
      [2, 2],
      [1, 2],
      [0, 2],
      [0, 2],
    ]);
    expect(active.average[0]).toMatchObject({ value: 2, customers: 4 });
    // Деньги без базовой валюты — пусто, а состояния и прожившие те же.
    const money = paymentCohortsOf(people, MONTHS, {
      ...spec('cumulative'),
      pricing: null,
    });
    expect(money.rows[0]!.cells[0]).toMatchObject({
      state: 'complete',
      base: 2,
      value: null,
    });
    expect(money.average[0]?.value).toBeNull();
  });

  it('мало данных — когорта меньше 10 клиентов', () => {
    const many = Array.from({ length: 10 }, () =>
      customer('2026-06-12T10:00:00.000Z')
    );
    expect(
      paymentCohortsOf(many.slice(0, 9), MONTHS, spec('cumulative')).rows[0]
        ?.lowData
    ).toBe(true);
    expect(
      paymentCohortsOf(many, MONTHS, spec('cumulative')).rows[0]?.lowData
    ).toBe(false);
    // Порог клиентов из настройки: 2 вместо 10 — те же 9 клиентов уже не «мало данных».
    expect(
      paymentCohortsOf(many.slice(0, 9), MONTHS, spec('cumulative'), {
        people: 5,
        customers: 2,
      }).rows[0]?.lowData
    ).toBe(false);
  });
});

describe('когорты по приходу', () => {
  const arrived = (at: string, facts: Partial<ReportPerson> = {}) =>
    customer(at, {
      payments: 0,
      firstPaidAt: null,
      money: [],
      milestones: { m1: [null, at, at] },
      ...facts,
    });

  it('доли по правилам «Источников»; ячейка с «ещё в окне» и месяц, который идёт, — не в среднем', () => {
    const people = [
      arrived('2026-06-05T10:00:00.000Z'),
      arrived('2026-06-10T10:00:00.000Z', {
        firstPaidAt: '2026-06-12T10:00:00.000Z',
        milestones: {
          m1: [
            '2026-06-11T09:00:00.000Z',
            '2026-06-13T10:00:00.000Z',
            '2026-06-10T10:00:00.000Z',
          ],
        },
      }),
      arrived('2026-10-03T10:00:00.000Z', {
        trialAt: '2026-10-03T10:05:00.000Z',
        firstPaidAt: '2026-10-05T10:00:00.000Z',
      }),
      // Пришёл 20 октября: оплата за 30 дней ещё в окне до 19 ноября.
      arrived('2026-10-20T10:00:00.000Z'),
      arrived('2026-11-02T10:00:00.000Z'),
    ];
    const { columns, rows, average } = arrivalCohortsOf(
      people,
      MONTHS,
      SETUP,
      NOW
    );
    expect(columns.map((_) => _.kind)).toEqual([
      'people',
      'milestone',
      'trial',
      'payment7',
      'payment30',
      'customers',
    ]);
    expect(rows[0]).toMatchObject({
      month: '2026-06',
      people: 2,
      open: false,
      milestones: { m1: { count: 1, base: 2, open: 0 } },
      trial: { count: 0, base: 2, open: 0 },
      payment7: { count: 1, base: 2, open: 0 },
      customers: 1,
      lowData: true,
    });
    expect(rows[4]).toMatchObject({
      people: 2,
      payment30: { count: 1, base: 1, open: 1 },
    });
    expect(rows[5]).toMatchObject({ month: '2026-11', open: true });
    // Оплата за 30 дней: июнь (1 из 2) — октябрь неполный, ноябрь идёт.
    expect(average).toMatchObject({
      month: '',
      people: 5,
      payment30: { count: 1, base: 2, open: 0 },
      payment7: { count: 2, base: 4, open: 0 },
      milestones: { m1: { count: 1, base: 4, open: 0 } },
      customers: 2,
    });
  });
});
