import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, explain, helpFor, RUN } from '../src/cli/commands.ts';
import { COMMANDS, commandHelp } from '../src/cli/help.ts';
import { definePaint } from '../src/cli/paint.ts';
import type { FileLine } from '../src/contexts/analytics/domain/ports.ts';
import type {
  ImportReport,
  SetupAuthor,
} from '../src/contexts/analytics/index.ts';
import { defineLineSource } from '../src/contexts/analytics/infrastructure/jsonl.ts';
import { isDomainError } from '../src/shared/kernel/errors.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };
const NOW = '2026-11-20T12:00:00.000Z';
const FIXTURE = join(import.meta.dir, 'fixtures/analytics-events.jsonl');
const BUYER = 'u_a1b2c3d4e5';
const VISITOR = 'u_f6a7b8c9d0';

let dir: string;
let app: App;

const siteDb = (): string => join(dir, 'site.db');

const open = (path: string): App =>
  createApp({
    databasePath: path,
    mediaCache: `${path}.cache`,
    clock: () => new Date(NOW),
  });

const codeOf = (run: () => Promise<unknown>): Promise<string | null> =>
  Promise.resolve()
    .then(run)
    .then(
      () => null,
      (error) => (isDomainError(error) ? error.code : String(error))
    );

const rows = (sql: string): Record<string, unknown>[] => {
  const db = new Database(siteDb(), { readonly: true });
  const found = db.query<Record<string, unknown>, []>(sql).all();
  db.close();
  return found;
};

const count = (table: string, where = '1'): number =>
  rows(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)[0]!.n as number;

/** Все таблицы базы целиком: проверка «ничего не записано». */
const everything = (): Record<string, unknown> => {
  const db = new Database(siteDb(), { readonly: true });
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
    .all()
    .map((_) => _.name);
  const dump = Object.fromEntries(
    tables.map((name) => [name, db.query(`SELECT * FROM "${name}"`).all()])
  );
  db.close();
  return dump;
};

const file = (name: string, lines: readonly unknown[]): string =>
  ((path) => (
    writeFileSync(
      path,
      lines
        .map((_) => (typeof _ === 'string' ? _ : JSON.stringify(_)))
        .join('\n')
    ),
    path
  ))(join(dir, name));

const touch = (
  id: string,
  subject: string,
  at: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  type: 'bot_start',
  at,
  subject,
  data: { label: 'post__blog' },
  ...extra,
});

const without = ({ dryRun: _, ...rest }: ImportReport) => rest;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cms-import-'));
  app = open(siteDb());
  app.analytics.setup.apply(SUBSCRIPTION, ANNA);
  app.analytics.settings.save({ enabled: true }, ANNA);
});

afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const streamOf = (chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => (
      chunks.forEach((_) => void controller.enqueue(_)), controller.close()
    ),
  });

const all = (
  source: ReturnType<typeof defineLineSource>,
  found: readonly FileLine[] = []
): Promise<readonly FileLine[]> =>
  source
    .next(3)
    .then((lines) =>
      lines.length === 0 ? found : all(source, [...found, ...lines])
    );

describe('строки файла JSON Lines', () => {
  it('куски потока режут строку и букву где угодно; CRLF, BOM, пустые и строка без перевода в конце', async () => {
    const text = '﻿{"a":"Анна"}\r\n\n  \r\n{"b":2}\n{"c":"ёж"}';
    const whole = bytes(text);
    // Разрез посреди «Анна»: многобайтная буква на стыке кусков не ломается.
    const cut = whole.indexOf(0xd0, 8) + 1;
    const lines = await all(
      defineLineSource(
        streamOf([
          whole.subarray(0, cut),
          whole.subarray(cut, cut + 3),
          whole.subarray(cut + 3),
        ])
      )
    );
    expect(lines).toEqual([
      { line: 1, text: '{"a":"Анна"}' },
      { line: 2, text: '' },
      { line: 3, text: '  ' },
      { line: 4, text: '{"b":2}' },
      { line: 5, text: '{"c":"ёж"}' },
    ]);
    expect(await all(defineLineSource(streamOf([bytes('x\n')])))).toEqual([
      { line: 1, text: 'x' },
    ]);
    expect(await all(defineLineSource(streamOf([])))).toEqual([]);
  });

  it('строка длиннее 64 КБ — ошибка этой строки, байты не копятся; следующая читается', async () => {
    const limit = 65_536;
    const exact = `"${'a'.repeat(limit - 2)}"`;
    const text = `${exact}\r\n${'b'.repeat(limit + 1)}\n${'c'.repeat(300_000)}\nok`;
    const whole = bytes(text);
    const chunks = Array.from(
      { length: Math.ceil(whole.length / 10_000) },
      (_, i) => whole.subarray(i * 10_000, (i + 1) * 10_000)
    );
    const lines = await all(defineLineSource(streamOf(chunks)));
    expect(lines.map((_) => ('error' in _ ? _.error : _.text.length))).toEqual([
      limit,
      'is larger than 65536 bytes',
      'is larger than 65536 bytes',
      2,
    ]);
    expect(lines.map((_) => _.line)).toEqual([1, 2, 3, 4]);
  });

  it('не UTF-8 — ошибка строки, соседние целы', async () => {
    const lines = await all(
      defineLineSource(
        streamOf([
          bytes('{"a":1}\n'),
          new Uint8Array([0xff, 0xfe, 0x0a]),
          bytes('{"b":2}'),
        ])
      )
    );
    expect(lines).toEqual([
      { line: 1, text: '{"a":1}' },
      { line: 2, error: 'is not UTF-8' },
      { line: 3, text: '{"b":2}' },
    ]);
  });
});

