import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import {
  PERSON_STATES,
  type SetupAuthor,
} from '../src/contexts/analytics/index.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };
const START = '2027-11-14T18:30:00.000Z';
const SUBJECT = 'u_3b9e0c7a1f';
const OTHER = 'u_77aa00ff';

let dir: string;
let app: App;
let now: Date;
let key: string;
let ids = 0;

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const sha256 = (text: string) =>
  new Bun.CryptoHasher('sha256').update(text).digest('hex');

const send = (
  body: unknown,
  to: App = app
): Promise<{ status: number; body: Record<string, unknown> }> =>
  to
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
    .then((response) =>
      response.json().then((json) => ({
        status: response.status,
        body: json as Record<string, unknown>,
      }))
    );

const event = (
  type: string,
  at: string,
  data: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
) => ({
  id: `evt_${++ids}`,
  type,
  at,
  subject: SUBJECT,
  data,
  ...extra,
});

const PAID = {
  amount: '109.00',
  currency: 'EUR',
  plan: '3m',
  format: 'self',
};

const siteDb = (): string => join(dir, 'site.db');

const count = (table: string, where = '1'): number => {
  const db = new Database(siteDb(), { readonly: true });
  const { n } = db
    .query<{ n: number }, []>(
      `SELECT count(*) AS n FROM ${table} WHERE ${where}`
    )
    .get()!;
  db.close();
  return n;
};

// Счёт стёртого строками «сутки отправитель тип тест число».
const erasedTally = (): string[] => {
  const db = new Database(siteDb(), { readonly: true });
  const found = db
    .query<
      {
        day: string;
        sender: string;
        type: string;
        test: number;
        events: number;
      },
      []
    >('SELECT * FROM analytics_erased_daily ORDER BY day, sender, type, test')
    .all()
    .map((_) => `${_.day} ${_.sender} ${_.type} ${_.test} ${_.events}`);
  db.close();
  return found;
};

// Что стирается у человека customer(): по событию на сутки и тип.
const CUSTOMER_ERASED = [
  '2027-11-01 bot bot_start 0 1',
  '2027-11-01 bot source_survey 0 1',
  '2027-11-02 bot trial_started 0 1',
  '2027-11-05 bot purchase 0 1',
  '2027-11-06 bot fee_settled 0 1',
  '2027-11-07 bot task_done 0 1',
];

const open = (path: string): App =>
  createApp({
    databasePath: path,
    mediaCache: `${path}.cache`,
    clock: () => now,
  });

const subjects = (): string[] =>
  app.analytics.people.list({ test: true }).people.map((_) => _.subject);

// Человек от первого касания до оплаты: так его шлёт бот.
const customer = async (subject = SUBJECT) => {
  const one = (type: string, at: string, data = {}, extra = {}) =>
    send(event(type, at, data, { subject, ...extra }));
  await one(
    'bot_start',
    '2027-11-01T09:00:00Z',
    { label: 'post__blog\u0007__organic' },
    {
      first_touch: { label: 'post__blog__organic', at: '2027-10-30T09:00:00Z' },
      traits: { lang: 'ru' },
    }
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
    ...PAID,
    payment_id: `pi_${subject}`,
    paid_until: '2028-02-05T10:00:00Z',
    fee: '3.00',
  });
  await one('fee_settled', '2027-11-06T10:00:00Z', {
    payment_id: `pi_${subject}`,
    fee: '3.20',
  });
  await one('task_done', '2027-11-07T10:00:00Z', { items_n: 5 });
};

beforeEach(() => {
  now = new Date(START);
  ids = 0;
  dir = mkdtempSync(join(tmpdir(), 'cms-people-'));
  app = open(siteDb());
  app.analytics.setup.apply(SUBSCRIPTION, ANNA);
  app.analytics.settings.save({ enabled: true }, ANNA);
  key = app.analytics.senders.issue('bot', 'Бот', ANNA).key;
});

afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('люди из событий', () => {
  it('события, принятые приёмником, сворачиваются в человека при приёме', async () => {
    await customer();
    expect(count('analytics_people')).toBe(1);
    const page = app.analytics.people.list();
    expect(page.total).toBe(1);
    expect(page.stale).toBe(0);
    expect(page.people[0]).toEqual({
      subject: SUBJECT,
      test: false,
      senders: ['bot'],
      firstAt: '2027-11-01T09:00:00.000Z',
      lastAt: '2027-11-07T10:00:00.000Z',
      events: 6,
      invalid: 0,
      arrivedAt: '2027-10-30T09:00:00.000Z',
      firstTouch: {
        label: 'post__blog__organic',
        at: '2027-10-30T09:00:00.000Z',
        sender: 'bot',
      },
      firstTouchConflict: false,
      lastTouch: {
        label: 'post__blog__organic',
        at: '2027-11-01T09:00:00.000Z',
        sender: 'bot',
      },
      firstParts: { entry: 'post', source: 'blog', channel: 'organic' },
      // Части — из метки как пришла: отрезок с управляющим знаком — не значение части.
      lastParts: { entry: 'post', channel: 'organic' },
      acquisition: {
        kind: 'parts',
        parts: { entry: 'post', source: 'blog', channel: 'organic' },
      },
      returns: [],
      answers: {
        heard_from: {
          answer: 'friend',
          text: 'подруга посоветовала',
          at: '2027-11-01T09:05:00.000Z',
        },
      },
      trialAt: '2027-11-02T10:00:00.000Z',
      trialEndsAt: '2027-11-05T10:00:00.000Z',
      payments: 1,
      firstPaidAt: '2027-11-05T10:00:00.000Z',
      lastPaidAt: '2027-11-05T10:00:00.000Z',
      paidUntil: '2028-02-05T10:00:00.000Z',
      firstTermEnd: '2028-02-05T10:00:00.000Z',
      lapsedAt: null,
      returnedAt: null,
      revenue: { EUR: 10_900 },
      fees: { EUR: 320 },
      // Задание — через неделю после прихода, окно активации — три дня.
      milestones: {
        activation: {
          state: 'missed',
          reachedAt: null,
          from: '2027-10-30T09:00:00.000Z',
          until: '2027-11-02T09:00:00.000Z',
        },
      },
      dims: { plan: '3m', format: 'self' },
      traits: { lang: 'ru' },
      state: 'customer',
    });
    // Деньги по времени и первые события типов — в карточке, а не в списке.
    expect(page.people[0]).not.toHaveProperty('money');
    expect(app.analytics.people.get(SUBJECT).person).toMatchObject({
      money: [['2027-11-05T10:00:00.000Z', 'EUR', 10_900]],
      firsts: {
        'bot/bot_start': '2027-11-01T09:00:00.000Z',
        'bot/purchase': '2027-11-05T10:00:00.000Z',
      },
    });
  });

  it('карточка сворачивает заново: человек, состояние, лента от новых к старым страницами, конфликты', async () => {
    await customer();
    const repeat = event('bot_start', '2027-11-08T10:00:00Z', { label: 'x' });
    await send(repeat);
    await send({ ...repeat, data: { label: 'другое тело' } });
    const card = app.analytics.people.get(SUBJECT, { limit: 3 });
    expect(card.state).toBe('customer');
    expect(card.person).toMatchObject({ events: 7, unmatched: 0 });
    expect(card.events.map((_) => [_.type, _.role, _.name])).toEqual([
      ['bot_start', 'touch', 'Старт бота'],
      ['task_done', 'action', 'Задание выполнено'],
      ['fee_settled', 'amendment', 'Комиссия уточнена'],
    ]);
    expect(card.events[0]!.fields).toEqual({ label: 'x' });
    expect(card.conflicts).toEqual([
      {
        sender: 'bot',
        id: repeat.id,
        count: 1,
        firstAt: START,
        lastAt: START,
      },
    ]);
    const rest = app.analytics.people.get(SUBJECT, { before: card.next });
    expect(rest.events.map((_) => _.type)).toEqual([
      'purchase',
      'trial_started',
      'source_survey',
      'bot_start',
    ]);
    expect(rest.next).toBeNull();
    // Чужой текст — после чистки и в ленте: управляющий знак метки ушёл.
    expect(rest.events.at(-1)!.fields).toEqual({
      label: 'post__blog__organic',
    });
    expect(code(() => app.analytics.people.get('u_nobody_here'))).toBe(
      'analytics.person_not_found'
    );
    expect(code(() => app.analytics.people.get('anna@example.com'))).toBe(
      'analytics.invalid_subject'
    );
  });

  it('фильтры списка: состояние, отправитель, начало псевдонима, страницы', async () => {
    await customer();
    await send(
      event('bot_start', '2027-11-10T09:00:00Z', {}, { subject: OTHER })
    );
    const shop = app.analytics.senders.save({ code: 'shop', name: 'Магазин' })
      .key!.key;
    await app
      .fetch(
        new Request('http://localhost/_cms/events', {
          method: 'POST',
          headers: { authorization: `Bearer ${shop}` },
          body: JSON.stringify(
            event('order_paid', '2027-11-11T09:00:00Z', {}, { subject: OTHER })
          ),
        }),
        { requestIP: () => ({ address: '192.0.2.11' }) }
      )
      .then((_) => _.text());
    const list = (query: object) =>
      app.analytics.people.list(query).people.map((_) => _.subject);
    expect(list({})).toEqual([OTHER, SUBJECT]);
    expect(list({ state: 'new' })).toEqual([OTHER]);
    expect(list({ state: 'customer' })).toEqual([SUBJECT]);
    expect(list({ state: 'lapsed' })).toEqual([]);
    expect(list({ sender: 'shop' })).toEqual([OTHER]);
    expect(list({ q: 'u_3b' })).toEqual([SUBJECT]);
    expect(list({ q: 'U_3B' })).toEqual([]);
    expect(list({ limit: 1 })).toEqual([OTHER]);
    expect(list({ limit: 1, offset: 1 })).toEqual([SUBJECT]);
    expect(app.analytics.people.list({ limit: 1 }).total).toBe(2);
    expect(code(() => app.analytics.people.list({ state: 'gone' }))).toBe(
      'analytics.invalid_query'
    );
    // Состояние зависит от часов: прошёл paid_until — ушёл, и фильтр списка это видит.
    now = new Date('2028-02-06T00:00:00.000Z');
    expect(list({ state: 'lapsed' })).toEqual([SUBJECT]);
    expect(app.analytics.people.get(SUBJECT).state).toBe('lapsed');
  });

  it('фильтр по состоянию в базе — то же, что состояние в карточке', async () => {
    const day = (n: number) =>
      `2027-0${Math.floor(n / 28) + 1}-${String((n % 28) + 1).padStart(2, '0')}T10:00:00Z`;
    const people: Record<string, [string, number, Record<string, unknown>?][]> =
      {
        u_new_person: [['bot_start', 1]],
        u_trial_one: [['trial_started', 2]],
        u_customer_one: [
          ['purchase', 3, { paid_until: '2028-01-01T00:00:00Z' }],
        ],
        u_lapsed_event: [
          ['purchase', 4],
          ['access_ended', 30],
        ],
        u_lapsed_until: [
          ['purchase', 5, { paid_until: '2027-03-01T00:00:00Z' }],
        ],
        u_returned_one: [
          ['purchase', 6],
          ['access_ended', 31],
          ['purchase', 40],
        ],
      };
    for (const [subject, history] of Object.entries(people)) {
      for (const [type, n, data] of history) {
        await send(
          event(
            type,
            day(n),
            type === 'purchase'
              ? { ...PAID, payment_id: `pi_${n}`, ...data }
              : (data ?? {}),
            { subject }
          )
        );
      }
    }
    const all = app.analytics.people.list({ limit: 200 }).people;
    expect(all.map((_) => [_.subject, _.state]).toSorted()).toEqual(
      [
        ['u_customer_one', 'customer'],
        ['u_lapsed_event', 'lapsed'],
        ['u_lapsed_until', 'lapsed'],
        ['u_new_person', 'new'],
        ['u_returned_one', 'returned'],
        ['u_trial_one', 'trial'],
      ].toSorted()
    );
    for (const state of PERSON_STATES) {
      expect(
        app.analytics.people
          .list({ state })
          .people.map((_) => _.subject)
          .toSorted()
      ).toEqual(
        all
          .filter((_) => _.state === state)
          .map((_) => _.subject)
          .toSorted()
      );
      expect(
        all
          .filter((_) => _.state === state)
          .every((_) => app.analytics.people.get(_.subject).state === state)
      ).toBe(true);
    }
  });

  it('тестовые события в человека не идут; человек из одних тестовых — по переключателю', async () => {
    await send(event('bot_start', '2027-11-01T09:00:00Z', { label: 'a' }));
    await send(
      event(
        'purchase',
        '2027-11-02T09:00:00Z',
        { ...PAID, payment_id: 'pi_t' },
        {
          test: true,
        }
      )
    );
    await send(
      event(
        'bot_start',
        '2027-11-03T09:00:00Z',
        {},
        { subject: OTHER, test: true }
      )
    );
    expect(app.analytics.people.list().people.map((_) => _.subject)).toEqual([
      SUBJECT,
    ]);
    expect(app.analytics.people.list().people[0]).toMatchObject({
      test: false,
      events: 1,
      payments: 0,
      state: 'new',
    });
    const shown = app.analytics.people.list({ test: true }).people;
    expect(shown.map((_) => [_.subject, _.test])).toEqual([
      [OTHER, true],
      [SUBJECT, false],
    ]);
  });
});

