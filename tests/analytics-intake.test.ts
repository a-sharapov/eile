import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import {
  canonicalJson,
  type SetupAuthor,
} from '../src/contexts/analytics/index.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';
import { DEMO } from './fixtures/demo.ts';

const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };
const START = '2027-11-14T18:30:00.000Z';
const SUBJECT = 'u_3b9e0c7a1f';

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

const sha256 = (text: string, encoding: 'hex' | 'base64url' = 'hex') =>
  new Bun.CryptoHasher('sha256').update(text).digest(encoding);

const from = (address: string) => ({ requestIP: () => ({ address }) });

type Sent = {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
};

type Options = {
  /** null — без заголовка Authorization. */
  readonly key?: string | null;
  readonly address?: string;
  readonly method?: string;
  readonly raw?: RequestInit['body'];
  readonly to?: App;
};

const send = (body: unknown, options: Options = {}): Promise<Sent> =>
  (options.to ?? app)
    .fetch(
      new Request('http://localhost/_cms/events', {
        method: options.method ?? 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.key === null
            ? {}
            : { authorization: `Bearer ${options.key ?? key}` }),
        },
        body:
          options.method === 'GET'
            ? undefined
            : (options.raw ?? JSON.stringify(body)),
      }),
      from(options.address ?? '192.0.2.10')
    )
    .then((response) =>
      response.json().then((json) => ({
        status: response.status,
        headers: response.headers,
        body: json as Record<string, unknown>,
      }))
    );

const event = (
  type: string,
  data: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
) => ({
  id: `evt_${++ids}`,
  type,
  at: '2027-11-14T18:22:05Z',
  subject: SUBJECT,
  data,
  ...extra,
});

const PAID = {
  amount: '109.00',
  currency: 'EUR',
  payment_id: 'pi_3Q8x',
  plan: '3m',
  format: 'self',
};

const siteDb = (): string => join(dir, 'site.db');

const rows = <T>(path: string, sql: string, ...values: string[]): T[] => {
  const db = new Database(path, { readonly: true });
  const found = db.query<T, string[]>(sql).all(...values);
  db.close();
  return found;
};

const count = (path: string, table: string, where = '1'): number =>
  rows<{ n: number }>(
    path,
    `SELECT count(*) AS n FROM ${table} WHERE ${where}`
  )[0]!.n;

const open = (path: string): App =>
  createApp({
    databasePath: path,
    mediaCache: `${path}.cache`,
    clock: () => now,
  });

beforeEach(() => {
  now = new Date(START);
  dir = mkdtempSync(join(tmpdir(), 'cms-intake-'));
  app = open(siteDb());
  app.analytics.setup.apply(SUBSCRIPTION, ANNA);
  app.analytics.settings.save({ enabled: true }, ANNA);
  key = app.analytics.senders.issue('bot', 'Бот на сервере', ANNA).key;
});

afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('приёмник: порядок проверок и ответы', () => {
  it('приём выключен — 503 и на POST, и на GET, до ключа и тела', async () => {
    app.analytics.settings.save({ enabled: false });
    const refused = await send('не JSON', { key: null, raw: 'x' });
    expect(refused).toMatchObject({
      status: 503,
      body: { ok: false, error: 'disabled' },
    });
    expect(refused.headers.get('retry-after')).toBe('3600');
    expect(refused.headers.get('cache-control')).toBe('no-store');
    expect(refused.headers.get('content-type')).toContain('application/json');
    expect((await send(null, { method: 'GET' })).status).toBe(503);
    expect(code(() => app.analytics.intake.accept('bot', '{}', 'file'))).toBe(
      'analytics.disabled'
    );
  });

  it('метод не POST — 405 с Allow', async () => {
    const answer = await send(null, { method: 'GET' });
    expect(answer).toMatchObject({
      status: 405,
      body: { ok: false, error: 'method_not_allowed' },
    });
    expect(answer.headers.get('allow')).toBe('POST');
    expect((await send({}, { method: 'PUT' })).status).toBe(405);
  });

  it('принято — 200 {ok:true}; тело хранится как пришло, момент — в UTC', async () => {
    const purchase = {
      ...event('purchase', PAID),
      at: '2027-11-14T20:22:05+02:00',
      traits: { lang: 'ru' },
    };
    expect(await send(purchase)).toMatchObject({
      status: 200,
      body: { ok: true },
    });
    expect(
      rows(
        siteDb(),
        'SELECT sender, id, type, at, subject, test, origin, body, hash FROM analytics_events'
      )
    ).toEqual([
      {
        sender: 'bot',
        id: purchase.id,
        type: 'purchase',
        at: '2027-11-14T18:22:05.000Z',
        subject: SUBJECT,
        test: 0,
        origin: 'http',
        body: JSON.stringify(purchase),
        hash: sha256(canonicalJson(purchase), 'base64url'),
      },
    ]);
  });

  it('повтор не удваивает: тот же id — duplicate, и при другом порядке ключей', async () => {
    const start = event('bot_start', { label: 'post__blog' });
    expect((await send(start)).body).toEqual({ ok: true });
    expect((await send(start)).body).toEqual({ ok: true, duplicate: true });
    const reordered = Object.fromEntries(Object.entries(start).toReversed());
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(start));
    expect((await send(reordered)).body).toEqual({
      ok: true,
      duplicate: true,
    });
    expect(count(siteDb(), 'analytics_events')).toBe(1);
    expect(count(siteDb(), 'analytics_conflicts')).toBe(0);
  });

  it('конфликт повтора записан: счётчик и последнее тело, первое событие осталось', async () => {
    const first = event('purchase', PAID);
    await send(first);
    const second = { ...first, data: { ...PAID, amount: '110.00' } };
    const third = { ...first, data: { ...PAID, amount: '111.00' } };
    expect((await send(second)).body).toEqual({
      ok: true,
      duplicate: true,
      conflict: true,
    });
    now = new Date('2027-11-14T18:31:00.000Z');
    await send(third);
    expect(rows(siteDb(), 'SELECT body FROM analytics_events')).toEqual([
      { body: JSON.stringify(first) },
    ]);
    expect(
      rows(
        siteDb(),
        'SELECT sender, id, subject, count, first_at, last_at, body FROM analytics_conflicts'
      )
    ).toEqual([
      {
        sender: 'bot',
        id: first.id,
        subject: SUBJECT,
        count: 2,
        first_at: START,
        last_at: '2027-11-14T18:31:00.000Z',
        body: JSON.stringify(third),
      },
    ]);
  });

  it('повтор — до проверки: по нынешней настройке событие не прошло бы, а ответ 200', async () => {
    const task = event('task_done', { items_n: 12 });
    await send(task);
    app.analytics.setup.save('type', {
      sender: 'bot',
      code: 'task_done',
      properties: [
        { code: 'items_n', required: true },
        { code: 'own_material', required: true },
      ],
    });
    expect((await send(task)).body).toEqual({ ok: true, duplicate: true });
    expect((await send({ ...task, id: 'evt_new' })).status).toBe(400);
  });

  it('незнакомый тип принят с предупреждением; событие из будущего — тоже', async () => {
    expect((await send(event('gift_sent'))).body).toEqual({
      ok: true,
      warnings: ['unknown_type'],
    });
    expect(
      (await send(event('bot_start', {}, { at: '2027-11-15T00:00:00Z' }))).body
    ).toEqual({ ok: true, warnings: ['future'] });
    expect(count(siteDb(), 'analytics_events')).toBe(2);
  });

  it('ошибки по полям — все сразу; лишнее поле конверта — ошибка', async () => {
    const answer = await send({
      id: 'evt_1',
      type: 'purchase',
      at: '2027-11-14',
      subjet: SUBJECT,
      data: { currency: 'EUR', plan: '3m' },
    });
    expect(answer.status).toBe(400);
    expect(answer.body.ok).toBe(false);
    expect(Object.keys(answer.body.errors as object).toSorted()).toEqual([
      'at',
      'data.amount',
      'data.format',
      'subject',
      'subjet',
    ]);
    expect(count(siteDb(), 'analytics_events')).toBe(0);
  });

  it('неверный id — 400 с ошибкой id, вместе с остальными', async () => {
    const answer = await send({ ...event('bot_start'), id: 'evt 1', at: 7 });
    expect(answer.status).toBe(400);
    expect(Object.keys(answer.body.errors as object)).toEqual(['id', 'at']);
  });

  it('псевдоним из одних цифр и с @ — 400', async () => {
    for (const subject of ['123456789', 'anna@example.com', '+491701234567']) {
      const answer = await send(event('bot_start', {}, { subject }));
      expect(answer.status).toBe(400);
      expect(Object.keys(answer.body.errors as object)).toEqual(['subject']);
    }
  });

  it('необязательное свойство с негодным значением — принято с предупреждением, обязательное — 400', async () => {
    const refund = event('refund', { ...PAID, plan: 'RU', format: '1 m' });
    expect((await send(refund)).body).toEqual({
      ok: true,
      warnings: ['invalid_value:data.plan', 'invalid_value:data.format'],
    });
    const purchase = await send(event('purchase', { ...PAID, plan: 'RU' }));
    expect(purchase.status).toBe(400);
    expect(purchase.body.errors).toEqual({
      'data.plan': 'is a code: a-z 0-9 _ - up to 60 characters',
    });
    expect(
      (await send(event('purchase', { ...PAID, plan: '6m' }))).body
    ).toEqual({ ok: true, warnings: ['unknown_value:data.plan'] });
  });

  it('401: ключа нет, он неверный, отозван, отправитель в архиве или выключен', async () => {
    const unauthorized = async (options: Options) => {
      const answer = await send(event('bot_start'), options);
      expect(answer).toMatchObject({
        status: 401,
        body: { ok: false, error: 'unauthorized' },
      });
      expect(answer.headers.get('www-authenticate')).toBe('Bearer');
    };
    await unauthorized({ key: null, address: '198.51.100.1' });
    await unauthorized({ key: `${key}x`, address: '198.51.100.2' });
    await unauthorized({ key: 'cms_foreign', address: '198.51.100.3' });

    const spare = app.analytics.senders.issue('bot', 'Запасной', ANNA);
    expect((await send(event('bot_start'), { key: spare.key })).status).toBe(
      200
    );
    app.analytics.senders.revoke('bot', spare.id);
    await unauthorized({ key: spare.key, address: '198.51.100.4' });

    app.analytics.senders.archive('bot', true, ANNA);
    await unauthorized({ address: '198.51.100.5' });
    app.analytics.senders.archive('bot', false, ANNA);
    expect((await send(event('bot_start'))).status).toBe(200);

    app.analytics.senders.save({ code: 'bot', enabled: false }, ANNA);
    await unauthorized({ address: '198.51.100.6' });
    expect(count(siteDb(), 'analytics_events')).toBe(2);
  });

  it('429 после пяти неверных ключей с адреса — до конца окна; другой адрес не заперт', async () => {
    const attacker = '203.0.113.9';
    for (const n of [1, 2, 3, 4, 5]) {
      expect(
        (await send(event('bot_start'), { key: `evk_${n}`, address: attacker }))
          .status
      ).toBe(401);
    }
    now = new Date('2027-11-14T18:40:00.000Z');
    const throttled = await send(event('bot_start'), { address: attacker });
    expect(throttled).toMatchObject({
      status: 429,
      body: { ok: false, error: 'throttled' },
    });
    expect(throttled.headers.get('retry-after')).toBe('300');
    expect(
      (await send(event('bot_start'), { address: '203.0.113.10' })).status
    ).toBe(200);
    now = new Date('2027-11-14T18:44:59.000Z');
    expect((await send(event('bot_start'), { address: attacker })).status).toBe(
      429
    );
    now = new Date('2027-11-14T18:45:00.000Z');
    expect((await send(event('bot_start'), { address: attacker })).status).toBe(
      200
    );
  });

  it('тело больше 64 КБ, не UTF-8 и не JSON-объект — 400 с ошибкой body', async () => {
    const body = (raw: RequestInit['body']) =>
      send(null, { raw }).then((_) => [_.status, _.body.errors]);
    const big = JSON.stringify({
      ...event('bot_start'),
      data: { label: 'x'.repeat(70_000) },
    });
    expect(await body(big)).toEqual([
      400,
      { body: 'is larger than 65536 bytes' },
    ]);
    // Без Content-Length (chunked) предел действует по ходу чтения.
    expect(
      await body(
        new ReadableStream({
          start: (controller) => (
            controller.enqueue(new TextEncoder().encode(big)),
            controller.close()
          ),
        })
      )
    ).toEqual([400, { body: 'is larger than 65536 bytes' }]);
    expect(await body(new Uint8Array([0x7b, 0xff, 0x7d]))).toEqual([
      400,
      { body: 'is not UTF-8' },
    ]);
    expect(await body('{"id":')).toEqual([
      400,
      { body: 'is not a JSON object' },
    ]);
    expect(await body('[]')).toEqual([400, { body: 'is not a JSON object' }]);
    expect(await body('')).toEqual([400, { body: 'is not a JSON object' }]);
  });

  it('отказы — в памяти: последние 50, новые сверху, с отправителем и причиной', async () => {
    await send(event('bot_start'), { key: null, address: '198.51.100.7' });
    now = new Date('2027-11-14T18:31:00.000Z');
    await send({ ...event('bot_start'), id: 'evt_bad', at: 'вчера' });
    expect(app.analytics.intake.refusals()).toEqual([
      {
        at: '2027-11-14T18:31:00.000Z',
        reason: 'invalid',
        sender: 'bot',
        id: 'evt_bad',
        errors: {
          at: 'is ISO 8601 with a time zone (Z or +02:00), not before 2000-01-01',
        },
      },
      {
        at: START,
        reason: 'unauthorized',
        sender: null,
        id: null,
        errors: {},
      },
    ]);
    for (let n = 0; n < 55; n++) {
      await send(null, { raw: 'x' });
    }
    expect(app.analytics.intake.refusals()).toHaveLength(50);
    expect(app.analytics.intake.refusals()[0]!.errors).toEqual({
      body: 'is not a JSON object',
    });
  });
});

