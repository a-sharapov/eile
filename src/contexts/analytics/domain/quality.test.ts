import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import type { ExchangeRate } from './money.ts';
import type { PersonFacts } from './person.ts';
import {
  type CheckDay,
  type CheckResult,
  checkConfigs,
  checkCorrection,
  checkOrder,
  clockOf,
  connecting,
  type DayEvent,
  decide,
  dueAt,
  eventTouches,
  intakeOffOn,
  intakeRefusals,
  labelsReadable,
  lastDue,
  linksArrive,
  lowDataOf,
  matchedOf,
  missingRun,
  nextRow,
  paymentFacts,
  type QualityCheck,
  ratePresent,
  resolutionNote,
  ruleFrom,
  SUMMARY_CHECKS,
  type SummaryFacts,
  senderFacts,
  statementMatches,
  type ThresholdRule,
  thresholdCheck,
  touchConflicts,
  unknownIn,
} from './quality.ts';
import { qualityNotice } from './quality-texts.ts';
import { EMPTY_SETUP, type LabelSchema, type Setup } from './setup.ts';
import type { Statement } from './statements.ts';
import type { SummaryDay } from './summary.ts';
import type { IntakeDay } from './tally.ts';

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

// Пример раздела «Правила встроенных проверок»: бот, час сводки 03:30, сутки 24 ноября по UTC.
const DAY = '2026-11-24';
const EXPECTED = '2026-11-25T03:30:00.000Z';

const summary = (extra: Partial<SummaryDay> = {}): SummaryDay => ({
  sender: 'bot',
  day: DAY,
  test: false,
  seq: 1,
  at: '2026-11-25T03:00:00.000Z',
  receivedAt: '2026-11-25T03:00:02.000Z',
  counts: { bot_start: 31, purchase: 4, task_done: 62, user_deleted: 1 },
  revenue: { EUR: 7600, PLN: 10000 },
  failed: 0,
  version: '1.5.0',
  ...extra,
});

const TYPES = new Map([
  ['bot_start', { name: 'Старт бота', role: 'touch' as const }],
  ['purchase', { name: 'Оплата', role: 'payment' as const }],
  ['refund', { name: 'Возврат', role: 'refund' as const }],
  ['task_done', { name: 'Задание', role: 'action' as const }],
  ['user_deleted', { name: 'Удаление', role: 'erasure' as const }],
  ['daily_summary', { name: 'Сводка', role: 'summary' as const }],
]);

const facts = (extra: Partial<SummaryFacts> = {}): SummaryFacts => ({
  summary: summary(),
  expected: EXPECTED,
  missingDays: 0,
  intakeOff: false,
  site: { bot_start: 31, purchase: 2, task_done: 60 },
  erased: { task_done: 2, user_deleted: 1 },
  revenue: { EUR: 3800, PLN: 10000 },
  types: TYPES,
  ...extra,
});

const PARAMS = (check: string) =>
  checkConfigs(EMPTY_SETUP).find((_) => _.spec.code === check)?.params ?? {};

const shape = (result: CheckResult) => [
  result.state,
  result.reason,
  result.value,
];

describe('сроки суток', () => {
  it('проверки сводки — через 5 минут после часа сводки: в 03:34 последний наступивший — позавчера, в 03:35 — вчера', () => {
    expect(dueAt('summary', DAY, '03:30', '')).toBe('2026-11-25T03:35:00.000Z');
    expect(lastDue('summary', '2026-11-25T03:34:59.999Z', '03:30', '')).toBe(
      '2026-11-23'
    );
    expect(lastDue('summary', '2026-11-25T03:35:00.000Z', '03:30', '')).toBe(
      DAY
    );
    // Час 23:59 переносит срок на третьи сутки: 00:04 двадцать шестого.
    expect(dueAt('summary', DAY, '23:59', '')).toBe('2026-11-26T00:04:00.000Z');
    expect(lastDue('summary', '2026-11-26T00:03:00.000Z', '23:59', '')).toBe(
      '2026-11-23'
    );
  });

  it('проверки суток UTC — в 06:05; суток пояса — через 6 ч 5 мин после начала следующих, и в дни перехода времени', () => {
    expect(lastDue('utc', '2026-11-25T06:04:00.000Z', null, '')).toBe(
      '2026-11-23'
    );
    expect(lastDue('utc', '2026-11-25T06:05:00.000Z', null, '')).toBe(DAY);
    // 25 октября в Берлине длится 25 часов: следующие сутки начинаются в 23:00 UTC.
    expect(dueAt('report', '2026-10-25', null, 'Europe/Berlin')).toBe(
      '2026-10-26T05:05:00.000Z'
    );
    expect(
      lastDue('report', '2026-10-26T05:04:00.000Z', null, 'Europe/Berlin')
    ).toBe('2026-10-24');
    expect(
      lastDue('report', '2026-10-26T05:05:00.000Z', null, 'Europe/Berlin')
    ).toBe('2026-10-25');
    // 29 марта — 23 часа: 30-е начинается в 22:00 UTC.
    expect(dueAt('report', '2026-03-29', null, 'Europe/Berlin')).toBe(
      '2026-03-30T04:05:00.000Z'
    );
  });
});