describe('пересчёт по ревизии настройки', () => {
  const crowd = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await send(
        event(
          'bot_start',
          '2027-11-01T09:00:00Z',
          {},
          { subject: `u_crowd_${i}` }
        )
      );
    }
  };

  it('без фона список пересчитывает людей по новой роли типа сам', async () => {
    await crowd(3);
    expect(app.analytics.people.list({ state: 'trial' }).total).toBe(0);
    app.analytics.setup.save('type', {
      sender: 'bot',
      code: 'bot_start',
      role: 'trial',
    });
    const page = app.analytics.people.list({ state: 'trial' });
    expect(page).toMatchObject({ total: 3, stale: 0 });
    expect(app.analytics.people.stale()).toBe(0);
  });

  it('с фоном список отвечает сразу и говорит, сколько людей ещё в пересчёте', async () => {
    await crowd(4);
    const stop = app.analytics.start();
    try {
      // Первый проход фона: таблица ведётся приёмом, отставших нет.
      await Bun.sleep(30);
      expect(app.analytics.people.list().stale).toBe(0);
      app.analytics.setup.save('type', {
        sender: 'bot',
        code: 'bot_start',
        role: 'trial',
      });
      const stale = app.analytics.people.list();
      expect(stale.stale).toBe(4);
      expect(stale.people.every((_) => _.state === 'new')).toBe(true);
      // Приёмник между пачками отвечает как обычно.
      expect(
        (await send(event('task_done', '2027-11-02T09:00:00Z', { items_n: 2 })))
          .status
      ).toBe(200);
      for (let i = 0; i < 100 && app.analytics.people.stale() > 0; i++) {
        await Bun.sleep(10);
      }
      const fresh = app.analytics.people.list({ state: 'trial' });
      expect(fresh).toMatchObject({ total: 4, stale: 0 });
      expect(count('analytics_people_build', 'cursor IS NULL')).toBe(1);
    } finally {
      stop();
    }
  });
});

describe('удаление истории', () => {
  it('кнопкой: события от всех отправителей, строка в людях, отметка; псевдонима в журнале нет', async () => {
    await customer();
    await customer(OTHER);
    // Событие «из будущего» тоже стирается: момент — самое позднее событие человека.
    await send(event('task_done', '2027-11-15T09:00:00Z', { items_n: 1 }));
    now = new Date('2027-11-14T19:00:00.000Z');
    expect(app.analytics.people.erase(SUBJECT, ANNA)).toEqual({
      people: 1,
      events: 7,
    });
    expect(count('analytics_events', `subject = '${SUBJECT}'`)).toBe(0);
    expect(subjects()).toEqual([OTHER]);
    expect(code(() => app.analytics.people.get(SUBJECT))).toBe(
      'analytics.person_not_found'
    );
    expect(app.analytics.log.erasures()).toEqual([
      {
        id: 1,
        at: '2027-11-14T19:00:00.000Z',
        before: '2027-11-15T09:00:00.000Z',
        origin: 'manager',
        sender: null,
        userName: 'Анна',
        events: 7,
        people: 1,
        marked: true,
      },
    ]);
    expect(
      count('analytics_erasures', `subject_hash = '${sha256(SUBJECT)}'`)
    ).toBe(1);
    expect(JSON.stringify(app.analytics.log.erasures())).not.toContain(SUBJECT);
    // Опоздавший повтор не возвращает стёртое.
    expect(
      (await send(event('bot_start', '2027-11-01T09:00:00Z', {}))).body
    ).toEqual({ ok: true, erased: true });
    expect(code(() => app.analytics.people.erase(SUBJECT))).toBe(
      'analytics.person_not_found'
    );
    expect(code(() => app.analytics.people.erase('12345678'))).toBe(
      'analytics.invalid_subject'
    );
  });

  it('удаление, ждавшее справочника: тип получил роль «удаление» — пересборка его исполняет', async () => {
    await customer();
    await send(event('forget_me', '2027-11-08T10:00:00Z'));
    // Событие после момента удаления — новая история, оно остаётся.
    await send(event('task_done', '2027-11-09T10:00:00Z', { items_n: 1 }));
    await customer(OTHER);
    expect(count('analytics_events', `subject = '${SUBJECT}'`)).toBe(8);
    app.analytics.setup.save('type', {
      sender: 'bot',
      code: 'forget_me',
      name: 'Забыть меня',
      role: 'erasure',
    });
    expect(app.analytics.people.list().people.map((_) => _.subject)).toEqual([
      SUBJECT,
      OTHER,
    ]);
    expect(count('analytics_events', `subject = '${SUBJECT}'`)).toBe(1);
    expect(count('analytics_events', "type = 'forget_me'")).toBe(0);
    expect(app.analytics.people.get(SUBJECT).person).toMatchObject({
      events: 1,
      payments: 0,
      firstAt: '2027-11-09T10:00:00.000Z',
    });
    expect(app.analytics.log.erasures()).toMatchObject([
      {
        origin: 'event',
        sender: 'bot',
        before: '2027-11-08T10:00:00.000Z',
        events: 7,
        people: 1,
        marked: true,
      },
    ]);
    expect(
      (await send(event('bot_start', '2027-11-01T09:00:00Z', {}))).body
    ).toEqual({ ok: true, erased: true });
    // Счёт стёртого: всё, что стёрла пересборка, и само удаление, принятое до своей роли; затем — «стёрто».
    expect(erasedTally()).toEqual([
      '2027-11-01 bot bot_start 0 2',
      '2027-11-01 bot source_survey 0 1',
      '2027-11-02 bot trial_started 0 1',
      '2027-11-05 bot purchase 0 1',
      '2027-11-06 bot fee_settled 0 1',
      '2027-11-07 bot task_done 0 1',
      '2027-11-08 bot forget_me 0 1',
    ]);
  });

  it('срок хранения: стирает людей со старым последним событием, без отметок, одной строкой журнала', async () => {
    await customer();
    await send(
      event('bot_start', '2027-01-10T09:00:00Z', {}, { subject: OTHER })
    );
    await send(
      event('bot_start', '2027-02-10T09:00:00Z', {}, { subject: 'u_old_two' })
    );
    expect(app.analytics.people.expire()).toEqual({ people: 0, events: 0 });
    app.analytics.settings.save({ retentionMonths: 6 }, ANNA);
    expect(app.analytics.people.expire()).toEqual({ people: 2, events: 2 });
    expect(subjects()).toEqual([SUBJECT]);
    expect(app.analytics.log.erasures()).toMatchObject([
      {
        origin: 'retention',
        before: '2027-05-14T18:30:00.000Z',
        sender: null,
        userName: null,
        events: 2,
        people: 2,
        marked: false,
      },
    ]);
    expect(app.analytics.people.expire()).toEqual({ people: 0, events: 0 });
    expect(app.analytics.log.erasures()).toHaveLength(1);
    // Отметки нет: старое событие, присланное снова, — снова история.
    expect(
      (
        await send(
          event('bot_start', '2027-01-10T09:00:00Z', {}, { subject: OTHER })
        )
      ).body
    ).toEqual({ ok: true });
  });

  it('срок хранения пачками фона — тот же итог и одна строка журнала на проход', async () => {
    for (let i = 0; i < 3; i++) {
      await send(
        event(
          'bot_start',
          '2027-01-10T09:00:00Z',
          {},
          { subject: `u_old_${i}xx` }
        )
      );
    }
    await send(event('bot_start', '2027-11-10T09:00:00Z', {}));
    expect(app.analytics.background.retention()).toBe(false);
    expect(app.analytics.log.erasures()).toEqual([]);
    app.analytics.settings.save({ retentionMonths: 1 });
    let batches = 0;
    while (app.analytics.background.retention()) batches++;
    expect(batches).toBe(0);
    expect(subjects()).toEqual([SUBJECT]);
    expect(app.analytics.log.erasures()).toMatchObject([
      { origin: 'retention', events: 3, people: 3, marked: false },
    ]);
    expect(app.analytics.background.retention()).toBe(false);
    expect(app.analytics.log.erasures()).toHaveLength(1);
  });

  for (const kind of ['.db', 'JSON'] as const) {
    it(`восстановление копии ${kind}, сделанной до удаления, стёртого не воскрешает`, async () => {
      await customer();
      await customer(OTHER);
      const copy = join(dir, 'copy.db');
      app.backup(copy);
      const bytes =
        kind === '.db'
          ? await Bun.file(copy).bytes()
          : new TextEncoder().encode(JSON.stringify(app.archive()));
      now = new Date('2027-11-14T19:00:00.000Z');
      await send(event('user_deleted', '2027-11-14T18:59:00Z'));
      expect(subjects()).toEqual([OTHER]);
      expect(erasedTally()).toEqual([
        ...CUSTOMER_ERASED,
        '2027-11-14 bot user_deleted 0 1',
      ]);
      await app.restore(bytes);
      expect(count('analytics_events', `subject = '${SUBJECT}'`)).toBe(0);
      // Повторное стирание считает то, что стёрло в копии; само удаление пришло после копии и ушло с ней.
      expect(erasedTally()).toEqual(CUSTOMER_ERASED);
      expect(count('analytics_conflicts')).toBe(0);
      expect(subjects()).toEqual([OTHER]);
      expect(app.analytics.log.erasures()).toMatchObject([
        { origin: 'event', events: 6, marked: true },
      ]);
      expect(
        (await send(event('bot_start', '2027-11-01T09:00:00Z', {}))).body
      ).toEqual({ ok: true, erased: true });
      // Люди восстановленной базы строятся заново.
      expect(app.analytics.people.get(OTHER).person.payments).toBe(1);
    });
  }
});