describe('удаление событием', () => {
  let shop: string;
  const users = (subject = SUBJECT) =>
    count(siteDb(), 'analytics_events', `subject = '${subject}'`);

  beforeEach(async () => {
    shop = app.analytics.senders.save({ code: 'shop', name: 'Магазин' }, ANNA)
      .key!.key;
    await send(
      event('bot_start', {}, { at: '2027-11-10T09:00:00Z', id: 'evt_start' })
    );
    await send(event('purchase', PAID, { at: '2027-11-12T09:00:00Z' }));
    await send(event('order_paid', {}, { at: '2027-11-12T10:00:00Z' }), {
      key: shop,
    });
    await send(event('bot_start', {}, { subject: 'u_other_person' }));
    // Конфликт повтора с псевдонимом — тоже его данные.
    await send({
      ...event('bot_start', {}, { at: '2027-11-10T09:00:00Z' }),
      id: 'evt_start',
      data: { label: 'другое тело' },
    });
  });

  it('стирает события псевдонима от всех отправителей и конфликты, оставляет отметку', async () => {
    expect(users()).toBe(3);
    expect(count(siteDb(), 'analytics_conflicts')).toBe(1);
    now = new Date('2027-11-14T18:31:00.000Z');
    expect(
      (await send(event('user_deleted', {}, { at: '2027-11-14T12:00:00Z' })))
        .body
    ).toEqual({ ok: true });
    expect(users()).toBe(0);
    expect(users('u_other_person')).toBe(1);
    expect(count(siteDb(), 'analytics_conflicts')).toBe(0);
    expect(count(siteDb(), 'analytics_events', "type = 'user_deleted'")).toBe(
      0
    );
    expect(
      rows(
        siteDb(),
        'SELECT at, before, origin, sender, user_name, events, people, subject_hash FROM analytics_erasures'
      )
    ).toEqual([
      {
        at: '2027-11-14T18:31:00.000Z',
        before: '2027-11-14T12:00:00.000Z',
        origin: 'event',
        sender: 'bot',
        user_name: null,
        events: 3,
        people: 1,
        subject_hash: sha256(SUBJECT),
      },
    ]);
    const marks = JSON.stringify(
      rows(siteDb(), 'SELECT * FROM analytics_erasures')
    );
    expect(marks).not.toContain(SUBJECT);
  });

  it('опоздавший повтор получает «стёрто» и не хранится; событие после момента принимается', async () => {
    const erasure = event('user_deleted', {}, { at: '2027-11-14T12:00:00Z' });
    await send(erasure);
    expect(
      (
        await send(
          event(
            'bot_start',
            {},
            { at: '2027-11-10T09:00:00Z', id: 'evt_start' }
          )
        )
      ).body
    ).toEqual({ ok: true, erased: true });
    expect(
      (
        await send(event('order_paid', {}, { at: '2027-11-14T12:00:00Z' }), {
          key: shop,
        })
      ).body
    ).toEqual({ ok: true, erased: true });
    expect((await send(erasure)).body).toEqual({ ok: true, erased: true });
    expect(users()).toBe(0);
    expect(
      (await send(event('bot_start', {}, { at: '2027-11-14T12:00:01Z' }))).body
    ).toEqual({ ok: true });
    expect(users()).toBe(1);
    expect(count(siteDb(), 'analytics_erasures')).toBe(1);
  });

  it('событие после момента удаления, принятое раньше него, остаётся: порядок прихода не важен', async () => {
    await send(event('bot_start', {}, { at: '2027-11-14T13:00:00Z' }));
    await send(event('user_deleted', {}, { at: '2027-11-14T12:00:00Z' }));
    expect(
      rows<{ at: string }>(
        siteDb(),
        'SELECT at FROM analytics_events WHERE subject = ?',
        SUBJECT
      )
    ).toEqual([{ at: '2027-11-14T13:00:00.000Z' }]);
  });

  it('тестовое удаление стирает только тестовые события и отметки не оставляет', async () => {
    const trial = event('bot_start', {}, { test: true });
    await send(trial);
    expect(users()).toBe(4);
    expect(
      (await send(event('user_deleted', {}, { test: true }))).body
    ).toEqual({ ok: true });
    expect(users()).toBe(3);
    expect(count(siteDb(), 'analytics_events', 'test = 1')).toBe(0);
    expect(
      rows(siteDb(), 'SELECT events, subject_hash FROM analytics_erasures')
    ).toEqual([{ events: 1, subject_hash: null }]);
    expect((await send(trial)).body).toEqual({ ok: true });
  });

  it('удаление без псевдонима — 400, как у любой роли с псевдонимом', async () => {
    const answer = await send(event('user_deleted', {}, { subject: null }));
    expect(answer.status).toBe(400);
    expect(users()).toBe(3);
  });
});

