import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import type {
  AnalyticsSet,
  SetPlanReport,
  SetupAuthor,
} from '../src/contexts/analytics/index.ts';
import { ANALYTICS_SAMPLES } from '../src/scaffolds/analytics/index.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

// Перенос набора (ADR 0072, этап 4): выгрузка с одного сайта, проба и загрузка на другой — те же отчёты на тех
// же событиях; образцы бинарника на трёх языках; сайт из образца «Магазин» на файле analytics-shop.jsonl.

const START = '2026-11-15T12:00:00.000Z';
const PASSWORD = 'correct horse battery';
const STAGE2 = join(import.meta.dir, 'fixtures/analytics-stage2.jsonl');
const STAGE3 = join(import.meta.dir, 'fixtures/analytics-stage3.jsonl');
const SHOP = join(import.meta.dir, 'fixtures/analytics-shop.jsonl');
const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };

// Курсы и расходы — числа сайта: владелец вносит их на каждом сайте сам, набор их не несёт.
const RATES = [
  { currency: 'PLN', day: '2026-06-01', rate: '0.2300' },
  { currency: 'PLN', day: '2026-10-01', rate: '0.2500' },
];
const SPEND = [
  {
    month: '2026-10',
    parts: { source: 'ig', channel: 'paid' },
    currency: 'EUR',
    amount: '40.00',
  },
  { month: '2026-09', parts: { source: 'fb' }, currency: 'EUR', amount: '25' },
];

type Site = {
  readonly app: App;
  readonly path: string;
  readonly admin: string;
  readonly token: string;
};
type Who = 'admin' | 'key' | 'none';
type Answer = { readonly status: number; readonly body: any; text: string };

let dir: string;
let sites: Site[] = [];