describe('проверки сводки', () => {
  it('«Сводка пришла»: вовремя, позже срока — в порядке с причиной late, нет — сбой и сколько суток подряд', () => {
    expect(shape(SUMMARY_CHECKS.summary_arrived(facts(), {}))).toEqual([
      'ok',
      null,
      null,
    ]);
    const late = SUMMARY_CHECKS.summary_arrived(
      facts({ summary: summary({ receivedAt: '2026-11-25T07:12:00.000Z' }) }),
      {}
    );
    expect([...shape(late), late.detail]).toEqual([
      'ok',
      'late',
      null,
      { receivedAt: '2026-11-25T07:12:00.000Z' },
    ]);
    expect(
      shape(
        SUMMARY_CHECKS.summary_arrived(
          facts({ summary: null, missingDays: 3 }),
          {}
        )
      )
    ).toEqual(['failure', 'missing', 3]);
    // Приём выключали хоть на минуту — отправитель получал 503: ждать сводку сайт не может.
    expect(
      shape(
        SUMMARY_CHECKS.summary_arrived(
          facts({ summary: null, intakeOff: true }),
          {}
        )
      )
    ).toEqual(['no_data', 'intake_off', null]);
  });

  it('«События дошли»: таблица примера — стёртые и событие удаления в счёте стёртого, недостаёт 2 оплат — сбой', () => {
    const result = SUMMARY_CHECKS.events_arrived(
      facts(),
      PARAMS('events_arrived')
    );
    expect(shape(result)).toEqual(['failure', 'missing', 2]);
    expect(result.detail.types).toEqual([
      {
        type: 'bot_start',
        known: true,
        summary: 31,
        site: 31,
        erased: 0,
        missing: 0,
        extra: 0,
      },
      {
        type: 'purchase',
        known: true,
        summary: 4,
        site: 2,
        erased: 0,
        missing: 2,
        extra: 0,
      },
      {
        type: 'task_done',
        known: true,
        summary: 62,
        site: 60,
        erased: 2,
        missing: 0,
        extra: 0,
      },
      {
        type: 'user_deleted',
        known: true,
        summary: 1,
        site: 0,
        erased: 1,
        missing: 0,
        extra: 0,
      },
    ]);
    expect(result.version).toBe('1.5.0');
    // Порог missing: 2 — недостающие две в пределах, сбоя нет.
    expect(
      shape(SUMMARY_CHECKS.events_arrived(facts(), { missing: 2 }))
    ).toEqual(['ok', null, 2]);
    // На сайте больше — замечание; незнакомый тип сверяется кодом; тип «сводка» не сверяется.
    const extra = SUMMARY_CHECKS.events_arrived(
      facts({
        summary: summary({
          counts: { bot_start: 30, zz_new: 3, daily_summary: 1 },
        }),
        site: { bot_start: 31, zz_new: 3 },
        erased: {},
      }),
      PARAMS('events_arrived')
    );
    expect(shape(extra)).toEqual(['warning', 'extra', 1]);
    expect(
      (extra.detail.types as { type: string; known: boolean }[]).map((_) => [
        _.type,
        _.known,
      ])
    ).toEqual([
      ['bot_start', true],
      ['zz_new', false],
    ]);
    expect(
      shape(SUMMARY_CHECKS.events_arrived(facts({ summary: null }), {}))
    ).toEqual(['no_data', 'no_summary', null]);
  });

  it('«Выручка сходится»: допуск 0 и 1 %, валюта с одной стороны, без revenue, стёртая оплата', () => {
    const result = SUMMARY_CHECKS.revenue_matches(
      facts(),
      PARAMS('revenue_matches')
    );
    expect(shape(result)).toEqual(['failure', 'mismatch', 50]);
    expect(result.detail.currencies).toEqual([
      { currency: 'EUR', summary: 7600, site: 3800 },
      { currency: 'PLN', summary: 10000, site: 10000 },
    ]);
    // 1 % от 76,00 — 0,76: 75,30 расходится на 0,92 %, 75,00 — на 1,32 %.
    expect(
      shape(
        SUMMARY_CHECKS.revenue_matches(
          facts({ revenue: { EUR: 7530, PLN: 10000 } }),
          { tolerance: 1 }
        )
      )
    ).toEqual(['ok', null, 0]);
    expect(
      shape(
        SUMMARY_CHECKS.revenue_matches(
          facts({ revenue: { EUR: 7500, PLN: 10000 } }),
          { tolerance: 1 }
        )
      )
    ).toEqual(['failure', 'mismatch', 1.3]);
    // Валюта только на сайте — расхождение во всю сумму.
    expect(
      shape(
        SUMMARY_CHECKS.revenue_matches(
          facts({ revenue: { EUR: 7600, PLN: 10000, CHF: 500 } }),
          { tolerance: 1 }
        )
      )
    ).toEqual(['failure', 'mismatch', 100]);
    expect(
      shape(
        SUMMARY_CHECKS.revenue_matches(
          facts({ summary: summary({ revenue: null }) }),
          {}
        )
      )
    ).toEqual(['no_data', 'no_revenue', null]);
    // Стёрта оплата этих суток — суммы стёртого сайт не хранит: «нет данных»; совпало — в порядке и при стёртых.
    expect(
      shape(
        SUMMARY_CHECKS.revenue_matches(facts({ erased: { purchase: 2 } }), {})
      )
    ).toEqual(['no_data', 'erased', 50]);
    expect(
      shape(
        SUMMARY_CHECKS.revenue_matches(
          facts({
            erased: { purchase: 2 },
            revenue: { EUR: 7600, PLN: 10000 },
          }),
          {}
        )
      )
    ).toEqual(['ok', null, 0]);
  });

  it('«Отправитель доставил всё»: failed больше порога — сбой; поля нет — нет данных', () => {
    expect(
      shape(
        SUMMARY_CHECKS.sender_delivered(
          facts({ summary: summary({ failed: 2 }) }),
          PARAMS('sender_delivered')
        )
      )
    ).toEqual(['failure', 'failed', 2]);
    expect(
      shape(
        SUMMARY_CHECKS.sender_delivered(
          facts({ summary: summary({ failed: 2 }) }),
          { failed: 2 }
        )
      )
    ).toEqual(['ok', null, 2]);
    expect(
      shape(
        SUMMARY_CHECKS.sender_delivered(
          facts({ summary: summary({ failed: null }) }),
          {}
        )
      )
    ).toEqual(['no_data', 'no_failed', null]);
  });

  it('сутки без сводки подряд — от первой сводки; приём выключен на минуту суток — по журналу выключателя', () => {
    const days = new Set(['2026-11-16', '2026-11-20']);
    expect(missingRun(days, DAY, '2026-11-16')).toBe(4);
    expect(missingRun(days, '2026-11-20', '2026-11-16')).toBe(0);
    expect(missingRun(days, '2026-11-15', '2026-11-16')).toBe(0);
    const switches = [
      { at: '2026-11-20T14:00:00.000Z', before: false, after: true },
      { at: '2026-11-24T10:00:00.000Z', before: true, after: false },
      { at: '2026-11-24T10:01:00.000Z', before: false, after: true },
    ];
    // Первые сутки: включили в 14:00 — нет данных; следующие — сравниваются.
    expect(intakeOffOn(switches, '2026-11-19', true)).toBe(true);
    expect(intakeOffOn(switches, '2026-11-20', true)).toBe(true);
    expect(intakeOffOn(switches, '2026-11-21', true)).toBe(false);
    expect(intakeOffOn(switches, DAY, true)).toBe(true);
    expect(intakeOffOn(switches, '2026-11-25', true)).toBe(false);
    expect(intakeOffOn([], DAY, true)).toBe(false);
    expect(intakeOffOn([], DAY, false)).toBe(true);
  });
});

const SCHEMA: LabelSchema = {
  sender: 'bot',
  name: 'Метка бота',
  note: '',
  separator: '__',
  length: 64,
  parts: ['source', 'channel'],
  archivedAt: null,
};