describe('отправители и ключи', () => {
  it('ключ показан один раз: на сервере хэш и последние знаки; в списке — без хэша', () => {
    expect(key).toMatch(/^evk_[A-Za-z0-9_-]{43}$/);
    expect(
      rows(
        siteDb(),
        'SELECT sender, label, hash, hint FROM analytics_sender_keys'
      )
    ).toEqual([
      {
        sender: 'bot',
        label: 'Бот на сервере',
        hash: sha256(key),
        hint: key.slice(-4),
      },
    ]);
    const listed = app.analytics.senders.list();
    expect(listed.map((_) => [_.code, _.keys.length])).toEqual([['bot', 1]]);
    expect(Object.keys(listed[0]!.keys[0]!).toSorted()).toEqual([
      'createdAt',
      'hint',
      'id',
      'label',
      'sender',
      'usedAt',
    ]);
    expect(JSON.stringify(listed)).not.toContain(key);
  });

  it('новый отправитель получает ключ, правка — нет; подпись первого ключа — его название', () => {
    const created = app.analytics.senders.save(
      { code: 'shop', name: 'Магазин', note: 'Заказы' },
      ANNA
    );
    expect(created.sender).toMatchObject({ code: 'shop', enabled: true });
    expect(created.key).toMatchObject({ sender: 'shop', label: 'Магазин' });
    expect(created.key!.key).toStartWith('evk_');
    const edited = app.analytics.senders.save(
      { code: 'shop', name: 'Магазин на сайте' },
      ANNA
    );
    expect(edited).toMatchObject({
      sender: { name: 'Магазин на сайте', note: 'Заказы' },
      key: null,
    });
    // Ключ нового отправителя — своей строкой журнала, в той же транзакции.
    expect(
      app.analytics.log
        .setup()
        .slice(0, 3)
        .map((_) => [_.item, _.key, _.action, _.author])
    ).toEqual([
      ['sender', 'shop', 'changed', ANNA],
      ['key', `shop/${created.key!.id}`, 'created', ANNA],
      ['sender', 'shop', 'created', ANNA],
    ]);
  });

  it('до трёх ключей у отправителя; отзыв освобождает место; в архиве ключей не выпускают', () => {
    app.analytics.senders.issue('bot', 'Второй', ANNA);
    const third = app.analytics.senders.issue('bot', null, ANNA);
    expect(third.label).toBe('Бот подписки');
    expect(code(() => app.analytics.senders.issue('bot'))).toBe(
      'analytics.too_many'
    );
    app.analytics.senders.revoke('bot', third.id);
    expect(code(() => app.analytics.senders.revoke('bot', third.id))).toBe(
      'analytics.key_not_found'
    );
    const fourth = app.analytics.senders.issue('bot');
    expect(code(() => app.analytics.senders.issue('nobody'))).toBe(
      'analytics.item_not_found'
    );
    app.analytics.senders.archive('bot', true);
    app.analytics.senders.revoke('bot', fourth.id);
    expect(code(() => app.analytics.senders.issue('bot'))).toBe(
      'analytics.invalid_reference'
    );
  });

  it('выпуск ключа — в журнал сбоев как аудит', () => {
    expect(
      app.notify.incidents
        .list()
        .filter((_) => _.kind === 'analytics.sender_key_issued')
        .map((_) => _.detail)
    ).toEqual([
      {
        en: 'User #1 → bot',
        de: 'Benutzer #1 → bot',
        ru: 'Пользователь #1 → bot',
      },
    ]);
  });

  it('«когда пользовались» — с первым событием и не чаще раза в пять минут', async () => {
    const usedAt = () => app.analytics.senders.list()[0]!.keys[0]!.usedAt;
    expect(usedAt()).toBeNull();
    await send(event('bot_start'));
    expect(usedAt()).toBe(START);
    now = new Date('2027-11-14T18:34:59.000Z');
    await send(event('bot_start'));
    expect(usedAt()).toBe(START);
    expect(
      rows<{ used_at: string }>(
        siteDb(),
        'SELECT used_at FROM analytics_sender_keys'
      )
    ).toEqual([{ used_at: START }]);
    now = new Date('2027-11-14T18:35:00.000Z');
    await send(event('bot_start'));
    expect(usedAt()).toBe('2027-11-14T18:35:00.000Z');
  });

  it('удалённый отправитель уносит ключи: тот же код не получает прежний ключ', async () => {
    const created = app.analytics.senders.save({
      code: 'shop',
      name: 'Магазин',
    });
    app.analytics.setup.remove('sender', { code: 'shop' });
    app.analytics.senders.save({ code: 'shop', name: 'Новый магазин' });
    expect(
      (await send(event('order_paid'), { key: created.key!.key })).status
    ).toBe(401);
  });
});

