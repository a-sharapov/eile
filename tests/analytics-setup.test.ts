import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import {
  type SetupAuthor,
  setErrorsOf,
} from '../src/contexts/analytics/index.ts';
import { can } from '../src/contexts/identity/index.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';
import { DEMO } from './fixtures/demo.ts';

const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };
const AT = '2026-11-25T10:00:00.000Z';

let dir: string;
let app: App;
let now: Date;

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

// Вторым подключением, как другой процесс: ключи, события и люди появятся в следующих частях.
const sql = (path: string, statement: string, ...values: string[]): void => {
  const db = new Database(path);
  db.run(statement, values);
  db.close();
};

const count = (path: string, table: string): number => {
  const db = new Database(path, { readonly: true });
  const { n } = db
    .query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`)
    .get()!;
  db.close();
  return n;
};

const addKey = (path: string, sender: string): void =>
  sql(
    path,
    'INSERT INTO analytics_sender_keys (sender, label, hash, hint, created_at) VALUES (?, ?, ?, ?, ?)',
    sender,
    'Ключ',
    crypto.randomUUID(),
    'abcd',
    AT
  );

const addPerson = (path: string, subject: string): void =>
  sql(
    path,
    `INSERT INTO analytics_people (subject, test, senders, first_at, last_at, events, invalid, arrived_at,
      first_touch_conflict, first_parts, last_parts, returns, answers, payments, revenue, fees, money,
      fee_money, access, milestones, firsts, dims, traits, revision)
     VALUES (?, 0, '[]', ?, ?, 1, 0, ?, 0, '{}', '{}', '[]', '{}', 0, '{}', '{}', '[]', '[]', '[]', '{}', '{}',
      '{}', '{}', 1)`,
    subject,
    AT,
    AT,
    AT
  );

const addEvent = (path: string, sender: string, type: string): void =>
  sql(
    path,
    `INSERT INTO analytics_events (sender, id, type, at, subject, received_at, origin, body, hash)
     VALUES (?, ?, ?, ?, 'u_3b9e0c7a1f', ?, 'http', '{}', 'hash')`,
    sender,
    crypto.randomUUID(),
    type,
    AT,
    AT
  );

const siteDb = (): string => join(dir, 'site.db');

const open = (path: string): App =>
  createApp({
    databasePath: path,
    mediaCache: `${path}.cache`,
    clock: () => now,
  });

const accept = (target: App, body: Record<string, unknown>) =>
  target.analytics.intake.accept('bot', JSON.stringify(body), 'http');

const summary = (id: string, day: string, at: string, version: string) => ({
  id,
  type: 'daily_summary',
  at,
  data: { day, counts: { purchase: 1 }, version },
});

// База, какой её оставил Eile этапа 3: без счёта приёма и стёртого, часа сводки и индекса номера оплаты.
const downgradeStage3 = (path: string): void => {
  const db = new Database(path);
  db.transaction(() => {
    db.run('DROP INDEX analytics_events_payment');
    db.run('DROP TABLE analytics_intake_daily');
    db.run('DROP TABLE analytics_erased_daily');
    db.run('ALTER TABLE analytics_senders DROP COLUMN summary_at');
    db.run("DELETE FROM _migrations WHERE id = 'analytics/007_intake'");
  })();
  db.close();
};

// База, какой её оставил Eile этапа 4 части 1: без проверок, строк дней, курсора такта и отпечатков стёртого.
const downgradeStage4 = (path: string): void => {
  const db = new Database(path);
  db.transaction(() => {
    db.run('DROP TABLE analytics_checks');
    db.run('DROP TABLE analytics_check_days');
    db.run('DROP TABLE analytics_quality_cursor');
    db.run('DROP TABLE analytics_erased_events');
    db.run("DELETE FROM _migrations WHERE id = 'analytics/008_quality'");
  })();
  db.close();
};

beforeEach(() => {
  now = new Date(AT);
  dir = mkdtempSync(join(tmpdir(), 'cms-analytics-'));
  app = createApp({
    databasePath: siteDb(),
    mediaCache: join(dir, 'cache'),
    clock: () => now,
  });
});

afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('набор «Подписка»', () => {
  it('применяется на пустой сайт целиком: одна ревизия, одна строка журнала', () => {
    expect(app.analytics.setup.get().revision).toBe(0);
    expect(app.analytics.setup.apply(SUBSCRIPTION, ANNA)).toEqual({
      name: 'Подписка (сайт-образец)',
      revision: 1,
      created: 63,
      changed: 0,
    });
    const setup = app.analytics.setup.get();
    expect(setup.senders.map((_) => _.code)).toEqual(['bot']);
    expect(setup.types).toHaveLength(10);
    expect(setup.types.find((_) => _.code === 'purchase')).toMatchObject({
      role: 'payment',
      properties: [
        { code: 'plan', required: true },
        { code: 'format', required: true },
      ],
    });
    expect(
      setup.properties.map((_) => `${_.scope}/${_.code}/${_.kind}`)
    ).toEqual([
      'event/format/choice',
      'event/items_n/number',
      'event/own_material/boolean',
      'event/plan/choice',
      'person/lang/choice',
    ]);
    expect(
      setup.values
        .filter((_) => _.dictionary === 'heard_from')
        .map((_) => _.code)
    ).toEqual([
      'ig-reels',
      'ig-posts',
      'ig-ads',
      'friend',
      'blogger',
      'search',
      'tg',
      'other',
    ]);
    expect(
      app.analytics.log.setup().map((_) => [_.item, _.key, _.action, _.author])
    ).toEqual([['set', 'Подписка (сайт-образец)', 'applied', ANNA]]);
    expect(app.analytics.setup.roles().map((_) => _.role)).toHaveLength(10);
  });

  it('группы этапа 2: части, схема bot, соответствия, переход, веха и воронка — в базе и в строке журнала', () => {
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    const setup = app.analytics.setup.get();
    expect(
      setup.dictionaries
        .filter((_) => _.purpose === 'parts')
        .map((_) => [_.code, _.utm, _.length])
    ).toEqual([
      ['campaign', 'utm_campaign', 16],
      ['channel', 'utm_medium', 8],
      ['creative', 'utm_content', 10],
      ['entry', null, 10],
      ['source', 'utm_source', 10],
    ]);
    expect(setup.dictionaries.find((_) => _.code === 'plan')).toMatchObject({
      utm: null,
      length: null,
    });
    expect(setup.schemas).toEqual([
      {
        sender: 'bot',
        name: 'Метка start-параметра',
        note: '',
        separator: '__',
        length: 64,
        parts: ['entry', 'source', 'channel', 'campaign', 'creative'],
        archivedAt: null,
      },
    ]);
    expect(setup.referrers.map((_) => [_.code, _.kind, _.host])).toEqual([
      ['google', 'host', 'google.*'],
      ['instagram', 'host', 'instagram.com'],
      ['no-referrer', 'none', null],
      ['other-sites', 'any', null],
    ]);
    expect(setup.links).toEqual([
      expect.objectContaining({
        code: 'trial',
        sender: 'bot',
        target: 'https://t.me/sample_subscription_bot?start={label}',
        parts: { entry: 'w-trial' },
      }),
    ]);
    expect(setup.milestones).toEqual([
      expect.objectContaining({
        code: 'activation',
        type: 'task_done',
        count: 1,
        condition: { property: 'items_n', gte: 2 },
        days: 3,
        anchor: null,
        column: true,
        position: 0,
      }),
    ]);
    expect(setup.funnels[0]).toMatchObject({
      code: 'journey',
      main: true,
      strict: false,
    });
    expect(setup.funnels[0]!.steps.map((_) => _.kind)).toEqual([
      'visits',
      'goal',
      'arrival',
      'trial',
      'milestone',
      'payment',
      'payment',
    ]);
    // Набор — одна строка: было пусто, стало — элементы по группам.
    const { after } = app.analytics.log.setup()[0]! as {
      after: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(after).toSorted()).toEqual([
      'dictionary',
      'funnel',
      'link',
      'milestone',
      'property',
      'referrer',
      'schema',
      'sender',
      'type',
      'value',
    ]);
    expect(Object.keys(after.schema!)).toEqual(['bot']);
    expect(Object.keys(after.value!)).toContain('source/ig');
    for (const [table, rows] of [
      ['analytics_schemas', 1],
      ['analytics_referrers', 4],
      ['analytics_links', 1],
      ['analytics_milestones', 1],
      ['analytics_funnels', 1],
    ] as const) {
      expect([table, count(siteDb(), table)]).toEqual([table, rows]);
    }
  });

  it('повторное применение ничего не ломает: ни ревизии, ни журнала; чужие элементы остаются', () => {
    app.analytics.setup.apply(SUBSCRIPTION);
    const first = app.analytics.setup.get();
    expect(app.analytics.setup.apply(SUBSCRIPTION)).toMatchObject({
      revision: 1,
      created: 0,
      changed: 0,
    });
    expect(app.analytics.setup.get()).toEqual(first);
    expect(app.analytics.log.setup()).toHaveLength(1);

    app.analytics.setup.save('value', {
      dictionary: 'plan',
      code: '12m',
      name: '12 месяцев',
    });
    const renamed = {
      ...SUBSCRIPTION,
      senders: [{ code: 'bot', name: 'Бот подписки в Telegram' }],
    };
    expect(app.analytics.setup.apply(renamed)).toMatchObject({
      revision: 3,
      created: 0,
      changed: 1,
    });
    const setup = app.analytics.setup.get();
    expect(setup.senders[0]!.name).toBe('Бот подписки в Telegram');
    expect(
      setup.values.filter((_) => _.dictionary === 'plan').map((_) => _.code)
    ).toEqual(['1m', '3m', '12m']);
  });

  it('набор с ошибками не применяется ни в чём', () => {
    const broken = {
      ...SUBSCRIPTION,
      types: [
        ...SUBSCRIPTION.types!,
        {
          sender: 'bot',
          code: 'gift_sent',
          name: 'Подарок',
          role: 'action' as const,
          properties: [{ code: 'gift_size' }],
        },
      ],
    };
    const error = attempt(
      () => (app.analytics.setup.apply(broken), null),
      (_) => _
    );
    expect(code(() => app.analytics.setup.apply(broken))).toBe(
      'analytics.invalid_set'
    );
    expect(Object.keys(setErrorsOf(error))).toEqual(['types[10]']);
    expect(app.analytics.setup.get()).toMatchObject({
      revision: 0,
      senders: [],
      types: [],
      values: [],
    });
    expect(app.analytics.log.setup()).toEqual([]);
    expect(count(siteDb(), 'analytics_values')).toBe(0);
  });
});

describe('правка настройки', () => {
  beforeEach(() => void app.analytics.setup.apply(SUBSCRIPTION));

  it('создать, изменить, в архив и обратно, удалить — каждое в журнал с автором и ревизией', () => {
    const agent: SetupAuthor = { ...ANNA, agent: true };
    app.analytics.setup.save(
      'value',
      { dictionary: 'heard_from', code: 'podcast', name: 'Подкаст' },
      agent
    );
    now = new Date('2026-11-26T09:00:00.000Z');
    expect(
      app.analytics.setup.archive(
        'value',
        { dictionary: 'heard_from', code: 'podcast' },
        true,
        ANNA
      )
    ).toMatchObject({ archivedAt: '2026-11-26T09:00:00.000Z' });
    app.analytics.setup.archive(
      'value',
      { dictionary: 'heard_from', code: 'podcast' },
      false,
      ANNA
    );
    app.analytics.setup.remove(
      'value',
      { dictionary: 'heard_from', code: 'podcast' },
      ANNA
    );
    expect(app.analytics.setup.get().revision).toBe(5);
    const log = app.analytics.log.setup();
    expect(log.map((_) => [_.key, _.action, _.author?.agent])).toEqual([
      ['heard_from/podcast', 'removed', false],
      ['heard_from/podcast', 'restored', false],
      ['heard_from/podcast', 'archived', false],
      ['heard_from/podcast', 'created', true],
      ['Подписка (сайт-образец)', 'applied', undefined],
    ]);
    expect(log[0]!.before).toMatchObject({ name: 'Подкаст' });
    expect(log[0]!.after).toBeNull();
    expect(
      app.analytics.log
        .setup({ before: log[1]!.id, limit: 2 })
        .map((_) => _.action)
    ).toEqual(['archived', 'created']);
  });

  it('удалить нельзя то, на что ссылаются элементы или события', () => {
    expect(
      code(() => app.analytics.setup.remove('sender', { code: 'bot' }))
    ).toBe('analytics.in_use');
    expect(
      code(() =>
        app.analytics.setup.remove('property', { scope: 'event', code: 'plan' })
      )
    ).toBe('analytics.in_use');
    addEvent(siteDb(), 'bot', 'bot_start');
    expect(
      code(() =>
        app.analytics.setup.remove('type', { sender: 'bot', code: 'bot_start' })
      )
    ).toBe('analytics.in_use');
    app.analytics.setup.remove('type', { sender: 'bot', code: 'fee_settled' });
    expect(app.analytics.setup.get().types.map((_) => _.code)).not.toContain(
      'fee_settled'
    );
    expect(
      code(() =>
        app.analytics.setup.remove('type', {
          sender: 'bot',
          code: 'fee_settled',
        })
      )
    ).toBe('analytics.item_not_found');
  });

  it('удалённый отправитель уносит свои ключи; с событиями — только архив', () => {
    app.analytics.setup.save('sender', { code: 'shop', name: 'Магазин' });
    addKey(siteDb(), 'shop');
    addKey(siteDb(), 'bot');
    app.analytics.setup.remove('sender', { code: 'shop' });
    expect(count(siteDb(), 'analytics_sender_keys')).toBe(1);
    app.analytics.setup.save('sender', { code: 'app', name: 'Приложение' });
    addEvent(siteDb(), 'app', 'opened');
    expect(
      code(() => app.analytics.setup.remove('sender', { code: 'app' }))
    ).toBe('analytics.in_use');
  });

  it('группы этапа 2: правка, архив, удаление — в журнал; занятое — только в архив', () => {
    app.analytics.setup.save(
      'milestone',
      {
        code: 'two-tasks',
        name: 'Два задания',
        sender: 'bot',
        type: 'task_done',
        count: 2,
      },
      ANNA
    );
    expect(
      app.analytics.setup.save('funnel', {
        code: 'short',
        name: 'Короткая',
        main: true,
        steps: [{ kind: 'arrival' }, { kind: 'payment', number: 1 }],
      })
    ).toMatchObject({ main: true, position: 1 });
    expect(
      app.analytics.setup.get().funnels.map((_) => [_.code, _.main])
    ).toEqual([
      ['journey', false],
      ['short', true],
    ]);
    expect(
      app.analytics.log
        .setup({ limit: 3 })
        .map((_) => [_.item, _.key, _.action])
    ).toEqual([
      ['funnel', 'short', 'created'],
      ['funnel', 'journey', 'changed'],
      ['milestone', 'two-tasks', 'created'],
    ]);
    for (const [group, key] of [
      ['type', { sender: 'bot', code: 'task_done' }],
      ['schema', { sender: 'bot' }],
      ['dictionary', { code: 'source' }],
      ['value', { dictionary: 'entry', code: 'w-trial' }],
      ['milestone', { code: 'activation' }],
    ] as const) {
      expect([
        group,
        code(() => app.analytics.setup.remove(group, key)),
      ]).toEqual([group, 'analytics.in_use']);
    }
    expect(
      app.analytics.setup.archive('link', { code: 'trial' }, true, ANNA)
    ).toMatchObject({ code: 'trial', archivedAt: AT });
    app.analytics.setup.remove('referrer', { code: 'google' }, ANNA);
    app.analytics.setup.remove('funnel', { code: 'short' }, ANNA);
    app.analytics.setup.remove('milestone', { code: 'two-tasks' }, ANNA);
    expect(
      app.analytics.setup.get().referrers.map((_) => _.code)
    ).not.toContain('google');
    expect(
      app.analytics.log
        .setup({ limit: 4 })
        .map((_) => [_.item, _.key, _.action])
    ).toEqual([
      ['milestone', 'two-tasks', 'removed'],
      ['funnel', 'short', 'removed'],
      ['referrer', 'google', 'removed'],
      ['link', 'trial', 'archived'],
    ]);
    expect(app.analytics.setup.get().revision).toBe(7);
  });

  it('выключатель приёма по умолчанию выключен; смена — в журнал', () => {
    expect(app.analytics.settings.get()).toEqual({
      enabled: false,
      retentionMonths: 0,
      baseCurrency: null,
    });
    app.analytics.settings.save({ enabled: true, retentionMonths: 36 }, ANNA);
    app.analytics.settings.save({ enabled: true });
    expect(app.analytics.settings.get()).toEqual({
      enabled: true,
      retentionMonths: 36,
      baseCurrency: null,
    });
    expect(app.analytics.setup.get().revision).toBe(1);
    expect(app.analytics.log.setup()[0]).toMatchObject({
      item: 'settings',
      action: 'changed',
      author: ANNA,
      before: { enabled: false },
      after: { enabled: true, retentionMonths: 36 },
    });
    expect(app.analytics.log.setup()).toHaveLength(2);
  });

  it('права: люди и настройка аналитики — только у администратора', () => {
    expect(can('admin', 'analytics.read')).toBe(true);
    expect(can('admin', 'analytics.edit')).toBe(true);
    expect(can('editor', 'analytics.read')).toBe(false);
    expect(can('editor', 'analytics.edit')).toBe(false);
  });

  it('правка аналитики кэш страниц сайта не сбрасывает', async () => {
    const site = createApp({ scaffold: DEMO });
    const get = () => site.fetch(new Request('http://localhost/kontakty'));
    expect((await get()).headers.get('x-cache')).toBe('miss');
    site.analytics.setup.apply(SUBSCRIPTION);
    site.analytics.setup.save('sender', { code: 'bot', name: 'Бот' });
    site.analytics.settings.save({ enabled: true });
    expect((await get()).headers.get('x-cache')).toBe('hit');
    site.close();
  });
});

describe('копия сайта', () => {
  let other: App;
  const otherDb = (): string => join(dir, 'other.db');

  beforeEach(() => {
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.settings.save({ enabled: true });
    addKey(siteDb(), 'bot');
    addPerson(siteDb(), 'u_3b9e0c7a1f');
    other = createApp({
      databasePath: otherDb(),
      mediaCache: join(dir, 'other-cache'),
    });
    addKey(otherDb(), 'bot');
    addPerson(otherDb(), 'u_77aa00');
  });

  afterEach(() => other.close());

  // Схемы, соответствия, переходы, вехи и воронки — данные сайта, как справочники.
  const STAGE2 = [
    ['analytics_schemas', 1],
    ['analytics_referrers', 4],
    ['analytics_links', 1],
    ['analytics_milestones', 1],
    ['analytics_funnels', 1],
  ] as const;

  it('копия .db: настройка и журнал — в ней, ключей нет, люди — как есть', () => {
    const target = join(dir, 'copy.db');
    app.backup(target);
    expect(count(target, 'analytics_types')).toBe(10);
    expect(count(target, 'analytics_setup_log')).toBe(2);
    expect(count(target, 'analytics_sender_keys')).toBe(0);
    expect(count(target, 'analytics_people')).toBe(1);
    for (const [table, rows] of STAGE2) {
      expect([table, count(target, table)]).toEqual([table, rows]);
    }
    const archive = app.archive();
    const tables = Object.keys(archive.tables);
    expect(tables).toContain('analytics_types');
    expect(tables).toContain('analytics_settings');
    for (const [table, rows] of STAGE2) {
      expect([table, archive.tables[table]?.length]).toEqual([table, rows]);
    }
    expect(
      (
        archive.tables.analytics_dictionaries as Record<string, unknown>[]
      ).filter((_) => _.code === 'source')
    ).toEqual([expect.objectContaining({ utm: 'utm_source', length: 10 })]);
    expect(tables).not.toContain('analytics_sender_keys');
    expect(tables).not.toContain('analytics_people');
    expect(tables).not.toContain('analytics_people_build');
  });

  it('восстановление из .db: настройка как в копии, свои ключи остались, люди очищены', async () => {
    const target = join(dir, 'copy.db');
    app.backup(target);
    await other.restore(await Bun.file(target).bytes());
    expect(other.analytics.setup.get()).toEqual(app.analytics.setup.get());
    expect(other.analytics.setup.get().funnels[0]?.code).toBe('journey');
    expect(other.analytics.settings.get().enabled).toBe(true);
    expect(other.analytics.log.setup()).toHaveLength(2);
    expect(count(otherDb(), 'analytics_sender_keys')).toBe(1);
    expect(count(otherDb(), 'analytics_people')).toBe(0);
  });

  it('восстановление из JSON: то же самое', async () => {
    await other.restore(
      new TextEncoder().encode(JSON.stringify(app.archive()))
    );
    expect(other.analytics.setup.get()).toEqual(app.analytics.setup.get());
    expect(other.analytics.setup.get().schemas[0]?.parts).toHaveLength(5);
    expect(count(otherDb(), 'analytics_sender_keys')).toBe(1);
    expect(count(otherDb(), 'analytics_people')).toBe(0);
  });

  it('счёт приёма и стёртого, час сводки — данные сайта: в копии .db, в JSON-копии и в восстановлении', async () => {
    app.analytics.senders.save({ code: 'bot', summaryAt: '03:30' });
    sql(
      siteDb(),
      "INSERT INTO analytics_intake_daily VALUES ('2026-11-24', 'bot', 'http', 'accepted', 12), ('2026-11-24', '', 'http', 'unauthorized', 3)"
    );
    sql(
      siteDb(),
      "INSERT INTO analytics_erased_daily VALUES ('2026-11-24', 'bot', 'purchase', 0, 2)"
    );
    const target = join(dir, 'copy.db');
    app.backup(target);
    expect(count(target, 'analytics_intake_daily')).toBe(2);
    expect(count(target, 'analytics_erased_daily')).toBe(1);
    const archive = app.archive();
    expect(archive.tables.analytics_intake_daily).toHaveLength(2);
    expect(archive.tables.analytics_erased_daily).toHaveLength(1);
    const daily = app.analytics.intake.daily({
      from: '2026-11-24',
      to: '2026-11-24',
    }).days;
    expect(daily).toHaveLength(2);
    // Свой счёт отказов в памяти восстановление не переносит: он — этого сервера до восстановления.
    await other.restore(await Bun.file(target).bytes());
    expect(
      other.analytics.intake.daily({ from: '2026-11-24', to: '2026-11-24' })
        .days
    ).toEqual(daily);
    expect(other.analytics.setup.get().senders[0]?.summaryAt).toBe('03:30');
    expect(count(otherDb(), 'analytics_erased_daily')).toBe(1);
    sql(otherDb(), 'DELETE FROM analytics_intake_daily');
    sql(otherDb(), 'DELETE FROM analytics_erased_daily');
    await other.restore(new TextEncoder().encode(JSON.stringify(archive)));
    expect(
      other.analytics.intake.daily({ from: '2026-11-24', to: '2026-11-24' })
        .days
    ).toEqual(daily);
    expect(count(otherDb(), 'analytics_erased_daily')).toBe(1);
  });
});

describe('этап 4: час сводки и счёт приёма', () => {
  it('час сводки: у нового отправителя 06:00; правка — в журнал, правка без изменений — нет; негодный — отказ', () => {
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    expect(app.analytics.setup.get().senders[0]?.summaryAt).toBe('06:00');
    const revision = app.analytics.setup.get().revision;
    expect(
      app.analytics.senders.save({ code: 'bot', summaryAt: '03:30' }, ANNA)
        .sender.summaryAt
    ).toBe('03:30');
    expect(app.analytics.log.setup()[0]).toMatchObject({
      item: 'sender',
      key: 'bot',
      action: 'changed',
      before: { summaryAt: '06:00' },
      after: { summaryAt: '03:30' },
    });
    app.analytics.senders.save({ code: 'bot', summaryAt: '03:30' }, ANNA);
    expect(app.analytics.setup.get().revision).toBe(revision + 1);
    expect(
      code(() => app.analytics.senders.save({ code: 'bot', summaryAt: '3:30' }))
    ).toBe('analytics.invalid_item');
    expect(
      app.analytics.senders.save({
        code: 'shop',
        name: 'Магазин',
        summaryAt: null,
      }).sender.summaryAt
    ).toBeNull();
    // Из базы — то же, что в снимке.
    app.close();
    app = open(siteDb());
    expect(
      app.analytics.setup.get().senders.map((_) => [_.code, _.summaryAt])
    ).toEqual([
      ['bot', '03:30'],
      ['shop', null],
    ]);
  });

  it('обновление: база этапа 3 без миграции 007 — час сводки 06:00, таблицы счёта, индекс номера оплаты; приём и «Обзор» работают; копии до 007 восстанавливаются', async () => {
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.settings.save({ enabled: true }, ANNA);
    app.analytics.senders.save({ code: 'bot', summaryAt: null }, ANNA);
    expect(
      accept(app, {
        id: 'evt_1',
        type: 'purchase',
        at: '2026-11-24T10:00:00Z',
        subject: 'u_3b9e0c7a1f',
        data: {
          amount: '19.00',
          currency: 'EUR',
          payment_id: 'pi_1',
          plan: '1m',
          format: 'self',
        },
      }).kind
    ).toBe('accepted');
    accept(
      app,
      summary('sum_24', '2026-11-24', '2026-11-25T03:00:00Z', '1.4.2')
    );
    app.close();
    downgradeStage3(siteDb());
    const old = join(dir, 'stage3.db');
    copyFileSync(siteDb(), old);

    app = open(siteDb());
    // Час сводки у отправителей до обновления — 06:00, даже если раньше его «не было».
    expect(app.analytics.setup.get().senders[0]?.summaryAt).toBe('06:00');
    expect(count(siteDb(), 'analytics_intake_daily')).toBe(0);
    expect(count(siteDb(), 'analytics_erased_daily')).toBe(0);
    const raw = new Database(siteDb(), { readonly: true });
    expect(
      raw
        .query<{ detail: string }, [string, string]>(`
          EXPLAIN QUERY PLAN SELECT seq FROM analytics_events
          WHERE sender = ? AND json_extract(body, '$.data.payment_id') = ?`)
        .all('bot', 'pi_1')
        .map((_) => _.detail)
        .join()
    ).toContain('analytics_events_payment');
    raw.close();
    accept(
      app,
      summary('sum_25', '2026-11-25', '2026-11-25T09:00:00Z', '1.5.0')
    );
    expect(app.analytics.intake.daily().days).toEqual([
      {
        day: '2026-11-25',
        sender: 'bot',
        origin: 'http',
        outcome: 'accepted',
        count: 1,
      },
    ]);
    const marks = [
      {
        day: '2026-11-25',
        sender: 'bot',
        name: 'Бот подписки',
        from: '1.4.2',
        to: '1.5.0',
        matched: null,
      },
    ];
    expect(app.analytics.reports.overview().versions).toEqual(marks);
    expect(app.analytics.reports.overview().current).toMatchObject({
      people: 1,
      customers: 1,
    });

    // Копия .db, сделанная до обновления: миграция 007 доходит и до неё.
    await app.restore(await Bun.file(old).bytes());
    expect(app.analytics.setup.get().senders[0]?.summaryAt).toBe('06:00');
    expect(app.analytics.intake.daily().days).toEqual([]);
    expect(app.analytics.reports.overview().versions).toEqual([]);
    accept(
      app,
      summary('sum_25', '2026-11-25', '2026-11-25T09:00:00Z', '1.5.0')
    );
    expect(app.analytics.reports.overview().versions).toEqual(marks);
    // JSON-копия до 007: без таблиц счёта и без часа сводки у отправителя.
    const archive = app.archive();
    const { analytics_intake_daily, analytics_erased_daily, ...tables } =
      archive.tables;
    expect(analytics_intake_daily).toHaveLength(1);
    expect(analytics_erased_daily).toEqual([]);
    await app.restore(
      new TextEncoder().encode(
        JSON.stringify({
          ...archive,
          migrations: archive.migrations.filter(
            (_: string) => _ !== 'analytics/007_intake'
          ),
          tables: {
            ...tables,
            analytics_senders: (
              tables.analytics_senders as Record<string, unknown>[]
            ).map(({ summary_at: _, ...sender }) => sender),
          },
        })
      )
    );
    expect(app.analytics.setup.get().senders[0]?.summaryAt).toBe('06:00');
    expect(app.analytics.intake.daily().days).toEqual([]);
    expect(app.analytics.reports.overview().versions).toEqual(marks);
  });
});

describe('этап 4: проверки данных в базе', () => {
  it('поправки проверок, строки дней и отпечатки стёртого — данные сайта: в копии .db, JSON-копии и восстановлении; курсор такта — производный', async () => {
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.settings.save({ enabled: true }, ANNA);
    app.analytics.setup.save(
      'check',
      { code: 'events_arrived', params: { missing: 1 } },
      ANNA
    );
    accept(
      app,
      summary('sum_24', '2026-11-24', '2026-11-25T03:00:00Z', '1.4.2')
    );
    now = new Date('2026-11-26T07:00:00.000Z');
    expect(app.analytics.quality.tick().steps).toBeGreaterThan(0);
    sql(
      siteDb(),
      "INSERT INTO analytics_erased_events VALUES ('bot', 'fingerprint', '2026-11-24')"
    );
    const target = join(dir, 'copy.db');
    app.backup(target);
    expect(count(target, 'analytics_checks')).toBe(1);
    const days = count(target, 'analytics_check_days');
    expect(days).toBeGreaterThan(0);
    expect(count(target, 'analytics_quality_cursor')).toBe(1);
    expect(count(target, 'analytics_erased_events')).toBe(1);
    const archive = app.archive();
    expect(archive.tables.analytics_checks).toHaveLength(1);
    expect(archive.tables.analytics_check_days).toHaveLength(days);
    expect(archive.tables.analytics_erased_events).toHaveLength(1);
    expect(Object.keys(archive.tables)).not.toContain(
      'analytics_quality_cursor'
    );
    const other = createApp({
      databasePath: join(dir, 'other.db'),
      mediaCache: join(dir, 'other-cache'),
      clock: () => now,
    });
    try {
      await other.restore(await Bun.file(target).bytes());
      expect(other.analytics.setup.get().checks).toEqual(
        app.analytics.setup.get().checks
      );
      expect(count(join(dir, 'other.db'), 'analytics_check_days')).toBe(days);
      expect(count(join(dir, 'other.db'), 'analytics_erased_events')).toBe(1);
      // Курсор после восстановления очищен: такт перепроверит 30 суток.
      expect(count(join(dir, 'other.db'), 'analytics_quality_cursor')).toBe(0);
      await other.restore(new TextEncoder().encode(JSON.stringify(archive)));
      expect(count(join(dir, 'other.db'), 'analytics_check_days')).toBe(days);
      expect(count(join(dir, 'other.db'), 'analytics_quality_cursor')).toBe(0);
      expect(other.analytics.quality.tick().steps).toBeGreaterThan(0);
    } finally {
      other.close();
    }
  });

  it('обновление: база этапа 4 части 1 без миграции 008 — таблицы проверок, такт и поправка работают; копии до 008 восстанавливаются', async () => {
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.settings.save({ enabled: true }, ANNA);
    accept(
      app,
      summary('sum_24', '2026-11-24', '2026-11-25T03:00:00Z', '1.4.2')
    );
    app.close();
    downgradeStage4(siteDb());
    const old = join(dir, 'stage4-part1.db');
    copyFileSync(siteDb(), old);

    app = open(siteDb());
    expect(app.analytics.setup.get().checks).toEqual([]);
    for (const table of [
      'analytics_checks',
      'analytics_check_days',
      'analytics_quality_cursor',
      'analytics_erased_events',
    ]) {
      expect([table, count(siteDb(), table)]).toEqual([table, 0]);
    }
    now = new Date('2026-11-26T07:00:00.000Z');
    expect(app.analytics.quality.tick().steps).toBeGreaterThan(0);
    expect(
      app.analytics.quality
        .report({ days: 3 })
        .rows.find((_) => _.check === 'summary_arrived')?.cells[0]
    ).toMatchObject({ day: '2026-11-24', state: 'ok' });
    app.analytics.setup.save(
      'check',
      { code: 'summary_arrived', notify: 'off' },
      ANNA
    );
    // Копия .db, сделанная до обновления: миграция 008 доходит и до неё.
    await app.restore(await Bun.file(old).bytes());
    expect(app.analytics.setup.get().checks).toEqual([]);
    expect(count(siteDb(), 'analytics_check_days')).toBe(0);
    expect(app.analytics.quality.tick().steps).toBeGreaterThan(0);
    // JSON-копия до 008: без таблиц проверок.
    const archive = app.archive();
    const {
      analytics_checks: _checks,
      analytics_check_days,
      analytics_erased_events: _erased,
      ...tables
    } = archive.tables;
    expect(analytics_check_days?.length).toBeGreaterThan(0);
    await app.restore(
      new TextEncoder().encode(
        JSON.stringify({
          ...archive,
          migrations: archive.migrations.filter(
            (_: string) => _ !== 'analytics/008_quality'
          ),
          tables,
        })
      )
    );
    expect(count(siteDb(), 'analytics_check_days')).toBe(0);
    expect(app.analytics.quality.tick().steps).toBeGreaterThan(0);
    expect(count(siteDb(), 'analytics_check_days')).toBeGreaterThan(0);
  });
});

// База, какой её оставил Eile этапа 4 части 2: без выписок, отметки сверки свойства и индекса денег людей.
const downgradeStage4Part2 = (path: string): void => {
  const db = new Database(path);
  db.transaction(() => {
    db.run('DROP TABLE analytics_statements');
    db.run('ALTER TABLE analytics_properties DROP COLUMN reconcile');
    db.run('DROP INDEX analytics_people_money');
    db.run("DELETE FROM _migrations WHERE id = 'analytics/009_statements'");
  })();
  db.close();
};

const PURCHASE_N = {
  scope: 'event',
  code: 'purchase_n',
  name: 'Номер оплаты',
  kind: 'number',
  reconcile: 'payment_number',
};

const PAID_DAILY = {
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
};

describe('этап 4: выписки, свои проверки и отметка сверки в базе', () => {
  it('выписки — данные сайта, свои проверки и отметка сверки — настройка: в копии .db, JSON-копии и восстановлении', async () => {
    now = new Date('2026-11-20T10:00:00.000Z');
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.setup.save('property', PURCHASE_N, ANNA);
    app.analytics.setup.save('check', PAID_DAILY, ANNA);
    app.analytics.statements.save(
      [{ month: '2026-10', currency: 'EUR', amount: '1250.00', note: 'банк' }],
      ANNA
    );
    const target = join(dir, 'copy.db');
    app.backup(target);
    expect(count(target, 'analytics_statements')).toBe(1);
    const archive = app.archive();
    expect(archive.tables.analytics_statements).toEqual([
      {
        month: '2026-10',
        currency: 'EUR',
        amount: 125_000,
        fees: 'gross',
        note: 'банк',
        user_name: 'Анна',
        agent: 0,
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ]);
    expect(
      (
        archive.tables.analytics_properties as {
          code: string;
          reconcile: unknown;
        }[]
      ).find((_) => _.code === 'purchase_n')?.reconcile
    ).toBe('payment_number');
    const other = createApp({
      databasePath: join(dir, 'other.db'),
      mediaCache: join(dir, 'other-cache'),
      clock: () => now,
    });
    try {
      for (const copy of [
        await Bun.file(target).bytes(),
        new TextEncoder().encode(JSON.stringify(archive)),
      ]) {
        await other.restore(copy);
        expect(other.analytics.statements.list().statements).toMatchObject([
          { month: '2026-10', amount: 125_000, note: 'банк' },
        ]);
        expect(
          other.analytics.setup
            .get()
            .properties.find((_) => _.code === 'purchase_n')?.reconcile
        ).toBe('payment_number');
        expect(
          other.analytics.quality.checks().find((_) => _.code === 'paid_daily')
        ).toMatchObject({ builtin: false, name: 'Оплаты за сутки' });
      }
    } finally {
      other.close();
    }
  });

  it('деньги людей читаются частичным индексом; таблица людей пересоздана без индекса — тот же ответ', () => {
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    const db = new Database(siteDb(), { readonly: true });
    const plan = db
      .query<{ detail: string }, []>(
        "EXPLAIN QUERY PLAN SELECT money, fee_money FROM analytics_people WHERE (money <> '[]' OR fee_money <> '[]') AND +test = 0"
      )
      .all()
      .map((_) => _.detail);
    db.close();
    expect(plan).toEqual([
      'SCAN analytics_people USING INDEX analytics_people_money',
    ]);
    app.close();
    sql(siteDb(), 'DROP INDEX analytics_people_money');
    app = open(siteDb());
    expect(app.analytics.rates.list().currencies).toEqual([]);
  });

  it('обновление: база этапа 4 части 2 без миграции 009 — выписки, своя проверка и отметка сверки работают; копии до 009 восстанавливаются', async () => {
    now = new Date('2026-11-20T10:00:00.000Z');
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.setup.save(
      'check',
      { code: 'events_arrived', params: { missing: 1 } },
      ANNA
    );
    app.close();
    downgradeStage4Part2(siteDb());
    const old = join(dir, 'stage4-part2.db');
    copyFileSync(siteDb(), old);

    app = open(siteDb());
    expect(count(siteDb(), 'analytics_statements')).toBe(0);
    expect(
      app.analytics.setup.get().properties.every((_) => _.reconcile === null)
    ).toBe(true);
    // Поправка части 2 читается как была; своя и отметка — сразу после обновления.
    expect(app.analytics.setup.get().checks).toMatchObject([
      { code: 'events_arrived', params: { missing: 1 } },
    ]);
    app.analytics.setup.save('property', PURCHASE_N, ANNA);
    app.analytics.setup.save('check', PAID_DAILY, ANNA);
    app.analytics.statements.save(
      [{ month: '2026-10', currency: 'EUR', amount: '10.00' }],
      ANNA
    );
    expect(app.analytics.statements.list().statements).toHaveLength(1);
    // Копия .db, сделанная до обновления: миграция 009 доходит и до неё.
    await app.restore(await Bun.file(old).bytes());
    expect(app.analytics.statements.list().statements).toEqual([]);
    expect(
      app.analytics.setup.get().properties.every((_) => _.reconcile === null)
    ).toBe(true);
    // JSON-копия до 009: без таблицы выписок и без отметки сверки у свойств.
    app.analytics.setup.save('property', PURCHASE_N, ANNA);
    const archive = app.archive();
    const { analytics_statements: _statements, ...tables } = archive.tables;
    await app.restore(
      new TextEncoder().encode(
        JSON.stringify({
          ...archive,
          migrations: archive.migrations.filter(
            (_: string) => _ !== 'analytics/009_statements'
          ),
          tables: {
            ...tables,
            analytics_properties: (
              tables.analytics_properties as Record<string, unknown>[]
            ).map(({ reconcile: _, ...property }) => property),
          },
        })
      )
    );
    expect(
      app.analytics.setup.get().properties.find((_) => _.code === 'purchase_n')
        ?.reconcile
    ).toBeNull();
    expect(app.analytics.statements.list().statements).toEqual([]);
    expect(app.analytics.setup.get().checks).toMatchObject([
      { code: 'events_arrived' },
    ]);
  });
});
