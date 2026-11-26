import { describe, expect, it } from 'bun:test';
import {
  type AccessSpan,
  accessAt,
  accessIn,
  acquisitionOf,
  firstQuestion,
  foldPerson,
  type HistoryEvent,
  milestoneStateOf,
  type Person,
  stateOf,
} from './person.ts';
import { applySet, EMPTY_SETUP, readSet, type Setup } from './setup.ts';

// Бот продаёт подписку, магазин — разовые заказы; язык — признак человека, тариф — свойство оплаты.
const SETUP: Setup = applySet(
  readSet({
    format: 'eile-analytics-set',
    version: 1,
    name: 'Бот и магазин',
    senders: [
      { code: 'bot', name: 'Бот' },
      { code: 'shop', name: 'Магазин' },
    ],
    dictionaries: [
      {
        code: 'plan',
        name: 'Тариф',
        purpose: 'values',
        values: [{ code: '1m', name: '1 месяц' }],
      },
      {
        code: 'lang',
        name: 'Язык',
        purpose: 'values',
        values: [
          { code: 'ru', name: 'Русский' },
          { code: 'pl', name: 'Polski' },
        ],
      },
      {
        code: 'heard_from',
        name: 'Откуда узнали',
        purpose: 'answers',
        values: [{ code: 'friend', name: 'Знакомые' }],
      },
    ],
    properties: [
      {
        scope: 'event',
        code: 'plan',
        name: 'Тариф',
        kind: 'choice',
        dictionary: 'plan',
      },
      {
        scope: 'person',
        code: 'lang',
        name: 'Язык',
        kind: 'choice',
        dictionary: 'lang',
      },
      { scope: 'person', code: 'age', name: 'Возраст', kind: 'number' },
    ],
    types: [
      { sender: 'bot', code: 'start', name: 'Старт', role: 'touch' },
      { sender: 'bot', code: 'survey', name: 'Опрос', role: 'survey' },
      { sender: 'bot', code: 'trial', name: 'Пробный', role: 'trial' },
      { sender: 'bot', code: 'paid', name: 'Оплата', role: 'payment' },
      { sender: 'bot', code: 'refund', name: 'Возврат', role: 'refund' },
      { sender: 'bot', code: 'fee', name: 'Комиссия', role: 'amendment' },
      { sender: 'bot', code: 'ended', name: 'Конец', role: 'lapse' },
      { sender: 'bot', code: 'task', name: 'Задание', role: 'action' },
      { sender: 'bot', code: 'day', name: 'Сводка', role: 'summary' },
      { sender: 'shop', code: 'order', name: 'Заказ', role: 'payment' },
    ],
  })
)(EMPTY_SETUP).state;

const SUBJECT = 'u_3b9e0c7a1f';

type Extra = Readonly<Record<string, unknown>>;

/** Событие истории: `seq` — порядок приёма, `at` — время события. */
const event = (
  seq: number,
  type: string,
  at: string,
  data: Extra = {},
  extra: Extra & { readonly sender?: string; readonly test?: boolean } = {}
): HistoryEvent => ({
  seq,
  sender: extra.sender ?? 'bot',
  type,
  at,
  test: extra.test === true,
  body: {
    id: `evt_${seq}`,
    type,
    at,
    subject: SUBJECT,
    data,
    ...Object.fromEntries(
      Object.entries(extra).filter(({ 0: key }) => key !== 'sender')
    ),
  },
});

const fold = (events: readonly HistoryEvent[], setup = SETUP): Person =>
  foldPerson(setup)(SUBJECT, events) as Person;

// Пришли в другом порядке: номер приёма — по новому порядку, время события — прежнее.
const arrived = (events: readonly HistoryEvent[]): HistoryEvent[] =>
  events.map((_, index) => ({ ..._, seq: index + 1 }));

const permutations = <T>(items: readonly T[]): T[][] =>
  items.length <= 1
    ? [[...items]]
    : items.flatMap((item, index) =>
        permutations(items.filter((_, other) => other !== index)).map(
          (rest) => [item, ...rest]
        )
      );

const PAID = { amount: '9.90', currency: 'EUR', plan: '1m' };