describe('журнал событий и «незнакомые»', () => {
  it('журнал: фильтры по типу, роли, отправителю, датам, тесту, псевдониму; страницы; исходное тело', async () => {
    await customer();
    await send(
      event(
        'bot_start',
        '2027-11-20T09:00:00Z',
        {},
        { subject: OTHER, test: true }
      )
    );
    const types = (query: object) =>
      app.analytics.events.list(query).events.map((_) => _.type);
    expect(types({})).toEqual([
      'bot_start',
      'task_done',
      'fee_settled',
      'purchase',
      'trial_started',
      'source_survey',
      'bot_start',
    ]);
    expect(types({ role: 'payment' })).toEqual(['purchase']);
    expect(types({ type: 'bot_start', test: false })).toEqual(['bot_start']);
    expect(types({ test: true })).toEqual(['bot_start']);
    expect(types({ subject: OTHER })).toEqual(['bot_start']);
    expect(types({ from: '2027-11-05', to: '2027-11-06' })).toEqual([
      'fee_settled',
      'purchase',
    ]);
    expect(types({ to: '2027-11-05T10:00:00Z' })).toEqual([
      'purchase',
      'trial_started',
      'source_survey',
      'bot_start',
    ]);
    const first = app.analytics.events.list({ limit: 4 });
    expect(first.events).toHaveLength(4);
    expect(first.events[0]).toMatchObject({
      sender: 'bot',
      subject: OTHER,
      test: true,
      future: true,
      role: 'touch',
      name: 'Старт бота',
      origin: 'http',
    });
    expect(
      app.analytics.events
        .list({ limit: 4, before: first.next })
        .events.map((_) => _.type)
    ).toEqual(['trial_started', 'source_survey', 'bot_start']);
    const raw = app.analytics.events.body(first.events[0]!.seq);
    expect(JSON.parse(raw.body)).toMatchObject({ subject: OTHER, test: true });
    expect(code(() => app.analytics.events.body(999))).toBe(
      'analytics.event_not_found'
    );
    expect(code(() => app.analytics.events.list({ role: 'gift' }))).toBe(
      'analytics.invalid_query'
    );
    expect(code(() => app.analytics.events.list({ from: 'вчера' }))).toBe(
      'analytics.invalid_query'
    );
  });

  it('«незнакомые»: тип вне справочника, значения свойств и признаков, вопросы и ответы — со счётчиками', async () => {
    await send(event('gift_sent', '2027-11-01T09:00:00Z'));
    await send(event('gift_sent', '2027-11-02T09:00:00Z'));
    await send(
      event('purchase', '2027-11-03T09:00:00Z', {
        ...PAID,
        plan: '6m',
        payment_id: 'pi_6m',
      })
    );
    await send(
      event('refund', '2027-11-04T09:00:00Z', {
        ...PAID,
        plan: '6m',
        format: 'RU',
        payment_id: 'pi_6m',
      })
    );
    await send(
      event('source_survey', '2027-11-01T09:05:00Z', {
        question: 'heard_from',
        answer: 'podcast',
      })
    );
    await send(
      event('source_survey', '2027-11-01T09:06:00Z', {
        question: 'why_us',
        answer: 'price',
      })
    );
    await send(
      event(
        'bot_start',
        '2027-11-01T09:00:00Z',
        {},
        {
          subject: OTHER,
          traits: { lang: 'de' },
        }
      )
    );
    // Значение в архиве — знакомое.
    app.analytics.setup.archive(
      'value',
      { dictionary: 'plan', code: '1m' },
      true
    );
    await send(
      event('purchase', '2027-11-05T09:00:00Z', {
        ...PAID,
        plan: '1m',
        payment_id: 'pi_1m',
      })
    );
    expect(app.analytics.unknown()).toEqual({
      types: [
        {
          sender: 'bot',
          type: 'gift_sent',
          count: 2,
          lastAt: '2027-11-02T09:00:00.000Z',
        },
      ],
      questions: [{ question: 'why_us', count: 1 }],
      answers: [
        { question: 'heard_from', answer: 'podcast', count: 1 },
        { question: 'why_us', answer: 'price', count: 1 },
      ],
      values: [{ property: 'plan', value: '6m', count: 2 }],
      traits: [{ trait: 'lang', value: 'de', count: 1 }],
      parts: [],
      labels: [],
    });
  });

  it('сводка приёма: принято сегодня, когда последнее, отказы', async () => {
    expect(app.analytics.intake.summary()).toEqual({
      enabled: true,
      today: 0,
      lastAt: null,
      refusals: [],
    });
    await customer();
    await send({ id: 'evt_bad', type: 'bot_start' });
    now = new Date('2027-11-15T00:10:00.000Z');
    await send(event('task_done', '2027-11-15T00:00:00Z', { items_n: 1 }));
    const summary = app.analytics.intake.summary();
    expect(summary).toMatchObject({
      enabled: true,
      today: 1,
      lastAt: '2027-11-15T00:10:00.000Z',
    });
    expect(summary.refusals.map((_) => [_.reason, _.id])).toEqual([
      ['invalid', 'evt_bad'],
    ]);
  });
});

