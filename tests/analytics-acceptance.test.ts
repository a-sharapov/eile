import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Glob } from 'bun';
import { type App, createApp } from '../src/app.ts';
import {
  EVENT_ROLES,
  type EventRole,
} from '../src/contexts/analytics/index.ts';
import type { UserView } from '../src/contexts/identity/index.ts';
import { defineAgentSession } from '../src/contexts/manager/index.ts';
import type { Message, Transports } from '../src/contexts/notify/index.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';
import { DEMO } from './fixtures/demo.ts';

// Приёмка целиком (ADR 0072, этап 4, «Приёмка целиком»): двенадцать пунктов ТЗ на настоящем приложении — как
// владелец и отправитель: набор загрузкой из менеджера, ключ отправителя сеансом человека, события — через приёмник
// `POST /_cms/events`, отчёты — через API менеджера, агент — через MCP. Сеть — только подменённая: каналы
// уведомлений не ходят дальше памяти теста. Пункт 12 — оплата на живом сайте владельца — пропущен.

const PASSWORD = 'correct horse battery';
const FIXTURES = join(import.meta.dir, 'fixtures');
const STAGE2 = join(FIXTURES, 'analytics-stage2.jsonl');
const STAGE3 = join(FIXTURES, 'analytics-stage3.jsonl');
const SHOP = join(FIXTURES, 'analytics-shop.jsonl');
const NOVEMBER_15 = '2026-11-15T12:00:00.000Z';
const OCTOBER = 'from=2026-10-01&to=2026-10-31';
const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz0123456789';

// Курсы и расходы плана тестов этапа 3: их вносит скрипт владельца ключом API.
const RATES = [
  { currency: 'PLN', day: '2026-06-01', rate: '0.2300' },
  { currency: 'PLN', day: '2026-09-01', rate: '0.2400' },
  { currency: 'PLN', day: '2026-10-01', rate: '0.2500' },
];
const SPEND = [
  {
    month: '2026-06',
    parts: { source: 'ig', channel: 'paid' },
    currency: 'EUR',
    amount: '60.00',
  },
  {
    month: '2026-07',
    parts: { source: 'ig', channel: 'paid' },
    currency: 'EUR',
    amount: '62.00',
  },
  {
    month: '2026-08',
    parts: { source: 'fb', channel: 'paid' },
    currency: 'PLN',
    amount: '400.00',
  },
  { month: '2026-09', parts: { source: 'ig' }, currency: 'EUR', amount: '30' },
  { month: '2026-10', parts: {}, currency: 'EUR', amount: '50.00' },
  {
    month: '2026-10',
    parts: { source: 'ig', channel: 'paid' },
    currency: 'EUR',
    amount: '0.00',
  },
];

type Who = 'admin' | 'key' | 'editor' | 'editorKey' | 'none';
type Answer = { readonly status: number; readonly body: any };
type Site = {
  readonly app: App;
  readonly dir: string;
  readonly cookie: Readonly<Record<'admin' | 'editor', string>>;
  readonly token: Readonly<Record<'key' | 'editorKey', string>>;
};

let sites: Site[] = [];
let telegram: Message[] = [];

// Каналы уведомлений без сети: сообщение «уходит» в память теста.
const transports: Transports = {
  telegram: {
    send: (_settings, _chat, item) => (telegram.push(item), Promise.resolve()),
    me: () => Promise.resolve('@bot'),
    chats: () => Promise.resolve([]),
  },
  email: {
    send: () => Promise.resolve(),
    mail: () => Promise.resolve(),
    probe: () => Promise.resolve({ ok: true, latencyMs: 1 }),
  },
};

const raw = (site: Site, request: Request) =>
  site.app.fetch(request, { requestIP: () => ({ address: '192.0.2.10' }) });

const call = async (
  site: Site,
  method: string,
  path: string,
  who: Who = 'admin',
  body?: unknown
): Promise<Answer> => {
  const response = await raw(
    site,
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        'accept-language': 'ru',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who === 'admin' || who === 'editor'
          ? { cookie: site.cookie[who] }
          : {}),
        ...(who === 'key' || who === 'editorKey'
          ? { authorization: `Bearer ${site.token[who]}` }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text === '' ? null : JSON.parse(text),
  };
};

const get = (site: Site, path: string) =>
  call(site, 'GET', path).then(
    (_) => (expect([path, _.status]).toEqual([path, 200]), _.body)
  );

const cookieOf = (response: Response): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