describe('проверки суток UTC', () => {
  it('«Метки читаются»: 9 касаний при min 10 — мало данных; 10 % — в порядке, 10,1 % — замечание; без схемы — нет данных', () => {
    const readable = (n: number) =>
      Array.from({ length: n }, (_, i) => `ig__paid${i}`);
    expect(
      shape(labelsReadable(readable(9), SCHEMA, PARAMS('labels_readable')))
    ).toEqual(['no_data', 'low_volume', 9]);
    expect(
      shape(
        labelsReadable(
          [...readable(9), 'ig__paid__extra'],
          SCHEMA,
          PARAMS('labels_readable')
        )
      )
    ).toEqual(['ok', null, 10]);
    // 1000 касаний, 101 нечитаемое: invalid, extra и length.
    const many = [
      ...readable(899),
      ...Array.from({ length: 50 }, (_, i) => `IG!__x${i}`),
      ...Array.from({ length: 50 }, (_, i) => `ig__x__${i}`),
      `${'a'.repeat(30)}__${'b'.repeat(33)}`,
    ];
    const result = labelsReadable(many, SCHEMA, PARAMS('labels_readable'));
    expect(shape(result)).toEqual(['warning', 'unreadable', 10.1]);
    expect(result.detail).toEqual({
      total: 1000,
      unreadable: 101,
      invalid: 50,
      extra: 50,
      length: 1,
    });
    expect(shape(labelsReadable(readable(20), null, {}))).toEqual([
      'no_data',
      'no_schema',
      20,
    ]);
  });

  it('«Отказы приёмника»: 400 известному отправителю — сбой, 401 и 429 — замечание, 503 — не в счёт', () => {
    const row = (
      sender: string,
      outcome: IntakeDay['outcome'],
      count: number,
      origin: IntakeDay['origin'] = 'http'
    ): IntakeDay => ({ day: DAY, sender, origin, outcome, count });
    const senders = new Set(['bot']);
    const params = PARAMS('intake_refusals');
    expect(
      shape(intakeRefusals([row('bot', 'invalid', 1)], senders, params))
    ).toEqual(['failure', 'invalid', 1]);
    expect(
      shape(
        intakeRefusals(
          [row('', 'unauthorized', 2), row('', 'throttled', 1)],
          senders,
          params
        )
      )
    ).toEqual(['warning', 'unauthorized', 3]);
    // 503 — выключатель владельца; 400 файла — не приёмник; отказ чужому ключу 400 не бывает.
    expect(
      shape(
        intakeRefusals(
          [
            row('', 'disabled', 40),
            row('bot', 'invalid', 3, 'file'),
            row('bot', 'accepted', 100),
          ],
          senders,
          params
        )
      )
    ).toEqual(['ok', null, 0]);
  });

  it('«Первое касание неизменно»: человек, чьё событие принесло другую метку или другой момент', () => {
    const event = (
      subject: string,
      label: string,
      at: string,
      seq = 1
    ): DayEvent => ({
      seq,
      sender: 'bot',
      type: 'task_done',
      subject,
      test: false,
      at: `${DAY}T10:00:00.000Z`,
      receivedAt: `${DAY}T10:00:01.000Z`,
      body: { first_touch: { label, at } },
    });
    const chosen = new Map([
      ['u_a', { label: 'ig__paid', at: '2026-11-01T09:00:00.000Z' }],
      ['u_b', { label: 'ig__paid', at: '2026-11-01T09:00:00.000Z' }],
      ['u_c', { label: 'fb__paid', at: '2026-11-02T09:00:00.000Z' }],
    ]);
    expect(
      touchConflicts(
        [
          // Тот же момент с поясом — то же касание.
          event('u_a', 'ig__paid', '2026-11-01T10:00:00+01:00'),
          event('u_b', 'tg__paid', '2026-11-01T09:00:00Z'),
          event('u_b', 'tg__paid', '2026-11-01T09:00:00Z', 2),
          event('u_c', 'fb__paid', '2026-11-03T09:00:00Z'),
        ],
        chosen
      )
    ).toBe(2);
  });

  it('«Всё знакомо»: незнакомый тип, ответ опроса, значение части в метке — видами, без кодов', () => {
    const setup: Setup = {
      ...EMPTY_SETUP,
      senders: [
        {
          code: 'bot',
          name: 'Бот',
          note: '',
          enabled: true,
          summaryAt: '03:30',
          archivedAt: null,
        },
      ],
      types: [
        {
          sender: 'bot',
          code: 'bot_start',
          name: 'Старт',
          note: '',
          role: 'touch',
          properties: [],
          archivedAt: null,
        },
      ],
      dictionaries: [
        {
          code: 'source',
          name: 'Источник',
          note: '',
          purpose: 'parts',
          utm: 'utm_source',
          length: 20,
          archivedAt: null,
        },
      ],
      values: [
        {
          dictionary: 'source',
          code: 'ig',
          name: 'Instagram',
          note: '',
          position: 0,
          awaitsSpend: false,
          archivedAt: null,
        },
      ],
      schemas: [{ ...SCHEMA, parts: ['source'] }],
    };
    const event = (type: string, data: object): DayEvent => ({
      seq: 1,
      sender: 'bot',
      type,
      subject: 'u_3b9e0c7a1f',
      test: false,
      at: `${DAY}T10:00:00.000Z`,
      receivedAt: `${DAY}T10:00:01.000Z`,
      body: {
        id: 'evt_1',
        type,
        at: `${DAY}T10:00:00Z`,
        subject: 'u_3b9e0c7a1f',
        data,
      },
    });
    expect(
      unknownIn(event('bot_start', { label: 'ig' }), setup, 'touch')
    ).toEqual([]);
    expect(
      unknownIn(event('bot_start', { label: 'zz-site' }), setup, 'touch')
    ).toEqual(['part']);
    expect(unknownIn(event('zz_new', {}), setup, null)).toEqual(['type']);
    expect(eventTouches(event('bot_start', { label: '  ' }), 'touch')).toEqual(
      []
    );
  });
});

describe('проверки суток пояса', () => {
  it('«Переходы доходят»: 11 и 12 человек при 24 целях, людей больше целей, мало целей, без счёта посещений', () => {
    const params = PARAMS('links_arrive');
    expect(
      shape(
        linksArrive(true, [{ link: 'trial', goals: 24, people: 11 }], params)
      )
    ).toEqual(['warning', 'lagging', 1]);
    expect(
      shape(
        linksArrive(true, [{ link: 'trial', goals: 24, people: 12 }], params)
      )
    ).toEqual(['ok', null, 0]);
    expect(
      shape(
        linksArrive(true, [{ link: 'trial', goals: 5, people: 40 }], params)
      )
    ).toEqual(['no_data', 'low_volume', null]);
    expect(
      shape(
        linksArrive(true, [{ link: 'trial', goals: 10, people: 40 }], params)
      )
    ).toEqual(['ok', null, 0]);
    expect(shape(linksArrive(false, [], params))).toEqual([
      'no_data',
      'stats_off',
      null,
    ]);
    expect(shape(linksArrive(true, [], params))).toEqual([
      'no_data',
      'no_links',
      null,
    ]);
  });

  it('«Курс есть»: база EUR, курс PLN — по октябрь; оплата 2 ноября — замечание у суток 4 ноября; CHF без курса — сбой', () => {
    const rate = (currency: string, day: string): ExchangeRate => ({
      base: 'EUR',
      currency,
      day,
      rate: '0.2300',
      author: null,
      updatedAt: '2026-10-01T10:00:00.000Z',
    });
    const rates = [rate('PLN', '2026-10-01')];
    const moments = [{ currency: 'PLN', at: '2026-11-02T10:00:00.000Z' }];
    const params = PARAMS('rate_present');
    const on = (day: string, extra = moments) =>
      ratePresent('EUR', extra, rates, day, 'Europe/Berlin', params);
    expect(shape(on('2026-11-02'))).toEqual(['ok', null, 0]);
    expect(shape(on('2026-11-03'))).toEqual(['ok', null, 0]);
    expect(shape(on('2026-11-04'))).toEqual(['warning', 'stale_rate', 1]);
    expect(on('2026-11-04').detail.stale).toEqual([
      { currency: 'PLN', month: '2026-11' },
    ]);
    expect(
      shape(
        on('2026-11-04', [
          ...moments,
          { currency: 'CHF', at: '2026-10-20T10:00:00.000Z' },
        ])
      )
    ).toEqual(['failure', 'no_rate', 1]);
    // Курс за ноябрь введён — замечание прошло само.
    expect(
      shape(
        ratePresent(
          'EUR',
          moments,
          [...rates, rate('PLN', '2026-11-01')],
          '2026-11-04',
          'Europe/Berlin',
          params
        )
      )
    ).toEqual(['ok', null, 0]);
    expect(
      shape(ratePresent(null, moments, rates, '2026-11-04', '', params))
    ).toEqual(['no_data', 'no_base', null]);
  });
});