// Возвращение и веха — как у P11 и P1 из плана тестов ADR: старый клиент вернулся по новой метке.
const returner = async (subject = OTHER) => {
  const one = (type: string, at: string, data = {}, extra = {}) =>
    send(event(type, at, data, { subject, ...extra }));
  await one('bot_start', '2027-06-01T10:00:00Z', {
    label: 'post__ig__organic',
  });
  await one('purchase', '2027-06-02T10:00:00Z', {
    ...PAID,
    plan: '1m',
    payment_id: `pi_${subject}_1`,
    paid_until: '2027-07-02T10:00:00Z',
  });
  await one('access_ended', '2027-07-02T10:00:00Z');
  await one('bot_start', '2027-10-17T10:00:00Z', {
    label: 'w-trial__fb__paid__autumn__ad-2',
  });
  await one('purchase', '2027-10-18T10:00:00Z', {
    ...PAID,
    payment_id: `pi_${subject}_2`,
    amount: '19.00',
  });
  await one('task_done', '2027-10-18T12:00:00Z', { items_n: 3 });
};

// Столбцы строки человека без rowid: сравнить людей, построенных разными путями.
const peopleRows = (): unknown[] => {
  const db = new Database(siteDb(), { readonly: true });
  const rows = db
    .query('SELECT * FROM analytics_people ORDER BY subject')
    .all()
    .map((_) => _ as Record<string, unknown>);
  db.close();
  return rows;
};

describe('люди этапа 2', () => {
  it('список и карточка: приход, части касаний, источник привлечения, возвращения, вехи, разрезы', async () => {
    await returner();
    const listed = app.analytics.people.list().people[0]!;
    expect(listed).toMatchObject({
      subject: OTHER,
      state: 'returned',
      arrivedAt: '2027-06-01T10:00:00.000Z',
      firstParts: { entry: 'post', source: 'ig', channel: 'organic' },
      lastParts: {
        entry: 'w-trial',
        source: 'fb',
        channel: 'paid',
        campaign: 'autumn',
        creative: 'ad-2',
      },
      acquisition: {
        kind: 'parts',
        parts: { entry: 'post', source: 'ig', channel: 'organic' },
      },
      returnedAt: '2027-10-18T10:00:00.000Z',
      returns: [
        {
          at: '2027-10-18T10:00:00.000Z',
          touch: {
            label: 'w-trial__fb__paid__autumn__ad-2',
            at: '2027-10-17T10:00:00.000Z',
            sender: 'bot',
          },
          parts: { entry: 'w-trial', source: 'fb', channel: 'paid' },
        },
      ],
      firstTermEnd: '2027-07-02T10:00:00.000Z',
      dims: { plan: '1m', format: 'self' },
    });
    // Части возвращения — полностью: кампания и креатив тоже.
    expect(listed.returns[0]!.parts).toEqual({
      entry: 'w-trial',
      source: 'fb',
      channel: 'paid',
      campaign: 'autumn',
      creative: 'ad-2',
    });
    // Активация — от прихода в июне: задание в октябре окно не застал.
    expect(listed.milestones.activation).toEqual({
      state: 'missed',
      reachedAt: null,
      from: '2027-06-01T10:00:00.000Z',
      until: '2027-06-04T10:00:00.000Z',
    });
    const card = app.analytics.people.get(OTHER).person;
    expect(card.money).toEqual([
      ['2027-06-02T10:00:00.000Z', 'EUR', 10_900],
      ['2027-10-18T10:00:00.000Z', 'EUR', 1900],
    ]);
    expect(card.returns).toEqual(listed.returns);
    expect(card.acquisition).toEqual(listed.acquisition);
    // Метка без частей — источник привлечения из ответа на первый вопрос; нет ответа — неизвестно.
    await send(
      event(
        'bot_start',
        '2027-11-10T09:00:00Z',
        {},
        { subject: 'u_survey_only' }
      )
    );
    expect(
      app.analytics.people.get('u_survey_only').person.acquisition
    ).toEqual({ kind: 'unknown' });
    await send(
      event(
        'source_survey',
        '2027-11-10T09:05:00Z',
        { question: 'heard_from', answer: 'friend' },
        { subject: 'u_survey_only' }
      )
    );
    expect(
      app.analytics.people.list({ q: 'u_survey' }).people[0]!.acquisition
    ).toEqual({ kind: 'answer', question: 'heard_from', answer: 'friend' });
  });

  it('веха «ещё в окне» — по часам чтения; новая веха появляется у людей без перезапуска', async () => {
    now = new Date('2027-11-01T12:00:00.000Z');
    await send(
      event('bot_start', '2027-11-01T10:00:00Z', { label: 'w-trial' })
    );
    const state = () =>
      app.analytics.people.get(SUBJECT).person.milestones.activation!.state;
    expect(state()).toBe('open');
    await send(event('task_done', '2027-11-02T10:00:00Z', { items_n: 1 }));
    await send(event('task_done', '2027-11-03T10:00:00Z', { items_n: 1 }));
    expect(state()).toBe('open');
    now = new Date('2027-11-04T10:00:00.000Z');
    expect(state()).toBe('missed');
    expect(
      app.analytics.people.list().people[0]!.milestones.activation!.state
    ).toBe('missed');
    app.analytics.setup.save('milestone', {
      code: 'two-tasks',
      name: 'Два задания',
      sender: 'bot',
      type: 'task_done',
      count: 2,
    });
    const listed = app.analytics.people.list();
    expect(listed.stale).toBe(0);
    expect(listed.people[0]!.milestones['two-tasks']).toEqual({
      state: 'reached',
      reachedAt: '2027-11-03T10:00:00.000Z',
      from: '2027-11-01T10:00:00.000Z',
      until: null,
    });
    // Свойство-разрез, отмеченное в настройке, тоже доходит до людей без перезапуска.
    app.analytics.setup.save('property', {
      scope: 'event',
      code: 'items_n',
      dimension: true,
    });
    expect(app.analytics.people.list().people[0]!.dims).toEqual({ items_n: 1 });
  });

  it('«незнакомые» значения частей: по первым и последним касаниям, с частью и отправителем; архив — знакомый', async () => {
    await send(
      event(
        'bot_start',
        '2027-11-01T09:00:00Z',
        { label: 'w-trial__xx__paid' },
        { first_touch: { label: 'bio__xx__zz', at: '2027-10-30T09:00:00Z' } }
      )
    );
    // Одно касание — и первое, и последнее: считается раз.
    await send(
      event(
        'bot_start',
        '2027-11-02T09:00:00Z',
        { label: 'post__xx__organic__autumn__ad-9' },
        { subject: OTHER }
      )
    );
    app.analytics.setup.archive(
      'value',
      { dictionary: 'channel', code: 'seo' },
      true
    );
    await send(
      event(
        'bot_start',
        '2027-11-03T09:00:00Z',
        { label: 'post__ig__seo' },
        { subject: 'u_archived_seo' }
      )
    );
    expect(app.analytics.unknown().parts).toEqual([
      { sender: 'bot', part: 'source', value: 'xx', count: 3 },
      { sender: 'bot', part: 'channel', value: 'zz', count: 1 },
      { sender: 'bot', part: 'creative', value: 'ad-9', count: 1 },
    ]);
    // Значение создали — оно знакомо сразу, без пересчёта людей.
    app.analytics.setup.save('value', {
      dictionary: 'source',
      code: 'xx',
      name: 'Новый источник',
    });
    expect(app.analytics.unknown().parts.map((_) => _.value)).toEqual([
      'zz',
      'ad-9',
    ]);
  });
});

