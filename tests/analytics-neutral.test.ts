import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Glob } from 'bun';
import { createApp } from '../src/app.ts';
import {
  type AnalyticsSet,
  EVENT_ROLES,
  type EventRole,
} from '../src/contexts/analytics/index.ts';
import { GUIDE } from '../src/contexts/assistant/index.ts';
import { AGENT_TOOLS } from '../src/contexts/manager/interface/agent-tools.ts';
import { ANALYTICS_SAMPLES } from '../src/scaffolds/analytics/index.ts';
import { MANAGER_LANGUAGES } from '../src/shared/kernel/manager-language.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

// Ядро не знает имён продукта (ADR 0072): кодов набора-образца и валют файла событий этапа 3 нет строковыми
// литералами в коде аналитики — так в ядре не появится валюта по умолчанию. Весь src/ так не проверить — `ru`,
// `format` и `plan` там встречаются по другим причинам. Тесты рядом с кодом не в счёт: им примеры нужны.

const ROOT = resolve(import.meta.dir, '..');

const PLACES = [
  { dir: 'src/contexts/analytics', pattern: '**/*.ts' },
  // API аналитики и приветствие MCP со строкой о людях из событий.
  { dir: 'src/contexts/manager/interface', pattern: '{analytics-api,mcp}.ts' },
  { dir: 'manager/src/routes/(app)/stats', pattern: '**/*.{ts,svelte}' },
];

// Инструменты аналитики у агента: описания и схемы аргументов — там модель берёт примеры.
const ANALYTICS_TOOLS = [
  'archive_analytics_item',
  'create_label',
  'get_analytics',
  'get_person',
  'list_analytics_setup',
  'list_people',
  'list_unknown_values',
  'resolve_check',
  'save_analytics_item',
  'save_spend',
];

// Отличительное сайта-образца — из самого набора, а не из теста: название набора, имена отправителей и бот из адресов
// переходов. Ничего из этого не должно быть в ядре, памятке, справке и образцах бинарника.
const SITE_MARKS = [
  SUBSCRIPTION.name,
  ...(SUBSCRIPTION.senders ?? []).map((_) => _.name),
  ...(SUBSCRIPTION.links ?? []).flatMap(
    (_) => /t\.me\/([^?/]+)/.exec(_.target ?? '')?.[1] ?? []
  ),
].filter((_): _ is string => typeof _ === 'string' && _ !== '');

/** Отличительные строки сайта-образца в тексте, без учёта регистра. */
const siteMarksIn = (text: string): string[] =>
  SITE_MARKS.filter((_) => text.toLowerCase().includes(_.toLowerCase()));

// Общие коды набора сайта-примера и образцов бинарника: слова рода дела, а не сайта.
const GENERIC = [
  'source',
  'channel',
  'campaign',
  'heard_from',
  'plan',
  'google',
  'direct',
  'organic',
  'paid',
  'referral',
  'search',
  'other',
  'instagram',
  'other-sites',
  'no-referrer',
  'trial_started',
  'access_ended',
  'daily_summary',
  'user_deleted',
];

// Валюты файла событий этапа 3 (tests/fixtures/analytics-stage3.jsonl) и его расходов и курсов.
const CURRENCIES = ['EUR', 'PLN', 'CHF'];

/** Все строки значения: сами строки, ключи и значения объектов, элементы списков. */
const stringsOf = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(stringsOf)
      : value !== null && typeof value === 'object'
        ? Object.entries(value).flatMap(({ 0: key, 1: inner }) => [
            key,
            ...stringsOf(inner),
          ])
        : [];

// Части соответствий и переходов: коды частей и значения; `{host}` — знак ядра, а не код сайта.
const partsOf = (parts: Readonly<Record<string, string>> | undefined) =>
  Object.entries(parts ?? {})
    .flat()
    .filter((_) => /^[a-z0-9_-]+$/.test(_));

const codesOf = (set: AnalyticsSet): string[] =>
  [
    ...new Set([
      ...(set.senders ?? []).map((_) => _.code),
      ...(set.types ?? []).map((_) => _.code),
      ...(set.properties ?? []).map((_) => _.code),
      ...(set.dictionaries ?? []).flatMap((_) => [
        _.code,
        ...(_.values ?? []).map((value) => value.code),
      ]),
      ...(set.schemas ?? []).flatMap((_) => [_.sender, ...(_.parts ?? [])]),
      ...(set.referrers ?? []).flatMap((_) => [_.code, ...partsOf(_.parts)]),
      ...(set.links ?? []).flatMap((_) => [_.code, ...partsOf(_.parts)]),
      ...(set.milestones ?? []).map((_) => _.code),
      ...(set.funnels ?? []).map((_) => _.code),
    ]),
  ].filter((_) => !EVENT_ROLES.includes(_ as EventRole));