describe('загрузка файла', () => {
  it('отчёт: номера строк, пути полей, предупреждения по видам; люди посчитаны', async () => {
    const report = await app.analytics.events.import(FIXTURE);
    expect(report).toMatchObject({
      sender: 'bot',
      dryRun: false,
      lines: 12,
      empty: 2,
      accepted: 5,
      erasures: 0,
      duplicates: 1,
      conflicts: 1,
      erased: 0,
      rejected: 3,
      warnings: { unknown_type: 1, 'invalid_value:data.own_material': 1 },
      people: 2,
    });
    expect(report.errors.map((_) => [_.line, _.path])).toEqual([
      [5, 'data.amount'],
      [6, 'body'],
      [7, 'subjet'],
      [7, 'subject'],
    ]);
    expect(report.errors[1]?.message).toBe('is not a JSON object');
    // В отчёте нет значений из файла — только пути и причины.
    expect(JSON.stringify(report)).not.toContain(VISITOR);
    expect(
      rows('SELECT id, origin, at FROM analytics_events ORDER BY seq')
    ).toEqual([
      { id: 'evt_1', origin: 'file', at: '2026-10-01T09:00:00.000Z' },
      { id: 'evt_2', origin: 'file', at: '2026-10-01T09:05:00.000Z' },
      { id: 'evt_3', origin: 'file', at: '2026-10-08T08:00:00.000Z' },
      { id: 'evt_6', origin: 'file', at: '2026-10-10T08:00:00.000Z' },
      { id: 'evt_7', origin: 'file', at: '2026-10-10T09:00:00.000Z' },
    ]);
    expect(count('analytics_conflicts')).toBe(1);
    const page = app.analytics.people.list();
    expect(page.stale).toBe(0);
    expect(
      page.people.map((_) => [_.subject, _.events, _.state, _.payments])
    ).toEqual([
      [VISITOR, 2, 'new', 0],
      [BUYER, 3, 'customer', 1],
    ]);
    expect(page.people[1]?.revenue).toEqual({ EUR: 10_900 });
    expect(page.people[1]?.firstTouch?.label).toBe('post__blog__organic');
  });

  it('повторная загрузка того же файла не меняет ни событий, ни людей', async () => {
    await app.analytics.events.import(FIXTURE);
    app.analytics.people.list();
    const before = {
      events: rows('SELECT * FROM analytics_events ORDER BY seq'),
      people: rows('SELECT * FROM analytics_people ORDER BY subject'),
    };
    const again = await app.analytics.events.import(FIXTURE);
    expect(again).toMatchObject({
      accepted: 0,
      duplicates: 6,
      conflicts: 1,
      rejected: 3,
      warnings: {},
      people: 0,
    });
    app.analytics.people.list();
    expect({
      events: rows('SELECT * FROM analytics_events ORDER BY seq'),
      people: rows('SELECT * FROM analytics_people ORDER BY subject'),
    }).toEqual(before);
  });

  it('пробный прогон не пишет ни одной строки ни в одну таблицу, а итог — тот же, что у загрузки', async () => {
    const before = everything();
    const dry = await app.analytics.events.import(FIXTURE, { dryRun: true });
    expect(everything()).toEqual(before);
    expect(dry.dryRun).toBe(true);
    const real = await app.analytics.events.import(FIXTURE);
    expect(without(dry)).toEqual(without(real));
  });

  it('повторы внутри файла через пачки и удаление из файла — в пробном прогоне как в загрузке', async () => {
    const victim = 'u_fill_0007';
    const lines = [
      touch('first', BUYER, '2026-10-01T09:00:00Z'),
      ...Array.from({ length: 600 }, (_, i) =>
        touch(
          `fill_${i}`,
          `u_fill_${String(i % 50).padStart(4, '0')}`,
          `2026-10-02T09:${String(i % 60).padStart(2, '0')}:00Z`
        )
      ),
      // Строка 602: повтор строки 1 из прошлой пачки; 603 — тот же id с другим телом.
      touch('first', BUYER, '2026-10-01T09:00:00Z'),
      touch('first', BUYER, '2026-10-01T09:30:00Z'),
      {
        id: 'bye',
        type: 'user_deleted',
        at: '2026-10-05T00:00:00Z',
        subject: victim,
      },
      touch('late_old', victim, '2026-10-04T00:00:00Z'),
      touch('late_new', victim, '2026-10-06T00:00:00Z'),
    ];
    const path = file('mixed.jsonl', lines);
    const dry = await app.analytics.events.import(path, { dryRun: true });
    expect(dry).toMatchObject({
      lines: 606,
      accepted: 602,
      duplicates: 1,
      conflicts: 1,
      erasures: 1,
      erased: 1,
      rejected: 0,
      people: 51,
    });
    const real = await app.analytics.events.import(path);
    expect(without(real)).toEqual(without(dry));
    expect(
      rows(`SELECT id FROM analytics_events WHERE subject = '${victim}'`)
    ).toEqual([{ id: 'late_new' }]);
    expect(count('analytics_erasures', "origin = 'event'")).toBe(1);
  });

  it('отправитель: один действующий — без флага; два — флаг обязателен; неизвестный, архивный, выключенный — отказ', async () => {
    const path = file('one.jsonl', [
      touch('one', BUYER, '2026-10-01T09:00:00Z'),
    ]);
    const load = (sender?: string) => () =>
      app.analytics.events.import(path, { sender, dryRun: true });
    expect((await load()()).sender).toBe('bot');
    app.analytics.senders.save({ code: 'shop', name: 'Магазин' }, ANNA);
    expect(await codeOf(load())).toBe('analytics.sender_required');
    expect((await load('bot')()).sender).toBe('bot');
    expect(await codeOf(load('nope'))).toBe('analytics.sender_not_found');
    expect(await codeOf(load('Не код'))).toBe('analytics.invalid_code');
    app.analytics.senders.archive('shop', true, ANNA);
    expect((await load()()).sender).toBe('bot');
    expect(await codeOf(load('shop'))).toBe('analytics.sender_inactive');
    app.analytics.senders.save({ code: 'bot', enabled: false }, ANNA);
    expect(await codeOf(load('bot'))).toBe('analytics.sender_inactive');
    expect(await codeOf(load())).toBe('analytics.no_sender');
    expect(count('analytics_events')).toBe(0);
  });

  it('выключенный приём — отказ, и пробному прогону тоже; ничего не записано', async () => {
    app.analytics.settings.save({ enabled: false }, ANNA);
    const before = everything();
    expect(await codeOf(() => app.analytics.events.import(FIXTURE))).toBe(
      'analytics.disabled'
    );
    expect(
      await codeOf(() => app.analytics.events.import(FIXTURE, { dryRun: true }))
    ).toBe('analytics.disabled');
    expect(everything()).toEqual(before);
  });

  it('стёртый человек из старого файла не возвращается: его строки — «стёрто»', async () => {
    await app.analytics.events.import(FIXTURE);
    app.analytics.people.erase(BUYER, ANNA);
    const again = await app.analytics.events.import(FIXTURE);
    expect(again).toMatchObject({ accepted: 0, erased: 5, duplicates: 2 });
    expect(count('analytics_events', `subject = '${BUYER}'`)).toBe(0);
    expect(app.analytics.people.list().people.map((_) => _.subject)).toEqual([
      VISITOR,
    ]);
  });

  it('большой файл идёт пачками и читается потоком: пачки пишутся, пока поток ещё не дочитан', async () => {
    const total = 20_000;
    const piece = 250;
    const db = new Database(siteDb(), { readonly: true });
    const seen = db.query<{ n: number }, []>(
      'SELECT count(*) AS n FROM analytics_events'
    );
    const written: number[] = [];
    let made = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) =>
        made >= total
          ? controller.close()
          : (written.push(seen.get()!.n),
            controller.enqueue(
              bytes(
                `${Array.from({ length: piece }, (_, i) =>
                  JSON.stringify(
                    touch(
                      `big_${made + i}`,
                      `u_big_${String(Math.floor((made + i) / 20)).padStart(5, '0')}`,
                      `2026-10-01T${String(Math.floor((made + i) / 1000) % 24).padStart(2, '0')}:00:00Z`
                    )
                  )
                ).join('\n')}\n`
              )
            ),
            void (made += piece)),
    });
    const report = await app.analytics.events.import(stream);
    db.close();
    expect(report).toMatchObject({
      lines: total,
      accepted: total,
      rejected: 0,
      people: total / 20,
    });
    // Пока читался последний кусок, в базе уже лежали пачки: файл не читается целиком до записи.
    expect(written.at(-1)).toBeGreaterThan(total / 2);
    expect(written[0]).toBe(0);
    expect(count('analytics_people')).toBe(total / 20);
  });
});