const row = (
  day: string,
  state: CheckDay['state'],
  extra: Partial<CheckDay> = {}
): CheckDay => ({
  check: 'summary_arrived',
  scope: 'bot',
  test: false,
  day,
  state,
  reason: state === 'failure' ? 'missing' : null,
  value: state === 'failure' ? 1 : null,
  detail: {},
  version: null,
  evaluatedAt: `${day}T03:35:00.000Z`,
  resolution: null,
  notifiedAt: null,
  episode: null,
  recoveredAt: null,
  ...extra,
});

const NOTE = {
  at: '2026-11-25T10:00:00.000Z',
  by: 'Анна',
  agent: false,
  note: 'бот стоял на обновлении',
};

describe('эпизоды и уведомления', () => {
  it('новое — о D*; на второй день того же эпизода — нет; на седьмые сутки после уведомления — напоминание', () => {
    expect(
      decide([row(DAY, 'failure')], DAY, 'failure', '2026-11-25T03:35:00.000Z')
    ).toMatchObject({ kind: 'alert', episode: DAY });
    const notified = row(DAY, 'failure', {
      notifiedAt: '2026-11-25T03:35:00.000Z',
      episode: DAY,
    });
    expect(
      decide(
        [notified, row('2026-11-25', 'failure')],
        '2026-11-25',
        'failure',
        '2026-11-26T03:35:00.000Z'
      )
    ).toBeNull();
    const week = [
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ].map((_) => row(_, 'failure'));
    expect(
      decide(
        [notified, ...week.slice(0, 6)],
        '2026-11-30',
        'failure',
        '2026-12-01T03:35:00.000Z'
      )
    ).toBeNull();
    expect(
      decide(
        [notified, ...week],
        '2026-12-01',
        'failure',
        '2026-12-02T03:35:00.000Z'
      )
    ).toMatchObject({ kind: 'remind', episode: DAY });
  });

  it('«снова в порядке» — когда строки эпизода прошли перепроверкой; после снятия — нет; не о тех сутках — нет', () => {
    const notified = row(DAY, 'failure', {
      notifiedAt: '2026-11-25T03:35:00.000Z',
      episode: DAY,
    });
    // Сводка за 25-е пришла, за 24-е — нет: 24-е по-прежнему сбой.
    expect(
      decide(
        [notified, row('2026-11-25', 'ok')],
        '2026-11-25',
        'failure',
        '2026-11-26T03:35:00.000Z'
      )
    ).toBeNull();
    // Сводка за 24-е пришла днём 25-го: оба дня в порядке.
    expect(
      decide(
        [{ ...notified, state: 'ok', reason: 'late' }, row('2026-11-25', 'ok')],
        '2026-11-25',
        'failure',
        '2026-11-26T03:35:00.000Z'
      )
    ).toMatchObject({ kind: 'recovered', episode: DAY, row: { day: DAY } });
    // Снятое вручную не даёт «снова в порядке»: снявший и так знает.
    expect(
      decide(
        [{ ...notified, resolution: NOTE }, row('2026-11-25', 'ok')],
        '2026-11-25',
        'failure',
        '2026-11-26T03:35:00.000Z'
      )
    ).toBeNull();
    // Уже ушло — второй раз нет.
    expect(
      decide(
        [
          {
            ...notified,
            state: 'ok',
            recoveredAt: '2026-11-25T12:00:00.000Z',
          },
        ],
        DAY,
        'failure',
        '2026-11-26T03:35:00.000Z'
      )
    ).toBeNull();
  });

  it('снятие прерывает эпизод: следующий сбой — новый эпизод и новое уведомление; не чаще раза в сутки', () => {
    const notified = row(DAY, 'failure', {
      notifiedAt: '2026-11-25T03:35:00.000Z',
      episode: DAY,
      resolution: NOTE,
    });
    expect(
      decide(
        [notified, row('2026-11-25', 'failure')],
        '2026-11-25',
        'failure',
        '2026-11-26T03:35:00.000Z'
      )
    ).toMatchObject({ kind: 'alert', episode: '2026-11-25' });
    // Меньше суток с прошлого уведомления пары — ждёт.
    expect(
      decide(
        [notified, row('2026-11-25', 'failure')],
        '2026-11-25',
        'failure',
        '2026-11-26T03:00:00.000Z'
      )
    ).toBeNull();
    // Замечание при «уведомлять при сбое» — не уведомляют; при «и замечание» — да.
    expect(
      decide([row(DAY, 'warning')], DAY, 'failure', '2026-11-25T06:05:00.000Z')
    ).toBeNull();
    expect(
      decide([row(DAY, 'warning')], DAY, 'any', '2026-11-25T06:05:00.000Z')
    ).toMatchObject({ kind: 'alert' });
  });

  it('старые сутки не уведомляют: о сбое раньше D* сообщения нет', () => {
    expect(
      decide(
        [row('2026-11-20', 'failure'), row(DAY, 'ok')],
        DAY,
        'failure',
        '2026-11-25T03:35:00.000Z'
      )
    ).toBeNull();
  });

  it('перепроверка оставляет снятие, пока не стало тяжелее; отметки уведомлений остаются всегда', () => {
    const resolved = row(DAY, 'warning', {
      resolution: NOTE,
      notifiedAt: '2026-11-25T03:35:00.000Z',
      episode: DAY,
    });
    const again = (state: CheckDay['state']) =>
      nextRow(
        resolved,
        resolved,
        { state, reason: null, value: null, detail: {}, version: null },
        '2026-11-25T11:00:00.000Z'
      );
    expect(again('warning').resolution).toEqual(NOTE);
    expect(again('ok').resolution).toEqual(NOTE);
    expect(again('failure').resolution).toBeNull();
    expect(again('failure')).toMatchObject({
      notifiedAt: '2026-11-25T03:35:00.000Z',
      episode: DAY,
      evaluatedAt: '2026-11-25T11:00:00.000Z',
    });
  });

  it('пока идёт подключение — молча: нет сводок и не прошло 7 суток с первого события', () => {
    expect(connecting('2026-11-25T03:35:00.000Z', null, false)).toBe(true);
    expect(
      connecting('2026-11-25T03:35:00.000Z', '2026-11-20T10:00:00.000Z', false)
    ).toBe(true);
    expect(
      connecting('2026-11-27T10:00:00.000Z', '2026-11-20T10:00:00.000Z', false)
    ).toBe(false);
    expect(connecting('2026-11-25T03:35:00.000Z', null, true)).toBe(false);
  });

  it('отметка смены версии: обе в порядке — сошлось, сбой — нет, без проверок — неизвестно', () => {
    const checks = [
      row(DAY, 'ok', { check: 'events_arrived' }),
      row(DAY, 'no_data', { check: 'revenue_matches', reason: 'no_revenue' }),
      row('2026-11-23', 'failure', { check: 'events_arrived' }),
    ];
    expect(matchedOf(checks)('bot', DAY)).toBe(true);
    expect(matchedOf(checks)('bot', '2026-11-23')).toBe(false);
    expect(matchedOf(checks)('bot', '2026-11-22')).toBeNull();
  });

  it('заметка снятия обязательна: 1–500 знаков', () => {
    expect(resolutionNote('  бот стоял  ')).toBe('бот стоял');
    expect(code(() => resolutionNote(''))).toBe('analytics.invalid_note');
    expect(code(() => resolutionNote('ы'.repeat(501)))).toBe(
      'analytics.invalid_note'
    );
  });
});

