import { describe, expect, it } from 'bun:test';
import {
  canonicalJson,
  checkEvent,
  dayOf,
  fitsKind,
  isSubject,
  momentOf,
  readEventBody,
  verdictOf,
} from './envelope.ts';
import { applySet, EMPTY_SETUP, readSet } from './setup.ts';

// Бот с подпиской: тариф обязателен в оплате и необязателен в возврате; язык — признак человека.
const SETUP = applySet(
  readSet({
    format: 'eile-analytics-set',
    version: 1,
    name: 'Бот',
    senders: [{ code: 'bot', name: 'Бот' }],
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
        code: 'lang',
        name: 'Язык',
        purpose: 'values',
        values: [{ code: 'ru', name: 'Русский' }],
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
        dimension: true,
      },
      { scope: 'event', code: 'items_n', name: 'Шагов', kind: 'number' },
      { scope: 'event', code: 'discount', name: 'Скидка', kind: 'money' },
      { scope: 'event', code: 'starts_on', name: 'Начало', kind: 'date' },
      {
        scope: 'person',
        code: 'lang',
        name: 'Язык',
        kind: 'choice',
        dictionary: 'lang',
      },
    ],
    types: [
      { sender: 'bot', code: 'bot_start', name: 'Старт', role: 'touch' },
      { sender: 'bot', code: 'survey', name: 'Опрос', role: 'survey' },
      {
        sender: 'bot',
        code: 'purchase',
        name: 'Оплата',
        role: 'payment',
        properties: [
          { code: 'plan', required: true },
          { code: 'discount' },
          { code: 'starts_on' },
        ],
      },
      {
        sender: 'bot',
        code: 'refund',
        name: 'Возврат',
        role: 'refund',
        properties: [{ code: 'plan' }],
      },
      { sender: 'bot', code: 'fee', name: 'Комиссия', role: 'amendment' },
      {
        sender: 'bot',
        code: 'task',
        name: 'Задание',
        role: 'action',
        properties: [{ code: 'items_n', required: true }],
      },
      { sender: 'bot', code: 'day', name: 'Сводка', role: 'summary' },
      { sender: 'bot', code: 'forget', name: 'Удаление', role: 'erasure' },
    ],
  })
)(EMPTY_SETUP).state;

const NOW = '2027-11-14T18:30:00.000Z';

const check = (body: Record<string, unknown>, sender = 'bot') =>
  checkEvent(body, { setup: SETUP, sender, now: NOW });

const event = (type: string, data: Record<string, unknown> = {}) => ({
  id: `evt_${type}`,
  type,
  at: '2027-11-14T18:22:05Z',
  subject: 'u_3b9e0c7a1f',
  data,
});

const errorsOf = (body: Record<string, unknown>) =>
  ((_) => (_.ok ? {} : _.errors))(check(body));

const warningsOf = (body: Record<string, unknown>) =>
  ((_) => (_.ok ? _.warnings : null))(check(body));

const PURCHASE = {
  ...event('purchase', {
    amount: '109.00',
    currency: 'EUR',
    payment_id: 'pi_3Q8x',
    plan: '3m',
  }),
  test: false,
  first_touch: {
    label: 'post__blog__organic__autumn',
    at: '2026-11-28T09:10:00Z',
  },
  last_touch: { label: '', at: '2027-11-14T20:05:41+02:00' },
  traits: { lang: 'ru' },
};