describe('свёртка человека', () => {
  it('история в любом порядке прихода даёт одного и того же человека', () => {
    const history = [
      event(
        1,
        'start',
        '2027-01-01T10:00:00.000Z',
        { label: 'post__blog' },
        {
          traits: { lang: 'ru' },
        }
      ),
      event(2, 'survey', '2027-01-01T10:05:00.000Z', {
        question: 'heard_from',
        answer: 'friend',
        text: 'подруга',
      }),
      event(3, 'trial', '2027-01-02T10:00:00.000Z', {
        ends_at: '2027-01-09T10:00:00Z',
      }),
      event(4, 'fee', '2027-01-09T11:00:00.000Z', {
        payment_id: 'pi_1',
        fee: '0.50',
      }),
      event(5, 'paid', '2027-01-09T10:00:00.000Z', {
        ...PAID,
        payment_id: 'pi_1',
        fee: '0.40',
        paid_until: '2027-02-09T10:00:00Z',
      }),
      event(
        6,
        'start',
        '2027-03-01T10:00:00.000Z',
        { label: 'ad__winter' },
        {
          traits: { lang: 'pl' },
          last_touch: { label: 'site__search', at: '2027-03-01T09:00:00Z' },
        }
      ),
    ];
    const expected = fold(history);
    expect(expected).toMatchObject({
      subject: SUBJECT,
      test: false,
      senders: ['bot'],
      firstAt: '2027-01-01T10:00:00.000Z',
      lastAt: '2027-03-01T10:00:00.000Z',
      events: 6,
      invalid: 0,
      firstTouch: { label: 'post__blog', at: '2027-01-01T10:00:00.000Z' },
      lastTouch: { label: 'ad__winter', at: '2027-03-01T10:00:00.000Z' },
      answers: {
        heard_from: {
          answer: 'friend',
          text: 'подруга',
          at: '2027-01-01T10:05:00.000Z',
        },
      },
      trialAt: '2027-01-02T10:00:00.000Z',
      trialEndsAt: '2027-01-09T10:00:00.000Z',
      payments: 1,
      paidUntil: '2027-02-09T10:00:00.000Z',
      revenue: { EUR: 990 },
      fees: { EUR: 50 },
      traits: { lang: 'pl' },
    });
    const all = permutations(history);
    expect(all).toHaveLength(720);
    all.forEach((_) => void expect(fold(arrived(_))).toEqual(expected));
  });

  it('первое касание от отправителя: first_touch самого раннего события, касания событиями его не заменяют', () => {
    const person = fold([
      event(1, 'start', '2027-01-01T08:00:00.000Z', { label: 'bio__tg' }),
      event(
        2,
        'task',
        '2027-01-03T10:00:00.000Z',
        {},
        {
          first_touch: { label: 'later__event', at: '2026-12-01T09:00:00Z' },
        }
      ),
      event(3, 'paid', '2027-01-02T10:00:00.000Z', PAID, {
        first_touch: {
          label: 'post__blog__organic',
          at: '2026-12-31T09:00:00+01:00',
        },
      }),
    ]);
    expect(person.firstTouch).toEqual({
      label: 'post__blog__organic',
      at: '2026-12-31T08:00:00.000Z',
      sender: 'bot',
    });
    expect(person.firstTouchConflict).toBe(true);
    expect(person.lastTouch).toEqual({
      label: 'bio__tg',
      at: '2027-01-01T08:00:00.000Z',
      sender: 'bot',
    });
  });

  it('первое касание из событий: без first_touch — самое раннее событие-касание', () => {
    const person = fold([
      event(1, 'start', '2027-01-05T08:00:00.000Z', { label: 'second' }),
      event(2, 'start', '2027-01-01T08:00:00.000Z', {}),
      event(3, 'task', '2026-12-01T08:00:00.000Z'),
    ]);
    expect(person.firstTouch).toEqual({
      label: '',
      at: '2027-01-01T08:00:00.000Z',
      sender: 'bot',
    });
    expect(person.firstTouchConflict).toBe(false);
    expect(person.lastTouch).toEqual({
      label: 'second',
      at: '2027-01-05T08:00:00.000Z',
      sender: 'bot',
    });
    expect(fold([event(1, 'task', '2027-01-01T08:00:00.000Z')])).toMatchObject({
      firstTouch: null,
      lastTouch: null,
    });
  });

  it('тот же first_touch в разных событиях — не конфликт', () => {
    const touch = { label: 'post__blog', at: '2026-12-31T09:00:00Z' };
    expect(
      fold([
        event(
          1,
          'start',
          '2027-01-01T08:00:00.000Z',
          {},
          { first_touch: touch }
        ),
        event(2, 'paid', '2027-01-02T08:00:00.000Z', PAID, {
          first_touch: { ...touch, at: '2026-12-31T10:00:00+01:00' },
        }),
      ]).firstTouchConflict
    ).toBe(false);
  });

  it('последнее касание — самое позднее из касаний и присланных last_touch', () => {
    expect(
      fold([
        event(1, 'start', '2027-01-01T08:00:00.000Z', { label: 'first' }),
        event(
          2,
          'task',
          '2027-01-02T08:00:00.000Z',
          {},
          {
            last_touch: { label: 'retarget', at: '2027-01-02T07:00:00Z' },
          }
        ),
        event(
          3,
          'task',
          '2027-01-03T08:00:00.000Z',
          {},
          {
            last_touch: { label: 'old', at: '2026-12-01T07:00:00Z' },
          }
        ),
      ]).lastTouch
    ).toEqual({
      label: 'retarget',
      at: '2027-01-02T07:00:00.000Z',
      sender: 'bot',
    });
  });

  it('валюты с разным числом знаков — в минимальных единицах, без пересчёта', () => {
    const person = fold([
      event(1, 'paid', '2027-01-01T08:00:00.000Z', { ...PAID, amount: '109' }),
      event(2, 'paid', '2027-01-02T08:00:00.000Z', {
        ...PAID,
        amount: 109.5,
      }),
      event(3, 'paid', '2027-01-03T08:00:00.000Z', {
        ...PAID,
        amount: '1500',
        currency: 'JPY',
        fee: '45',
      }),
      event(
        4,
        'order',
        '2027-01-04T08:00:00.000Z',
        {
          amount: '12.125',
          currency: 'KWD',
        },
        { sender: 'shop' }
      ),
    ]);
    expect(person).toMatchObject({
      senders: ['bot', 'shop'],
      payments: 4,
      revenue: { EUR: 21_850, JPY: 1500, KWD: 12_125 },
      fees: { JPY: 45 },
      firstPaidAt: '2027-01-01T08:00:00.000Z',
      lastPaidAt: '2027-01-04T08:00:00.000Z',
    });
  });

  it('уточнение комиссии раньше своей оплаты уточняет её; валюта — оплаты', () => {
    const person = fold([
      event(1, 'fee', '2027-01-01T07:00:00.000Z', {
        payment_id: 'pi_1',
        fee: '120',
      }),
      event(2, 'paid', '2027-01-01T08:00:00.000Z', {
        ...PAID,
        amount: '1500',
        currency: 'JPY',
        payment_id: 'pi_1',
        fee: '100',
      }),
      event(3, 'paid', '2027-01-02T08:00:00.000Z', {
        ...PAID,
        payment_id: 'pi_2',
        fee: '0.30',
      }),
      event(4, 'fee', '2027-01-02T09:00:00.000Z', {
        payment_id: 'pi_2',
        fee: '0.35',
      }),
      event(5, 'fee', '2027-01-02T10:00:00.000Z', {
        payment_id: 'pi_2',
        fee: '0.32',
      }),
    ]);
    expect(person.fees).toEqual({ JPY: 120, EUR: 32 });
    expect(person.unmatched).toBe(0);
    expect(person.invalid).toBe(0);
  });

  it('уточнение, которое не перевести в валюту оплаты, нарушает роль; своя комиссия оплаты остаётся', () => {
    const person = fold([
      event(1, 'paid', '2027-01-01T08:00:00.000Z', {
        ...PAID,
        amount: '1500',
        currency: 'JPY',
        payment_id: 'pi_1',
        fee: '100',
      }),
      event(2, 'fee', '2027-01-01T09:00:00.000Z', {
        payment_id: 'pi_1',
        fee: '3.20',
      }),
    ]);
    expect(person.fees).toEqual({ JPY: 100 });
    expect(person.invalid).toBe(1);
  });

  it('возврат и уточнение без своей оплаты — по валюте события и с отметкой', () => {
    const person = fold([
      event(1, 'paid', '2027-01-01T08:00:00.000Z', {
        ...PAID,
        payment_id: 'pi_1',
      }),
      event(2, 'refund', '2027-01-02T08:00:00.000Z', {
        amount: '9.90',
        currency: 'EUR',
        payment_id: 'pi_1',
      }),
      event(3, 'refund', '2027-01-03T08:00:00.000Z', {
        amount: '5',
        currency: 'PLN',
        payment_id: 'pi_lost',
      }),
      event(4, 'fee', '2027-01-03T09:00:00.000Z', {
        payment_id: 'pi_lost',
        fee: '0.10',
        currency: 'PLN',
      }),
      event(5, 'fee', '2027-01-03T10:00:00.000Z', {
        payment_id: 'pi_gone',
        fee: '0.10',
      }),
    ]);
    expect(person.revenue).toEqual({ EUR: 0, PLN: -500 });
    expect(person.fees).toEqual({ PLN: 10 });
    expect(person.unmatched).toBe(2);
    // Уточнение без оплаты и без валюты некуда отнести.
    expect(person.invalid).toBe(1);
  });

  it('признаки — по времени события: опоздавшее старое событие не перетирает новое значение', () => {
    const person = fold([
      event(
        1,
        'task',
        '2027-01-05T08:00:00.000Z',
        {},
        {
          traits: { lang: 'pl', age: 31 },
        }
      ),
      event(
        2,
        'task',
        '2027-01-01T08:00:00.000Z',
        {},
        {
          traits: { lang: 'ru', age: 30, vip: true },
        }
      ),
      event(
        3,
        'task',
        '2027-01-06T08:00:00.000Z',
        {},
        {
          traits: { lang: 'RU', age: null },
        }
      ),
      event(
        4,
        'task',
        '2027-01-07T08:00:00.000Z',
        {},
        {
          traits: { age: 'тридцать два' },
        }
      ),
    ]);
    // Негодное по виду значение и null ничего не меняют; необъявленный признак в человека не идёт.
    expect(person.traits).toEqual({ lang: 'pl', age: 31 });
    expect(
      fold([
        event(
          1,
          'task',
          '2027-01-05T08:00:00.000Z',
          {},
          {
            traits: { lang: 'de' },
          }
        ),
      ]).traits
    ).toEqual({ lang: 'de' });
  });

  it('ответ опроса — последний на каждый вопрос, вопросы и ответы вне справочника тоже', () => {
    expect(
      fold([
        event(1, 'survey', '2027-01-02T08:00:00.000Z', {
          question: 'heard_from',
          answer: 'friend',
        }),
        event(2, 'survey', '2027-01-01T08:00:00.000Z', {
          question: 'heard_from',
          answer: 'search',
          text: 'нашла сама',
        }),
        event(3, 'survey', '2027-01-03T08:00:00.000Z', {
          question: 'why',
          answer: 'price',
        }),
      ]).answers
    ).toEqual({
      heard_from: {
        answer: 'friend',
        text: null,
        at: '2027-01-02T08:00:00.000Z',
      },
      why: { answer: 'price', text: null, at: '2027-01-03T08:00:00.000Z' },
    });
  });

  it('тестовые события в человека не идут; человек из одних тестовых — помечен', () => {
    const real = event(1, 'start', '2027-01-01T08:00:00.000Z', { label: 'a' });
    const trial = event(2, 'paid', '2027-01-02T08:00:00.000Z', PAID, {
      test: true,
    });
    expect(fold([real, trial])).toMatchObject({
      test: false,
      events: 1,
      payments: 0,
    });
    expect(fold([trial])).toMatchObject({
      test: true,
      events: 1,
      payments: 1,
    });
    expect(foldPerson(SETUP)(SUBJECT, [])).toBeNull();
  });

  it('событие, нарушающее роль, считается в invalid, а касания и признаки конверта даёт', () => {
    const changed: Setup = {
      ...SETUP,
      types: SETUP.types.map((_) =>
        _.code === 'task' ? { ..._, role: 'payment' as const } : _
      ),
    };
    const history = [
      event(
        1,
        'task',
        '2027-01-01T08:00:00.000Z',
        { items_n: 3 },
        {
          traits: { lang: 'ru' },
          first_touch: { label: 'post', at: '2026-12-31T08:00:00Z' },
        }
      ),
      event(2, 'day', '2027-01-02T08:00:00.000Z', {
        day: '2027-01-02',
        counts: {},
      }),
      event(3, 'gift', '2027-01-03T08:00:00.000Z', { amount: '5' }),
    ];
    expect(fold(history, changed)).toMatchObject({
      events: 3,
      invalid: 2,
      payments: 0,
      traits: { lang: 'ru' },
      firstTouch: { label: 'post', at: '2026-12-31T08:00:00.000Z' },
    });
    expect(fold(history).invalid).toBe(1);
  });
});