// Сайт после первого запуска: администратор входит, редактор тоже; у обоих — по ключу API.
const open = async (
  options: { clock?: () => Date; background?: boolean; scaffold?: boolean } = {}
): Promise<Site> => {
  const dir = mkdtempSync(join(tmpdir(), 'cms-acceptance-'));
  const app = createApp({
    databasePath: join(dir, 'site.db'),
    mediaCache: join(dir, 'cache'),
    transports,
    updateCheck: false,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.background ? { background: true } : {}),
    ...(options.scaffold ? { scaffold: DEMO } : {}),
  });
  const setup = await app.fetch(
    new Request('http://localhost/manager/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: app.identity.setup.token(),
        email: 'anna@example.com',
        name: 'Анна',
        password: PASSWORD,
      }),
    })
  );
  await app.identity.users.create({
    email: 'ed@example.com',
    role: 'editor',
    password: PASSWORD,
  });
  const login = await app.fetch(
    new Request('http://localhost/manager/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ed@example.com', password: PASSWORD }),
    })
  );
  const bare: Site = {
    app,
    dir,
    cookie: { admin: cookieOf(setup), editor: cookieOf(login) },
    token: { key: '', editorKey: '' },
  };
  const token = async (who: 'admin' | 'editor') =>
    (await call(bare, 'POST', '/tokens', who, { name: 'Скрипт' })).body
      .token as string;
  const site: Site = {
    ...bare,
    token: { key: await token('admin'), editorKey: await token('editor') },
  };
  sites.push(site);
  return site;
};

/**
 * Подключение как у владельца: набор загрузкой из «Настройка → Перенос» (или образец), приём включён, ключ
 * отправителя выпущен — всё сеансом человека. Ответ — ключ для отправителя.
 */
const connect = async (
  site: Site,
  set: unknown,
  sender: string,
  settings: Record<string, unknown> = {}
): Promise<string> => {
  const applied = await call(site, 'POST', '/analytics/set', 'admin', set);
  expect([applied.status, applied.body.applied]).toEqual([200, true]);
  expect(
    (
      await call(site, 'PUT', '/analytics/settings', 'admin', {
        enabled: true,
        ...settings,
      })
    ).status
  ).toBe(200);
  const key = await call(
    site,
    'POST',
    `/analytics/senders/${sender}/keys`,
    'admin',
    { label: 'Сервер отправителя' }
  );
  expect(key.status).toBe(201);
  return key.body.key as string;
};