describe('сообщение такта', () => {
  const context = {
    sender: (code: string) => `Бот (${code})`,
    type: (_sender: string, code: string) =>
      ({ purchase: 'Оплата', bot_start: 'Старт бота' })[code] ?? null,
    summaryAt: () => '03:30',
    clock: (check: string) =>
      check === 'intake_refusals' ? ('utc' as const) : ('summary' as const),
    check: () => null,
    zone: 'Europe/Berlin',
  };

  it('одна проверка: заголовок по ней, строка «проверка · отправитель: что случилось» на трёх языках, ссылка на D*', () => {
    const notice = qualityNotice(
      [{ kind: 'alert', row: row(DAY, 'failure'), episode: DAY }],
      context,
      '2026-11-25T03:35:00.000Z'
    );
    expect(notice).toMatchObject({
      severity: 'error',
      title: {
        ru: 'Качество данных: сводка не пришла',
        en: 'Data quality: the summary did not arrive',
        de: 'Datenqualität: Tageszusammenfassung fehlt',
      },
      path: '/stats/quality?day=2026-11-24',
      source: 'analytics.quality:2026-11-25T03:35:00.000Z',
    });
    expect(notice.lines).toEqual([
      {
        label: {
          ru: 'Сводка пришла · Бот (bot)',
          en: 'Summary arrived · Бот (bot)',
          de: 'Zusammenfassung eingegangen · Бот (bot)',
        },
        value: {
          ru: 'нет сводки за 24 ноября (UTC), ждали к 03:30 UTC',
          en: 'no summary for 24 November (UTC), expected by 03:30 UTC',
          de: 'keine Zusammenfassung für den 24. November (UTC), erwartet bis 03:30 UTC',
        },
      },
    ]);
    expect(notice.text.ru).toStartWith('Если отправитель работает');
  });

  it('несколько проверок — одно сообщение, заголовок по самому тяжёлому, строка на проверку; после простоя — «3 дня подряд»', () => {
    const notice = qualityNotice(
      [
        {
          kind: 'alert',
          row: row(DAY, 'warning', {
            check: 'intake_refusals',
            scope: '',
            reason: 'unauthorized',
            value: 7,
          }),
          episode: DAY,
        },
        {
          kind: 'alert',
          row: row(DAY, 'failure', { value: 3 }),
          episode: '2026-11-22',
        },
        {
          kind: 'alert',
          row: row(DAY, 'failure', {
            check: 'events_arrived',
            reason: 'missing',
            value: 3,
            version: '1.5.0',
            detail: {
              types: [
                {
                  type: 'purchase',
                  known: true,
                  summary: 4,
                  site: 2,
                  erased: 0,
                  missing: 2,
                  extra: 0,
                },
                {
                  type: 'zz-secret',
                  known: false,
                  summary: 1,
                  site: 0,
                  erased: 0,
                  missing: 1,
                  extra: 0,
                },
              ],
            },
          }),
          episode: DAY,
        },
      ],
      context,
      '2026-11-27T08:01:00.000Z'
    );
    expect(notice.severity).toBe('error');
    expect(notice.title).toEqual({
      ru: 'Качество данных: 3 проверки не прошли',
      en: 'Data quality: 3 checks failed',
      de: 'Datenqualität: 3 Prüfungen fehlgeschlagen',
    });
    expect(notice.lines.map((_) => _.value.ru)).toEqual([
      'нет сводки 3 дня подряд (22–24 ноября)',
      'за 24 ноября недостаёт 3 событий: «Оплата» — 2, незнакомых типов: 1, версия 1.5.0',
      'за 24 ноября (UTC) запросов с чужим ключом или сверх предела (401, 429): 7',
    ]);
    expect(notice.lines[1]?.value.en).toBe(
      '3 events missing for 24 November: “Оплата” 2, unknown types: 1, version 1.5.0'
    );
    // Код незнакомого типа — текст отправителя: в сообщение не идёт.
    expect(JSON.stringify(notice)).not.toContain('zz-secret');
  });

  it('напоминание и «снова в порядке» — своими словами', () => {
    const remind = qualityNotice(
      [
        {
          kind: 'remind',
          row: row('2026-11-24', 'failure', { value: 8 }),
          episode: '2026-11-17',
        },
      ],
      context,
      '2026-11-25T03:35:00.000Z'
    );
    expect(remind.lines[0]?.value).toEqual({
      ru: 'сводок нет с 17 ноября — 8 дней подряд',
      en: 'no summaries since 17 November — 8 days in a row',
      de: 'keine Zusammenfassungen seit dem 17. November — 8 Tage in Folge',
    });
    const back = qualityNotice(
      [
        {
          kind: 'recovered',
          row: row(DAY, 'ok', {
            reason: 'late',
            detail: { receivedAt: '2026-11-25T07:12:00.000Z' },
          }),
          episode: DAY,
        },
      ],
      context,
      '2026-11-25T07:13:00.000Z'
    );
    expect(back.severity).toBe('info');
    expect(back.title.ru).toBe('Качество данных: снова в порядке');
    expect(back.lines[0]?.value).toEqual({
      ru: 'сводка за 24 ноября пришла в 07:12 UTC',
      en: 'the summary for 24 November came at 07:12 UTC',
      de: 'die Zusammenfassung für den 24. November kam um 07:12 UTC',
    });
  });

  it('выручка — суммами по ISO 4217 на языке уведомления', () => {
    const notice = qualityNotice(
      [
        {
          kind: 'alert',
          row: row(DAY, 'failure', {
            check: 'revenue_matches',
            reason: 'mismatch',
            value: 50,
            detail: {
              currencies: [
                { currency: 'EUR', summary: 7600, site: 3800 },
                { currency: 'PLN', summary: 10000, site: 10000 },
              ],
            },
          }),
          episode: DAY,
        },
      ],
      context,
      '2026-11-25T03:35:00.000Z'
    );
    expect(notice.lines[0]?.value).toEqual({
      ru: '24 ноября в сводке 76,00 EUR, на сайте 38,00 EUR',
      en: '24 November — 76.00 EUR in the summary, 38.00 EUR on the site',
      de: '24. November — 76,00 EUR laut Zusammenfassung, 38,00 EUR auf der Website',
    });
  });
});