describe('состояние человека', () => {
  const at = (day: string) => `2027-${day}T10:00:00.000Z`;
  const state = (events: readonly HistoryEvent[], now: string) =>
    stateOf(fold(events), now);
  const start = event(1, 'start', at('01-01'));
  const trial = event(2, 'trial', at('01-02'), { ends_at: at('01-09') });
  const paid = (seq: number, day: string, until: string | null = null) =>
    event(seq, 'paid', at(day), {
      ...PAID,
      payment_id: `pi_${seq}`,
      ...(until === null ? {} : { paid_until: at(until) }),
    });
  const ended = (seq: number, day: string) => event(seq, 'ended', at(day));

  it('новый — ни оплат, ни пробного периода', () => {
    expect(state([start], at('02-01'))).toBe('new');
  });

  it('пробный период — и истёкший тоже, пока нет оплат', () => {
    expect(state([start, trial], at('01-03'))).toBe('trial');
    expect(state([start, trial], at('06-01'))).toBe('trial');
    // «Конец доступа» пробного периода — не уход: оплат не было.
    expect(state([start, trial, ended(3, '01-09')], at('06-01'))).toBe('trial');
  });

  it('клиент — есть оплата, доступ не кончился', () => {
    expect(state([trial, paid(3, '01-09', '02-09')], at('02-01'))).toBe(
      'customer'
    );
    expect(state([paid(3, '01-09')], at('12-01'))).toBe('customer');
    expect(state([ended(3, '01-05'), paid(4, '01-09')], at('02-01'))).toBe(
      'customer'
    );
    // Продление до paid_until — не возвращение.
    expect(
      state([paid(3, '01-09', '02-09'), paid(4, '02-09', '03-09')], at('03-01'))
    ).toBe('customer');
  });

  it('ушёл — после последней оплаты «конец доступа» или прошёл её paid_until', () => {
    expect(state([paid(3, '01-09'), ended(4, '02-09')], at('02-10'))).toBe(
      'lapsed'
    );
    expect(state([paid(3, '01-09', '02-09')], at('02-09'))).toBe('customer');
    expect(state([paid(3, '01-09', '02-09')], at('02-10'))).toBe('lapsed');
  });

  it('вернулся — не ушёл, а среди оплат есть оплата после конца доступа', () => {
    expect(
      state(
        [paid(3, '01-09'), ended(4, '02-09'), paid(5, '03-01')],
        at('03-02')
      )
    ).toBe('returned');
    expect(
      state([paid(3, '01-09', '02-09'), paid(4, '03-01', '04-01')], at('03-02'))
    ).toBe('returned');
    expect(
      fold([paid(3, '01-09', '02-09'), paid(4, '03-01', '04-01')]).returnedAt
    ).toBe(at('03-01'));
  });

  it('вернулся и снова ушёл — ушёл', () => {
    expect(
      state(
        [
          paid(3, '01-09'),
          ended(4, '02-09'),
          paid(5, '03-01'),
          ended(6, '04-01'),
        ],
        at('04-02')
      )
    ).toBe('lapsed');
    expect(
      state([paid(3, '01-09', '02-09'), paid(4, '03-01', '04-01')], at('04-02'))
    ).toBe('lapsed');
  });
});