// Таблица людей этапа 1 — как её создала миграция analytics/001.
const STAGE1_PEOPLE = `
  CREATE TABLE analytics_people (
    subject TEXT PRIMARY KEY, test INTEGER NOT NULL, senders TEXT NOT NULL,
    first_at TEXT NOT NULL, last_at TEXT NOT NULL, events INTEGER NOT NULL, invalid INTEGER NOT NULL,
    first_touch_label TEXT, first_touch_at TEXT, first_touch_conflict INTEGER NOT NULL,
    last_touch_label TEXT, last_touch_at TEXT, answers TEXT NOT NULL,
    trial_at TEXT, trial_ends_at TEXT,
    payments INTEGER NOT NULL, first_paid_at TEXT, last_paid_at TEXT, paid_until TEXT,
    lapsed_at TEXT, returned_at TEXT, revenue TEXT NOT NULL, fees TEXT NOT NULL,
    traits TEXT NOT NULL, revision INTEGER NOT NULL
  ) WITHOUT ROWID`;

const STAGE1_COLUMNS = `subject, test, senders, first_at, last_at, events, invalid, first_touch_label,
  first_touch_at, first_touch_conflict, last_touch_label, last_touch_at, answers, trial_at, trial_ends_at,
  payments, first_paid_at, last_paid_at, paid_until, lapsed_at, returned_at, revenue, fees, traits, revision`;

// База, какой её оставил Eile этапа 1 с настройкой части 1: люди старого вида посчитаны, проход дошёл до конца.
// Миграцию 009 база этапов 1–3 ещё не видела: ни выписок, ни отметки сверки свойства, ни индекса денег людей.
const before009 = (db: Database): void => (
  db.run('DROP TABLE analytics_statements'),
  db.run('ALTER TABLE analytics_properties DROP COLUMN reconcile'),
  db.run('DROP INDEX IF EXISTS analytics_people_money'),
  void db.run("DELETE FROM _migrations WHERE id = 'analytics/009_statements'")
);

const downgrade = (path: string): void => {
  const db = new Database(path);
  db.transaction(() => {
    before009(db);
    db.run('ALTER TABLE analytics_people RENAME TO people_stage2');
    db.run(STAGE1_PEOPLE);
    db.run(
      `INSERT INTO analytics_people (${STAGE1_COLUMNS}) SELECT ${STAGE1_COLUMNS} FROM people_stage2`
    );
    db.run('DROP TABLE people_stage2');
    db.run('CREATE INDEX analytics_people_last ON analytics_people (last_at)');
    db.run(
      'CREATE INDEX analytics_people_first ON analytics_people (first_at)'
    );
    // Миграции людей 003 и 006 база этапа 1 ещё не видела.
    db.run(
      "DELETE FROM _migrations WHERE id IN ('analytics/003_people_stage2', 'analytics/006_people_stage3')"
    );
  })();
  db.close();
};

