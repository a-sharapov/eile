import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import type {
  SetupAuthor,
  SourcesReport,
  SourcesRow,
} from '../src/contexts/analytics/index.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

// Отчёты аналитики (ADR 0072, «План тестов этапа 2»): набор «Подписка» и файл событий с людьми P1–P13, часы
// 2026-11-15 12:00 UTC, пояс статистики Europe/Berlin; цифры — ручные из таблиц ADR.

const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };
const FILE = join(import.meta.dir, 'fixtures/analytics-stage2.jsonl');
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
const PASSWORD = 'correct horse battery';

let dir: string;
let app: App;

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const share = (count: number, base: number, open = 0) => ({
  count,
  base,
  open,
});

const sources = (query: Record<string, unknown> = {}): SourcesReport =>
  app.analytics.reports.sources({ ...OCTOBER, group: 'part:source', ...query });

type FirstReport = Extract<SourcesReport, { attribution: 'first' }>;

const first = (report: SourcesReport): FirstReport => (
  expect(report.attribution).toBe('first'), report as FirstReport
);

const row = (report: SourcesReport, value: string): SourcesRow =>
  first(report).rows.find((_) => _.value === value) as SourcesRow;

// Строка таблицы ADR: новые, пробный, активация, оплата за 30, клиенты, выручка, оплат на клиента, продление.
const line = (_: SourcesRow) => [
  _.people,
  _.trial,
  _.milestones.activation,
  _.payment,
  _.customers,
  _.revenue,
  _.perCustomer,
  _.renewal,
];

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cms-reports-'));
  app = createApp({
    clock: () => new Date('2026-11-15T12:00:00Z'),
    databasePath: join(dir, 'site.db'),
    mediaCache: join(dir, 'cache'),
  });
  app.stats.settings.save({ timeZone: 'Europe/Berlin' });
  app.analytics.setup.apply(SUBSCRIPTION, ANNA);
  app.analytics.settings.save({ enabled: true }, ANNA);
  app.analytics.senders.issue('bot', 'Бот', ANNA);
  const report = await app.analytics.events.import(FILE);
  expect([report.accepted, report.rejected]).toEqual([32, 0]);
});

afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('«Источники» за октябрь', () => {
  it('итог и строки по источнику — цифры таблицы ADR', () => {
    const report = first(sources());
    expect(report).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      timeZone: 'Europe/Berlin',
      asOf: '2026-11-15T12:00:00.000Z',
      stale: 0,
      attribution: 'first',
      group: 'part:source',
      window: 30,
      filters: {},
      test: false,
    });
    expect(report.columns).toEqual([
      { kind: 'people' },
      { kind: 'milestone', code: 'activation', name: 'Активация' },
      { kind: 'trial' },
      { kind: 'payment' },
      { kind: 'customers' },
      { kind: 'revenue' },
      { kind: 'perCustomer' },
      { kind: 'renewal' },
    ]);
    // Итог — по всем людям, а не сумма долей строк: выручка P1, P11, P3 (0) и P6 (PLN).
    expect(line(report.total)).toEqual([
      9,
      share(5, 9),
      share(2, 9),
      share(2, 7, 2),
      3,
      { EUR: 3800, PLN: 1900 },
      { payments: 4, customers: 3 },
      share(1, 2, 1),
    ]);
    expect(report.rows.map((_) => [_.value, _.name])).toEqual([
      ['ig', 'Instagram'],
      ['fb', 'Facebook'],
      ['google', 'Google'],
      ['tg', 'Telegram'],
      ['~unknown', null],
      ['~none', null],
    ]);
    expect(line(row(report, 'ig'))).toEqual([
      4,
      share(2, 4),
      share(1, 4),
      share(1, 3, 1),
      1,
      { EUR: 3800 },
      { payments: 2, customers: 1 },
      share(1, 1),
    ]);
    // Оплата и возврат P3 в одном месяце: «0.00 EUR», а не «—».
    expect(line(row(report, 'fb'))).toEqual([
      1,
      share(1, 1),
      share(0, 1),
      share(1, 1),
      1,
      { EUR: 0 },
      { payments: 1, customers: 1 },
      share(0, 0, 1),
    ]);
    expect(line(row(report, 'google'))).toEqual([
      1,
      share(1, 1),
      share(1, 1),
      share(0, 0, 1),
      0,
      {},
      { payments: 0, customers: 0 },
      share(0, 0),
    ]);
    // P6 пришёл в сентябре, но клиент октября: его выручка — в строке его источника.
    expect(line(row(report, 'tg'))).toEqual([
      1,
      share(0, 1),
      share(0, 1),
      share(0, 1),
      1,
      { PLN: 1900 },
      { payments: 1, customers: 1 },
      share(0, 1),
    ]);
    expect(line(row(report, '~unknown'))).toEqual([
      1,
      share(1, 1),
      share(0, 1),
      share(0, 1),
      0,
      {},
      { payments: 0, customers: 0 },
      share(0, 0),
    ]);
    expect(line(row(report, '~none'))).toEqual([
      1,
      share(0, 1),
      share(0, 1),
      share(0, 1),
      0,
      {},
      { payments: 0, customers: 0 },
      share(0, 0),
    ]);
  });

  it('каждая строка и итог — «мало данных»', () => {
    const report = first(sources());
    for (const _ of [report.total, ...report.rows]) {
      expect(_.lowData).toEqual({ people: true, customers: true });
    }
  });

  it('пороги 4 и 1 в настройке — без перезапуска: итог и ig уже не «мало данных», у fb (1 новый) флаг людей остаётся', () => {
    const before = first(sources());
    expect(before.lowData).toEqual({ people: 30, customers: 10 });
    app.analytics.setup.save(
      'check',
      { code: 'low_data', params: { people: 4, customers: 1 } },
      ANNA
    );
    const report = first(sources());
    expect(report.lowData).toEqual({ people: 4, customers: 1 });
    expect(report.total.lowData).toEqual({ people: false, customers: false });
    expect(row(report, 'ig').lowData).toEqual({
      people: false,
      customers: false,
    });
    expect(row(report, 'fb').lowData).toEqual({
      people: true,
      customers: false,
    });
    // Цифры строк те же: пороги меняют только флаг.
    expect(line(report.total)).toEqual(line(before.total));
    expect(report.rows.map(line)).toEqual(before.rows.map(line));
    // Удаление поправки — снова пороги ядра.
    app.analytics.setup.remove('check', { code: 'low_data' }, ANNA);
    expect(first(sources()).total.lowData).toEqual({
      people: true,
      customers: true,
    });
  });

  it('ряд по дням Берлина: P12 в 00:30 1 октября — в периоде, P5 в 00:30 1 ноября — нет', () => {
    const report = first(sources());
    expect(report.daily).toHaveLength(31);
    expect(
      report.daily
        .filter((_) => _.people > 0 || _.customers > 0)
        .map((_) => [_.day, _.people, _.customers])
    ).toEqual([
      ['2026-10-01', 1, 0],
      ['2026-10-02', 1, 0],
      ['2026-10-03', 0, 1],
      ['2026-10-05', 1, 0],
      ['2026-10-07', 1, 0],
      ['2026-10-09', 0, 1],
      ['2026-10-10', 1, 0],
      ['2026-10-11', 1, 0],
      ['2026-10-15', 1, 0],
      ['2026-10-20', 1, 1],
      ['2026-10-28', 1, 0],
    ]);
    expect(
      first(sources({ from: '2026-11-01', to: '2026-11-01' })).total.people
    ).toBe(1);
  });

  it('фильтр part.channel=paid — пять новых; тестовые — только по отметке', () => {
    const report = first(sources({ filters: { 'part.channel': 'paid' } }));
    expect(report.filters).toEqual({ 'part.channel': 'paid' });
    expect(line(report.total)).toEqual([
      5,
      share(3, 5),
      share(1, 5),
      share(2, 4, 1),
      2,
      { EUR: 1900 },
      { payments: 3, customers: 2 },
      share(1, 1, 1),
    ]);
    expect(report.rows.map((_) => [_.value, _.people])).toEqual([
      ['ig', 3],
      ['fb', 1],
      ['~unknown', 1],
    ]);
    expect(first(sources({ test: '1' })).total.people).toBe(10);
  });

  it('раскрытие ~none по ответу: строка friend с одним человеком', () => {
    const report = first(
      sources({
        group: 'answer:heard_from',
        filters: { 'part.source': '~none' },
      })
    );
    expect(report.rows.map((_) => [_.value, _.name, _.people])).toEqual([
      ['friend', 'Посоветовали знакомые', 1],
    ]);
    expect(report.total.people).toBe(1);
  });

  it('«Метка и ответ»: (~none, friend) — 1, остальные новые — в столбце ~none', () => {
    const report = app.analytics.reports.answers({
      ...OCTOBER,
      group: 'part:source',
    });
    expect(report.question).toBe('heard_from');
    expect(report.columns).toEqual([
      { value: 'friend', name: 'Посоветовали знакомые', people: 1 },
      { value: '~none', name: null, people: 8 },
    ]);
    expect(report.rows.map((_) => [_.value, _.cells])).toEqual([
      ['ig', { '~none': 4 }],
      ['fb', { '~none': 1 }],
      ['google', { '~none': 1 }],
      ['tg', { '~none': 1 }],
      ['~unknown', { '~none': 1 }],
      ['~none', { friend: 1 }],
    ]);
    expect(report.total).toMatchObject({
      people: 9,
      cells: { friend: 1, '~none': 8 },
    });
  });

  it('attribution=return — строка fb: P11 вернулся, одна оплата, 19.00 EUR', () => {
    const report = sources({ attribution: 'return' });
    expect(report.attribution).toBe('return');
    expect(report.columns).toEqual([
      { kind: 'returned' },
      { kind: 'payments' },
      { kind: 'revenue' },
    ]);
    expect(report.rows).toEqual([
      {
        value: 'fb',
        name: 'Facebook',
        returned: 1,
        payments: 1,
        revenue: { EUR: 1900 },
        revenueBase: null,
        lowData: { people: true, customers: true },
      },
    ]);
    expect(report.total).toMatchObject({ returned: 1, payments: 1 });
    expect(
      (report.daily as readonly { day: string; returned: number }[]).find(
        (_) => _.returned > 0
      )
    ).toEqual({ day: '2026-10-18', returned: 1 });
  });

  it('группы: часть по умолчанию — первая часть схемы; метка целиком — «не из реестра», пока её нет в реестре; отправитель касания', () => {
    expect(first(app.analytics.reports.sources(OCTOBER)).group).toBe(
      'part:entry'
    );
    const before = first(sources({ group: 'label' }));
    expect(before.rows.map((_) => [_.value, _.people])).toEqual([
      ['~unknown', 8],
      ['~none', 1],
    ]);
    app.analytics.labels.create(
      {
        parts: {
          source: 'ig',
          channel: 'paid',
          campaign: 'autumn',
          creative: 'ad-1',
        },
        link: 'trial',
        name: 'Осень, объявление 1',
      },
      ANNA
    );
    const after = first(sources({ group: 'label' }));
    expect(after.rows.map((_) => [_.value, _.name, _.people])).toEqual([
      ['w-trial__ig__paid__autumn__ad-1', 'Осень, объявление 1', 1],
      ['~unknown', null, 7],
      ['~none', null, 1],
    ]);
    expect(
      first(sources({ group: 'sender' })).rows.map((_) => [
        _.value,
        _.name,
        _.people,
      ])
    ).toEqual([['bot', 'Бот подписки', 9]]);
  });
});