// Этап 2: бот со схемой метки из четырёх частей, магазин — из двух через точку; вехи — на задания и оплаты.
const STAGE2: Setup = applySet(
  readSet({
    format: 'eile-analytics-set',
    version: 1,
    name: 'Этап 2',
    senders: [
      { code: 'bot', name: 'Бот' },
      { code: 'shop', name: 'Магазин' },
    ],
    dictionaries: [
      {
        code: 'plan',
        name: 'Тариф',
        purpose: 'values',
        values: [
          { code: '1m', name: '1 месяц' },
          { code: '3m', name: '3 месяца' },
        ],
      },
      {
        code: 'heard_from',
        name: 'Откуда узнали',
        purpose: 'answers',
        values: [{ code: 'friend', name: 'Знакомые' }],
      },
      {
        code: 'why',
        name: 'Почему мы',
        purpose: 'answers',
        values: [{ code: 'price', name: 'Цена' }],
      },
      {
        code: 'entry',
        name: 'Вход',
        purpose: 'parts',
        length: 10,
        values: [{ code: 'w-trial', name: 'Кнопка' }],
      },
      {
        code: 'source',
        name: 'Источник',
        purpose: 'parts',
        utm: 'utm_source',
        length: 10,
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
        length: 8,
        values: [
          { code: 'paid', name: 'Платная' },
          { code: 'organic', name: 'Органика' },
        ],
      },
      {
        code: 'campaign',
        name: 'Кампания',
        purpose: 'parts',
        utm: 'utm_campaign',
        length: 16,
        values: [{ code: 'autumn', name: 'Осень' }],
      },
    ],
    properties: [
      {
        scope: 'event',
        code: 'plan',
        name: 'Тариф',
        kind: 'choice',
        dictionary: 'plan',
        dimension: true,
      },
      {
        scope: 'event',
        code: 'items_n',
        name: 'Шагов',
        kind: 'number',
        dimension: true,
      },
      {
        scope: 'event',
        code: 'own_material',
        name: 'Со своим материалом',
        kind: 'boolean',
        dimension: true,
      },
    ],
    types: [
      { sender: 'bot', code: 'start', name: 'Старт', role: 'touch' },
      { sender: 'bot', code: 'survey', name: 'Опрос', role: 'survey' },
      { sender: 'bot', code: 'trial', name: 'Пробный', role: 'trial' },
      {
        sender: 'bot',
        code: 'paid',
        name: 'Оплата',
        role: 'payment',
        properties: [{ code: 'plan' }],
      },
      { sender: 'bot', code: 'refund', name: 'Возврат', role: 'refund' },
      { sender: 'bot', code: 'ended', name: 'Конец доступа', role: 'lapse' },
      {
        sender: 'bot',
        code: 'task',
        name: 'Задание',
        role: 'action',
        properties: [
          { code: 'items_n', required: true },
          { code: 'own_material' },
        ],
      },
      { sender: 'shop', code: 'order', name: 'Заказ', role: 'payment' },
    ],
    schemas: [
      {
        sender: 'bot',
        name: 'Метка бота',
        parts: ['entry', 'source', 'channel', 'campaign'],
      },
      {
        sender: 'shop',
        name: 'Метка магазина',
        separator: '.',
        parts: ['source', 'channel'],
      },
    ],
    milestones: [
      // Пример ADR: задание хотя бы из двух шагов за три дня от прихода.
      {
        code: 'activation',
        name: 'Активация',
        sender: 'bot',
        type: 'task',
        condition: { property: 'items_n', gte: 2 },
        days: 3,
      },
      {
        code: 'two-tasks',
        name: 'Два задания',
        sender: 'bot',
        type: 'task',
        count: 2,
      },
      {
        code: 'after-trial',
        name: 'Задание в пробный период',
        sender: 'bot',
        type: 'task',
        days: 2,
        anchor: 'trial',
      },
      {
        code: 'own-material',
        name: 'Со своим материалом',
        sender: 'bot',
        type: 'task',
        condition: { property: 'own_material', eq: true },
      },
      {
        code: 'long-plan',
        name: 'Три месяца',
        sender: 'bot',
        type: 'paid',
        condition: { property: 'plan', eq: '3m' },
      },
    ],
  })
)(EMPTY_SETUP).state;

const fold2 = (events: readonly HistoryEvent[], setup = STAGE2): Person =>
  foldPerson(setup)(SUBJECT, events) as Person;

const at2 = (moment: string) => `2026-${moment}:00.000Z`;

const start = (seq: number, moment: string, label: string, extra: Extra = {}) =>
  event(seq, 'start', at2(moment), { label }, extra);

const task = (
  seq: number,
  moment: string,
  items: number,
  data: Extra = {},
  extra: Extra = {}
) => event(seq, 'task', at2(moment), { items_n: items, ...data }, extra);

const paid2 = (seq: number, moment: string, data: Extra = {}) =>
  event(seq, 'paid', at2(moment), {
    amount: '19.00',
    currency: 'EUR',
    payment_id: `pi_${seq}`,
    ...data,
  });