describe('обновление до людей этапа 2', () => {
  it('миграция 003: люди старого вида уходят, фон строит их заново — как с нуля; копии восстанавливаются', async () => {
    await customer();
    await returner();
    await send(
      event(
        'bot_start',
        '2027-11-10T09:00:00Z',
        {},
        { subject: 'u_test_one', test: true }
      )
    );
    expect(app.analytics.people.list({ test: true }).total).toBe(3);
    app.close();
    downgrade(siteDb());
    const old = join(dir, 'stage1.db');
    copyFileSync(siteDb(), old);
    expect(count('analytics_people')).toBe(3);

    app = open(siteDb());
    // Таблица нового вида пуста, строки сборки нет: список скажет «пересчитывается», фон начнёт сначала.
    expect(count('analytics_people')).toBe(0);
    expect(count('analytics_people_build')).toBe(0);
    expect(app.analytics.people.stale()).toBe(3);
    const stop = app.analytics.start();
    try {
      expect(app.analytics.people.list({ test: true }).stale).toBe(3);
      for (let i = 0; i < 100 && app.analytics.people.stale() > 0; i++) {
        await Bun.sleep(10);
      }
    } finally {
      stop();
    }
    const listed = app.analytics.people.list({ test: true, limit: 200 });
    expect(listed).toMatchObject({ total: 3, stale: 0 });
    // Строка из таблицы — то же, что карточка, свёрнутая заново.
    for (const person of listed.people) {
      const { money, feeMoney, access, firsts, unmatched, ...card } =
        app.analytics.people.get(person.subject).person;
      const { state, ...row } = person;
      expect([row.subject, row]).toEqual([person.subject, card]);
      expect(state).toBe(app.analytics.people.get(person.subject).state);
    }
    expect(
      listed.people.find((_) => _.subject === OTHER)!.returns
    ).toHaveLength(1);
    const built = peopleRows();
    // Построенные с нуля — те же строки.
    const raw = new Database(siteDb());
    raw.run('DELETE FROM analytics_people');
    raw.run('DELETE FROM analytics_people_build');
    raw.close();
    app.analytics.people.refresh();
    expect(peopleRows()).toEqual(built);

    // Копия .db, сделанная до обновления: миграция 003 доходит и до неё, люди строятся заново.
    await app.restore(await Bun.file(old).bytes());
    expect(app.analytics.people.list({ test: true }).total).toBe(3);
    expect(peopleRows()).toEqual(built);
    // JSON-копия — нынешняя и без миграций людей 003 и 006 в списке: люди в неё не идут, строятся заново.
    const archive = app.archive();
    await app.restore(new TextEncoder().encode(JSON.stringify(archive)));
    expect(app.analytics.people.stale()).toBe(3);
    app.analytics.people.list();
    expect(peopleRows()).toEqual(built);
    await app.restore(
      new TextEncoder().encode(
        JSON.stringify({
          ...archive,
          migrations: archive.migrations.filter(
            (_: string) =>
              _ !== 'analytics/003_people_stage2' &&
              _ !== 'analytics/006_people_stage3'
          ),
        })
      )
    );
    app.analytics.people.list();
    expect(peopleRows()).toEqual(built);
    expect(app.analytics.people.get(OTHER).person.returns).toHaveLength(1);
  });
});

// Клиент этапа 3: комиссия уточнена позже оплаты, ушёл и вернулся с оплатой в PLN, комиссия которой — в EUR, и
// вернул её; возврат пришёл раньше своей оплаты. Ответ — отправленные события: их можно прислать повтором.
const payer = async (subject = SUBJECT) => {
  const sent: ReturnType<typeof event>[] = [];
  const one = (type: string, at: string, data = {}) =>
    ((body) => (sent.push(body), send(body)))(
      event(type, at, data, { subject })
    );
  await one('bot_start', '2027-06-01T10:00:00Z', { label: 'post__ig__paid' });
  await one('purchase', '2027-06-02T10:00:00Z', {
    ...PAID,
    plan: '1m',
    amount: '19.00',
    payment_id: 'pi_june',
    paid_until: '2027-07-02T10:00:00Z',
    fee: '0.80',
  });
  await one('fee_settled', '2027-06-10T10:00:00Z', {
    payment_id: 'pi_june',
    fee: '0.90',
  });
  await one('access_ended', '2027-07-02T10:00:00Z');
  await one('refund', '2027-10-25T10:00:00Z', {
    amount: '100.00',
    currency: 'PLN',
    payment_id: 'pi_october',
  });
  await one('fee_settled', '2027-10-19T10:00:00Z', {
    payment_id: 'pi_october',
    fee: '0.50',
    currency: 'EUR',
  });
  await one('purchase', '2027-10-18T10:00:00Z', {
    ...PAID,
    plan: '1m',
    amount: '100.00',
    currency: 'PLN',
    payment_id: 'pi_october',
    paid_until: '2027-11-18T10:00:00Z',
  });
  return sent;
};

// Таблица людей этапа 2 — как её создала миграция analytics/003.
const STAGE2_COLUMNS = `subject, test, senders, first_at, last_at, events, invalid, arrived_at, first_touch_label,
  first_touch_at, first_touch_sender, first_touch_conflict, first_parts, last_touch_label, last_touch_at,
  last_touch_sender, last_parts, returns, answers, trial_at, trial_ends_at, payments, first_paid_at, last_paid_at,
  paid_until, first_term_end, lapsed_at, returned_at, revenue, fees, money, milestones, firsts, dims, traits,
  revision`;

// База, какой её оставил Eile этапа 2 с частью 1 этапа 3: люди без комиссий по времени и доступа посчитаны,
// у возвратов нет момента курса, проход дошёл до конца.
const downgradeStage2 = (path: string): void => {
  const db = new Database(path);
  db.transaction(() => {
    db.run('ALTER TABLE analytics_people RENAME TO people_stage3');
    db.run(`
      CREATE TABLE analytics_people (
        subject TEXT NOT NULL UNIQUE, test INTEGER NOT NULL, senders TEXT NOT NULL,
        first_at TEXT NOT NULL, last_at TEXT NOT NULL, events INTEGER NOT NULL, invalid INTEGER NOT NULL,
        arrived_at TEXT NOT NULL,
        first_touch_label TEXT, first_touch_at TEXT, first_touch_sender TEXT, first_touch_conflict INTEGER NOT NULL,
        first_parts TEXT NOT NULL,
        last_touch_label TEXT, last_touch_at TEXT, last_touch_sender TEXT,
        last_parts TEXT NOT NULL,
        returns TEXT NOT NULL,
        answers TEXT NOT NULL, trial_at TEXT, trial_ends_at TEXT,
        payments INTEGER NOT NULL, first_paid_at TEXT, last_paid_at TEXT, paid_until TEXT,
        first_term_end TEXT,
        lapsed_at TEXT, returned_at TEXT, revenue TEXT NOT NULL, fees TEXT NOT NULL,
        money TEXT NOT NULL,
        milestones TEXT NOT NULL,
        firsts TEXT NOT NULL,
        dims TEXT NOT NULL,
        traits TEXT NOT NULL, revision INTEGER NOT NULL
      )`);
    db.run(
      `INSERT INTO analytics_people (${STAGE2_COLUMNS}) SELECT ${STAGE2_COLUMNS} FROM people_stage3`
    );
    db.run(`
      UPDATE analytics_people SET money = (
        SELECT json_group_array(json_array(m.value ->> 0, m.value ->> 1, m.value ->> 2)) FROM json_each(money) m
      )`);
    db.run('DROP TABLE people_stage3');
    db.run(
      'CREATE INDEX analytics_people_last ON analytics_people (last_at, subject)'
    );
    db.run(`CREATE INDEX analytics_people_list ON analytics_people
      (test, payments, trial_at, lapsed_at, paid_until, returned_at, senders, subject, revision)`);
    db.run(
      'CREATE INDEX analytics_people_first ON analytics_people (first_at)'
    );
    db.run(
      'CREATE INDEX analytics_people_arrived ON analytics_people (arrived_at)'
    );
    db.run("DELETE FROM _migrations WHERE id = 'analytics/006_people_stage3'");
    before009(db);
  })();
  db.close();
};

