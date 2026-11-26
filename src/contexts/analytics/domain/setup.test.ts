import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import { EVENT_ROLES, ROLES } from './roles.ts';
import {
  type AnalyticsSet,
  applySet,
  archiveItem,
  changesOf,
  cleanName,
  draftSet,
  EMPTY_SETUP,
  exportSet,
  itemLog,
  NO_HOLDS,
  newerVersion,
  parseRef,
  readSet,
  readSetFile,
  removeItem,
  SETUP_LIMITS,
  type SetFacts,
  type Setup,
  type SetupAuthor,
  saveItem,
  setErrorsOf,
  setLog,
} from './setup.ts';

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const save =
  (group: string, item: unknown) =>
  (setup: Setup): Setup =>
    saveItem(group, item)(setup).state;

const build = (...steps: ((setup: Setup) => Setup)[]): Setup =>
  steps.reduce((setup, step) => step(setup), EMPTY_SETUP);

const ref = (group: string, key: Record<string, unknown>) =>
  parseRef(group, key);

// Магазин с тарифом-выбором и оплатой заказа: тариф в ней обязателен.
const BASE = build(
  save('sender', { code: 'shop', name: 'Магазин' }),
  save('dictionary', { code: 'tiers', name: 'Тарифы', purpose: 'values' }),
  save('value', { dictionary: 'tiers', code: 'basic', name: 'Базовый' }),
  save('property', {
    scope: 'event',
    code: 'tier',
    name: 'Тариф',
    kind: 'choice',
    dictionary: 'tiers',
    dimension: true,
  }),
  save('type', {
    sender: 'shop',
    code: 'order_paid',
    name: 'Оплата заказа',
    role: 'payment',
    properties: [{ code: 'tier', required: true }],
  })
);

const AUTHOR: SetupAuthor = { id: 1, name: 'Анна', agent: false };

describe('роли', () => {
  it('десять ролей ядра, у каждой — свои поля; у сводки псевдонима нет', () => {
    expect(EVENT_ROLES).toHaveLength(10);
    expect(EVENT_ROLES.every((_) => ROLES[_].role === _)).toBe(true);
    expect(ROLES.summary.subject).toBe('forbidden');
    expect(
      ROLES.payment.fields.filter((_) => _.required).map((_) => _.code)
    ).toEqual(['amount', 'currency']);
    expect(ROLES.amendment.fields.map((_) => [_.code, _.required])).toEqual([
      ['payment_id', true],
      ['fee', true],
      ['currency', false],
    ]);
  });
});

describe('элементы и коды', () => {
  it('элемент создаётся с умолчаниями, ключ — код или владелец/код', () => {
    expect(BASE.senders).toEqual([
      {
        code: 'shop',
        name: 'Магазин',
        note: '',
        enabled: true,
        summaryAt: '06:00',
        archivedAt: null,
      },
    ]);
    expect(BASE.values[0]).toMatchObject({ position: 0, note: '' });
    expect(ref('type', { sender: 'shop', code: 'order_paid' }).key).toBe(
      'shop/order_paid'
    );
    expect(ref('property', { scope: 'person', code: 'tier' }).key).toBe(
      'person/tier'
    );
  });

  it('код — a-z 0-9 _ -, длину задаёт группа', () => {
    for (const bad of ['Shop', 'shop bot', 'магазин', '', 'a.b', 7, null]) {
      expect(code(() => save('sender', { code: bad, name: 'x' })(BASE))).toBe(
        'analytics.invalid_code'
      );
    }
    expect(
      code(() => save('sender', { code: 'x'.repeat(21), name: 'x' })(BASE))
    ).toBe('analytics.invalid_code');
    expect(
      save('value', {
        dictionary: 'tiers',
        code: 'v'.repeat(60),
        name: 'Длинный',
      })(BASE).values
    ).toHaveLength(2);
    expect(
      code(() =>
        save('value', {
          dictionary: 'tiers',
          code: 'v'.repeat(61),
          name: 'Длинный',
        })(BASE)
      )
    ).toBe('analytics.invalid_code');
    expect(code(() => saveItem('label', { code: 'x' })(BASE))).toBe(
      'analytics.invalid_group'
    );
  });

  it('название — 1–100 знаков на любом языке, заметка — до 500', () => {
    expect(
      save('sender', { code: 'app', name: ` ${'ж'.repeat(100)} ` })(BASE)
        .senders[1]!.name
    ).toBe('ж'.repeat(100));
    for (const name of ['', '   ', 'ж'.repeat(101), 5]) {
      expect(code(() => save('sender', { code: 'app', name })(BASE))).toBe(
        'analytics.invalid_item'
      );
    }
    expect(code(() => save('sender', { code: 'app' })(BASE))).toBe(
      'analytics.invalid_item'
    );
    expect(
      code(() =>
        save('sender', {
          code: 'app',
          name: 'Приложение',
          note: 'x'.repeat(501),
        })(BASE)
      )
    ).toBe('analytics.invalid_item');
  });

  it('незнакомое поле — отказ, архив из списка — не мешает', () => {
    expect(
      code(() =>
        save('type', {
          sender: 'shop',
          code: 'order_paid',
          requried: true,
        })(BASE)
      )
    ).toBe('analytics.invalid_item');
    expect(
      save('sender', { ...BASE.senders[0], name: 'Шоп' })(BASE).senders[0]!.name
    ).toBe('Шоп');
  });

  it('правка меняет только присланные поля', () => {
    const next = save('type', {
      sender: 'shop',
      code: 'order_paid',
      note: 'Из корзины',
    })(BASE);
    expect(next.types[0]).toEqual({
      ...BASE.types[0]!,
      note: 'Из корзины',
    });
  });

  it('час сводки: ЧЧ:ММ по UTC или null; без поля — прежний, у нового — 06:00', () => {
    const at = (summaryAt: unknown) =>
      save('sender', { code: 'shop', summaryAt })(BASE).senders[0]!.summaryAt;
    expect(BASE.senders[0]!.summaryAt).toBe('06:00');
    expect(at('03:30')).toBe('03:30');
    expect(at('00:00')).toBe('00:00');
    expect(at('23:59')).toBe('23:59');
    expect(at(null)).toBeNull();
    for (const wrong of [
      '24:00',
      '6:00',
      '06:60',
      '06:00:00',
      ' 06:00',
      6,
      '',
    ]) {
      expect([wrong, code(() => at(wrong))]).toEqual([
        wrong,
        'analytics.invalid_item',
      ]);
    }
    const quiet = save('sender', { code: 'shop', summaryAt: null })(BASE);
    // Правка другого поля час не трогает: null остаётся null.
    expect(
      save('sender', { code: 'shop', name: 'Шоп' })(quiet).senders[0]
    ).toMatchObject({ name: 'Шоп', summaryAt: null });
    expect(
      build(save('sender', { code: 'bot', name: 'Бот', summaryAt: '03:30' }))
        .senders[0]!.summaryAt
    ).toBe('03:30');
    expect(
      saveItem('sender', { code: 'shop', summaryAt: '06:00' })(BASE)
    ).toMatchObject({
      state: BASE,
      events: [],
    });
  });
});