const deliver = (site: Site, key: string, body: string | object) =>
  raw(
    site,
    new Request('http://localhost/_cms/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  ).then(async (_) => ({ status: _.status, body: (await _.json()) as any }));

const lines = async (file: string): Promise<string[]> =>
  (await Bun.file(file).text()).trim().split('\n');

// Весь файл событий — по одному событию через приёмник, как их шлёт отправитель.
const deliverFile = async (site: Site, key: string, file: string) => {
  for (const line of await lines(file)) {
    const answer = await deliver(site, key, line);
    expect([line.slice(0, 18), answer.status]).toEqual([
      line.slice(0, 18),
      200,
    ]);
  }
};

const share = (count: number, base: number, open = 0) => ({
  count,
  base,
  open,
});

// Строка «Источников» таблицы этапа 2: новые, пробный, активация, оплата за 30, клиенты, выручка, оплат на
// клиента, продление.
const stage2Line = (_: any) => [
  _.people,
  _.trial,
  _.milestones.activation,
  _.payment,
  _.customers,
  _.revenue,
  _.perCustomer,
  _.renewal,
];

const rowOf = (report: any, value: string) =>
  report.rows.find((_: { value: string }) => _.value === value);

// Сайт этапа 2: набор сайта-примера, пояс Европа/Берлин, люди P1–P13 через приёмник, 15 ноября 2026.
const stage2Site = async (): Promise<{ site: Site; key: string }> => {
  const site = await open({ clock: () => new Date(NOVEMBER_15) });
  expect(
    (
      await call(site, 'PUT', '/stats/settings', 'admin', {
        timeZone: 'Europe/Berlin',
      })
    ).status
  ).toBe(200);
  const key = await connect(site, SUBSCRIPTION, 'bot');
  await deliverFile(site, key, STAGE2);
  return { site, key };
};

// Сайт этапа 3: тот же набор, базовая валюта EUR, курсы и расходы скриптом владельца, люди M1–M9.
const stage3Site = async (moment = NOVEMBER_15): Promise<Site> => {
  const site = await open({ clock: () => new Date(moment) });
  expect(
    (
      await call(site, 'PUT', '/stats/settings', 'admin', {
        timeZone: 'Europe/Berlin',
      })
    ).status
  ).toBe(200);
  const key = await connect(site, SUBSCRIPTION, 'bot', { baseCurrency: 'EUR' });
  await deliverFile(site, key, STAGE3);
  expect(
    (await call(site, 'PUT', '/analytics/rates', 'key', { rates: RATES }))
      .status
  ).toBe(200);
  expect(
    (await call(site, 'PUT', '/analytics/spend', 'key', { rows: SPEND })).status
  ).toBe(200);
  return site;
};

const adminOf = (site: Site): UserView =>
  site.app.identity.users.list().find((_) => _.role === 'admin')!;

// Вызов инструмента агента через MCP — как у клиента MCP; ответ с чужим текстом начинается пометкой.
const tool = async (
  site: Site,
  name: string,
  args: object,
  session: ReturnType<typeof defineAgentSession>
) =>
  (
    (await site.app.mcp(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      adminOf(site),
      session
    )) as {
      result: { content: { text: string }[]; isError: boolean };
    }
  ).result;

const json = (result: { content: { text: string }[] }) =>
  ((text) => JSON.parse(text.slice(text.indexOf('{'))))(
    result.content[0]!.text
  );

beforeEach(() => {
  sites = [];
  telegram = [];
});

afterEach(() => {
  for (const site of sites) {
    site.app.close();
    rmSync(site.dir, { recursive: true, force: true });
  }
});

describe('приёмка целиком', () => {
  it('1. «Подписка» принимает события и строит все отчёты без правки кода', async () => {
    const { site } = await stage2Site();
    // Все маршруты отчётов и экранов аналитики отвечают — на настройке из файла, без строчки кода сайта.
    for (const path of [
      `/analytics/sources?${OCTOBER}&group=part:source`,
      `/analytics/sources?${OCTOBER}&group=part:source&attribution=return`,
      `/analytics/funnel?${OCTOBER}`,
      `/analytics/answers?${OCTOBER}&question=heard_from`,
      `/analytics/overview?${OCTOBER}`,
      `/analytics/cohorts?${OCTOBER}&basis=payment`,
      `/analytics/cohorts?${OCTOBER}&basis=arrival`,
      `/analytics/milestones?${OCTOBER}`,
      '/analytics/spend',
      '/analytics/quality',
      '/analytics/quality/status',
      '/analytics/intake',
      '/analytics/intake/daily',
      '/analytics/summaries?sender=bot',
      `/analytics/people?${OCTOBER}`,
      '/analytics/unknown',
      '/analytics/labels',
      '/analytics/events',
      '/analytics/log',
      '/analytics/setup',
    ])
      await get(site, path);
    // Итог ручной таблицы этапа 2 за октябрь — по людям, а не сумма строк.
    const october = await get(
      site,
      `/analytics/sources?${OCTOBER}&group=part:source`
    );
    expect(october).toMatchObject({
      timeZone: 'Europe/Berlin',
      stale: 0,
      attribution: 'first',
    });
    expect(stage2Line(october.total)).toEqual([
      9,
      share(5, 9),
      share(2, 9),
      share(2, 7, 2),
      3,
      { EUR: 3800, PLN: 1900 },
      { payments: 4, customers: 3 },
      share(1, 2, 1),
    ]);
    expect(october.rows.map((_: { value: string }) => _.value)).toEqual([
      'ig',
      'fb',
      'google',
      'tg',
      '~unknown',
      '~none',
    ]);
    // Этап 3: деньги в базовой валюте, LTV, CAC и окупаемость за срок 3 месяца — итог ручной таблицы плана.
    const money = await stage3Site();
    const sources = await get(
      money,
      '/analytics/sources?from=2026-06-01&to=2026-10-31&group=part:source&life=3'
    );
    expect(sources).toMatchObject({ baseCurrency: 'EUR', life: 3 });
    expect([
      sources.total.people,
      sources.total.customers,
      sources.total.revenue,
      sources.total.revenueBase.value,
      sources.total.ltvCustomer.value,
      sources.total.spend.value,
      sources.total.cac,
      sources.total.ltvCac,
      sources.total.payback.months,
    ]).toEqual([
      8,
      6,
      { EUR: 14_400, PLN: 40_000, CHF: 2_000 },
      23_800,
      5_000,
      29_400,
      4_900,
      1.02,
      3,
    ]);
    // Коды набора — только в настройке сайта: в коде аналитики их нет строками (весь разбор — tests/analytics-neutral).
    const typeCodes = (SUBSCRIPTION.types ?? [])
      .map((_) => _.code)
      .filter((_) => !EVENT_ROLES.includes(_ as EventRole));
    const sources_ = Array.from(
      new Glob('**/*.ts').scanSync(
        join(import.meta.dir, '../src/contexts/analytics')
      )
    ).filter((_) => !_.endsWith('.test.ts'));
    expect(sources_.length).toBeGreaterThan(20);
    for (const file of sources_) {
      const text = await Bun.file(
        join(import.meta.dir, '../src/contexts/analytics', file)
      ).text();
      expect([
        file,
        typeCodes.filter((code) =>
          new RegExp(`['"\`]${code}['"\`]`).test(text)
        ),
      ]).toEqual([file, []]);
    }
  });

  it('2. «Магазин» — «Источники» без пробного периода и продления', async () => {
    const site = await open({ clock: () => new Date(NOVEMBER_15) });
    expect(
      (
        await call(site, 'PUT', '/stats/settings', 'admin', {
          timeZone: 'Europe/Berlin',
        })
      ).status
    ).toBe(200);
    const key = await connect(
      site,
      { sample: 'shop', language: 'ru' },
      'shop',
      {
        baseCurrency: 'EUR',
      }
    );
    await deliverFile(site, key, SHOP);
    const report = await get(
      site,
      `/analytics/sources?${OCTOBER}&group=part:source`
    );
    const kinds = report.columns.map((_: { kind: string }) => _.kind);
    expect(kinds).not.toContain('trial');
    expect(kinds).not.toContain('renewal');
    expect(kinds).toEqual([
      'people',
      'milestone',
      'payment',
      'customers',
      'revenue',
      'perCustomer',
      'ltvCustomer',
      'ltvPerson',
    ]);
    expect([
      report.total.people,
      report.total.customers,
      report.total.revenue,
      report.total.trial,
      report.total.renewal,
    ]).toEqual([6, 3, { EUR: 6550 }, null, null]);
    // Образец без переходов: адрес бота или магазина у каждого сайта свой.
    expect((await get(site, '/analytics/setup')).links).toEqual([]);
  });

  it('3. Тип, свойство-разрез и веха из менеджера — в отчётах без перезапуска', async () => {
    const site = await open({ clock: () => new Date(NOVEMBER_15) });
    const key = await connect(site, SUBSCRIPTION, 'bot');
    const event = (n: number, type: string, at: string, data: object) =>
      deliver(site, key, {
        id: `acc3_${type}_${n}`,
        type,
        at,
        subject: `u_acc3_p0${n}`,
        data,
      });
    for (const n of [1, 2]) {
      expect(
        (
          await event(n, 'bot_start', `2026-11-0${n}T10:00:00Z`, {
            label: 'w-trial__ig__paid',
          })
        ).status
      ).toBe(200);
      // Тип, которого в настройке ещё нет: событие принято с предупреждением и лежит без роли.
      const gift = await event(n, 'gift_paid', `2026-11-0${n}T11:00:00Z`, {
        amount: '25.00',
        currency: 'EUR',
        payment_id: `gift_${n}`,
        wrapped: n === 1,
      });
      expect([gift.status, gift.body.warnings]).toEqual([
        200,
        ['unknown_type'],
      ]);
    }
    const PERIOD = 'from=2026-11-01&to=2026-11-15&group=part:source';
    const before = await get(site, `/analytics/sources?${PERIOD}`);
    expect([before.total.people, before.total.customers]).toEqual([2, 0]);
    expect(
      (await get(site, '/analytics/unknown')).types.map(
        (_: { type: string }) => _.type
      )
    ).toContain('gift_paid');
    // Из менеджера: свойство-разрез, тип с ролью «оплата», веха — три правки настройки, без перезапуска.
    for (const { 0: group, 1: item } of [
      [
        'property',
        {
          scope: 'event',
          code: 'wrapped',
          name: 'В подарочной упаковке',
          kind: 'boolean',
          dimension: true,
        },
      ],
      [
        'type',
        {
          sender: 'bot',
          code: 'gift_paid',
          name: 'Подарок оплачен',
          role: 'payment',
          properties: [{ code: 'wrapped', required: false }],
        },
      ],
      [
        'milestone',
        {
          code: 'gifted',
          name: 'Купил подарок',
          sender: 'bot',
          type: 'gift_paid',
          count: 1,
          condition: null,
          days: null,
          anchor: null,
          column: true,
        },
      ],
    ] as const) {
      const saved = await call(
        site,
        'PUT',
        `/analytics/setup/${group}`,
        'admin',
        item
      );
      expect([group, saved.status]).toEqual([group, 200]);
    }
    const after = await get(site, `/analytics/sources?${PERIOD}`);
    expect(after.stale).toBe(0);
    expect([
      after.total.people,
      after.total.customers,
      after.total.revenue,
      after.total.milestones.gifted,
    ]).toEqual([2, 2, { EUR: 5000 }, share(2, 2)]);
    expect(after.columns).toContainEqual({
      kind: 'milestone',
      code: 'gifted',
      name: 'Купил подарок',
    });
    // Разрез по новому свойству: строка на значение из самого раннего события.
    const byWrap = await get(
      site,
      '/analytics/sources?from=2026-11-01&to=2026-11-15&group=prop:wrapped'
    );
    expect(
      byWrap.rows
        .map((_: { value: string; customers: number }) => [
          _.value,
          _.customers,
        ])
        .toSorted()
    ).toEqual([
      ['false', 1],
      ['true', 1],
    ]);
    const people = await get(site, '/analytics/people?state=customer');
    expect(people).toMatchObject({ total: 2, stale: 0 });
  });

  it('4. Агент: лучший LTV / CAC за 6 месяцев, метка, расход; после get_person — отказ', async () => {
    // Часы — 15 февраля 2027: срок в 6 месяцев прожили клиенты до 15 августа 2026.
    const site = await stage3Site('2027-02-15T12:00:00.000Z');
    const session = defineAgentSession();
    const read = await tool(
      site,
      'get_analytics',
      {
        report: 'sources',
        from: '2026-06-01',
        to: '2026-10-31',
        group: 'part:source',
        life: 6,
      },
      session
    );
    expect(read.isError).toBe(false);
    const rows = json(read).rows as { value: string; ltv_cac: number | null }[];
    const best = rows
      .filter((_) => _.ltv_cac !== null)
      .toSorted((a, b) => (b.ltv_cac as number) - (a.ltv_cac as number))[0];
    expect([best?.value, best?.ltv_cac]).toEqual(['fb', 1.55]);
    expect(session.tainted()).toBe(false);
    // Метка для новой кампании и расход — в том же сеансе: отчёт сеанс не помечает.
    const label = await tool(
      site,
      'create_label',
      { parts: { source: 'fb', channel: 'paid' }, name: 'Facebook платный' },
      session
    );
    expect([label.isError, json(label).existing]).toEqual([false, false]);
    const spend = {
      rows: [
        {
          month: '2026-10',
          parts: { source: 'fb', channel: 'paid' },
          currency: 'EUR',
          amount: '46.00',
        },
      ],
    };
    const saved = await tool(site, 'save_spend', spend, session);
    expect([saved.isError, json(saved).created]).toEqual([false, 1]);
    // Прочитал человека — до конца сеанса пять защищённых инструментов аналитики отказывают.
    expect(
      (await tool(site, 'get_person', { subject: 'u_stage3_m1' }, session))
        .isError
    ).toBe(false);
    for (const { 0: name, 1: args } of [
      ['save_analytics_item', { group: 'value', item: {} }],
      ['archive_analytics_item', { group: 'value', key: {}, archived: true }],
      ['create_label', { parts: { source: 'fb' }, name: 'Ещё одна' }],
      ['save_spend', spend],
      [
        'resolve_check',
        { check: 'summary_arrived', day: '2026-11-01', note: 'x' },
      ],
    ] as const) {
      const refused = await tool(site, name, args, session);
      expect([name, refused.content[0]!.text.split(':')[0]]).toEqual([
        name,
        'agent.tainted',
      ]);
    }
  });

  it('5. Повторная отправка всех событий за сутки не меняет ни одной цифры', async () => {
    const { site, key } = await stage2Site();
    site.app.analytics.quality.tick();
    const snapshot = () =>
      Promise.all(
        [
          `/analytics/sources?${OCTOBER}&group=part:source`,
          `/analytics/sources?${OCTOBER}&group=part:source&attribution=return`,
          `/analytics/funnel?${OCTOBER}`,
          `/analytics/answers?${OCTOBER}&question=heard_from`,
          `/analytics/overview?${OCTOBER}`,
          `/analytics/cohorts?${OCTOBER}&basis=payment`,
          `/analytics/cohorts?${OCTOBER}&basis=arrival`,
          `/analytics/milestones?${OCTOBER}`,
          `/analytics/people?${OCTOBER}`,
          '/analytics/quality?days=30',
        ].map((path) => get(site, path))
      );
    const before = await snapshot();
    expect(before.at(-1).rows.length).toBeGreaterThan(5);
    const day = (await lines(STAGE2)).filter((_) =>
      _.includes('"at":"2026-10-20')
    );
    expect(day).toHaveLength(3);
    for (const line of day) {
      const answer = await deliver(site, key, line);
      expect([answer.status, answer.body]).toEqual([
        200,
        { ok: true, duplicate: true },
      ]);
    }
    site.app.analytics.quality.tick();
    expect(await snapshot()).toEqual(before);
    // В счёте приёма — повторы, а не принятые.
    const tally = (await get(site, '/analytics/intake/daily?days=1')).days;
    const count = (outcome: string) =>
      tally
        .filter((_: { outcome: string }) => _.outcome === outcome)
        .reduce((sum: number, _: { count: number }) => sum + _.count, 0);
    expect([count('accepted'), count('duplicate')]).toEqual([32, 3]);
  });

  it('6. Переход после захода с UTM — метка по схеме; на устройство ничего не записано', async () => {
    const site = await open({
      clock: () => new Date(NOVEMBER_15),
      scaffold: true,
    });
    expect(
      (
        await call(site, 'PUT', '/stats/settings', 'admin', {
          enabled: true,
          timeZone: 'Europe/Berlin',
        })
      ).status
    ).toBe(200);
    await connect(site, SUBSCRIPTION, 'bot');
    const browser = {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
    };
    const page = await site.app.fetch(
      new Request(
        'https://site.test/?utm_source=ig&utm_medium=paid&utm_campaign=autumn&utm_content=ad-1',
        { headers: browser }
      ),
      { requestIP: () => ({ address: '203.0.113.7' }) }
    );
    expect([page.status, page.headers.get('set-cookie')]).toEqual([200, null]);
    const go = await site.app.fetch(
      new Request('https://site.test/_cms/go/trial', {
        headers: { ...browser, referer: 'https://site.test/' },
      }),
      { requestIP: () => ({ address: '203.0.113.7' }) }
    );
    expect(go.status).toBe(302);
    expect(go.headers.get('location')).toEndWith(
      'start=w-trial__ig__paid__autumn__ad-1'
    );
    expect(go.headers.get('set-cookie')).toBeNull();
    expect(go.headers.get('cache-control')).toBe('no-store');
    expect(await go.text()).toBe('');
  });

  it('7. Сутки без сводки — уведомление «сводка не пришла» в течение 10 минут', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-11-19T12:00:00Z'));
      const site = await open({ background: true });
      site.app.site.settings.update({
        language: 'ru',
        siteUrl: 'https://example.com',
      });
      site.app.notify.settings.save({
        telegram: { token: TOKEN, chats: [{ id: '-100500', title: 'Сайт' }] },
      });
      const key = await connect(site, SUBSCRIPTION, 'bot');
      expect(
        (
          await call(site, 'PUT', '/analytics/senders/bot', 'admin', {
            summaryAt: '03:30',
          })
        ).status
      ).toBe(200);
      const next = (day: string) =>
        new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10);
      // Четверо суток бот шлёт старт и сводку в 03:00 следующих суток; за 24 ноября сводки нет.
      for (const day of [
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        '2026-11-24',
      ]) {
        jest.setSystemTime(new Date(`${day}T09:00:01Z`));
        expect(
          (
            await deliver(site, key, {
              id: `acc7_start_${day}`,
              type: 'bot_start',
              at: `${day}T09:00:00Z`,
              subject: `u_acc7_${day.replaceAll('-', '')}`,
              data: { label: 'post__ig__paid' },
            })
          ).status
        ).toBe(200);
        if (day === '2026-11-24') continue;
        jest.setSystemTime(new Date(`${next(day)}T03:00:01Z`));
        expect(
          (
            await deliver(site, key, {
              id: `acc7_summary_${day}`,
              type: 'daily_summary',
              at: `${next(day)}T03:00:00Z`,
              data: { day, counts: { bot_start: 1 }, version: '1.4.2' },
            })
          ).status
        ).toBe(200);
      }
      const queued = () =>
        site.app.notify.outbox
          .recent(100)
          .filter((_) => _.source?.startsWith('analytics.quality:'));
      // Фон идёт по минутам: в 03:34 25 ноября ещё рано, в 03:35 — сбой и одно сообщение.
      jest.setSystemTime(new Date('2026-11-25T03:00:00Z'));
      jest.advanceTimersByTime(34 * 60_000);
      expect(queued()).toEqual([]);
      jest.advanceTimersByTime(60_000 + 1_000);
      const report = site.app.analytics.quality.report({ days: 30 });
      expect(
        report.rows
          .find((_) => _.check === 'summary_arrived' && _.scope === 'bot')
          ?.cells.at(-1)
      ).toMatchObject({ day: '2026-11-24', state: 'failure' });
      expect(queued()).toHaveLength(1);
      expect(queued()[0]?.message).toMatchObject({
        topic: 'incidents',
        severity: 'error',
        title: 'Качество данных: сводка не пришла',
        link: {
          url: 'https://example.com/manager/stats/quality?day=2026-11-24',
        },
      });
      // Канал получает его следующими минутами фона. Фальшивые часы проходят минуту целиком, не давая
      // выполниться обещаниям внутри неё, — поэтому по минуте, с отдачей очереди обещаний после каждой, как на
      // настоящем сервере.
      for (let minute = 0; minute < 5 && telegram.length === 0; minute++) {
        jest.advanceTimersByTime(60_000);
        for (let n = 0; n < 50; n++) await Promise.resolve();
      }
      expect(new Date().toISOString() < '2026-11-25T03:45:00.000Z').toBe(true);
      expect(telegram.map((_) => _.title)).toEqual([
        'Качество данных: сводка не пришла',
      ]);
      // Отметка в менеджере — по ключу API, как её читает меню.
      expect(
        (await call(site, 'GET', '/analytics/quality/status', 'key')).body
      ).toMatchObject({ failures: 1, day: '2026-11-24' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('8. Когорта текущего месяца — неполная и не в среднем', async () => {
    const site = await stage3Site();
    const report = await get(
      site,
      '/analytics/cohorts?from=2026-06-01&to=2026-11-15&basis=payment'
    );
    const november = report.rows.at(-1);
    expect([november.month, november.customers, november.open]).toEqual([
      '2026-11',
      1,
      true,
    ]);
    expect(november.cells[0].state).toBe('incomplete');
    // Среднее нулевого месяца — по полным ячейкам: июнь — сентябрь, без октября (сумма без курса) и ноября.
    const complete = report.rows.filter(
      (_: { cells: { state: string; unpriced?: boolean }[] }) =>
        _.cells[0]!.state === 'complete' && !_.cells[0]!.unpriced
    );
    expect(complete.map((_: { month: string }) => _.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(report.average[0]).toEqual({
      value: 3_120,
      cohorts: 4,
      customers: 5,
    });
  });

  it('9. Строка ниже порогов — «мало данных»', async () => {
    const { site } = await stage2Site();
    const PATH = `/analytics/sources?${OCTOBER}&group=part:source`;
    const before = await get(site, PATH);
    expect(before.lowData).toEqual({ people: 30, customers: 10 });
    expect(
      [before.total, ...before.rows].every(
        (_: { lowData: { people: boolean } }) => _.lowData.people
      )
    ).toBe(true);
    // Пороги 4 и 1 в «Качество → Проверки» — без перезапуска: итог и ig (4 новых, 1 клиент) — без флага, fb — с ним.
    expect(
      (
        await call(site, 'PUT', '/analytics/setup/check', 'admin', {
          code: 'low_data',
          params: { people: 4, customers: 1 },
        })
      ).status
    ).toBe(200);
    const after = await get(site, PATH);
    expect(after.lowData).toEqual({ people: 4, customers: 1 });
    expect(after.total.lowData).toEqual({ people: false, customers: false });
    expect(rowOf(after, 'ig').lowData).toEqual({
      people: false,
      customers: false,
    });
    expect(rowOf(after, 'fb').lowData).toEqual({
      people: true,
      customers: false,
    });
    expect(stage2Line(after.total)).toEqual(stage2Line(before.total));
  });

  it('10. Событие «удаление» убирает человека из списка, отчёты пересчитаны', async () => {
    let now = new Date('2026-11-12T12:00:00Z');
    const site = await open({ clock: () => now });
    const key = await connect(site, SUBSCRIPTION, 'bot');
    const at = (moment: string) => void (now = new Date(moment));
    const send = (id: string, type: string, moment: string, data: object) => (
      at(moment),
      deliver(site, key, {
        id,
        type,
        at: moment,
        subject: 'u_acc10_gone',
        data,
      })
    );
    expect(
      (
        await send('acc10_1', 'bot_start', '2026-11-13T09:00:00Z', {
          label: 'post__ig__paid',
        })
      ).status
    ).toBe(200);
    expect(
      (
        await send('acc10_2', 'purchase', '2026-11-13T09:30:00Z', {
          amount: '19.00',
          currency: 'EUR',
          payment_id: 'pi_acc10',
          plan: '1m',
          format: 'self',
        })
      ).status
    ).toBe(200);
    at('2026-11-14T03:00:00Z');
    expect(
      (
        await deliver(site, key, {
          id: 'acc10_summary',
          type: 'daily_summary',
          at: '2026-11-14T03:00:00Z',
          data: {
            day: '2026-11-13',
            counts: { bot_start: 1, purchase: 1 },
            revenue: { EUR: '19.00' },
          },
        })
      ).status
    ).toBe(200);
    const PERIOD = 'from=2026-11-01&to=2026-11-14&group=part:source';
    expect(
      (await get(site, `/analytics/sources?${PERIOD}`)).total.customers
    ).toBe(1);
    expect(
      (await send('acc10_3', 'user_deleted', '2026-11-15T10:00:00Z', {})).status
    ).toBe(200);
    at('2026-11-15T12:00:00Z');
    const people = await get(site, '/analytics/people');
    expect(people.total).toBe(0);
    expect(
      (await call(site, 'GET', '/analytics/people/u_acc10_gone')).status
    ).toBe(404);
    const sources = await get(site, `/analytics/sources?${PERIOD}`);
    expect([sources.total.people, sources.total.customers]).toEqual([0, 0]);
    // Сводка насчитала два события, их на сайте нет — они в счёте стёртого: «События дошли» в порядке.
    site.app.analytics.quality.tick();
    const day = await get(
      site,
      '/analytics/quality/events_arrived/2026-11-13?scope=bot'
    );
    expect([day.state, day.reason]).toEqual(['ok', null]);
    expect(JSON.stringify(day)).not.toContain('u_acc10_gone');
  });

  it('11. Редактор без нового права не видит ни выручки, ни людей', async () => {
    const { site } = await stage2Site();
    const routes = [
      '/analytics/settings',
      '/analytics/setup',
      '/analytics/set',
      '/analytics/set/samples',
      `/analytics/sources?${OCTOBER}`,
      `/analytics/funnel?${OCTOBER}`,
      `/analytics/answers?${OCTOBER}`,
      `/analytics/overview?${OCTOBER}`,
      `/analytics/cohorts?${OCTOBER}`,
      `/analytics/milestones?${OCTOBER}`,
      '/analytics/people',
      '/analytics/people/u_stage2_p01',
      '/analytics/events',
      '/analytics/unknown',
      '/analytics/labels',
      '/analytics/rates',
      '/analytics/spend',
      '/analytics/statements',
      '/analytics/intake',
      '/analytics/intake/daily',
      '/analytics/summaries',
      '/analytics/quality',
      '/analytics/quality/status',
      '/analytics/quality/summary_arrived/2026-11-14?scope=bot',
      '/analytics/log',
    ];
    for (const path of routes) {
      for (const who of ['editor', 'editorKey'] as const) {
        const denied = await call(site, 'GET', path, who);
        expect([path, who, denied.status, denied.body?.error?.code]).toEqual([
          path,
          who,
          403,
          'identity.forbidden',
        ]);
      }
    }
    // Изменить тоже нельзя: ни снять сбой, ни внести расход, ни загрузить набор.
    for (const { 0: method, 1: path, 2: body } of [
      ['PUT', '/analytics/spend', { rows: SPEND }],
      [
        'POST',
        '/analytics/quality/summary_arrived/2026-11-14/resolve',
        { scope: 'bot', note: 'x' },
      ],
      ['POST', '/analytics/set', SUBSCRIPTION],
    ] as const) {
      expect([
        path,
        (await call(site, method, path, 'editor', body)).status,
      ]).toEqual([path, 403]);
    }
    // Агент редактора не видит инструментов аналитики.
    const editor = site.app.identity.users
      .list()
      .find((_) => _.role === 'editor')!;
    const list = (await site.app.mcp(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      editor,
      defineAgentSession()
    )) as { result: { tools: { name: string }[] } };
    expect(
      list.result.tools.filter((_) =>
        /analytics|people|person|label|spend|check/.test(_.name)
      )
    ).toEqual([]);
    // Менеджер без права не делает ни одного запроса аналитики: вкладки и отметка — за can('analytics.read').
    const stats = join(import.meta.dir, '../manager/src/routes/(app)/stats');
    expect(await Bun.file(join(stats, 'StatsTabs.svelte')).text()).toContain(
      "{#if can('analytics.read')}"
    );
    expect(
      await Bun.file(
        join(import.meta.dir, '../manager/src/lib/quality-status.svelte.ts')
      ).text()
    ).toContain("can('analytics.read') &&");
  });

  it.skip('12. Реальная оплата видна в карточке с верными тарифом, суммой и источником — на живом сайте владельца', () => {
    // В репозитории не закрыть: нужны живой сайт владельца, его отправитель и настоящая оплата картой.
    // От владельца (ADR 0072, «Пункт 12 — на живом сайте»): обновить сайт до релиза этапа 4, загрузить свой набор или
    // образец «Подписка», включить приём и опубликовать абзац политики; выпустить ключ отправителю; открыть сайт по
    // ссылке с UTM, перейти к отправителю и оплатить тариф настоящей картой (и вернуть, если нужно); сообщить время
    // оплаты, тариф и сумму у платёжного сервиса и псевдоним или id события. Пункт закрыт, когда карточка человека
    // показала тариф, сумму, валюту и источник привлечения, на следующий день «Качество» — сводку сошедшейся, а
    // владелец подтвердил совпадение снимком.
  });
});