describe('люди этапа 3', () => {
  it('карточка: момент курса возврата, комиссии по времени и отрезки доступа; список их не отдаёт', async () => {
    const sent = await payer();
    const card = app.analytics.people.get(SUBJECT).person;
    // Возврат пришёл раньше своей оплаты, а по времени он позже неё: курс — дня оплаты.
    expect(card.money).toEqual([
      ['2027-06-02T10:00:00.000Z', 'EUR', 1900],
      ['2027-10-18T10:00:00.000Z', 'PLN', 10_000],
      ['2027-10-25T10:00:00.000Z', 'PLN', -10_000, '2027-10-18T10:00:00.000Z'],
    ]);
    // Уточнение через неделю меняет комиссию дня оплаты; комиссия в EUR у оплаты в PLN — в своей валюте.
    expect(card.feeMoney).toEqual([
      ['2027-06-02T10:00:00.000Z', 'EUR', 90],
      ['2027-10-18T10:00:00.000Z', 'EUR', 50],
    ]);
    expect(card.fees).toEqual({ EUR: 140 });
    expect(card.access).toEqual([
      ['2027-06-02T10:00:00.000Z', '2027-07-02T10:00:00.000Z'],
      ['2027-10-18T10:00:00.000Z', '2027-11-18T10:00:00.000Z'],
    ]);
    expect(app.analytics.people.get(SUBJECT).state).toBe('returned');
    const listed = app.analytics.people.list().people[0]!;
    for (const fact of ['money', 'feeMoney', 'access', 'firsts']) {
      expect(listed).not.toHaveProperty(fact);
    }
    // В таблице людей — то же, что в карточке.
    const row = peopleRows()[0] as Record<string, string>;
    expect(JSON.parse(row.money!)).toEqual(card.money);
    expect(JSON.parse(row.fee_money!)).toEqual(card.feeMoney);
    expect(JSON.parse(row.access!)).toEqual(card.access);
    // Повторы в обратном порядке итога не меняют.
    for (const body of sent.toReversed()) {
      expect((await send(body)).body).toEqual({ ok: true, duplicate: true });
    }
    expect(app.analytics.people.get(SUBJECT).person).toEqual(card);
    expect(peopleRows()[0]).toEqual(row);
  });

  it('миграция 006: люди этапа 2 уходят, фон строит их заново — как с нуля; копии до 005 и 006 восстанавливаются', async () => {
    await customer();
    await returner();
    await payer('u_payer_three');
    await send(
      event(
        'purchase',
        '2027-11-10T09:00:00Z',
        { ...PAID, payment_id: 'pi_test', fee: '1.00' },
        { subject: 'u_test_one', test: true }
      )
    );
    expect(app.analytics.people.list({ test: true }).total).toBe(4);
    app.close();
    downgradeStage2(siteDb());
    const old = join(dir, 'stage2.db');
    copyFileSync(siteDb(), old);
    expect(count('analytics_people')).toBe(4);

    app = open(siteDb());
    // Таблица нового вида пуста, строки сборки нет: список скажет «пересчитывается», фон начнёт сначала.
    expect(count('analytics_people')).toBe(0);
    expect(count('analytics_people_build')).toBe(0);
    expect(app.analytics.people.stale()).toBe(4);
    const stop = app.analytics.start();
    try {
      expect(app.analytics.people.list({ test: true }).stale).toBe(4);
      for (let i = 0; i < 100 && app.analytics.people.stale() > 0; i++) {
        await Bun.sleep(10);
      }
    } finally {
      stop();
    }
    const listed = app.analytics.people.list({ test: true, limit: 200 });
    expect(listed).toMatchObject({ total: 4, stale: 0 });
    for (const person of listed.people) {
      const { money, feeMoney, access, firsts, unmatched, ...card } =
        app.analytics.people.get(person.subject).person;
      const { state, ...row } = person;
      expect([row.subject, row]).toEqual([person.subject, card]);
    }
    // Частичный индекс — только у клиентов: человек без оплат его не трогает.
    const raw = new Database(siteDb());
    expect(
      raw
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_master WHERE name = 'analytics_people_paid'"
        )
        .get()!.sql
    ).toContain('WHERE first_paid_at IS NOT NULL');
    expect(
      raw
        .query<{ detail: string }, [string]>(`
          EXPLAIN QUERY PLAN SELECT subject FROM analytics_people
          WHERE first_paid_at >= ? AND first_paid_at IS NOT NULL`)
        .all('2027-01-01')
        .map((_) => _.detail)
        .join()
    ).toContain('analytics_people_paid');
    raw.close();
    const built = peopleRows();
    const card = (subject: string) => app.analytics.people.get(subject).person;
    expect(card('u_payer_three').money.at(-1)).toEqual([
      '2027-10-25T10:00:00.000Z',
      'PLN',
      -10_000,
      '2027-10-18T10:00:00.000Z',
    ]);
    expect(card('u_test_one')).toMatchObject({
      test: true,
      feeMoney: [['2027-11-10T09:00:00.000Z', 'EUR', 100]],
      access: [['2027-11-10T09:00:00.000Z', null]],
    });
    // Построенные с нуля — те же строки.
    const fresh = new Database(siteDb());
    fresh.run('DELETE FROM analytics_people');
    fresh.run('DELETE FROM analytics_people_build');
    fresh.close();
    app.analytics.people.refresh();
    expect(peopleRows()).toEqual(built);

    // Копия .db, сделанная до обновления: миграция 006 доходит и до неё, люди строятся заново.
    await app.restore(await Bun.file(old).bytes());
    expect(app.analytics.people.list({ test: true }).total).toBe(4);
    expect(peopleRows()).toEqual(built);
    // JSON-копия — нынешняя, сделанная до 006 и до 005: люди в неё не идут, строятся заново.
    const archive = app.archive();
    expect(archive.tables).not.toHaveProperty('analytics_people');
    for (const skip of [
      [],
      ['analytics/006_people_stage3'],
      ['analytics/005_money', 'analytics/006_people_stage3'],
    ]) {
      await app.restore(
        new TextEncoder().encode(
          JSON.stringify({
            ...archive,
            migrations: archive.migrations.filter(
              (_: string) => !skip.includes(_)
            ),
          })
        )
      );
      expect([skip, app.analytics.people.stale()]).toEqual([skip, 4]);
      app.analytics.people.list();
      expect([skip, peopleRows()]).toEqual([skip, built]);
    }
    expect(card('u_payer_three').feeMoney).toHaveLength(2);
  });
});