describe('ссылки', () => {
  it('тип — у существующего отправителя и только со свойствами событий', () => {
    expect(
      code(() =>
        save('type', { sender: 'bot2', code: 'x', name: 'X', role: 'touch' })(
          BASE
        )
      )
    ).toBe('analytics.invalid_reference');
    expect(
      code(() =>
        save('type', {
          sender: 'shop',
          code: 'x',
          name: 'X',
          role: 'touch',
          properties: [{ code: 'missing' }],
        })(BASE)
      )
    ).toBe('analytics.invalid_reference');
    const withTrait = save('property', {
      scope: 'person',
      code: 'region',
      name: 'Регион',
      kind: 'string',
    })(BASE);
    expect(
      code(() =>
        save('type', {
          sender: 'shop',
          code: 'x',
          name: 'X',
          role: 'touch',
          properties: [{ code: 'region' }],
        })(withTrait)
      )
    ).toBe('analytics.invalid_reference');
    expect(
      code(() =>
        save('type', {
          sender: 'shop',
          code: 'x',
          name: 'X',
          role: 'touch',
          properties: [{ code: 'tier' }, { code: 'tier' }],
        })(BASE)
      )
    ).toBe('analytics.invalid_item');
    expect(
      code(() =>
        save('type', { sender: 'shop', code: 'x', name: 'X', role: 'sale' })(
          BASE
        )
      )
    ).toBe('analytics.invalid_item');
  });

  it('элемент в архиве в новую ссылку не берётся, прежняя ссылка остаётся', () => {
    const archived = archiveItem(
      ref('property', { scope: 'event', code: 'tier' }),
      true,
      '2026-11-25T10:00:00.000Z'
    )(BASE).state;
    expect(
      code(() =>
        save('type', {
          sender: 'shop',
          code: 'order_refunded',
          name: 'Возврат',
          role: 'refund',
          properties: [{ code: 'tier' }],
        })(archived)
      )
    ).toBe('analytics.invalid_reference');
    expect(
      save('type', {
        sender: 'shop',
        code: 'order_paid',
        properties: [{ code: 'tier', required: false }],
      })(archived).types[0]!.properties
    ).toEqual([{ code: 'tier', required: false }]);
    const closed = archiveItem(
      ref('sender', { code: 'shop' }),
      true,
      '2026-11-25T10:00:00.000Z'
    )(BASE).state;
    expect(
      code(() =>
        save('type', { sender: 'shop', code: 'y', name: 'Y', role: 'action' })(
          closed
        )
      )
    ).toBe('analytics.invalid_reference');
  });

  it('выбор — из справочника значений; разрез и чужой текст — по виду', () => {
    const answers = save('dictionary', {
      code: 'heard',
      name: 'Откуда узнали',
      purpose: 'answers',
    })(BASE);
    const choice = (input: Record<string, unknown>) => () =>
      save('property', {
        scope: 'event',
        code: 'size',
        name: 'Размер',
        ...input,
      })(answers);
    expect(code(choice({ kind: 'choice' }))).toBe('analytics.invalid_item');
    expect(code(choice({ kind: 'choice', dictionary: 'nope' }))).toBe(
      'analytics.invalid_reference'
    );
    expect(code(choice({ kind: 'choice', dictionary: 'heard' }))).toBe(
      'analytics.invalid_reference'
    );
    expect(code(choice({ kind: 'number', dictionary: 'tiers' }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(choice({ kind: 'string', dimension: true }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(choice({ kind: 'money', dimension: true }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(choice({ kind: 'number', untrusted: true }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(choice({ kind: 'colour' }))).toBe('analytics.invalid_item');
    expect(
      choice({ kind: 'string', untrusted: true })().properties.at(-1)
    ).toMatchObject({ kind: 'string', untrusted: true, dimension: false });
    expect(
      choice({ kind: 'boolean', dimension: true })().properties.at(-1)
    ).toMatchObject({ dimension: true, dictionary: null });
  });

  it('у справочника в деле назначение не меняется; значение — в существующем справочнике', () => {
    expect(
      code(() =>
        save('dictionary', { code: 'tiers', purpose: 'answers' })(BASE)
      )
    ).toBe('analytics.in_use');
    expect(
      code(() =>
        save('value', { dictionary: 'sizes', code: 's', name: 'S' })(BASE)
      )
    ).toBe('analytics.invalid_reference');
  });
});

describe('пределы', () => {
  const senders = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      save('sender', { code: `s${i}`, name: `Отправитель ${i}` })
    );

  it('отправителей — 20, типов у отправителя — 50, свойств у типа — 20', () => {
    const full = build(...senders(SETUP_LIMITS.senders));
    expect(full.senders).toHaveLength(20);
    expect(code(() => save('sender', { code: 'one', name: 'Ещё' })(full))).toBe(
      'analytics.too_many'
    );
    const types = build(
      ...senders(1),
      ...Array.from({ length: 50 }, (_, i) =>
        save('type', { sender: 's0', code: `t${i}`, name: 'T', role: 'action' })
      )
    );
    expect(
      code(() =>
        save('type', { sender: 's0', code: 'more', name: 'T', role: 'action' })(
          types
        )
      )
    ).toBe('analytics.too_many');
    const properties = build(
      ...senders(1),
      ...Array.from({ length: 21 }, (_, i) =>
        save('property', {
          scope: 'event',
          code: `p${i}`,
          name: 'P',
          kind: 'string',
        })
      )
    );
    expect(
      code(() =>
        save('type', {
          sender: 's0',
          code: 'wide',
          name: 'W',
          role: 'action',
          properties: properties.properties.map((_) => ({ code: _.code })),
        })(properties)
      )
    ).toBe('analytics.too_many');
  });

  it('признаков — 50, справочников — 100, значений в справочнике — 1000', () => {
    const traits = build(
      ...Array.from({ length: 50 }, (_, i) =>
        save('property', {
          scope: 'person',
          code: `t${i}`,
          name: 'T',
          kind: 'string',
        })
      )
    );
    expect(
      code(() =>
        save('property', {
          scope: 'person',
          code: 'more',
          name: 'T',
          kind: 'string',
        })(traits)
      )
    ).toBe('analytics.too_many');
    expect(
      save('property', {
        scope: 'event',
        code: 'more',
        name: 'T',
        kind: 'string',
      })(traits).properties
    ).toHaveLength(51);
    const dictionaries = build(
      ...Array.from({ length: 100 }, (_, i) =>
        save('dictionary', { code: `d${i}`, name: 'D', purpose: 'values' })
      )
    );
    expect(
      code(() =>
        save('dictionary', { code: 'more', name: 'D', purpose: 'values' })(
          dictionaries
        )
      )
    ).toBe('analytics.too_many');
    const values = build(
      save('dictionary', { code: 'd', name: 'D', purpose: 'values' }),
      ...Array.from({ length: 1000 }, (_, i) =>
        save('value', { dictionary: 'd', code: `v${i}`, name: 'V' })
      )
    );
    expect(values.values.at(-1)!.position).toBe(999);
    expect(
      code(() =>
        save('value', { dictionary: 'd', code: 'more', name: 'V' })(values)
      )
    ).toBe('analytics.too_many');
  });
});

describe('ревизия, архив и удаление', () => {
  it('каждая правка повышает ревизию на одну, правка без изменений — нет', () => {
    expect(BASE.revision).toBe(5);
    const same = saveItem('sender', { code: 'shop', name: 'Магазин' })(BASE);
    expect(same.state).toBe(BASE);
    expect(same.events).toEqual([]);
    const renamed = saveItem('sender', { code: 'shop', name: 'Лавка' })(BASE);
    expect(renamed.state.revision).toBe(6);
    expect(renamed.events).toEqual([
      { type: 'analytics.setup_changed', revision: 6 },
    ]);
  });

  it('архив и возврат; элемент в архиве действует как прежде', () => {
    const at = '2026-11-25T10:00:00.000Z';
    const key = ref('type', { sender: 'shop', code: 'order_paid' });
    const archived = archiveItem(key, true, at)(BASE);
    expect(archived.state.types[0]).toMatchObject({
      archivedAt: at,
      role: 'payment',
    });
    expect(archived.state.revision).toBe(6);
    expect(
      archiveItem(key, true, '2026-12-01T00:00:00.000Z')(archived.state).events
    ).toEqual([]);
    const restored = archiveItem(key, false, at)(archived.state).state;
    expect(restored.types[0]!.archivedAt).toBeNull();
    expect(restored.revision).toBe(7);
    expect(
      code(() => archiveItem(ref('sender', { code: 'nope' }), true, at)(BASE))
    ).toBe('analytics.item_not_found');
  });

  it('удалить можно только элемент без ссылок и без событий', () => {
    expect(
      code(() => removeItem(ref('sender', { code: 'shop' }), false)(BASE))
    ).toBe('analytics.in_use');
    expect(
      code(() =>
        removeItem(
          ref('property', { scope: 'event', code: 'tier' }),
          false
        )(BASE)
      )
    ).toBe('analytics.in_use');
    expect(
      code(() => removeItem(ref('dictionary', { code: 'tiers' }), false)(BASE))
    ).toBe('analytics.in_use');
    const key = ref('type', { sender: 'shop', code: 'order_paid' });
    expect(code(() => removeItem(key, true)(BASE))).toBe('analytics.in_use');
    const removed = removeItem(key, false)(BASE).state;
    expect(removed.types).toEqual([]);
    expect(removed.revision).toBe(6);
    expect(
      removeItem(ref('sender', { code: 'shop' }), false)(removed).state.senders
    ).toEqual([]);
    expect(
      removeItem(
        ref('value', { dictionary: 'tiers', code: 'basic' }),
        false
      )(BASE).state.values
    ).toEqual([]);
    expect(code(() => removeItem(key, false)(removed))).toBe(
      'analytics.item_not_found'
    );
  });
});

describe('журнал', () => {
  it('строка на элемент: создан, изменён, в архиве, из архива, удалён — было и стало', () => {
    const at = '2026-11-25T10:00:00.000Z';
    const key = ref('value', { dictionary: 'tiers', code: 'basic' });
    const steps = [
      (_: Setup) =>
        saveItem('value', { dictionary: 'tiers', code: 'pro', name: 'Про' })(_),
      (_: Setup) =>
        saveItem('value', { dictionary: 'tiers', code: 'basic', name: 'Б' })(_),
      archiveItem(key, true, at),
      archiveItem(key, false, at),
      removeItem(key, false),
    ];
    const { actions } = steps.reduce(
      (done, step) =>
        ((next) => ({
          setup: next,
          actions: [
            ...done.actions,
            ...itemLog(changesOf(done.setup, next), AUTHOR, at),
          ],
        }))(step(done.setup).state),
      { setup: BASE, actions: [] as ReturnType<typeof itemLog> }
    );
    expect(actions.map((_) => [_.item, _.key, _.action])).toEqual([
      ['value', 'tiers/pro', 'created'],
      ['value', 'tiers/basic', 'changed'],
      ['value', 'tiers/basic', 'archived'],
      ['value', 'tiers/basic', 'restored'],
      ['value', 'tiers/basic', 'removed'],
    ]);
    expect(actions[1]).toMatchObject({
      author: AUTHOR,
      before: { name: 'Базовый' },
      after: { name: 'Б' },
    });
    expect(actions[4]!.after).toBeNull();
  });
});

describe('набор', () => {
  const SET = {
    format: 'eile-analytics-set',
    version: 1,
    name: 'Магазин',
    senders: [{ code: 'shop', name: 'Магазин' }],
    dictionaries: [
      {
        code: 'tiers',
        name: 'Тарифы',
        purpose: 'values',
        values: [
          { code: 'basic', name: 'Базовый' },
          { code: 'pro', name: 'Про' },
        ],
      },
    ],
    properties: [
      {
        scope: 'event',
        code: 'tier',
        name: 'Тариф',
        kind: 'choice',
        dictionary: 'tiers',
        dimension: true,
      },
    ],
    types: [
      {
        sender: 'shop',
        code: 'order_paid',
        name: 'Оплата заказа',
        role: 'payment',
        properties: [{ code: 'tier', required: true }],
      },
    ],
  };

  const apply = (set: unknown, setup: Setup = EMPTY_SETUP) =>
    applySet(readSet(set))(setup);

  it('применяется на пустую настройку одной ревизией; в порядке зависимостей', () => {
    const { state, events } = apply(SET);
    expect(state.revision).toBe(1);
    expect(events).toEqual([{ type: 'analytics.setup_changed', revision: 1 }]);
    expect(state.values.map((_) => [_.code, _.position])).toEqual([
      ['basic', 0],
      ['pro', 1],
    ]);
    expect(state.types[0]!.properties).toEqual([
      { code: 'tier', required: true },
    ]);
  });

  it('повторное применение ничего не меняет; остальные элементы не трогаются', () => {
    const once = apply(SET).state;
    const again = apply(SET, once);
    expect(again.state).toBe(once);
    expect(again.events).toEqual([]);
    const extra = save('sender', { code: 'app', name: 'Приложение' })(once);
    const renamed = apply(
      { ...SET, senders: [{ code: 'shop', name: 'Лавка' }] },
      extra
    ).state;
    expect(renamed.senders.map((_) => [_.code, _.name])).toEqual([
      ['shop', 'Лавка'],
      ['app', 'Приложение'],
    ]);
    expect(renamed.revision).toBe(extra.revision + 1);
  });

  it('всё или ничего: ошибки собираются по всем элементам с путём в наборе', () => {
    const broken = {
      ...SET,
      dictionaries: [
        {
          ...SET.dictionaries[0],
          values: [{ code: 'Basic', name: 'Базовый' }, { code: 'pro' }],
        },
      ],
      types: [
        ...SET.types,
        {
          sender: 'shop',
          code: 'order_refunded',
          name: 'Возврат',
          role: 'refund',
          properties: [{ code: 'missing' }],
        },
        { sender: 'shop', code: 'order_paid', name: 'Дубль', role: 'payment' },
      ],
    };
    const error = attempt(
      () => (apply(broken), null),
      (_) => _
    );
    expect(code(() => apply(broken))).toBe('analytics.invalid_set');
    expect(Object.keys(setErrorsOf(error))).toEqual([
      'dictionaries[0].values[0]',
      'dictionaries[0].values[1]',
      'types[1]',
      'types[2]',
    ]);
    expect(setErrorsOf(error)['types[1]']).toContain('missing');
    expect(setErrorsOf(error)['types[2]']).toContain('types[0]');
    expect((error as Error).message).toContain('types[1]');
  });

  it('обёртка: формат, версия, имя, незнакомая группа — отказ', () => {
    for (const bad of [
      null,
      [],
      { ...SET, format: 'cms-archive' },
      { ...SET, version: 2 },
      { ...SET, name: '' },
      { ...SET, labels: [] },
      { ...SET, types: {} },
    ]) {
      expect(code(() => readSet(bad))).toBe('analytics.invalid_set');
    }
    expect(
      code(() =>
        apply({
          ...SET,
          dictionaries: [
            {
              ...SET.dictionaries[0],
              values: [{ dictionary: 'other_dict', code: 'x', name: 'X' }],
            },
          ],
        })
      )
    ).toBe('analytics.invalid_set');
  });

  it('журнал набора — одна строка с элементами до и после', () => {
    const once = apply(SET).state;
    const next = apply(
      { ...SET, senders: [{ code: 'shop', name: 'Лавка' }] },
      once
    ).state;
    const rows = setLog('Магазин', changesOf(once, next), null, 'now');
    expect(rows).toEqual([
      {
        at: 'now',
        author: null,
        item: 'set',
        key: 'Магазин',
        action: 'applied',
        before: { sender: { shop: once.senders[0] } },
        after: { sender: { shop: next.senders[0] } },
      },
    ]);
    expect(setLog('Магазин', [], null, 'now')).toEqual([]);
  });
});

// Этап 2: части метки, схема бота, соответствия, переход, веха и воронка — как в наборе «Подписка».
const SUBSCRIPTION = {
  format: 'eile-analytics-set',
  version: 1,
  name: 'Подписка',
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
      code: 'entry',
      name: 'Вход',
      purpose: 'parts',
      length: 10,
      values: [
        { code: 'w-trial', name: 'Кнопка' },
        { code: 'post', name: 'Пост' },
      ],
    },
    {
      code: 'source',
      name: 'Источник',
      purpose: 'parts',
      utm: 'utm_source',
      length: 10,
      values: [
        { code: 'ig', name: 'Instagram' },
        { code: 'direct', name: 'Прямой заход' },
      ],
    },
    {
      code: 'channel',
      name: 'Тип',
      purpose: 'parts',
      utm: 'utm_medium',
      length: 8,
      values: [
        { code: 'organic', name: 'Органика' },
        { code: 'referral', name: 'Ссылка' },
        { code: 'direct', name: 'Прямой заход' },
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
    {
      code: 'creative',
      name: 'Креатив',
      purpose: 'parts',
      utm: 'utm_content',
      length: 10,
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
    { scope: 'event', code: 'items_n', name: 'Шагов', kind: 'number' },
    {
      scope: 'event',
      code: 'own_material',
      name: 'Со своим материалом',
      kind: 'boolean',
    },
    { scope: 'event', code: 'comment', name: 'Комментарий', kind: 'string' },
  ],
  types: [
    { sender: 'bot', code: 'bot_start', name: 'Старт', role: 'touch' },
    { sender: 'bot', code: 'trial_started', name: 'Пробный', role: 'trial' },
    {
      sender: 'bot',
      code: 'purchase',
      name: 'Оплата',
      role: 'payment',
      properties: [{ code: 'plan', required: true }],
    },
    {
      sender: 'bot',
      code: 'task_done',
      name: 'Задание',
      role: 'action',
      properties: [
        { code: 'items_n', required: true },
        { code: 'own_material' },
        { code: 'plan' },
        { code: 'comment' },
      ],
    },
  ],
  schemas: [
    {
      sender: 'bot',
      name: 'Метка',
      parts: ['entry', 'source', 'channel', 'campaign', 'creative'],
    },
  ],
  referrers: [
    {
      code: 'instagram',
      name: 'Instagram',
      kind: 'host',
      host: 'instagram.com',
      parts: { source: 'ig', channel: 'organic' },
    },
    {
      code: 'other-sites',
      name: 'Другие сайты',
      kind: 'any',
      parts: { source: '{host}', channel: 'referral' },
    },
    {
      code: 'no-referrer',
      name: 'Прямой заход',
      kind: 'none',
      parts: { source: 'direct', channel: 'direct' },
    },
  ],
  links: [
    {
      code: 'trial',
      name: 'Попробовать',
      sender: 'bot',
      target: 'https://t.me/ExampleBot?start={label}',
      parts: { entry: 'w-trial' },
    },
  ],
  milestones: [
    {
      code: 'activation',
      name: 'Активация',
      sender: 'bot',
      type: 'task_done',
      condition: { property: 'items_n', gte: 2 },
      days: 3,
    },
  ],
  funnels: [
    {
      code: 'journey',
      name: 'Путь',
      main: true,
      steps: [
        { kind: 'visits', page: null },
        { kind: 'goal', goal: 'go:trial' },
        { kind: 'arrival' },
        { kind: 'trial' },
        { kind: 'milestone', milestone: 'activation' },
        { kind: 'payment', number: 1 },
        { kind: 'type', sender: 'bot', type: 'purchase' },
      ],
    },
  ],
};

const STAGE2 = applySet(readSet(SUBSCRIPTION))(EMPTY_SETUP).state;

const AT = '2026-11-26T10:00:00.000Z';

const archived =
  (group: string, key: Record<string, unknown>) =>
  (setup: Setup): Setup =>
    archiveItem(ref(group, key), true, AT)(setup).state;

describe('часть метки — справочник с назначением parts', () => {
  it('новая часть: utm null, предел 20; у других назначений оба поля null', () => {
    const next = save('dictionary', {
      code: 'lang_part',
      name: 'Язык',
      purpose: 'parts',
    })(STAGE2);
    expect(next.dictionaries.at(-1)).toMatchObject({
      purpose: 'parts',
      utm: null,
      length: 20,
    });
    expect(STAGE2.dictionaries.find((_) => _.code === 'plan')).toMatchObject({
      purpose: 'values',
      utm: null,
      length: null,
    });
    // Элемент из списка с null можно прислать обратно; значение — отказ.
    expect(
      save('dictionary', { code: 'plan', utm: null, length: null })(STAGE2)
    ).toBe(STAGE2);
    for (const extra of [{ utm: 'utm_term' }, { length: 10 }]) {
      expect(
        code(() => save('dictionary', { code: 'plan', ...extra })(STAGE2))
      ).toBe('analytics.invalid_item');
    }
  });

  it('предел значения — 1–60; параметр — один из пяти UTM или null', () => {
    for (const length of [0, 61, 1.5, '10']) {
      expect(
        code(() => save('dictionary', { code: 'creative', length })(STAGE2))
      ).toBe('analytics.invalid_item');
    }
    expect(
      code(() =>
        save('dictionary', { code: 'creative', utm: 'utm_id' })(STAGE2)
      )
    ).toBe('analytics.invalid_item');
    const term = save('dictionary', { code: 'creative', utm: 'utm_term' })(
      STAGE2
    );
    expect(term.dictionaries.find((_) => _.code === 'creative')?.utm).toBe(
      'utm_term'
    );
  });

  it('один параметр UTM — не больше чем у одной части сайта', () => {
    expect(
      code(() =>
        save('dictionary', {
          code: 'medium2',
          name: 'Ещё тип',
          purpose: 'parts',
          utm: 'utm_medium',
        })(STAGE2)
      )
    ).toBe('analytics.invalid_item');
    expect(
      save('dictionary', {
        code: 'medium2',
        name: 'Ещё тип',
        purpose: 'parts',
        utm: null,
      })(STAGE2).dictionaries.at(-1)?.utm
    ).toBeNull();
  });

  it('значение части: строже кода и не длиннее предела своей части', () => {
    expect(
      save('value', { dictionary: 'source', code: 'fb', name: 'Facebook' })(
        STAGE2
      ).values.at(-1)?.code
    ).toBe('fb');
    for (const bad of ['a__b', 'a--b', '_ig', 'ig-', 'a_-b', 'x'.repeat(11)]) {
      expect([
        bad,
        code(() =>
          save('value', { dictionary: 'source', code: bad, name: 'X' })(STAGE2)
        ),
      ]).toEqual([bad, 'analytics.invalid_code']);
    }
    // В справочнике вариантов те же коды годятся.
    expect(
      save('value', { dictionary: 'plan', code: 'a__b', name: 'X' })(
        STAGE2
      ).values.at(-1)?.code
    ).toBe('a__b');
  });

  it('предел нельзя сделать меньше прежнего значения; назначение parts проверяет прежние значения', () => {
    const error = attempt(
      () => (save('dictionary', { code: 'entry', length: 4 })(STAGE2), ''),
      (_) => (_ as Error).message
    );
    expect(error).toContain('w-trial');
    expect(
      code(() => save('dictionary', { code: 'entry', length: 4 })(STAGE2))
    ).toBe('analytics.invalid_item');
    const loose = build(
      save('dictionary', { code: 'tags', name: 'Метки', purpose: 'values' }),
      save('value', { dictionary: 'tags', code: 'a__b', name: 'A' })
    );
    expect(
      code(() => save('dictionary', { code: 'tags', purpose: 'parts' })(loose))
    ).toBe('analytics.invalid_item');
  });

  it('назначение не меняется, пока на справочник ссылаются схема, соответствие или переход', () => {
    expect(
      code(() =>
        save('dictionary', { code: 'creative', purpose: 'values' })(STAGE2)
      )
    ).toBe('analytics.in_use');
    expect(
      code(() => save('dictionary', { code: 'plan', purpose: 'parts' })(STAGE2))
    ).toBe('analytics.in_use');
    // Без ссылок — меняется, а поля части уходят.
    const free = save('dictionary', {
      code: 'free',
      name: 'Свободная',
      purpose: 'parts',
      utm: 'utm_term',
    })(STAGE2);
    expect(
      save('dictionary', { code: 'free', purpose: 'values' })(
        free
      ).dictionaries.at(-1)
    ).toMatchObject({ purpose: 'values', utm: null, length: null });
  });

  it('у свойства-выбора справочник — только варианты, не часть', () => {
    expect(
      code(() =>
        save('property', {
          scope: 'event',
          code: 'where',
          name: 'Где',
          kind: 'choice',
          dictionary: 'source',
        })(STAGE2)
      )
    ).toBe('analytics.invalid_reference');
  });
});

describe('схема метки', () => {
  const schema = (input: Record<string, unknown>) => () =>
    save('schema', { sender: 'bot', ...input })(STAGE2);

  it('у новой: разделитель __, предел 64; ключ — код отправителя', () => {
    expect(STAGE2.schemas).toEqual([
      {
        sender: 'bot',
        name: 'Метка',
        note: '',
        separator: '__',
        length: 64,
        parts: ['entry', 'source', 'channel', 'campaign', 'creative'],
        archivedAt: null,
      },
    ]);
    expect(ref('schema', { sender: 'bot' }).key).toBe('bot');
    expect(code(() => ref('schema', { sender: 'Bot' }))).toBe(
      'analytics.invalid_code'
    );
  });

  it('части с разделителями помещаются в предел: 62 из 64, иначе — отказ с обеими цифрами', () => {
    const error = attempt(
      () => (schema({ length: 60 })(), ''),
      (_) => (_ as Error).message
    );
    expect(code(schema({ length: 60 }))).toBe('analytics.invalid_item');
    expect(error).toContain('up to 62 characters, the label up to 60');
    expect(schema({ length: 62 })().schemas[0]?.length).toBe(62);
    // Точка — знак на разделитель: 54 + 4.
    expect(schema({ length: 58, separator: '.' })().schemas[0]).toMatchObject({
      length: 58,
      separator: '.',
    });
  });

  it('то же — при правке предела части, которая стоит в схеме', () => {
    expect(
      save('dictionary', { code: 'campaign', length: 18 })(
        STAGE2
      ).dictionaries.find((_) => _.code === 'campaign')?.length
    ).toBe(18);
    const error = attempt(
      () => (save('dictionary', { code: 'campaign', length: 19 })(STAGE2), ''),
      (_) => (_ as Error).message
    );
    expect(error).toContain('up to 65 characters, the label up to 64');
  });

  it('части: 1–8 справочников с назначением parts без повторов; разделитель и предел — из списка', () => {
    for (const parts of [[], Array.from({ length: 9 }, () => 'entry')]) {
      expect(code(schema({ parts }))).toBe('analytics.invalid_item');
    }
    expect(code(schema({ parts: ['entry', 'entry'] }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(schema({ parts: ['entry', 'plan'] }))).toBe(
      'analytics.invalid_reference'
    );
    expect(code(schema({ parts: ['entry', 'nope'] }))).toBe(
      'analytics.invalid_reference'
    );
    for (const separator of ['_', '-', '/', '']) {
      expect(code(schema({ separator }))).toBe('analytics.invalid_item');
    }
    for (const length of [0, 257]) {
      expect(code(schema({ length }))).toBe('analytics.invalid_item');
    }
    expect(
      code(() =>
        save('schema', { sender: 'shop', name: 'Метка', parts: ['entry'] })(
          STAGE2
        )
      )
    ).toBe('analytics.invalid_reference');
    expect(
      code(() =>
        save('schema', { sender: 'shop2', name: 'Метка' })(
          save('sender', { code: 'shop2', name: 'Магазин' })(STAGE2)
        )
      )
    ).toBe('analytics.invalid_item');
  });

  it('часть в архиве в новую схему не берётся, в прежней остаётся', () => {
    const closed = archived('dictionary', { code: 'creative' })(STAGE2);
    expect(schema({ name: 'Метка бота' })().schemas[0]?.name).toBe(
      'Метка бота'
    );
    expect(
      save('schema', { sender: 'bot', name: 'Метка бота' })(closed).schemas[0]
        ?.parts
    ).toContain('creative');
    const shop = save('sender', { code: 'shop', name: 'Магазин' })(closed);
    expect(
      code(() =>
        save('schema', { sender: 'shop', name: 'М', parts: ['creative'] })(shop)
      )
    ).toBe('analytics.invalid_reference');
  });
});

describe('соответствия рефереров', () => {
  const rule = (input: Record<string, unknown>) => () =>
    save('referrer', { code: 'fb', name: 'Facebook', ...input })(STAGE2);

  it('шаблон хоста: строчными, без www., знаки a-z 0-9 . - и .* в конце, до 100', () => {
    expect(
      rule({ kind: 'host', host: ' WWW.Facebook.com ' })().referrers.at(-1)
        ?.host
    ).toBe('facebook.com');
    expect(
      rule({ kind: 'host', host: 'facebook.*' })().referrers.at(-1)?.host
    ).toBe('facebook.*');
    for (const host of [
      'face book.com',
      'https://facebook.com',
      '*.facebook.com',
      'facebook.*.com',
      'facebook.com/',
      `${'a'.repeat(97)}.com`,
      '',
    ]) {
      expect([host, code(rule({ kind: 'host', host }))]).toEqual([
        host,
        'analytics.invalid_item',
      ]);
    }
    expect(code(rule({ kind: 'host' }))).toBe('analytics.invalid_item');
  });

  it('два соответствия с одним шаблоном — отказ; any и none — по одному', () => {
    expect(code(rule({ kind: 'host', host: 'instagram.com' }))).toBe(
      'analytics.invalid_item'
    );
    expect(code(rule({ kind: 'any' }))).toBe('analytics.invalid_item');
    expect(code(rule({ kind: 'none' }))).toBe('analytics.invalid_item');
    expect(code(rule({ kind: 'other' }))).toBe('analytics.invalid_item');
  });

  it('{host} — только у any; у any и none хоста нет; смена вида снимает хост', () => {
    expect(
      code(
        rule({
          kind: 'host',
          host: 'facebook.com',
          parts: { source: '{host}' },
        })
      )
    ).toBe('analytics.invalid_item');
    expect(
      code(() =>
        save('referrer', { code: 'other-sites', host: 'example.com' })(STAGE2)
      )
    ).toBe('analytics.invalid_item');
    const none = save('referrer', { code: 'no-referrer', host: null })(STAGE2);
    expect(none).toBe(STAGE2);
    const freed = removeItem(
      ref('referrer', { code: 'other-sites' }),
      false
    )(STAGE2).state;
    expect(
      save('referrer', { code: 'instagram', kind: 'any' })(
        freed
      ).referrers.find((_) => _.code === 'instagram')
    ).toMatchObject({ kind: 'any', host: null });
  });

  it('значения — из справочников частей; часть — справочник с назначением parts', () => {
    expect(
      code(
        rule({ kind: 'host', host: 'facebook.com', parts: { source: 'fb' } })
      )
    ).toBe('analytics.invalid_reference');
    expect(
      code(rule({ kind: 'host', host: 'facebook.com', parts: { plan: '1m' } }))
    ).toBe('analytics.invalid_reference');
    expect(
      code(rule({ kind: 'host', host: 'facebook.com', parts: { source: 7 } }))
    ).toBe('analytics.invalid_item');
    expect(
      code(rule({ kind: 'host', host: 'facebook.com', parts: ['ig'] }))
    ).toBe('analytics.invalid_item');
    const closed = archived('value', { dictionary: 'source', code: 'ig' })(
      STAGE2
    );
    expect(
      code(() =>
        save('referrer', {
          code: 'fb',
          name: 'Facebook',
          kind: 'host',
          host: 'facebook.com',
          parts: { source: 'ig' },
        })(closed)
      )
    ).toBe('analytics.invalid_reference');
    expect(
      save('referrer', { code: 'instagram', name: 'Инстаграм' })(closed)
        .referrers[0]?.name
    ).toBe('Инстаграм');
  });
});

describe('переход', () => {
  const link = (input: Record<string, unknown>) => () =>
    save('link', { code: 'post-link', name: 'Пост', ...input })(STAGE2);

  it('адрес назначения — https с одним {label} после хоста; до 500 знаков', () => {
    expect(
      link({
        sender: 'bot',
        target: 'https://t.me/ExampleBot?start={label}',
      })().links.at(-1)
    ).toMatchObject({ sender: 'bot', parts: {} });
    for (const target of [
      'http://t.me/ExampleBot?start={label}',
      'tg://resolve?domain=ExampleBot&start={label}',
      'javascript:alert(1)//{label}',
      'https://t.me/ExampleBot',
      'https://t.me/{label}{label}',
      'https://{label}.example.com/',
      `https://t.me/${'a'.repeat(490)}?start={label}`,
    ]) {
      expect([target, code(link({ sender: 'bot', target }))]).toEqual([
        target,
        'analytics.invalid_item',
      ]);
    }
    expect(code(link({ sender: 'bot' }))).toBe('analytics.invalid_item');
  });

  it('отправитель — со схемой метки; части — из схемы, значения — из справочника', () => {
    const shop = save('sender', { code: 'shop', name: 'Магазин' })(STAGE2);
    expect(
      code(() =>
        save('link', {
          code: 'shop-link',
          name: 'Магазин',
          sender: 'shop',
          target: 'https://shop.example.com/?ref={label}',
        })(shop)
      )
    ).toBe('analytics.invalid_reference');
    const target = 'https://t.me/ExampleBot?start={label}';
    expect(code(link({ sender: 'bot', target, parts: { plan: '1m' } }))).toBe(
      'analytics.invalid_reference'
    );
    expect(code(link({ sender: 'bot', target, parts: { entry: 'bio' } }))).toBe(
      'analytics.invalid_reference'
    );
    expect(
      code(link({ sender: 'bot', target, parts: { source: '{host}' } }))
    ).toBe('analytics.invalid_reference');
    expect(
      link({
        sender: 'bot',
        target,
        parts: { entry: 'post', source: 'ig' },
      })().links.at(-1)?.parts
    ).toEqual({ entry: 'post', source: 'ig' });
  });

  it('у схемы в архиве новых переходов нет, прежний остаётся', () => {
    const closed = archived('schema', { sender: 'bot' })(STAGE2);
    expect(
      code(() =>
        save('link', {
          code: 'post-link',
          name: 'Пост',
          sender: 'bot',
          target: 'https://t.me/ExampleBot?start={label}',
        })(closed)
      )
    ).toBe('analytics.invalid_reference');
    expect(
      save('link', { code: 'trial', name: 'Пробный' })(closed).links[0]?.name
    ).toBe('Пробный');
  });
});

describe('веха', () => {
  const milestone = (input: Record<string, unknown>) => () =>
    save('milestone', {
      code: 'two',
      name: 'Два задания',
      sender: 'bot',
      type: 'task_done',
      ...input,
    })(STAGE2);

  it('у новой: count 1, без условия, без срока, от прихода, столбцом, в конец', () => {
    expect(milestone({})().milestones.at(-1)).toEqual({
      code: 'two',
      name: 'Два задания',
      note: '',
      sender: 'bot',
      type: 'task_done',
      count: 1,
      condition: null,
      days: null,
      anchor: null,
      column: true,
      position: 1,
      archivedAt: null,
    });
    expect(STAGE2.milestones[0]).toMatchObject({
      condition: { property: 'items_n', gte: 2 },
      days: 3,
      position: 0,
    });
  });

  it('count — 1–1000, окно — 1–365 дней или null; тип — есть у отправителя', () => {
    for (const input of [
      { count: 0 },
      { count: 1001 },
      { days: 0 },
      { days: 366 },
      { days: 1.5 },
      { column: 'yes' },
    ]) {
      expect(code(milestone(input))).toBe('analytics.invalid_item');
    }
    expect(
      milestone({ count: 1000, days: 365 })().milestones.at(-1)
    ).toMatchObject({ count: 1000, days: 365 });
    expect(code(milestone({ type: 'nope' }))).toBe(
      'analytics.invalid_reference'
    );
    expect(code(milestone({ sender: 'shop' }))).toBe(
      'analytics.invalid_reference'
    );
    expect(code(milestone({ type: undefined }))).toBe('analytics.invalid_item');
  });

  it('gte — только у числа; eq — выбор из справочника, да или нет, число', () => {
    expect(
      code(milestone({ condition: { property: 'own_material', gte: 1 } }))
    ).toBe('analytics.invalid_reference');
    expect(
      milestone({ condition: { property: 'plan', eq: '3m' } })().milestones.at(
        -1
      )?.condition
    ).toEqual({ property: 'plan', eq: '3m' });
    expect(
      code(milestone({ condition: { property: 'plan', eq: '12m' } }))
    ).toBe('analytics.invalid_reference');
    expect(code(milestone({ condition: { property: 'plan', eq: 3 } }))).toBe(
      'analytics.invalid_item'
    );
    expect(
      milestone({
        condition: { property: 'own_material', eq: true },
      })().milestones.at(-1)?.condition
    ).toEqual({ property: 'own_material', eq: true });
    expect(
      code(milestone({ condition: { property: 'own_material', eq: 'yes' } }))
    ).toBe('analytics.invalid_item');
    expect(
      milestone({ condition: { property: 'items_n', eq: 3 } })().milestones.at(
        -1
      )?.condition
    ).toEqual({ property: 'items_n', eq: 3 });
    expect(
      code(milestone({ condition: { property: 'comment', eq: 'x' } }))
    ).toBe('analytics.invalid_reference');
  });

  it('условие — на свойство, объявленное в типе; ровно одно из gte и eq', () => {
    expect(
      code(
        milestone({
          type: 'purchase',
          condition: { property: 'items_n', gte: 2 },
        })
      )
    ).toBe('analytics.invalid_reference');
    for (const condition of [
      { property: 'items_n' },
      { property: 'items_n', gte: 2, eq: 2 },
      { property: 'items_n', gte: '2' },
      { property: 'items_n', lte: 2 },
      'items_n >= 2',
    ]) {
      expect(code(milestone({ condition }))).toBe('analytics.invalid_item');
    }
  });

  it('начало окна — тип того же отправителя', () => {
    expect(
      milestone({ anchor: 'trial_started' })().milestones.at(-1)?.anchor
    ).toBe('trial_started');
    expect(code(milestone({ anchor: 'nope' }))).toBe(
      'analytics.invalid_reference'
    );
    const shop = build(
      save('sender', { code: 'shop', name: 'Магазин' }),
      save('type', {
        sender: 'shop',
        code: 'order',
        name: 'Заказ',
        role: 'payment',
      })
    );
    expect(
      code(() =>
        save('milestone', {
          code: 'two',
          name: 'Два',
          sender: 'bot',
          type: 'task_done',
          anchor: 'order',
        })({
          ...STAGE2,
          senders: [...STAGE2.senders, ...shop.senders],
          types: [...STAGE2.types, ...shop.types],
        })
      )
    ).toBe('analytics.invalid_reference');
  });
});

describe('воронка', () => {
  const funnel = (input: Record<string, unknown>) => () =>
    save('funnel', { code: 'short', name: 'Короткая', ...input })(STAGE2);
  const steps = (...rest: unknown[]) => [{ kind: 'arrival' }, ...rest];

  it('шагов 2–8; по умолчанию свободный порядок, не основная, в конец', () => {
    expect(
      funnel({ steps: steps({ kind: 'trial' }) })().funnels.at(-1)
    ).toMatchObject({ strict: false, main: false, position: 1 });
    expect(code(funnel({ steps: steps() }))).toBe('analytics.invalid_item');
    expect(
      code(
        funnel({
          steps: steps(
            ...Array.from({ length: 8 }, (_, i) => ({
              kind: 'payment',
              number: i + 1,
            }))
          ),
        })
      )
    ).toBe('analytics.invalid_item');
    expect(code(funnel({}))).toBe('analytics.invalid_item');
  });

  it('шаги-посещения до шагов-людей, граница одна', () => {
    expect(code(funnel({ steps: steps({ kind: 'visits', page: null }) }))).toBe(
      'analytics.invalid_item'
    );
    expect(
      code(
        funnel({
          steps: [
            { kind: 'visits' },
            { kind: 'arrival' },
            { kind: 'goal', goal: 'go:' },
          ],
        })
      )
    ).toBe('analytics.invalid_item');
    expect(
      funnel({
        steps: [
          { kind: 'visits', page: '/trial' },
          { kind: 'goal', goal: 'form:call-back' },
          { kind: 'arrival' },
        ],
      })().funnels.at(-1)?.steps
    ).toEqual([
      { kind: 'visits', page: '/trial' },
      { kind: 'goal', goal: 'form:call-back' },
      { kind: 'arrival' },
    ]);
  });

  it('шаги по виду: поля, цель, номер оплаты, путь страницы', () => {
    for (const step of [
      { kind: 'goal', goal: 'click' },
      { kind: 'goal', goal: 'form:Call' },
      { kind: 'goal', goal: 'go:Trial' },
      { kind: 'payment', number: 0 },
      { kind: 'payment', number: 13 },
      { kind: 'visits', page: 'trial' },
      { kind: 'visits', page: '/a b' },
      { kind: 'arrival', page: '/' },
      { kind: 'lapse' },
      'arrival',
    ]) {
      expect([
        step,
        code(funnel({ steps: [{ kind: 'visits' }, step] })),
      ]).toEqual([step, 'analytics.invalid_item']);
    }
  });

  it('переход, веха и тип должны быть; в архиве — только если воронка уже на них ссылалась', () => {
    for (const step of [
      { kind: 'goal', goal: 'go:nope' },
      { kind: 'milestone', milestone: 'nope' },
      { kind: 'type', sender: 'bot', type: 'nope' },
    ]) {
      expect(code(funnel({ steps: steps(step) }))).toBe(
        'analytics.invalid_reference'
      );
    }
    const closed = archived('link', { code: 'trial' })(STAGE2);
    expect(
      code(() =>
        save('funnel', {
          code: 'short',
          name: 'Короткая',
          steps: [{ kind: 'goal', goal: 'go:trial' }, { kind: 'arrival' }],
        })(closed)
      )
    ).toBe('analytics.invalid_reference');
    expect(
      save('funnel', { code: 'journey', name: 'Путь клиента' })(closed)
        .funnels[0]?.name
    ).toBe('Путь клиента');
  });

  it('основная одна: новая основная снимает отметку с прежней той же правкой — две строки журнала', () => {
    const next = saveItem('funnel', {
      code: 'short',
      name: 'Короткая',
      main: true,
      steps: steps({ kind: 'trial' }),
    })(STAGE2);
    expect(next.state.revision).toBe(STAGE2.revision + 1);
    expect(next.state.funnels.map((_) => [_.code, _.main])).toEqual([
      ['journey', false],
      ['short', true],
    ]);
    expect(
      itemLog(changesOf(STAGE2, next.state), AUTHOR, AT).map((_) => [
        _.item,
        _.key,
        _.action,
      ])
    ).toEqual([
      ['funnel', 'journey', 'changed'],
      ['funnel', 'short', 'created'],
    ]);
  });
});

describe('удаление по таблице «Кто ссылается»', () => {
  const remove = (group: string, key: Record<string, unknown>) => () =>
    removeItem(ref(group, key), false)(STAGE2);
  const message = (run: () => unknown): string =>
    attempt(
      () => (run(), ''),
      (_) => (_ as Error).message
    );

  it('ссылаются — analytics.in_use с перечнем', () => {
    const shop = build(
      save('sender', { code: 'shop', name: 'Магазин' }),
      save('dictionary', { code: 'zone', name: 'Зона', purpose: 'parts' }),
      save('schema', { sender: 'shop', name: 'Метка', parts: ['zone'] })
    );
    expect(
      message(() => removeItem(ref('sender', { code: 'shop' }), false)(shop))
    ).toContain('label schema shop');
    const rows: readonly (readonly [
      string,
      Record<string, unknown>,
      string,
    ])[] = [
      ['sender', { code: 'bot' }, 'label schema bot and 2 more'],
      ['type', { sender: 'bot', code: 'task_done' }, 'milestone activation'],
      ['type', { sender: 'bot', code: 'purchase' }, 'funnel journey'],
      ['property', { scope: 'event', code: 'items_n' }, 'milestone activation'],
      ['dictionary', { code: 'entry' }, 'label schema bot'],
      ['dictionary', { code: 'source' }, 'referrer rule instagram'],
      ['dictionary', { code: 'entry' }, 'link trial'],
      [
        'value',
        { dictionary: 'source', code: 'ig' },
        'referrer rule instagram',
      ],
      ['value', { dictionary: 'entry', code: 'w-trial' }, 'link trial'],
      ['schema', { sender: 'bot' }, 'link trial'],
      ['link', { code: 'trial' }, 'funnel journey'],
      ['milestone', { code: 'activation' }, 'funnel journey'],
    ];
    for (const { 0: group, 1: key, 2: user } of rows) {
      expect([group, key, code(remove(group, key))]).toEqual([
        group,
        key,
        'analytics.in_use',
      ]);
      expect(message(remove(group, key))).toContain(user);
    }
  });

  it('значение в условии вехи (eq у выбора) держит значение справочника вариантов', () => {
    const plan = save('milestone', {
      code: 'three',
      name: 'Три месяца',
      sender: 'bot',
      type: 'task_done',
      condition: { property: 'plan', eq: '3m' },
    })(STAGE2);
    expect(
      message(() =>
        removeItem(
          ref('value', { dictionary: 'plan', code: '3m' }),
          false
        )(plan)
      )
    ).toContain('milestone three');
    expect(
      removeItem(
        ref('value', { dictionary: 'plan', code: '1m' }),
        false
      )(plan).state.values.some((_) => _.code === '1m')
    ).toBe(false);
  });

  it('соответствие и воронку можно удалить всегда, остальное — когда ссылки ушли', () => {
    expect(
      remove('referrer', { code: 'instagram' })().state.referrers
    ).toHaveLength(2);
    const free = removeItem(
      ref('funnel', { code: 'journey' }),
      false
    )(STAGE2).state;
    expect(free.funnels).toEqual([]);
    const done = [
      ref('milestone', { code: 'activation' }),
      ref('link', { code: 'trial' }),
      ref('schema', { sender: 'bot' }),
    ].reduce((setup, key) => removeItem(key, false)(setup).state, free);
    expect([done.milestones, done.links, done.schemas]).toEqual([[], [], []]);
    expect(done.revision).toBe(STAGE2.revision + 4);
  });
});

describe('набор этапа 2', () => {
  it('новые группы применяются на пустую настройку одной ревизией в порядке зависимостей', () => {
    // Порядок полей в наборе не важен: воронки и вехи раньше справочников.
    const { funnels, milestones, links, ...rest } = SUBSCRIPTION;
    const shuffled = { funnels, milestones, links, ...rest };
    const { state, events } = applySet(readSet(shuffled))(EMPTY_SETUP);
    expect(state.revision).toBe(1);
    expect(events).toEqual([{ type: 'analytics.setup_changed', revision: 1 }]);
    expect(state).toEqual(STAGE2);
    expect(
      [
        state.schemas,
        state.referrers,
        state.links,
        state.milestones,
        state.funnels,
      ].map((_) => _.length)
    ).toEqual([1, 3, 1, 1, 1]);
    expect(applySet(readSet(SUBSCRIPTION))(state).state).toBe(state);
  });

  it('ошибки элементов новых групп — по путям, ничего не применено', () => {
    const broken = {
      ...SUBSCRIPTION,
      links: [{ ...SUBSCRIPTION.links[0], target: 'http://t.me/{label}' }],
      funnels: [{ ...SUBSCRIPTION.funnels[0], steps: [{ kind: 'arrival' }] }],
    };
    const error = attempt(
      () => (applySet(readSet(broken))(EMPTY_SETUP), null),
      (_) => _
    );
    expect(Object.keys(setErrorsOf(error))).toEqual(['links[0]', 'funnels[0]']);
  });

  it('группа, которой эта Eile не знает, — отказ всего набора; реестр меток в набор не идёт', () => {
    for (const extra of [{ spend: [] }, { labels: [] }, { rates: [] }]) {
      expect(code(() => readSet({ ...SUBSCRIPTION, ...extra }))).toBe(
        'analytics.invalid_set'
      );
    }
    expect(code(() => readSet({ ...SUBSCRIPTION, schemas: {} }))).toBe(
      'analytics.invalid_set'
    );
  });

  it('правка соответствия, перехода и воронки тоже повышает ревизию', () => {
    for (const { 0: group, 1: item } of [
      ['referrer', { code: 'instagram', name: 'IG' }],
      ['link', { code: 'trial', name: 'Пробный' }],
      ['funnel', { code: 'journey', strict: true }],
    ] as const) {
      const next = saveItem(group, item)(STAGE2);
      expect([group, next.state.revision]).toEqual([
        group,
        STAGE2.revision + 1,
      ]);
    }
  });
});

describe('«ждёт расхода»', () => {
  const PARTS = build(
    save('dictionary', { code: 'channel', name: 'Тип', purpose: 'parts' }),
    save('value', { dictionary: 'channel', code: 'paid', name: 'Платная' }),
    save('dictionary', { code: 'tiers', name: 'Тарифы', purpose: 'values' }),
    save('value', { dictionary: 'tiers', code: 'basic', name: 'Базовый' })
  );
  const value = (setup: Setup, dictionary: string, code: string) =>
    setup.values.find((_) => _.dictionary === dictionary && _.code === code);
  const spent = { spend: (dictionary: string) => dictionary === 'channel' };

  it('только у значения части: у нового false, у других назначений null, true — отказ', () => {
    expect(value(PARTS, 'channel', 'paid')?.awaitsSpend).toBe(false);
    expect(value(PARTS, 'tiers', 'basic')?.awaitsSpend).toBeNull();
    const marked = saveItem('value', {
      dictionary: 'channel',
      code: 'paid',
      awaitsSpend: true,
    })(PARTS);
    expect(value(marked.state, 'channel', 'paid')?.awaitsSpend).toBe(true);
    // Отметка — настройка: ревизия растёт, журнал пишет значение.
    expect(marked.state.revision).toBe(PARTS.revision + 1);
    expect(
      itemLog(changesOf(PARTS, marked.state), AUTHOR, '2026-11-25T10:00:00Z')
    ).toMatchObject([
      { item: 'value', key: 'channel/paid', action: 'changed' },
    ]);
    expect(
      code(() =>
        saveItem('value', {
          dictionary: 'tiers',
          code: 'basic',
          awaitsSpend: true,
        })(PARTS)
      )
    ).toBe('analytics.invalid_item');
    expect(
      code(() =>
        saveItem('value', {
          dictionary: 'channel',
          code: 'paid',
          awaitsSpend: 'yes',
        })(PARTS)
      )
    ).toBe('analytics.invalid_item');
    expect(
      value(
        save('value', {
          dictionary: 'tiers',
          code: 'basic',
          awaitsSpend: false,
        })(PARTS),
        'tiers',
        'basic'
      )?.awaitsSpend
    ).toBeNull();
  });

  it('смена назначения: ушёл из частей — null, пришёл — false; со строками расхода — analytics.in_use', () => {
    const marked = save('value', {
      dictionary: 'channel',
      code: 'paid',
      awaitsSpend: true,
    })(PARTS);
    const left = saveItem('dictionary', { code: 'channel', purpose: 'values' })(
      marked
    );
    expect(value(left.state, 'channel', 'paid')?.awaitsSpend).toBeNull();
    // Справочник и его значение — одной правкой и одной ревизией.
    expect(left.state.revision).toBe(marked.revision + 1);
    expect(changesOf(marked, left.state).map((_) => [_.group, _.key])).toEqual([
      ['dictionary', 'channel'],
      ['value', 'channel/paid'],
    ]);
    const back = save('dictionary', { code: 'tiers', purpose: 'parts' })(PARTS);
    expect(value(back, 'tiers', 'basic')?.awaitsSpend).toBe(false);
    expect(
      code(() =>
        saveItem(
          'dictionary',
          { code: 'channel', purpose: 'values' },
          spent
        )(marked)
      )
    ).toBe('analytics.in_use');
    // Расход у другой части назначения не держит; имя и заметку менять можно.
    expect(
      saveItem(
        'dictionary',
        { code: 'channel', name: 'Канал' },
        spent
      )(marked).state.dictionaries.find((_) => _.code === 'channel')?.name
    ).toBe('Канал');
  });

  it('набор переносит отметку; смена назначения набором при расходе — отказ', () => {
    const set = {
      format: 'eile-analytics-set',
      version: 1,
      name: 'Части',
      dictionaries: [
        {
          code: 'channel',
          name: 'Тип',
          purpose: 'parts',
          values: [{ code: 'paid', name: 'Платная', awaitsSpend: true }],
        },
      ],
    };
    const applied = applySet(readSet(set))(EMPTY_SETUP).state;
    expect(value(applied, 'channel', 'paid')?.awaitsSpend).toBe(true);
    expect(
      code(() =>
        applySet(
          readSet({
            ...set,
            dictionaries: [{ code: 'channel', name: 'Тип', purpose: 'values' }],
          }),
          spent
        )(applied)
      )
    ).toBe('analytics.invalid_set');
  });

  it('удалить значение или часть со строками расхода нельзя — analytics.in_use; без них — можно', () => {
    const key = ref('value', { dictionary: 'channel', code: 'paid' });
    expect(code(() => removeItem(key, false, true)(PARTS))).toBe(
      'analytics.in_use'
    );
    expect(
      attempt(
        () => (removeItem(key, false, true)(PARTS), ''),
        (error) => (error as Error).message
      )
    ).toContain('spend rows');
    const freed = removeItem(key, false, false)(PARTS).state;
    expect(value(freed, 'channel', 'paid')).toBeUndefined();
    expect(
      code(() =>
        removeItem(ref('dictionary', { code: 'channel' }), false, true)(freed)
      )
    ).toBe('analytics.in_use');
    expect(
      removeItem(
        ref('dictionary', { code: 'channel' }),
        false
      )(freed).state.dictionaries.map((_) => _.code)
    ).toEqual(['tiers']);
  });
});

describe('группа check: поправки встроенных проверок', () => {
  it('поправка — элемент со встроенным кодом: ревизия растёт, журнал пишет check; без изменений — ни ревизии, ни строки', () => {
    const corrected = saveItem('check', {
      code: 'events_arrived',
      params: { missing: 2 },
      notify: 'any',
      note: 'бот шлёт сводку до последних повторов',
    })(BASE);
    expect(corrected.state.revision).toBe(BASE.revision + 1);
    expect(corrected.state.checks).toEqual([
      {
        code: 'events_arrived',
        name: '',
        note: 'бот шлёт сводку до последних повторов',
        enabled: true,
        notify: 'any',
        params: { missing: 2 },
        archivedAt: null,
      },
    ]);
    expect(
      itemLog(
        changesOf(BASE, corrected.state),
        AUTHOR,
        '2026-11-25T10:00:00.000Z'
      ).map((_) => [_.item, _.key, _.action])
    ).toEqual([['check', 'events_arrived', 'created']]);
    // Поля, которых нет во входе, остаются прежними.
    const again = saveItem('check', { code: 'events_arrived', notify: 'any' })(
      corrected.state
    );
    expect(again.events).toEqual([]);
    expect(again.state.checks[0]?.params).toEqual({ missing: 2 });
  });

  it('архива у встроенной нет — выключите её; удаление поправки — значения ядра; у «мало данных» нет «включена»', () => {
    const corrected = save('check', {
      code: 'labels_readable',
      enabled: false,
    })(BASE);
    const key = ref('check', { code: 'labels_readable' });
    expect(code(() => archiveItem(key, true, '2026-11-25')(corrected))).toBe(
      'analytics.invalid_item'
    );
    expect(removeItem(key, false)(corrected).state.checks).toEqual([]);
    expect(
      code(() => save('check', { code: 'low_data', enabled: false })(BASE))
    ).toBe('analytics.invalid_item');
    expect(
      save('check', { code: 'low_data', params: { people: 5, customers: 2 } })(
        BASE
      ).checks[0]?.params
    ).toEqual({ people: 5, customers: 2 });
    // Код не из встроенных — своя пороговая: без правила — отказ правила.
    expect(
      code(() => save('check', { code: 'paid_daily', name: 'Оплаты' })(BASE))
    ).toBe('analytics.invalid_check');
    expect(code(() => save('check', { code: 'Events' })(BASE))).toBe(
      'analytics.invalid_code'
    );
  });
});

describe('группа check: свои пороговые', () => {
  const RULE = {
    metric: 'role',
    role: 'payment',
    compare: 'lt',
    threshold: 1,
    days: 1,
    severity: 'warning',
  };
  const own = (item: Record<string, unknown>) =>
    save('check', { code: 'paid_daily', name: 'Оплаты за сутки', ...item });

  it('код не из встроенных — своя: правило по показателю, поля других показателей — null; журнал пишет check', () => {
    const changed = saveItem('check', {
      code: 'paid_daily',
      name: 'Оплаты за сутки',
      notify: 'any',
      params: RULE,
    })(STAGE2);
    expect(changed.state.revision).toBe(STAGE2.revision + 1);
    expect(changed.state.checks).toEqual([
      {
        code: 'paid_daily',
        name: 'Оплаты за сутки',
        note: '',
        enabled: true,
        notify: 'any',
        params: {
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
        },
        archivedAt: null,
      },
    ]);
    expect(
      itemLog(changesOf(STAGE2, changed.state), AUTHOR, AT).map((_) => [
        _.item,
        _.key,
        _.action,
      ])
    ).toEqual([['check', 'paid_daily', 'created']]);
    // Правка без params — правило прежнее; «уведомлять» по умолчанию — при сбое.
    const renamed = own({ name: 'Оплаты' })(changed.state);
    expect(renamed.checks[0]?.params).toEqual(changed.state.checks[0]?.params);
    expect(own({ params: RULE })(STAGE2).checks[0]?.notify).toBe('failure');
    // Выручка: порог — деньгами валюты строкой или целым минимальных единиц.
    for (const threshold of ['500.00', 50_000]) {
      expect(
        own({
          params: {
            metric: 'revenue',
            currency: 'EUR',
            compare: 'lt',
            threshold,
            days: 7,
            severity: 'failure',
          },
        })(STAGE2).checks[0]?.params
      ).toMatchObject({ currency: 'EUR', threshold: 50_000, days: 7 });
    }
  });

  it('негодное правило — analytics.invalid_check; нет названия — invalid_item; плохой код — invalid_code', () => {
    for (const params of [
      { ...RULE, metric: 'sales' },
      { ...RULE, role: 'summary' },
      { ...RULE, role: null },
      { ...RULE, compare: 'eq' },
      { ...RULE, threshold: 100_001 },
      { ...RULE, threshold: 1.5 },
      { ...RULE, days: 14 },
      { ...RULE, severity: 'info' },
      { ...RULE, currency: 'EUR' },
      { ...RULE, goal: 'go:trial' },
      { ...RULE, extra: 1 },
      {
        metric: 'events',
        sender: 'bot',
        compare: 'lt',
        threshold: 1,
        days: 1,
        severity: 'warning',
      },
      {
        metric: 'revenue',
        currency: 'EUR',
        compare: 'lt',
        threshold: '5.001',
        days: 1,
        severity: 'warning',
      },
      {
        metric: 'goal',
        goal: 'page:/x',
        compare: 'lt',
        threshold: 1,
        days: 1,
        severity: 'warning',
      },
      'role',
    ]) {
      expect([params, code(() => own({ params })(STAGE2))]).toEqual([
        params,
        'analytics.invalid_check',
      ]);
    }
    expect(code(() => own({})(STAGE2))).toBe('analytics.invalid_check');
    expect(
      code(() => save('check', { code: 'paid_daily', params: RULE })(STAGE2))
    ).toBe('analytics.invalid_item');
    expect(
      code(() =>
        save('check', { code: 'Paid', name: 'x', params: RULE })(STAGE2)
      )
    ).toBe('analytics.invalid_code');
  });

  it('ссылки: отправитель, тип и переход есть; в архиве — только уже стоявшие', () => {
    const events = {
      metric: 'events',
      sender: 'bot',
      type: 'purchase',
      compare: 'lt',
      threshold: 1,
      days: 7,
      severity: 'warning',
    };
    const goal = {
      metric: 'goal',
      goal: 'go:trial',
      compare: 'lt',
      threshold: 5,
      days: 1,
      severity: 'warning',
    };
    expect(own({ params: events })(STAGE2).checks[0]?.params).toMatchObject({
      sender: 'bot',
      type: 'purchase',
    });
    expect(own({ params: goal })(STAGE2).checks).toHaveLength(1);
    for (const params of [
      { ...events, sender: 'shop' },
      { ...events, type: 'order_paid' },
      { ...goal, goal: 'go:nope' },
      { ...RULE, sender: 'shop' },
    ]) {
      expect(code(() => own({ params })(STAGE2))).toBe(
        'analytics.invalid_reference'
      );
    }
    // Тип в архиве: новая ссылка — отказ, правка проверки, которая уже на него ссылалась, — можно.
    const linked = own({ params: events })(STAGE2);
    const shelved = archived('type', { sender: 'bot', code: 'purchase' })(
      linked
    );
    expect(own({ name: 'Оплаты недели' })(shelved).checks[0]?.name).toBe(
      'Оплаты недели'
    );
    expect(
      code(() =>
        save('check', { code: 'other', name: 'Другая', params: events })(
          shelved
        )
      )
    ).toBe('analytics.invalid_reference');
  });

  it('удалить отправителя, тип и переход, на которые ссылается проверка, нельзя — analytics.in_use; в архив — можно', () => {
    const linked = build(
      () => STAGE2,
      own({
        params: {
          metric: 'events',
          sender: 'bot',
          type: 'task_done',
          compare: 'lt',
          threshold: 1,
          days: 1,
          severity: 'warning',
        },
      }),
      save('check', {
        code: 'trial_clicks',
        name: 'Нажатия «Попробовать»',
        params: {
          metric: 'goal',
          goal: 'go:trial',
          compare: 'lt',
          threshold: 5,
          days: 7,
          severity: 'warning',
        },
      })
    );
    const type = ref('type', { sender: 'bot', code: 'task_done' });
    expect(code(() => removeItem(type, false)(linked))).toBe(
      'analytics.in_use'
    );
    expect(
      attempt(
        () => (removeItem(type, false)(linked), ''),
        (error) => (error as Error).message
      )
    ).toContain('check paid_daily');
    expect(
      attempt(
        () => (removeItem(ref('link', { code: 'trial' }), false)(linked), ''),
        (error) => (error as Error).message
      )
    ).toContain('check trial_clicks');
    // Отправитель, на которого ссылается только проверка с ролью у одного отправителя.
    const app = build(
      () => linked,
      save('sender', { code: 'app', name: 'Приложение' }),
      save('check', {
        code: 'app_payments',
        name: 'Оплаты в приложении',
        params: { ...RULE, sender: 'app' },
      })
    );
    expect(
      attempt(
        () => (removeItem(ref('sender', { code: 'app' }), false)(app), ''),
        (error) => (error as Error).message
      )
    ).toBe('Sender app is used by check app_payments: archive it instead');
    expect(
      archived('type', { sender: 'bot', code: 'task_done' })(linked).types.find(
        (_) => _.code === 'task_done'
      )?.archivedAt
    ).toBe(AT);
  });

  it('своя — в архив и обратно, удаление без результатов — можно, с ними — in_use; 21-я — too_many, в архиве — в счёте', () => {
    const one = own({ params: RULE })(STAGE2);
    const key = ref('check', { code: 'paid_daily' });
    const shelved = archiveItem(key, true, AT)(one).state;
    expect(shelved.checks[0]?.archivedAt).toBe(AT);
    expect(
      archiveItem(key, false, AT)(shelved).state.checks[0]?.archivedAt
    ).toBeNull();
    expect(removeItem(key, false)(one).state.checks).toEqual([]);
    expect(code(() => removeItem(key, true)(one))).toBe('analytics.in_use');
    expect(
      attempt(
        () => (removeItem(key, true)(one), ''),
        (error) => (error as Error).message
      )
    ).toContain('results of days');
    const twenty = Array.from({ length: 19 }, (_, n) => n).reduce(
      (setup, n) =>
        save('check', {
          code: `rule_${n}`,
          name: `Правило ${n}`,
          params: RULE,
        })(setup),
      shelved
    );
    expect(twenty.checks).toHaveLength(20);
    expect(
      code(() =>
        save('check', { code: 'rule_20', name: 'Ещё', params: RULE })(twenty)
      )
    ).toBe('analytics.too_many');
    // Поправки встроенных — не в счёте своих.
    expect(
      save('check', { code: 'events_arrived', params: { missing: 1 } })(twenty)
        .checks
    ).toHaveLength(21);
  });
});

describe('отметка сверки свойства', () => {
  const mark = (code: string, kind: string, reconcile: unknown) =>
    save('property', { scope: 'event', code, name: code, kind, reconcile });

  it('у свойства событий нужного вида: номер — число, дата — дата, остальное — да или нет; по умолчанию null', () => {
    const marked = build(
      () => BASE,
      mark('purchase_n', 'number', 'payment_number'),
      mark('first_paid', 'date', 'customer_since'),
      mark('after_trial', 'boolean', 'after_trial'),
      mark('returning', 'boolean', 'returning')
    );
    expect(marked.properties.map((_) => [_.code, _.reconcile])).toEqual([
      ['tier', null],
      ['purchase_n', 'payment_number'],
      ['first_paid', 'customer_since'],
      ['after_trial', 'after_trial'],
      ['returning', 'returning'],
    ]);
    // Правка без поля — отметка прежняя; null — снять.
    expect(
      save('property', { scope: 'event', code: 'purchase_n', name: 'Номер' })(
        marked
      ).properties.find((_) => _.code === 'purchase_n')?.reconcile
    ).toBe('payment_number');
    expect(
      mark(
        'purchase_n',
        'number',
        null
      )(marked).properties.find((_) => _.code === 'purchase_n')?.reconcile
    ).toBeNull();
  });

  it('не того вида, у признака, незнакомая отметка, второе свойство на ту же отметку — invalid_item', () => {
    const marked = mark('purchase_n', 'number', 'payment_number')(BASE);
    for (const step of [
      mark('first_paid', 'string', 'customer_since'),
      mark('flag', 'number', 'after_trial'),
      mark('n', 'number', 'number'),
      mark('again_n', 'number', 'payment_number'),
      save('property', {
        scope: 'person',
        code: 'paid_n',
        name: 'Номер',
        kind: 'number',
        reconcile: 'payment_number',
      }),
      // Смена вида свойства с отметкой — тоже отказ.
      save('property', { scope: 'event', code: 'purchase_n', kind: 'string' }),
    ]) {
      expect(code(() => step(marked))).toBe('analytics.invalid_item');
    }
  });
});

describe('перенос набора', () => {
  const META = {
    name: 'Сайт 2026-11-26',
    eile: '0.2.0',
    exportedAt: '2026-11-26T10:00:00.000Z',
  };
  const FACTS: SetFacts = {
    holds: NO_HOLDS,
    events: () => false,
    version: '0.2.0',
    at: '2026-11-27T08:00:00.000Z',
  };
  const RULE = {
    metric: 'events',
    sender: 'bot',
    type: 'old_start',
    compare: 'lt',
    threshold: 1,
    days: 1,
    severity: 'warning',
  };
  // Настройка этапов 1–4: час сводки, тип в архиве со своей проверкой на него, отметка сверки, поправки
  // встроенных проверок и «мало данных», своя по выручке — в архиве.
  const RICH = build(
    () => STAGE2,
    save('sender', { code: 'bot', summaryAt: '03:30' }),
    save('type', {
      sender: 'bot',
      code: 'old_start',
      name: 'Старт (старый бот)',
      role: 'touch',
    }),
    save('property', {
      scope: 'event',
      code: 'purchase_n',
      name: 'Номер оплаты',
      kind: 'number',
      reconcile: 'payment_number',
    }),
    save('check', { code: 'events_arrived', params: { missing: 2 } }),
    save('check', { code: 'low_data', params: { people: 5 } }),
    save('check', { code: 'starts_daily', name: 'Старты', params: RULE }),
    save('check', {
      code: 'revenue_week',
      name: 'Выручка недели',
      params: {
        metric: 'revenue',
        currency: 'EUR',
        compare: 'lt',
        threshold: '500.00',
        days: 7,
        severity: 'failure',
      },
    }),
    archived('type', { sender: 'bot', code: 'old_start' }),
    archived('check', { code: 'revenue_week' })
  );
  const file = (setup: Setup = RICH) =>
    JSON.parse(JSON.stringify(exportSet(setup, META))) as AnalyticsSet;
  const draft = (raw: unknown, setup: Setup = EMPTY_SETUP, facts = FACTS) =>
    draftSet(readSetFile(raw), facts)(setup);

  it('выгрузка: обёртка, группы в порядке применения, элементы по ключу, все поля явно, archived — только у архива', () => {
    const set = file();
    expect(Object.keys(set)).toEqual([
      'format',
      'version',
      'name',
      'eile',
      'exportedAt',
      'senders',
      'dictionaries',
      'properties',
      'types',
      'schemas',
      'referrers',
      'links',
      'milestones',
      'funnels',
      'checks',
    ]);
    expect(set).toMatchObject({ format: 'eile-analytics-set', version: 1 });
    expect(set.senders).toEqual([
      {
        code: 'bot',
        name: 'Бот',
        note: '',
        enabled: true,
        summaryAt: '03:30',
      },
    ]);
    expect(set.types?.map((_) => `${_.sender}/${_.code}`)).toEqual([
      'bot/bot_start',
      'bot/old_start',
      'bot/purchase',
      'bot/task_done',
      'bot/trial_started',
    ]);
    expect(set.types?.find((_) => _.code === 'old_start')).toEqual({
      sender: 'bot',
      code: 'old_start',
      name: 'Старт (старый бот)',
      note: '',
      role: 'touch',
      properties: [],
      archived: true,
    });
    expect(set.types?.filter((_) => 'archived' in _)).toHaveLength(1);
    // Значения по умолчанию — явно: у справочника вариантов utm и length null, у значений — awaitsSpend null.
    expect(set.dictionaries?.find((_) => _.code === 'plan')).toEqual({
      code: 'plan',
      name: 'Тариф',
      note: '',
      purpose: 'values',
      utm: null,
      length: null,
      values: [
        {
          code: '1m',
          name: '1 месяц',
          note: '',
          position: 0,
          awaitsSpend: null,
        },
        {
          code: '3m',
          name: '3 месяца',
          note: '',
          position: 1,
          awaitsSpend: null,
        },
      ],
    });
    expect(set.properties?.find((_) => _.code === 'purchase_n')).toEqual({
      scope: 'event',
      code: 'purchase_n',
      name: 'Номер оплаты',
      note: '',
      kind: 'number',
      dictionary: null,
      dimension: false,
      untrusted: false,
      reconcile: 'payment_number',
    });
    // Поправка встроенной — без названия, пороги — только заданные; у «мало данных» ещё без «включена».
    expect(set.checks).toEqual([
      {
        code: 'events_arrived',
        note: '',
        enabled: true,
        notify: 'failure',
        params: { missing: 2 },
      },
      { code: 'low_data', note: '', params: { people: 5 } },
      {
        code: 'revenue_week',
        name: 'Выручка недели',
        note: '',
        enabled: true,
        notify: 'failure',
        params: {
          metric: 'revenue',
          sender: null,
          type: null,
          role: null,
          goal: null,
          currency: 'EUR',
          compare: 'lt',
          threshold: 50_000,
          days: 7,
          severity: 'failure',
        },
        archived: true,
      },
      {
        code: 'starts_daily',
        name: 'Старты',
        note: '',
        enabled: true,
        notify: 'failure',
        params: { ...RULE, role: null, goal: null, currency: null },
      },
    ]);
    const text = JSON.stringify(exportSet(RICH, META));
    expect(text).not.toContain('archivedAt');
    expect(text).not.toContain('revision');
    // Две выгрузки одной настройки совпадают, кроме имени и момента.
    expect(
      JSON.stringify(
        exportSet(RICH, {
          ...META,
          name: 'Другое',
          exportedAt: '2027-01-01T00:00:00.000Z',
        })
      )
        .replace('"Другое"', `"${META.name}"`)
        .replace('2027-01-01T00:00:00.000Z', META.exportedAt)
    ).toBe(text);
  });

  it('круг «выгрузка → проба на пустой → загрузка → выгрузка» даёт тот же файл; архив — моментом загрузки', () => {
    const tried = draft(file());
    expect(tried.errors).toEqual({});
    expect(tried.changed).toEqual([]);
    expect(tried.unchanged).toBe(0);
    expect(tried.kept).toEqual({});
    expect(tried.created.filter((_) => _.archived)).toEqual([
      {
        group: 'type',
        key: 'bot/old_start',
        name: 'Старт (старый бот)',
        archived: true,
      },
      {
        group: 'check',
        key: 'revenue_week',
        name: 'Выручка недели',
        archived: true,
      },
    ]);
    const loaded = tried.result.state;
    expect(loaded.revision).toBe(1);
    expect(loaded.types.find((_) => _.code === 'old_start')?.archivedAt).toBe(
      FACTS.at
    );
    expect(exportSet(loaded, META)).toEqual(exportSet(RICH, META));
    // Своя проверка на тип в архиве загрузилась: архив новых — после всех элементов набора.
    expect(loaded.checks.map((_) => _.code)).toContain('starts_daily');
    // Повторная загрузка того же файла ничего не меняет.
    const again = draft(file(), loaded);
    expect(again.created).toEqual([]);
    expect(again.changed).toEqual([]);
    expect(again.result.state).toBe(loaded);
    expect(again.result.events).toEqual([]);
  });

  it('набор этапа 1 без новых полей и набор этапа 3 без checks читаются', () => {
    const stage1 = {
      format: 'eile-analytics-set',
      version: 1,
      name: 'Магазин',
      senders: [{ code: 'shop', name: 'Магазин' }],
      types: [
        { sender: 'shop', code: 'order_paid', name: 'Оплата', role: 'payment' },
      ],
    };
    for (const set of [stage1, SUBSCRIPTION]) {
      const plan = readSetFile(set);
      expect(plan.errors).toEqual({});
      expect(plan.eile).toBeNull();
      expect(plan.exportedAt).toBeNull();
      expect(draft(set).errors).toEqual({});
    }
    expect(draft(stage1).result.state.senders[0]?.summaryAt).toBe('06:00');
  });

  it('обёртка: не набор — отказ; незнакомая группа, имя, eile и exportedAt — ошибки по путям', () => {
    for (const bad of [
      null,
      [],
      'набор',
      { format: 'cms-archive', version: 1, name: 'x' },
      { format: 'eile-analytics-set', version: 2, name: 'x' },
    ]) {
      expect(code(() => readSetFile(bad))).toBe('analytics.invalid_set');
    }
    const plan = readSetFile({
      ...file(),
      name: ' ',
      eile: 'новая',
      exportedAt: 'вчера',
      keys: [{ sender: 'bot', key: 'evk_x' }],
      intake: true,
      baseCurrency: 'EUR',
      rates: [],
      types: {},
    });
    expect(Object.keys(plan.errors).toSorted()).toEqual([
      'baseCurrency',
      'eile',
      'exportedAt',
      'intake',
      'keys',
      'name',
      'rates',
      'types',
    ]);
    expect(plan.errors.keys).toContain('newer Eile');
    expect(plan.errors.types).toBe('types is a list');
    // Строгое чтение — отказ с теми же путями; применить такой набор нельзя.
    expect(code(() => readSet({ ...file(), rates: [] }))).toBe(
      'analytics.invalid_set'
    );
    expect(
      Object.keys(
        setErrorsOf(
          attempt(
            () => (readSet({ ...file(), rates: [] }), null),
            (_) => _
          )
        )
      )
    ).toEqual(['rates']);
    expect(readSetFile(file())).toMatchObject({
      name: META.name,
      eile: '0.2.0',
      exportedAt: META.exportedAt,
      errors: {},
    });
  });

  it('проба: создастся, изменится с полями, без изменений, на сайте и не в файле — не тронуты', () => {
    const set = file();
    const changedSet = {
      ...set,
      senders: [{ ...set.senders![0]!, name: 'Бот 2', note: 'новый' }],
      dictionaries: set.dictionaries?.map((_) =>
        _.code === 'plan'
          ? {
              ..._,
              values: [...(_.values ?? []), { code: '6m', name: '6 мес' }],
            }
          : _
      ),
      referrers: set.referrers?.slice(1),
      funnels: [],
    };
    const tried = draft(changedSet, RICH);
    expect(tried.errors).toEqual({});
    expect(tried.created).toEqual([
      { group: 'value', key: 'plan/6m', name: '6 мес', archived: false },
    ]);
    expect(tried.changed).toEqual([
      { group: 'sender', key: 'bot', name: 'Бот 2', fields: ['name', 'note'] },
    ]);
    expect(tried.kept).toEqual({ referrer: 1, funnel: 1 });
    const total =
      set.senders!.length +
      set.dictionaries!.reduce((n, _) => n + 1 + (_.values?.length ?? 0), 0) +
      set.properties!.length +
      set.types!.length +
      set.schemas!.length +
      set.referrers!.length +
      set.links!.length +
      set.milestones!.length +
      set.checks!.length;
    expect(tried.unchanged).toBe(total - 2);
    // Проба ничего не меняет у исходной настройки: снимок — данные.
    expect(RICH.senders[0]?.name).toBe('Бот');
    expect(tried.result.state.revision).toBe(RICH.revision + 1);
  });

  it('предупреждения: роль типа с событиями, новый и выключенный отправитель, час сводки, архив, файл новее', () => {
    const set = file();
    const tried = draft(
      {
        ...set,
        eile: '9.0.0',
        senders: [
          { ...set.senders![0]!, enabled: false, summaryAt: '04:00' },
          { code: 'app', name: 'Приложение' },
        ],
        types: set.types?.map((_) =>
          _.code === 'purchase'
            ? { ..._, role: 'action' }
            : _.code === 'bot_start'
              ? { ..._, role: 'survey', archived: true }
              : _.code === 'old_start'
                ? { ..._, archived: undefined }
                : _
        ),
      },
      RICH,
      {
        ...FACTS,
        events: (sender, type) => sender === 'bot' && type === 'purchase',
      }
    );
    expect(tried.errors).toEqual({});
    expect(tried.warnings.map((_) => [_.code, _.path, _.key])).toEqual([
      ['sender_disabled', 'senders[0]', 'bot'],
      ['summary_hour', 'senders[0]', 'bot'],
      ['sender_created', 'senders[1]', 'app'],
      ['role_changed', 'types[2]', 'bot/purchase'],
      ['archive_kept', 'types[0]', 'bot/bot_start'],
      ['archive_kept', 'types[1]', 'bot/old_start'],
      ['newer_file', 'eile', null],
    ]);
    // Архив набор не меняет: оба типа — как на сайте; роль без событий меняется молча.
    const types = tried.result.state.types;
    expect(types.find((_) => _.code === 'bot_start')).toMatchObject({
      archivedAt: null,
      role: 'survey',
    });
    expect(types.find((_) => _.code === 'old_start')?.archivedAt).toBe(AT);
    expect(
      draft({ ...set, eile: '0.1.9' }, RICH).warnings.map((_) => _.code)
    ).toEqual([]);
    expect(newerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(newerVersion('0.2.0', '0.2.0')).toBe(false);
    expect(newerVersion('0.2.0-rc.1', '0.1.7')).toBe(true);
    expect(newerVersion('новая', '0.1.7')).toBe(false);
  });

  it('ошибки по путям: ссылки, повторы, поля, типы значений, пределы — все сразу, ничего не применено', () => {
    const tried = draft({
      format: 'eile-analytics-set',
      version: 1,
      name: 'Кривой',
      senders: [
        { code: 'shop', name: 'Магазин' },
        { code: 'shop', name: 'Дубль' },
        { code: 'app', name: 'Приложение', enabled: 'yes' },
        { code: 'web', name: 'Сайт', archived: 'yes' },
        { code: 'tv', name: 'Телевизор', keys: ['evk_x'] },
      ],
      dictionaries: [
        {
          code: 'big',
          name: 'Большой',
          purpose: 'values',
          values: Array.from({ length: 1001 }, (_, i) => ({
            code: `v${i}`,
            name: `V${i}`,
          })),
        },
        {
          code: 'tiers',
          name: 'Тарифы',
          purpose: 'values',
          values: [{ dictionary: 'big', code: 'x', name: 'X' }, 'basic'],
        },
      ],
      types: [
        {
          sender: 'shop',
          code: 'order_paid',
          name: 'Оплата',
          role: 'payment',
          properties: [{ code: 'missing' }],
        },
        { sender: 'nobody', code: 'visit_x', name: 'Заход', role: 'touch' },
      ],
      milestones: { code: 'm' },
    });
    expect(Object.keys(tried.errors)).toEqual([
      'dictionaries[0].values',
      'milestones',
      'senders[1]',
      'senders[2]',
      'senders[3]',
      'senders[4]',
      'dictionaries[1].values[0]',
      'dictionaries[1].values[1]',
      'types[0]',
      'types[1]',
    ]);
    expect(tried.errors['senders[4]']).toContain('unknown field "keys"');
    expect(tried.errors['senders[1]']).toBe('the same item as senders[0]');
    expect(tried.errors['senders[2]']).toContain('enabled is true or false');
    expect(tried.errors['senders[3]']).toBe('archived is true or false');
    expect(tried.errors['dictionaries[0].values']).toContain('at most 1000');
    expect(tried.errors['types[0]']).toContain('missing');
    expect(tried.errors['types[1]']).toContain('there is no sender nobody');
    expect(() =>
      applySet(
        readSetFile({
          format: 'eile-analytics-set',
          version: 1,
          name: 'Кривой',
          senders: [{ code: 'shop', name: 'Магазин', keys: [] }],
        })
      )(EMPTY_SETUP)
    ).toThrow('nothing changed');
    // Отправителей больше предела — ошибка группы, без шага на каждого.
    expect(
      readSetFile({
        format: 'eile-analytics-set',
        version: 1,
        name: 'Много',
        senders: Array.from({ length: 21 }, (_, i) => ({
          code: `s${i}`,
          name: `S${i}`,
        })),
      })
    ).toMatchObject({ steps: [], errors: { senders: expect.any(String) } });
  });

  it('чужой файл: прототипы, глубина и огромные значения не роняют пробу, управляющие знаки уходят из названий', () => {
    let deep: unknown = 'дно';
    for (let i = 0; i < 20_000; i++) deep = [deep];
    const raw = JSON.parse(
      `{"format":"eile-analytics-set","version":1,"name":"Чужой\\u0007\\u001b[2J","__proto__":{"polluted":true},"senders":[{"code":"__proto__","name":"x"},{"code":"constructor","name":"y"},{"code":"shop","name":"Ма\\u0000газ\\u202eин\\n\\tнов","note":"строка 1\\r\\nстрока 2\\u0000"}]}`
    );
    const tried = draft({
      ...raw,
      types: [
        { sender: 'shop', code: deep, name: 'x', role: 'touch' },
        { sender: 'shop', code: 'deep', name: deep, role: 'touch' },
        {
          sender: 'shop',
          code: 'long',
          name: 'я'.repeat(1_000_000),
          role: 'touch',
        },
      ],
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(tried.errors)).toEqual([
      '__proto__',
      'senders[0]',
      'senders[1]',
      'types[0]',
      'types[1]',
      'types[2]',
    ]);
    expect(tried.errors['senders[0]']).toContain('reserved');
    expect(tried.errors['senders[1]']).toContain('reserved');
    expect(tried.errors['types[0]']).toContain('"[…]" is not a code');
    expect(tried.name).toBe('Чужой[2J');
    expect(Object.values(tried.errors).every((_) => _.length <= 300)).toBe(
      true
    );
    // Те же правила, что у ручного ввода: название — одной строкой без управляющих знаков, заметка — со строками.
    const shop = tried.result.state.senders.find((_) => _.code === 'shop');
    expect(shop).toMatchObject({
      name: 'Магазин нов',
      note: 'строка 1\nстрока 2',
    });
    expect(
      save('sender', {
        code: 'shop',
        name: 'Ма\u0000газ\u202eин\n\tнов',
        note: 'строка 1\r\nстрока 2\u0000',
      })(EMPTY_SETUP).senders[0]
    ).toMatchObject({ name: shop?.name, note: shop?.note });
    expect(cleanName('\u202eгол\u0008ос')).toBe('голос');
  });

  it('отметка сверки: перенос внутри файла — сначала снятие; свойство сайта не из файла с той же — ошибка по пути', () => {
    const site = save('property', {
      scope: 'event',
      code: 'paid_n',
      name: 'Номер',
      kind: 'number',
      reconcile: 'payment_number',
    })(BASE);
    const moved = draft(
      {
        format: 'eile-analytics-set',
        version: 1,
        name: 'Перенос',
        properties: [
          {
            scope: 'event',
            code: 'n_of_payment',
            name: 'Номер оплаты',
            kind: 'number',
            reconcile: 'payment_number',
          },
          { scope: 'event', code: 'paid_n', reconcile: null },
        ],
      },
      site
    );
    expect(moved.errors).toEqual({});
    expect(
      moved.result.state.properties.map((_) => [_.code, _.reconcile])
    ).toEqual([
      ['tier', null],
      ['paid_n', null],
      ['n_of_payment', 'payment_number'],
    ]);
    const clash = draft(
      {
        format: 'eile-analytics-set',
        version: 1,
        name: 'Конфликт',
        properties: [
          {
            scope: 'event',
            code: 'n_of_payment',
            name: 'Номер оплаты',
            kind: 'number',
            reconcile: 'payment_number',
          },
        ],
      },
      site
    );
    expect(clash.errors).toEqual({
      'properties[0]': expect.stringContaining(
        'property paid_n already reconciles payment_number'
      ),
    });
    expect(() =>
      applySet(
        readSetFile({
          format: 'eile-analytics-set',
          version: 1,
          name: 'Конфликт',
          properties: [
            {
              scope: 'event',
              code: 'n_of_payment',
              name: 'Номер оплаты',
              kind: 'number',
              reconcile: 'payment_number',
            },
          ],
        })
      )(site)
    ).toThrow('nothing changed');
  });

  it('свои проверки: 21-я — too_many, архивные в счёте; встроенная в архиве — ошибка пути', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      code: `own_${i}`,
      name: `Своя ${i}`,
      params: { ...RULE, type: 'bot_start' },
      ...(i % 2 === 0 ? { archived: true } : {}),
    }));
    const set = { ...file(STAGE2), checks: twenty };
    const loaded = draft(set, STAGE2);
    expect(loaded.errors).toEqual({});
    expect(loaded.result.state.checks.filter((_) => _.archivedAt)).toHaveLength(
      10
    );
    const over = draft(
      {
        ...set,
        checks: [
          {
            code: 'own_20',
            name: 'Ещё',
            params: { ...RULE, type: 'bot_start' },
          },
        ],
      },
      loaded.result.state
    );
    expect(over.errors['checks[0]']).toContain('at most 20');
    const builtin = draft(
      {
        ...set,
        checks: [
          { code: 'events_arrived', params: { missing: 1 }, archived: true },
        ],
      },
      STAGE2
    );
    expect(builtin.errors['checks[0]']).toContain('has no archive');
  });

  it('набор предельного размера: сто справочников по тысяче значений — секунды, а не минуты', () => {
    const set = {
      format: 'eile-analytics-set',
      version: 1,
      name: 'Предел',
      dictionaries: Array.from({ length: 100 }, (_, d) => ({
        code: `d${d}`,
        name: `Справочник ${d}`,
        purpose: 'values',
        values: Array.from({ length: 1000 }, (_, v) => ({
          code: `v${v}`,
          name: `Значение ${v}`,
        })),
      })),
    };
    const started = performance.now();
    const tried = draft(set);
    expect(tried.errors).toEqual({});
    expect(tried.created).toHaveLength(100_100);
    expect(draft(set, tried.result.state).changed).toEqual([]);
    expect(performance.now() - started).toBeLessThan(15_000);
  });
});
