import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import { inputErrorsOf, type Priced } from './money.ts';
import { reportLookups } from './report.ts';
import {
  archiveItem,
  EMPTY_SETUP,
  parseRef,
  type Setup,
  saveItem,
} from './setup.ts';
import {
  type Arrival,
  parseSpend,
  partStates,
  type SpendContext,
  type SpendParams,
  type SpendRow,
  spendChanged,
  spendHints,
  spendKey,
  spendLog,
  spendOf,
} from './spend.ts';

const AT = '2026-11-15T12:00:00.000Z';

const save =
  (group: string, item: unknown) =>
  (setup: Setup): Setup =>
    saveItem(group, item)(setup).state;

const archive =
  (group: string, key: Record<string, unknown>) =>
  (setup: Setup): Setup =>
    archiveItem(parseRef(group, key), true, AT)(setup).state;

const build = (...steps: ((setup: Setup) => Setup)[]): Setup =>
  steps.reduce((setup, step) => step(setup), EMPTY_SETUP);

const part = (code: string, name: string, values: readonly string[]) => [
  save('dictionary', { code, name, purpose: 'parts' }),
  ...values.map((value) =>
    save('value', { dictionary: code, code: value, name: value.toUpperCase() })
  ),
];

// Части метки: источник, тип, кампания; «vk» и вся «кампания» — в архиве; опрос — не часть.
const SETUP = build(
  ...part('source', 'Источник', ['ig', 'fb', 'tg', 'vk']),
  ...part('channel', 'Тип', ['paid', 'organic']),
  ...part('campaign', 'Кампания', ['autumn']),
  save('dictionary', {
    code: 'heard_from',
    name: 'Откуда',
    purpose: 'answers',
  }),
  save('value', { dictionary: 'heard_from', code: 'friend', name: 'Друг' }),
  save('value', { dictionary: 'channel', code: 'paid', awaitsSpend: true }),
  archive('value', { dictionary: 'source', code: 'vk' }),
  archive('dictionary', { code: 'campaign' })
);

const failure = (run: () => unknown) =>
  attempt(
    () => (run(), null),
    (error) =>
      isDomainError(error)
        ? { code: error.code, errors: inputErrorsOf(error) }
        : String(error)
  );

const row = (
  id: number,
  month: string,
  parts: Record<string, string>,
  amount: number,
  currency = 'EUR'
): SpendRow => ({
  id,
  month,
  parts,
  currency,
  amount,
  note: '',
  author: null,
  createdAt: AT,
  updatedAt: AT,
});

const context = (previous: SpendRow | null = null): SpendContext => ({
  setup: SETUP,
  month: '2026-11',
  previous: () => previous,
});

const input = (extra: Record<string, unknown> = {}) => ({
  month: '2026-10',
  parts: { source: 'ig', channel: 'paid' },
  currency: 'EUR',
  amount: '60.00',
  ...extra,
});