describe('ключи и копии сайта', () => {
  it('ключа нет в копии сайта; события — в ней', async () => {
    await send(event('bot_start'));
    const target = join(dir, 'copy.db');
    app.backup(target);
    expect(count(target, 'analytics_sender_keys')).toBe(0);
    expect(count(target, 'analytics_events')).toBe(1);
    const tables = Object.keys(app.archive().tables);
    expect(tables).toContain('analytics_events');
    expect(tables).toContain('analytics_conflicts');
    expect(tables).toContain('analytics_erasures');
    expect(tables).not.toContain('analytics_sender_keys');
  });

  it('хэши ключей переезжают файлом настроек сервера: ключ работает на новой машине', async () => {
    const settings = app.serverSettings.read();
    expect(settings.senderKeys).toEqual([
      {
        sender: 'bot',
        label: 'Бот на сервере',
        keyHash: sha256(key),
        hint: key.slice(-4),
        createdAt: START,
      },
    ]);
    expect(JSON.stringify(settings)).not.toContain(key);
    const copy = join(dir, 'copy.db');
    app.backup(copy);
    const moved = open(join(dir, 'moved.db'));
    await moved.restore(await Bun.file(copy).bytes());
    expect(
      (await send(event('bot_start'), { to: moved, address: '192.0.2.20' }))
        .status
    ).toBe(401);
    expect(moved.serverSettings.apply(settings).senderKeys).toEqual({
      added: 1,
      present: 0,
      skipped: [],
    });
    expect(
      (await send(event('bot_start'), { to: moved, address: '192.0.2.21' }))
        .body
    ).toEqual({ ok: true });
    expect(moved.serverSettings.apply(settings).senderKeys).toEqual({
      added: 0,
      present: 1,
      skipped: [],
    });
    moved.close();

    const empty = open(join(dir, 'empty.db'));
    expect(empty.serverSettings.apply(settings).senderKeys).toEqual({
      added: 0,
      present: 0,
      skipped: ['bot'],
    });
    empty.close();
  });

  it('приём, ключи и удаления кэш страниц сайта не сбрасывают', async () => {
    const site = createApp({ scaffold: DEMO, clock: () => now });
    site.analytics.setup.apply(SUBSCRIPTION);
    site.analytics.settings.save({ enabled: true });
    const page = () => site.fetch(new Request('http://localhost/kontakty'));
    expect((await page()).headers.get('x-cache')).toBe('miss');
    const own = site.analytics.senders.issue('bot').key;
    expect(
      (await send(event('purchase', PAID), { to: site, key: own })).status
    ).toBe(200);
    expect(
      (await send(event('user_deleted'), { to: site, key: own })).status
    ).toBe(200);
    expect((await page()).headers.get('x-cache')).toBe('hit');
    site.close();
  });
});

