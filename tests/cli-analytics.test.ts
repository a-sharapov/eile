import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, explain, helpFor, RUN } from '../src/cli/commands.ts';
import { COMMANDS, commandHelp } from '../src/cli/help.ts';
import { definePaint } from '../src/cli/paint.ts';
import type {
  AnalyticsSet,
  SetPlanReport,
} from '../src/contexts/analytics/index.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

// `cms analytics export|import|samples` (ADR 0072, этап 4): набор файлом, проба, образцы, коды выхода, отказы
// на чужих файлах и справка на двух языках.

const plain = definePaint(false);
const output: string[] = [];
let dir: string;

const db = (name = 'site'): string => join(dir, `${name}.db`);

// Новая база — как после первого запуска сервера: пустой сайт без настройки аналитики.
const site = (name = 'site'): string => (
  createApp({
    databasePath: db(name),
    mediaCache: join(dir, `${name}.cache`),
  }).close(),
  db(name)
);

const context = (
  args: readonly string[],
  options: Record<string, unknown> = {},
  language: 'ru' | 'en' = 'ru'
): Context => ({
  args,
  options: {
    port: '0',
    db: db(),
    help: false,
    version: false,
    passwordStdin: false,
    trustProxy: false,
    mediaCache: join(dir, 'cache'),
    ...options,
  },
  paint: plain,
  language,
  tty: false,
  out: (_) => void output.push(_),
});

// null — команда прошла (код выхода 0), иначе — текст ошибки для человека (код выхода 1).
const run = (ctx: Context): Promise<string | null> =>
  RUN.analytics!(ctx).then(
    () => null,
    (error) => explain(error, ctx.language)
  );

const printed = (): string => output.splice(0).join('\n');

const revision = (path: string): number => {
  const base = new Database(path, { readonly: true });
  const found =
    base
      .query<{ revision: number }, []>(
        'SELECT revision FROM analytics_settings WHERE id = 1'
      )
      .get()?.revision ?? 0;
  base.close();
  return found;
};

const file = (name: string, content: string | Uint8Array): string =>
  ((path) => (writeFileSync(path, content), path))(join(dir, name));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cms-cli-analytics-'));
  output.length = 0;
  site();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cms analytics samples', () => {
  it('образцы: код, название, описание и что внутри; по-английски — без русских букв; --json и --language', async () => {
    expect(await run(context(['samples']))).toBeNull();
    const ru = printed();
    expect(ru).toContain('subscription');
    expect(ru).toContain('Подписка');
    expect(ru).toContain('Магазин');
    expect(ru).toContain('типов 8 · справочников 4 · вех 1 · воронок 1');
    expect(ru).toContain('cms analytics import --sample shop');
    expect(await run(context(['samples'], {}, 'en'))).toBeNull();
    expect(printed()).not.toMatch(/[А-Яа-яЁё]/);
    expect(
      await run(context(['samples'], { json: true, language: 'de' }))
    ).toBeNull();
    expect(
      (JSON.parse(printed()) as { title: string }[]).map((_) => _.title)
    ).toEqual(['Abonnement', 'Onlineshop']);
    expect(await run(context(['samples'], { language: 'fr' }))).toBe(
      'Язык образца — ru, en или de: --language de'
    );
  });
});