describe('воронка journey', () => {
  const people = (report: ReturnType<App['analytics']['reports']['funnel']>) =>
    report.steps
      .filter((_) => _.side === 'people')
      .map((_) => [_.step.kind, _.count, _.skipped]);

  it('свободная: 9, 5, 2, 2 (пропустил шаг выше — P3), 1; деньги оплаты 1 — 68.00 EUR, 34.00 на человека', () => {
    const report = app.analytics.reports.funnel(OCTOBER);
    expect(report.funnel).toEqual({
      code: 'journey',
      name: 'Путь к подписке',
      strict: false,
      main: true,
    });
    expect(people(report)).toEqual([
      ['arrival', 9, 0],
      ['trial', 5, 0],
      ['milestone', 2, 0],
      ['payment', 2, 1],
      ['payment', 1, 0],
    ]);
    expect(report.steps[5]?.money).toEqual({
      amounts: { EUR: 6800 },
      perPerson: { EUR: 3400 },
      base: null,
      perPersonBase: null,
    });
    expect(report.steps[6]?.money).toEqual({
      amounts: { EUR: 1900 },
      perPerson: { EUR: 1900 },
      base: null,
      perPersonBase: null,
    });
    expect(report.steps.every((_) => _.side === 'visits' || _.lowData)).toBe(
      true
    );
    // Счёт посещений выключен: у шагов-посещений счёта нет.
    expect(
      report.steps.filter((_) => _.side === 'visits').map((_) => _.count)
    ).toEqual([null, null]);
  });

  it('строгая: 9, 5, 2, 1, 1 — оплата P3 раньше активации, которой нет; деньги оплаты 1 — 19.00 EUR', () => {
    app.analytics.setup.save('funnel', { code: 'journey', strict: true }, ANNA);
    const report = app.analytics.reports.funnel({
      ...OCTOBER,
      funnel: 'journey',
    });
    expect(people(report)).toEqual([
      ['arrival', 9, 0],
      ['trial', 5, 0],
      ['milestone', 2, 0],
      ['payment', 1, 0],
      ['payment', 1, 0],
    ]);
    expect(report.steps[5]?.money?.amounts).toEqual({ EUR: 1900 });
    expect(report.steps[6]?.money?.amounts).toEqual({ EUR: 1900 });
  });

  it('люди шага: дошедшие и остановившиеся — те же, что в цифрах шагов', () => {
    const list = (step: number, stage: string) =>
      app.analytics.people
        .list({ ...OCTOBER, funnel: 'journey', step, stage })
        .people.map((_) => _.subject.slice(-3))
        .toSorted();
    expect(list(4, 'reached')).toEqual(['p01', 'p08']);
    expect(list(5, 'reached')).toEqual(['p01', 'p03']);
    // Остановились перед оплатой 1: засчитаны на активации, а на оплате — нет.
    expect(list(5, 'stopped')).toEqual(['p08']);
    expect(code(() => list(0, 'reached'))).toBe('analytics.invalid_query');
    expect(
      code(() =>
        app.analytics.people.list({ funnel: 'nope', step: 2, ...OCTOBER })
      )
    ).toBe('analytics.funnel_not_found');
  });
});