describe('свёртка человека: этап 2', () => {
  it('отправитель касаний и части меток по схеме своего отправителя', () => {
    const person = fold2([
      start(1, '10-02T10:00', 'W-Trial__IG__Paid__autumn__extra'),
      event(
        2,
        'order',
        at2('10-04T10:00'),
        { amount: '5.00', currency: 'EUR' },
        {
          sender: 'shop',
          last_touch: { label: 'fb.organic', at: '2026-10-04T09:00:00Z' },
        }
      ),
    ]);
    expect(person.firstTouch).toEqual({
      label: 'W-Trial__IG__Paid__autumn__extra',
      at: at2('10-02T10:00'),
      sender: 'bot',
    });
    // Метка хранится как пришла; части — строчными, лишний отрезок отброшен.
    expect(person.firstParts).toEqual({
      entry: 'w-trial',
      source: 'ig',
      channel: 'paid',
      campaign: 'autumn',
    });
    expect(person.lastTouch).toEqual({
      label: 'fb.organic',
      at: at2('10-04T09:00'),
      sender: 'shop',
    });
    expect(person.lastParts).toEqual({ source: 'fb', channel: 'organic' });
    // Отправитель без схемы: частей нет; незнакомое значение — как в метке.
    const unknown = fold2([start(1, '10-02T10:00', 'w-trial__xx')]);
    expect(unknown.firstParts).toEqual({ entry: 'w-trial', source: 'xx' });
    expect(
      fold2([start(1, '10-02T10:00', 'w-trial__ig')], {
        ...STAGE2,
        schemas: [],
      }).firstParts
    ).toEqual({});
    expect(fold2([start(1, '10-02T10:00', '')]).firstParts).toEqual({});
  });

  it('приход — первое касание, по first_touch раньше событий; без касаний — первое событие', () => {
    const person = fold2([
      event(
        1,
        'trial',
        at2('10-12T07:00'),
        {},
        {
          first_touch: {
            label: 'w-trial__xx__paid',
            at: '2026-10-11T07:00:00Z',
          },
        }
      ),
    ]);
    expect(person).toMatchObject({
      firstAt: at2('10-12T07:00'),
      arrivedAt: at2('10-11T07:00'),
      firstParts: { entry: 'w-trial', source: 'xx', channel: 'paid' },
    });
    expect(fold2([task(1, '10-03T09:00', 3)])).toMatchObject({
      arrivedAt: at2('10-03T09:00'),
      firstTouch: null,
      firstParts: {},
      lastParts: {},
    });
  });

  it('возвращения: касание возврата — самое позднее не позже оплаты, и last_touch, пришедший позже неё', () => {
    const person = fold2([
      start(1, '06-01T10:00', 'w-trial__ig__organic'),
      paid2(2, '06-02T10:00', { paid_until: '2026-07-02T10:00:00Z' }),
      event(3, 'ended', at2('07-02T10:00')),
      start(4, '10-17T10:00', 'w-trial__fb__paid__autumn'),
      paid2(5, '10-18T10:00', { paid_until: '2026-11-18T10:00:00Z' }),
      // Бот прислал касание возврата позже оплаты: оно между стартом и оплатой.
      task(
        6,
        '10-20T10:00',
        2,
        {},
        {
          last_touch: {
            label: 'w-trial__ig__paid',
            at: '2026-10-17T12:00:00Z',
          },
        }
      ),
      // Прошёл paid_until предыдущей — тоже возвращение; касание после оплаты не в счёт.
      paid2(7, '12-01T10:00'),
      start(8, '12-02T10:00', 'w-trial__fb'),
    ]);
    expect(person.returns).toEqual([
      {
        at: at2('10-18T10:00'),
        touch: {
          label: 'w-trial__ig__paid',
          at: at2('10-17T12:00'),
          sender: 'bot',
        },
        parts: { entry: 'w-trial', source: 'ig', channel: 'paid' },
      },
      {
        at: at2('12-01T10:00'),
        touch: {
          label: 'w-trial__ig__paid',
          at: at2('10-17T12:00'),
          sender: 'bot',
        },
        parts: { entry: 'w-trial', source: 'ig', channel: 'paid' },
      },
    ]);
    expect(person.returnedAt).toBe(at2('12-01T10:00'));
    expect(person.lastParts).toEqual({ entry: 'w-trial', source: 'fb' });
    // Без касаний до оплаты — возвращение без касания.
    expect(
      fold2([
        paid2(1, '06-02T10:00'),
        event(2, 'ended', at2('07-02T10:00')),
        paid2(3, '10-18T10:00'),
        start(4, '10-19T10:00', 'w-trial__fb'),
      ]).returns
    ).toEqual([{ at: at2('10-18T10:00'), touch: null, parts: {} }]);
    expect(fold2([paid2(1, '06-02T10:00')]).returns).toEqual([]);
  });

  it('деньги по времени: оплаты больше нуля, возврат — меньше и своей датой, в валюте события, без комиссии', () => {
    const person = fold2([
      paid2(1, '10-20T12:00', { amount: '49.00', fee: '1.00' }),
      event(2, 'refund', at2('10-25T12:00'), {
        amount: '49.00',
        currency: 'EUR',
        payment_id: 'pi_1',
      }),
      event(
        3,
        'order',
        at2('10-03T12:00'),
        { amount: '19.00', currency: 'PLN' },
        { sender: 'shop' }
      ),
    ]);
    // С этапа 3 у возврата — момент курса: момент его оплаты.
    expect(person.money).toEqual([
      [at2('10-03T12:00'), 'PLN', 1900],
      [at2('10-20T12:00'), 'EUR', 4900],
      [at2('10-25T12:00'), 'EUR', -4900, at2('10-20T12:00')],
    ]);
    expect(person.revenue).toEqual({ PLN: 1900, EUR: 0 });
  });

  it('конец первого срока — раньшее из paid_until первой оплаты и первого «конца доступа» после неё', () => {
    expect(
      fold2([
        event(1, 'ended', at2('10-01T10:00')),
        paid2(2, '10-09T10:00', { paid_until: '2026-11-09T10:00:00Z' }),
        paid2(3, '11-09T10:00', { paid_until: '2026-12-09T10:00:00Z' }),
      ]).firstTermEnd
    ).toBe(at2('11-09T10:00'));
    expect(
      fold2([
        paid2(1, '10-09T10:00', { paid_until: '2026-11-09T10:00:00Z' }),
        event(2, 'ended', at2('10-20T10:00')),
      ]).firstTermEnd
    ).toBe(at2('10-20T10:00'));
    expect(fold2([paid2(1, '10-09T10:00')]).firstTermEnd).toBeNull();
    expect(fold2([start(1, '10-09T10:00', '')]).firstTermEnd).toBeNull();
  });

  it('вехи — примеры ADR: окно от прихода, count, gte, состояние на момент чтения', () => {
    const first = fold2([
      start(1, '10-02T10:00', 'w-trial__ig__paid'),
      task(2, '10-03T09:00', 3),
    ]);
    expect(first.milestones.activation).toEqual([
      at2('10-03T09:00'),
      at2('10-05T10:00'),
      at2('10-02T10:00'),
    ]);
    const second = fold2([
      start(1, '10-05T08:00', 'bio__ig__organic'),
      task(2, '10-05T09:00', 1),
      task(3, '10-09T08:00', 2),
    ]);
    // Окно «3 дня» — 72 часа: кончилось 10-08 08:00, задание из двух шагов — после.
    expect(second.milestones.activation).toEqual([
      null,
      at2('10-08T08:00'),
      at2('10-05T08:00'),
    ]);
    expect(second.milestones['two-tasks']).toEqual([
      at2('10-09T08:00'),
      null,
      at2('10-05T08:00'),
    ]);
    const fresh = fold2([start(1, '11-14T10:00', 'w-trial')]);
    expect(fresh.milestones.activation).toEqual([
      null,
      at2('11-17T10:00'),
      at2('11-14T10:00'),
    ]);
    const now = '2026-11-15T12:00:00.000Z';
    expect(milestoneStateOf(first.milestones.activation!, now)).toBe('reached');
    expect(milestoneStateOf(second.milestones.activation!, now)).toBe('missed');
    expect(milestoneStateOf(fresh.milestones.activation!, now)).toBe('open');
    // Окно кончается в свой момент: «сейчас» в конце окна — уже не в окне; без срока — не достиг.
    expect(
      milestoneStateOf(fresh.milestones.activation!, at2('11-17T10:00'))
    ).toBe('missed');
    expect(milestoneStateOf(fresh.milestones['two-tasks']!, now)).toBe(
      'missed'
    );
  });

  it('вехи: начало без события — окна нет; события до начала и в момент конца окна не засчитываются', () => {
    const noTrial = fold2([
      start(1, '10-02T10:00', ''),
      task(2, '10-03T09:00', 3),
    ]);
    expect(noTrial.milestones['after-trial']).toEqual([null, null, null]);
    expect(
      milestoneStateOf(noTrial.milestones['after-trial']!, at2('12-01T00:00'))
    ).toBe('missed');
    const late = fold2([
      start(1, '10-01T10:00', ''),
      task(2, '10-04T10:00', 1),
      event(3, 'trial', at2('10-05T10:00')),
      task(4, '10-07T10:00', 1),
    ]);
    expect(late.milestones['after-trial']).toEqual([
      null,
      at2('10-07T10:00'),
      at2('10-05T10:00'),
    ]);
    expect(
      fold2([event(1, 'trial', at2('10-05T10:00')), task(2, '10-06T10:00', 1)])
        .milestones['after-trial']![0]
    ).toBe(at2('10-06T10:00'));
  });

  it('вехи: eq у «да или нет» и выбора; свойство, которого тип больше не объявляет или которое сменило вид, — не засчитывается', () => {
    const history = [
      start(1, '10-01T10:00', ''),
      task(2, '10-02T10:00', 2, { own_material: false }),
      task(3, '10-03T10:00', 4, { own_material: true }),
      paid2(4, '10-04T10:00', { plan: '1m' }),
      paid2(5, '10-05T10:00', { plan: '3m' }),
    ];
    const person = fold2(history);
    expect(person.milestones['own-material']![0]).toBe(at2('10-03T10:00'));
    expect(person.milestones['long-plan']![0]).toBe(at2('10-05T10:00'));
    expect(person.milestones.activation![0]).toBe(at2('10-02T10:00'));
    const undeclared: Setup = {
      ...STAGE2,
      types: STAGE2.types.map((_) =>
        _.code === 'task'
          ? { ..._, properties: [{ code: 'own_material', required: false }] }
          : _
      ),
    };
    const retyped: Setup = {
      ...STAGE2,
      properties: STAGE2.properties.map((_) =>
        _.code === 'items_n' ? { ..._, kind: 'string' as const } : _
      ),
    };
    for (const setup of [undeclared, retyped]) {
      const changed = fold2(history, setup);
      expect(changed.milestones.activation![0]).toBeNull();
      // Веха без условия и другие условия считаются как прежде.
      expect(changed.milestones['two-tasks']![0]).toBe(at2('10-03T10:00'));
    }
    // Число вместо выбора: eq '3m' не годится свойству вида «число».
    expect(
      fold2(history, {
        ...STAGE2,
        properties: STAGE2.properties.map((_) =>
          _.code === 'plan'
            ? { ..._, kind: 'number' as const, dictionary: null }
            : _
        ),
      }).milestones['long-plan']
    ).toEqual([null, null, at2('10-01T10:00')]);
  });

  it('событие, нарушающее роль, денег и возвращений не даёт, а для вех и первых событий считается по типу', () => {
    const broken: Setup = {
      ...STAGE2,
      types: STAGE2.types.map((_) =>
        _.code === 'task' ? { ..._, role: 'payment' as const } : _
      ),
    };
    const person = fold2(
      [start(1, '10-02T10:00', ''), task(2, '10-03T09:00', 3)],
      broken
    );
    expect(person).toMatchObject({ invalid: 1, payments: 0, money: [] });
    expect(person.milestones.activation![0]).toBe(at2('10-03T09:00'));
    expect(person.firsts['bot/task']).toBe(at2('10-03T09:00'));
    expect(person.dims.items_n).toBe(3);
  });

  it('первые события типов настройки; незнакомый тип и тестовые события — не в счёт', () => {
    const person = fold2([
      start(1, '10-02T10:00', ''),
      task(2, '10-04T09:00', 1),
      task(3, '10-03T09:00', 2),
      event(4, 'gift', at2('10-01T09:00')),
      event(5, 'trial', at2('10-01T08:00'), {}, { test: true }),
    ]);
    expect(person.firsts).toEqual({
      'bot/start': at2('10-02T10:00'),
      'bot/task': at2('10-03T09:00'),
    });
  });

  it('разрезы — годное значение самого раннего события, тип которого объявляет свойство; негодное пропущено', () => {
    const person = fold2([
      paid2(1, '10-01T10:00', { plan: 'RU' }),
      // Тип магазина свойство не объявляет: его значение — не значение разреза.
      event(
        2,
        'order',
        at2('10-02T10:00'),
        { amount: '5.00', currency: 'EUR', plan: '3m' },
        { sender: 'shop' }
      ),
      paid2(3, '10-04T10:00', { plan: '6m' }),
      paid2(4, '10-03T10:00', { plan: null }),
      paid2(5, '10-05T10:00', { plan: '1m' }),
      task(6, '10-06T10:00', 2, { own_material: 'да' }),
      task(7, '10-07T10:00', 5, { own_material: false }),
    ]);
    // Выбор вне справочника — годный по виду: в отчётах он «не из справочника».
    expect(person.dims).toEqual({
      plan: '6m',
      items_n: 2,
      own_material: false,
    });
    expect(fold2([start(1, '10-01T10:00', '')]).dims).toEqual({});
  });

  it('порядок прихода не меняет ни частей, ни вех, ни возвращений, ни разрезов', () => {
    const history = [
      start(1, '06-01T10:00', 'w-trial__ig__organic'),
      paid2(2, '06-02T10:00', {
        plan: '1m',
        paid_until: '2026-07-02T10:00:00Z',
      }),
      task(3, '06-03T10:00', 2, { own_material: true }),
      event(4, 'ended', at2('07-02T10:00')),
      start(5, '10-17T10:00', 'w-trial__fb__paid'),
      paid2(6, '10-18T10:00', { plan: '3m' }),
    ];
    const expected = fold2(history);
    expect(expected).toMatchObject({
      arrivedAt: at2('06-01T10:00'),
      firstTermEnd: at2('07-02T10:00'),
      returns: [{ at: at2('10-18T10:00'), parts: { source: 'fb' } }],
      dims: { plan: '1m', items_n: 2, own_material: true },
    });
    const all = permutations(history);
    expect(all).toHaveLength(720);
    all.forEach((_) => void expect(fold2(arrived(_))).toEqual(expected));
  });
});