describe('строка расхода', () => {
  it('годная строка: сумма в минимальных единицах, части по алфавиту, ключ без порядка частей', () => {
    const draft = parseSpend(
      input({ parts: { source: 'ig', channel: 'paid' }, note: '  Осень  ' }),
      context()
    );
    expect(draft).toEqual({
      id: null,
      key: '2026-10|{"channel":"paid","source":"ig"}|EUR',
      month: '2026-10',
      parts: { channel: 'paid', source: 'ig' },
      currency: 'EUR',
      amount: 6_000,
      note: 'Осень',
    });
    expect(Object.keys(draft.parts)).toEqual(['channel', 'source']);
    expect(
      spendKey({
        month: '2026-10',
        parts: { source: 'ig', channel: 'paid' },
        currency: 'EUR',
      })
    ).toBe(draft.key);
    // Ноль — тоже расход; общий расход — без частей; JPY — без знаков после точки.
    expect(parseSpend(input({ amount: '0' }), context()).amount).toBe(0);
    expect(parseSpend(input({ parts: {} }), context()).parts).toEqual({});
    expect(
      parseSpend(input({ currency: 'JPY', amount: 2000 }), context()).amount
    ).toBe(2_000);
  });

  it('месяц — ГГГГ-ММ от 2000-01 до нынешнего: будущий месяц — не расход', () => {
    for (const month of [
      '2026-12',
      '1999-12',
      '2026-1',
      '2026-10-01',
      202610,
    ]) {
      expect([
        month,
        failure(() => parseSpend(input({ month }), context())),
      ]).toEqual([
        month,
        {
          code: 'analytics.invalid_spend',
          errors: { month: expect.stringContaining('2026-11') },
        },
      ]);
    }
    expect(parseSpend(input({ month: '2026-11' }), context()).month).toBe(
      '2026-11'
    );
  });

  it('части: только части метки, значения из справочника, до восьми; ошибки — по каждой части', () => {
    expect(
      failure(() =>
        parseSpend(
          input({
            parts: { source: 'xx', heard_from: 'friend', nope: 'a' },
          }),
          context()
        )
      )
    ).toEqual({
      code: 'analytics.invalid_spend',
      errors: {
        'parts.source': 'the part source has no value xx',
        'parts.heard_from': 'heard_from is not a part of the label',
        'parts.nope': 'nope is not a part of the label',
      },
    });
    expect(
      failure(() =>
        parseSpend(
          input({
            parts: Object.fromEntries(
              Array.from({ length: 9 }, (_, n) => [`p${n}`, 'a'])
            ),
          }),
          context()
        )
      )
    ).toMatchObject({ errors: { parts: expect.stringContaining('up to 8') } });
    expect(
      failure(() => parseSpend(input({ parts: ['ig'] }), context()))
    ).toMatchObject({ errors: { parts: expect.any(String) } });
    expect(
      failure(() => parseSpend(input({ parts: { source: 1 } }), context()))
    ).toMatchObject({ errors: { parts: expect.any(String) } });
  });

  it('ошибки формы и справочников — сразу: негодный месяц не прячет незнакомое значение части', () => {
    expect(
      failure(() =>
        parseSpend(
          input({
            month: '2026-13',
            currency: 'EURO',
            amount: '-1',
            parts: { source: 'xx' },
          }),
          context()
        )
      )
    ).toEqual({
      code: 'analytics.invalid_spend',
      errors: {
        month: expect.any(String),
        currency: expect.any(String),
        'parts.source': 'the part source has no value xx',
      },
    });
  });

  it('в архиве: новая строка не берёт, у прежней строки остаются', () => {
    expect(
      failure(() =>
        parseSpend(
          input({ parts: { source: 'vk', campaign: 'autumn' } }),
          context()
        )
      )
    ).toEqual({
      code: 'analytics.invalid_spend',
      errors: {
        'parts.campaign': 'the part campaign is archived',
        'parts.source': 'the value source/vk is archived',
      },
    });
    const before = row(
      7,
      '2026-10',
      { campaign: 'autumn', source: 'vk' },
      3_000
    );
    expect(
      parseSpend(
        input({ parts: { source: 'vk', campaign: 'autumn' }, amount: '35.00' }),
        context(before)
      ).amount
    ).toBe(3_500);
    // Прежняя строка стояла на другом значении — архивное значение не берётся и при правке.
    expect(
      failure(() =>
        parseSpend(
          input({ id: 7, parts: { source: 'vk' } }),
          context(row(7, '2026-10', { source: 'ig' }, 3_000))
        )
      )
    ).toMatchObject({
      errors: { 'parts.source': 'the value source/vk is archived' },
    });
  });

  it('сумма — по валюте, от нуля; валюта ISO 4217; заметка до 500; незнакомое поле — отказ', () => {
    expect(
      failure(() =>
        parseSpend(
          {
            month: '2026-10',
            parts: {},
            currency: 'EUR',
            amount: '-1.00',
            note: 'x'.repeat(501),
            id: 0,
            source: 'ig',
          },
          context()
        )
      )
    ).toEqual({
      code: 'analytics.invalid_spend',
      errors: {
        source: expect.stringContaining('not a field'),
        id: 'is the number of a spend row',
        amount: expect.stringContaining('from 0'),
        note: 'is text up to 500 characters',
      },
    });
    for (const amount of ['60.001', '1e3', 1e21, '', null]) {
      expect(
        failure(() => parseSpend(input({ amount }), context()))
      ).toMatchObject({ errors: { amount: expect.any(String) } });
    }
    expect(
      failure(() =>
        parseSpend(input({ amount: '20.5', currency: 'JPY' }), context())
      )
    ).toMatchObject({
      errors: { amount: expect.stringContaining('0 digits') },
    });
    for (const currency of ['eur', 'XAU', 'EURO', 978]) {
      expect(
        failure(() => parseSpend(input({ currency }), context()))
      ).toMatchObject({ errors: { currency: expect.any(String) } });
    }
    expect(failure(() => parseSpend('row', context()))).toMatchObject({
      code: 'analytics.invalid_spend',
    });
  });

  it('изменилась ли строка, состояние частей и строка журнала без автора', () => {
    const before = row(3, '2026-10', { channel: 'paid', source: 'ig' }, 6_000);
    const same = parseSpend(input(), context(before));
    expect(spendChanged(before, same)).toBe(false);
    expect(
      spendChanged(before, parseSpend(input({ amount: '61' }), context()))
    ).toBe(true);
    expect(
      spendChanged(before, parseSpend(input({ note: 'счёт 12' }), context()))
    ).toBe(true);
    expect(
      partStates(
        { source: 'vk', channel: 'paid', campaign: 'autumn', gone: 'x' },
        SETUP
      )
    ).toEqual({
      source: 'archived',
      channel: 'known',
      campaign: 'archived',
      gone: 'unknown',
    });
    const entry = spendLog(
      'changed',
      before,
      { ...before, amount: 6_100, author: { name: 'Анна', agent: true } },
      { id: 1, name: 'Анна', agent: true },
      AT
    );
    expect(entry).toMatchObject({ item: 'spend', key: '3', action: 'changed' });
    expect(entry.after).not.toHaveProperty('author');
    expect(entry.after).toMatchObject({ amount: 6_100 });
  });
});