const _escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Коды, которые стоят в исходнике строкой целиком: в одинарных, двойных или обратных кавычках. */
const literalsIn = (source: string, codes: readonly string[]): string[] =>
  codes.filter((code) =>
    new RegExp(`(['"\`])${_escape(code)}\\1`).test(source)
  );

/**
 * Файлы каталога от корня репозитория — всегда с прямой косой чертой: на Windows Glob отдаёт пути с обратной, и
 * сравнения и фильтры по пути (`startsWith('src/scaffolds/')`) молча ничего бы не находили.
 */
const tree = (dir: string, pattern: string): string[] =>
  Array.from(new Glob(pattern).scanSync(join(ROOT, dir))).map(
    (_) => `${dir}/${_.replaceAll('\\', '/')}`
  );

const files = (): string[] =>
  PLACES.filter((_) => existsSync(join(ROOT, _.dir))).flatMap((place) =>
    tree(place.dir, place.pattern).filter((_) => !_.endsWith('.test.ts'))
  );

// Наборы-образцы бинарника на всех языках менеджера: коды у языков одни, а ищутся — как коды сайта-примера.
const SAMPLE_SETS = ANALYTICS_SAMPLES.flatMap((sample) =>
  MANAGER_LANGUAGES.map((language) => ({
    sample: sample.code,
    language,
    set: sample.set(language) as AnalyticsSet,
  }))
);

const sampleCodes = (): string[] => [
  ...new Set([
    ...ANALYTICS_SAMPLES.map((_) => _.code),
    ...SAMPLE_SETS.flatMap((_) => codesOf(_.set)),
  ]),
];

// Род дела сайта-образца — тоже из набора: названия и заметки его собственных элементов (коды не общие и не из
// образцов бинарника) из двух слов и длиннее, без чисел и без слов, которые есть в образцах. Подсказки ядра и
// менеджера общие и их не повторяют.
const sitePhrases = (): string[] =>
  ((own) => {
    const found: string[] = [];
    const walk = (value: unknown): void =>
      Array.isArray(value)
        ? value.forEach(walk)
        : value !== null && typeof value === 'object'
          ? ((item) => (
              typeof item.code === 'string' &&
                own.includes(item.code) &&
                [item.name, item.note].forEach(
                  (_) =>
                    void (
                      typeof _ === 'string' &&
                      _.trim().split(/\s+/).length >= 2 &&
                      found.push(_)
                    )
                ),
              Object.values(item).forEach(walk)
            ))(value as Record<string, unknown>)
          : undefined;
    walk(SUBSCRIPTION);
    // Общие слова, которые есть и в образцах бинарника, и названия с числами («3 месяца») — не род дела.
    const samples = JSON.stringify(SAMPLE_SETS.map((_) => _.set)).toLowerCase();
    return [...new Set(found)].filter(
      (_) => !/\d/.test(_) && !samples.includes(_.toLowerCase())
    );
  })(
    codesOf(SUBSCRIPTION).filter(
      (_) => !GENERIC.includes(_) && !sampleCodes().includes(_)
    )
  );

const sitePhrasesIn = (text: string): string[] =>
  sitePhrases().filter((_) => text.toLowerCase().includes(_.toLowerCase()));

