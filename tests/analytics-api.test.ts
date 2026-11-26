import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

// API менеджера для аналитики клиентского пути (ADR 0072): права, «только сеанс», ключ отправителя один раз,
// журналы с автором, люди, журнал событий и загрузка файла.

const PASSWORD = 'correct horse battery';
const START = '2027-11-14T18:30:00.000Z';
const SUBJECT = 'u_3b9e0c7a1f';

let dir: string;
let app: App;
let now: Date;
let admin = '';
let editor = '';
let token = '';
let ids = 0;
// Каждый ответ API в тесте — текстом; ключи отправителей, которые API выдало, — чтобы найти их в ответах.
let seen: string[] = [];
let issued: string[] = [];

type Who = { readonly cookie?: string; readonly token?: string };

type Answer = { readonly status: number; readonly body: any };

const call = async (
  method: string,
  path: string,
  who: Who = {},
  body?: unknown,
  raw?: string | Uint8Array
): Promise<Answer> => {
  const response = await app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(body === undefined && raw === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...(who.cookie ? { cookie: who.cookie } : {}),
        ...(who.token ? { authorization: `Bearer ${who.token}` } : {}),
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
  );
  const text = await response.text();
  seen.push(text);
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

// Ключ, который выдало API: его подстроки не должно быть ни в одном другом ответе.
const keyOf = (key: string | undefined): string => (
  expect(key).toStartWith('evk_'), issued.push(key!), key!
);

const send = (body: unknown, key: string) =>
  app
    .fetch(
      new Request('http://localhost/_cms/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      }),
      { requestIP: () => ({ address: '192.0.2.10' }) }
    )
    .then(async (response) => ({
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    }));

const event = (
  type: string,
  at: string,
  data: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
) => ({ id: `evt_${++ids}`, type, at, subject: SUBJECT, data, ...extra });

// Приём включён человеком в менеджере, ключ бота выдан там же.
const intakeOn = async (): Promise<string> => {
  expect(
    (await asAdmin('PUT', '/analytics/settings', { enabled: true })).status
  ).toBe(200);
  const answer = await asAdmin('POST', '/analytics/senders/bot/keys', {
    label: 'Бот',
  });
  expect(answer.status).toBe(201);
  return keyOf(answer.body.key);
};

// Человек от первого касания до оплаты — так его шлёт бот.
const customer = async (key: string) => {
  const one = (type: string, at: string, data = {}, extra = {}) =>
    send(event(type, at, data, extra), key).then((_) =>
      expect(_.status).toBe(200)
    );
  await one(
    'bot_start',
    '2027-11-01T09:00:00Z',
    { label: 'post__blog\u0007__organic' },
    { traits: { lang: 'ru' } }
  );
  await one('source_survey', '2027-11-01T09:05:00Z', {
    question: 'heard_from',
    answer: 'friend',
    text: 'подруга\n\nпосоветовала',
  });
  await one('trial_started', '2027-11-02T10:00:00Z', {
    ends_at: '2027-11-05T10:00:00Z',
  });
  await one('purchase', '2027-11-05T10:00:00Z', {
    amount: '109.00',
    currency: 'EUR',
    plan: '3m',
    format: 'self',
    payment_id: 'pi_1',
    paid_until: '2028-02-05T10:00:00Z',
  });
  await one('task_done', '2027-11-07T10:00:00Z', { items_n: 5 });
};

const jsonl = (count: number, from = 0): string =>
  Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      id: `imp_${from + index}`,
      type: 'bot_start',
      at: '2027-11-10T10:00:00Z',
      subject: `u_imp_${String(from + index).padStart(6, '0')}`,
      data: { label: 'site__search' },
    })
  ).join('\n');

const upload = (
  query: string,
  file: string | Uint8Array,
  who: Who = { cookie: admin }
) => call('POST', `/analytics/events/import${query}`, who, undefined, file);