// Цена строки — 1 к 1 в евро, PLN — по 0.2300, CHF — без курса: перевод не дело раскладки.
const price = (spend: SpendRow): Priced => ({
  currency: spend.currency,
  amount: spend.amount,
  value:
    spend.currency === 'EUR'
      ? BigInt(spend.amount)
      : spend.currency === 'PLN'
        ? BigInt(Math.round(spend.amount * 0.23))
        : null,
  stale: spend.month === '2026-08',
});

const LOOKUPS = reportLookups(SETUP);

// Расходы плана тестов этапа 3: июнь и июль — Instagram платный, август — Facebook платный в злотых, сентябрь —
// Instagram без типа, октябрь — общий и Instagram платный нулём.
const SPEND: readonly SpendRow[] = [
  row(1, '2026-06', { channel: 'paid', source: 'ig' }, 6_000),
  row(2, '2026-07', { channel: 'paid', source: 'ig' }, 6_200),
  row(3, '2026-08', { channel: 'paid', source: 'fb' }, 40_000, 'PLN'),
  row(4, '2026-09', { source: 'ig' }, 3_000),
  row(5, '2026-10', {}, 5_000),
  row(6, '2026-10', { channel: 'paid', source: 'ig' }, 0),
];

const params = (extra: Partial<SpendParams> = {}): SpendParams => ({
  period: { from: '2026-06-01', to: '2026-10-31' },
  attribution: 'first',
  group: { kind: 'part', code: 'source' },
  filters: [],
  ...extra,
});

const values = (spend: ReturnType<typeof spendOf>) =>
  Object.fromEntries(
    Array.from(spend.rows, ({ 0: value, 1: sum }) => [value, sum.value])
  );