describe('список людей с параметрами отчёта', () => {
  const subjects = (query: Record<string, unknown>) =>
    app.analytics.people
      .list(query)
      .people.map((_) => _.subject.slice(-3))
      .toSorted();

  it('период по приходу, фильтры, веха; total — под всеми фильтрами', () => {
    const page = app.analytics.people.list({
      ...OCTOBER,
      filters: { 'part.source': 'ig' },
    });
    expect(page.total).toBe(4);
    // Новые по последнему событию сверху, как список без параметров.
    expect(page.people.map((_) => _.subject.slice(-3))).toEqual([
      'p01',
      'p13',
      'p02',
      'p10',
    ]);
    expect(subjects({ ...OCTOBER, milestone: 'activation' })).toEqual([
      'p01',
      'p08',
    ]);
    expect(subjects({ milestone: 'activation', state: 'trial' })).toEqual([
      'p08',
    ]);
    expect(subjects({ attribution: 'return', ...OCTOBER })).toEqual(['p11']);
    expect(
      subjects({ ...OCTOBER, filters: { 'part.source': '~none' } })
    ).toEqual(['p04']);
    expect(
      app.analytics.people.list({ ...OCTOBER, limit: 2, offset: 2 }).people
    ).toHaveLength(2);
  });
});

describe('без перезапуска и без задвоения', () => {
  const asAdmin = async () => {
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
    return (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  };

  it('новая веха и свойство-разрез через API — столбец и фильтр после пересчёта', async () => {
    const cookie = await asAdmin();
    const put = (group: string, body: unknown) =>
      app.fetch(
        new Request(`http://localhost/manager/api/analytics/setup/${group}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify(body),
        })
      );
    expect(
      (
        await put('milestone', {
          code: 'two-tasks',
          name: 'Два задания',
          sender: 'bot',
          type: 'task_done',
          count: 2,
        })
      ).status
    ).toBe(200);
    const report = first(sources());
    expect(report.columns.map((_) => ('code' in _ ? _.code : _.kind))).toEqual([
      'people',
      'activation',
      'two-tasks',
      'trial',
      'payment',
      'customers',
      'revenue',
      'perCustomer',
      'renewal',
    ]);
    expect(report.total.milestones['two-tasks']).toEqual(share(1, 9));
    expect(
      (
        await put('property', {
          scope: 'event',
          code: 'items_n',
          dimension: true,
        })
      ).status
    ).toBe(200);
    expect(
      first(sources({ filters: { 'prop.items_n': '2' } })).rows.map((_) => [
        _.value,
        _.people,
      ])
    ).toEqual([['google', 1]]);
    expect(
      first(sources({ group: 'prop:items_n' })).rows.map((_) => [
        _.value,
        _.people,
      ])
    ).toEqual([
      ['1', 1],
      ['2', 1],
      ['3', 1],
      ['~none', 6],
    ]);
  });

  it('повторная загрузка того же файла не меняет ни одной цифры', async () => {
    const before = [
      sources(),
      sources({ attribution: 'return' }),
      app.analytics.reports.funnel(OCTOBER),
      app.analytics.reports.answers(OCTOBER),
    ];
    const again = await app.analytics.events.import(FILE);
    expect([again.accepted, again.duplicates]).toEqual([0, 32]);
    expect([
      sources(),
      sources({ attribution: 'return' }),
      app.analytics.reports.funnel(OCTOBER),
      app.analytics.reports.answers(OCTOBER),
    ]).toEqual(before);
  });
});

describe('параметры отчёта', () => {
  it('неизвестная группа и фильтр, свойство без «разреза», больше 10 фильтров, период вне пределов — invalid_query', () => {
    for (const query of [
      { group: 'part:nope' },
      { group: 'prop:items_n' },
      { group: 'trait:nope' },
      { group: 'answer:source' },
      { group: 'whatever' },
      { group: "part:source' OR 1=1 --" },
      { filters: { 'part.nope': 'ig' } },
      { filters: { 'prop.items_n': '2' } },
      { filters: { 'part.source': 'IG!' } },
      { filters: { 'weird.source': 'ig' } },
      { filters: { sender: 'shop' } },
      {
        filters: Object.fromEntries(
          Array.from({ length: 11 }, (_, n) => [`part.source${n}`, 'ig'])
        ),
      },
      { days: 0 },
      { days: 3661 },
      { days: 'abc' },
      { from: '2026-10-01', to: '2026-11-16' },
      { from: '2026-10-31', to: '2026-10-01' },
      { from: '2016-01-01', to: '2026-11-15' },
      { from: '2026-02-30' },
      { window: 14 },
      { attribution: 'last' },
      { test: 'yes' },
    ]) {
      expect([
        JSON.stringify(query),
        code(() => app.analytics.reports.sources(query)),
      ]).toEqual([JSON.stringify(query), 'analytics.invalid_query']);
    }
    expect(code(() => app.analytics.reports.funnel({ funnel: 'nope' }))).toBe(
      'analytics.funnel_not_found'
    );
    expect(
      code(() => app.analytics.reports.answers({ question: 'source' }))
    ).toBe('analytics.invalid_query');
  });

  it('период: последние дни, свои дни до сегодня, всё время — с первого прихода', () => {
    expect(app.analytics.reports.sources()).toMatchObject({
      from: '2026-10-17',
      to: '2026-11-15',
    });
    expect(app.analytics.reports.sources({ days: '7' })).toMatchObject({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(app.analytics.reports.sources({ from: '2026-11-01' })).toMatchObject(
      { from: '2026-11-01', to: '2026-11-15' }
    );
    const all = first(app.analytics.reports.sources({ all: '1' }));
    expect([all.from, all.to]).toEqual(['2026-06-01', '2026-11-15']);
    expect(all.total.people).toBe(12);
    expect(all.daily).toHaveLength(168);
  });
});