beforeEach(async () => {
  now = new Date(START);
  ids = 0;
  seen = [];
  issued = [];
  dir = mkdtempSync(join(tmpdir(), 'cms-analytics-api-'));
  const path = join(dir, 'site.db');
  app = createApp({
    databasePath: path,
    mediaCache: `${path}.cache`,
    clock: () => now,
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
  app.analytics.setup.apply(SUBSCRIPTION);
});

afterEach(() => {
  // Ключ отправителя — ровно в одном ответе: в том, что его выдал.
  for (const key of issued) {
    expect(seen.filter((_) => _.includes(key.slice(4))).length).toBe(1);
  }
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

const ROUTES: readonly (readonly [string, string])[] = [
  ['GET', '/analytics/settings'],
  ['PUT', '/analytics/settings'],
  ['GET', '/analytics/setup'],
  ['PUT', '/analytics/setup/property'],
  ['POST', '/analytics/setup/property/archive'],
  ['POST', '/analytics/setup/property/remove'],
  ['PUT', '/analytics/setup/milestone'],
  ['POST', '/analytics/setup/link/archive'],
  ['POST', '/analytics/setup/funnel/remove'],
  ['PUT', '/analytics/setup/schema'],
  ['PUT', '/analytics/senders/shop'],
  ['POST', '/analytics/senders/bot/archive'],
  ['POST', '/analytics/senders/bot/remove'],
  ['POST', '/analytics/senders/bot/keys'],
  ['DELETE', '/analytics/senders/bot/keys/1'],
  ['GET', '/analytics/unknown'],
  ['GET', '/analytics/intake'],
  ['GET', '/analytics/intake/daily'],
  ['GET', '/analytics/summaries'],
  ['GET', '/analytics/quality'],
  ['GET', '/analytics/quality/status'],
  ['GET', '/analytics/quality/summary_arrived/2027-11-13?scope=bot'],
  ['POST', '/analytics/quality/summary_arrived/2027-11-13/resolve'],
  ['DELETE', '/analytics/quality/summary_arrived/2027-11-13/resolve?scope=bot'],
  ['POST', '/analytics/quality/run'],
  ['PUT', '/analytics/setup/check'],
  ['POST', '/analytics/setup/check/remove'],
  ['GET', '/analytics/log'],
  ['GET', '/analytics/people'],
  ['GET', `/analytics/people/${SUBJECT}`],
  ['DELETE', `/analytics/people/${SUBJECT}`],
  ['GET', '/analytics/events'],
  ['GET', '/analytics/events/1'],
  ['POST', '/analytics/events/import'],
  ['GET', '/analytics/sources'],
  ['GET', '/analytics/funnel'],
  ['GET', '/analytics/answers'],
  ['GET', '/analytics/overview'],
  ['GET', '/analytics/cohorts'],
  ['GET', '/analytics/milestones'],
  ['GET', '/analytics/labels'],
  ['GET', '/analytics/labels/check?text=post'],
  ['POST', '/analytics/labels'],
  ['PUT', '/analytics/labels/bot/post__ig'],
  ['DELETE', '/analytics/labels/bot/post__ig'],
  ['GET', '/analytics/rates'],
  ['PUT', '/analytics/rates'],
  ['DELETE', '/analytics/rates/PLN/2026-06-01'],
  ['GET', '/analytics/spend'],
  ['PUT', '/analytics/spend'],
  ['DELETE', '/analytics/spend/1'],
  ['GET', '/analytics/statements'],
  ['PUT', '/analytics/statements'],
  ['DELETE', '/analytics/statements/2027-10/EUR'],
  ['GET', '/analytics/set'],
  ['GET', '/analytics/set/samples'],
  ['POST', '/analytics/set/plan'],
  ['POST', '/analytics/set'],
];

// Маршруты этапа 2 для чтения: отчёты, реестр и проверка метки; этапа 3 — курсы, расходы и отчёты с деньгами.
const STAGE2_READS = [
  '/analytics/sources',
  '/analytics/funnel',
  '/analytics/answers',
  '/analytics/overview',
  '/analytics/cohorts',
  '/analytics/milestones',
  '/analytics/labels',
  '/analytics/labels/check?text=post__ig__organic',
  '/analytics/rates',
  '/analytics/spend',
  '/analytics/intake/daily',
  '/analytics/summaries',
  '/analytics/quality',
  '/analytics/quality/status',
  '/analytics/statements',
  '/analytics/set',
  '/analytics/set/samples',
];

describe('права', () => {
  it('редактору — 403 на каждом маршруте аналитики, без входа — 401', async () => {
    for (const [method, path] of ROUTES) {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {};
      const denied = await call(method, path, { cookie: editor }, body);
      expect([path, denied.status, codeOf(denied)]).toEqual([
        path,
        403,
        'identity.forbidden',
      ]);
      expect((await call(method, path, {}, body)).status).toBe(401);
    }
  });

  it('ключом API администратора читать можно; отправителя, ключ, выключатель и базовую валюту — только войдя', async () => {
    for (const path of [
      '/analytics/settings',
      '/analytics/setup',
      '/analytics/people',
      '/analytics/events',
      '/analytics/unknown',
      '/analytics/intake',
      '/analytics/log',
      ...STAGE2_READS,
    ]) {
      expect([path, (await asKey('GET', path)).status]).toEqual([path, 200]);
    }
    for (const [method, path] of [
      ['PUT', '/analytics/settings'],
      ['PUT', '/analytics/senders/shop'],
      ['POST', '/analytics/senders/bot/archive'],
      ['POST', '/analytics/senders/bot/remove'],
      ['POST', '/analytics/senders/bot/keys'],
      ['DELETE', '/analytics/senders/bot/keys/1'],
      ['POST', '/analytics/set'],
    ] as const) {
      const refused = await asKey(method, path, {
        enabled: true,
        baseCurrency: 'EUR',
        name: 'Магазин',
        archived: true,
      });
      expect([path, refused.status, codeOf(refused)]).toEqual([
        path,
        403,
        'identity.session_required',
      ]);
    }
    expect(app.analytics.settings.get()).toMatchObject({
      enabled: false,
      baseCurrency: null,
    });
    // Курсы и расходы ключ API вносит: их берёт у банка или кабинета скрипт владельца.
    await asAdmin('PUT', '/analytics/settings', { baseCurrency: 'EUR' });
    expect(
      (
        await asKey('PUT', '/analytics/rates', {
          rates: [{ currency: 'PLN', day: '2027-11-01', rate: '0.2300' }],
        })
      ).status
    ).toBe(200);
    expect(
      (
        await asKey('PUT', '/analytics/spend', {
          rows: [
            { month: '2027-11', parts: {}, currency: 'EUR', amount: '10' },
          ],
        })
      ).status
    ).toBe(200);
    expect(app.analytics.senders.list()).toMatchObject([
      { code: 'bot', archivedAt: null, keys: [] },
    ]);
  });
});

describe('отчёты и реестр меток', () => {
  it('ключ API редактора без analytics.read — 403 на каждом маршруте отчётов, меток, курсов, расходов и проверок', async () => {
    const issued = await call(
      'POST',
      '/tokens',
      { cookie: editor },
      {
        name: 'Редактор',
      }
    );
    expect(issued.status).toBe(201);
    for (const [method, path] of ROUTES.filter(
      ({ 1: path }) =>
        path.startsWith('/analytics/sources') ||
        path.startsWith('/analytics/funnel') ||
        path.startsWith('/analytics/answers') ||
        path.startsWith('/analytics/overview') ||
        path.startsWith('/analytics/cohorts') ||
        path.startsWith('/analytics/milestones') ||
        path.startsWith('/analytics/labels') ||
        path.startsWith('/analytics/rates') ||
        path.startsWith('/analytics/spend') ||
        path.startsWith('/analytics/quality') ||
        path.startsWith('/analytics/statements') ||
        path.startsWith('/analytics/setup/check')
    )) {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {};
      const denied = await call(
        method,
        path,
        { token: issued.body.token },
        body
      );
      expect([path, denied.status, codeOf(denied)]).toEqual([
        path,
        403,
        'identity.forbidden',
      ]);
    }
  });

  it('отчёты: параметры из адреса, фильтры ключами; негодный параметр — 422, а не 500; нет воронки — 404', async () => {
    const key = await intakeOn();
    await customer(key);
    const report = await asAdmin(
      'GET',
      '/analytics/sources?from=2027-11-01&to=2027-11-14&group=part:channel&part.entry=post&window=7'
    );
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({
      from: '2027-11-01',
      to: '2027-11-14',
      timeZone: '',
      stale: 0,
      attribution: 'first',
      group: 'part:channel',
      window: 7,
      filters: { 'part.entry': 'post' },
    });
    expect(
      report.body.rows.map((_: { value: string; people: number }) => [
        _.value,
        _.people,
      ])
    ).toEqual([['organic', 1]]);
    expect(report.body.total).toMatchObject({
      people: 1,
      trial: { count: 1, base: 1, open: 0 },
      payment: { count: 1, base: 1, open: 0 },
      customers: 1,
      revenue: { EUR: 10_900 },
    });
    expect(report.body.daily).toHaveLength(14);
    const funnel = await asKey('GET', '/analytics/funnel?days=30');
    expect(funnel.status).toBe(200);
    expect(funnel.body.funnel).toMatchObject({ code: 'journey', main: true });
    expect(funnel.body.steps).toHaveLength(7);
    const answers = await asKey('GET', '/analytics/answers?days=30');
    expect(answers.body).toMatchObject({
      question: 'heard_from',
      total: { people: 1, cells: { friend: 1 } },
    });
    for (const query of [
      'group=part:nope',
      "group=part:source'--",
      'part.nope=ig',
      'prop.items_n=2',
      'part.source=ig&part.source=fb',
      'days=0',
      'days=3661',
      'to=2027-11-15',
      'from=2027-13-01',
      'window=14',
      'attribution=last',
      Array.from({ length: 11 }, (_, n) => `part.source${n}=ig`).join('&'),
    ]) {
      const refused = await asKey('GET', `/analytics/sources?${query}`);
      expect([query, refused.status, codeOf(refused)]).toEqual([
        query,
        422,
        'analytics.invalid_query',
      ]);
    }
    const missing = await asKey('GET', '/analytics/funnel?funnel=nope');
    expect([missing.status, codeOf(missing)]).toEqual([
      404,
      'analytics.funnel_not_found',
    ]);
    // Люди строки отчёта: те же параметры в адресе списка.
    const people = await asKey(
      'GET',
      '/analytics/people?days=30&part.entry=post&milestone=activation'
    );
    expect(people.body).toMatchObject({ total: 0, people: [] });
    const all = await asKey('GET', '/analytics/people?days=30&part.entry=post');
    expect(all.body.total).toBe(1);
    expect(
      codeOf(
        await asKey('GET', '/analytics/people?days=30&funnel=journey&step=0')
      )
    ).toBe('analytics.invalid_query');
  });

  it('реестр: выдать, снова — прежняя запись; переименовать, удалить; журнал — строкой label', async () => {
    app.site.settings.update({ siteUrl: 'https://site.test' });
    const body = {
      parts: { source: 'ig', channel: 'paid', campaign: 'autumn' },
      link: 'trial',
      name: 'Осень в Instagram',
      page: '/trial',
    };
    const issued = await asKey('POST', '/analytics/labels', body);
    expect(issued.status).toBe(201);
    expect(issued.body).toEqual({
      sender: 'bot',
      label: 'w-trial__ig__paid__autumn',
      name: 'Осень в Instagram',
      parts: {
        entry: 'w-trial',
        source: 'ig',
        channel: 'paid',
        campaign: 'autumn',
      },
      link: 'trial',
      author: { name: 'Анна', agent: true },
      createdAt: START,
      existing: false,
      links: {
        direct:
          'https://t.me/sample_subscription_bot?start=w-trial__ig__paid__autumn',
        site: 'https://site.test/trial?utm_source=ig&utm_medium=paid&utm_campaign=autumn',
      },
    });
    const again = await asAdmin('POST', '/analytics/labels', {
      ...body,
      name: 'Другое название',
    });
    expect([again.status, again.body.existing, again.body.name]).toEqual([
      200,
      true,
      'Осень в Instagram',
    ]);
    expect(
      (
        await asAdmin('POST', '/analytics/labels', {
          parts: { source: 'fb' },
          name: 'Facebook',
        })
      ).body
    ).toMatchObject({
      label: '__fb',
      links: {
        direct: 'https://t.me/sample_subscription_bot?start=__fb',
        site: 'https://site.test/?utm_source=fb',
      },
    });
    const list = await asKey('GET', '/analytics/labels?q=осень');
    expect(list.body).toMatchObject({
      total: 1,
      labels: [{ label: 'w-trial__ig__paid__autumn' }],
    });
    expect(
      (await asKey('GET', '/analytics/labels?q=w-trial__ig')).body.total
    ).toBe(1);
    expect((await asKey('GET', '/analytics/labels')).body.total).toBe(2);
    const renamed = await asAdmin(
      'PUT',
      '/analytics/labels/bot/w-trial__ig__paid__autumn',
      { name: 'Осень, платная' }
    );
    expect(renamed.body).toMatchObject({ name: 'Осень, платная' });
    expect(
      (await asAdmin('DELETE', '/analytics/labels/bot/__fb')).body
    ).toEqual({});
    for (const [method, path] of [
      ['DELETE', '/analytics/labels/bot/__fb'],
      ['PUT', '/analytics/labels/bot/nope'],
      ['PUT', '/analytics/labels/BOT!/x'],
    ] as const) {
      const missing = await asAdmin(method, path, { name: 'Х' });
      expect([path, missing.status, codeOf(missing)]).toEqual([
        path,
        404,
        'analytics.label_not_found',
      ]);
    }
    expect(
      app.analytics.log
        .setup({ limit: 4 })
        .map((_) => [_.item, _.key, _.action, _.author?.agent])
    ).toEqual([
      ['label', 'bot/__fb', 'removed', false],
      ['label', 'bot/w-trial__ig__paid__autumn', 'changed', false],
      ['label', 'bot/__fb', 'created', false],
      ['label', 'bot/w-trial__ig__paid__autumn', 'created', true],
    ]);
    // Реестр — не настройка: ревизия прежняя, люди не пересчитываются.
    expect(app.analytics.setup.get().revision).toBe(1);
  });

  it('выдача: значения из справочников и не в архиве, переход того же отправителя без расхождений', async () => {
    app.analytics.setup.archive(
      'value',
      { dictionary: 'source', code: 'tg' },
      true
    );
    for (const body of [
      { parts: { source: 'xx' }, name: 'Незнакомое' },
      { parts: { source: 'tg' }, name: 'В архиве' },
      { parts: { nope: 'ig' }, name: 'Не часть схемы' },
      { parts: {}, name: 'Пусто' },
      { parts: { entry: 'post' }, link: 'trial', name: 'Расхождение' },
      { parts: { source: 'ig' }, link: 'nope', name: 'Нет перехода' },
      { parts: { source: 'ig' }, name: '' },
      { parts: { source: 'ig' }, name: 'x'.repeat(101) },
      { parts: { source: 'ig' }, name: 'Страница', page: 'https://evil.test/' },
      { sender: 'shop', parts: { source: 'ig' }, name: 'Нет отправителя' },
    ]) {
      const refused = await asAdmin('POST', '/analytics/labels', body);
      expect([body.name, refused.status, codeOf(refused)]).toEqual([
        body.name,
        422,
        'analytics.invalid_label',
      ]);
    }
    const listed = await asAdmin('POST', '/analytics/labels', {
      parts: { source: 'xx', channel: 'yy' },
      name: 'Две ошибки',
    });
    expect(listed.body.error.message).toContain('source');
    expect(listed.body.error.message).toContain('channel');
    expect((await asAdmin('GET', '/analytics/labels')).body.total).toBe(0);
  });

  it('проверка: адрес с UTM, адрес перехода, адрес назначения, метка; части с состоянием и запись реестра', async () => {
    await asAdmin('POST', '/analytics/labels', {
      parts: { source: 'ig', channel: 'organic' },
      link: 'trial',
      name: 'Органика',
    });
    const check = (text: string) =>
      asKey(
        'GET',
        `/analytics/labels/check?text=${encodeURIComponent(text)}`
      ).then((_) => (expect(_.status).toBe(200), _.body));
    expect(
      await check('https://site.test/?utm_source=Instagram&utm_medium=paid')
    ).toMatchObject({
      from: 'utm',
      sender: 'bot',
      label: '__instagram__paid',
      parts: [
        { part: 'entry', value: null, state: 'empty' },
        { part: 'source', value: 'instagram', state: 'unknown' },
        { part: 'channel', value: 'paid', state: 'known' },
        { part: 'campaign', value: null, state: 'empty' },
        { part: 'creative', value: null, state: 'empty' },
      ],
      registered: null,
    });
    expect(
      await check(
        'https://site.test/_cms/go/trial?utm_source=ig&utm_medium=organic'
      )
    ).toMatchObject({
      from: 'utm',
      link: 'trial',
      label: 'w-trial__ig__organic',
      registered: { name: 'Органика' },
    });
    expect(await check('https://site.test/_cms/go/trial')).toMatchObject({
      from: 'go',
      link: 'trial',
      label: 'w-trial',
    });
    expect(
      await check(
        'https://t.me/sample_subscription_bot?start=W-Trial__IG__organic'
      )
    ).toMatchObject({
      from: 'link',
      label: 'w-trial__ig__organic',
      registered: { name: 'Органика' },
    });
    expect(
      await check('w-trial__ig.com__paid__autumn__ad-1__extra')
    ).toMatchObject({
      from: 'label',
      notes: ['invalid', 'extra'],
      parts: [
        { part: 'entry', value: 'w-trial', state: 'known' },
        { part: 'source', value: null, state: 'empty' },
        { part: 'channel', value: 'paid', state: 'known' },
        { part: 'campaign', value: 'autumn', state: 'known' },
        { part: 'creative', value: 'ad-1', state: 'known' },
      ],
    });
    const long = await asKey(
      'GET',
      `/analytics/labels/check?text=${'a'.repeat(2001)}`
    );
    expect([long.status, codeOf(long)]).toEqual([
      422,
      'analytics.invalid_query',
    ]);
  });

  it('«незнакомые» метки: первые касания не из реестра; выданная уходит из списка', async () => {
    const key = await intakeOn();
    await send(
      event('bot_start', '2027-11-10T09:00:00Z', {
        label: 'W-Trial__IG__organic',
      }),
      key
    );
    await send(
      event(
        'bot_start',
        '2027-11-10T09:00:00Z',
        { label: 'promo\u0007 code' },
        { subject: 'u_other_person' }
      ),
      key
    );
    expect((await asKey('GET', '/analytics/unknown')).body.labels).toEqual([
      { sender: 'bot', label: 'W-Trial__IG__organic', count: 1 },
      { sender: 'bot', label: 'promo code', count: 1 },
    ]);
    await asAdmin('POST', '/analytics/labels', {
      parts: { source: 'ig', channel: 'organic' },
      link: 'trial',
      name: 'Органика',
    });
    expect((await asKey('GET', '/analytics/unknown')).body.labels).toEqual([
      { sender: 'bot', label: 'promo code', count: 1 },
    ]);
  });
});

describe('настройка', () => {
  it('GET /analytics/setup: отправители с hasKey без самих ключей, справочники со значениями, роли, ревизия', async () => {
    const before = (await asKey('GET', '/analytics/setup')).body;
    expect(before.revision).toBe(1);
    expect(before.senders).toEqual([
      expect.objectContaining({ code: 'bot', hasKey: false, keys: [] }),
    ]);
    expect(before.roles).toHaveLength(10);
    expect(before.roles[0]).toMatchObject({
      role: 'touch',
      subject: 'required',
    });
    expect(before.types.map((_: { code: string }) => _.code)).toContain(
      'purchase'
    );
    const plan = before.dictionaries.find(
      (_: { code: string }) => _.code === 'plan'
    );
    expect(plan.values.map((_: { code: string }) => _.code)).toEqual([
      '1m',
      '3m',
    ]);
    const issuedKey = await asAdmin('POST', '/analytics/senders/bot/keys', {});
    const key = keyOf(issuedKey.body.key);
    const after = (await asKey('GET', '/analytics/setup')).body;
    expect(after.senders[0]).toMatchObject({
      code: 'bot',
      hasKey: true,
      keys: [{ hint: key.slice(-4), label: 'Бот подписки', usedAt: null }],
    });
    expect(after.senders[0].keys[0]).not.toHaveProperty('key');
    expect(after.senders[0].keys[0]).not.toHaveProperty('hash');
  });

  it('PUT /analytics/setup/:group создаёт и меняет элемент; журнал называет пользователя, у ключа API — отметка агента', async () => {
    const created = await asAdmin('PUT', '/analytics/setup/property', {
      scope: 'event',
      code: 'size',
      name: 'Размер',
      kind: 'string',
    });
    expect(created).toMatchObject({
      status: 200,
      body: { scope: 'event', code: 'size', kind: 'string', archivedAt: null },
    });
    const changed = await asKey('PUT', '/analytics/setup/property', {
      scope: 'event',
      code: 'size',
      name: 'Размер вещи',
    });
    expect(changed.body).toMatchObject({ name: 'Размер вещи', kind: 'string' });
    const log = (await asAdmin('GET', '/analytics/log')).body;
    expect(log.kind).toBe('setup');
    const anna = app.identity.users.list()[0]!;
    expect(
      log.entries
        .slice(0, 2)
        .map((_: any) => [_.item, _.key, _.action, _.author])
    ).toEqual([
      [
        'property',
        'event/size',
        'changed',
        { id: anna.id, name: 'Анна', agent: true },
      ],
      [
        'property',
        'event/size',
        'created',
        { id: anna.id, name: 'Анна', agent: false },
      ],
    ]);
    expect(log.entries[0].before).toMatchObject({ name: 'Размер' });
    expect(log.entries[0].after).toMatchObject({ name: 'Размер вещи' });
    // Набор применил не пользователь: у строки набора автора нет.
    expect(log.entries.at(-1)).toMatchObject({ item: 'set', author: null });
  });

  it('неверный элемент — 422 с кодом аналитики, ничего не сохранено', async () => {
    const refusals = await Promise.all(
      [
        [
          'property',
          { scope: 'event', code: 'Bad Code', name: 'x', kind: 'string' },
        ],
        [
          'property',
          {
            scope: 'event',
            code: 'size',
            name: 'x',
            kind: 'string',
            color: 'red',
          },
        ],
        [
          'type',
          { sender: 'nobody', code: 'order', name: 'Заказ', role: 'payment' },
        ],
        ['widget', { code: 'x' }],
      ].map(({ 0: group, 1: item }) =>
        asAdmin('PUT', `/analytics/setup/${group}`, item)
      )
    );
    expect(refusals.map((_) => [_.status, codeOf(_)])).toEqual([
      [422, 'analytics.invalid_code'],
      [422, 'analytics.invalid_item'],
      [422, 'analytics.invalid_reference'],
      [422, 'analytics.invalid_group'],
    ]);
    expect(app.analytics.setup.get().revision).toBe(1);
  });

  it('группа sender в общей настройке запрещена: отправители — только своими маршрутами', async () => {
    for (const [method, path] of [
      ['PUT', '/analytics/setup/sender'],
      ['POST', '/analytics/setup/sender/archive'],
      ['POST', '/analytics/setup/sender/remove'],
    ] as const) {
      for (const who of [{ cookie: admin }, { token }]) {
        const refused = await call(method, path, who, {
          code: 'bot',
          name: 'Подмена',
          archived: true,
        });
        expect([path, refused.status, codeOf(refused)]).toEqual([
          path,
          403,
          'analytics.sender_route',
        ]);
      }
    }
    expect(app.analytics.setup.get().senders).toMatchObject([
      { code: 'bot', name: 'Бот подписки', archivedAt: null },
    ]);
  });

  it('архив и возврат; archived — только да или нет; нет элемента — 404', async () => {
    const key = { scope: 'event', code: 'items_n' };
    const archived = await asAdmin(
      'POST',
      '/analytics/setup/property/archive',
      {
        ...key,
        archived: true,
      }
    );
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).toBe(START);
    const back = await asKey('POST', '/analytics/setup/property/archive', {
      ...key,
      archived: false,
    });
    expect(back.body.archivedAt).toBeNull();
    const vague = await asAdmin('POST', '/analytics/setup/property/archive', {
      ...key,
      archived: 'yes',
    });
    expect([vague.status, codeOf(vague)]).toEqual([
      422,
      'analytics.invalid_item',
    ]);
    const missing = await asAdmin('POST', '/analytics/setup/property/archive', {
      scope: 'event',
      code: 'nothing',
      archived: true,
    });
    expect([missing.status, codeOf(missing)]).toEqual([
      404,
      'analytics.item_not_found',
    ]);
    const log = (await asAdmin('GET', '/analytics/log?limit=2')).body;
    expect(log.entries.map((_: any) => _.action)).toEqual([
      'restored',
      'archived',
    ]);
    expect(log.next).toBe(log.entries[1].id);
    const rest = (await asAdmin('GET', `/analytics/log?before=${log.next}`))
      .body;
    expect(rest.entries.map((_: any) => _.item)).toEqual(['set']);
    expect(rest.next).toBeNull();
  });

  it('удаление: на элемент ссылаются — 409 analytics.in_use; без ссылок — удалён, второй раз — 404', async () => {
    const used = await asAdmin('POST', '/analytics/setup/dictionary/remove', {
      code: 'plan',
    });
    expect([used.status, codeOf(used)]).toEqual([409, 'analytics.in_use']);
    await asAdmin('PUT', '/analytics/setup/property', {
      scope: 'event',
      code: 'size',
      name: 'Размер',
      kind: 'string',
    });
    const removed = await asKey('POST', '/analytics/setup/property/remove', {
      scope: 'event',
      code: 'size',
    });
    expect(removed).toEqual({ status: 200, body: {} });
    const again = await asAdmin('POST', '/analytics/setup/property/remove', {
      scope: 'event',
      code: 'size',
    });
    expect([again.status, codeOf(again)]).toEqual([
      404,
      'analytics.item_not_found',
    ]);
    expect(app.analytics.log.setup()[0]).toMatchObject({
      action: 'removed',
      author: { name: 'Анна', agent: true },
    });
  });

  it('выключатель и срок хранения: только войдя; смену пишет журнал; негодный срок — 422', async () => {
    expect((await asKey('GET', '/analytics/settings')).body).toEqual({
      enabled: false,
      retentionMonths: 0,
      baseCurrency: null,
    });
    const saved = await asAdmin('PUT', '/analytics/settings', {
      enabled: true,
      retentionMonths: 12,
    });
    expect(saved).toEqual({
      status: 200,
      body: { enabled: true, retentionMonths: 12, baseCurrency: null },
    });
    const wrong = await asAdmin('PUT', '/analytics/settings', {
      retentionMonths: 500,
    });
    expect([wrong.status, codeOf(wrong)]).toEqual([
      422,
      'analytics.invalid_retention',
    ]);
    expect(app.analytics.log.setup()[0]).toMatchObject({
      item: 'settings',
      action: 'changed',
      author: { name: 'Анна', agent: false },
      before: { enabled: false },
      after: { enabled: true, retentionMonths: 12 },
    });
  });
});

describe('настройка этапа 2', () => {
  const MILESTONE = {
    code: 'two-tasks',
    name: 'Два задания',
    sender: 'bot',
    type: 'task_done',
    count: 2,
  };

  it('GET /analytics/setup: части с utm и length, схемы, соответствия, переходы, вехи и воронки по порядку', async () => {
    const setup = (await asKey('GET', '/analytics/setup')).body;
    expect(
      setup.dictionaries.find((_: { code: string }) => _.code === 'source')
    ).toMatchObject({ purpose: 'parts', utm: 'utm_source', length: 10 });
    expect(
      setup.dictionaries.find((_: { code: string }) => _.code === 'plan')
    ).toMatchObject({ purpose: 'values', utm: null, length: null });
    expect(setup.schemas).toEqual([
      expect.objectContaining({ sender: 'bot', separator: '__', length: 64 }),
    ]);
    expect(setup.referrers.map((_: { code: string }) => _.code)).toEqual([
      'google',
      'instagram',
      'no-referrer',
      'other-sites',
    ]);
    expect(setup.links[0]).toMatchObject({
      code: 'trial',
      parts: { entry: 'w-trial' },
    });
    await asAdmin('PUT', '/analytics/setup/milestone', {
      ...MILESTONE,
      position: 0,
    });
    await asAdmin('PUT', '/analytics/setup/milestone', {
      code: 'activation',
      position: 5,
    });
    expect(
      (await asKey('GET', '/analytics/setup')).body.milestones.map(
        (_: { code: string }) => _.code
      )
    ).toEqual(['two-tasks', 'activation']);
    expect(setup.funnels[0]).toMatchObject({ code: 'journey', main: true });
  });

  it('PUT /analytics/setup/:group — новые группы; журнал называет пользователя, у ключа API — агента', async () => {
    const created = await asKey('PUT', '/analytics/setup/milestone', MILESTONE);
    expect(created).toMatchObject({
      status: 200,
      body: {
        code: 'two-tasks',
        count: 2,
        condition: null,
        days: null,
        column: true,
        position: 1,
        archivedAt: null,
      },
    });
    const schema = await asAdmin('PUT', '/analytics/setup/schema', {
      sender: 'bot',
      separator: '--',
    });
    expect(schema.body).toMatchObject({ sender: 'bot', separator: '--' });
    const referrer = await asKey('PUT', '/analytics/setup/referrer', {
      code: 'facebook',
      name: 'Facebook',
      kind: 'host',
      host: 'www.facebook.com',
      parts: { source: 'fb', channel: 'organic' },
    });
    expect(referrer.body).toMatchObject({ host: 'facebook.com' });
    const link = await asKey('PUT', '/analytics/setup/link', {
      code: 'post-button',
      name: 'Кнопка в посте',
      sender: 'bot',
      target: 'https://t.me/sample_subscription_bot?start={label}',
      parts: { entry: 'post' },
    });
    expect(link.status).toBe(200);
    const funnel = await asAdmin('PUT', '/analytics/setup/funnel', {
      code: 'short',
      name: 'Короткая',
      main: true,
      steps: [
        { kind: 'goal', goal: 'go:post-button' },
        { kind: 'arrival' },
        { kind: 'milestone', milestone: 'two-tasks' },
      ],
    });
    expect(funnel.body).toMatchObject({ code: 'short', main: true });
    const anna = app.identity.users.list()[0]!;
    const log = (await asAdmin('GET', '/analytics/log?limit=6')).body.entries;
    expect(
      log.map((_: any) => [_.item, _.key, _.action, _.author.agent])
    ).toEqual([
      ['funnel', 'short', 'created', false],
      ['funnel', 'journey', 'changed', false],
      ['link', 'post-button', 'created', true],
      ['referrer', 'facebook', 'created', true],
      ['schema', 'bot', 'changed', false],
      ['milestone', 'two-tasks', 'created', true],
    ]);
    // Основная воронка одна: прежняя потеряла отметку той же правкой.
    expect(log[1].before).toMatchObject({ main: true });
    expect(log[1].after).toMatchObject({ main: false });
    expect(log[5].author).toEqual({ id: anna.id, name: 'Анна', agent: true });
    expect(app.analytics.setup.get().revision).toBe(6);
  });

  it('неверные ссылки и поля — 422 с кодом аналитики, ничего не сохранено', async () => {
    const refusals = await Promise.all(
      [
        [
          'link',
          {
            code: 'shop-link',
            name: 'Магазин',
            sender: 'bot',
            target: 'http://shop.example.com/?ref={label}',
          },
        ],
        [
          'link',
          {
            code: 'shop-link',
            name: 'Магазин',
            sender: 'bot',
            target: 'https://t.me/sample_subscription_bot?start={label}',
            parts: { entry: 'nowhere' },
          },
        ],
        ['milestone', { ...MILESTONE, type: 'gift_sent' }],
        [
          'milestone',
          { ...MILESTONE, condition: { property: 'own_material', gte: 1 } },
        ],
        [
          'funnel',
          {
            code: 'wrong',
            name: 'Неверная',
            steps: [{ kind: 'arrival' }, { kind: 'visits' }],
          },
        ],
        [
          'referrer',
          { code: 'any-other', name: 'Ещё одна', kind: 'any', parts: {} },
        ],
        [
          'dictionary',
          {
            code: 'medium2',
            name: 'Ещё тип',
            purpose: 'parts',
            utm: 'utm_medium',
          },
        ],
        ['schema', { sender: 'bot', length: 40 }],
        ['value', { dictionary: 'source', code: 'i_-g', name: 'Плохое' }],
      ].map(({ 0: group, 1: item }) =>
        asAdmin('PUT', `/analytics/setup/${group}`, item)
      )
    );
    expect(refusals.map((_) => [_.status, codeOf(_)])).toEqual([
      [422, 'analytics.invalid_item'],
      [422, 'analytics.invalid_reference'],
      [422, 'analytics.invalid_reference'],
      [422, 'analytics.invalid_reference'],
      [422, 'analytics.invalid_item'],
      [422, 'analytics.invalid_item'],
      [422, 'analytics.invalid_item'],
      [422, 'analytics.invalid_item'],
      [422, 'analytics.invalid_code'],
    ]);
    expect(refusals[7]!.body.error.message).toContain(
      'up to 62 characters, the label up to 40'
    );
    expect(app.analytics.setup.get().revision).toBe(1);
  });

  it('архив и удаление: занятое — 409 analytics.in_use, свободное — удалено; ключ схемы — отправитель', async () => {
    for (const [group, key] of [
      ['schema', { sender: 'bot' }],
      ['milestone', { code: 'activation' }],
      ['dictionary', { code: 'entry' }],
      ['value', { dictionary: 'source', code: 'ig' }],
    ] as const) {
      const used = await asAdmin(
        'POST',
        `/analytics/setup/${group}/remove`,
        key
      );
      expect([group, used.status, codeOf(used)]).toEqual([
        group,
        409,
        'analytics.in_use',
      ]);
    }
    const archived = await asKey('POST', '/analytics/setup/schema/archive', {
      sender: 'bot',
      archived: true,
    });
    expect(archived.body).toMatchObject({ sender: 'bot', archivedAt: START });
    const removed = await asKey('POST', '/analytics/setup/funnel/remove', {
      code: 'journey',
    });
    expect(removed).toEqual({ status: 200, body: {} });
    const again = await asAdmin('POST', '/analytics/setup/funnel/remove', {
      code: 'journey',
    });
    expect([again.status, codeOf(again)]).toEqual([
      404,
      'analytics.item_not_found',
    ]);
    expect(
      (
        await asAdmin('POST', '/analytics/setup/milestone/remove', {
          code: 'activation',
        })
      ).status
    ).toBe(200);
    expect(
      app.analytics.log.setup({ limit: 3 }).map((_) => [_.item, _.action])
    ).toEqual([
      ['milestone', 'removed'],
      ['funnel', 'removed'],
      ['schema', 'archived'],
    ]);
  });
});

describe('отправители и ключи', () => {
  it('новый отправитель — 201 и ключ один раз; правка — 200 без ключа; ключ подписывает события', async () => {
    const created = await asAdmin('PUT', '/analytics/senders/shop', {
      name: 'Магазин',
    });
    expect(created.status).toBe(201);
    expect(created.body.sender).toMatchObject({
      code: 'shop',
      name: 'Магазин',
      enabled: true,
    });
    expect(created.body.key).toMatchObject({
      sender: 'shop',
      label: 'Магазин',
    });
    const key = keyOf(created.body.key.key);
    const renamed = await asAdmin('PUT', '/analytics/senders/shop', {
      name: 'Магазин на сайте',
    });
    expect(renamed).toMatchObject({
      status: 200,
      body: { sender: { name: 'Магазин на сайте' }, key: null },
    });
    await asAdmin('PUT', '/analytics/settings', { enabled: true });
    expect(
      await send(event('order_paid', '2027-11-10T10:00:00Z'), key)
    ).toEqual({ status: 200, body: { ok: true, warnings: ['unknown_type'] } });
    expect(app.analytics.log.setup()[1]).toMatchObject({
      item: 'sender',
      key: 'shop',
      author: { name: 'Анна', agent: false },
    });
  });

  it('ключи: до трёх, отзыв; отправитель в архиве ключа не получает; удалить можно только без ссылок', async () => {
    const keys: any[] = [];
    for (const label of ['Первый', 'Второй', 'Третий']) {
      const answer = await asAdmin('POST', '/analytics/senders/bot/keys', {
        label,
      });
      expect(answer.status).toBe(201);
      keyOf(answer.body.key);
      keys.push(answer.body);
    }
    const fourth = await asAdmin('POST', '/analytics/senders/bot/keys', {});
    expect([fourth.status, codeOf(fourth)]).toEqual([
      409,
      'analytics.too_many',
    ]);
    const revoked = await asAdmin(
      'DELETE',
      `/analytics/senders/bot/keys/${keys[0].id}`
    );
    expect(revoked).toEqual({ status: 200, body: {} });
    const twice = await asAdmin(
      'DELETE',
      `/analytics/senders/bot/keys/${keys[0].id}`
    );
    expect([twice.status, codeOf(twice)]).toEqual([
      404,
      'analytics.key_not_found',
    ]);
    const archived = await asAdmin('POST', '/analytics/senders/bot/archive', {
      archived: true,
    });
    expect(archived.body).toMatchObject({ code: 'bot', archivedAt: START });
    const refused = await asAdmin('POST', '/analytics/senders/bot/keys', {});
    expect([refused.status, codeOf(refused)]).toEqual([
      422,
      'analytics.invalid_reference',
    ]);
    await asAdmin('POST', '/analytics/senders/bot/archive', {
      archived: false,
    });
    const inUse = await asAdmin('POST', '/analytics/senders/bot/remove');
    expect([inUse.status, codeOf(inUse)]).toEqual([409, 'analytics.in_use']);
    const shop = await asAdmin('PUT', '/analytics/senders/shop', {
      name: 'Магазин',
    });
    keyOf(shop.body.key.key);
    expect(await asAdmin('POST', '/analytics/senders/shop/remove')).toEqual({
      status: 200,
      body: {},
    });
    expect(
      app.analytics.senders.list().map((_) => [_.code, _.keys.length])
    ).toEqual([['bot', 2]]);
    const nobody = await asAdmin('POST', '/analytics/senders/nobody/keys', {});
    expect([nobody.status, codeOf(nobody)]).toEqual([
      404,
      'analytics.item_not_found',
    ]);
  });

  it('выпуск и отзыв ключа — строки журнала настройки с автором, подписью и hint, без ключа и хэша', async () => {
    const shop = await asAdmin('PUT', '/analytics/senders/shop', {
      name: 'Магазин',
    });
    keyOf(shop.body.key.key);
    const spare = await asAdmin('POST', '/analytics/senders/shop/keys', {
      label: 'Запасной',
    });
    const key = keyOf(spare.body.key);
    expect(
      await asAdmin('DELETE', `/analytics/senders/shop/keys/${spare.body.id}`)
    ).toEqual({ status: 200, body: {} });
    const log = (await asAdmin('GET', '/analytics/log')).body;
    const anna = { name: 'Анна', agent: false };
    expect(
      log.entries.map((_: any) => [_.item, _.key, _.action, _.author?.name])
    ).toEqual([
      ['key', `shop/${spare.body.id}`, 'removed', 'Анна'],
      ['key', `shop/${spare.body.id}`, 'created', 'Анна'],
      ['key', `shop/${shop.body.key.id}`, 'created', 'Анна'],
      ['sender', 'shop', 'created', 'Анна'],
      ['set', 'Подписка (сайт-образец)', 'applied', undefined],
    ]);
    expect(log.entries[0]).toMatchObject({
      author: anna,
      before: {
        id: spare.body.id,
        sender: 'shop',
        label: 'Запасной',
        hint: key.slice(-4),
        createdAt: START,
        usedAt: null,
      },
      after: null,
    });
    expect(log.entries[2]).toMatchObject({
      before: null,
      after: { sender: 'shop', label: 'Магазин', hint: shop.body.key.hint },
    });
    // Ни ключа, ни хэша: в строке — только вид ключа.
    const stored = app.analytics.log
      .setup()
      .filter((_) => _.item === 'key')
      .flatMap((_) => [_.before, _.after])
      .filter((_) => _ !== null);
    expect(stored.map((_) => Object.keys(_ as object).toSorted())).toEqual(
      Array(3).fill(['createdAt', 'hint', 'id', 'label', 'sender', 'usedAt'])
    );
    expect(JSON.stringify(log)).not.toContain(key.slice(4));
    // Отзыв ключом API невозможен; несуществующий ключ строки не пишет.
    const missing = await asAdmin('DELETE', '/analytics/senders/shop/keys/999');
    expect(codeOf(missing)).toBe('analytics.key_not_found');
    expect(app.analytics.log.setup()).toHaveLength(5);
  });

  it('ключ есть только в ответе, который его выдал: ни чтение, ни журналы его не отдают', async () => {
    const key = await intakeOn();
    await customer(key);
    for (const path of [
      '/analytics/setup',
      '/analytics/settings',
      '/analytics/intake',
      '/analytics/log',
      '/analytics/log?kind=erasures',
      '/analytics/people',
      `/analytics/people/${SUBJECT}`,
      '/analytics/events',
      '/analytics/events/1',
      '/analytics/unknown',
    ]) {
      expect([path, (await asAdmin('GET', path)).status]).toEqual([path, 200]);
    }
    // Проверка — в afterEach: подстрока ключа встречается в одном ответе из всех.
    expect(seen.length).toBeGreaterThan(10);
  });
});

describe('люди и события', () => {
  it('список людей с фильтрами и карточка страницами; негодный фильтр — 422, нет человека — 404', async () => {
    await customer(await intakeOn());
    const page = (await asKey('GET', '/analytics/people')).body;
    expect(page).toMatchObject({ total: 1, stale: 0 });
    expect(page.people[0]).toMatchObject({
      subject: SUBJECT,
      state: 'customer',
      payments: 1,
      revenue: { EUR: 10_900 },
      lastTouch: { label: 'post__blog__organic' },
      answers: {
        heard_from: { answer: 'friend', text: 'подруга посоветовала' },
      },
    });
    for (const { 0: query, 1: total } of [
      ['?state=lapsed', 0],
      ['?state=customer', 1],
      ['?sender=bot', 1],
      ['?q=u_3b', 1],
      ['?q=zz', 0],
      ['?limit=1&offset=1', 1],
    ] as const) {
      expect([
        query,
        (await asAdmin('GET', `/analytics/people${query}`)).body.total,
      ]).toEqual([query, total]);
    }
    // Этап 2: приход, части касаний с отправителем, источник привлечения, вехи с состоянием, разрезы.
    expect(page.people[0]).toMatchObject({
      arrivedAt: '2027-11-01T09:00:00.000Z',
      firstTouch: { sender: 'bot' },
      firstParts: { entry: 'post', channel: 'organic' },
      acquisition: {
        kind: 'parts',
        parts: { entry: 'post', channel: 'organic' },
      },
      returns: [],
      milestones: {
        activation: {
          state: 'missed',
          reachedAt: null,
          from: '2027-11-01T09:00:00.000Z',
          until: '2027-11-04T09:00:00.000Z',
        },
      },
      dims: { plan: '3m', format: 'self' },
      firstTermEnd: '2028-02-05T10:00:00.000Z',
    });
    expect(page.people[0]).not.toHaveProperty('money');
    // Этап 3: комиссии по времени и отрезки доступа — вход отчётов, в списке их нет.
    expect(page.people[0]).not.toHaveProperty('feeMoney');
    expect(page.people[0]).not.toHaveProperty('access');
    const wrong = await asAdmin('GET', '/analytics/people?state=asleep');
    expect([wrong.status, codeOf(wrong)]).toEqual([
      422,
      'analytics.invalid_query',
    ]);

    const card = (await asKey('GET', `/analytics/people/${SUBJECT}?limit=2`))
      .body;
    expect(card.person).toMatchObject({
      subject: SUBJECT,
      unmatched: 0,
      lastParts: { entry: 'post', channel: 'organic' },
      milestones: { activation: { state: 'missed' } },
      money: [['2027-11-05T10:00:00.000Z', 'EUR', 10_900]],
      feeMoney: [],
      access: [['2027-11-05T10:00:00.000Z', '2028-02-05T10:00:00.000Z']],
      firsts: { 'bot/purchase': '2027-11-05T10:00:00.000Z' },
    });
    expect(card.state).toBe('customer');
    expect(card.events.map((_: any) => _.type)).toEqual([
      'task_done',
      'purchase',
    ]);
    expect(card.events[1]).toMatchObject({
      name: 'Оплата',
      role: 'payment',
      fields: { amount: '109.00', currency: 'EUR' },
    });
    expect(card.events[1]).not.toHaveProperty('body');
    expect(card.conflicts).toEqual([]);
    const more = (
      await asAdmin('GET', `/analytics/people/${SUBJECT}?before=${card.next}`)
    ).body;
    expect(more.events.map((_: any) => _.type)).toEqual([
      'trial_started',
      'source_survey',
      'bot_start',
    ]);
    expect(more.next).toBeNull();
    const email = await asAdmin('GET', '/analytics/people/anna@example.com');
    expect([email.status, codeOf(email)]).toEqual([
      422,
      'analytics.invalid_subject',
    ]);
    const nobody = await asAdmin('GET', '/analytics/people/u_nobody_here');
    expect([nobody.status, codeOf(nobody)]).toEqual([
      404,
      'analytics.person_not_found',
    ]);
    const cursor = await asAdmin(
      'GET',
      `/analytics/people/${SUBJECT}?before=x`
    );
    expect([cursor.status, codeOf(cursor)]).toEqual([
      422,
      'analytics.invalid_query',
    ]);
  });

  it('журнал событий с фильтрами и исходное тело по номеру', async () => {
    await customer(await intakeOn());
    const all = (await asKey('GET', '/analytics/events')).body;
    expect(all.events).toHaveLength(5);
    expect(all.next).toBeNull();
    const paid = (await asAdmin('GET', '/analytics/events?role=payment')).body;
    expect(paid.events.map((_: any) => _.type)).toEqual(['purchase']);
    for (const { 0: query, 1: count } of [
      ['?type=bot_start', 1],
      ['?sender=bot&from=2027-11-02&to=2027-11-05', 2],
      ['?test=1', 0],
      ['?test=0', 5],
      [`?subject=${SUBJECT}&limit=2`, 2],
    ] as const) {
      expect([
        query,
        (await asAdmin('GET', `/analytics/events${query}`)).body.events.length,
      ]).toEqual([query, count]);
    }
    const seq = paid.events[0].seq;
    const raw = (await asAdmin('GET', `/analytics/events/${seq}`)).body;
    expect(raw).toMatchObject({ seq, type: 'purchase', role: 'payment' });
    expect(JSON.parse(raw.body).data.payment_id).toBe('pi_1');
    for (const { 0: path, 1: status, 2: code } of [
      ['/analytics/events/999999', 404, 'analytics.event_not_found'],
      ['/analytics/events/abc', 404, 'analytics.event_not_found'],
      ['/analytics/events?before=abc', 422, 'analytics.invalid_query'],
      ['/analytics/events?from=вчера', 422, 'analytics.invalid_query'],
      ['/analytics/events?role=hero', 422, 'analytics.invalid_query'],
    ] as const) {
      const answer = await asAdmin('GET', path);
      expect([path, answer.status, codeOf(answer)]).toEqual([
        path,
        status,
        code,
      ]);
    }
  });

  it('«незнакомые» и сводка приёма с отказами', async () => {
    const key = await intakeOn();
    await send(event('mystery_type', '2027-11-10T10:00:00Z'), key);
    await send(
      event('bot_start', '2027-11-10T09:00:00Z', { label: 'post__xx__paid' }),
      key
    );
    await send({ id: 'bad', type: 'bot_start' }, key);
    const unknown = (await asKey('GET', '/analytics/unknown')).body;
    expect(unknown.types).toEqual([
      {
        sender: 'bot',
        type: 'mystery_type',
        count: 1,
        lastAt: '2027-11-10T10:00:00.000Z',
      },
    ]);
    expect(Object.keys(unknown).toSorted()).toEqual([
      'answers',
      'labels',
      'parts',
      'questions',
      'traits',
      'types',
      'values',
    ]);
    expect(unknown.parts).toEqual([
      { sender: 'bot', part: 'source', value: 'xx', count: 1 },
    ]);
    // Метка первого касания не из реестра — по людям; выданная в реестр из «незнакомых» уходит.
    expect(unknown.labels).toEqual([
      { sender: 'bot', label: 'post__xx__paid', count: 1 },
    ]);
    const intake = (await asKey('GET', '/analytics/intake')).body;
    expect(intake).toMatchObject({ enabled: true, today: 2 });
    expect(intake.lastAt).toBe(START);
    expect(intake.refusals[0]).toMatchObject({
      reason: 'invalid',
      sender: 'bot',
      id: 'bad',
    });
  });

  it('удаление человека: счёт в ответе, журнал удалений называет пользователя без псевдонима; второй раз — 404', async () => {
    await customer(await intakeOn());
    const erased = await asAdmin('DELETE', `/analytics/people/${SUBJECT}`);
    expect(erased).toEqual({ status: 200, body: { people: 1, events: 5 } });
    const gone = await asAdmin('GET', `/analytics/people/${SUBJECT}`);
    expect([gone.status, codeOf(gone)]).toEqual([
      404,
      'analytics.person_not_found',
    ]);
    const again = await asAdmin('DELETE', `/analytics/people/${SUBJECT}`);
    expect([again.status, codeOf(again)]).toEqual([
      404,
      'analytics.person_not_found',
    ]);
    const log = await asKey('GET', '/analytics/log?kind=erasures');
    expect(log.body.entries).toMatchObject([
      {
        origin: 'manager',
        userName: 'Анна',
        sender: null,
        events: 5,
        people: 1,
        marked: true,
      },
    ]);
    expect(JSON.stringify(log.body)).not.toContain(SUBJECT);
    for (const query of [
      '?kind=everything',
      '?kind=constructor',
      '?before=abc',
    ]) {
      const wrong = await asAdmin('GET', `/analytics/log${query}`);
      expect([query, wrong.status, codeOf(wrong)]).toEqual([
        query,
        422,
        'analytics.invalid_query',
      ]);
    }
  });
});

describe('загрузка файла', () => {
  it('проба ничего не пишет, загрузка принимает; отчёт — как у cms events import', async () => {
    await intakeOn();
    const file = `${jsonl(3)}\n\n{"id":"broken"}`;
    const dry = await upload('?dryRun=1', file);
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({
      sender: 'bot',
      dryRun: true,
      lines: 5,
      empty: 1,
      accepted: 3,
      rejected: 1,
      people: 3,
    });
    expect(dry.body.errors[0]).toMatchObject({ line: 5 });
    expect((await asAdmin('GET', '/analytics/events')).body.events).toEqual([]);
    const real = await upload('?sender=bot', file, { token });
    expect(real.body).toMatchObject({
      dryRun: false,
      accepted: 3,
      rejected: 1,
    });
    expect(
      (await asAdmin('GET', '/analytics/events')).body.events
    ).toHaveLength(3);
    expect(
      (await asAdmin('GET', '/analytics/events')).body.events[0].origin
    ).toBe('file');
    const repeat = await upload('', file);
    expect(repeat.body).toMatchObject({ accepted: 0, duplicates: 3 });
  });

  it('приём выключен — 409 analytics.disabled; отправитель не тот — 404, 409 или 422', async () => {
    for (const query of ['', '?dryRun=1']) {
      const off = await upload(query, jsonl(1));
      expect([query, off.status, codeOf(off)]).toEqual([
        query,
        409,
        'analytics.disabled',
      ]);
    }
    await intakeOn();
    const nobody = await upload('?sender=nobody', jsonl(1));
    expect([nobody.status, codeOf(nobody)]).toEqual([
      404,
      'analytics.sender_not_found',
    ]);
    const shop = await asAdmin('PUT', '/analytics/senders/shop', {
      name: 'Магазин',
    });
    keyOf(shop.body.key.key);
    const which = await upload('', jsonl(1));
    expect([which.status, codeOf(which)]).toEqual([
      422,
      'analytics.sender_required',
    ]);
    await asAdmin('PUT', '/analytics/senders/shop', { enabled: false });
    const off = await upload('?sender=shop', jsonl(1));
    expect([off.status, codeOf(off)]).toEqual([
      409,
      'analytics.sender_inactive',
    ]);
    expect((await upload('', jsonl(1))).body).toMatchObject({
      sender: 'bot',
      accepted: 1,
    });
    await asAdmin('PUT', '/analytics/senders/bot', { enabled: false });
    const none = await upload('', jsonl(1));
    expect([none.status, codeOf(none)]).toEqual([409, 'analytics.no_sender']);
  });

  it('файл больше 16 МиБ — 413, загрузки нет', async () => {
    await intakeOn();
    const big = new Uint8Array(16 * 1024 * 1024 + 1).fill(0x0a);
    const refused = await upload('', big);
    expect([refused.status, codeOf(refused)]).toEqual([
      413,
      'manager.too_large',
    ]);
    expect((await asAdmin('GET', '/analytics/events')).body.events).toEqual([]);
  });

  it('сервер отвечает, пока идёт загрузка: между пачками — паузы', async () => {
    const key = await intakeOn();
    const order: string[] = [];
    const loading = upload('', jsonl(2_500)).then((_) => {
      order.push('import');
      return _;
    });
    await Bun.sleep(60);
    const intake = await asAdmin('GET', '/analytics/intake');
    order.push('intake');
    const sent = await send(event('bot_start', '2027-11-10T11:00:00Z'), key);
    order.push('event');
    const report = await loading;
    expect(intake.status).toBe(200);
    expect(sent.status).toBe(200);
    expect(order).toEqual(['intake', 'event', 'import']);
    expect(report.body).toMatchObject({ accepted: 2_500, rejected: 0 });
    expect((await asAdmin('GET', '/analytics/people')).body.total).toBe(2_501);
  });
});

describe('этап 4: счёт приёма и сводки отправителя', () => {
  const summary = (
    day: string,
    at: string,
    data: Record<string, unknown> = {},
    extra: Record<string, unknown> = {}
  ) => ({
    id: `sum_${++ids}`,
    type: 'daily_summary',
    at,
    data: { day, counts: { purchase: 1, bot_start: 3 }, ...data },
    ...extra,
  });

  it('GET /analytics/intake/daily: исходы по суткам UTC с отказами из памяти; сутки — до 400, конец — не позже сегодня', async () => {
    const key = await intakeOn();
    await customer(key);
    await send({ id: 'bad', type: 'bot_start' }, key);
    await send(event('bot_start', '2027-11-10T09:00:00Z'), 'evk_wrong');
    const daily = await asKey('GET', '/analytics/intake/daily?days=7');
    expect(daily).toEqual({
      status: 200,
      body: {
        from: '2027-11-08',
        to: '2027-11-14',
        days: [
          {
            day: '2027-11-14',
            sender: '',
            origin: 'http',
            outcome: 'unauthorized',
            count: 1,
          },
          {
            day: '2027-11-14',
            sender: 'bot',
            origin: 'http',
            outcome: 'accepted',
            count: 5,
          },
          {
            day: '2027-11-14',
            sender: 'bot',
            origin: 'http',
            outcome: 'invalid',
            count: 1,
          },
          {
            day: '2027-11-14',
            sender: 'bot',
            origin: 'http',
            outcome: 'late',
            count: 5,
          },
        ],
      },
    });
    expect(
      (
        await asKey(
          'GET',
          '/analytics/intake/daily?from=2027-11-01&to=2027-11-13'
        )
      ).body.days
    ).toEqual([]);
    for (const query of [
      'days=401',
      'days=0',
      'from=2027-11-15',
      'from=2027-11-10&to=2027-11-09',
      'from=2026-01-01&to=2027-11-14',
      'to=14.11.2027',
    ]) {
      const refused = await asKey('GET', `/analytics/intake/daily?${query}`);
      expect([query, refused.status, codeOf(refused)]).toEqual([
        query,
        422,
        'analytics.invalid_query',
      ]);
    }
  });

  it('GET /analytics/summaries: последняя сводка за сутки, версии; тестовые — по test=1; отправитель — из настройки', async () => {
    const key = await intakeOn();
    for (const body of [
      summary('2027-11-11', '2027-11-12T03:00:00Z', { version: '1.4.2' }),
      summary('2027-11-12', '2027-11-13T03:00:00Z', {
        version: '1.5.0',
        revenue: { EUR: '19.00' },
        failed: 0,
      }),
      // Исправленная сводка за те же сутки — новым id и позже.
      summary('2027-11-12', '2027-11-13T04:00:00Z', {
        version: '1.5.0',
        revenue: { EUR: '38.00' },
        failed: 0,
      }),
      summary(
        '2027-11-13',
        '2027-11-14T03:00:00Z',
        { version: '9.9.9-dev' },
        { test: true }
      ),
    ]) {
      expect((await send(body, key)).status).toBe(200);
    }
    const listed = await asKey('GET', '/analytics/summaries?from=2027-11-10');
    expect(listed.status).toBe(200);
    expect(
      listed.body.summaries.map((_: Record<string, unknown>) => [
        _.day,
        _.test,
        _.version,
        _.revenue,
      ])
    ).toEqual([
      ['2027-11-11', false, '1.4.2', null],
      ['2027-11-12', false, '1.5.0', { EUR: 3800 }],
    ]);
    expect(listed.body.summaries[1]).toMatchObject({
      sender: 'bot',
      counts: { purchase: 1, bot_start: 3 },
      failed: 0,
      at: '2027-11-13T04:00:00.000Z',
    });
    expect(listed.body).toMatchObject({
      from: '2027-11-10',
      to: '2027-11-14',
      versions: [
        {
          day: '2027-11-12',
          sender: 'bot',
          name: 'Бот подписки',
          from: '1.4.2',
          to: '1.5.0',
          matched: null,
        },
      ],
    });
    expect(
      (
        await asKey('GET', '/analytics/summaries?from=2027-11-10&test=1')
      ).body.summaries.map((_: Record<string, unknown>) => [_.day, _.test])
    ).toEqual([
      ['2027-11-11', false],
      ['2027-11-12', false],
      ['2027-11-13', true],
    ]);
    // Смена версии — в «Обзоре» того же периода.
    expect(
      (await asKey('GET', '/analytics/overview?from=2027-11-10&to=2027-11-14'))
        .body.versions
    ).toEqual(listed.body.versions);
    expect(
      (
        await asKey(
          'GET',
          '/analytics/summaries?sender=bot&from=2027-11-12&to=2027-11-12'
        )
      ).body
    ).toMatchObject({
      summaries: [{ day: '2027-11-12' }],
      versions: [{ day: '2027-11-12' }],
    });
    for (const query of [
      'sender=shop',
      'sender=Bot',
      'test=yes',
      'from=2027-11-15',
    ]) {
      const refused = await asKey('GET', `/analytics/summaries?${query}`);
      expect([query, refused.status, codeOf(refused)]).toEqual([
        query,
        422,
        'analytics.invalid_query',
      ]);
    }
  });

  it('час сводки отправителя: в настройке, правка — только войдя; негодный — 422', async () => {
    expect(
      (await asKey('GET', '/analytics/setup')).body.senders[0]
    ).toMatchObject({
      code: 'bot',
      summaryAt: '06:00',
    });
    const refused = await asKey('PUT', '/analytics/senders/bot', {
      summaryAt: '03:30',
    });
    expect([refused.status, codeOf(refused)]).toEqual([
      403,
      'identity.session_required',
    ]);
    expect(
      await asAdmin('PUT', '/analytics/senders/bot', { summaryAt: '03:30' })
    ).toMatchObject({
      status: 200,
      body: { sender: { summaryAt: '03:30' }, key: null },
    });
    expect(
      (await asAdmin('PUT', '/analytics/senders/bot', { summaryAt: null })).body
        .sender.summaryAt
    ).toBeNull();
    const wrong = await asAdmin('PUT', '/analytics/senders/bot', {
      summaryAt: '24:00',
    });
    expect([wrong.status, codeOf(wrong)]).toEqual([
      422,
      'analytics.invalid_item',
    ]);
    expect(app.analytics.setup.get().senders[0]?.summaryAt).toBeNull();
  });
});

describe('проверка правок агентов', () => {
  it('изменяющие маршруты аналитики ключом — review.not_reviewable, чтение и человек — как обычно', async () => {
    await asAdmin('PUT', '/review/settings', { agents: true });
    await intakeOn();
    for (const [method, path, body] of [
      [
        'PUT',
        '/analytics/setup/property',
        { scope: 'event', code: 'size', name: 'Размер', kind: 'string' },
      ],
      [
        'POST',
        '/analytics/setup/property/archive',
        { scope: 'event', code: 'items_n', archived: true },
      ],
      ['POST', '/analytics/setup/dictionary/remove', { code: 'lang' }],
      ['DELETE', `/analytics/people/${SUBJECT}`, undefined],
      ['POST', '/analytics/events/import?dryRun=1', {}],
      [
        'POST',
        '/analytics/labels',
        { parts: { source: 'ig' }, name: 'Instagram' },
      ],
      ['PUT', '/analytics/labels/bot/_ig', { name: 'Instagram' }],
      ['DELETE', '/analytics/labels/bot/_ig', undefined],
      [
        'PUT',
        '/analytics/rates',
        { rates: [{ currency: 'PLN', day: '2027-11-01', rate: '0.23' }] },
      ],
      ['DELETE', '/analytics/rates/PLN/2027-11-01', undefined],
      [
        'PUT',
        '/analytics/spend',
        {
          rows: [{ month: '2027-11', parts: {}, currency: 'EUR', amount: '1' }],
        },
      ],
      ['DELETE', '/analytics/spend/1', undefined],
      [
        'PUT',
        '/analytics/statements',
        {
          statements: [{ month: '2027-10', currency: 'EUR', amount: '1.00' }],
        },
      ],
      ['DELETE', '/analytics/statements/2027-10/EUR', undefined],
      ['PUT', '/analytics/setup/check', { code: 'events_arrived' }],
      [
        'POST',
        '/analytics/quality/summary_arrived/2027-11-13/resolve',
        { scope: 'bot', note: 'проверка' },
      ],
      ['POST', '/analytics/quality/run', {}],
      ['POST', '/analytics/set/plan', { sample: 'shop' }],
    ] as const) {
      const refused = await asKey(method, path, body);
      expect([path, refused.status, codeOf(refused)]).toEqual([
        path,
        403,
        'review.not_reviewable',
      ]);
    }
    // Загрузка набора — только человек и в режиме проверки: ключ получает тот же отказ, что без него.
    const load = await asKey('POST', '/analytics/set', { sample: 'shop' });
    expect([load.status, codeOf(load)]).toEqual([
      403,
      'identity.session_required',
    ]);
    expect((await asKey('GET', '/analytics/set')).status).toBe(200);
    expect((await asKey('GET', '/analytics/setup')).status).toBe(200);
    expect(app.analytics.setup.get().revision).toBe(1);
    expect(
      (
        await asAdmin('PUT', '/analytics/setup/property', {
          scope: 'event',
          code: 'size',
          name: 'Размер',
          kind: 'string',
        })
      ).status
    ).toBe(200);
    expect(app.review.changeSets.list()).toEqual([]);
  });
});

describe('этап 4: проверки данных', () => {
  // Сводки за 11–12 ноября пришли, за 13-е — нет: такт в 18:30 14-го видит сбой «Сводка пришла».
  const quiet = async (): Promise<string> => {
    now = new Date('2027-11-10T10:00:00.000Z');
    const key = await intakeOn();
    await asAdmin('PUT', '/analytics/senders/bot', { summaryAt: '03:30' });
    for (const day of ['2027-11-11', '2027-11-12']) {
      now = new Date(`${day}T10:00:00.000Z`);
      await send(event('bot_start', `${day}T09:00:00Z`), key);
      await send(
        {
          id: `sum_${day}`,
          type: 'daily_summary',
          at: `${day}T23:59:00Z`,
          data: { day, counts: { bot_start: 1 } },
        },
        key
      );
    }
    now = new Date(START);
    app.analytics.quality.tick();
    return key;
  };

  it('сетка, статус и день: ключом API — можно; незнакомая проверка — 404; день без строки — 404', async () => {
    await quiet();
    const report = await asKey('GET', '/analytics/quality?days=7');
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({
      from: '2027-11-08',
      to: '2027-11-14',
      channels: false,
    });
    expect(
      report.body.rows.find(
        (_: { check: string }) => _.check === 'summary_arrived'
      )
    ).toMatchObject({
      scope: 'bot',
      zone: 'utc',
      day: '2027-11-13',
      state: 'failure',
      lastOk: '2027-11-12',
    });
    expect(report.body.checks.map((_: { code: string }) => _.code)).toContain(
      'low_data'
    );
    expect((await asKey('GET', '/analytics/quality/status')).body).toEqual({
      failures: 1,
      warnings: 0,
      day: '2027-11-13',
    });
    const day = await asKey(
      'GET',
      '/analytics/quality/summary_arrived/2027-11-13?scope=bot'
    );
    expect(day.body).toMatchObject({
      check: 'summary_arrived',
      scope: 'bot',
      day: '2027-11-13',
      state: 'failure',
      reason: 'missing',
      value: 1,
      summary: null,
    });
    const found = await asKey(
      'GET',
      '/analytics/quality/summary_arrived/2027-11-12?scope=bot'
    );
    expect(found.body.summary).toMatchObject({
      day: '2027-11-12',
      counts: { bot_start: 1 },
    });
    for (const [path, status, code] of [
      [
        '/analytics/quality/nope/2027-11-13?scope=bot',
        404,
        'analytics.check_not_found',
      ],
      [
        '/analytics/quality/low_data/2027-11-13',
        404,
        'analytics.check_not_found',
      ],
      [
        '/analytics/quality/summary_arrived/2027-11-01?scope=bot',
        404,
        'analytics.check_not_found',
      ],
      [
        '/analytics/quality/summary_arrived/2027-11-13',
        422,
        'analytics.invalid_query',
      ],
      [
        '/analytics/quality/summary_arrived/13.11.2027?scope=bot',
        422,
        'analytics.invalid_query',
      ],
      ['/analytics/quality?days=91', 422, 'analytics.invalid_query'],
      ['/analytics/quality?check=nope', 404, 'analytics.check_not_found'],
    ] as const) {
      const refused = await asKey('GET', path);
      expect([path, refused.status, codeOf(refused)]).toEqual([
        path,
        status,
        code,
      ]);
    }
  });

  it('снять вручную: ключом API — с отметкой агента; заметка обязательна; не открытое — 409; вернуть — журнал removed', async () => {
    await quiet();
    const path = '/analytics/quality/summary_arrived/2027-11-13/resolve';
    const empty = await asKey('POST', path, { scope: 'bot' });
    expect([empty.status, codeOf(empty)]).toEqual([
      422,
      'analytics.invalid_note',
    ]);
    const resolved = await asKey('POST', path, {
      scope: 'bot',
      note: 'бот стоял на обновлении',
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.resolved).toMatchObject({
      by: 'Анна',
      agent: true,
      note: 'бот стоял на обновлении',
    });
    expect(
      (await asAdmin('GET', '/analytics/log')).body.entries[0]
    ).toMatchObject({
      item: 'resolution',
      key: 'summary_arrived/bot/2027-11-13',
      action: 'created',
      author: { name: 'Анна', agent: true },
    });
    const again = await asAdmin('POST', path, { scope: 'bot', note: 'ещё' });
    expect([again.status, codeOf(again)]).toEqual([
      409,
      'analytics.check_not_open',
    ]);
    const ok = await asAdmin(
      'POST',
      '/analytics/quality/summary_arrived/2027-11-12/resolve',
      { scope: 'bot', note: 'в порядке' }
    );
    expect([ok.status, codeOf(ok)]).toEqual([409, 'analytics.check_not_open']);
    expect(
      (await asKey('GET', '/analytics/quality/status')).body.failures
    ).toBe(0);
    const reopened = await asAdmin('DELETE', `${path}?scope=bot`);
    expect(reopened.body.resolved).toBeNull();
    const twice = await asAdmin('DELETE', `${path}?scope=bot`);
    expect([twice.status, codeOf(twice)]).toEqual([
      409,
      'analytics.check_not_open',
    ]);
    expect(
      (await asAdmin('GET', '/analytics/log')).body.entries[0]
    ).toMatchObject({
      item: 'resolution',
      action: 'removed',
      author: { agent: false },
    });
  });

  it('проверить заново — сразу, без уведомлений; группа check — поправка встроенной, удаление — значения ядра', async () => {
    const key = await quiet();
    now = new Date('2027-11-14T19:00:00.000Z');
    await send(
      {
        id: 'sum_late',
        type: 'daily_summary',
        at: '2027-11-14T19:00:00Z',
        data: { day: '2027-11-13', counts: { bot_start: 0 } },
      },
      key
    );
    const run = await asKey('POST', '/analytics/quality/run', {
      check: 'summary_arrived',
      day: '2027-11-13',
      scope: 'bot',
    });
    expect(run.status).toBe(200);
    expect(
      run.body.rows.map(
        (_: { check: string; cells: { state: string; reason: string }[] }) => [
          _.check,
          _.cells.map((cell) => `${cell.state} ${cell.reason}`),
        ]
      )
    ).toEqual([['summary_arrived', ['ok late']]]);
    expect(app.notify.outbox.recent()).toEqual([]);
    const tomorrow = await asKey('POST', '/analytics/quality/run', {
      day: '2027-11-15',
    });
    expect([tomorrow.status, codeOf(tomorrow)]).toEqual([
      422,
      'analytics.invalid_query',
    ]);
    // Поправка встроенной — ключом API тоже; ревизия растёт, журнал пишет check.
    const corrected = await asKey('PUT', '/analytics/setup/check', {
      code: 'labels_readable',
      params: { share: 20 },
      notify: 'any',
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({
      code: 'labels_readable',
      name: '',
      notify: 'any',
      params: { share: 20 },
    });
    expect(
      (await asKey('GET', '/analytics/setup')).body.checks.find(
        (_: { code: string }) => _.code === 'labels_readable'
      )
    ).toMatchObject({
      builtin: true,
      corrected: true,
      notify: 'any',
      params: { share: 20, min: 10 },
      defaults: { share: 10, min: 10 },
    });
    for (const [body, code] of [
      [
        { code: 'labels_readable', params: { share: 101 } },
        'analytics.invalid_item',
      ],
      [{ code: 'labels_readable', name: 'Метки' }, 'analytics.invalid_item'],
      [{ code: 'low_data', enabled: false }, 'analytics.invalid_item'],
      // Свой код — своя пороговая: без правила — отказ правила.
      [{ code: 'my_own', name: 'Своя' }, 'analytics.invalid_check'],
    ] as const) {
      const refused = await asKey('PUT', '/analytics/setup/check', body);
      expect([body.code, refused.status, codeOf(refused)]).toEqual([
        body.code,
        422,
        code,
      ]);
    }
    const archived = await asKey('POST', '/analytics/setup/check/archive', {
      code: 'labels_readable',
      archived: true,
    });
    expect([archived.status, codeOf(archived)]).toEqual([
      422,
      'analytics.invalid_item',
    ]);
    expect(
      (
        await asKey('POST', '/analytics/setup/check/remove', {
          code: 'labels_readable',
        })
      ).status
    ).toBe(200);
    expect(
      (await asKey('GET', '/analytics/setup')).body.checks.find(
        (_: { code: string }) => _.code === 'labels_readable'
      )
    ).toMatchObject({
      corrected: false,
      notify: 'failure',
      params: { share: 10, min: 10 },
    });
  });

  it('люди с разными первыми касаниями: firstTouchConflict=1 — в списке и с параметрами отчёта; негодное — 422', async () => {
    const key = await intakeOn();
    await send(
      event(
        'bot_start',
        '2027-11-01T09:00:00Z',
        {},
        {
          first_touch: { label: 'post__ig', at: '2027-11-01T08:00:00Z' },
        }
      ),
      key
    );
    await send(
      event(
        'task_done',
        '2027-11-02T09:00:00Z',
        { items_n: 2 },
        {
          first_touch: { label: 'post__fb', at: '2027-11-01T08:30:00Z' },
        }
      ),
      key
    );
    await send(
      event(
        'bot_start',
        '2027-11-03T09:00:00Z',
        {},
        { subject: 'u_calm_person' }
      ),
      key
    );
    const all = await asKey('GET', '/analytics/people');
    expect(all.body.total).toBe(2);
    const conflict = await asKey(
      'GET',
      '/analytics/people?firstTouchConflict=1'
    );
    expect(
      conflict.body.people.map((_: { subject: string }) => _.subject)
    ).toEqual([SUBJECT]);
    // С периодом отчёта — те же люди: фильтр идёт и по строкам людей.
    const period = await asKey(
      'GET',
      '/analytics/people?firstTouchConflict=1&days=30'
    );
    expect(
      period.body.people.map((_: { subject: string }) => _.subject)
    ).toEqual([SUBJECT]);
    const refused = await asKey(
      'GET',
      '/analytics/people?firstTouchConflict=yes'
    );
    expect([refused.status, codeOf(refused)]).toEqual([
      422,
      'analytics.invalid_query',
    ]);
  });
});

describe('этап 4: выписки и свои проверки', () => {
  it('выписки ключом API: автор — с отметкой агента; отказы 422 по путям, 404 у удаления; до 24 за раз', async () => {
    const saved = await asKey('PUT', '/analytics/statements', {
      statements: [
        { month: '2027-10', currency: 'EUR', amount: '1250.00', note: 'банк' },
        { month: '2027-09', currency: 'PLN', amount: '-12.50', fees: 'net' },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      created: 2,
      changed: 0,
      statements: [
        {
          month: '2027-10',
          currency: 'EUR',
          amount: 125_000,
          fees: 'gross',
          site: 0,
          difference: -125_000,
          share: 100,
          author: { name: 'Анна', agent: true },
        },
        { month: '2027-09', amount: -1250, fees: 'net' },
      ],
    });
    expect(
      (await asKey('GET', '/analytics/statements?from=2027-10')).body
    ).toMatchObject({
      from: '2027-10',
      to: null,
      statements: [{ month: '2027-10', currency: 'EUR' }],
    });
    expect(app.analytics.log.setup()[0]).toMatchObject({
      item: 'statement',
      author: { agent: true },
    });
    const refused = await asKey('PUT', '/analytics/statements', {
      statements: [
        { month: '2027-11', currency: 'EUR', amount: '1' },
        { month: '2027-10', currency: 'EUR', amount: '1', extra: true },
        { month: '2027-08', currency: 'EUR', amount: '1' },
        { month: '2027-08', currency: 'EUR', amount: '2' },
      ],
    });
    expect([refused.status, codeOf(refused)]).toEqual([
      422,
      'analytics.invalid_statement',
    ]);
    for (const path of [
      'statements[0].month',
      'statements[1].extra',
      'statements[3] — the same month and currency as statements[2]',
    ]) {
      expect(refused.body.error.message).toContain(path);
    }
    expect(app.analytics.statements.list().statements).toHaveLength(2);
    expect(
      codeOf(
        await asKey('PUT', '/analytics/statements', {
          statements: Array.from({ length: 25 }, (_, n) => ({
            month: `2026-${String((n % 12) + 1).padStart(2, '0')}`,
            currency: 'EUR',
            amount: '1',
          })),
        })
      )
    ).toBe('analytics.invalid_statement');
    expect(
      codeOf(await asKey('GET', '/analytics/statements?from=2027-1'))
    ).toBe('analytics.invalid_query');
    expect(
      (await asKey('DELETE', '/analytics/statements/2027-10/EUR')).status
    ).toBe(200);
    const missing = await asKey('DELETE', '/analytics/statements/2027-10/EUR');
    expect([missing.status, codeOf(missing)]).toEqual([
      404,
      'analytics.statement_not_found',
    ]);
  });

  it('своя пороговая ключом: группа check, правило — 422 analytics.invalid_check, ссылка — invalid_reference, удаление без результатов', async () => {
    const rule = {
      metric: 'events',
      sender: 'bot',
      type: 'purchase',
      compare: 'lt',
      threshold: 1,
      days: 7,
      severity: 'warning',
    };
    const created = await asKey('PUT', '/analytics/setup/check', {
      code: 'weekly_payments',
      name: 'Оплаты за неделю',
      params: rule,
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      code: 'weekly_payments',
      params: { ...rule, role: null, goal: null, currency: null },
    });
    expect(
      (await asKey('GET', '/analytics/setup')).body.checks.at(-1)
    ).toMatchObject({
      code: 'weekly_payments',
      builtin: false,
      name: 'Оплаты за неделю',
      zone: 'report',
      defaults: null,
      corrected: false,
    });
    for (const [params, code] of [
      [{ ...rule, days: 3 }, 'analytics.invalid_check'],
      [{ ...rule, type: 'nope' }, 'analytics.invalid_reference'],
    ] as const) {
      const refused = await asKey('PUT', '/analytics/setup/check', {
        code: 'weekly_payments',
        params,
      });
      expect([refused.status, codeOf(refused)]).toEqual([422, code]);
    }
    // Тип, на который ссылается проверка, не удалить — 409 in_use; проверку без строк дней — можно.
    const used = await asKey('POST', '/analytics/setup/type/remove', {
      sender: 'bot',
      code: 'purchase',
    });
    expect([used.status, codeOf(used)]).toEqual([409, 'analytics.in_use']);
    expect(
      (
        await asKey('POST', '/analytics/setup/check/remove', {
          code: 'weekly_payments',
        })
      ).status
    ).toBe(200);
  });

  it('отчёты несут пороги «мало данных» в шапке; поправка low_data — со следующего ответа', async () => {
    expect((await asKey('GET', '/analytics/sources')).body.lowData).toEqual({
      people: 30,
      customers: 10,
    });
    await asKey('PUT', '/analytics/setup/check', {
      code: 'low_data',
      params: { people: 4, customers: 1 },
    });
    for (const path of [
      '/analytics/sources',
      '/analytics/funnel',
      '/analytics/answers',
      '/analytics/overview',
      '/analytics/cohorts',
      '/analytics/milestones',
    ]) {
      expect([path, (await asKey('GET', path)).body.lowData]).toEqual([
        path,
        { people: 4, customers: 1 },
      ]);
    }
  });
});

describe('этап 4: перенос набора', () => {
  it('выгрузка, образцы и проба — ключом API; загрузка ключом — session_required, ничего не изменено', async () => {
    const before = app.analytics.setup.get();
    const entries = (await asAdmin('GET', '/analytics/log')).body.entries;
    const exported = await asKey('GET', '/analytics/set');
    expect(exported.body).toMatchObject({
      format: 'eile-analytics-set',
      version: 1,
      eile: expect.any(String),
      exportedAt: START,
    });
    expect(
      (await asKey('GET', '/analytics/set/samples')).body.map(
        (_: { code: string }) => _.code
      )
    ).toEqual(['subscription', 'shop']);
    const tried = await asKey('POST', '/analytics/set/plan', {
      sample: 'shop',
    });
    expect(tried.body).toMatchObject({ dryRun: true, applied: false });
    expect(tried.body.created.length).toBeGreaterThan(10);
    for (const body of [exported.body, { sample: 'shop' }]) {
      const refused = await asKey('POST', '/analytics/set', body);
      expect([refused.status, codeOf(refused)]).toEqual([
        403,
        'identity.session_required',
      ]);
    }
    expect(app.analytics.setup.get()).toEqual(before);
    expect((await asAdmin('GET', '/analytics/log')).body.entries).toEqual(
      entries
    );
    // Человеком — загружено, журнал называет его, без отметки агента.
    const loaded = await asAdmin('POST', '/analytics/set', {
      format: 'eile-analytics-set',
      version: 1,
      name: 'Магазин рядом',
      senders: [{ code: 'shop', name: 'Магазин' }],
    });
    expect(loaded.body).toMatchObject({ applied: true, errors: {} });
    expect(
      (await asAdmin('GET', '/analytics/log')).body.entries[0]
    ).toMatchObject({
      item: 'set',
      action: 'applied',
      author: { name: 'Анна', agent: false },
    });
  });

  it('коды отказов: не набор — 422, ошибки набора — 422 с errors и отчётом, незнакомый образец — 404', async () => {
    const notSet = await asAdmin('POST', '/analytics/set/plan', []);
    expect([notSet.status, codeOf(notSet)]).toEqual([
      422,
      'analytics.invalid_set',
    ]);
    const missing = await asAdmin('POST', '/analytics/set', { sample: 'cafe' });
    expect([missing.status, codeOf(missing)]).toEqual([
      404,
      'analytics.sample_not_found',
    ]);
    const broken = await asAdmin('POST', '/analytics/set', {
      format: 'eile-analytics-set',
      version: 1,
      name: 'Кривой',
      senders: [{ code: 'Bad Code', name: 'x' }],
    });
    expect([broken.status, codeOf(broken)]).toEqual([
      422,
      'analytics.invalid_set',
    ]);
    expect(broken.body.errors).toEqual({
      'senders[0]': expect.stringContaining('is not a code'),
    });
    expect(broken.body.report).toMatchObject({
      applied: false,
      revision: null,
    });
    // Тело больше 2 МБ — общий предел JSON менеджера.
    const huge = await call(
      'POST',
      '/analytics/set/plan',
      { cookie: admin },
      undefined,
      JSON.stringify({
        format: 'eile-analytics-set',
        note: 'я'.repeat(1_100_000),
      })
    );
    expect([huge.status, codeOf(huge)]).toEqual([413, 'manager.too_large']);
  });
});