const at3 = (moment: string) => `2026-${moment}:00.000Z`;

const paid3 = (
  seq: number,
  moment: string,
  until: string | null,
  data: Extra = {}
) =>
  event(seq, 'paid', at3(moment), {
    ...PAID,
    payment_id: `pi_${seq}`,
    ...(until === null ? {} : { paid_until: at3(until) }),
    ...data,
  });

const ended3 = (seq: number, moment: string) =>
  event(seq, 'ended', at3(moment));

describe('свёртка человека: этап 3', () => {
  it('курс возврата — самая ранняя оплата с тем же номером, и когда по времени она позже возврата', () => {
    const person = fold([
      event(1, 'refund', at3('06-01T10:00'), {
        amount: '9.90',
        currency: 'EUR',
        payment_id: 'pi_1',
      }),
      // Две оплаты с одним номером: момент курса — у самой ранней.
      paid3(2, '06-03T10:00', null, { payment_id: 'pi_1' }),
      paid3(3, '06-02T10:00', null, { payment_id: 'pi_1' }),
      // Возврат без своей оплаты — своим моментом.
      event(4, 'refund', at3('06-05T10:00'), {
        amount: '5',
        currency: 'PLN',
        payment_id: 'pi_lost',
      }),
      // Оплата в тот же момент, что возврат: момента курса нет.
      paid3(5, '06-06T10:00', null, { payment_id: 'pi_2' }),
      event(6, 'refund', at3('06-06T10:00'), {
        amount: '9.90',
        currency: 'EUR',
        payment_id: 'pi_2',
      }),
      event(7, 'refund', at3('06-20T10:00'), {
        amount: '9.90',
        currency: 'EUR',
        payment_id: 'pi_2',
      }),
    ]);
    expect(person.money).toEqual([
      [at3('06-01T10:00'), 'EUR', -990, at3('06-02T10:00')],
      [at3('06-02T10:00'), 'EUR', 990],
      [at3('06-03T10:00'), 'EUR', 990],
      [at3('06-05T10:00'), 'PLN', -500],
      [at3('06-06T10:00'), 'EUR', 990],
      [at3('06-06T10:00'), 'EUR', -990],
      [at3('06-20T10:00'), 'EUR', -990, at3('06-06T10:00')],
    ]);
    // Выручка от момента курса не зависит.
    expect(person.revenue).toEqual({ EUR: 0, PLN: -500 });
    expect(person.unmatched).toBe(1);
  });

  it('комиссии по времени — моментом своей оплаты; уточнение без оплаты — своим; по валютам — то же, что fees', () => {
    const person = fold([
      paid3(1, '06-01T10:00', null, { fee: '0.40' }),
      // Уточнение через неделю — комиссия дня оплаты.
      paid3(2, '06-02T10:00', null, { fee: '0.40' }),
      event(3, 'fee', at3('06-09T10:00'), { payment_id: 'pi_2', fee: '0.45' }),
      // Уточнение раньше своей оплаты — тоже моментом оплаты, в её валюте.
      event(4, 'fee', at3('06-02T09:00'), { payment_id: 'pi_5', fee: '0.30' }),
      paid3(5, '06-03T10:00', null, { amount: '40.00', currency: 'PLN' }),
      // Комиссия в другой валюте, чем оплата: вычитается из своей валюты.
      paid3(6, '06-04T10:00', null, {
        amount: '40.00',
        currency: 'PLN',
        fee: '1.20',
      }),
      event(7, 'fee', at3('06-04T11:00'), {
        payment_id: 'pi_6',
        fee: '0.10',
        currency: 'EUR',
      }),
      // Без своей оплаты — своим моментом и в своей валюте; без валюты его некуда отнести.
      event(8, 'fee', at3('06-05T10:00'), {
        payment_id: 'pi_lost',
        fee: '0.20',
        currency: 'PLN',
      }),
      event(9, 'fee', at3('06-05T11:00'), {
        payment_id: 'pi_gone',
        fee: '0.20',
      }),
      // Уточнение не перевести в валюту оплаты: остаётся своя комиссия оплаты.
      paid3(10, '06-06T10:00', null, {
        amount: '1500',
        currency: 'JPY',
        fee: '100',
      }),
      event(11, 'fee', at3('06-07T10:00'), {
        payment_id: 'pi_10',
        fee: '3.20',
      }),
      paid3(12, '06-08T10:00', null),
    ]);
    expect(person.feeMoney).toEqual([
      [at3('06-01T10:00'), 'EUR', 40],
      [at3('06-02T10:00'), 'EUR', 45],
      [at3('06-03T10:00'), 'PLN', 30],
      [at3('06-04T10:00'), 'EUR', 10],
      [at3('06-05T10:00'), 'PLN', 20],
      [at3('06-06T10:00'), 'JPY', 100],
    ]);
    expect(person.fees).toEqual({ EUR: 95, PLN: 50, JPY: 100 });
    expect(
      person.feeMoney.reduce<Record<string, number>>(
        (sums, _) => ({ ...sums, [_[1]]: (sums[_[1]] ?? 0) + _[2] }),
        {}
      )
    ).toEqual(person.fees);
    expect(person).toMatchObject({ invalid: 2, unmatched: 1 });
  });

  it('оплаты с одним номером: без уточнения — комиссия каждой, с уточнением — одна, моментом самой ранней', () => {
    const twice = [
      paid3(1, '06-02T10:00', null, { payment_id: 'pi_1', fee: '0.40' }),
      paid3(2, '06-01T10:00', null, { payment_id: 'pi_1', fee: '0.30' }),
    ];
    expect(fold(twice)).toMatchObject({
      feeMoney: [
        [at3('06-01T10:00'), 'EUR', 30],
        [at3('06-02T10:00'), 'EUR', 40],
      ],
      fees: { EUR: 70 },
    });
    expect(
      fold([
        ...twice,
        event(3, 'fee', at3('06-03T10:00'), {
          payment_id: 'pi_1',
          fee: '0.50',
        }),
      ])
    ).toMatchObject({
      feeMoney: [[at3('06-01T10:00'), 'EUR', 50]],
      fees: { EUR: 50 },
    });
  });

  it('отрезки доступа — строки таблицы ADR', () => {
    const access = (events: readonly HistoryEvent[]) => fold(events).access;
    // M1: продление ровно в срок — тот же отрезок; «конец доступа» в момент конца срока его не меняет.
    expect(
      access([
        paid3(1, '06-12T10:00', '07-12T10:00'),
        paid3(2, '07-12T10:00', '08-12T10:00'),
        paid3(3, '08-12T10:00', '09-12T10:00'),
        ended3(4, '09-12T10:00'),
      ])
    ).toEqual([[at3('06-12T10:00'), at3('09-12T10:00')]]);
    // M3: конца доступа нет — до paid_until.
    expect(access([paid3(1, '07-20T08:00', '10-20T08:00')])).toEqual([
      [at3('07-20T08:00'), at3('10-20T08:00')],
    ]);
    // P11: ушёл и вернулся — два отрезка.
    expect(
      access([
        paid3(1, '06-02T10:00', '07-02T10:00'),
        ended3(2, '07-02T10:00'),
        paid3(3, '10-18T10:00', '11-18T10:00'),
      ])
    ).toEqual([
      [at3('06-02T10:00'), at3('07-02T10:00')],
      [at3('10-18T10:00'), at3('11-18T10:00')],
    ]);
    // Без paid_until и без конца доступа — доступ не кончался.
    expect(access([paid3(1, '05-01T10:00', null)])).toEqual([
      [at3('05-01T10:00'), null],
    ]);
    // «Конец доступа» раньше срока закрывает отрезок своим моментом.
    expect(
      access([paid3(1, '03-01T10:00', '04-01T10:00'), ended3(2, '03-20T10:00')])
    ).toEqual([[at3('03-01T10:00'), at3('03-20T10:00')]]);
  });

  it('отрезки доступа — правила «ушёл» и «вернулся» этапа 1', () => {
    const access = (events: readonly HistoryEvent[]) => fold(events).access;
    // «Конец доступа» до первой оплаты — конец пробного периода, не уход.
    expect(
      access([ended3(1, '02-20T10:00'), paid3(2, '03-01T10:00', '04-01T10:00')])
    ).toEqual([[at3('03-01T10:00'), at3('04-01T10:00')]]);
    // «Конец доступа» позже paid_until: отрезок уже кончился по paid_until; следующая оплата — возвращение.
    expect(
      access([
        paid3(1, '03-01T10:00', '04-01T10:00'),
        ended3(2, '04-10T10:00'),
        paid3(3, '04-15T10:00', '05-15T10:00'),
      ])
    ).toEqual([
      [at3('03-01T10:00'), at3('04-01T10:00')],
      [at3('04-15T10:00'), at3('05-15T10:00')],
    ]);
    // Прошёл paid_until предыдущей — возвращение и без «конца доступа»; минута позже срока — уже перерыв.
    expect(
      access([
        paid3(1, '03-01T10:00', '04-01T10:00'),
        paid3(2, '04-01T10:01', '05-01T10:01'),
      ])
    ).toEqual([
      [at3('03-01T10:00'), at3('04-01T10:00')],
      [at3('04-01T10:01'), at3('05-01T10:01')],
    ]);
    // Оплата без paid_until продлевает отрезок без конца; конец ставит первый «конец доступа» после неё.
    expect(
      access([
        paid3(1, '03-01T10:00', '04-01T10:00'),
        paid3(2, '03-15T10:00', null),
        ended3(3, '05-01T10:00'),
        ended3(4, '05-03T10:00'),
      ])
    ).toEqual([[at3('03-01T10:00'), at3('05-01T10:00')]]);
    // Отрезки согласны с возвращениями и состоянием.
    const person = fold([
      paid3(1, '06-02T10:00', '07-02T10:00'),
      ended3(2, '07-02T10:00'),
      paid3(3, '10-18T10:00', '11-18T10:00'),
    ]);
    expect(person.access).toHaveLength(1 + person.returns.length);
    expect(stateOf(person, at3('11-01T00:00'))).toBe('returned');
    expect(fold([event(1, 'start', at3('06-01T10:00'))]).access).toEqual([]);
  });

  it('доступ в момент и в месяце — на границах отрезка', () => {
    const spans: AccessSpan[] = [
      [at3('06-02T10:00'), at3('07-02T10:00')],
      [at3('10-18T10:00'), null],
    ];
    const ms = (moment: string, add: number) =>
      new Date(Date.parse(at3(moment)) + add).toISOString();
    // Начало — не включая, конец — включая: paid_until ровно в «сейчас» ещё не прошёл.
    expect(accessAt(spans, at3('06-02T10:00'))).toBe(false);
    expect(accessAt(spans, ms('06-02T10:00', 1))).toBe(true);
    expect(accessAt(spans, at3('07-02T10:00'))).toBe(true);
    expect(accessAt(spans, ms('07-02T10:00', 1))).toBe(false);
    expect(accessAt(spans, at3('10-18T10:00'))).toBe(false);
    expect(accessAt(spans, '2030-01-01T00:00:00.000Z')).toBe(true);
    expect(accessAt([], at3('06-10T10:00'))).toBe(false);
    // Месяц [a, b): отрезок, кончившийся ровно в начале, или начатый ровно в конце — не в нём.
    expect(accessIn(spans, at3('07-01T00:00'), at3('08-01T00:00'))).toBe(true);
    expect(accessIn(spans, at3('08-01T00:00'), at3('09-01T00:00'))).toBe(false);
    expect(accessIn(spans, at3('07-02T10:00'), at3('10-18T10:00'))).toBe(false);
    expect(accessIn(spans, ms('07-02T10:00', -1), ms('10-18T10:00', 1))).toBe(
      true
    );
    expect(accessIn(spans, at3('11-01T00:00'), at3('12-01T00:00'))).toBe(true);
    // Продление ровно в конце срока — не перерыв: месяц между оплатами — с доступом.
    const renewed = fold([
      paid3(1, '06-12T10:00', '07-12T10:00'),
      paid3(2, '07-12T10:00', '08-12T10:00'),
    ]).access;
    expect(accessAt(renewed, at3('07-12T10:00'))).toBe(true);
    expect(accessIn(renewed, at3('07-12T10:00'), at3('07-12T11:00'))).toBe(
      true
    );
  });

  it('тестовые события и события, нарушающие роль, денег, комиссий и доступа не дают', () => {
    const broken: Setup = {
      ...SETUP,
      types: SETUP.types.map((_) =>
        _.code === 'task' ? { ..._, role: 'payment' as const } : _
      ),
    };
    const person = fold(
      [
        event(1, 'start', at3('06-01T10:00')),
        paid3(2, '06-02T10:00', '07-02T10:00', { fee: '0.40' }),
        event(
          3,
          'paid',
          at3('06-03T10:00'),
          { ...PAID, fee: '0.40' },
          { test: true }
        ),
        event(4, 'task', at3('06-04T10:00'), { amount: '5', fee: '1' }),
        event(5, 'refund', at3('06-05T10:00'), {
          amount: '9.90',
          payment_id: 'pi_2',
        }),
        event(
          6,
          'fee',
          at3('06-06T10:00'),
          {
            payment_id: 'pi_2',
            fee: '0.50',
            currency: 'EUR',
          },
          { test: true }
        ),
      ],
      broken
    );
    expect(person).toMatchObject({
      payments: 1,
      invalid: 2,
      money: [[at3('06-02T10:00'), 'EUR', 990]],
      feeMoney: [[at3('06-02T10:00'), 'EUR', 40]],
      access: [[at3('06-02T10:00'), at3('07-02T10:00')]],
    });
  });

  it('порядок прихода не меняет ни момента курса, ни комиссий, ни отрезков доступа', () => {
    const history = [
      paid3(1, '06-02T10:00', '07-02T10:00', { fee: '0.40' }),
      event(2, 'fee', at3('06-09T10:00'), { payment_id: 'pi_1', fee: '0.45' }),
      ended3(3, '07-02T10:00'),
      event(4, 'refund', at3('10-25T10:00'), {
        amount: '40.00',
        currency: 'PLN',
        payment_id: 'pi_5',
      }),
      paid3(5, '10-18T10:00', '11-18T10:00', {
        amount: '40.00',
        currency: 'PLN',
      }),
      event(6, 'fee', at3('10-19T10:00'), {
        payment_id: 'pi_5',
        fee: '0.10',
        currency: 'EUR',
      }),
    ];
    const expected = fold(history);
    expect(expected).toMatchObject({
      money: [
        [at3('06-02T10:00'), 'EUR', 990],
        [at3('10-18T10:00'), 'PLN', 4000],
        [at3('10-25T10:00'), 'PLN', -4000, at3('10-18T10:00')],
      ],
      feeMoney: [
        [at3('06-02T10:00'), 'EUR', 45],
        [at3('10-18T10:00'), 'EUR', 10],
      ],
      access: [
        [at3('06-02T10:00'), at3('07-02T10:00')],
        [at3('10-18T10:00'), at3('11-18T10:00')],
      ],
    });
    const all = permutations(history);
    expect(all).toHaveLength(720);
    all.forEach((_) => void expect(fold(arrived(_))).toEqual(expected));
  });
});