describe('cms events import', () => {
  const output: string[] = [];
  const plain = definePaint(false);
  const context = (
    args: readonly string[],
    options: Record<string, unknown> = {},
    language: 'ru' | 'en' = 'ru'
  ): Context => ({
    args,
    options: {
      port: '0',
      db: siteDb(),
      help: false,
      version: false,
      passwordStdin: false,
      trustProxy: false,
      ...options,
    },
    paint: plain,
    language,
    tty: false,
    out: (_) => void output.push(_),
  });
  const run = (ctx: Context): Promise<string | null> =>
    RUN.events!(ctx).then(
      () => null,
      (error) => explain(error, ctx.language)
    );

  it('итог для человека и код выхода: строки с ошибками — 1, чистый файл — 0', async () => {
    output.length = 0;
    expect(await run(context(['import', FIXTURE], { dryRun: true }))).toBe(
      'Строк с ошибками: 3 — загрузка их пропустит.'
    );
    const dry = output.join('\n');
    expect(dry).toContain('база не изменена');
    expect(dry).toContain('Будет принято  5');
    expect(dry).toContain(`${FIXTURE}:5: data.amount — is required`);
    expect(dry).toContain('незнакомый тип ×1');
    expect(dry).toContain('негодное значение data.own_material ×1');
    expect(dry).toContain('без --dry-run');
    expect(count('analytics_events')).toBe(0);
    output.length = 0;
    expect(await run(context(['import', FIXTURE]))).toBe(
      'Строк с ошибками: 3 — они не загружены.'
    );
    expect(output.join('\n')).toContain('Принято        5');
    expect(count('analytics_events')).toBe(5);
    const clean = file('clean.jsonl', [
      touch('c1', BUYER, '2026-10-01T09:00:00Z'),
    ]);
    output.length = 0;
    expect(await run(context(['import', clean]))).toBeNull();
    expect(output.join('\n')).toContain('Людей          1');
  });

  it('--json — отчёт для скриптов, по-английски — итог без русских букв', async () => {
    output.length = 0;
    expect(
      await run(context(['import', FIXTURE], { json: true, dryRun: true }))
    ).not.toBeNull();
    const report = JSON.parse(output.join('\n')) as ImportReport;
    expect(report).toMatchObject({ dryRun: true, accepted: 5, rejected: 3 });
    output.length = 0;
    await run(context(['import', FIXTURE], { dryRun: true }, 'en'));
    expect(output.join('\n')).toContain('To accept');
    expect(output.join('\n')).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('нет файла, подкоманды или базы, неизвестный отправитель, выключенный приём — понятный отказ', async () => {
    expect(await run(context([]))).toContain('Нужна подкоманда');
    expect(await run(context(['import']))).toContain('Нужен файл');
    expect(await run(context(['import', join(dir, 'nope.jsonl')]))).toContain(
      'Нет файла'
    );
    expect(await run(context(['export', FIXTURE]))).toContain(
      'Нет подкоманды events export'
    );
    expect(
      await run(context(['import', FIXTURE], { db: join(dir, 'missing.db') }))
    ).toContain('Нет базы');
    expect(await run(context(['import', FIXTURE], { sender: 'nope' }))).toBe(
      'Такого отправителя на сайте нет — проверьте код в --sender.'
    );
    app.analytics.settings.save({ enabled: false }, ANNA);
    expect(await run(context(['import', FIXTURE]))).toContain(
      'Приём событий выключен'
    );
    expect(count('analytics_events')).toBe(0);
  });

  it('справка cms help events на двух языках, --sender разбирается', async () => {
    expect(COMMANDS.ru.map((_) => _.name)).toContain('events');
    expect(await helpFor(plain, 'events', 'ru')).toContain(
      'cms events import <файл.jsonl> [--sender <код>] [--dry-run] [--json]'
    );
    const english = commandHelp(
      plain,
      COMMANDS.en.find((_) => _.name === 'events')!,
      'en'
    );
    expect(english).toContain('--sender <code>');
    expect(english).not.toMatch(/[А-Яа-яЁё]/);
    expect(
      parseInvocation(['events', 'import', 'a.jsonl', '--sender', 'crm'], {})
    ).toMatchObject({
      command: 'events',
      args: ['import', 'a.jsonl'],
      options: { sender: 'crm' },
    });
  });
});