describe('поправка встроенной проверки', () => {
  const correction = (
    input: Record<string, unknown>,
    check = 'events_arrived'
  ) => checkCorrection(input, null, check, `Check ${check}`);

  it('только свои пороги в пределах, без названия; «мало данных» — без «включена» и «уведомлять»', () => {
    expect(
      correction({ params: { missing: 2 }, notify: 'any', enabled: false })
    ).toEqual({
      code: 'events_arrived',
      name: '',
      enabled: false,
      notify: 'any',
      params: { missing: 2 },
      archivedAt: null,
    });
    expect(code(() => correction({ params: { share: 5 } }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(() => correction({ params: { missing: -1 } }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(() => correction({ params: { missing: 1.5 } }))).toBe(
      'analytics.invalid_item'
    );
    expect(
      correction({ params: { tolerance: 0.5 } }, 'revenue_matches').params
    ).toEqual({ tolerance: 0.5 });
    expect(
      code(() => correction({ params: { tolerance: 0.55 } }, 'revenue_matches'))
    ).toBe('analytics.invalid_item');
    expect(code(() => correction({ name: 'Моя' }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(() => correction({ notify: 'sometimes' }))).toBe(
      'analytics.invalid_item'
    );
    expect(
      correction({ params: { people: 5, customers: 2 } }, 'low_data').params
    ).toEqual({ people: 5, customers: 2 });
    expect(code(() => correction({ enabled: false }, 'low_data'))).toBe(
      'analytics.invalid_item'
    );
    expect(code(() => correction({ notify: 'any' }, 'low_data'))).toBe(
      'analytics.invalid_item'
    );
    expect(code(() => correction({ params: { people: 0 } }, 'low_data'))).toBe(
      'analytics.invalid_item'
    );
    expect(code(() => correction({}, 'my_check'))).toBe(
      'analytics.invalid_item'
    );
  });

  it('действующие пороги — поправка поверх значений ядра; «Курс есть» по умолчанию уведомляет и о замечании', () => {
    const configs = checkConfigs({
      ...EMPTY_SETUP,
      checks: [
        {
          code: 'labels_readable',
          name: '',
          note: '',
          enabled: true,
          notify: 'any',
          params: { share: 20 },
          archivedAt: null,
        },
      ],
    });
    expect(
      configs.find((_) => _.spec.code === 'labels_readable')
    ).toMatchObject({ notify: 'any', params: { share: 20, min: 10 } });
    expect(configs.find((_) => _.spec.code === 'rate_present')?.notify).toBe(
      'any'
    );
    expect(configs.find((_) => _.spec.code === 'low_data')?.params).toEqual({
      people: 30,
      customers: 10,
    });
  });
});

describe('месячная проверка', () => {
  it('срок месяца — 5-е число следующего в 06:05 пояса: до него последний наступивший — позапрошлый месяц', () => {
    expect(dueAt('month', '2026-10-01', null, 'Europe/Berlin')).toBe(
      '2026-11-05T05:05:00.000Z'
    );
    expect(
      lastDue('month', '2026-11-05T05:04:59.999Z', null, 'Europe/Berlin')
    ).toBe('2026-09-01');
    expect(
      lastDue('month', '2026-11-05T05:05:00.000Z', null, 'Europe/Berlin')
    ).toBe('2026-10-01');
    // Январь: прошлый месяц — декабрь прошлого года.
    expect(lastDue('month', '2027-01-20T12:00:00.000Z', null, 'UTC')).toBe(
      '2026-12-01'
    );
    expect(clockOf(EMPTY_SETUP, 'statement_matches')).toBe('month');
  });

  it('эпизод месячной идёт по месяцам: нет выписки за октябрь и ноябрь — одно уведомление и напоминание', () => {
    const month = (day: string, extra: Partial<CheckDay> = {}): CheckDay => ({
      ...row(day, 'warning'),
      check: 'statement_matches',
      scope: '',
      reason: 'no_statement',
      value: null,
      ...extra,
    });
    expect(
      decide(
        [month('2026-10-01')],
        '2026-10-01',
        'any',
        '2026-11-05T05:05:00.000Z',
        'month'
      )
    ).toMatchObject({ kind: 'alert', episode: '2026-10-01' });
    const notified = month('2026-10-01', {
      notifiedAt: '2026-11-05T05:05:00.000Z',
      episode: '2026-10-01',
    });
    // Ноябрь продолжает эпизод октября: не новое уведомление, а напоминание раз в 7 суток.
    expect(
      decide(
        [notified, month('2026-11-01')],
        '2026-11-01',
        'any',
        '2026-12-05T05:05:00.000Z',
        'month'
      )
    ).toMatchObject({ kind: 'remind', episode: '2026-10-01' });
    // Строка D* месячной — та же весь месяц: напоминание — ею же, через 7 суток после уведомления.
    const november = month('2026-11-01', {
      notifiedAt: '2026-12-05T05:05:00.000Z',
      episode: '2026-11-01',
    });
    expect(
      decide(
        [month('2026-10-01', { state: 'ok', reason: null }), november],
        '2026-11-01',
        'any',
        '2026-12-12T05:04:00.000Z',
        'month'
      )
    ).toBeNull();
    expect(
      decide(
        [month('2026-10-01', { state: 'ok', reason: null }), november],
        '2026-11-01',
        'any',
        '2026-12-12T05:05:00.000Z',
        'month'
      )
    ).toMatchObject({ kind: 'remind', row: { day: '2026-11-01' } });
    // По суткам ноябрь не продолжал бы октябрь.
    expect(
      decide(
        [notified, month('2026-11-01')],
        '2026-11-01',
        'any',
        '2026-12-05T05:05:00.000Z'
      )
    ).toMatchObject({ kind: 'alert', episode: '2026-11-01' });
  });
});

describe('счёт отправителя', () => {
  // Человек: пробный период 1 октября, оплаты 1 октября, 2 и 24 ноября, возврат 10 ноября; 24-го — возвращение.
  const PERSON: Pick<
    PersonFacts,
    'money' | 'firstPaidAt' | 'trialAt' | 'returns'
  > = {
    money: [
      ['2026-10-01T10:00:00.000Z', 'EUR', 1900],
      ['2026-11-02T10:00:00.000Z', 'EUR', 1900],
      ['2026-11-10T10:00:00.000Z', 'EUR', -1900, '2026-11-02T10:00:00.000Z'],
      ['2026-11-24T09:02:00.000Z', 'EUR', 1900],
    ],
    firstPaidAt: '2026-10-01T10:00:00.000Z',
    trialAt: '2026-10-01T09:00:00.000Z',
    returns: [{ at: '2026-11-24T09:02:00.000Z', touch: null, parts: {} }],
  };

  it('факты оплаты: номер — по оплатам человека, возврат не в счёт; не свёрнутая оплата — сверять нечего', () => {
    expect(paymentFacts(PERSON, '2026-11-24T09:02:00.000Z', 0)).toEqual({
      number: 3,
      customerSince: '2026-10-01',
      afterTrial: true,
      returning: true,
    });
    expect(paymentFacts(PERSON, '2026-10-01T10:00:00.000Z', 0)).toMatchObject({
      number: 1,
      returning: false,
    });
    // Две оплаты в один момент: вторая по приёму — следующий номер.
    expect(paymentFacts(PERSON, '2026-11-02T10:00:00.000Z', 1)?.number).toBe(3);
    expect(paymentFacts(PERSON, '2026-11-25T10:00:00.000Z', 0)).toBeNull();
    expect(
      paymentFacts(
        { ...PERSON, trialAt: '2026-11-25T00:00:00.000Z' },
        '2026-11-24T09:02:00.000Z',
        0
      )?.afterTrial
    ).toBe(false);
  });

  it('purchase_n: 2 у третьей оплаты — одна не сошлась: замечание; дата первой оплаты — сутками UTC; без значений — не в счёт', () => {
    const third = paymentFacts(PERSON, '2026-11-24T09:02:00.000Z', 0);
    const result = senderFacts(
      [
        {
          sent: {
            payment_number: 2,
            customer_since: '2026-10-01T23:30:00+02:00',
            after_trial: true,
            returning: true,
          },
          facts: third,
        },
        {
          sent: { payment_number: 1, customer_since: '2026-10-01' },
          facts: paymentFacts(PERSON, '2026-10-01T10:00:00.000Z', 0),
        },
        { sent: {}, facts: third },
        { sent: { payment_number: 9 }, facts: null },
      ],
      PARAMS('sender_facts')
    );
    expect(shape(result)).toEqual(['warning', 'mismatch', 1]);
    // Подробности — счёт по отметкам, без присланных значений.
    expect(result.detail).toEqual({
      checked: 2,
      mismatched: 1,
      marks: {
        payment_number: { checked: 2, mismatched: 1 },
        customer_since: { checked: 2, mismatched: 0 },
        after_trial: { checked: 1, mismatched: 0 },
        returning: { checked: 1, mismatched: 0 },
      },
    });
    expect(
      shape(
        senderFacts([{ sent: { payment_number: '3' }, facts: third }], {
          count: 1,
        })
      )
    ).toEqual(['ok', null, 1]);
    expect(
      shape(
        senderFacts(
          [{ sent: { after_trial: 'yes', returning: false }, facts: third }],
          PARAMS('sender_facts')
        )
      )
    ).toEqual(['warning', 'mismatch', 1]);
    expect(shape(senderFacts([], PARAMS('sender_facts')))).toEqual([
      'ok',
      null,
      0,
    ]);
  });
});

describe('сверка с выпиской', () => {
  const statement = (
    currency: string,
    amount: number,
    fees: Statement['fees'] = 'gross'
  ): Statement => ({
    month: '2026-10',
    currency,
    amount,
    fees,
    note: '',
    author: null,
    updatedAt: '2026-11-03T10:00:00.000Z',
  });
  const SITE: Readonly<Record<string, number>> = { EUR: 123_800, PLN: 38_000 };

  it('выписка EUR 1 250.00 и сайт 1 238.00 — 0,96 % в порядке; PLN 400.00 и 380.00 — 5 %, сбой; выписки нет — замечание', () => {
    expect(
      shape(
        statementMatches(
          [statement('EUR', 125_000)],
          (_) => SITE[_.currency] ?? 0,
          PARAMS('statement_matches')
        )
      )
    ).toEqual(['ok', null, 0]);
    const both = statementMatches(
      [statement('EUR', 125_000), statement('PLN', 40_000)],
      (_) => SITE[_.currency] ?? 0,
      PARAMS('statement_matches')
    );
    expect(shape(both)).toEqual(['failure', 'mismatch', 5]);
    expect(both.detail).toEqual({
      currencies: [
        {
          currency: 'EUR',
          fees: 'gross',
          statement: 125_000,
          site: 123_800,
          share: 1,
        },
        {
          currency: 'PLN',
          fees: 'gross',
          statement: 40_000,
          site: 38_000,
          share: 5,
        },
      ],
      tolerance: 1,
    });
    expect(
      shape(
        statementMatches(
          [statement('PLN', 40_000)],
          (_) => SITE[_.currency] ?? 0,
          { tolerance: 5 }
        )
      )
    ).toEqual(['ok', null, 0]);
    expect(
      shape(statementMatches([], () => 0, PARAMS('statement_matches')))
    ).toEqual(['warning', 'no_statement', null]);
    // До или после комиссии — у выписки: сайт считает так же.
    expect(
      statementMatches(
        [statement('EUR', 120_000, 'net')],
        (_) => (_.fees === 'net' ? 120_000 : 0),
        PARAMS('statement_matches')
      ).state
    ).toBe('ok');
  });

  it('по умолчанию выключена и уведомляет и о замечании: напоминание ввести выписку', () => {
    expect(
      checkConfigs(EMPTY_SETUP).find((_) => _.spec.code === 'statement_matches')
    ).toMatchObject({
      enabled: false,
      notify: 'any',
      params: { tolerance: 1 },
    });
    expect(
      checkConfigs({
        ...EMPTY_SETUP,
        checks: [
          {
            code: 'statement_matches',
            name: '',
            note: '',
            enabled: true,
            notify: 'any',
            params: {},
            archivedAt: null,
          },
        ],
      }).find((_) => _.spec.code === 'statement_matches')?.enabled
    ).toBe(true);
  });
});

describe('своя пороговая', () => {
  const RULE: ThresholdRule = {
    metric: 'role',
    sender: null,
    type: null,
    role: 'payment',
    goal: null,
    currency: null,
    compare: 'lt',
    threshold: 1,
    days: 1,
    severity: 'warning',
  };
  const CUSTOM: QualityCheck = {
    code: 'paid_daily',
    name: 'Оплаты за сутки',
    note: '',
    enabled: true,
    notify: 'any',
    params: RULE,
    archivedAt: null,
  };

  it('«оплат за сутки меньше одной»: 0 — замечание, 1 — в порядке; gt на пороге — в порядке, выше — сбой по важности', () => {
    expect(shape(thresholdCheck(RULE, { value: 0 }, DAY))).toEqual([
      'warning',
      'below',
      0,
    ]);
    expect(shape(thresholdCheck(RULE, { value: 1 }, DAY))).toEqual([
      'ok',
      null,
      1,
    ]);
    const above: ThresholdRule = {
      ...RULE,
      metric: 'people',
      role: null,
      compare: 'gt',
      threshold: 20,
      severity: 'failure',
    };
    expect(shape(thresholdCheck(above, { value: 20 }, DAY))).toEqual([
      'ok',
      null,
      20,
    ]);
    expect(shape(thresholdCheck(above, { value: 21 }, DAY))).toEqual([
      'failure',
      'above',
      21,
    ]);
    expect(shape(thresholdCheck(RULE, { reason: 'stats_off' }, DAY))).toEqual([
      'no_data',
      'stats_off',
      null,
    ]);
    // В подробностях — правило и период, у выручки — валюта для денег в уведомлении.
    expect(
      thresholdCheck(
        { ...RULE, metric: 'revenue', role: null, currency: 'EUR', days: 7 },
        { value: 12_000 },
        DAY
      ).detail
    ).toEqual({
      metric: 'revenue',
      compare: 'lt',
      threshold: 1,
      days: 7,
      from: '2026-11-18',
      currency: 'EUR',
    });
  });

  it('период — 1, 7 или 30 суток пояса, кончая сутками проверки', () => {
    expect(ruleFrom(RULE, DAY)).toBe(DAY);
    expect(ruleFrom({ ...RULE, days: 7 }, DAY)).toBe('2026-11-18');
    expect(ruleFrom({ ...RULE, days: 30 }, DAY)).toBe('2026-10-26');
  });

  it('своя — после встроенных, сутки пояса, строка сайта; в архиве и выключенная — не по расписанию', () => {
    const setup: Setup = {
      ...EMPTY_SETUP,
      checks: [
        CUSTOM,
        { ...CUSTOM, code: 'old_rule', archivedAt: '2026-11-01T00:00:00.000Z' },
        { ...CUSTOM, code: 'quiet', enabled: false },
      ],
    };
    const custom = checkConfigs(setup).filter((_) => _.rule !== null);
    expect(
      custom.map((_) => [_.spec.code, _.spec.clock, _.spec.scope, _.enabled])
    ).toEqual([
      ['paid_daily', 'report', 'site', true],
      ['old_rule', 'report', 'site', false],
      ['quiet', 'report', 'site', false],
    ]);
    expect(custom[0]).toMatchObject({ notify: 'any', rule: RULE, params: {} });
    expect(clockOf(setup, 'paid_daily')).toBe('report');
    expect(clockOf(setup, 'nope')).toBeNull();
    expect(checkOrder('paid_daily')).toBeGreaterThan(checkOrder('low_data'));
  });
});

describe('пороги «мало данных»', () => {
  it('ядра — 30 и 10; поправка low_data — поверх, не заданный порог — ядра', () => {
    expect(lowDataOf([])).toEqual({ people: 30, customers: 10 });
    expect(
      lowDataOf([
        {
          code: 'low_data',
          name: '',
          note: '',
          enabled: true,
          notify: 'off',
          params: { people: 5 },
          archivedAt: null,
        },
      ])
    ).toEqual({ people: 5, customers: 10 });
  });
});

describe('сообщение о новых проверках', () => {
  const context = {
    sender: (code: string) => `Бот (${code})`,
    type: () => null,
    summaryAt: () => '03:30',
    clock: (check: string) =>
      check === 'statement_matches'
        ? ('month' as const)
        : check === 'sender_facts'
          ? ('utc' as const)
          : ('report' as const),
    check: (check: string) =>
      check === 'paid_daily' || check === 'revenue_week'
        ? { paid_daily: 'Оплаты за сутки', revenue_week: 'Выручка недели' }[
            check
          ]
        : null,
    zone: 'Europe/Berlin',
  };
  const AT = '2026-11-25T05:05:00.000Z';
  const alert = (extra: Partial<CheckDay>) => ({
    kind: 'alert' as const,
    row: row(DAY, 'warning', { scope: '', ...extra }),
    episode: (extra.day ?? DAY) as string,
  });

  it('своя: заголовок и строка — с её названием, периодом, поясом и порогом на трёх языках; выручка — деньгами', () => {
    const notice = qualityNotice(
      [
        alert({
          check: 'paid_daily',
          reason: 'below',
          value: 0,
          detail: {
            metric: 'role',
            compare: 'lt',
            threshold: 1,
            days: 1,
            from: DAY,
            currency: null,
          },
        }),
      ],
      context,
      AT
    );
    expect(notice.title).toEqual({
      ru: 'Качество данных: сработала проверка «Оплаты за сутки»',
      en: 'Data quality: the check “Оплаты за сутки” fired',
      de: 'Datenqualität: die Prüfung „Оплаты за сутки“ hat angeschlagen',
    });
    expect(notice.lines).toEqual([
      {
        label: {
          ru: 'Оплаты за сутки',
          en: 'Оплаты за сутки',
          de: 'Оплаты за сутки',
        },
        value: {
          ru: 'за 24 ноября (Europe/Berlin) — 0, порог: меньше 1',
          en: '24 November (Europe/Berlin) — 0, threshold: below 1',
          de: '24. November (Europe/Berlin) — 0, Schwelle: unter 1',
        },
      },
    ]);
    expect(
      qualityNotice(
        [
          alert({
            check: 'revenue_week',
            reason: 'below',
            value: 12_000,
            detail: {
              metric: 'revenue',
              compare: 'lt',
              threshold: 50_000,
              days: 7,
              from: '2026-11-18',
              currency: 'EUR',
            },
          }),
        ],
        context,
        AT
      ).lines[0]?.value.ru
    ).toBe(
      'за 18–24 ноября (Europe/Berlin) — 120,00 EUR, порог: меньше 500,00 EUR'
    );
  });

  it('выписка — месяцем с годом: нет выписки и расхождение по валютам; счёт отправителя — числами', () => {
    const missing = qualityNotice(
      [
        alert({
          check: 'statement_matches',
          day: '2026-10-01',
          reason: 'no_statement',
          value: null,
        }),
      ],
      context,
      AT
    );
    expect(missing.title.ru).toBe('Качество данных: нет выписки за месяц');
    expect(missing.lines[0]?.value).toEqual({
      ru: 'выписки за октябрь 2026 г. нет — внесите её: «Статистика → Качество → Выписки»',
      en: 'no statement for October 2026 — enter it: Statistics → Quality → Statements',
      de: 'kein Kontoauszug für Oktober 2026 — tragen Sie ihn ein: Statistik → Qualität → Auszüge',
    });
    expect(
      qualityNotice(
        [
          alert({
            check: 'statement_matches',
            day: '2026-10-01',
            state: 'failure',
            reason: 'mismatch',
            value: 5,
            detail: {
              currencies: [
                {
                  currency: 'EUR',
                  fees: 'gross',
                  statement: 125_000,
                  site: 123_800,
                  share: 1,
                },
                {
                  currency: 'PLN',
                  fees: 'gross',
                  statement: 40_000,
                  site: 38_000,
                  share: 5,
                },
              ],
              tolerance: 1,
            },
          }),
        ],
        context,
        AT
      ).lines[0]?.value.ru
    ).toBe(
      'за октябрь 2026 г.: PLN — по выписке 400,00 PLN, на сайте 380,00 PLN (5 %)'
    );
    expect(
      qualityNotice(
        [
          alert({
            check: 'sender_facts',
            scope: 'bot',
            reason: 'mismatch',
            value: 1,
            detail: { checked: 3, mismatched: 1, marks: {} },
          }),
        ],
        context,
        AT
      ).lines[0]
    ).toEqual({
      label: {
        ru: 'Счёт отправителя · Бот (bot)',
        en: 'Sender’s own count · Бот (bot)',
        de: 'Zählung des Absenders · Бот (bot)',
      },
      value: {
        ru: 'за 24 ноября (UTC) оплат, чьи свойства сверки не сошлись со счётом сайта: 1 из 3',
        en: 'payments for 24 November (UTC) whose properties for reconciling do not match the count of the site: 1 of 3',
        de: 'Zahlungen am 24. November (UTC), deren Abgleich-Eigenschaften nicht zur Zählung der Website passen: 1 von 3',
      },
    });
  });
});
