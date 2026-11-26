import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import type { SetupAuthor } from '../src/contexts/analytics/index.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

// Деньги на сервере (ADR 0072, этап 3, часть 1): базовая валюта, курсы и строки расхода через API менеджера —
// права, журнал, отказы, «ждёт расхода», ссылки расходов на настройку, копии. Часы — 15 ноября 2026, пояс
// статистики — Europe/Berlin; люди — файл этапа 3.

const START = '2026-11-15T12:00:00.000Z';
const PASSWORD = 'correct horse battery';
const FILE = join(import.meta.dir, 'fixtures/analytics-stage3.jsonl');
const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };

let dir: string;
let app: App;
let admin = '';
let editor = '';
let token = '';

type Who = { readonly cookie?: string; readonly token?: string };
type Answer = { readonly status: number; readonly body: any };

const call = async (
  method: string,
  path: string,
  who: Who = {},
  body?: unknown
): Promise<Answer> => {
  const response = await app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who.cookie ? { cookie: who.cookie } : {}),
        ...(who.token ? { authorization: `Bearer ${who.token}` } : {}),
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

const asAdmin = (method: string, path: string, body?: unknown) =>
  call(method, path, { cookie: admin }, body);

const asKey = (method: string, path: string, body?: unknown) =>
  call(method, path, { token }, body);

const codeOf = (answer: Answer): string | undefined => answer.body?.error?.code;