describe('конверт', () => {
  it('оплата из ADR принята: роль из справочника, моменты — в UTC с миллисекундами', () => {
    expect(check(PURCHASE)).toEqual({
      ok: true,
      role: 'payment',
      warnings: [],
      envelope: {
        id: 'evt_purchase',
        type: 'purchase',
        at: '2027-11-14T18:22:05.000Z',
        subject: 'u_3b9e0c7a1f',
        test: false,
        firstTouch: {
          label: 'post__blog__organic__autumn',
          at: '2026-11-28T09:10:00.000Z',
        },
        lastTouch: { label: '', at: '2027-11-14T18:05:41.000Z' },
        traits: { lang: 'ru' },
        data: PURCHASE.data,
      },
    });
  });

  it('незнакомый тип — только конверт и предупреждение; тип другого отправителя — незнакомый', () => {
    expect(check({ id: 'e1', type: 'gift_sent', at: NOW })).toMatchObject({
      ok: true,
      role: null,
      warnings: ['unknown_type'],
      envelope: { subject: null, test: false, traits: {}, data: {} },
    });
    expect(check(event('purchase'), 'shop')).toMatchObject({
      ok: true,
      role: null,
      warnings: ['unknown_type'],
    });
  });

  it('ошибки — все сразу, по путям полей; лишнее поле конверта — ошибка', () => {
    expect(
      Object.keys(
        errorsOf({
          id: 'evt 1',
          type: 'Purchase',
          at: '2027-11-14 18:22',
          subjet: 'u_3b9e0c7a1f',
          test: 'no',
          first_touch: { label: 7, at: '1999-12-31T23:59:59Z', source: 'x' },
          traits: { lang: {}, Lang: 'ru' },
          data: [],
        })
      ).toSorted()
    ).toEqual([
      'at',
      'data',
      'first_touch.at',
      'first_touch.label',
      'first_touch.source',
      'id',
      'subjet',
      'test',
      'traits.Lang',
      'traits.lang',
      'type',
    ]);
    expect(errorsOf({})).toEqual({
      id: 'is required',
      type: 'is required',
      at: 'is required',
    });
  });

  it('псевдоним: не почта, не телефон, не номер в мессенджере; HMAC проходит', () => {
    expect(isSubject('u_3b9e0c7a1f')).toBe(true);
    expect(isSubject('3b9e0c7a1f2d4e5f')).toBe(true);
    expect(isSubject('Zm9vYmFyYmF6-_')).toBe(true);
    expect(isSubject('anna@example.com')).toBe(false);
    expect(isSubject('+491701234567')).toBe(false);
    expect(isSubject('491701234567')).toBe(false);
    expect(isSubject('1234567890')).toBe(false);
    expect(isSubject('anna k')).toBe(false);
    expect(isSubject('u_1')).toBe(false);
    expect(
      Object.keys(errorsOf({ ...PURCHASE, subject: '123456789' }))
    ).toEqual(['subject']);
  });

  it('псевдоним нужен всем ролям, кроме сводки, а у сводки его нет', () => {
    expect(errorsOf({ ...event('bot_start'), subject: null })).toEqual({
      subject: 'is required for this event type',
    });
    expect(
      errorsOf(event('day', { day: '2027-11-14', counts: { bot_start: 3 } }))
    ).toHaveProperty('subject');
    expect(
      check({
        ...event('day', { day: '2027-11-14', counts: { bot_start: 3 } }),
        subject: undefined,
      })
    ).toMatchObject({ ok: true, role: 'summary', envelope: { subject: null } });
  });

  it('null — как отсутствие поля; test по умолчанию false', () => {
    expect(
      check({
        ...event('bot_start'),
        test: null,
        first_touch: null,
        traits: null,
        data: null,
      })
    ).toMatchObject({
      ok: true,
      envelope: { test: false, firstTouch: null, traits: {}, data: {} },
    });
  });

  it('событие позже приёма больше чем на час — с предупреждением', () => {
    expect(
      warningsOf({ ...event('bot_start'), at: '2027-11-14T19:31:00Z' })
    ).toEqual(['future']);
    expect(
      warningsOf({ ...event('bot_start'), at: '2027-11-14T19:29:00Z' })
    ).toEqual([]);
  });
});