describe('источник привлечения и первый вопрос', () => {
  it('части первого касания; без частей — ответ на первый по коду вопрос; нет и его — неизвестно', () => {
    const withParts = fold2([start(1, '10-02T10:00', 'w-trial__ig')]);
    expect(acquisitionOf(STAGE2, withParts)).toEqual({
      kind: 'parts',
      parts: { entry: 'w-trial', source: 'ig' },
    });
    const answered = fold2([
      start(1, '10-02T10:00', ''),
      event(2, 'survey', at2('10-02T10:05'), {
        question: 'why',
        answer: 'price',
      }),
      event(3, 'survey', at2('10-02T10:06'), {
        question: 'heard_from',
        answer: 'friend',
      }),
    ]);
    expect(firstQuestion(STAGE2)).toBe('heard_from');
    expect(acquisitionOf(STAGE2, answered)).toEqual({
      kind: 'answer',
      question: 'heard_from',
      answer: 'friend',
    });
    // Вопрос в архиве уступает действующему.
    const archived: Setup = {
      ...STAGE2,
      dictionaries: STAGE2.dictionaries.map((_) =>
        _.code === 'heard_from' ? { ..._, archivedAt: at2('10-01T00:00') } : _
      ),
    };
    expect(firstQuestion(archived)).toBe('why');
    expect(acquisitionOf(archived, answered)).toEqual({
      kind: 'answer',
      question: 'why',
      answer: 'price',
    });
    const silent = fold2([
      start(1, '10-02T10:00', ''),
      event(2, 'survey', at2('10-02T10:05'), {
        question: 'why',
        answer: 'price',
      }),
    ]);
    expect(acquisitionOf(STAGE2, silent)).toEqual({ kind: 'unknown' });
    expect(firstQuestion(EMPTY_SETUP)).toBeNull();
  });
});