describe('расход отчёта', () => {
  it('строка отчёта получает строки расхода не шире её; общий расход — без строки, в итоге', () => {
    const spend = spendOf(SPEND, params(), price, LOOKUPS);
    expect(spend).toMatchObject({
      scope: 'rows',
      reason: null,
      prorated: false,
      total: { value: 29_400, unpriced: {}, staleRate: true },
      unassigned: { value: 5_000 },
      broader: null,
    });
    expect(values(spend)).toEqual({ ig: 15_200, fb: 9_200 });
    expect(spend.rows.get('fb')?.staleRate).toBe(true);
  });

  it('фильтр по части: шире фильтра — никуда; другое значение — не о строке', () => {
    const spend = spendOf(
      SPEND,
      params({ filters: [{ kind: 'part', code: 'channel', value: 'paid' }] }),
      price,
      LOOKUPS
    );
    expect(values(spend)).toEqual({ ig: 12_200, fb: 9_200 });
    expect(spend.total?.value).toBe(21_400);
    expect(spend.unassigned).toBeNull();
    expect(spend.broader?.value).toBe(8_000);
    // «Не указано» — не значение строки расхода: подходящих нет, шире — те, где части нет.
    const none = spendOf(
      SPEND,
      params({ filters: [{ kind: 'part', code: 'channel', value: '~none' }] }),
      price,
      LOOKUPS
    );
    expect(none.total).toBeNull();
    expect(none.broader?.value).toBe(8_000);
  });

  it('группа по типу: без части группы — unassigned, по строкам не разложен', () => {
    const spend = spendOf(
      SPEND,
      params({ group: { kind: 'part', code: 'channel' } }),
      price,
      LOOKUPS
    );
    expect(values(spend)).toEqual({ paid: 21_400 });
    expect(spend.unassigned?.value).toBe(8_000);
    expect(spend.total?.value).toBe(29_400);
  });

  it('не разложить: группа не по части — только итог, фильтр не по части и возврат — расхода нет', () => {
    expect(
      spendOf(
        SPEND,
        params({ group: { kind: 'answer', code: 'heard_from' } }),
        price,
        LOOKUPS
      )
    ).toMatchObject({
      scope: 'total',
      reason: 'group',
      total: { value: 29_400 },
    });
    expect(
      spendOf(
        SPEND,
        params({ filters: [{ kind: 'trait', code: 'lang', value: 'ru' }] }),
        price,
        LOOKUPS
      )
    ).toMatchObject({ scope: 'none', reason: 'filter', total: null });
    expect(
      spendOf(
        SPEND,
        params({ filters: [{ kind: 'sender', code: '', value: 'bot' }] }),
        price,
        LOOKUPS
      )
    ).toMatchObject({ scope: 'none', reason: 'filter' });
    expect(
      spendOf(SPEND, params({ attribution: 'return' }), price, LOOKUPS)
    ).toMatchObject({ scope: 'none', reason: 'return', total: null });
  });

  it('значения с расходом — строками и без людей; без курса — отдельно по валютам', () => {
    const spend = spendOf(
      [...SPEND, row(7, '2026-10', { source: 'tg' }, 2_000, 'CHF')],
      params(),
      price,
      LOOKUPS
    );
    expect(spend.rows.get('tg')).toEqual({
      value: 0,
      unpriced: { CHF: 2_000 },
      staleRate: false,
    });
    expect(spend.total?.unpriced).toEqual({ CHF: 2_000 });
  });

  it('доля дней: 31 октября — 1/31, период через два месяца, месяц, который идёт', () => {
    const october = spendOf(
      SPEND,
      params({ period: { from: '2026-10-31', to: '2026-10-31' } }),
      price,
      LOOKUPS
    );
    // 50.00 / 31 = 1.6129 → 1.61.
    expect(october).toMatchObject({ prorated: true, total: { value: 161 } });
    // 15 октября – 14 ноября: 5 000 × 17 / 31 = 2 741.9 → 27.42; в ноябре строк нет.
    expect(
      spendOf(
        SPEND,
        params({ period: { from: '2026-10-15', to: '2026-11-14' } }),
        price,
        LOOKUPS
      ).total?.value
    ).toBe(2_742);
    // 31 августа – 30 сентября: 9 200 / 31 = 296.8 → 2.97 и сентябрь целиком 30.00.
    expect(
      spendOf(
        SPEND,
        params({ period: { from: '2026-08-31', to: '2026-09-30' } }),
        price,
        LOOKUPS
      )
    ).toMatchObject({
      prorated: true,
      total: { value: 3_297, staleRate: true },
    });
    // Ноябрь, который ещё идёт: половина месяца — половина расхода.
    expect(
      spendOf(
        [row(8, '2026-11', {}, 3_000)],
        params({ period: { from: '2026-11-01', to: '2026-11-15' } }),
        price,
        LOOKUPS
      )
    ).toMatchObject({ prorated: true, total: { value: 1_500 } });
    expect(
      spendOf(
        [row(9, '2026-11', {}, 999, 'CHF')],
        params({ period: { from: '2026-11-01', to: '2026-11-15' } }),
        price,
        LOOKUPS
      ).total
    ).toEqual({ value: 0, unpriced: { CHF: 500 }, staleRate: false });
  });

  it('без строк расхода в периоде — пусто, а не ноль', () => {
    const spend = spendOf(
      SPEND,
      params({ period: { from: '2026-01-01', to: '2026-03-31' } }),
      price,
      LOOKUPS
    );
    expect(spend).toMatchObject({
      scope: 'rows',
      total: null,
      unassigned: null,
      broader: null,
    });
    expect(spend.rows.size).toBe(0);
  });
});

describe('подсказки «ждёт расхода»', () => {
  const arrivals: Arrival[] = [
    { month: '2026-10', parts: { source: 'ig', channel: 'paid' } },
    { month: '2026-11', parts: { source: 'ig', channel: 'paid' } },
    { month: '2026-11', parts: { source: 'tg', channel: 'organic' } },
  ];

  it('новые люди у значения есть, а строк расхода с ним нет; строка с нулём — тоже расход', () => {
    expect(spendHints(['2026-10', '2026-11'], arrivals, SPEND, SETUP)).toEqual([
      {
        month: '2026-11',
        part: 'channel',
        value: 'paid',
        name: 'PAID',
        people: 1,
      },
    ]);
    // Без нулевой строки октября подсказка была бы и за октябрь.
    expect(
      spendHints(
        ['2026-10'],
        arrivals,
        SPEND.filter((_) => _.id !== 6),
        SETUP
      ).map((_) => _.month)
    ).toEqual(['2026-10']);
  });

  it('значение без отметки, в архиве или без людей подсказок не даёт', () => {
    const plain = build(...part('channel', 'Тип', ['paid']));
    expect(spendHints(['2026-11'], arrivals, [], plain)).toEqual([]);
    expect(
      spendHints(
        ['2026-11'],
        arrivals,
        [],
        archive('value', { dictionary: 'channel', code: 'paid' })(SETUP)
      )
    ).toEqual([]);
    expect(spendHints(['2026-09'], arrivals, [], SETUP)).toEqual([]);
  });
});