describe('роль и свойства', () => {
  it('поля роли — строго: сумма, валюта, номер платежа', () => {
    expect(errorsOf(event('purchase', { plan: '1m' }))).toEqual({
      'data.amount': 'is required',
      'data.currency': 'is required',
    });
    expect(
      Object.keys(
        errorsOf(
          event('purchase', {
            amount: '0.00',
            currency: 'eur',
            payment_id: 'pi 3Q8x',
            paid_until: '2028-01-01',
            fee: -1,
            plan: '1m',
          })
        )
      ).toSorted()
    ).toEqual([
      'data.amount',
      'data.currency',
      'data.fee',
      'data.paid_until',
      'data.payment_id',
    ]);
  });

  it('деньги — по знакам валюты; уточнение без валюты — до четырёх знаков', () => {
    const paid = (amount: unknown, currency: string) =>
      check(event('purchase', { amount, currency, plan: '1m' })).ok;
    expect(paid('109.00', 'EUR')).toBe(true);
    expect(paid(109.5, 'EUR')).toBe(true);
    expect(paid('109.005', 'EUR')).toBe(false);
    expect(paid('1500', 'JPY')).toBe(true);
    expect(paid('1500.5', 'JPY')).toBe(false);
    expect(paid('12.125', 'KWD')).toBe(true);
    expect(paid('109,00', 'EUR')).toBe(false);
    expect(
      check(event('fee', { payment_id: 'pi_3Q8x', fee: '1.2345' })).ok
    ).toBe(true);
    expect(
      check(
        event('fee', { payment_id: 'pi_3Q8x', fee: '1.2345', currency: 'EUR' })
      ).ok
    ).toBe(false);
  });

  it('обязательное свойство с негодным значением — ошибка, необязательное — предупреждение', () => {
    const paid = { amount: '109.00', currency: 'EUR' };
    expect(errorsOf(event('purchase', { ...paid, plan: 'RU' }))).toEqual({
      'data.plan': 'is a code: a-z 0-9 _ - up to 60 characters',
    });
    expect(errorsOf(event('purchase', paid))).toEqual({
      'data.plan': 'is required',
    });
    expect(
      warningsOf(
        event('refund', { ...paid, payment_id: 'pi_3Q8x', plan: '1 m' })
      )
    ).toEqual(['invalid_value:data.plan']);
    expect(
      warningsOf(
        event('purchase', {
          ...paid,
          plan: '1m',
          discount: '5.001',
          starts_on: '2027-02-30',
        })
      )
    ).toEqual(['invalid_value:data.discount', 'invalid_value:data.starts_on']);
    expect(
      warningsOf(
        event('purchase', {
          ...paid,
          plan: '1m',
          discount: '5.00',
          starts_on: '2027-12-01',
        })
      )
    ).toEqual([]);
    expect(errorsOf(event('task', { items_n: '12' }))).toEqual({
      'data.items_n': 'is a number',
    });
  });

  it('выбор вне справочника принят с предупреждением — и обязательный тоже', () => {
    expect(
      warningsOf(event('purchase', { amount: 1, currency: 'EUR', plan: '6m' }))
    ).toEqual(['unknown_value:data.plan']);
  });

  it('деньги-свойство — в валюте события; без валюты не годятся', () => {
    expect(
      warningsOf(
        event('refund', { amount: 1, currency: 'EUR', payment_id: 'p1' })
      )
    ).toEqual([]);
    expect(
      warningsOf(
        event('task', { items_n: 3, discount: '1.00', currency: 'EUR' })
      )
    ).toEqual([]);
  });

  it('признаки: объявленные — по виду, необъявленные — как пришли', () => {
    expect(
      warningsOf({
        ...event('bot_start'),
        traits: { lang: 'RU', city: 'Kyiv' },
      })
    ).toEqual(['invalid_value:traits.lang']);
    expect(
      warningsOf({ ...event('bot_start'), traits: { lang: 'de', age: 31 } })
    ).toEqual(['unknown_value:traits.lang']);
    expect(
      errorsOf({
        ...event('bot_start'),
        traits: Object.fromEntries(
          Array.from({ length: 21 }, (_, i) => [`t${i}`, i])
        ),
      })
    ).toHaveProperty('traits');
  });

  it('опрос: вопрос и ответ — коды; вне справочника — предупреждение', () => {
    expect(
      warningsOf(
        event('survey', { question: 'heard_from', answer: 'friend', text: '' })
      )
    ).toEqual([]);
    expect(
      warningsOf(event('survey', { question: 'heard_from', answer: 'tv' }))
    ).toEqual(['unknown_value:data.answer']);
    expect(
      warningsOf(event('survey', { question: 'plan', answer: '1m' }))
    ).toEqual(['unknown_value:data.question']);
    expect(
      Object.keys(errorsOf(event('survey', { question: 'Heard', answer: 2 })))
    ).toEqual(['data.question', 'data.answer']);
  });

  it('сводка: день, счёт по типам, выручка по валютам', () => {
    const summary = (data: Record<string, unknown>) => ({
      ...event('day', data),
      subject: undefined,
    });
    expect(
      check(
        summary({
          day: '2027-11-14',
          counts: { bot_start: 40, purchase: 3 },
          revenue: { EUR: '327.00' },
          failed: 0,
          version: '2.4.1',
        })
      ).ok
    ).toBe(true);
    expect(
      Object.keys(
        errorsOf(
          summary({
            day: '2027-11-31',
            counts: { bot_start: -1 },
            revenue: { EUR: '1.001' },
            failed: 1.5,
          })
        )
      )
    ).toEqual(['data.day', 'data.counts', 'data.revenue', 'data.failed']);
  });
});