describe('cms analytics import', () => {
  it('--sample --dry-run — проба без записи; без --dry-run — загрузка; повтор — ничего не изменилось', async () => {
    expect(
      await run(context(['import'], { sample: 'shop', dryRun: true }))
    ).toBeNull();
    const dry = printed();
    expect(dry).toContain('Проба набора «Магазин»');
    expect(dry).toContain('база не изменена');
    expect(dry).toContain('Создастся      38');
    expect(dry).toContain('shop/order_paid — Оплата заказа');
    expect(dry).toContain('… и ещё 3');
    expect(dry).toContain('новый отправитель без ключа');
    expect(dry).toContain('Набор не меняет: приём событий');
    expect(dry).toContain('без --dry-run');
    expect(revision(db())).toBe(0);
    expect(
      await run(context(['import'], { sample: 'shop', language: 'de' }))
    ).toBeNull();
    const done = printed();
    expect(done).toContain('Набор «Onlineshop» загружен');
    expect(done).toContain('ревизия 1');
    expect(done).toContain('выпустите их в менеджере');
    expect(done).toContain('Переходов в образце нет');
    expect(revision(db())).toBe(1);
    const app = createApp({ databasePath: db(), mediaCache: join(dir, 'c2') });
    expect(
      app.analytics.setup.get().types.find((_) => _.code === 'shop_visit')?.name
    ).toBe('Shop-Besuch');
    expect(app.analytics.senders.list()[0]?.keys).toEqual([]);
    app.close();
    expect(
      await run(context(['import'], { sample: 'shop', language: 'de' }))
    ).toBeNull();
    expect(printed()).toContain('уже на');
    expect(revision(db())).toBe(1);
  });

  it('export → import на другую базу: --dry-run --json — отчёт целиком, загрузка, выгрузка второй — та же', async () => {
    const source = site('source');
    expect(
      await run(context(['import'], { sample: 'subscription', db: source }))
    ).toBeNull();
    printed();
    const target = join(dir, 'set.json');
    expect(
      await run(context(['export', target], { db: source, name: 'Мой набор' }))
    ).toBeNull();
    const exported = printed();
    expect(exported).toContain(`Набор «Мой набор» — в ${target}`);
    expect(exported).toContain('отправители 1 · справочники 5');
    expect(exported).toContain('В набор не входят ключи отправителей');
    const set = JSON.parse(await Bun.file(target).text()) as AnalyticsSet;
    expect(set).toMatchObject({ name: 'Мой набор', eile: expect.any(String) });
    expect(
      await run(context(['import', target], { dryRun: true, json: true }))
    ).toBeNull();
    const report = JSON.parse(printed()) as SetPlanReport;
    expect(report).toMatchObject({
      name: 'Мой набор',
      dryRun: true,
      applied: false,
      errors: {},
    });
    expect(report.created).toHaveLength(43);
    expect(revision(db())).toBe(0);
    expect(await run(context(['import', target]))).toBeNull();
    expect(printed()).toContain('Набор «Мой набор» загружен');
    expect(
      await run(context(['export', '-'], { name: 'Мой набор' }))
    ).toBeNull();
    const again = JSON.parse(printed()) as AnalyticsSet;
    expect({ ...again, exportedAt: '' }).toEqual({ ...set, exportedAt: '' });
    // Файл, который уже есть, не перезаписывается — как у cms backup.
    expect(await run(context(['export', target], { db: source }))).toBe(
      `Файл ${target} уже есть — выберите другое имя.`
    );
    expect(await run(context(['export', db()]))).toContain(
      'это база сайта, а не набор'
    );
    expect(await run(context(['export', '-'], { name: '  ' }))).toBe(
      'Имя набора — от 1 до 100 знаков: --name "Мой сайт"'
    );
  });

  it('ошибки набора — код выхода 1 и у пробы: пути и причины, база не изменена', async () => {
    const broken = file(
      'broken.json',
      JSON.stringify({
        ...SUBSCRIPTION,
        types: [
          ...(SUBSCRIPTION.types ?? []),
          {
            sender: 'bot',
            code: 'x_paid',
            name: 'X',
            role: 'payment',
            properties: [{ code: 'nope' }],
          },
        ],
        rates: [],
      })
    );
    for (const dryRun of [true, false]) {
      expect(await run(context(['import', broken], { dryRun }))).toBe(
        'Ошибок в наборе: 2 — ничего не применено.'
      );
      const text = printed();
      expect(text).toContain('✗ rates — Unknown group "rates"');
      expect(text).toContain(
        `✗ types[${SUBSCRIPTION.types!.length}] — Event type bot/x_paid`
      );
      expect(text).not.toContain('без --dry-run');
    }
    expect(revision(db())).toBe(0);
    expect(
      await run(context(['import', broken], { json: true }))
    ).not.toBeNull();
    expect(
      Object.keys((JSON.parse(printed()) as SetPlanReport).errors)
    ).toHaveLength(2);
  });

  it('чужой файл: база сайта, база SQLite, не JSON, не набор, другая версия, больше предела — понятный отказ', async () => {
    const other = site('other');
    const copy = join(dir, 'copy.db');
    copyFileSync(other, copy);
    expect(await run(context(['import', db()]))).toContain(
      'это база сайта, а не набор'
    );
    expect(await run(context(['import', copy]))).toContain(
      'база SQLite, а не набор настройки'
    );
    expect(
      await run(context(['import', file('a.txt', 'format: set')]))
    ).toContain('не JSON');
    expect(
      await run(context(['import', file('b.json', '{"format":"cms-archive"}')]))
    ).toContain('не набор настройки аналитики');
    expect(
      await run(
        context([
          'import',
          file(
            'c.json',
            '{"format":"eile-analytics-set","version":2,"name":"x"}'
          ),
        ])
      )
    ).toContain('Набор версии 2');
    expect(
      await run(
        context(['import', file('d.json', new Uint8Array(33 * 1024 * 1024))])
      )
    ).toContain('больше 32 МБ');
    // Метка порядка байтов от редактора Windows не мешает.
    expect(
      await run(
        context(
          ['import', file('bom.json', `﻿${JSON.stringify(SUBSCRIPTION)}`)],
          { dryRun: true }
        )
      )
    ).toBeNull();
    expect(revision(db())).toBe(0);
  });

  it('нет подкоманды, файла, образца или базы, файл и образец сразу — понятный отказ', async () => {
    expect(await run(context([]))).toContain('Нужна подкоманда');
    expect(await run(context(['pull']))).toContain(
      'Нет подкоманды analytics pull'
    );
    expect(await run(context(['constructor']))).toContain('Нет подкоманды');
    expect(await run(context(['import']))).toContain('Нужен файл набора');
    expect(await run(context(['import', join(dir, 'nope.json')]))).toBe(
      `Нет файла ${join(dir, 'nope.json')}.`
    );
    expect(await run(context(['import'], { sample: 'cafe' }))).toContain(
      'Нет образца cafe'
    );
    expect(await run(context(['import', 'set.json'], { sample: 'shop' }))).toBe(
      'Либо файл набора, либо --sample: не оба сразу.'
    );
    expect(
      await run(context(['import'], { sample: 'shop', db: join(dir, 'no.db') }))
    ).toContain('Нет базы');
    expect(
      await run(context(['export', '-'], { db: join(dir, 'no.db') }))
    ).toContain('Нет базы');
    expect(
      await run(context(['import'], { sample: 'shop', language: 'fr' }))
    ).toContain('Язык образца');
  });

  it('по-английски — отчёт без русских букв, кроме названий из набора', async () => {
    expect(
      await run(
        context(
          ['import'],
          { sample: 'shop', language: 'en', dryRun: true },
          'en'
        )
      )
    ).toBeNull();
    const text = printed();
    expect(text).toContain('Trial of the set “Shop”');
    expect(text).toMatch(/To create +38/);
    expect(text).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe('cms help analytics', () => {
  it('справка на двух языках с примерами; флаги разбираются', async () => {
    expect(COMMANDS.ru.map((_) => _.name)).toContain('analytics');
    const ru = await helpFor(plain, 'analytics', 'ru');
    expect(ru).toContain('cms analytics import --sample <код>');
    expect(ru).toContain('$ cms analytics export analytics.json --db site.db');
    expect(ru.replace(/\s+/g, ' ')).toContain(
      'события загружает cms events import'
    );
    expect(ru).toContain('Ключей набор не создаёт');
    const en = commandHelp(
      plain,
      COMMANDS.en.find((_) => _.name === 'analytics')!,
      'en'
    );
    expect(en).toContain('--language <lang>');
    expect(en).not.toMatch(/[А-Яа-яЁё]/);
    expect(
      parseInvocation(
        [
          'analytics',
          'import',
          '--sample',
          'shop',
          '--language',
          'de',
          '--dry-run',
        ],
        {}
      )
    ).toMatchObject({
      command: 'analytics',
      args: ['import'],
      options: { sample: 'shop', language: 'de', dryRun: true },
    });
    expect(
      parseInvocation(['analytics', 'export', '-', '--name', 'Сайт'], {})
    ).toMatchObject({ args: ['export', '-'], options: { name: 'Сайт' } });
  });
});