describe('ядро без имён продукта', () => {
  const codes = codesOf(SUBSCRIPTION);

  it('коды набора «Подписка» без ролей: отправитель, типы, свойства, справочники, значения, группы этапа 2', () => {
    expect(codes).toContain('bot');
    expect(codes).toContain('purchase');
    expect(codes).toContain('plan');
    expect(codes).toContain('ig-reels');
    expect(codes).not.toContain('refund');
    // Части, их значения, соответствия, веха и воронка; переход `trial` — и код роли, его не ищут.
    for (const code of [
      'source',
      'w-trial',
      'direct',
      'other-sites',
      'activation',
      'journey',
    ]) {
      expect(codes).toContain(code);
    }
    expect(codes).not.toContain('trial');
    expect(codes).not.toContain('{host}');
    expect(codes).toHaveLength(54);
  });

  it('проверка ловит литерал и не путает его с именем и частью строки', () => {
    expect(literalsIn(`const type = 'purchase';`, codes)).toEqual(['purchase']);
    expect(literalsIn('`ig-reels` и "lang"', codes)).toEqual([
      'lang',
      'ig-reels',
    ]);
    expect(
      literalsIn(
        "const plan = data.format; const x = 'purchase_total'; // bot",
        codes
      )
    ).toEqual([]);
  });

  it('в коде аналитики нет кодов набора-образца, образцов бинарника и валют образца', async () => {
    const found = await Promise.all(
      files().map((file) =>
        Bun.file(join(ROOT, file))
          .text()
          .then((source) =>
            literalsIn(source, [...codes, ...sampleCodes(), ...CURRENCIES]).map(
              (_) => `${file}: '${_}'`
            )
          )
      )
    );
    expect(files().length).toBeGreaterThan(5);
    expect(files()).toContain(
      'src/contexts/manager/interface/analytics-api.ts'
    );
    expect(files()).toContain('src/contexts/manager/interface/mcp.ts');
    expect(found.flat()).toEqual([]);
  });

  it('отличительное сайта-образца взято из набора, и проверка его ловит', () => {
    expect(SITE_MARKS).toHaveLength(3);
    const bot = SITE_MARKS[2]!;
    expect(siteMarksIn(`const x = '${bot.toUpperCase()}';`)).toEqual([bot]);
    expect(siteMarksIn('бот в Telegram продаёт подписку')).toEqual([]);
  });

  it('род дела сайта-образца — названия его собственных элементов — не встречается в src/, локалях и экранах менеджера', async () => {
    expect(sitePhrases().length).toBeGreaterThan(5);
    const sources = ['src', 'manager/src'].flatMap((dir) =>
      tree(dir, '**/*.{ts,svelte}')
        .filter((_) => !_.endsWith('.test.ts'))
        // Образцы бинарника — свой род дела с общими словами («Откуда вы узнали?»); их проверяют коды выше.
        .filter((_) => !_.startsWith('src/scaffolds/'))
    );
    expect(sources.some((_) => _.startsWith('src/scaffolds/'))).toBe(false);
    expect(sources).toContain('src/contexts/analytics/domain/quality.ts');
    const found = await Promise.all(
      sources.map((file) =>
        Bun.file(join(ROOT, file))
          .text()
          .then((text) => sitePhrasesIn(text).map((_) => `${file}: ${_}`))
      )
    );
    expect(sources).toContain('manager/src/lib/locales/ru.ts');
    expect(found.flat()).toEqual([]);
    expect(sitePhrasesIn(GUIDE.analytics)).toEqual([]);
  });

  it('названия набора, отправителя и бота сайта-образца нет нигде в src/ и manager/src/: ни в коде, ни в комментариях', async () => {
    const sources = ['src', 'manager/src'].flatMap((dir) =>
      tree(dir, '**/*.{ts,svelte}')
    );
    const found = await Promise.all(
      sources.map((file) =>
        Bun.file(join(ROOT, file))
          .text()
          .then((text) => siteMarksIn(text).map((_) => `${file}: ${_}`))
      )
    );
    expect(sources.length).toBeGreaterThan(300);
    expect(found.flat()).toEqual([]);
  });

  it('в описаниях и схемах десяти инструментов аналитики нет кодов набора-образца и валют образца', () => {
    const tools = AGENT_TOOLS.filter((_) => ANALYTICS_TOOLS.includes(_.name));
    expect(tools.map((_) => _.name).toSorted()).toEqual(ANALYTICS_TOOLS);
    expect(tools).toHaveLength(10);
    const searched = [...codes, ...sampleCodes(), ...CURRENCIES];
    const found = tools.flatMap((tool) =>
      stringsOf([tool.title, tool.description, tool.input])
        .flatMap((text) => [
          ...(searched.includes(text) ? [text] : []),
          ...literalsIn(text, searched),
        ])
        .map((_) => `${tool.name}: '${_}'`)
    );
    expect(found).toEqual([]);
    // «cents for EUR» — пример единиц в определении денег, а не код в кавычках: проверка его пропускает.
    expect(literalsIn('minor units (cents for EUR)', CURRENCIES)).toEqual([]);
    expect(literalsIn("currency: 'EUR'", CURRENCIES)).toEqual(['EUR']);
  });

  it('в памятке analytics нет кодов набора-образца, образцов бинарника, валют образца и имени сайта-образца', () => {
    // Текст темы целиком, а не guide.ts: в теме форм есть свой пример plan.
    const searched = [...codes, ...sampleCodes(), ...CURRENCIES];
    expect(GUIDE.analytics.length).toBeGreaterThan(2000);
    expect(literalsIn(GUIDE.analytics, searched)).toEqual([]);
    expect(searched.includes(GUIDE.analytics)).toBe(false);
    expect(siteMarksIn(GUIDE.analytics)).toEqual([]);
    // Проверка ловит код в кавычках внутри текста памятки.
    expect(literalsIn('the type `signup` and "bot"', searched)).toEqual([
      'bot',
      'signup',
    ]);
  });

  it('в главе «Аналитика» справки на трёх языках нет имени и кодов сайта-образца', async () => {
    // Справка для владельца показывает коды образцов бинарника (их видно и в менеджере), но не коды сайта-примера
    // тестов и не его имя.
    const siteOnly = codes.filter(
      (_) => !sampleCodes().includes(_) && !GENERIC.includes(_)
    );
    expect(siteOnly).toContain('bot');
    expect(siteOnly).toContain('purchase');
    for (const language of ['Ru', 'En', 'De']) {
      const source = await Bun.file(
        join(ROOT, `manager/src/routes/(app)/help/Help${language}.svelte`)
      ).text();
      const chapter = source.slice(
        source.indexOf('<h2 id="analytics"'),
        source.indexOf('<h2 id="speed"')
      );
      expect([language, chapter.length > 5000]).toEqual([language, true]);
      expect([language, siteMarksIn(chapter)]).toEqual([language, []]);
      expect([language, literalsIn(chapter, siteOnly)]).toEqual([language, []]);
    }
    // Примеры разработчику отправителя — общие для трёх языков, в help.ts.
    const examples = await Bun.file(
      join(ROOT, 'manager/src/routes/(app)/help/help.ts')
    ).text();
    expect(examples).toContain('/_cms/events');
    expect(siteMarksIn(examples)).toEqual([]);
    expect(literalsIn(examples, siteOnly)).toEqual([]);
  });

  it('валюты по умолчанию нет: новый сайт без базовой валюты, курсов и расходов', () => {
    const app = createApp();
    try {
      expect(app.analytics.settings.get().baseCurrency).toBeNull();
      expect(app.analytics.rates.list()).toEqual({
        baseCurrency: null,
        currencies: [],
        other: [],
      });
      expect(app.analytics.spend.list().baseCurrency).toBeNull();
    } finally {
      app.close();
    }
  });

  it('образцы бинарника: коды образцов найдены и не совпадают со словами ядра; на всех языках — одни', () => {
    const found = sampleCodes();
    for (const code of [
      'subscription',
      'shop',
      'app',
      'signup',
      'shop_visit',
      'order_paid',
      'cart_added',
      'per-month',
      'per-year',
      'channel',
      'activated',
      'cart',
      'path',
    ]) {
      expect(found).toContain(code);
    }
    // Слова ядра, которых в образце быть не должно: часть «тип» — не medium, касание — не visit, тарифы — не month.
    for (const word of ['medium', 'visit', 'month', 'monthly', 'year']) {
      expect(found).not.toContain(word);
    }
    for (const sample of ANALYTICS_SAMPLES) {
      expect(
        new Set(
          SAMPLE_SETS.filter((_) => _.sample === sample.code).map((_) =>
            JSON.stringify(codesOf(_.set))
          )
        ).size
      ).toBe(1);
    }
  });

  it('в образцах нет переходов, адресов t.me/, имени сайта-образца и его кодов', async () => {
    const siteOnly = codes.filter((_) => !GENERIC.includes(_));
    expect(siteOnly).toContain('bot');
    expect(siteOnly).toContain('ig-reels');
    for (const { sample, language, set } of SAMPLE_SETS) {
      const text = JSON.stringify(set);
      expect([sample, language, set.links ?? []]).toEqual([
        sample,
        language,
        [],
      ]);
      expect([sample, language, text.includes('t.me/')]).toEqual([
        sample,
        language,
        false,
      ]);
      expect([sample, language, siteMarksIn(text)]).toEqual([
        sample,
        language,
        [],
      ]);
      expect([
        sample,
        codesOf(set).filter((_) => siteOnly.includes(_)),
      ]).toEqual([sample, []]);
    }
    const sources = Array.from(
      new Glob('*.ts').scanSync(join(ROOT, 'src/scaffolds/analytics'))
    );
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const file of sources) {
      const text = await Bun.file(
        join(ROOT, 'src/scaffolds/analytics', file)
      ).text();
      expect([file, siteMarksIn(text), /t\.me\//.test(text)]).toEqual([
        file,
        [],
        false,
      ]);
    }
  });
});