type IntakeRow = {
  readonly day: string;
  readonly sender: string;
  readonly origin: string;
  readonly outcome: string;
  readonly count: number;
};

// Счёт приёма строками «сутки отправитель путь исход число»; отправитель '' — «-».
const lines = (found: readonly IntakeRow[]): string[] =>
  found.map(
    (_) => `${_.day} ${_.sender || '-'} ${_.origin} ${_.outcome} ${_.count}`
  );

const tally = (path = siteDb()): string[] =>
  lines(
    rows<IntakeRow>(
      path,
      'SELECT day, sender, origin, outcome, count FROM analytics_intake_daily ORDER BY day, sender, origin, outcome'
    )
  );

const erasedTally = (path = siteDb()): string[] =>
  rows<{
    day: string;
    sender: string;
    type: string;
    test: number;
    events: number;
  }>(
    path,
    'SELECT * FROM analytics_erased_daily ORDER BY day, sender, type, test'
  ).map((_) => `${_.day} ${_.sender} ${_.type} ${_.test} ${_.events}`);

const jsonlFile = (name: string, body: readonly unknown[]): string =>
  ((path) => (
    Bun.write(
      path,
      body
        .map((_) => (typeof _ === 'string' ? _ : JSON.stringify(_)))
        .join('\n')
    ),
    path
  ))(join(dir, name));