const open = async (name: string): Promise<Site> => {
  const path = join(dir, `${name}.db`);
  const app = createApp({
    databasePath: path,
    mediaCache: `${path}.cache`,
    clock: () => new Date(START),
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
  const admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  const site = { app, path, admin, token: '' };
  const token = (
    await call(site, 'POST', '/tokens', 'admin', { name: 'Скрипт' })
  ).body.token as string;
  const ready = { ...site, token };
  sites.push(ready);
  return ready;
};

const call = async (
  site: Pick<Site, 'app' | 'admin' | 'token'>,
  method: string,
  path: string,
  who: Who = 'admin',
  body?: unknown,
  language = 'ru'
): Promise<Answer> => {
  const response = await site.app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        'accept-language': language,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who === 'admin' ? { cookie: site.admin } : {}),
        ...(who === 'key' ? { authorization: `Bearer ${site.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text === '' ? null : JSON.parse(text),
    text,
  };
};

const codeOf = (answer: Answer): string | undefined => answer.body?.error?.code;

// Приём, базовая валюта, ключ отправителя — человеком в менеджере; курсы и расходы — ключом API, как скрипт.
const prepare = async (site: Site, sender: string): Promise<string> => {
  expect(
    (
      await call(site, 'PUT', '/analytics/settings', 'admin', {
        enabled: true,
        baseCurrency: 'EUR',
      })
    ).status
  ).toBe(200);
  const key = await call(
    site,
    'POST',
    `/analytics/senders/${sender}/keys`,
    'admin',
    { label: 'Ключ' }
  );
  expect(key.status).toBe(201);
  return key.body.key as string;
};

const money = async (site: Site): Promise<void> => {
  expect(
    (await call(site, 'PUT', '/analytics/rates', 'key', { rates: RATES }))
      .status
  ).toBe(200);
  expect(
    (await call(site, 'PUT', '/analytics/spend', 'key', { rows: SPEND })).status
  ).toBe(200);
};

const history = async (site: Site): Promise<void> => {
  for (const file of [STAGE2, STAGE3]) {
    expect((await site.app.analytics.events.import(file)).rejected).toBe(0);
  }
};

const send = (site: Site, key: string, line: string) =>
  site.app
    .fetch(
      new Request('http://localhost/_cms/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: line,
      }),
      { requestIP: () => ({ address: '192.0.2.10' }) }
    )
    .then((_) => _.status);

const PERIOD = 'from=2026-06-01&to=2026-11-15';

// Отчёты сайта на одних и тех же событиях: каждый — через API, как его читает экран.
const reports = async (site: Site): Promise<Record<string, unknown>> =>
  Object.fromEntries(
    await Promise.all(
      [
        `/analytics/sources?${PERIOD}&group=part:source`,
        `/analytics/sources?${PERIOD}&group=part:source&life=6`,
        `/analytics/sources?${PERIOD}&group=part:channel&attribution=return`,
        `/analytics/funnel?${PERIOD}`,
        `/analytics/answers?${PERIOD}&group=part:source&question=heard_from`,
        `/analytics/overview?${PERIOD}`,
        `/analytics/cohorts?${PERIOD}&basis=payment`,
        `/analytics/cohorts?${PERIOD}&basis=arrival`,
        `/analytics/milestones?${PERIOD}`,
      ].map((path) =>
        call(site, 'GET', path).then((_) => {
          expect([path, _.status]).toEqual([path, 200]);
          return [path, _.body] as const;
        })
      )
    )
  );

const withoutStamp = ({ name, exportedAt, ...rest }: AnalyticsSet) => rest;

const rows = (site: Site, sql: string): Record<string, unknown>[] => {
  const db = new Database(site.path, { readonly: true });
  const found = db.query<Record<string, unknown>, []>(sql).all();
  db.close();
  return found;
};

const revisionOf = (site: Site): number =>
  site.app.analytics.setup.get().revision;

const logCount = (site: Site): number =>
  rows(site, 'SELECT count(*) AS n FROM analytics_setup_log')[0]!.n as number;

// Сайт A — набор сайта-примера, тип в архиве, поправки встроенных проверок, своя проверка, час сводки.
const sourceSite = async (): Promise<Site> => {
  const a = await open('a');
  a.app.analytics.setup.apply(SUBSCRIPTION, ANNA);
  for (const { 0: path, 1: body } of [
    [
      '/analytics/setup/type',
      {
        sender: 'bot',
        code: 'old_start',
        name: 'Старт (старый бот)',
        role: 'touch',
      },
    ],
    [
      '/analytics/setup/check',
      { code: 'events_arrived', params: { missing: 2 } },
    ],
    [
      '/analytics/setup/check',
      { code: 'low_data', params: { people: 4, customers: 1 } },
    ],
    [
      '/analytics/setup/check',
      {
        code: 'paid_daily',
        name: 'Оплаты за сутки',
        params: {
          metric: 'role',
          role: 'payment',
          compare: 'lt',
          threshold: 1,
          days: 1,
          severity: 'warning',
        },
      },
    ],
  ] as const) {
    expect([path, (await call(a, 'PUT', path, 'admin', body)).status]).toEqual([
      path,
      200,
    ]);
  }
  expect(
    (
      await call(a, 'POST', '/analytics/setup/type/archive', 'admin', {
        sender: 'bot',
        code: 'old_start',
        archived: true,
      })
    ).status
  ).toBe(200);
  expect(
    (
      await call(a, 'PUT', '/analytics/senders/bot', 'admin', {
        summaryAt: '03:30',
      })
    ).status
  ).toBe(200);
  return a;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cms-analytics-transfer-'));
  sites = [];
});

afterEach(() => {
  for (const site of sites) site.app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('набор с одного сайта на другой', () => {
  it('выгрузка A → проба и загрузка на пустой B: те же отчёты на тех же событиях, выгрузка B — та же', async () => {
    const a = await sourceSite();
    await prepare(a, 'bot');
    await money(a);
    await history(a);
    const exported = await call(a, 'GET', '/analytics/set', 'key');
    expect(exported.status).toBe(200);
    expect(exported.text.endsWith('\n')).toBe(true);
    const set = exported.body as AnalyticsSet;
    expect(set).toMatchObject({
      format: 'eile-analytics-set',
      version: 1,
      name: 'Мой сайт 2026-11-15',
      exportedAt: START,
    });

    const b = await open('b');
    const tried = await call(b, 'POST', '/analytics/set/plan', 'admin', set);
    expect(tried.status).toBe(200);
    const plan = tried.body as SetPlanReport;
    expect(plan).toMatchObject({
      name: 'Мой сайт 2026-11-15',
      dryRun: true,
      applied: false,
      revision: null,
      changed: [],
      unchanged: 0,
      kept: {},
      errors: {},
    });
    expect(plan.warnings.map((_) => _.code)).toEqual(['sender_created']);
    expect(plan.untouched).toContain('keys');
    expect(plan.created.filter((_) => _.archived).map((_) => _.key)).toEqual([
      'bot/old_start',
    ]);
    // Проба ничего не пишет: ни ревизии, ни журнала.
    expect([revisionOf(b), logCount(b)]).toEqual([0, 0]);

    const loaded = await call(b, 'POST', '/analytics/set', 'admin', set);
    expect(loaded.status).toBe(200);
    expect(loaded.body).toMatchObject({
      dryRun: false,
      applied: true,
      revision: 1,
      errors: {},
    });
    expect(loaded.body.created).toEqual(plan.created);
    // Ключей набор не несёт: у нового отправителя их нет, выпускает человек.
    expect(b.app.analytics.senders.list()[0]?.keys).toEqual([]);
    await prepare(b, 'bot');
    await money(b);
    await history(b);

    expect(await reports(b)).toEqual(await reports(a));
    const again = (await call(b, 'GET', '/analytics/set')).body as AnalyticsSet;
    expect(withoutStamp(again)).toEqual(withoutStamp(set));
  });

  it('повтор загрузки ничего не меняет; журнал — одна строка набора с автором; файл этапа 3 без checks — загружается', async () => {
    const a = await sourceSite();
    const set = (await call(a, 'GET', '/analytics/set')).body as AnalyticsSet;
    const b = await open('b');
    expect((await call(b, 'POST', '/analytics/set', 'admin', set)).status).toBe(
      200
    );
    const log = (await call(b, 'GET', '/analytics/log')).body.entries;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      item: 'set',
      key: 'Мой сайт 2026-11-15',
      action: 'applied',
      author: { id: 1, name: 'Анна', agent: false },
    });
    const [revision, entries] = [revisionOf(b), logCount(b)];
    const again = await call(b, 'POST', '/analytics/set', 'admin', set);
    expect(again.body).toMatchObject({
      applied: true,
      revision,
      created: [],
      changed: [],
    });
    expect([revisionOf(b), logCount(b)]).toEqual([revision, entries]);
    // Набор этапа 3 — без обёртки eile и группы checks — читается этой Eile.
    const c = await open('c');
    const stage3 = await call(
      c,
      'POST',
      '/analytics/set',
      'admin',
      SUBSCRIPTION
    );
    expect(stage3.body).toMatchObject({ applied: true, errors: {} });
  });

  it('загрузка на сайт с другой настройкой: совпавшие ключи меняются полями файла, остальное остаётся; конфликт — отказ целиком', async () => {
    const a = await sourceSite();
    const set = (await call(a, 'GET', '/analytics/set')).body as AnalyticsSet;
    const shop = await open('shop');
    expect(
      (await call(shop, 'POST', '/analytics/set', 'admin', { sample: 'shop' }))
        .status
    ).toBe(200);
    const before = shop.app.analytics.setup.get();
    // Конфликт: часть метки, на которую ссылается схема магазина, не сменить на справочник вариантов.
    const clash = {
      ...set,
      dictionaries: set.dictionaries?.map((_) =>
        _.code === 'campaign'
          ? { ..._, purpose: 'values', utm: null, length: null, values: [] }
          : _
      ),
    };
    const refused = await call(shop, 'POST', '/analytics/set', 'admin', clash);
    expect([refused.status, codeOf(refused)]).toEqual([
      422,
      'analytics.invalid_set',
    ]);
    const path = `dictionaries[${set.dictionaries!.findIndex((_) => _.code === 'campaign')}]`;
    expect(refused.body.errors[path]).toContain('its purpose stays');
    expect(refused.body.report.applied).toBe(false);
    expect(shop.app.analytics.setup.get()).toEqual(before);
    expect(logCount(shop)).toBe(1);

    const merged = await call(shop, 'POST', '/analytics/set', 'admin', set);
    expect(merged.body).toMatchObject({ applied: true, errors: {} });
    const after = shop.app.analytics.setup.get();
    expect(after.senders.map((_) => _.code)).toEqual(['bot', 'shop']);
    // Части с теми же кодами — названия и пределы из файла, значения магазина остаются рядом со значениями файла.
    expect(after.dictionaries.find((_) => _.code === 'source')).toMatchObject({
      name: 'Источник',
      length: 10,
    });
    expect(
      after.values
        .filter((_) => _.dictionary === 'source')
        .map((_) => _.code)
        .toSorted()
    ).toEqual(
      [
        'direct',
        'facebook',
        'fb',
        'google',
        'ig',
        'instagram',
        'telegram',
        'tg',
      ].toSorted()
    );
    expect(merged.body.kept).toMatchObject({ sender: 1, type: 8 });
    // Основная воронка — одна: воронка файла забрала отметку у воронки магазина, та не в файле.
    expect(after.funnels.map((_) => [_.code, _.main])).toEqual([
      ['journey', true],
      ['path', false],
    ]);
    expect(
      merged.body.changed.find((_: { key: string }) => _.key === 'path')
    ).toMatchObject({ group: 'funnel', fields: ['main'] });
  });

  it('ключом API — проба и выгрузка можно, загрузка — только сеанс; файл с ошибкой — 422 с путями, ничего не применено', async () => {
    const a = await sourceSite();
    const set = (await call(a, 'GET', '/analytics/set', 'key')).body;
    const b = await open('b');
    expect(
      (await call(b, 'POST', '/analytics/set/plan', 'key', set)).status
    ).toBe(200);
    const byKey = await call(b, 'POST', '/analytics/set', 'key', set);
    expect([byKey.status, codeOf(byKey)]).toEqual([
      403,
      'identity.session_required',
    ]);
    const broken = {
      ...set,
      types: [
        ...set.types,
        {
          sender: 'bot',
          code: 'x_type',
          name: 'X',
          role: 'payment',
          properties: [{ code: 'nope' }],
        },
      ],
    };
    const refused = await call(b, 'POST', '/analytics/set', 'admin', broken);
    expect([refused.status, codeOf(refused)]).toEqual([
      422,
      'analytics.invalid_set',
    ]);
    expect(refused.body.errors).toEqual({
      [`types[${set.types.length}]`]: expect.stringContaining('nope'),
    });
    expect([revisionOf(b), logCount(b)]).toEqual([0, 0]);
    expect(b.app.analytics.setup.get().senders).toEqual([]);
    // Не набор — отказ без отчёта.
    const notSet = await call(b, 'POST', '/analytics/set/plan', 'admin', {
      format: 'cms-archive',
    });
    expect([notSet.status, codeOf(notSet)]).toEqual([
      422,
      'analytics.invalid_set',
    ]);
  });

  it('подложенные keys, intake, baseCurrency и rates — ошибки набора: приём, ключи, валюта и курсы не меняются', async () => {
    const a = await sourceSite();
    const set = (await call(a, 'GET', '/analytics/set')).body;
    const b = await open('b');
    const planted = {
      ...set,
      keys: [{ sender: 'bot', keyHash: 'a'.repeat(64), hint: 'abcd' }],
      intake: { enabled: true },
      baseCurrency: 'EUR',
      rates: RATES,
      senders: set.senders.map((_: object) => ({
        ..._,
        key: 'evk_planted',
        enabled: true,
      })),
    };
    const tried = await call(
      b,
      'POST',
      '/analytics/set/plan',
      'admin',
      planted
    );
    // Отправитель с подложенным ключом не создан — элементы на нём тоже называют свою ошибку.
    expect(Object.keys(tried.body.errors)).toEqual(
      expect.arrayContaining([
        'baseCurrency',
        'intake',
        'keys',
        'rates',
        'senders[0]',
      ])
    );
    expect(tried.body.errors['senders[0]']).toContain('unknown field "key"');
    expect(tried.body.errors.keys).toContain('newer Eile');
    const refused = await call(b, 'POST', '/analytics/set', 'admin', planted);
    expect(refused.status).toBe(422);
    expect(b.app.analytics.settings.get()).toMatchObject({
      enabled: false,
      baseCurrency: null,
    });
    expect(rows(b, 'SELECT * FROM analytics_sender_keys')).toEqual([]);
    expect(rows(b, 'SELECT * FROM analytics_rates')).toEqual([]);
    expect([revisionOf(b), logCount(b)]).toEqual([0, 0]);
    // И без подложенного — приём, валюта и ключи остаются как были: набор их не несёт.
    expect(
      (await call(b, 'POST', '/analytics/set', 'admin', set)).body.applied
    ).toBe(true);
    expect(b.app.analytics.settings.get()).toMatchObject({
      enabled: false,
      baseCurrency: null,
    });
    expect(rows(b, 'SELECT * FROM analytics_sender_keys')).toEqual([]);
  });

  it('в выгрузке сайта с данными нет псевдонимов, ключей и их хэшей, сумм, имён и адресов пользователей и адреса сайта', async () => {
    const a = await sourceSite();
    a.app.site.settings.update({ siteUrl: 'https://studio.example.de' });
    const key = await prepare(a, 'bot');
    await money(a);
    await history(a);
    const hashes = rows(a, 'SELECT hash, hint FROM analytics_sender_keys');
    const subjects = rows(
      a,
      'SELECT DISTINCT subject FROM analytics_events WHERE subject IS NOT NULL'
    ).map((_) => _.subject as string);
    expect(subjects.length).toBeGreaterThan(10);
    const exported = (await call(a, 'GET', '/analytics/set')).text;
    for (const secret of [
      ...subjects,
      key,
      key.slice(4),
      'evk_',
      ...hashes.map((_) => _.hash as string),
      'Анна',
      'anna@example.com',
      'studio.example.de',
      'payment_id',
      'amount',
      'pi_',
    ]) {
      expect([secret, exported.includes(secret)]).toEqual([secret, false]);
    }
    const download = await a.app.fetch(
      new Request('http://localhost/manager/api/analytics/set', {
        headers: { cookie: a.admin },
      })
    );
    expect(download.headers.get('content-disposition')).toBe(
      'attachment; filename="eile-analytics-2026-11-15.json"'
    );
    expect(download.headers.get('cache-control')).toBe('no-store');
  });

  it('названия из чужого набора чистятся, как у ручного ввода: без управляющих знаков в настройке и журнале', async () => {
    const b = await open('b');
    const dirty = {
      format: 'eile-analytics-set',
      version: 1,
      name: 'Чужой\u001b[2J',
      senders: [
        {
          code: 'bot',
          name: 'Бот\u0000\u202e\n2',
          note: 'строка\r\nещё\u0007',
        },
      ],
    };
    expect(
      (await call(b, 'POST', '/analytics/set', 'admin', dirty)).body.applied
    ).toBe(true);
    expect(b.app.analytics.setup.get().senders[0]).toMatchObject({
      name: 'Бот 2',
      note: 'строка\nещё',
    });
    const log = (await call(b, 'GET', '/analytics/log')).text;
    expect(log).toContain('"key":"Чужой[2J"');
    expect(log).not.toMatch(/\\u001b|\\u0000|\\u202e|\\u0007/);
  });
});

describe('наборы-образцы', () => {
  it('оба образца на трёх языках ставятся на пустой сайт: коды одни, названия на языке', async () => {
    const exports: Record<string, AnalyticsSet[]> = {};
    for (const sample of ANALYTICS_SAMPLES) {
      for (const language of ['ru', 'en', 'de']) {
        const site = await open(`${sample.code}-${language}`);
        const loaded = await call(site, 'POST', '/analytics/set', 'admin', {
          sample: sample.code,
          language,
        });
        expect([
          sample.code,
          language,
          loaded.status,
          loaded.body.errors,
        ]).toEqual([sample.code, language, 200, {}]);
        expect(loaded.body.name).toBe(sample.title[language as 'ru']);
        // Переходов в образцах нет: адрес назначения у каждого сайта свой.
        expect(site.app.analytics.setup.get().links).toEqual([]);
        exports[sample.code] = [
          ...(exports[sample.code] ?? []),
          (await call(site, 'GET', '/analytics/set')).body,
        ];
      }
    }
    for (const { 0: code, 1: sets } of Object.entries(exports)) {
      const codes = (set: AnalyticsSet) =>
        JSON.stringify(withoutStamp(set), (key, value) =>
          key === 'name' || key === 'note' ? undefined : value
        );
      expect([code, new Set(sets.map(codes)).size]).toEqual([code, 1]);
      expect([code, new Set(sets.map((_) => _.types?.[0]?.name)).size]).toEqual(
        [code, 3]
      );
    }
  });

  it('GET /analytics/set/samples — на языке запроса; язык из тела важнее; незнакомый образец — 404', async () => {
    const site = await open('s');
    const listed = await call(
      site,
      'GET',
      '/analytics/set/samples',
      'key',
      undefined,
      'de'
    );
    expect(listed.body.map((_: { code: string }) => _.code)).toEqual([
      'subscription',
      'shop',
    ]);
    expect(listed.body[1]).toMatchObject({
      code: 'shop',
      title: 'Onlineshop',
      counts: { sender: 1, type: 8, milestone: 1, funnel: 1 },
    });
    expect(listed.body[1].counts.link).toBeUndefined();
    const plan = await call(
      site,
      'POST',
      '/analytics/set/plan',
      'admin',
      { sample: 'subscription', language: 'en' },
      'de'
    );
    expect(plan.body.name).toBe('Subscription');
    const missing = await call(site, 'POST', '/analytics/set/plan', 'admin', {
      sample: 'cafe',
    });
    expect([missing.status, codeOf(missing)]).toEqual([
      404,
      'analytics.sample_not_found',
    ]);
    const wrong = await call(site, 'POST', '/analytics/set/plan', 'admin', {
      sample: 'shop',
      language: 'fr',
    });
    expect([wrong.status, codeOf(wrong)]).toEqual([
      422,
      'analytics.invalid_set',
    ]);
  });

  it('«Магазин»: события через приёмник, «Источники» без пробного периода и продления — цифры ручной таблицы', async () => {
    const site = await open('shop');
    site.app.stats.settings.save({ timeZone: 'Europe/Berlin' });
    expect(
      (
        await call(site, 'POST', '/analytics/set', 'admin', {
          sample: 'shop',
          language: 'ru',
        })
      ).body.applied
    ).toBe(true);
    const key = await prepare(site, 'shop');
    const lines = (await Bun.file(SHOP).text()).trim().split('\n');
    for (const line of lines) {
      expect([line.slice(0, 16), await send(site, key, line)]).toEqual([
        line.slice(0, 16),
        200,
      ]);
    }
    const report = (
      await call(
        site,
        'GET',
        '/analytics/sources?from=2026-10-01&to=2026-10-31&group=part:source'
      )
    ).body;
    expect(report.columns).toEqual([
      { kind: 'people' },
      { kind: 'milestone', code: 'cart', name: 'Корзина' },
      { kind: 'payment' },
      { kind: 'customers' },
      { kind: 'revenue' },
      { kind: 'perCustomer' },
      { kind: 'ltvCustomer' },
      { kind: 'ltvPerson' },
    ]);
    const share = (count: number, base: number) => ({ count, base, open: 0 });
    const line = (_: any) => [
      _.value,
      _.people,
      _.milestones.cart,
      _.payment,
      _.customers,
      _.revenue,
      _.perCustomer,
      _.ltvCustomer.value,
      _.ltvPerson.value,
      _.trial,
      _.renewal,
    ];
    // Ручная таблица октября: C1 и C2 — Instagram платный (C2 вернул заказ), C3 — Google без оплаты, C4 —
    // Facebook, C5 — без метки, C6 — незнакомый источник и оплата в ноябре, вне окна в 30 дней; C7 стёрт.
    // Корзина в первые сутки — C1 и C3; LTV клиента — выручка клиентов до сегодня на клиента, человека — на человека.
    expect(line(report.total)).toEqual([
      '',
      6,
      share(2, 6),
      share(3, 6),
      3,
      { EUR: 6550 },
      { payments: 4, customers: 3 },
      Math.round(6550 / 3),
      Math.round((5000 + 1550 + 2500) / 6),
      null,
      null,
    ]);
    expect(report.rows.map(line)).toEqual([
      [
        'instagram',
        2,
        share(1, 2),
        share(2, 2),
        2,
        { EUR: 5000 },
        { payments: 3, customers: 2 },
        2500,
        2500,
        null,
        null,
      ],
      [
        'facebook',
        1,
        share(0, 1),
        share(1, 1),
        1,
        { EUR: 1550 },
        { payments: 1, customers: 1 },
        1550,
        1550,
        null,
        null,
      ],
      [
        'google',
        1,
        share(1, 1),
        share(0, 1),
        0,
        {},
        { payments: 0, customers: 0 },
        null,
        0,
        null,
        null,
      ],
      [
        '~unknown',
        1,
        share(0, 1),
        share(0, 1),
        0,
        {},
        { payments: 0, customers: 0 },
        null,
        2500,
        null,
        null,
      ],
      [
        '~none',
        1,
        share(0, 1),
        share(0, 1),
        0,
        {},
        { payments: 0, customers: 0 },
        null,
        0,
        null,
        null,
      ],
    ]);
    const people = (await call(site, 'GET', '/analytics/people')).body.people;
    expect(people.map((_: { subject: string }) => _.subject)).not.toContain(
      'u_shop_c07'
    );
    expect(people).toHaveLength(6);
  });
});