const count = (path: string, table: string): number => {
  const db = new Database(path, { readonly: true });
  const { n } = db
    .query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`)
    .get()!;
  db.close();
  return n;
};

const siteDb = (): string => join(dir, 'site.db');

const open = (path: string): App =>
  createApp({
    databasePath: path,
    mediaCache: `${path}.cache`,
    clock: () => new Date(START),
  });

// Расходы плана тестов этапа 3: июнь, июль — Instagram платный; август — Facebook платный в злотых; сентябрь —
// Instagram без типа; октябрь — общий и Instagram платный нулём.
const ROWS = [
  {
    month: '2026-06',
    parts: { source: 'ig', channel: 'paid' },
    currency: 'EUR',
    amount: '60.00',
  },
  {
    month: '2026-07',
    parts: { channel: 'paid', source: 'ig' },
    currency: 'EUR',
    amount: 62,
  },
  {
    month: '2026-08',
    parts: { source: 'fb', channel: 'paid' },
    currency: 'PLN',
    amount: '400.00',
    note: 'Счёт Meta за август',
  },
  { month: '2026-09', parts: { source: 'ig' }, currency: 'EUR', amount: '30' },
  {
    month: '2026-10',
    parts: {},
    currency: 'EUR',
    amount: '50.00',
    note: 'Агентство',
  },
  {
    month: '2026-10',
    parts: { source: 'ig', channel: 'paid' },
    currency: 'EUR',
    amount: '0.00',
  },
];

// Курсы PLN плана тестов: с июня, с сентября и с октября; июля, августа и ноября нет, CHF нет совсем.
const RATES = [
  { currency: 'PLN', day: '2026-06-01', rate: '0.2300' },
  { currency: 'PLN', day: '2026-09-01', rate: 0.24 },
  { currency: 'PLN', day: '2026-10-01', rate: '0.2500' },
];

const euro = () =>
  asAdmin('PUT', '/analytics/settings', { baseCurrency: 'EUR' });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cms-analytics-money-'));
  app = open(siteDb());
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
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
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
  editor = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
  token = (await asAdmin('POST', '/tokens', { name: 'Скрипт' })).body.token;
  app.stats.settings.save({ timeZone: 'Europe/Berlin' });
  app.analytics.setup.apply(SUBSCRIPTION, ANNA);
  app.analytics.settings.save({ enabled: true }, ANNA);
  app.analytics.senders.issue('bot', 'Бот', ANNA);
  const report = await app.analytics.events.import(FILE);
  expect([report.accepted, report.rejected]).toEqual([29, 0]);
});

afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

const ROUTES: readonly (readonly [string, string])[] = [
  ['GET', '/analytics/rates'],
  ['PUT', '/analytics/rates'],
  ['DELETE', '/analytics/rates/PLN/2026-06-01'],
  ['GET', '/analytics/spend'],
  ['PUT', '/analytics/spend'],
  ['DELETE', '/analytics/spend/1'],
];

describe('права', () => {
  it('редактору — 403 на курсах и расходах, сеансом и ключом; без входа — 401', async () => {
    const key = (
      await call('POST', '/tokens', { cookie: editor }, { name: 'Редактор' })
    ).body.token;
    for (const [method, path] of ROUTES) {
      const body = method === 'PUT' ? { rows: ROWS, rates: RATES } : undefined;
      for (const who of [{ cookie: editor }, { token: key }]) {
        const denied = await call(method, path, who, body);
        expect([path, denied.status, codeOf(denied)]).toEqual([
          path,
          403,
          'identity.forbidden',
        ]);
      }
      expect((await call(method, path, {}, body)).status).toBe(401);
    }
    expect(app.analytics.spend.list().months.flatMap((_) => _.rows)).toEqual(
      []
    );
  });

  it('базовую валюту меняет только сеанс человека: ключ API — отказ; курсы и расходы ключ вносит', async () => {
    const refused = await asKey('PUT', '/analytics/settings', {
      baseCurrency: 'EUR',
    });
    expect([refused.status, codeOf(refused)]).toEqual([
      403,
      'identity.session_required',
    ]);
    expect(app.analytics.settings.get().baseCurrency).toBeNull();
    expect((await euro()).body).toEqual({
      enabled: true,
      retentionMonths: 0,
      baseCurrency: 'EUR',
    });
    expect(
      (await asKey('PUT', '/analytics/rates', { rates: RATES })).status
    ).toBe(200);
    expect(
      (await asKey('PUT', '/analytics/spend', { rows: ROWS })).status
    ).toBe(200);
    expect((await asKey('GET', '/analytics/rates')).status).toBe(200);
    expect((await asKey('GET', '/analytics/spend')).status).toBe(200);
  });
});

describe('базовая валюта', () => {
  it('по умолчанию её нет; задаёт человек, журнал пишет строкой settings, ревизия прежняя', async () => {
    expect((await asAdmin('GET', '/analytics/settings')).body).toEqual({
      enabled: true,
      retentionMonths: 0,
      baseCurrency: null,
    });
    const revision = app.analytics.setup.get().revision;
    await euro();
    expect(app.analytics.setup.get().revision).toBe(revision);
    expect(app.analytics.log.setup()[0]).toMatchObject({
      item: 'settings',
      action: 'changed',
      author: { name: 'Анна', agent: false },
      before: { baseCurrency: null },
      after: { baseCurrency: 'EUR', enabled: true },
    });
    // Та же валюта — без строки журнала; не код ISO 4217 — 422.
    const entries = app.analytics.log.setup().length;
    await euro();
    expect(app.analytics.log.setup()).toHaveLength(entries);
    for (const baseCurrency of ['eur', 'XAU', 'EURO', 978]) {
      const wrong = await asAdmin('PUT', '/analytics/settings', {
        baseCurrency,
      });
      expect([baseCurrency, wrong.status, codeOf(wrong)]).toEqual([
        baseCurrency,
        422,
        'analytics.invalid_currency',
      ]);
    }
    expect(app.analytics.settings.get().baseCurrency).toBe('EUR');
  });
});

describe('курсы', () => {
  it('без базовой валюты — 409 analytics.no_base_currency', async () => {
    const refused = await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    expect([refused.status, codeOf(refused)]).toEqual([
      409,
      'analytics.no_base_currency',
    ]);
  });

  it('пачка записывается по ключу; тот же курс — без записи и журнала; удаление; журнал — строками rate', async () => {
    await euro();
    const saved = await asKey('PUT', '/analytics/rates', { rates: RATES });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ created: 3, changed: 0 });
    expect(saved.body.rates).toEqual([
      {
        base: 'EUR',
        currency: 'PLN',
        day: '2026-06-01',
        rate: '0.2300',
        author: { name: 'Анна', agent: true },
        updatedAt: START,
      },
      expect.objectContaining({ day: '2026-09-01', rate: '0.24' }),
      expect.objectContaining({ day: '2026-10-01', rate: '0.2500' }),
    ]);
    const entries = app.analytics.log.setup().length;
    // Тот же курс другой записью — не правка.
    const again = await asAdmin('PUT', '/analytics/rates', {
      rates: [{ currency: 'PLN', day: '2026-09-01', rate: '0.2400' }, ...RATES],
    });
    expect([again.status, codeOf(again)]).toEqual([
      422,
      'analytics.invalid_rate',
    ]);
    expect(again.body.error.message).toContain(
      'rates[2] — the same currency and day as rates[0]'
    );
    const same = await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    expect(same.body).toMatchObject({ created: 0, changed: 0 });
    expect(app.analytics.log.setup()).toHaveLength(entries);
    const changed = await asAdmin('PUT', '/analytics/rates', {
      rates: [{ currency: 'PLN', day: '2026-10-01', rate: '0.2510' }],
    });
    expect(changed.body).toMatchObject({ created: 0, changed: 1 });
    expect(
      (await asAdmin('DELETE', '/analytics/rates/PLN/2026-10-01')).body
    ).toEqual({});
    const gone = await asAdmin('DELETE', '/analytics/rates/PLN/2026-10-01');
    expect([gone.status, codeOf(gone)]).toEqual([
      404,
      'analytics.rate_not_found',
    ]);
    expect(
      app.analytics.log
        .setup({ limit: 5 })
        .map((_) => [_.item, _.key, _.action, _.author?.agent])
    ).toEqual([
      ['rate', 'EUR/PLN/2026-10-01', 'removed', false],
      ['rate', 'EUR/PLN/2026-10-01', 'changed', false],
      ['rate', 'EUR/PLN/2026-10-01', 'created', true],
      ['rate', 'EUR/PLN/2026-09-01', 'created', true],
      ['rate', 'EUR/PLN/2026-06-01', 'created', true],
    ]);
    expect(app.analytics.log.setup()[1]).toMatchObject({
      before: { rate: '0.2500' },
      after: { rate: '0.2510' },
    });
    expect(app.analytics.log.setup()[1]?.after).not.toHaveProperty('author');
  });

  it('негодный ввод — 422 analytics.invalid_rate по всем путям сразу, ничего не записано', async () => {
    await euro();
    const wrong = await asAdmin('PUT', '/analytics/rates', {
      rates: [
        { currency: 'PLN', day: '2026-06-01', rate: '0' },
        { currency: 'pln', day: '2026-06-01', rate: '0.23' },
        { currency: 'EUR', day: '2026-06-01', rate: '1' },
        { currency: 'PLN', day: '2026-11-16', rate: '0.23' },
        { currency: 'PLN', day: '2026-6-1', rate: '-0.23' },
        { currency: 'PLN', day: '2026-07-01', rate: '0.23', note: 'банк' },
        { currency: 'PLN', day: '2026-08-01', rate: '0.00000000001' },
        { currency: 'PLN', day: '2026-08-02', rate: '1000000000' },
        { currency: 'USD', day: '2026-08-01', rate: '1.08' },
      ],
    });
    expect([wrong.status, codeOf(wrong)]).toEqual([
      422,
      'analytics.invalid_rate',
    ]);
    for (const path of [
      'rates[0].rate',
      'rates[1].currency',
      'rates[2].currency',
      'rates[3].day',
      'rates[4].day',
      'rates[4].rate',
      'rates[5].note',
      'rates[6].rate',
      'rates[7].rate',
    ]) {
      expect(wrong.body.error.message).toContain(path);
    }
    expect(
      app.analytics.rates.list().currencies.flatMap((_) => _.rates)
    ).toEqual([]);
    for (const body of [
      {},
      { rates: [] },
      { rates: 'PLN' },
      { rates: Array.from({ length: 101 }, () => RATES[0]) },
    ]) {
      const refused = await asAdmin('PUT', '/analytics/rates', body);
      expect([refused.status, codeOf(refused)]).toEqual([
        422,
        'analytics.invalid_rate',
      ]);
    }
  });

  it('экран курсов: валюты сайта, месяцы с суммами и чем они переводятся; после смены базы — прежние курсы числом', async () => {
    await euro();
    await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    await asAdmin('PUT', '/analytics/spend', { rows: ROWS });
    const report = (await asAdmin('GET', '/analytics/rates')).body;
    expect(report.baseCurrency).toBe('EUR');
    expect(
      report.currencies.map((_: { currency: string }) => _.currency)
    ).toEqual(['CHF', 'PLN']);
    expect(report.currencies[0]).toEqual({
      currency: 'CHF',
      rates: [],
      months: [{ month: '2026-10', day: null, rate: null, stale: false }],
    });
    expect(report.currencies[1].rates).toHaveLength(3);
    expect(report.currencies[1].months).toEqual([
      { month: '2026-06', day: '2026-06-01', rate: '0.2300', stale: false },
      { month: '2026-08', day: '2026-06-01', rate: '0.2300', stale: true },
      { month: '2026-09', day: '2026-09-01', rate: '0.24', stale: false },
    ]);
    expect(report.other).toEqual([]);
    await asAdmin('PUT', '/analytics/settings', { baseCurrency: 'PLN' });
    const other = (await asAdmin('GET', '/analytics/rates')).body;
    expect(
      other.currencies.map((_: { currency: string }) => _.currency)
    ).toEqual(['CHF', 'EUR']);
    expect(other.currencies[1].rates).toEqual([]);
    expect(other.other).toEqual([{ base: 'EUR', count: 3 }]);
  });

  it('экран курсов: возврат — месяцем своей оплаты, комиссия — месяцем оплаты в своей валюте, без оплаты — своим', async () => {
    await euro();
    await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    const accept = (id: string, type: string, at: string, data: object) =>
      expect(
        app.analytics.intake.accept(
          'bot',
          JSON.stringify({ id, type, at, subject: 'u_stage3_m4', data }),
          'http'
        ).kind
      ).toBe('accepted');
    // Возврат ноября — за августовскую оплату: курс августа, ноябрю курса не нужно.
    accept('s3_x1', 'refund', '2026-11-02T12:00:00Z', {
      amount: '200.00',
      currency: 'PLN',
      payment_id: 'pi_m4_1',
    });
    // Комиссия сентябрьской оплаты в CHF пришла в ноябре: месяц — сентябрь; без своей оплаты — ноябрь.
    accept('s3_x2', 'fee_settled', '2026-11-03T12:00:00Z', {
      payment_id: 'pi_m4_2',
      fee: '1.50',
      currency: 'CHF',
    });
    accept('s3_x3', 'fee_settled', '2026-11-04T12:00:00Z', {
      payment_id: 'pi_lost',
      fee: '0.20',
      currency: 'CHF',
    });
    const report = (await asAdmin('GET', '/analytics/rates')).body;
    expect(
      report.currencies.map((_: { currency: string; months: any[] }) => [
        _.currency,
        _.months.map((month) => month.month),
      ])
    ).toEqual([
      ['CHF', ['2026-09', '2026-10', '2026-11']],
      ['PLN', ['2026-06', '2026-08', '2026-09']],
    ]);
  });
});

describe('расходы', () => {
  it('пачка строк: суммы в базовой валюте, «курс прошлого месяца», автор и время', async () => {
    await euro();
    await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    const saved = await asKey('PUT', '/analytics/spend', { rows: ROWS });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ created: 6, changed: 0 });
    expect(
      saved.body.rows.map((_: Record<string, unknown>) => [
        _.month,
        _.parts,
        _.currency,
        _.amount,
        _.base,
        _.staleRate,
      ])
    ).toEqual([
      [
        '2026-06',
        { channel: 'paid', source: 'ig' },
        'EUR',
        6_000,
        6_000,
        false,
      ],
      [
        '2026-07',
        { channel: 'paid', source: 'ig' },
        'EUR',
        6_200,
        6_200,
        false,
      ],
      [
        '2026-08',
        { channel: 'paid', source: 'fb' },
        'PLN',
        40_000,
        9_200,
        true,
      ],
      ['2026-09', { source: 'ig' }, 'EUR', 3_000, 3_000, false],
      ['2026-10', {}, 'EUR', 5_000, 5_000, false],
      ['2026-10', { channel: 'paid', source: 'ig' }, 'EUR', 0, 0, false],
    ]);
    expect(saved.body.rows[2]).toMatchObject({
      note: 'Счёт Meta за август',
      author: { name: 'Анна', agent: true },
      createdAt: START,
      updatedAt: START,
      states: { channel: 'known', source: 'known' },
    });
  });

  it('месяцы по умолчанию — нынешний и пять прошлых: итоги месяцев и подсказка «ждёт расхода»', async () => {
    await euro();
    await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    await asAdmin('PUT', '/analytics/spend', { rows: ROWS });
    const report = (await asAdmin('GET', '/analytics/spend')).body;
    expect(report).toMatchObject({
      baseCurrency: 'EUR',
      from: '2026-06',
      to: '2026-11',
    });
    expect(
      report.months.map((_: { month: string; total: unknown }) => [
        _.month,
        _.total,
      ])
    ).toEqual([
      ['2026-06', { value: 6_000, unpriced: {}, staleRate: false }],
      ['2026-07', { value: 6_200, unpriced: {}, staleRate: false }],
      ['2026-08', { value: 9_200, unpriced: {}, staleRate: true }],
      ['2026-09', { value: 3_000, unpriced: {}, staleRate: false }],
      ['2026-10', { value: 5_000, unpriced: {}, staleRate: false }],
      ['2026-11', null],
    ]);
    // Октябрь закрыт строкой с нулём: подсказка одна — ноябрь.
    expect(report.hints).toEqual([
      {
        month: '2026-11',
        part: 'channel',
        value: 'paid',
        name: 'Платная',
        people: 1,
      },
    ]);
    expect(
      (await asAdmin('GET', '/analytics/spend?from=2026-06&to=2026-11')).body
    ).toEqual(report);
    // Месяц можно задать днём; один месяц — одна строка периода.
    const october = (
      await asAdmin('GET', '/analytics/spend?from=2026-10-15&to=2026-10-20')
    ).body;
    expect(october.months.map((_: { month: string }) => _.month)).toEqual([
      '2026-10',
    ]);
    expect(october.hints).toEqual([]);
    expect(
      (await asAdmin('GET', '/analytics/spend?days=31')).body.months.map(
        (_: { month: string }) => _.month
      )
    ).toEqual(['2026-10', '2026-11']);
    expect((await asAdmin('GET', '/analytics/spend?all=1')).body.from).toBe(
      '2026-06'
    );
    for (const query of [
      'from=2026-12',
      'to=2026-12',
      'from=2026-10&to=2026-09',
      'from=1999-12&to=2000-01',
      'from=2026-13',
      'from=октябрь',
      'days=0',
    ]) {
      const wrong = await asAdmin('GET', `/analytics/spend?${query}`);
      expect([query, wrong.status, codeOf(wrong)]).toEqual([
        query,
        422,
        'analytics.invalid_query',
      ]);
    }
  });

  it('повтор той же пачки ничего не меняет; правка по номеру и по ключу; журнал — строками spend', async () => {
    await euro();
    const first = (await asAdmin('PUT', '/analytics/spend', { rows: ROWS }))
      .body;
    const entries = app.analytics.log.setup().length;
    const again = (await asKey('PUT', '/analytics/spend', { rows: ROWS })).body;
    expect(again).toMatchObject({ created: 0, changed: 0 });
    expect(again.rows.map((_: { id: number }) => _.id)).toEqual(
      first.rows.map((_: { id: number }) => _.id)
    );
    expect(app.analytics.log.setup()).toHaveLength(entries);
    // По ключу: та же строка, новая сумма и заметка; по номеру — другой месяц.
    const byKey = (
      await asKey('PUT', '/analytics/spend', {
        rows: [{ ...ROWS[4], amount: '55.00', note: 'Агентство и сайт' }],
      })
    ).body;
    expect(byKey).toMatchObject({ created: 0, changed: 1 });
    expect(byKey.rows[0]).toMatchObject({
      id: first.rows[4].id,
      amount: 5_500,
      note: 'Агентство и сайт',
      author: { name: 'Анна', agent: true },
    });
    const byId = (
      await asAdmin('PUT', '/analytics/spend', {
        rows: [{ ...ROWS[3], id: first.rows[3].id, month: '2026-11' }],
      })
    ).body;
    expect(byId).toMatchObject({ created: 0, changed: 1 });
    expect(byId.rows[0]).toMatchObject({
      id: first.rows[3].id,
      month: '2026-11',
      createdAt: START,
      author: { name: 'Анна', agent: false },
    });
    // С номером и ключом другой строки — 409; нет такой строки — 404.
    const taken = await asAdmin('PUT', '/analytics/spend', {
      rows: [{ ...ROWS[0], id: first.rows[1].id }],
    });
    expect([taken.status, codeOf(taken)]).toEqual([
      409,
      'analytics.spend_exists',
    ]);
    const missing = await asAdmin('PUT', '/analytics/spend', {
      rows: [{ ...ROWS[0], id: 999 }],
    });
    expect([missing.status, codeOf(missing)]).toEqual([
      404,
      'analytics.spend_not_found',
    ]);
    expect(
      (await asAdmin('DELETE', `/analytics/spend/${first.rows[5].id}`)).body
    ).toEqual({});
    for (const id of [first.rows[5].id, 999, 'abc']) {
      const gone = await asAdmin('DELETE', `/analytics/spend/${id}`);
      expect([gone.status, codeOf(gone)]).toEqual([
        404,
        'analytics.spend_not_found',
      ]);
    }
    expect(
      app.analytics.log
        .setup({ limit: 4 })
        .map((_) => [_.item, _.key, _.action, _.author?.agent])
    ).toEqual([
      ['spend', String(first.rows[5].id), 'removed', false],
      ['spend', String(first.rows[3].id), 'changed', false],
      ['spend', String(first.rows[4].id), 'changed', true],
      ['spend', String(first.rows[5].id), 'created', false],
    ]);
    expect(app.analytics.log.setup()[2]).toMatchObject({
      before: { amount: 5_000, note: 'Агентство' },
      after: { amount: 5_500, note: 'Агентство и сайт' },
    });
    expect(app.analytics.log.setup()[2]?.before).not.toHaveProperty('author');
    // Строки расхода — не настройка: ревизия та же, что после набора.
    expect(app.analytics.setup.get().revision).toBe(1);
  });

  it('негодный ввод — 422 analytics.invalid_spend по всем путям сразу; все строки или ни одной', async () => {
    await euro();
    app.analytics.setup.archive(
      'value',
      { dictionary: 'source', code: 'tg' },
      true
    );
    const wrong = await asAdmin('PUT', '/analytics/spend', {
      rows: [
        ROWS[0],
        { ...ROWS[1], amount: '-62.00' },
        { ...ROWS[1], currency: 'XXX' },
        { ...ROWS[1], month: '2026-13' },
        { ...ROWS[1], month: '2026-12' },
        { ...ROWS[1], parts: { source: 'vk' } },
        { ...ROWS[1], parts: { source: 'tg' } },
        { ...ROWS[1], parts: { plan: '1m' } },
        { ...ROWS[1], amount: '62.001' },
        { ...ROWS[1], budget: true },
        { ...ROWS[0] },
        { ...ROWS[1], note: 'x'.repeat(501) },
        { ...ROWS[1], id: -1 },
      ],
    });
    expect([wrong.status, codeOf(wrong)]).toEqual([
      422,
      'analytics.invalid_spend',
    ]);
    for (const path of [
      'rows[1].amount',
      'rows[2].currency',
      'rows[3].month',
      'rows[4].month',
      'rows[5].parts.source',
      'rows[6].parts.source',
      'rows[7].parts.plan',
      'rows[8].amount',
    ]) {
      expect(wrong.body.error.message).toContain(path);
    }
    expect(wrong.body.error.message).toContain('and 2 more');
    expect(count(siteDb(), 'analytics_spend')).toBe(0);
    for (const body of [
      {},
      { rows: [] },
      { rows: ROWS[0] },
      { rows: Array.from({ length: 101 }, () => ROWS[0]) },
    ]) {
      const refused = await asAdmin('PUT', '/analytics/spend', body);
      expect([refused.status, codeOf(refused)]).toEqual([
        422,
        'analytics.invalid_spend',
      ]);
    }
  });

  it('большие суммы и длинные курсы — точно, без NaN и Infinity; не помещается в число — без перевода', async () => {
    await euro();
    await asAdmin('PUT', '/analytics/rates', {
      rates: [
        { currency: 'USD', day: '2026-11-01', rate: '123456789.0123456789' },
        { currency: 'JPY', day: '2026-11-01', rate: '999999999.9999999999' },
      ],
    });
    const saved = await asAdmin('PUT', '/analytics/spend', {
      rows: [
        { month: '2026-11', parts: {}, currency: 'USD', amount: '65399.07' },
        {
          month: '2026-11',
          parts: {},
          currency: 'JPY',
          amount: '999999999999999',
        },
        {
          month: '2026-10',
          parts: {},
          currency: 'EUR',
          amount: '90071992547409.91',
        },
      ],
    });
    expect(saved.status).toBe(200);
    expect(
      saved.body.rows.map((_: Record<string, unknown>) => [_.amount, _.base])
    ).toEqual([
      [6_539_907, 807_395_918_659_363],
      [999_999_999_999_999, null],
      [9_007_199_254_740_991, 9_007_199_254_740_991],
    ]);
    const months = (await asAdmin('GET', '/analytics/spend?from=2026-10')).body
      .months;
    expect(months[1].total).toEqual({
      value: 807_395_918_659_363,
      unpriced: { JPY: 999_999_999_999_999 },
      staleRate: false,
    });
    const tooBig = await asAdmin('PUT', '/analytics/spend', {
      rows: [
        {
          month: '2026-10',
          parts: {},
          currency: 'EUR',
          amount: '90071992547409.92',
        },
      ],
    });
    expect([tooBig.status, codeOf(tooBig)]).toEqual([
      422,
      'analytics.invalid_spend',
    ]);
    expect(JSON.stringify(months)).not.toMatch(/NaN|Infinity/);
  });

  it('без базовой валюты — суммы без перевода; смена базы на PLN без курсов к ней — евро «без курса»', async () => {
    const saved = (await asAdmin('PUT', '/analytics/spend', { rows: ROWS }))
      .body;
    expect(saved.rows.every((_: { base: unknown }) => _.base === null)).toBe(
      true
    );
    const plain = (await asAdmin('GET', '/analytics/spend')).body;
    expect(plain.baseCurrency).toBeNull();
    expect(
      plain.months.every((_: { total: unknown }) => _.total === null)
    ).toBe(true);
    await euro();
    await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    await asAdmin('PUT', '/analytics/settings', { baseCurrency: 'PLN' });
    const zloty = (await asAdmin('GET', '/analytics/spend')).body;
    expect(zloty.months[0].total).toEqual({
      value: 0,
      unpriced: { EUR: 6_000 },
      staleRate: false,
    });
    expect(zloty.months[2].total).toEqual({
      value: 40_000,
      unpriced: {},
      staleRate: false,
    });
  });
});

describe('«ждёт расхода» и ссылки расходов', () => {
  it('отметка у значения части видна в настройке; у других назначений — null', async () => {
    const setup = (await asKey('GET', '/analytics/setup')).body;
    const values = (code: string) =>
      setup.dictionaries.find((_: { code: string }) => _.code === code).values;
    expect(
      values('channel').map((_: { code: string; awaitsSpend: unknown }) => [
        _.code,
        _.awaitsSpend,
      ])
    ).toEqual([
      ['paid', true],
      ['organic', false],
      ['seo', false],
      ['referral', false],
      ['direct', false],
    ]);
    expect(
      values('heard_from').every(
        (_: { awaitsSpend: unknown }) => _.awaitsSpend === null
      )
    ).toBe(true);
    const refused = await asKey('PUT', '/analytics/setup/value', {
      dictionary: 'plan',
      code: '1m',
      awaitsSpend: true,
    });
    expect([refused.status, codeOf(refused)]).toEqual([
      422,
      'analytics.invalid_item',
    ]);
  });

  it('значение и часть с расходом не удалить и назначение не сменить — 409 analytics.in_use; в архив — можно', async () => {
    await asAdmin('PUT', '/analytics/spend', { rows: ROWS });
    const used = await asAdmin('POST', '/analytics/setup/value/remove', {
      dictionary: 'channel',
      code: 'paid',
    });
    expect([used.status, codeOf(used)]).toEqual([409, 'analytics.in_use']);
    expect(used.body.error.message).toContain('spend rows');
    // Своя часть без схемы и переходов: держит её только расход.
    await asAdmin('PUT', '/analytics/setup/dictionary', {
      code: 'promo',
      name: 'Акция',
      purpose: 'parts',
    });
    await asAdmin('PUT', '/analytics/setup/value', {
      dictionary: 'promo',
      code: 'spring',
      name: 'Весна',
    });
    const [promo] = (
      await asAdmin('PUT', '/analytics/spend', {
        rows: [
          {
            month: '2026-11',
            parts: { promo: 'spring' },
            currency: 'EUR',
            amount: '10',
          },
        ],
      })
    ).body.rows;
    for (const [path, body] of [
      ['/analytics/setup/dictionary', { code: 'promo', purpose: 'values' }],
    ] as const) {
      const refused = await asAdmin('PUT', path, body);
      expect([refused.status, codeOf(refused)]).toEqual([
        409,
        'analytics.in_use',
      ]);
    }
    for (const [path, body] of [
      [
        '/analytics/setup/value/remove',
        { dictionary: 'promo', code: 'spring' },
      ],
      ['/analytics/setup/dictionary/remove', { code: 'promo' }],
    ] as const) {
      const refused = await asAdmin('POST', path, body);
      expect([refused.status, codeOf(refused)]).toEqual([
        409,
        'analytics.in_use',
      ]);
    }
    const archived = await asAdmin('POST', '/analytics/setup/value/archive', {
      dictionary: 'promo',
      code: 'spring',
      archived: true,
    });
    expect(archived.status).toBe(200);
    // Значение в архиве: строка с ним правится, новая — нет.
    expect(
      (
        await asAdmin('PUT', '/analytics/spend', {
          rows: [
            {
              month: '2026-11',
              parts: { promo: 'spring' },
              currency: 'EUR',
              amount: '12',
            },
          ],
        })
      ).body
    ).toMatchObject({ changed: 1, rows: [{ states: { promo: 'archived' } }] });
    expect(
      codeOf(
        await asAdmin('PUT', '/analytics/spend', {
          rows: [
            {
              month: '2026-10',
              parts: { promo: 'spring' },
              currency: 'EUR',
              amount: '12',
            },
          ],
        })
      )
    ).toBe('analytics.invalid_spend');
    await asAdmin('DELETE', `/analytics/spend/${promo.id}`);
    expect(
      (
        await asAdmin('POST', '/analytics/setup/value/remove', {
          dictionary: 'promo',
          code: 'spring',
        })
      ).status
    ).toBe(200);
    expect(
      (
        await asAdmin('PUT', '/analytics/setup/dictionary', {
          code: 'promo',
          purpose: 'values',
        })
      ).status
    ).toBe(200);
  });
});

describe('копии сайта', () => {
  it('курсы, расходы и отметка «ждёт расхода» — в копии .db, в JSON-копии и в восстановлении', async () => {
    await euro();
    await asAdmin('PUT', '/analytics/rates', { rates: RATES });
    await asAdmin('PUT', '/analytics/spend', { rows: ROWS });
    const target = join(dir, 'copy.db');
    app.backup(target);
    expect(count(target, 'analytics_rates')).toBe(3);
    expect(count(target, 'analytics_spend')).toBe(6);
    const archive = app.archive();
    expect(archive.tables.analytics_rates).toHaveLength(3);
    expect(archive.tables.analytics_spend).toHaveLength(6);
    expect(
      (archive.tables.analytics_values as Record<string, unknown>[]).find(
        (_) => _.dictionary === 'channel' && _.code === 'paid'
      )
    ).toMatchObject({ awaits_spend: 1 });
    const spend = app.analytics.spend.list();
    const rates = app.analytics.rates.list();
    const other = open(join(dir, 'other.db'));
    try {
      await other.restore(await Bun.file(target).bytes());
      expect(other.analytics.rates.list()).toEqual(rates);
      expect(other.analytics.spend.list().months).toEqual(spend.months);
      expect(other.analytics.setup.get()).toEqual(app.analytics.setup.get());
      // Таблица людей после восстановления строится заново — подсказки те же.
      expect(other.analytics.spend.list().hints).toEqual(spend.hints);
      other.analytics.rates.remove('PLN', '2026-06-01');
      await other.restore(new TextEncoder().encode(JSON.stringify(archive)));
      expect(other.analytics.rates.list()).toEqual(rates);
      expect(other.analytics.spend.list().months).toEqual(spend.months);
    } finally {
      other.close();
    }
  });

  it('обновление до этапа 3: миграция 005 ставит «ждёт расхода» значениям частей и доходит до старой копии', async () => {
    app.close();
    const raw = new Database(siteDb());
    raw.transaction(() => {
      raw.run('DROP TABLE analytics_rates');
      raw.run('DROP TABLE analytics_spend');
      raw.run('ALTER TABLE analytics_values DROP COLUMN awaits_spend');
      raw.run("DELETE FROM _migrations WHERE id = 'analytics/005_money'");
    })();
    raw.close();
    const old = join(dir, 'stage2.db');
    copyFileSync(siteDb(), old);
    app = open(siteDb());
    const awaits = () =>
      Object.fromEntries(
        app.analytics.setup
          .get()
          .values.filter((_) => ['channel', 'plan'].includes(_.dictionary))
          .map((_) => [`${_.dictionary}/${_.code}`, _.awaitsSpend])
      );
    expect(awaits()).toMatchObject({
      'channel/paid': false,
      'channel/organic': false,
      'plan/1m': null,
    });
    expect(app.analytics.spend.list().months.flatMap((_) => _.rows)).toEqual(
      []
    );
    app.analytics.setup.save('value', {
      dictionary: 'channel',
      code: 'paid',
      awaitsSpend: true,
    });
    await app.restore(await Bun.file(old).bytes());
    expect(awaits()).toMatchObject({ 'channel/paid': false, 'plan/1m': null });
  });
});

// Отчёты с деньгами (часть 3): ручные таблицы плана тестов этапа 3 — «Источники», «Обзор», когорты, сравнение
// вех — через API менеджера, на тех же людях, курсах и расходах.
describe('отчёты с деньгами: ручные таблицы', () => {
  const ready = async () => {
    expect((await euro()).status).toBe(200);
    expect(
      (await asAdmin('PUT', '/analytics/rates', { rates: RATES })).status
    ).toBe(200);
    expect(
      (await asAdmin('PUT', '/analytics/spend', { rows: ROWS })).status
    ).toBe(200);
  };

  const get = async (path: string) => {
    const answer = await asAdmin('GET', path);
    expect([path, answer.status]).toEqual([path, 200]);
    return answer.body;
  };

  const sum = (value: any) =>
    value === null
      ? null
      : [value.value, value.unpriced, value.staleRate ? '≈' : ''];

  // Строка таблицы плана: новые, клиенты, выручка по валютам и в EUR, LTV (значение, прожили, живут срок),
  // расход, CAC, цена человека, LTV / CAC, окупаемость.
  const line = (row: any) => [
    row.value,
    row.people,
    row.customers,
    row.revenue,
    sum(row.revenueBase),
    row.ltvCustomer && [
      row.ltvCustomer.value,
      row.ltvCustomer.base,
      row.ltvCustomer.open,
    ],
    row.ltvPerson && [
      row.ltvPerson.value,
      row.ltvPerson.base,
      row.ltvPerson.open,
    ],
    sum(row.spend),
    row.cac,
    row.costPerPerson,
    row.ltvCac,
    row.payback?.months ?? null,
  ];

  const rowOf = (report: any, value: string) =>
    report.rows.find((_: { value: string }) => _.value === value);

  const SOURCES =
    '/analytics/sources?from=2026-06-01&to=2026-10-31&group=part:source';

  it('«Источники», срок 3 месяца: итог и строки по источнику — цифры таблицы плана', async () => {
    await ready();
    const report = await get(`${SOURCES}&life=3`);
    expect(report).toMatchObject({
      baseCurrency: 'EUR',
      life: 3,
      fees: 'gross',
      feeCoverage: null,
      compare: null,
      spend: {
        scope: 'rows',
        reason: null,
        prorated: false,
        unassigned: { value: 5_000, unpriced: {}, staleRate: false },
        broader: null,
      },
    });
    expect(line(report.total)).toEqual([
      '',
      8,
      6,
      { EUR: 14_400, PLN: 40_000, CHF: 2_000 },
      [23_800, { CHF: 2_000 }, '≈'],
      [5_000, 4, 2],
      [4_000, 5, 3],
      [29_400, {}, '≈'],
      4_900,
      3_675,
      1.02,
      3,
    ]);
    expect(report.rows.map((_: { value: string }) => _.value)).toEqual([
      'ig',
      'fb',
      'tg',
      '~none',
    ]);
    expect(line(rowOf(report, 'ig'))).toEqual([
      'ig',
      4,
      4,
      { EUR: 9_500, PLN: 0, CHF: 2_000 },
      [9_500, { CHF: 2_000 }, ''],
      [2_850, 2, 2],
      [2_850, 2, 2],
      [15_200, {}, ''],
      3_800,
      3_800,
      0.75,
      5,
    ]);
    expect(line(rowOf(report, 'fb'))).toEqual([
      'fb',
      2,
      2,
      { EUR: 4_900, PLN: 40_000 },
      [14_300, {}, '≈'],
      [7_150, 2, 0],
      [7_150, 2, 0],
      [9_200, {}, '≈'],
      4_600,
      4_600,
      1.55,
      1,
    ]);
    // Строки без расхода — «—», а не ноль; у человека без оплат LTV на человека — 0.00 из одного.
    expect(line(rowOf(report, 'tg'))).toEqual([
      'tg',
      1,
      0,
      {},
      [0, {}, ''],
      [null, 0, 0],
      [null, 0, 1],
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(rowOf(report, '~none')).toMatchObject({
      ltvPerson: { value: 0, base: 1, open: 0 },
      spend: null,
      spendMissing: false,
    });
    expect(
      [report.total, ...report.rows].every(
        (_: { lowData: { customers: boolean; people: boolean } }) =>
          _.lowData.people && _.lowData.customers
      )
    ).toBe(true);
    expect(
      [report.total, rowOf(report, 'ig'), rowOf(report, 'fb')].map(
        (_: { payback: { lived: number } }) => _.payback.lived
      )
    ).toEqual([5, 5, 3]);
  });

  it('пороги «мало данных» правкой low_data — без перезапуска: флаги строк и LTV меняются, цифры таблицы — нет', async () => {
    await ready();
    const before = await get(`${SOURCES}&life=3`);
    expect(before.lowData).toEqual({ people: 30, customers: 10 });
    expect(before.total.ltvCustomer.low).toBe(true);
    const saved = await asAdmin('PUT', '/analytics/setup/check', {
      code: 'low_data',
      params: { people: 1, customers: 1 },
    });
    expect(saved.status).toBe(200);
    const after = await get(`${SOURCES}&life=3`);
    expect(after.lowData).toEqual({ people: 1, customers: 1 });
    expect(after.total.lowData).toEqual({ people: false, customers: false });
    expect(after.total.ltvCustomer.low).toBe(false);
    expect([after.total, ...after.rows].map(line)).toEqual(
      [before.total, ...before.rows].map(line)
    );
    const cohorts = await get(COHORTS);
    expect(cohorts.lowData).toEqual({ people: 1, customers: 1 });
    expect(cohorts.rows.some((_: { lowData: boolean }) => _.lowData)).toBe(
      false
    );
    // Удаление поправки — снова 30 и 10: ручные таблицы прежние.
    await asAdmin('POST', '/analytics/setup/check/remove', {
      code: 'low_data',
    });
    expect((await get(`${SOURCES}&life=3`)).total.lowData).toEqual({
      people: true,
      customers: true,
    });
  });

  it('после комиссии: выручка, LTV и LTV / CAC ниже, окупаемость та же, комиссия известна у 2 из 10 оплат', async () => {
    await ready();
    const report = await get(`${SOURCES}&life=3&fees=net`);
    expect(report.feeCoverage).toEqual({ payments: 10, withFee: 2 });
    expect(line(report.total)).toEqual([
      '',
      8,
      6,
      { EUR: 14_170, PLN: 40_000, CHF: 2_000 },
      [23_570, { CHF: 2_000 }, '≈'],
      [4_943, 4, 2],
      [3_954, 5, 3],
      [29_400, {}, '≈'],
      4_900,
      3_675,
      1.01,
      3,
    ]);
    expect(
      ['ig', 'fb'].map((value) =>
        ((row) => [
          row.revenue.EUR,
          row.ltvCustomer.value,
          row.ltvCac,
          row.payback.months,
        ])(rowOf(report, value))
      )
    ).toEqual([
      [9_420, 2_810, 0.74, 5],
      [4_750, 7_075, 1.54, 1],
    ]);
  });

  it('срок жизни «всё время» по умолчанию — реализованный LTV на сегодня', async () => {
    await ready();
    const report = await get(SOURCES);
    expect(report.life).toBe(0);
    expect(
      [report.total, ...report.rows].map((_: any) => [
        _.value,
        _.ltvCustomer.value,
        _.ltvPerson.value,
        _.ltvPerson.base,
        _.ltvCac,
      ])
    ).toEqual([
      ['', 4_283, 3_213, 8, 0.87],
      ['ig', 2_850, 2_850, 4, 0.75],
      ['fb', 7_150, 7_150, 2, 1.55],
      ['tg', null, 0, 1, null],
      ['~none', null, 0, 1, null],
    ]);
  });

  it('фильтр «Тип = Платная»: шире фильтра — 80.00 не учтены; группа по типу — без части 80.00 под таблицей', async () => {
    await ready();
    const paid = await get(`${SOURCES}&life=3&part.channel=paid`);
    expect(line(paid.total)).toEqual([
      '',
      5,
      5,
      { EUR: 10_600, PLN: 40_000, CHF: 2_000 },
      [20_000, { CHF: 2_000 }, '≈'],
      [5_000, 4, 1],
      [5_000, 4, 1],
      [21_400, {}, '≈'],
      4_280,
      4_280,
      1.17,
      2,
    ]);
    expect(
      ['ig', 'fb'].map((value) =>
        ((row) => [row.spend.value, row.cac])(rowOf(paid, value))
      )
    ).toEqual([
      [12_200, 4_067],
      [9_200, 4_600],
    ]);
    expect(paid.spend).toMatchObject({
      unassigned: null,
      broader: { value: 8_000 },
    });
    const channels = await get(
      '/analytics/sources?from=2026-06-01&to=2026-10-31&group=part:channel'
    );
    expect(
      ['paid', 'organic'].map((value) =>
        ((row) => [row.spend?.value ?? null, row.cac])(rowOf(channels, value))
      )
    ).toEqual([
      [21_400, 4_280],
      [null, null],
    ]);
    expect(channels.spend.unassigned.value).toBe(8_000);
    // Ноябрь: у «Платной» новый человек, а расхода нет — «расход не введён».
    const november = await get(
      '/analytics/sources?from=2026-11-01&group=part:channel'
    );
    expect(rowOf(november, 'paid')).toMatchObject({
      people: 1,
      spend: null,
      spendMissing: true,
    });
    expect(november.spend.prorated).toBe(true);
  });

  it('расход не разложить: возврат и фильтр по признаку — нигде, группа по ответу — только итог', async () => {
    await ready();
    const base = '/analytics/sources?from=2026-06-01&to=2026-10-31';
    expect((await get(`${base}&attribution=return`)).spend).toMatchObject({
      scope: 'none',
      reason: 'return',
    });
    const filtered = await get(`${base}&trait.lang=ru`);
    expect(filtered.spend).toMatchObject({ scope: 'none', reason: 'filter' });
    expect(filtered.total.spend).toBeNull();
    const answers = await get(`${base}&group=answer:heard_from`);
    expect(answers.spend).toMatchObject({ scope: 'total', reason: 'group' });
    expect(answers.total.spend.value).toBe(29_400);
    expect(
      answers.rows.every((_: { spend: unknown }) => _.spend === null)
    ).toBe(true);
  });

  it('без базовой валюты — выручка по валютам, как на этапе 2; денег одной цифрой нет', async () => {
    expect(
      (await asAdmin('PUT', '/analytics/spend', { rows: ROWS })).status
    ).toBe(200);
    const report = await get(`${SOURCES}&life=3`);
    expect(report).toMatchObject({ baseCurrency: null, spend: null });
    expect(report.total).toMatchObject({
      revenue: { EUR: 14_400, PLN: 40_000, CHF: 2_000 },
      revenueBase: null,
      ltvCustomer: null,
      ltvPerson: null,
      spend: null,
      cac: null,
      ltvCac: null,
      payback: null,
    });
    expect(report.columns.map((_: { kind: string }) => _.kind)).not.toContain(
      'spend'
    );
  });

  it('сравнение: итог прошлого периода со своим расходом; год назад — пусто; при «всё время» — нет', async () => {
    await ready();
    const october = await get(
      '/analytics/sources?from=2026-10-01&to=2026-10-31&group=part:source&compare=previous'
    );
    expect(october.compare).toMatchObject({
      kind: 'previous',
      from: '2026-08-31',
      to: '2026-09-30',
    });
    expect(line(october.compare.total)).toEqual([
      '',
      1,
      1,
      { EUR: 1_900, PLN: 10_000 },
      [4_400, {}, ''],
      [5_700, 1, 0],
      [5_700, 1, 0],
      [3_297, {}, '≈'],
      3_297,
      3_297,
      1.73,
      2,
    ]);
    const year = await get(
      '/analytics/sources?from=2026-10-01&to=2026-10-31&compare=year'
    );
    expect(year.compare).toMatchObject({
      kind: 'year',
      from: '2025-10-01',
      to: '2025-10-31',
      total: { people: 0, customers: 0, spend: null },
    });
    expect(
      (await get('/analytics/sources?all=1&compare=previous')).compare
    ).toBeNull();
  });

  it('«Обзор» за октябрь и прошлые 31 день; за 15 октября – 14 ноября — расход долей дней', async () => {
    await ready();
    const overview = await get(
      '/analytics/overview?from=2026-10-01&to=2026-10-31'
    );
    expect(overview).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      baseCurrency: 'EUR',
      compare: { from: '2026-08-31', to: '2026-09-30' },
    });
    expect(overview.current).toEqual({
      people: 2,
      customers: 1,
      revenue: { EUR: 1_900, CHF: 2_000 },
      revenueBase: { value: 1_900, unpriced: { CHF: 2_000 }, staleRate: false },
      revenueNet: { value: 1_900, unpriced: { CHF: 2_000 }, staleRate: false },
      active: 2,
      spend: { value: 5_000, unpriced: {}, staleRate: false },
      cac: 5_000,
    });
    expect(overview.previous).toEqual({
      people: 1,
      customers: 1,
      revenue: { EUR: 1_900, PLN: 10_000 },
      revenueBase: { value: 4_400, unpriced: {}, staleRate: false },
      revenueNet: { value: 4_400, unpriced: {}, staleRate: false },
      active: 3,
      spend: { value: 3_297, unpriced: {}, staleRate: true },
      cac: 3_297,
    });
    const shifted = await get(
      '/analytics/overview?from=2026-10-15&to=2026-11-14'
    );
    expect(shifted.current).toMatchObject({
      people: 2,
      customers: 1,
      revenueBase: { value: 3_800 },
      active: 2,
      spend: { value: 2_742 },
    });
    // По умолчанию — последние 30 дней.
    expect(await get('/analytics/overview')).toMatchObject({
      from: '2026-10-17',
      to: '2026-11-15',
    });
  });

  // Ячейка когорты строкой: ◌ — неполная, n/m — значение и прожившие, U — без курса, ≈ — курс прошлого месяца.
  const cells = (row: any, count = 7) =>
    row.cells
      .slice(0, count)
      .map((_: any) =>
        _.state === 'future'
          ? ''
          : `${_.state === 'incomplete' ? '◌' : ''}${_.value ?? '—'}/${_.base}${_.unpriced ? 'U' : ''}${_.staleRate ? '≈' : ''}`
      );

  const COHORTS = '/analytics/cohorts?from=2026-06-01&to=2026-11-15';

  it('когорты по первой оплате: накопленная выручка на клиента — таблица плана, среднее по полным ячейкам', async () => {
    await ready();
    const report = await get(COHORTS);
    expect(report).toMatchObject({
      basis: 'payment',
      metric: 'cumulative',
      metrics: ['cumulative', 'monthly', 'active'],
      fees: 'gross',
      baseCurrency: 'EUR',
    });
    expect(
      report.rows.map((_: any) => [_.month, _.customers, _.open, ...cells(_)])
    ).toEqual([
      [
        '2026-06',
        2,
        false,
        '2100/2',
        '3050/2',
        '2850/2',
        '2850/2',
        '◌5700/1',
        '◌—/0',
        '',
      ],
      ['2026-07', 1, false, '4900/1', '4900/1', '4900/1', '◌—/0', '', '', ''],
      [
        '2026-08',
        1,
        false,
        '4600/1≈',
        '9400/1≈',
        '9400/1≈',
        '◌—/0',
        '',
        '',
        '',
      ],
      ['2026-09', 1, false, '1900/1', '3800/1', '◌—/0', '', '', '', ''],
      ['2026-10', 1, false, '0/1U', '◌—/0', '', '', '', '', ''],
      ['2026-11', 1, true, '◌—/0', '', '', '', '', '', ''],
    ]);
    expect(report.average.slice(0, 5)).toEqual([
      { value: 3_120, cohorts: 4, customers: 5 },
      { value: 4_840, cohorts: 4, customers: 5 },
      { value: 5_000, cohorts: 3, customers: 4 },
      { value: 2_850, cohorts: 1, customers: 2 },
      { value: null, cohorts: 0, customers: 0 },
    ]);
    expect(report.rows.every((_: { lowData: boolean }) => _.lowData)).toBe(
      true
    );
    // По умолчанию — 12 месяцев (days=365): 13 строк.
    expect((await get('/analytics/cohorts')).rows).toHaveLength(13);
  });

  it('когорты: выручка месяца, действующий доступ и после комиссии', async () => {
    await ready();
    const monthly = await get(`${COHORTS}&metric=monthly`);
    expect([cells(monthly.rows[0], 5), cells(monthly.rows[2], 3)]).toEqual([
      ['2100/2', '950/2', '-200/2', '0/2', '◌0/1'],
      ['4600/1≈', '4800/1', '0/1'],
    ]);
    const active = await get(`${COHORTS}&metric=active`);
    expect([0, 1, 2].map((_) => cells(active.rows[_], 5))).toEqual([
      ['2/2', '1/2', '1/2', '0/2', '◌0/1'],
      ['1/1', '1/1', '1/1', '◌—/0', ''],
      ['1/1', '1/1', '0/1', '◌—/0', ''],
    ]);
    const net = await get(`${COHORTS}&fees=net`);
    expect(cells(net.rows[0], 4)).toEqual([
      '2060/2',
      '3010/2',
      '2810/2',
      '2810/2',
    ]);
    expect(
      net.average.slice(0, 4).map((_: { value: number }) => _.value)
    ).toEqual([3_074, 4_794, 4_943, 2_810]);
    // Без базовой валюты деньги когорт пусты, а доступ считается.
    await asAdmin('PUT', '/analytics/settings', { baseCurrency: null });
    const plain = await get(COHORTS);
    expect(plain.baseCurrency).toBeNull();
    expect(plain.rows[0].cells[0]).toMatchObject({
      state: 'complete',
      value: null,
    });
    expect((await get(`${COHORTS}&metric=active`)).rows[0].cells[0].value).toBe(
      2
    );
  });

  it('когорты по приходу: доли пути по месяцам прихода, неполные — с «ещё в окне» и месяц, который идёт', async () => {
    await ready();
    const report = await get(`${COHORTS}&basis=arrival`);
    expect(report.basis).toBe('arrival');
    expect(report.columns.map((_: { kind: string }) => _.kind)).toEqual([
      'people',
      'milestone',
      'trial',
      'payment7',
      'payment30',
      'customers',
    ]);
    const share = (_: { count: number; base: number; open: number }) =>
      `${_.count}/${_.base}${_.open > 0 ? `+${_.open}` : ''}`;
    const row = (_: any) => [
      _.month,
      _.people,
      _.open,
      share(_.milestones.activation),
      share(_.trial),
      share(_.payment7),
      share(_.payment30),
      _.customers,
    ];
    expect(report.rows.map(row)).toEqual([
      ['2026-06', 3, false, '1/3', '0/3', '2/3', '2/3', 2],
      ['2026-07', 1, false, '0/1', '0/1', '1/1', '1/1', 1],
      ['2026-08', 1, false, '0/1', '0/1', '1/1', '1/1', 1],
      ['2026-09', 1, false, '1/1', '0/1', '1/1', '1/1', 1],
      ['2026-10', 2, false, '0/2', '1/2', '1/2', '1/1+1', 1],
      ['2026-11', 1, true, '0/1', '0/1', '1/1', '1/1', 1],
    ]);
    expect(share(report.average.payment30)).toBe('5/6');
    expect(share(report.average.milestones.activation)).toBe('2/8');
  });

  it('сравнение вех: «Активация» — достигли 2, не достигли 6; оплатили 2 из 2 и 4 из 5, +1 в окне', async () => {
    const report = await get(
      '/analytics/milestones?from=2026-06-01&to=2026-10-31&window=30'
    );
    expect(report).toMatchObject({ window: 30, people: 8 });
    expect(report.milestones).toEqual([
      {
        code: 'activation',
        name: 'Активация',
        reached: 2,
        missed: 6,
        open: 0,
        paidReached: { count: 2, base: 2, open: 0 },
        paidMissed: { count: 4, base: 5, open: 1 },
        lowData: true,
      },
    ]);
    // «Достигли» и «не достигли» ведут к тем же людям.
    const people = (query: string) =>
      get(`/analytics/people?from=2026-06-01&to=2026-10-31&${query}`).then(
        (_) => _.total
      );
    expect([
      await people('milestone=activation'),
      await people('milestone=activation&reached=0'),
    ]).toEqual([2, 6]);
  });

  it('люди когорты: by=payment — период по первой оплате и фильтры отчёта', async () => {
    const june = await get(
      '/analytics/people?from=2026-06-01&to=2026-06-30&by=payment'
    );
    expect(
      june.people.map((_: { subject: string }) => _.subject).toSorted()
    ).toEqual(['u_stage3_m1', 'u_stage3_m2']);
    expect(
      (
        await get(
          '/analytics/people?from=2026-06-01&to=2026-10-31&by=payment&part.source=fb'
        )
      ).total
    ).toBe(2);
    // Без периода — все клиенты.
    expect((await get('/analytics/people?by=payment')).total).toBe(7);
  });

  it('воронка: деньги шагов оплаты и в базовой валюте, сравнение с прошлым периодом', async () => {
    await ready();
    const report = await get(
      '/analytics/funnel?from=2026-06-01&to=2026-10-31&compare=previous'
    );
    expect(report.baseCurrency).toBe('EUR');
    const payment = report.steps[5];
    expect(payment.step).toEqual({ kind: 'payment', number: 1 });
    expect(payment.money.base).toMatchObject({ unpriced: {} });
    expect(payment.money.perPersonBase).toBe(
      Math.round(payment.money.base.value / payment.count)
    );
    expect(report.compare).toMatchObject({
      kind: 'previous',
      from: '2025-12-30',
      to: '2026-05-31',
    });
    expect(report.compare.steps).toHaveLength(report.steps.length);
    expect(report.compare.steps[2]).toEqual({ count: 0, money: null });
  });

  it('повтор файла и пачки расходов цифр не меняет; уточнение комиссии задним числом меняет net, но не gross', async () => {
    await ready();
    const before = [
      await get(`${SOURCES}&life=3`),
      await get(`${SOURCES}&life=3&fees=net`),
      await get(COHORTS),
    ].map((_) => JSON.stringify({ ..._, asOf: null }));
    const logged = app.analytics.log.setup({ limit: 200 }).length;
    expect((await app.analytics.events.import(FILE)).duplicates).toBe(29);
    expect(
      (await asAdmin('PUT', '/analytics/spend', { rows: ROWS })).body
    ).toMatchObject({ created: 0, changed: 0 });
    expect(app.analytics.log.setup({ limit: 200 })).toHaveLength(logged);
    const after = [
      await get(`${SOURCES}&life=3`),
      await get(`${SOURCES}&life=3&fees=net`),
      await get(COHORTS),
    ].map((_) => JSON.stringify({ ..._, asOf: null }));
    expect(after).toEqual(before);
    // Комиссия второй оплаты M1 пришла в ноябре: ложится на июль, моментом оплаты.
    const amendment = JSON.stringify({
      id: 's3_fee_late',
      type: 'fee_settled',
      at: '2026-11-10T10:00:00Z',
      subject: 'u_stage3_m1',
      data: { payment_id: 'pi_m1_2', fee: '0.50' },
    });
    expect(
      (await app.analytics.events.import(new Response(amendment).body!))
        .accepted
    ).toBe(1);
    const gross = await get(`${SOURCES}&life=3`);
    const net = await get(`${SOURCES}&life=3&fees=net`);
    expect(gross.total.revenue.EUR).toBe(14_400);
    expect(net.total.revenue.EUR).toBe(14_120);
    expect(net.total.ltvCustomer.value).toBe(4_930);
    expect(net.feeCoverage).toEqual({ payments: 10, withFee: 3 });
  });

  it('смена базовой валюты на PLN без курсов к ней — суммы в евро «без курса»', async () => {
    await ready();
    await asAdmin('PUT', '/analytics/settings', { baseCurrency: 'PLN' });
    const report = await get(`${SOURCES}&life=3`);
    expect(report.baseCurrency).toBe('PLN');
    expect(report.total.revenueBase).toEqual({
      value: 40_000,
      unpriced: { EUR: 14_400, CHF: 2_000 },
      staleRate: false,
    });
    expect(report.total.spend).toEqual({
      value: 40_000,
      unpriced: { EUR: 20_200 },
      staleRate: false,
    });
  });
});

describe('отчёты с деньгами: пусто и негодно', () => {
  // Все числа ответа — конечные: JSON превращает NaN и Infinity в null, поэтому проверка — до сериализации.
  const finite = (value: unknown): boolean =>
    typeof value === 'number'
      ? Number.isFinite(value)
      : Array.isArray(value)
        ? value.every(finite)
        : value !== null && typeof value === 'object'
          ? Object.values(value).every(finite)
          : true;

  const all = () => [
    app.analytics.reports.sources({ days: 365 }),
    app.analytics.reports.sources({
      days: 365,
      life: 6,
      fees: 'net',
      compare: 'previous',
    }),
    app.analytics.reports.sources({
      days: 30,
      attribution: 'return',
      compare: 'year',
    }),
    app.analytics.reports.funnel({ days: 365, compare: 'previous' }),
    app.analytics.reports.overview({ days: 30 }),
    app.analytics.reports.overview({ all: 1 }),
    app.analytics.reports.cohorts({}),
    app.analytics.reports.cohorts({ metric: 'monthly', fees: 'net' }),
    app.analytics.reports.cohorts({ metric: 'active' }),
    app.analytics.reports.cohorts({ basis: 'arrival' }),
    app.analytics.reports.milestones({ days: 365, window: 7 }),
  ];

  it('сайт без базовой валюты, курсов, расходов — и с ними: отчёты отвечают, чисел NaN и Infinity нет', async () => {
    for (const report of all()) {
      expect(finite(report)).toBe(true);
    }
    await euro();
    // Расход в месяц без людей и клиентов: CAC и цена человека — null, а не деление на ноль.
    await asAdmin('PUT', '/analytics/spend', {
      rows: [
        {
          month: '2026-05',
          parts: { source: 'ig' },
          currency: 'EUR',
          amount: '10',
        },
      ],
    });
    for (const report of all()) {
      expect(finite(report)).toBe(true);
    }
    const may = app.analytics.reports.sources({
      from: '2026-05-01',
      to: '2026-05-31',
      group: 'part:source',
    }) as any;
    expect(may.total).toMatchObject({
      people: 0,
      customers: 0,
      spend: { value: 1_000 },
      cac: null,
      costPerPerson: null,
      ltvCac: null,
      payback: null,
    });
    expect(may.rows).toMatchObject([
      { value: 'ig', people: 0, spend: { value: 1_000 } },
    ]);
  });

  it('пустой сайт: отчёты отвечают и говорят, чего нет', () => {
    const empty = createApp({ clock: () => new Date(START) });
    try {
      empty.analytics.setup.apply(SUBSCRIPTION, ANNA);
      const reports = [
        empty.analytics.reports.sources({ days: 365, life: 12 }),
        empty.analytics.reports.overview({}),
        empty.analytics.reports.cohorts({}),
        empty.analytics.reports.cohorts({ basis: 'arrival' }),
        empty.analytics.reports.milestones({}),
        empty.analytics.reports.funnel({ compare: 'year' }),
      ];
      for (const report of reports) {
        expect(finite(report)).toBe(true);
      }
      expect(empty.analytics.reports.overview({}).current).toEqual({
        people: 0,
        customers: 0,
        revenue: {},
        revenueBase: null,
        revenueNet: null,
        // Роль «конец доступа» у набора есть: доступ считается и у пустого сайта — ноль.
        active: 0,
        spend: null,
        cac: null,
      });
      expect(
        (empty.analytics.reports.cohorts({}) as any).average.every(
          (_: { value: unknown }) => _.value === null
        )
      ).toBe(true);
    } finally {
      empty.close();
    }
  });

  it('негодные параметры — 422 analytics.invalid_query, а не 500', async () => {
    for (const path of [
      '/analytics/sources?life=5',
      '/analytics/sources?life=abc',
      '/analytics/sources?fees=after',
      '/analytics/sources?compare=week',
      '/analytics/funnel?compare=1',
      '/analytics/cohorts?basis=paid',
      '/analytics/cohorts?metric=ltv',
      '/analytics/cohorts?from=2016-10-31&to=2026-11-01',
      '/analytics/cohorts?days=0',
      '/analytics/overview?from=2026-11-20',
      '/analytics/milestones?window=14',
      '/analytics/people?by=paid',
      '/analytics/people?by=payment&attribution=return',
      '/analytics/people?by=payment&funnel=journey&step=2',
      '/analytics/people?reached=0',
      '/analytics/people?milestone=activation&reached=2',
    ]) {
      const refused = await asAdmin('GET', path);
      expect([path, refused.status, codeOf(refused)]).toEqual([
        path,
        422,
        'analytics.invalid_query',
      ]);
    }
    // Сравнение при «всё время» — не ошибка: его переносят вкладки.
    expect(
      (await asAdmin('GET', '/analytics/sources?all=1&compare=year')).status
    ).toBe(200);
  });

  it('без данных о доступе показателя active нет; без роли «оплата» когорты — по приходу', async () => {
    const bare = createApp({ clock: () => new Date(START) });
    try {
      bare.analytics.setup.apply(
        {
          ...SUBSCRIPTION,
          types: SUBSCRIPTION.types?.filter((_) => _.role !== 'lapse'),
        },
        ANNA
      );
      expect((bare.analytics.reports.cohorts({}) as any).metrics).toEqual([
        'cumulative',
        'monthly',
      ]);
      expect(() =>
        bare.analytics.reports.cohorts({ metric: 'active' })
      ).toThrow('The metric active needs access data');
    } finally {
      bare.close();
    }
    const shop = createApp({ clock: () => new Date(START) });
    try {
      shop.analytics.setup.apply(
        {
          ...SUBSCRIPTION,
          types: SUBSCRIPTION.types?.filter((_) => _.role !== 'payment'),
          funnels: [],
        },
        ANNA
      );
      expect(shop.analytics.reports.cohorts({}).basis).toBe('arrival');
      expect(() =>
        shop.analytics.reports.cohorts({ basis: 'payment' })
      ).toThrow('role payment');
    } finally {
      shop.close();
    }
  });

  it('клиенты для когорт и «Обзора» читаются по частичному индексу first_paid_at', () => {
    const raw = new Database(siteDb(), { readonly: true });
    const plan = (sql: string) =>
      raw
        .query<{ detail: string }, []>(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((_) => _.detail)
        .join();
    expect(
      plan(`SELECT subject, money FROM analytics_people
        WHERE first_paid_at IS NOT NULL AND first_paid_at >= '2026-06-01' AND first_paid_at < '2026-07-01'
          AND (0 = 1 OR test = 0)`)
    ).toContain('analytics_people_paid');
    expect(
      plan(`SELECT subject, money FROM analytics_people
        WHERE first_paid_at IS NOT NULL AND first_paid_at < '2026-07-01' AND (0 = 1 OR test = 0)`)
    ).toContain('analytics_people_paid');
    raw.close();
  });
});