describe('счёт приёма по суткам', () => {
  it('исходы по сети — в транзакции события; отказы 400, 401, 429 и 503 — в памяти, в базе — после закрытия', async () => {
    const first = event('bot_start');
    expect((await send(first)).body).toEqual({ ok: true });
    expect((await send(first)).body).toEqual({ ok: true, duplicate: true });
    expect(
      (await send({ ...first, data: { label: 'другое тело' } })).body
    ).toMatchObject({ conflict: true });
    // Позже приёма больше чем на час и раньше больше чем на сутки — отметки среди принятых.
    await send(event('bot_start', {}, { at: '2027-11-14T21:00:00Z' }));
    await send(event('bot_start', {}, { at: '2027-11-10T09:00:00Z' }));
    expect((await send({ ...event('bot_start'), at: 'вчера' })).status).toBe(
      400
    );
    expect((await send(event('bot_start'), { key: null })).status).toBe(401);
    for (let n = 0; n < 5; n++) {
      await send(event('bot_start'), {
        key: 'evk_wrong',
        address: '198.51.100.9',
      });
    }
    expect(
      (
        await send(event('bot_start'), {
          key: 'evk_wrong',
          address: '198.51.100.9',
        })
      ).status
    ).toBe(429);
    app.analytics.settings.save({ enabled: false });
    expect((await send(event('bot_start'))).status).toBe(503);
    app.analytics.settings.save({ enabled: true });
    // В базе — только исходы событий: отказы ждут записи пачкой.
    expect(tally()).toEqual([
      '2027-11-14 bot http accepted 3',
      '2027-11-14 bot http conflict 1',
      '2027-11-14 bot http duplicate 1',
      '2027-11-14 bot http future 1',
      '2027-11-14 bot http late 1',
    ]);
    const all = [
      '2027-11-14 - http disabled 1',
      '2027-11-14 - http throttled 1',
      '2027-11-14 - http unauthorized 6',
      '2027-11-14 bot http accepted 3',
      '2027-11-14 bot http conflict 1',
      '2027-11-14 bot http duplicate 1',
      '2027-11-14 bot http future 1',
      '2027-11-14 bot http invalid 1',
      '2027-11-14 bot http late 1',
    ];
    // Чтение счёта видит и то, что ещё в памяти.
    const daily = app.analytics.intake.daily({ days: 1 });
    expect([daily.from, daily.to, lines(daily.days)]).toEqual([
      '2027-11-14',
      '2027-11-14',
      all,
    ]);
    app.close();
    expect(tally()).toEqual(all);
    app = open(siteDb());
    expect(lines(app.analytics.intake.daily().days)).toEqual(all);
    // Сводка приёма этапа 1 по-прежнему считает события: принято с полуночи UTC.
    expect(app.analytics.intake.summary().today).toBe(3);
  });

  it('перебор ключа не пишет в базу на каждый ответ: фон пишет счёт раз в минуту, остановка — остаток', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2027-11-14T23:59:30.000Z'));
      now = new Date('2027-11-14T23:59:30.000Z');
      const stop = app.analytics.start();
      for (let n = 0; n < 200; n++) {
        await send(event('bot_start'), {
          key: 'evk_wrong',
          address: `198.51.100.${n}`,
        });
      }
      expect(tally()).toEqual([]);
      jest.advanceTimersByTime(31_000);
      expect(tally()).toEqual(['2027-11-14 - http unauthorized 200']);
      // Сутки — UTC приёма: после полуночи — новая строка.
      now = new Date('2027-11-15T00:00:40.000Z');
      await send(event('bot_start'), { key: null, address: '203.0.113.1' });
      await send(event('bot_start'), { key: null, address: '203.0.113.2' });
      expect(tally()).toEqual(['2027-11-14 - http unauthorized 200']);
      stop();
      expect(tally()).toEqual([
        '2027-11-14 - http unauthorized 200',
        '2027-11-15 - http unauthorized 2',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('загрузка файла: исходы пачки — строкой на ключ в её транзакции, строки с ошибками — тоже; проба не считает ничего', async () => {
    const first = event('bot_start', {}, { at: '2027-01-10T09:00:00Z' });
    const path = jsonlFile('history.jsonl', [
      first,
      first,
      { ...first, data: { label: 'другое тело' } },
      '',
      'не JSON',
      { ...event('bot_start'), at: 'вчера' },
      event('bot_start', {}, { at: '2027-11-14T21:00:00Z' }),
      event('user_deleted', {}, { at: '2027-01-11T00:00:00Z' }),
      // Удаление стёрло псевдоним до 11 января: это событие — «стёрто».
      event('purchase', PAID, { at: '2027-01-10T12:00:00Z' }),
    ]);
    const probe = await app.analytics.events.import(path, { dryRun: true });
    expect(probe).toMatchObject({ accepted: 2, rejected: 2, erased: 1 });
    expect(tally()).toEqual([]);
    expect(erasedTally()).toEqual([]);
    await app.analytics.events.import(path);
    // Старая история — без отметки late: она и должна быть старой; будущее — с отметкой future.
    expect(tally()).toEqual([
      '2027-11-14 bot file accepted 2',
      '2027-11-14 bot file conflict 1',
      '2027-11-14 bot file duplicate 1',
      '2027-11-14 bot file erased 1',
      '2027-11-14 bot file erasure 1',
      '2027-11-14 bot file future 1',
      '2027-11-14 bot file invalid 2',
    ]);
    // Январь — старше 40 суток: счёт стёртого его не держит.
    expect(erasedTally()).toEqual([]);
    // Повтор файла: первое событие стёрто удалением из него же — его строки теперь «стёрто», будущее — повтор.
    await app.analytics.events.import(path);
    expect(tally()).toEqual([
      '2027-11-14 bot file accepted 2',
      '2027-11-14 bot file conflict 1',
      '2027-11-14 bot file duplicate 2',
      '2027-11-14 bot file erased 6',
      '2027-11-14 bot file erasure 1',
      '2027-11-14 bot file future 1',
      '2027-11-14 bot file invalid 4',
    ]);
  });

  it('два процесса на одной базе — сервер и загрузка файла: счёт сходится, строки не задваиваются и не теряются', async () => {
    const loader = open(siteDb());
    try {
      const path = jsonlFile(
        'two.jsonl',
        Array.from({ length: 1_200 }, (_, n) =>
          n % 100 === 99
            ? 'не JSON'
            : {
                id: `file_${n}`,
                type: 'bot_start',
                at: '2027-11-01T10:00:00Z',
                subject: `u_file_${String(n).padStart(5, '0')}`,
              }
        )
      );
      const loading = loader.analytics.events.import(path);
      for (let n = 0; n < 60; n++) {
        await send(
          event(
            'bot_start',
            {},
            { subject: `u_http_${String(n).padStart(5, '0')}` }
          )
        );
        await send(event('bot_start'), {
          key: 'evk_wrong',
          address: `198.51.100.${n}`,
        });
        await Bun.sleep(1);
      }
      expect(await loading).toMatchObject({ accepted: 1_188, rejected: 12 });
    } finally {
      loader.close();
    }
    app.close();
    expect(tally()).toEqual([
      '2027-11-14 - http unauthorized 60',
      '2027-11-14 bot file accepted 1188',
      '2027-11-14 bot file invalid 12',
      '2027-11-14 bot http accepted 60',
    ]);
    app = open(siteDb());
    expect(count(siteDb(), 'analytics_events')).toBe(1_248);
  });

  it('срок хранения: счёт приёма — 400 суток, стёртого — 40; ночной проход фона и intake.expire()', async () => {
    await send(event('bot_start'));
    await send(event('user_deleted', {}, { at: '2027-11-14T18:29:00Z' }));
    expect(tally()).toEqual([
      '2027-11-14 bot http accepted 1',
      '2027-11-14 bot http erasure 1',
    ]);
    expect(erasedTally()).toEqual([
      '2027-11-14 bot bot_start 0 1',
      '2027-11-14 bot user_deleted 0 1',
    ]);
    now = new Date('2027-12-24T12:00:00.000Z');
    expect(app.analytics.intake.expire()).toEqual({
      intake: 0,
      erased: 0,
      checks: 0,
    });
    now = new Date('2027-12-25T00:00:00.000Z');
    expect(app.analytics.intake.expire()).toEqual({
      intake: 0,
      erased: 2,
      checks: 0,
    });
    expect(erasedTally()).toEqual([]);
    // Отпечатки стёртых событий уходят вместе со счётом стёртого.
    expect(count(siteDb(), 'analytics_erased_events')).toBe(0);
    now = new Date('2028-12-19T00:00:00.000Z');
    expect(app.analytics.intake.expire()).toEqual({
      intake: 2,
      erased: 0,
      checks: 0,
    });
    expect(tally()).toEqual([]);
  });
});

describe('счёт стёртого', () => {
  it('удаление событием: стёртое — числами по суткам события, отправителю и типу, без сумм и псевдонимов; «стёрто» и само удаление — тоже', async () => {
    const shop = app.analytics.senders.save(
      { code: 'shop', name: 'Магазин' },
      ANNA
    ).key!.key;
    const start = event('bot_start', {}, { at: '2027-11-10T09:00:00Z' });
    await send(start);
    await send(event('purchase', PAID, { at: '2027-11-12T09:00:00Z' }));
    await send(
      event(
        'purchase',
        { ...PAID, payment_id: 'pi_2' },
        { at: '2027-11-12T19:00:00Z' }
      )
    );
    await send(event('order_paid', {}, { at: '2027-11-12T10:00:00Z' }), {
      key: shop,
    });
    // Старше 40 суток — стирается, но в счёт не идёт: проверки смотрят 30 суток.
    await send(event('bot_start', {}, { at: '2027-09-01T09:00:00Z' }));
    await send(
      event('bot_start', {}, { test: true, at: '2027-11-11T09:00:00Z' })
    );
    await send(event('bot_start', {}, { subject: 'u_other_person' }));
    expect(erasedTally()).toEqual([]);
    const deletion = event('user_deleted', {}, { at: '2027-11-14T12:00:00Z' });
    await send(deletion);
    expect(erasedTally()).toEqual([
      '2027-11-10 bot bot_start 0 1',
      '2027-11-11 bot bot_start 1 1',
      '2027-11-12 bot purchase 0 2',
      '2027-11-12 shop order_paid 0 1',
      '2027-11-14 bot user_deleted 0 1',
    ]);
    // Опоздавший повтор — «стёрто»: в таблице событий его нет, но отправитель его уже насчитал и сайт уже
    // посчитал его стёртым — по отпечатку тела оно узнаётся, второй раз в счёт не идёт. Повтор удаления — тоже.
    expect((await send(start)).body).toEqual({ ok: true, erased: true });
    expect((await send(deletion)).body).toEqual({ ok: true, erased: true });
    // Событие, которого сайт не видел, а псевдоним уже стёрт, — «стёрто» и +1: отправитель его насчитал.
    await send(event('purchase', PAID, { at: '2027-11-12T20:00:00Z' }));
    expect(erasedTally()).toEqual([
      '2027-11-10 bot bot_start 0 1',
      '2027-11-11 bot bot_start 1 1',
      '2027-11-12 bot purchase 0 3',
      '2027-11-12 shop order_paid 0 1',
      '2027-11-14 bot user_deleted 0 1',
    ]);
    // Ничего, по чему узнать человека: ни псевдонима, ни хэша псевдонима, ни сумм; у отпечатков — только
    // отправитель, отпечаток тела и сутки.
    const stored = JSON.stringify([
      rows(siteDb(), 'SELECT * FROM analytics_erased_daily'),
      rows(siteDb(), 'SELECT * FROM analytics_erased_events'),
    ]);
    for (const trace of [SUBJECT, sha256(SUBJECT), '109', 'pi_3Q8x']) {
      expect(stored).not.toContain(trace);
    }
    expect(
      rows<{ name: string }>(
        siteDb(),
        "SELECT name FROM pragma_table_info('analytics_erased_events') ORDER BY cid"
      ).map((_) => _.name)
    ).toEqual(['sender', 'hash', 'day']);
    expect(count(siteDb(), 'analytics_erased_events')).toBe(7);
    expect(
      rows<{ name: string }>(
        siteDb(),
        "SELECT name FROM pragma_table_info('analytics_erased_daily') ORDER BY cid"
      ).map((_) => _.name)
    ).toEqual(['day', 'sender', 'type', 'test', 'events']);
    expect(tally()).toContain('2027-11-14 bot http erasure 1');
    expect(tally()).toContain('2027-11-14 bot http erased 3');
  });

  it('тестовое удаление считает только тестовые; кнопка в менеджере — всё, что стёрла', async () => {
    await send(event('bot_start', {}, { at: '2027-11-10T09:00:00Z' }));
    await send(
      event('bot_start', {}, { test: true, at: '2027-11-11T09:00:00Z' })
    );
    await send(event('user_deleted', {}, { test: true }));
    expect(erasedTally()).toEqual([
      '2027-11-11 bot bot_start 1 1',
      '2027-11-14 bot user_deleted 1 1',
    ]);
    app.analytics.people.erase(SUBJECT, ANNA);
    expect(erasedTally()).toEqual([
      '2027-11-10 bot bot_start 0 1',
      '2027-11-11 bot bot_start 1 1',
      '2027-11-14 bot user_deleted 1 1',
    ]);
    // Срок хранения людей стирает без счёта: он стирает тех, кто старше месяца.
    await send(
      event(
        'bot_start',
        {},
        { subject: 'u_old_person', at: '2027-11-13T09:00:00Z' }
      )
    );
    app.analytics.settings.save({ retentionMonths: 1 });
    now = new Date('2027-12-20T00:00:00.000Z');
    expect(app.analytics.people.expire()).toMatchObject({ people: 1 });
    expect(erasedTally()).toHaveLength(3);
  });
});