describe('моменты и тело', () => {
  it('момент с поясом — в UTC; без пояса и несуществующий — не момент', () => {
    expect(momentOf('2027-11-14T20:22:05.1234+02:00')).toBe(
      '2027-11-14T18:22:05.123Z'
    );
    expect(momentOf('2027-11-14T18:22Z')).toBe('2027-11-14T18:22:00.000Z');
    expect(momentOf('2027-11-14T18:22:05')).toBeNull();
    expect(momentOf('2027-02-29T10:00:00Z')).toBeNull();
    expect(momentOf('2028-02-29T10:00:00Z')).toBe('2028-02-29T10:00:00.000Z');
    expect(momentOf('2027-11-14T24:00:00Z')).toBeNull();
    expect(momentOf(1_700_000_000)).toBeNull();
    expect(dayOf('2027-11-14')).toBe('2027-11-14');
    expect(dayOf('2027-13-01')).toBeNull();
  });

  it('канонический JSON — ключи по алфавиту на всех уровнях, без пробелов', () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}'
    );
    expect(canonicalJson(JSON.parse('{ "type": "x", "id": "1" }'))).toBe(
      canonicalJson({ id: '1', type: 'x' })
    );
  });

  it('тело — объект JSON не глубже 32 уровней', () => {
    expect(readEventBody('{"id":"1"}')).toMatchObject({
      ok: true,
      canonical: '{"id":"1"}',
    });
    expect(readEventBody('[1]')).toEqual({
      ok: false,
      errors: { body: 'is not a JSON object' },
    });
    expect(readEventBody('{"id":')).toMatchObject({ ok: false });
    expect(
      readEventBody(`{"data":{"a":${'['.repeat(40_000)}${']'.repeat(40_000)}}}`)
    ).toEqual({
      ok: false,
      errors: { body: 'is nested deeper than 32 levels' },
    });
  });
});

describe('годность по виду', () => {
  it('fitsKind — то же, что verdictOf не invalid: выбор вне справочника годен, справочник не нужен', () => {
    const property = (code: string) =>
      SETUP.properties.find((_) => _.scope === 'event' && _.code === code)!;
    const cases: readonly (readonly [
      string,
      unknown,
      Readonly<Record<string, unknown>>,
    ])[] = [
      ['plan', '1m', {}],
      ['plan', '6m', {}],
      ['plan', 'RU', {}],
      ['plan', 3, {}],
      ['items_n', 2, {}],
      ['items_n', '2', {}],
      ['discount', '1.50', { currency: 'EUR' }],
      ['discount', '1.50', {}],
      ['starts_on', '2027-01-01', {}],
      ['starts_on', 'завтра', {}],
    ];
    for (const { 0: code, 1: raw, 2: data } of cases) {
      expect([code, raw, fitsKind(property(code), raw, SETUP, data)]).toEqual([
        code,
        raw,
        verdictOf(property(code), raw, SETUP, data) !== 'invalid',
      ]);
    }
    expect(fitsKind(property('plan'), '6m', SETUP, {})).toBe(true);
    expect(fitsKind(property('plan'), 'RU', SETUP, {})).toBe(false);
  });
});
