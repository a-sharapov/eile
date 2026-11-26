import { describe, expect, it } from 'bun:test';
import { dayBounds } from './days.ts';
import { rateSteps } from './money.ts';
import type { MilestoneFact, ReturnFact } from './person.ts';
import {
  answersOf,
  cohortOf,
  LOW_DATA,
  type Moments,
  milestoneComparisonOf,
  NO_MONEY,
  overviewTotals,
  peopleStepReport,
  peopleSteps,
  type ReportParams,
  type ReportPerson,
  reportLookups,
  type SourcesBody,
  type SourcesMoney,
  type SourcesRow,
  sourcesOf,
  sourcesTotalOf,
  stepMoney,
  visitStepReport,
} from './report.ts';
import { definePricing } from './revenue.ts';
import { applySet, EMPTY_SETUP, type FunnelStep, readSet } from './setup.ts';
import { type SpendRow, spendOf } from './spend.ts';

// Бот: части «источник» и «тип», вопрос опроса, пробный период, оплата, конец доступа, веха «задание за 3 дня».
const SETUP = applySet(
  readSet({
    format: 'eile-analytics-set',
    version: 1,
    name: 'Отчёты',
    senders: [{ code: 'bot', name: 'Бот' }],
    dictionaries: [
      {
        code: 'source',
        name: 'Источник',
        purpose: 'parts',
        utm: 'utm_source',
        values: [
          { code: 'ig', name: 'Instagram' },
          { code: 'fb', name: 'Facebook' },
        ],
      },
      {
        code: 'channel',
        name: 'Тип',
        purpose: 'parts',
        utm: 'utm_medium',
        values: [{ code: 'paid', name: 'Платная' }],
      },
      {
        code: 'heard_from',
        name: 'Откуда узнали',
        purpose: 'answers',
        values: [{ code: 'friend', name: 'Знакомые' }],
      },
    ],
    types: [
      { sender: 'bot', code: 'start', name: 'Старт', role: 'touch' },
      { sender: 'bot', code: 'trial', name: 'Пробный', role: 'trial' },
      { sender: 'bot', code: 'paid', name: 'Оплата', role: 'payment' },
      { sender: 'bot', code: 'ended', name: 'Конец', role: 'lapse' },
      { sender: 'bot', code: 'task', name: 'Задание', role: 'action' },
    ],
    schemas: [
      {
        sender: 'bot',
        name: 'Метка',
        parts: ['source', 'channel'],
      },
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

const LOOKUPS = reportLookups(SETUP);
const NOW = '2026-11-15T12:00:00.000Z';
const OCTOBER: Moments = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-11-01T00:00:00.000Z',
};
const BOUNDS = dayBounds({ from: '2026-10-01', to: '2026-10-31' }, 'UTC');

const PARAMS: ReportParams = {
  period: { from: '2026-10-01', to: '2026-10-31' },
  moments: OCTOBER,
  attribution: 'first',
  group: { kind: 'part', code: 'source' },
  filters: [],
  window: 30,
  test: false,
  limit: 50,
};

let n = 0;

const person = (facts: Partial<ReportPerson> = {}): ReportPerson => ({
  subject: `u_person_${String(++n).padStart(4, '0')}`,
  lastAt: facts.arrivedAt ?? '2026-10-10T10:00:00.000Z',
  senders: ['bot'],
  arrivedAt: '2026-10-10T10:00:00.000Z',
  firstTouch: null,
  firstTouchConflict: false,
  firstParts: {},
  returns: [],
  answers: {},
  trialAt: null,
  payments: 0,
  firstPaidAt: null,
  paidUntil: null,
  firstTermEnd: null,
  lapsedAt: null,
  returnedAt: null,
  money: [],
  feeMoney: [],
  access: [],
  milestones: {},
  firsts: {},
  dims: {},
  traits: {},
  ...facts,
});

const touched = (parts: Record<string, string>, facts = {}) =>
  person({
    firstTouch: {
      label: Object.values(parts).join('__'),
      at: '2026-10-10T10:00:00.000Z',
      sender: 'bot',
    },
    firstParts: parts,
    ...facts,
  });

const reached = (at: string): MilestoneFact => [
  at,
  '2026-10-13T10:00:00.000Z',
  '2026-10-10T10:00:00.000Z',
];

const first = (body: SourcesBody) =>
  body as Extract<SourcesBody, { attribution: 'first' }>;

const rowOf = (body: SourcesBody, value: string): SourcesRow =>
  first(body).rows.find((_) => _.value === value) as SourcesRow;

describe('«Источники» при first', () => {
  const people = [
    // Пришёл в октябре, пробный, веха, оплата за 9 дней, вторая оплата.
    touched(
      { source: 'ig', channel: 'paid' },
      {
        trialAt: '2026-10-10T10:05:00.000Z',
        milestones: { m1: reached('2026-10-11T10:00:00.000Z') },
        payments: 2,
        firstPaidAt: '2026-10-19T10:00:00.000Z',
        firstTermEnd: '2026-11-19T10:00:00.000Z',
        money: [
          ['2026-10-19T10:00:00.000Z', 'EUR', 1900],
          ['2026-11-19T10:00:00.000Z', 'EUR', 1900],
        ],
      }
    ),
    // Пришёл вчера: веха и оплата — «ещё в окне».
    touched(
      { source: 'ig' },
      {
        arrivedAt: '2026-10-31T10:00:00.000Z',
        milestones: {
          m1: [null, '2026-11-16T10:00:00.000Z', '2026-11-13T10:00:00.000Z'],
        },
      }
    ),
    // Оплата и возврат в октябре; первый срок не кончился.
    touched(
      { source: 'fb' },
      {
        payments: 1,
        firstPaidAt: '2026-10-12T10:00:00.000Z',
        firstTermEnd: '2027-01-12T10:00:00.000Z',
        money: [
          ['2026-10-12T10:00:00.000Z', 'EUR', 4900],
          ['2026-10-20T10:00:00.000Z', 'EUR', -4900],
        ],
      }
    ),
    // Пришёл в сентябре, клиент октября во второй валюте, срок кончился.
    touched(
      { source: 'fb' },
      {
        arrivedAt: '2026-09-20T10:00:00.000Z',
        payments: 1,
        firstPaidAt: '2026-10-03T10:00:00.000Z',
        firstTermEnd: '2026-11-03T10:00:00.000Z',
        money: [['2026-10-03T10:00:00.000Z', 'PLN', 1900]],
      }
    ),
    // Незнакомое значение и без метки.
    touched({ source: 'xx' }),
    person(),
    // Пришёл в сентябре, в октябре ничего: в отчёт не попадает.
    touched({ source: 'ig' }, { arrivedAt: '2026-09-01T10:00:00.000Z' }),
  ];

  it('итог по всем людям и каждый столбец строки', () => {
    const body = first(sourcesOf(people, PARAMS, LOOKUPS, NOW, BOUNDS));
    expect(body.columns).toEqual([
      { kind: 'people' },
      { kind: 'milestone', code: 'm1', name: 'Задание' },
      { kind: 'trial' },
      { kind: 'payment' },
      { kind: 'customers' },
      { kind: 'revenue' },
      { kind: 'perCustomer' },
      { kind: 'renewal' },
    ]);
    expect(body.total).toEqual({
      value: '',
      name: null,
      people: 5,
      milestones: { m1: { count: 1, base: 4, open: 1 } },
      trial: { count: 1, base: 5, open: 0 },
      payment: { count: 2, base: 4, open: 1 },
      customers: 3,
      revenue: { EUR: 1900, PLN: 1900 },
      perCustomer: { payments: 4, customers: 3 },
      renewal: { count: 1, base: 2, open: 1 },
      // Без базовой валюты денег одной цифрой нет: LTV, расход и CAC — null.
      revenueBase: null,
      ltvCustomer: null,
      ltvPerson: null,
      spend: null,
      spendMissing: false,
      cac: null,
      costPerPerson: null,
      ltvCac: null,
      payback: null,
      lowData: { people: true, customers: true },
    });
    expect(body.rows.map((_) => [_.value, _.name, _.people])).toEqual([
      ['ig', 'Instagram', 2],
      ['fb', 'Facebook', 1],
      ['~unknown', null, 1],
      ['~none', null, 1],
    ]);
    expect(rowOf(body, 'ig')).toMatchObject({
      milestones: { m1: { count: 1, base: 1, open: 1 } },
      payment: { count: 1, base: 1, open: 1 },
      revenue: { EUR: 1900 },
      renewal: { count: 1, base: 1, open: 0 },
    });
    // Возврат — своей датой: «0» в EUR; клиент сентября — в строке своего источника.
    expect(rowOf(body, 'fb')).toMatchObject({
      people: 1,
      customers: 2,
      revenue: { EUR: 0, PLN: 1900 },
      perCustomer: { payments: 2, customers: 2 },
      renewal: { count: 0, base: 1, open: 1 },
    });
    expect(rowOf(body, '~none').revenue).toEqual({});
    expect(body.daily).toHaveLength(31);
    expect(body.daily[9]).toEqual({
      day: '2026-10-10',
      people: 4,
      customers: 0,
    });
    expect(body.daily[2]).toEqual({
      day: '2026-10-03',
      people: 0,
      customers: 1,
    });
  });

  it('окно оплаты: 7 дней — оплата на девятый день не в счёт; без срока — когда угодно', () => {
    expect(
      first(sourcesOf(people, { ...PARAMS, window: 7 }, LOOKUPS, NOW, BOUNDS))
        .total.payment
    ).toEqual({ count: 1, base: 5, open: 0 });
    expect(
      first(sourcesOf(people, { ...PARAMS, window: 0 }, LOOKUPS, NOW, BOUNDS))
        .total.payment
    ).toEqual({ count: 2, base: 5, open: 0 });
  });

  it('сверх предела строк — «остальные» одной строкой, незнакомые и не указанные — в конце', () => {
    expect(
      first(
        sourcesOf(people, { ...PARAMS, limit: 1 }, LOOKUPS, NOW, BOUNDS)
      ).rows.map((_) => [_.value, _.people, _.customers])
    ).toEqual([
      ['ig', 2, 1],
      ['~unknown', 1, 0],
      ['~none', 1, 0],
      ['~rest', 1, 2],
    ]);
  });

  it('фильтр по части, `~none` и `~unknown`; столбцов без ролей нет', () => {
    const filtered = (value: string) =>
      first(
        sourcesOf(
          people,
          {
            ...PARAMS,
            filters: [{ kind: 'part', code: 'source', value }],
          },
          LOOKUPS,
          NOW,
          BOUNDS
        )
      ).total.people;
    expect([filtered('ig'), filtered('~none'), filtered('~unknown')]).toEqual([
      2, 1, 1,
    ]);
    const bare = reportLookups({ ...SETUP, types: [], milestones: [] });
    const body = first(sourcesOf(people, PARAMS, bare, NOW, BOUNDS));
    expect(body.columns).toEqual([{ kind: 'people' }]);
    expect(body.total).toMatchObject({
      trial: null,
      payment: null,
      customers: null,
      revenue: null,
      renewal: null,
      lowData: { people: true, customers: false },
    });
  });

  it('мало данных на границах: 29 и 30 новых, 9 и 10 клиентов', () => {
    const many = (count: number, customers: number) =>
      Array.from({ length: count }, (_, index) =>
        touched(
          { source: 'ig' },
          index < customers
            ? {
                payments: 1,
                firstPaidAt: '2026-10-11T10:00:00.000Z',
                money: [['2026-10-11T10:00:00.000Z', 'EUR', 100]],
              }
            : {}
        )
      );
    const low = (count: number, customers: number) =>
      first(sourcesOf(many(count, customers), PARAMS, LOOKUPS, NOW, BOUNDS))
        .total.lowData;
    expect(LOW_DATA).toEqual({ people: 30, customers: 10 });
    expect(low(29, 9)).toEqual({ people: true, customers: true });
    expect(low(30, 10)).toEqual({ people: false, customers: false });
    expect(low(30, 9)).toEqual({ people: false, customers: true });
  });

  it('пороги из настройки: 5 и 2 вместо 30 и 10 снимают флаги с тех же людей; без поправки — ядра', () => {
    const people = Array.from({ length: 6 }, (_, index) =>
      touched(
        { source: 'ig' },
        index < 2
          ? {
              payments: 1,
              firstPaidAt: '2026-10-11T10:00:00.000Z',
              money: [['2026-10-11T10:00:00.000Z', 'EUR', 100]],
            }
          : {}
      )
    );
    const corrected = reportLookups({
      ...SETUP,
      checks: [
        {
          code: 'low_data',
          name: '',
          note: '',
          enabled: true,
          notify: 'off',
          params: { people: 5, customers: 2 },
          archivedAt: null,
        },
      ],
    });
    expect(LOOKUPS.lowData).toEqual({ people: 30, customers: 10 });
    expect(corrected.lowData).toEqual({ people: 5, customers: 2 });
    expect(
      first(sourcesOf(people, PARAMS, LOOKUPS, NOW, BOUNDS)).total.lowData
    ).toEqual({ people: true, customers: true });
    expect(
      first(sourcesOf(people, PARAMS, corrected, NOW, BOUNDS)).total.lowData
    ).toEqual({ people: false, customers: false });
    // Шаг воронки — по порогу людей из настройки.
    expect(
      peopleStepReport(
        { kind: 'arrival' },
        { counted: people, open: 0, skipped: 0 },
        null,
        corrected.lowData
      ).lowData
    ).toBe(false);
    expect(
      peopleStepReport(
        { kind: 'arrival' },
        { counted: people, open: 0, skipped: 0 }
      ).lowData
    ).toBe(true);
  });
});

describe('«Источники» при return', () => {
  const back = (at: string, parts: Record<string, string>): ReturnFact => ({
    at,
    touch: { label: Object.values(parts).join('__'), at, sender: 'bot' },
    parts,
  });

  it('строка — по последнему возвращению в периоде, оплаты и выручка — от него до конца периода', () => {
    const people = [
      person({
        arrivedAt: '2026-06-01T10:00:00.000Z',
        returns: [
          back('2026-09-10T10:00:00.000Z', { source: 'ig' }),
          back('2026-10-18T10:00:00.000Z', { source: 'fb' }),
        ],
        money: [
          ['2026-09-10T10:00:00.000Z', 'EUR', 1900],
          ['2026-10-18T10:00:00.000Z', 'EUR', 1900],
          ['2026-10-25T10:00:00.000Z', 'EUR', -500],
          ['2026-11-18T10:00:00.000Z', 'EUR', 1900],
        ],
      }),
      person({ returns: [back('2026-09-10T10:00:00.000Z', { source: 'ig' })] }),
    ];
    const body = sourcesOf(
      people,
      { ...PARAMS, attribution: 'return' },
      LOOKUPS,
      NOW,
      BOUNDS
    );
    expect(body.attribution).toBe('return');
    expect(body.rows).toEqual([
      {
        value: 'fb',
        name: 'Facebook',
        returned: 1,
        payments: 1,
        revenue: { EUR: 1400 },
        revenueBase: null,
        lowData: { people: true, customers: true },
      },
    ]);
    expect(body.daily[17]).toEqual({ day: '2026-10-18', returned: 1 });
  });
});

describe('воронка', () => {
  const steps: FunnelStep[] = [
    { kind: 'arrival' },
    { kind: 'trial' },
    { kind: 'payment', number: 1 },
  ];
  // Заплатил 10-20, а пробный период начал 10-22 — «не по порядку».
  const late = person({
    trialAt: '2026-10-22T10:00:00.000Z',
    money: [['2026-10-20T10:00:00.000Z', 'EUR', 1900]],
  });
  const plain = person({ trialAt: '2026-10-11T10:00:00.000Z' });
  // Заплатил без пробного периода: в свободной воронке пропустил шаг выше.
  const direct = person({ money: [['2026-10-12T10:00:00.000Z', 'EUR', 4900]] });
  const counts = (strict: boolean) =>
    peopleSteps([late, plain, direct], steps, strict, NOW).map((_) => [
      _.counted.length,
      _.skipped,
    ]);

  it('строгая: оплата раньше пробного периода — не на шаге оплаты', () => {
    expect(counts(true)).toEqual([
      [3, 0],
      [2, 0],
      [0, 0],
    ]);
  });

  it('свободная: засчитан на обоих шагах; пропустивший пробный — отдельной долей', () => {
    expect(counts(false)).toEqual([
      [3, 0],
      [2, 0],
      [2, 1],
    ]);
  });

  it('деньги шага: N-е оплаты засчитанных по валютам и на человека', () => {
    expect(stepMoney([late, direct, plain], 1)).toEqual({
      amounts: { EUR: 6800 },
      perPerson: { EUR: 3400 },
      base: null,
      perPersonBase: null,
    });
  });

  it('веха «ещё в окне» в счёт шага не входит', () => {
    const open = person({
      milestones: {
        m1: [null, '2026-11-16T10:00:00.000Z', '2026-11-13T10:00:00.000Z'],
      },
    });
    const done = person({
      milestones: { m1: reached('2026-10-11T10:00:00.000Z') },
    });
    expect(
      peopleSteps(
        [open, done],
        [{ kind: 'arrival' }, { kind: 'milestone', milestone: 'm1' }],
        false,
        NOW
      ).map((_) => [_.counted.length, _.open])
    ).toEqual([
      [2, 0],
      [1, 1],
    ]);
  });

  it('шаг-посещение: фильтр по части — через источник посещения; признак и страница входа — без фильтра', () => {
    const sums = {
      total: 10,
      origins: [
        {
          source: {
            utmSource: 'IG',
            utmMedium: '',
            utmCampaign: '',
            utmContent: '',
            utmTerm: '',
            referrer: '',
          },
          visitors: 3,
        },
        {
          source: {
            utmSource: '',
            utmMedium: '',
            utmCampaign: '',
            utmContent: '',
            utmTerm: '',
            referrer: 'example.net',
          },
          visitors: 7,
        },
      ],
    };
    const ig = [{ kind: 'part' as const, code: 'source', value: 'ig' }];
    const none = [{ kind: 'part' as const, code: 'source', value: '~none' }];
    expect(
      visitStepReport({ kind: 'visits', page: null }, sums, ig, LOOKUPS)
    ).toMatchObject({ side: 'visits', count: 3, unfiltered: false });
    expect(
      visitStepReport({ kind: 'visits', page: null }, sums, none, LOOKUPS).count
    ).toBe(7);
    expect(
      visitStepReport(
        { kind: 'goal', goal: 'go:' },
        sums,
        [...ig, { kind: 'sender', code: '', value: 'bot' }],
        LOOKUPS
      )
    ).toMatchObject({ count: 3, unfiltered: true });
    expect(
      visitStepReport({ kind: 'visits', page: '/trial' }, sums, ig, LOOKUPS)
    ).toMatchObject({ count: 10, unfiltered: true });
    expect(
      visitStepReport({ kind: 'visits', page: null }, null, [], LOOKUPS).count
    ).toBeNull();
  });
});

describe('«Метка и ответ»', () => {
  it('новые люди по части и ответу; ~none и ~unknown на обеих осях', () => {
    const answered = (answer: string) => ({
      heard_from: { answer, text: null, at: '2026-10-10T11:00:00.000Z' },
    });
    const cohort = cohortOf(
      [
        touched({ source: 'ig' }, { answers: answered('friend') }),
        touched({ source: 'ig' }, { answers: answered('podcast') }),
        touched({ source: 'xx' }),
        person({ answers: answered('friend') }),
        person({ arrivedAt: '2026-09-01T10:00:00.000Z' }),
      ],
      PARAMS,
      LOOKUPS
    );
    const body = answersOf(
      cohort,
      { kind: 'part', code: 'source' },
      'heard_from',
      LOOKUPS,
      50
    );
    expect(body.columns).toEqual([
      { value: 'friend', name: 'Знакомые', people: 2 },
      { value: '~unknown', name: null, people: 1 },
      { value: '~none', name: null, people: 1 },
    ]);
    expect(body.rows.map((_) => [_.value, _.cells])).toEqual([
      ['ig', { friend: 1, '~unknown': 1 }],
      ['~unknown', { '~none': 1 }],
      ['~none', { friend: 1 }],
    ]);
    expect(body.total.people).toBe(4);
  });
});

// Деньги этапа 3 — пояс UTC, база EUR, курс PLN 0.2500 с октября, CHF без курса; у части «источник» ещё
// Telegram и Google.
const PRICING = definePricing(
  rateSteps(
    [{ base: 'EUR', currency: 'PLN', day: '2026-10-01', rate: '0.2500' }],
    'EUR',
    'UTC'
  )
);

const MONEY_SETUP = {
  ...SETUP,
  values: [
    ...SETUP.values,
    ...['tg', 'google'].map((code, index) => ({
      dictionary: 'source',
      code,
      name: code,
      note: '',
      archivedAt: null,
      position: 10 + index,
      awaitsSpend: false,
    })),
  ],
};
const MONEY_LOOKUPS = reportLookups(MONEY_SETUP);

const spendRow = (
  id: number,
  parts: Record<string, string>,
  amount: number
): SpendRow => ({
  id,
  month: '2026-10',
  parts,
  currency: 'EUR',
  amount,
  note: '',
  author: null,
  createdAt: NOW,
  updatedAt: NOW,
});

// Октябрь: Instagram платный — 60 €, Google без людей — 20 €, общий — 10 €.
const SPEND = [
  spendRow(1, { source: 'ig', channel: 'paid' }, 6_000),
  spendRow(2, { source: 'google' }, 2_000),
  spendRow(3, {}, 1_000),
];

const moneyFor = (
  params: ReportParams,
  extra: Partial<SourcesMoney> = {}
): SourcesMoney => ({
  pricing: PRICING,
  fees: 'gross',
  life: 0,
  spend: spendOf(
    SPEND,
    params,
    (row) =>
      PRICING.price(row.currency, row.amount, `${row.month}-01T00:00:00.000Z`),
    MONEY_LOOKUPS
  ),
  awaiting: new Set(['tg']),
  ...extra,
});

describe('деньги «Источников»', () => {
  const at = (day: string) => `2026-${day}T10:00:00.000Z`;
  const paying = (
    parts: Record<string, string>,
    day: string,
    facts: Partial<ReportPerson>
  ) =>
    touched(parts, {
      arrivedAt: at(day),
      payments: 1,
      firstPaidAt: at(day),
      ...facts,
    });
  const people = [
    paying({ source: 'ig', channel: 'paid' }, '10-03', {
      money: [
        [at('10-03'), 'EUR', 10_000],
        [at('10-20'), 'EUR', -2_000],
      ],
      feeMoney: [[at('10-03'), 'EUR', 300]],
      access: [[at('10-03'), at('11-03')]],
    }),
    paying({ source: 'ig', channel: 'paid' }, '10-06', {
      money: [[at('10-06'), 'PLN', 8_000]],
      access: [[at('10-06'), null]],
    }),
    paying({ source: 'fb' }, '10-08', {
      money: [[at('10-08'), 'CHF', 5_000]],
      access: [[at('10-08'), at('10-20')]],
    }),
    touched({ source: 'tg' }, { arrivedAt: at('10-09') }),
    person({ arrivedAt: at('10-10') }),
    // Клиент сентября: в октябре его нет, в прошлом периоде — есть.
    paying({ source: 'ig' }, '09-16', { money: [[at('09-16'), 'EUR', 5_000]] }),
  ];
  const report = (
    params: ReportParams = PARAMS,
    extra: Partial<SourcesMoney> = {}
  ) =>
    first(
      sourcesOf(
        people,
        params,
        MONEY_LOOKUPS,
        NOW,
        BOUNDS,
        moneyFor(params, extra)
      )
    );

  it('выручка в базовой валюте и без курса; LTV на клиента и на человека; расход, CAC, цена человека, LTV / CAC, окупаемость', () => {
    const body = report();
    expect(body.columns.map((_) => _.kind).slice(-7)).toEqual([
      'ltvCustomer',
      'ltvPerson',
      'spend',
      'cac',
      'costPerPerson',
      'ltvCac',
      'payback',
    ]);
    expect(body.total).toMatchObject({
      people: 5,
      customers: 3,
      revenue: { EUR: 8_000, PLN: 8_000, CHF: 5_000 },
      revenueBase: {
        value: 10_000,
        unpriced: { CHF: 5_000 },
        staleRate: false,
      },
      ltvCustomer: { value: 3_333, base: 3, open: 0, low: true },
      ltvPerson: { value: 2_000, base: 5, open: 0, low: true },
      spend: { value: 9_000 },
      cac: 3_000,
      costPerPerson: 1_800,
      ltvCac: 1.11,
      payback: { months: 1, lived: 1 },
      spendMissing: false,
    });
    expect(rowOf(body, 'ig')).toMatchObject({
      spend: { value: 6_000 },
      cac: 3_000,
      ltvCustomer: { value: 5_000, base: 2 },
      ltvCac: 1.67,
      payback: { months: 1, lived: 1 },
    });
    // Расхода нет — «—», а не ноль; значение «ждёт расхода» — «расход не введён».
    expect(rowOf(body, 'fb')).toMatchObject({
      spend: null,
      cac: null,
      ltvCac: null,
      payback: null,
      spendMissing: false,
    });
    expect(rowOf(body, 'tg')).toMatchObject({
      spend: null,
      spendMissing: true,
    });
  });

  it('значение с расходом — строка и без людей: «нет клиентов»; общий расход — без строки, в итоге', () => {
    const body = report();
    expect(body.rows.map((_) => _.value)).toEqual([
      'ig',
      'fb',
      'tg',
      'google',
      '~none',
    ]);
    expect(rowOf(body, 'google')).toMatchObject({
      people: 0,
      customers: 0,
      spend: { value: 2_000 },
      cac: null,
      costPerPerson: null,
      payback: null,
    });
    expect(rowOf(body, '~none').spend).toBeNull();
    // Сверх предела — «остальные» с расходом свёрнутых значений.
    expect(
      report({ ...PARAMS, limit: 2 }).rows.map((_) => [
        _.value,
        _.spend?.value ?? null,
      ])
    ).toEqual([
      ['ig', 6_000],
      ['fb', null],
      ['~none', null],
      ['~rest', 2_000],
    ]);
  });

  it('после комиссии: выручка и LTV без неё; комиссия известна у 1 из 3 оплат', () => {
    const body = report(PARAMS, { fees: 'net' });
    expect(body.total.revenue).toEqual({ EUR: 7_700, PLN: 8_000, CHF: 5_000 });
    expect(body.total.revenueBase?.value).toBe(9_700);
    expect(body.feeCoverage).toEqual({ payments: 3, withFee: 1 });
    expect(report().feeCoverage).toBeNull();
  });

  it('срок жизни: в октябре 3 месяца не прожил никто — LTV нет, все «ещё живут срок»', () => {
    expect(report(PARAMS, { life: 3 }).total).toMatchObject({
      ltvCustomer: { value: null, base: 0, open: 3 },
      ltvPerson: { value: null, base: 0, open: 5 },
      ltvCac: null,
    });
  });

  it('без базовой валюты и без расходов — деньги одной цифрой null, столбцов нет', () => {
    const bare = first(
      sourcesOf(people, PARAMS, MONEY_LOOKUPS, NOW, BOUNDS, NO_MONEY)
    );
    expect(bare.columns.map((_) => _.kind)).not.toContain('ltvCustomer');
    expect(bare.columns.map((_) => _.kind)).not.toContain('spend');
    expect(bare.total).toMatchObject({
      revenueBase: null,
      ltvCustomer: null,
      spend: null,
      cac: null,
      payback: null,
    });
    const noSpend = report(PARAMS, { spend: null });
    expect(noSpend.columns.map((_) => _.kind)).toContain('ltvCustomer');
    expect(noSpend.columns.map((_) => _.kind)).not.toContain('cac');
    expect(rowOf(noSpend, 'tg').spendMissing).toBe(false);
  });

  it('группа не по части — расход только у итога; возврат — расхода нет', () => {
    const byAnswer = {
      ...PARAMS,
      group: { kind: 'answer', code: 'heard_from' },
    } as const;
    const body = report(byAnswer);
    expect(body.total.spend?.value).toBe(9_000);
    expect(body.rows.every((_) => _.spend === null)).toBe(true);
    expect(moneyFor({ ...PARAMS, attribution: 'return' }).spend).toMatchObject({
      scope: 'none',
      reason: 'return',
    });
  });

  it('итог другого периода — те же люди, свой расход, «сейчас» то же', () => {
    const september: ReportParams = {
      ...PARAMS,
      period: { from: '2026-09-01', to: '2026-09-30' },
      moments: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
      },
    };
    expect(
      sourcesTotalOf(people, september, MONEY_LOOKUPS, NOW, moneyFor(september))
    ).toMatchObject({
      people: 1,
      customers: 1,
      revenueBase: { value: 5_000 },
      spend: null,
      cac: null,
    });
  });

  it('деньги шага воронки — в базовой валюте одной суммой и на заплатившего', () => {
    expect(stepMoney(people.slice(0, 3), 1, PRICING)).toMatchObject({
      amounts: { EUR: 10_000, PLN: 8_000, CHF: 5_000 },
      base: { value: 12_000, unpriced: { CHF: 5_000 } },
      perPersonBase: 4_000,
    });
  });

  it('«Обзор»: новые люди и клиенты, выручка до и после комиссии, доступ в конце периода, расход и CAC', () => {
    const money = {
      pricing: PRICING,
      spend: { value: 9_000, unpriced: {}, staleRate: false },
      fees: true,
      access: true,
    };
    const customers = people.filter((_) => _.firstPaidAt !== null);
    expect(
      overviewTotals(people, customers, OCTOBER, NOW, money, SETUP)
    ).toEqual({
      people: 5,
      customers: 3,
      revenue: { EUR: 8_000, PLN: 8_000, CHF: 5_000 },
      revenueBase: {
        value: 10_000,
        unpriced: { CHF: 5_000 },
        staleRate: false,
      },
      revenueNet: { value: 9_700, unpriced: { CHF: 5_000 }, staleRate: false },
      active: 2,
      spend: { value: 9_000, unpriced: {}, staleRate: false },
      cac: 3_000,
    });
    // Без комиссий у сайта, данных о доступе и базовой валюты — их итогов нет; без роли «оплата» — и клиентов.
    expect(
      overviewTotals(
        people,
        customers,
        OCTOBER,
        NOW,
        { pricing: null, spend: null, fees: false, access: false },
        { ...SETUP, types: SETUP.types.filter((_) => _.role !== 'payment') }
      )
    ).toEqual({
      people: 5,
      customers: null,
      revenue: null,
      revenueBase: null,
      revenueNet: null,
      active: null,
      spend: null,
      cac: null,
    });
  });

  it('«Сравнение вех»: достигли, не достигли, ещё в окне и доли оплативших в обеих группах', () => {
    const cohort = [
      { ...people[0]!, milestones: { m1: reached(at('10-04')) } },
      {
        ...people[1]!,
        milestones: { m1: [null, at('10-09'), at('10-06')] as MilestoneFact },
      },
      {
        ...people[2]!,
        milestones: { m1: [null, at('11-20'), at('10-08')] as MilestoneFact },
      },
      people[3]!,
      people[4]!,
    ];
    expect(milestoneComparisonOf(cohort, 30, NOW, SETUP)).toEqual([
      {
        code: 'm1',
        name: 'Задание',
        reached: 1,
        missed: 3,
        open: 1,
        paidReached: { count: 1, base: 1, open: 0 },
        paidMissed: { count: 1, base: 3, open: 0 },
        lowData: true,
      },
    ]);
    expect(
      milestoneComparisonOf(cohort, 30, NOW, {
        ...SETUP,
        types: SETUP.types.filter((_) => _.role !== 'payment'),
      })[0]
    ).toMatchObject({ paidReached: null, paidMissed: null });
  });
});
