import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CHECK_CODE_LIMIT,
  CODE_LIMITS,
  DEFAULT_SUMMARY_AT,
  FORM_GOAL,
  GO_GOAL,
  GO_PREFIX,
  HOST_TOKEN,
  hostPattern,
  ITEM_LIMITS,
  isCheckCode,
  isFormName,
  isPartValue,
  isSitePage,
  isSummaryAt,
  KINDS,
  LABEL_LIMITS,
  LABEL_SEPARATORS,
  LABEL_TOKEN,
  RECONCILE_KINDS,
  RECONCILE_MARKS,
  REFERRER_KINDS,
  reconcileFor,
  SET_GROUPS,
  STEP_SIDES,
  schemaLength,
  targetProblem,
  UTM_PARAMETERS,
} from '../manager/src/lib/analytics.ts';
import { PRIVACY_SAMPLES } from '../manager/src/lib/analytics-privacy.ts';
import * as reports from '../manager/src/lib/analytics-reports.ts';
import * as csv from '../manager/src/lib/csv.ts';
import { loadLanguage, t } from '../manager/src/lib/i18n.ts';
import {
  amounts,
  amountText,
  CURRENCIES,
  decimalOf,
  minorUnits,
  money,
  parseAmount,
  parseRate,
} from '../manager/src/lib/money.ts';
import { allows, PERMISSIONS } from '../manager/src/lib/permissions.ts';
import type {
  MilestoneComparison,
  OverviewReport,
  QualityReport,
  SetPlanReport,
  SetupLogEntry,
  SetupView,
  SpendView,
} from '../manager/src/lib/types.ts';
import * as cohorts from '../manager/src/routes/(app)/stats/cohorts/cohorts.ts';
import * as overview from '../manager/src/routes/(app)/stats/overview.ts';
import * as milestones from '../manager/src/routes/(app)/stats/people/milestones.ts';
import * as qualityDrafts from '../manager/src/routes/(app)/stats/quality/drafts.ts';
import * as quality from '../manager/src/routes/(app)/stats/quality/quality.ts';
import * as setupLog from '../manager/src/routes/(app)/stats/setup/log.ts';
import * as transfer from '../manager/src/routes/(app)/stats/setup/transfer.ts';
import * as spend from '../manager/src/routes/(app)/stats/spend/spend.ts';
import { type App, createApp } from '../src/app.ts';
import { REPORT_PEOPLE_FIELDS } from '../src/contexts/analytics/application/people.ts';
import {
  comparePeriod,
  queryBasis,
  queryFees,
  queryLife,
  queryMetric,
  reportPeriod,
} from '../src/contexts/analytics/application/query.ts';
import * as codes from '../src/contexts/analytics/domain/codes.ts';
import * as days from '../src/contexts/analytics/domain/days.ts';
import * as labels from '../src/contexts/analytics/domain/labels.ts';
import { moneyOf, rateValue } from '../src/contexts/analytics/domain/money.ts';
import { firstQuestion } from '../src/contexts/analytics/domain/person.ts';
import * as serverQuality from '../src/contexts/analytics/domain/quality.ts';
import * as serverTexts from '../src/contexts/analytics/domain/quality-texts.ts';
import * as report from '../src/contexts/analytics/domain/report.ts';
import { EVENT_ROLES as ROLE_CODES } from '../src/contexts/analytics/domain/roles.ts';
import * as setup from '../src/contexts/analytics/domain/setup.ts';
import { signedMoney } from '../src/contexts/analytics/domain/statements.ts';
import {
  COHORT_BASES,
  COHORT_LIMITS,
  COHORT_METRICS,
  FEES_MODES,
  LIFETIMES,
  MINOR_UNITS,
} from '../src/contexts/analytics/index.ts';
import { can, type Permission } from '../src/contexts/identity/domain/user.ts';
import { attempt } from '../src/shared/kernel/errors.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';

// SPA решает, что показать, по своим копиям таблиц сервера: права ролей и знаки валют. Разойдутся — экран
// спрячет то, что сервер разрешает, или покажет 109 € как 1,09 €.

describe('права ролей в менеджере — как у сервера', () => {
  const all = [...new Set(Object.values(PERMISSIONS).flat())];

  it.each(['admin', 'editor'] as const)('%s', (role) => {
    expect(all.map((_) => [_, allows(role, _)])).toEqual(
      all.map((_) => [_, can(role, _ as Permission)])
    );
  });

  it('без входа прав нет; аналитика — у администратора', () => {
    expect(allows(undefined, 'analytics.read')).toBe(false);
    expect(allows('admin', 'analytics.edit')).toBe(true);
    expect(allows('editor', 'analytics.read')).toBe(false);
  });
});

describe('деньги аналитики в менеджере', () => {
  it('знаков после точки — как в таблице сервера, у каждой валюты', () => {
    expect(
      Object.keys(MINOR_UNITS).filter((_) => minorUnits(_) !== MINOR_UNITS[_])
    ).toEqual([]);
  });

  it('список валют — ровно те, что принимает сервер', () => {
    expect(CURRENCIES).toEqual(Object.keys(MINOR_UNITS).toSorted());
  });

  it('сумма из поля разбирается, как её разберёт сервер: точка или запятая, знаки — по валюте', () => {
    const typed = [
      '60',
      '60.00',
      '60,00',
      '60,5',
      '0',
      '0,00',
      '19.999',
      '1 000,50',
      '1 000.50',
      '1.000,50',
      '1,000.50',
      '-5',
      '+5',
      '5e3',
      '',
      ' 12.34 ',
      '123456789012345',
      '1234567890123456',
      '9007199254740.99',
      '90071992547409.92',
      '.5',
      '5.',
      '0,0001',
      '1,234',
    ];
    // Поле принимает запятую и пробелы разрядов; сервер получает запись с точкой — её поле и отправляет.
    const typedForServer = (raw: string) =>
      raw.replace(/[\s ]/g, '').replace(/^(\d*),(\d*)$/, '$1.$2');
    for (const currency of ['EUR', 'JPY', 'KWD', 'CLF'])
      for (const raw of typed) {
        const sent = parseAmount(raw, currency);
        const server = moneyOf(typedForServer(raw), currency);
        expect([currency, raw, sent === null]).toEqual([
          currency,
          raw,
          server === null,
        ]);
        if (sent !== null) expect(moneyOf(sent, currency)).toBe(server);
      }
  });

  it('сумма для поля обратно разбирается в те же единицы', () => {
    for (const { 0: minor, 1: currency } of [
      [6000, 'EUR'],
      [5, 'EUR'],
      [1500, 'JPY'],
      [1234, 'KWD'],
      [7, 'CLF'],
      [0, 'EUR'],
    ] as const) {
      expect(moneyOf(decimalOf(minor, currency), currency)).toBe(minor);
      expect(parseAmount(amountText(minor, currency, 'de'), currency)).toBe(
        decimalOf(minor, currency)
      );
    }
    expect(decimalOf(-2300, 'EUR')).toBe('-23.00');
    expect(amountText(6000, 'EUR', 'ru')).toBe('60,00');
    expect(amountText(6000, 'EUR', 'en')).toBe('60.00');
  });

  it('курс из поля — правила сервера: больше нуля, до 9 знаков до точки и 10 после, точка или запятая', () => {
    for (const raw of [
      '0.2310',
      '0,2310',
      '4.329',
      '0.0000222',
      '1',
      '0',
      '0.0',
      '00',
      '-1',
      '1e-7',
      '123456789.0123456789',
      '1234567890',
      '0.12345678901',
      '1,5,5',
      ' 0,25 ',
      '',
    ]) {
      const server = rateValue(raw.trim().replace(',', '.'));
      const sent = parseRate(raw);
      expect([raw, sent === null]).toEqual([raw, server === null]);
      if (sent !== null) expect(rateValue(sent)).toBe(server);
    }
  });

  it('сумма из минимальных единиц по валюте; валюты — раздельно', () => {
    expect(money(10900, 'EUR', 'en')).toBe('€109.00');
    expect(money(1500, 'JPY', 'en')).toBe('¥1,500');
    expect(money(1234, 'KWD', 'en')).toMatch(/^KWD\s1\.234$/);
    expect(amounts({ USD: -500, EUR: 10900 }, 'en')).toEqual([
      '€109.00',
      '-$5.00',
    ]);
  });
});

// Формы настройки этапа 2 проверяют до отправки по копиям серверных правил: разойдутся — форма отклонит то, что
// сервер примет, или отправит то, что он отвергнет.
const accepts = (run: () => unknown): boolean =>
  attempt(
    () => (run(), true),
    () => false
  );

describe('правила настройки в менеджере — как у сервера', () => {
  it('пределы, разделители, параметры UTM, виды соответствий и стороны шагов', () => {
    expect(LABEL_LIMITS).toEqual(labels.LABEL_LIMITS);
    expect(LABEL_SEPARATORS).toEqual(labels.LABEL_SEPARATORS);
    expect(UTM_PARAMETERS).toEqual(labels.UTM_PARAMETERS);
    expect(REFERRER_KINDS).toEqual(setup.REFERRER_KINDS);
    expect(STEP_SIDES).toEqual(setup.STEP_SIDES);
    expect(CODE_LIMITS).toEqual(codes.CODE_LIMITS);
    expect([GO_PREFIX, LABEL_TOKEN, HOST_TOKEN, GO_GOAL, FORM_GOAL]).toEqual([
      labels.GO_PREFIX,
      labels.LABEL_TOKEN,
      labels.HOST_TOKEN,
      setup.GO_GOAL,
      setup.FORM_GOAL,
    ]);
    const shared = [
      'name',
      'note',
      'position',
      'propertiesPerType',
      'referrers',
      'links',
      'milestones',
      'milestoneCount',
      'milestoneDays',
      'funnels',
      'funnelSteps',
      'paymentNumber',
      'page',
    ] as const;
    expect(shared.map((_) => ITEM_LIMITS[_])).toEqual(
      shared.map((_) => setup.SETUP_LIMITS[_])
    );
  });

  it('значение части — строже кода и не длиннее предела части', () => {
    const samples = [
      'ig',
      'w-trial',
      'ad_2',
      'a',
      '1',
      'spring-sale-2027',
      '-ig',
      'ig-',
      '_ig',
      'a__b',
      'a--b',
      'a_-b',
      'IG',
      'ig.com',
      'a b',
      'é',
      '',
      'x'.repeat(10),
      'x'.repeat(11),
      'x'.repeat(60),
      'x'.repeat(61),
    ];
    for (const limit of [1, 10, 60])
      expect(samples.map((_) => isPartValue(_, limit))).toEqual(
        samples.map((_) => labels.isPartValue(_, limit))
      );
  });

  it('шаблон хоста приводится к тому же виду, что сохранит сервер', () => {
    const samples = [
      'instagram.com',
      ' l.instagram.com ',
      'WWW.Google.*',
      'google.*',
      'example',
      'xn--80ak6aa92e.com',
      'a-b.c',
      'exa_mple.com',
      'a..b',
      '.com',
      'com.',
      '*.google.com',
      'google.*.com',
      'https://instagram.com',
      'www.',
      'x'.repeat(100),
      'x'.repeat(101),
      '',
    ];
    expect(samples.map(hostPattern)).toEqual(
      samples.map(labels.parseHostPattern)
    );
  });

  it('адрес назначения перехода годится там же, где у сервера', () => {
    const samples = [
      'https://t.me/ShopBot?start={label}',
      ' https://t.me/ShopBot?start={label} ',
      'https://example.com/{label}',
      'https://example.com/go?x=1&l={label}',
      'https://example.com/#{label}',
      'https://example.com:8443/a/{label}/b',
      'https://user:pass@example.com/{label}',
      'http://t.me/ShopBot?start={label}',
      'HTTPS://t.me/ShopBot?start={label}',
      'tg://resolve?domain=x&start={label}',
      'javascript:alert(1)//{label}',
      'https://t.me/ShopBot',
      'https://t.me/ShopBot?a={label}&b={label}',
      'https://{label}.example.com/',
      'https://example.com{label}',
      'https://example.com?{label}',
      'https:///{label}',
      'https://a\\b/{label}',
      'https://t.me/ShopBot\r\nSet-Cookie: x?start={label}',
      'https://t.me/ShopBot ?start={label}',
      'https://t.me/ShopBot?start=​{label}',
      'https://t.me/ShopBot?start=‮{label}',
      `https://${'a'.repeat(480)}.de/{label}`,
      `https://${'a'.repeat(500)}.de/{label}`,
      'https://example.com/{LABEL}',
      'https://[::1]/{label}',
      '',
    ];
    expect(samples.map((_) => targetProblem(_) === null)).toEqual(
      samples.map((_) => labels.parseTarget(_) !== null)
    );
  });

  // Страница входа и имя формы у сервера — внутри проверки воронки: сверяем с её отказом.
  const funnelAccepts = (step: Readonly<Record<string, unknown>>): boolean =>
    accepts(() =>
      setup.saveItem('funnel', {
        code: 'f',
        name: 'F',
        steps: [step, { kind: 'arrival' }],
      })(setup.EMPTY_SETUP)
    );

  it('страница входа шага воронки — путь сайта без пробелов, ? и #', () => {
    const samples = [
      '/',
      '/trial',
      '/a/b-c_d.html',
      '/ä',
      '',
      'trial',
      '/a b',
      '/a\tb',
      '/a?b',
      '/a#b',
      `/${'a'.repeat(499)}`,
      `/${'a'.repeat(500)}`,
    ];
    expect(samples.map(isSitePage)).toEqual(
      samples.map((page) => funnelAccepts({ kind: 'visits', page }))
    );
  });

  it('имя формы в цели шага — как его проверяет сервер', () => {
    const samples = [
      'contact',
      'a',
      '1x',
      'a-b-c',
      'a'.repeat(64),
      'a'.repeat(65),
      '-a',
      'A',
      'a_b',
      '',
    ];
    expect(samples.map(isFormName)).toEqual(
      samples.map((name) =>
        funnelAccepts({ kind: 'goal', goal: `${FORM_GOAL}${name}` })
      )
    );
  });

  it('подсчёт «части с разделителями» — тот же, по которому сервер отклоняет схему', () => {
    const site = setup.applySet(setup.readSet(SUBSCRIPTION))(
      setup.EMPTY_SETUP
    ).state;
    const view = { dictionaries: site.dictionaries } as unknown as SetupView;
    const schema = site.schemas[0]!;
    expect(schemaLength(view, schema.separator, schema.parts)).toBe(62);
    for (const separator of LABEL_SEPARATORS)
      for (const limit of [56, 57, 58, 61, 62, 63]) {
        const accepted = accepts(() =>
          setup.saveItem('schema', {
            sender: schema.sender,
            separator,
            length: limit,
          })(site)
        );
        expect([separator, limit, accepted]).toEqual([
          separator,
          limit,
          schemaLength(view, separator, schema.parts) <= limit,
        ]);
      }
  });
});

describe('образец абзаца политики об аналитике', () => {
  const sample = (lang: string, months: number, links = false): string =>
    PRIVACY_SAMPLES.find((_) => _.lang === lang)!.text({ months, links });

  // Фраза этапа 1 о несвязанности визита — у сайта без переходов; есть переход — фраза о переходе (ADR 0072).
  const _APART: Readonly<Record<string, string>> = {
    de: 'Ihr Besuch auf dieser Website wird damit nicht verknüpft; auf Ihrem Endgerät wird dafür nichts gespeichert oder ausgelesen.',
    en: 'Your visit to this website is not linked to it; nothing is stored on or read from your device for this purpose.',
    ru: 'С вашим посещением этого сайта они не связываются; на вашем устройстве для этого ничего не сохраняется и не считывается.',
  };
  const _LINKS: Readonly<Record<string, string>> = {
    de: 'Folgen Sie auf unserer Website einem Link zu [unserem Telegram-Bot / unserem Shop], gibt unser Server im Link mit, woher Sie an diesem Tag zu uns gekommen sind (Kampagnenparameter oder die verweisende Website, als Kürzel). Weitere Daten Ihres Besuchs geben wir nicht weiter, und auf Ihrem Endgerät wird dafür nichts gespeichert oder ausgelesen.',
    en: 'If you follow a link on our website to [our Telegram bot / our shop], our server adds to the link where you came to us from that day (campaign parameters or the referring website, as a short code). We pass on no other data about your visit, and nothing is stored on or read from your device for this purpose.',
    ru: 'Если вы переходите с нашего сайта по ссылке на [наш бот в Telegram / наш магазин], наш сервер добавляет в ссылку, откуда вы пришли к нам в этот день (параметры кампании или сайт, с которого вы перешли, — коротким кодом). Других данных о вашем посещении мы не передаём, и на вашем устройстве для этого ничего не сохраняется и не считывается.',
  };

  it.each(
    ['de', 'en', 'ru'].flatMap((lang) => [
      [lang, 0],
      [lang, 12],
    ]) as [string, number][]
  )(
    '%s, срок %d: без переходов — визит не связан, с переходом — фраза о переходе',
    (lang, months) => {
      expect(PRIVACY_SAMPLES.map((_) => _.lang)).toContain(lang);
      const apart = sample(lang, months, false);
      const linked = sample(lang, months, true);
      expect(apart).toContain(_APART[lang]!);
      expect(apart).not.toContain(_LINKS[lang]!);
      expect(linked).toContain(_LINKS[lang]!);
      expect(linked).not.toContain(_APART[lang]!);
      // Остальной абзац тот же: меняется только эта фраза.
      expect(linked.replace(_LINKS[lang]!, '')).toBe(
        apart.replace(_APART[lang]!, '')
      );
    }
  );

  it('со сроком — срок в месяцах после последнего события, без запятой', () => {
    expect(sample('de', 12)).toContain(
      'Die Ereignisse speichern wir bis zu 12 Monate nach dem letzten Ereignis.'
    );
    expect(sample('de', 1)).toContain('speichern wir bis zu 1 Monat nach');
    expect(sample('en', 12)).toContain(
      'We keep the events for up to 12 months after the last event.'
    );
    expect(sample('en', 1)).toContain('for up to 1 month after');
    expect(sample('ru', 12)).toContain(
      'События мы храним до 12 месяцев после последнего события.'
    );
    expect(sample('ru', 21)).toContain('храним до 21 месяца после');
  });

  it('бессрочно — придаточное: запятая в немецком и русском', () => {
    expect(sample('de', 0)).toContain(
      'Die Ereignisse speichern wir, bis Sie die Löschung verlangen.'
    );
    expect(sample('en', 0)).toContain(
      'We keep the events until you ask us to delete them.'
    );
    expect(sample('ru', 0)).toContain(
      'События мы храним, пока вы не попросите их удалить.'
    );
  });
});

describe('отчёты в менеджере — как у сервера', () => {
  const site = setup.applySet(setup.readSet(SUBSCRIPTION))(
    setup.EMPTY_SETUP
  ).state;
  const view = site as unknown as SetupView;
  const params = (query: string) => new URLSearchParams(query);

  it('пределы, «мало данных» и особые значения строк', () => {
    expect(reports.REPORT_LIMITS).toEqual(report.REPORT_LIMITS);
    expect(reports.LOW_DATA).toEqual(report.LOW_DATA);
    expect([reports.NONE, reports.UNKNOWN, reports.REST]).toEqual([
      report.NONE,
      report.UNKNOWN,
      report.REST,
    ]);
    expect(reports.PEOPLE_REPORT_KEYS).toEqual(
      REPORT_PEOPLE_FIELDS.filter((_) => _ !== 'filters')
    );
  });

  it('метка из частей собирается, как её соберёт сервер', () => {
    const schema = site.schemas[0]!;
    const cases: Record<string, string>[] = [
      { entry: 'w-trial', source: 'ig', channel: 'paid' },
      { entry: 'w-trial', channel: 'paid' },
      { source: 'ig' },
      { creative: 'ad-1' },
      {},
      { entry: 'post', other: 'x' },
    ];
    for (const parts of cases)
      for (const separator of LABEL_SEPARATORS)
        expect(reports.buildLabel({ ...schema, separator }, parts)).toBe(
          labels.buildLabel({ ...schema, separator }, parts)
        );
  });

  it('дни пояса — как у сервера, и через переход на зимнее время', () => {
    for (const moment of [
      '2026-10-25T00:30:00Z',
      '2026-10-31T23:30:00Z',
      '2026-09-30T22:30:00Z',
      '2026-03-29T01:30:00Z',
    ])
      for (const zone of ['Europe/Berlin', 'UTC', 'America/New_York'])
        expect(reports.dayIn(moment, zone)).toBe(days.dayIn(moment, zone));
    expect(reports.addDays('2026-11-03', -6)).toBe(
      days.addDays('2026-11-03', -6)
    );
    expect(reports.daysBetween('2026-10-01', '2026-10-31')).toBe(
      days.daysBetween('2026-10-01', '2026-10-31')
    );
    for (const raw of ['2026-02-29', '2026-13-01', '2026-10-1', '2028-02-29'])
      expect(reports.isDay(raw)).toBe(days.isDay(raw));
  });

  it('период из адреса читается с тем же приоритетом, что у сервера', () => {
    const clock = {
      now: '2026-11-15T12:00:00Z',
      zone: 'Europe/Berlin',
      firstArrival: () => '2026-06-01T10:00:00Z',
    };
    const today = '2026-11-15';
    const days = (choice: reports.PeriodChoice) =>
      choice.kind === 'all'
        ? { from: '2026-06-01', to: today }
        : choice.kind === 'range'
          ? { from: choice.from, to: choice.to }
          : { from: reports.addDays(today, 1 - choice.days), to: today };
    for (const query of [
      'days=7',
      'days=365',
      'from=2026-10-01&to=2026-10-31',
      'from=2026-10-01',
      'all=1',
      'all=1&days=7&from=2026-10-01&to=2026-10-31',
      'from=2026-10-01&to=2026-10-31&days=7',
    ])
      expect([query, days(reports.periodOf(params(query), today))]).toEqual([
        query,
        reportPeriod(Object.fromEntries(params(query)), clock)!,
      ]);
    expect(reports.periodOf(params(''), today)).toEqual({
      kind: 'days',
      days: 30,
    });
    expect(reports.periodPatch({ kind: 'days', days: 30 })).toEqual({
      days: null,
      from: null,
      to: null,
      all: null,
    });
  });

  it('свои даты ограничиваются так, что сервер их примет', () => {
    const today = '2026-11-15';
    for (const { 0: from, 1: to } of [
      ['2026-10-01', '2026-10-31'],
      ['2026-10-31', '2026-10-01'],
      ['2026-11-01', '2026-12-31'],
      ['2026-12-01', '2026-12-31'],
      ['2010-01-01', '2026-11-15'],
    ] as const) {
      const range = reports.clampRange(from, to, today);
      expect(
        reportPeriod(range, {
          now: '2026-11-15T12:00:00Z',
          zone: 'Europe/Berlin',
          firstArrival: () => null,
        })
      ).toEqual(range);
    }
  });

  it('фильтры и перенос между вкладками: период, атрибуция, фильтры, тестовые, комиссия и сравнение', () => {
    const query = params(
      'days=7&attribution=return&group=part:channel&window=7&test=1&part.source=ig&trait.lang=de&sender=bot&tab=events&page=2&q=u_1&funnel=journey&life=6&fees=net&compare=year'
    );
    expect(reports.carriedQuery(query)).toBe(
      '?days=7&attribution=return&test=1&part.source=ig&trait.lang=de&sender=bot&fees=net&compare=year'
    );
    expect(reports.reportSearch(query, { group: 'part:source' })).toBe(
      '?days=7&attribution=return&group=part%3Asource&window=7&test=1&part.source=ig&trait.lang=de&sender=bot&life=6&fees=net&compare=year'
    );
    // Срок жизни — только у «Источников»: вкладки его не переносят, воронке он не уходит.
    expect(reports.CARRIED_KEYS).not.toContain('life');
    expect(
      reports.reportSearch(params('life=3&fees=net&compare=previous'), {
        life: null,
        fees: null,
      })
    ).toBe('?compare=previous');
    expect(reports.filtersOf(query).map((_) => _.key)).toEqual([
      'part.source',
      'trait.lang',
      'sender',
    ]);
    expect(reports.fromReport(params('state=customer&sender=bot'))).toBe(false);
    expect(reports.fromReport(params('part.source=ig'))).toBe(true);
    expect(reports.fromReport(params('funnel=journey&step=2'))).toBe(true);
  });

  it('клик по значению — фильтр той же группы; «остальные» и метка целиком не фильтруются', () => {
    expect(reports.filterKeyOf('part:source')).toBe('part.source');
    expect(reports.filterKeyOf('answer:heard_from')).toBe('answer.heard_from');
    expect(reports.filterKeyOf('sender')).toBe('sender');
    expect(reports.filterKeyOf('label')).toBe(null);
    expect(reports.canFilter('part:source', report.NONE)).toBe(true);
    expect(reports.canFilter('part:source', report.REST)).toBe(false);
    expect(reports.canFilter('sender', report.NONE)).toBe(false);
  });

  it('раскрытие строки: следующая часть схемы, у «не указано» — первый вопрос опроса', () => {
    expect(reports.firstQuestion(view)).toBe(firstQuestion(site));
    expect(reports.nextGroupOf(view, 'part:entry', 'w-trial')).toBe(
      'part:source'
    );
    expect(reports.nextGroupOf(view, 'part:source', 'ig')).toBe('part:channel');
    expect(reports.nextGroupOf(view, 'part:source', report.UNKNOWN)).toBe(
      'part:channel'
    );
    expect(reports.nextGroupOf(view, 'part:source', report.NONE)).toBe(
      `answer:${firstQuestion(site)}`
    );
    expect(reports.nextGroupOf(view, 'part:creative', 'ad-1')).toBe(null);
    expect(reports.nextGroupOf(view, 'part:source', report.REST)).toBe(null);
    expect(reports.nextGroupOf(view, 'answer:heard_from', 'friend')).toBe(null);
    expect(reports.nextGroupOf(view, 'sender', 'bot')).toBe(null);
  });

  it('доли: знаменатель ноль — нет доли', () => {
    expect(reports.shareRate({ count: 2, base: 5 })).toBe(0.4);
    expect(reports.shareRate({ count: 0, base: 0 })).toBe(null);
    expect(reports.rateOf(5, 9)).toBe(5 / 9);
    expect(reports.rateOf(null, 9)).toBe(null);
    expect(reports.rateOf(3, 0)).toBe(null);
  });

  it('срок жизни, комиссия и сравнение: значения и умолчания — как у сервера', () => {
    expect(reports.LIFETIMES).toEqual(LIFETIMES);
    expect(reports.FEES_MODES).toEqual(FEES_MODES);
    expect(reports.lifeOf(params(''))).toBe(queryLife(undefined));
    expect(reports.feesOf(params(''))).toBe(queryFees(undefined));
    for (const life of ['0', '3', '6', '12'])
      expect(reports.lifeOf(params(`life=${life}`))).toBe(queryLife(life));
    expect(reports.feesOf(params('fees=net'))).toBe(queryFees('net'));
    const period = { from: '2026-10-01', to: '2026-10-31' };
    expect(reports.compareOf(params(''))).toBe(null);
    expect(comparePeriod({}, period)).toBe(null);
    for (const kind of reports.COMPARE_KINDS)
      expect(reports.compareOf(params(`compare=${kind}`))).toBe(
        comparePeriod({ compare: kind }, period)!.kind
      );
    // При «всё время» сравнения нет, но параметр — не ошибка: его переносят вкладки.
    expect(comparePeriod({ compare: 'previous', all: '1' }, period)).toBe(null);
  });

  it('изменение к прошлому периоду: проценты, пункты, «новое»', () => {
    expect(reports.percentChange(12, 10)).toEqual({
      kind: 'percent',
      value: 0.2,
    });
    expect(reports.percentChange(5, 0)).toEqual({ kind: 'new' });
    expect(reports.percentChange(0, 0)).toEqual({ kind: 'percent', value: 0 });
    expect(reports.percentChange(null, 4)).toBe(null);
    expect(reports.pointsChange(0.45, 0.4)).toEqual({
      kind: 'points',
      value: expect.closeTo(5, 9),
    });
    expect(reports.pointsChange(0.4, null)).toBe(null);
  });

  it('месяцы — как у сервера', () => {
    for (const { 0: month, 1: n } of [
      ['2026-11', -1],
      ['2026-01', -1],
      ['2026-11', -11],
      ['2026-12', 1],
      ['2000-01', 0],
    ] as const)
      expect(reports.addMonths(month, n)).toBe(days.addMonths(month, n));
    for (const raw of ['2026-11', '2026-13', '2026-1', '2026-00', 11])
      expect(reports.isMonth(raw)).toBe(days.isMonth(raw));
  });
});

// Выгрузка CSV (ADR 0072, «Выгрузка CSV»): файл откроется в Excel языка менеджера и не выполнит формулу из
// названия, которое написал человек.
describe('CSV менеджера', () => {
  const BOM = '\uFEFF';
  const file = (rows: readonly csv.CsvRow[], language: string) =>
    csv.csvText(rows, language);

  it('UTF-8 с BOM, строки — CRLF, разделитель и десятичный знак — по языку', () => {
    const rows = [
      ['Источник', 'Выручка, EUR'],
      ['Instagram', csv.csvMoney(9500, 'EUR')],
    ];
    expect(file(rows, 'ru')).toBe(
      `${BOM}Источник;Выручка, EUR\r\nInstagram;95,00\r\n`
    );
    expect(file(rows, 'de')).toBe(
      `${BOM}Источник;Выручка, EUR\r\nInstagram;95,00\r\n`
    );
    expect(file(rows, 'en')).toBe(
      `${BOM}Источник,"Выручка, EUR"\r\nInstagram,95.00\r\n`
    );
    expect(csv.csvFormat('en')).toEqual({ separator: ',', decimal: '.' });
    expect(csv.csvFormat('de')).toEqual({ separator: ';', decimal: ',' });
    expect(csv.csvFormat('ru')).toEqual({ separator: ';', decimal: ',' });
  });

  it('кавычки по RFC 4180: разделитель, кавычка и перевод строки — в кавычках, кавычки удваиваются', () => {
    expect(
      file([['a;b', 'say "hi"', 'one\ntwo', 'one\r\ntwo', 'plain']], 'ru')
    ).toBe(`${BOM}"a;b";"say ""hi""";"one\ntwo";"one\r\ntwo";plain\r\n`);
    expect(file([['a,b', 'a;b']], 'en')).toBe(`${BOM}"a,b",a;b\r\n`);
  });

  it('защита от формул: текст с =, +, -, @, табуляции или возврата каретки в начале получает апостроф', () => {
    expect(
      file(
        [['=1+1', '+1', '-1', '@SUM(A1)', '\tTab', '\rCR', 'ok=1', ' =1']],
        'ru'
      )
    ).toBe(`${BOM}'=1+1;'+1;'-1;'@SUM(A1);'\tTab;"'\rCR";ok=1; =1\r\n`);
    // Название с кавычкой и разделителем: сначала апостроф, затем кавычки.
    expect(file([['=HYPERLINK("x","y")']], 'en')).toBe(
      `${BOM}"'=HYPERLINK(""x"",""y"")"\r\n`
    );
  });

  it('числа — числами: апострофа нет, отрицательное остаётся числом, знак — по языку', () => {
    expect(
      file(
        [
          [
            -1,
            5,
            csv.csvMoney(-2300, 'EUR'),
            csv.csvMoney(1500, 'JPY'),
            csv.csvMoney(1234, 'KWD'),
            csv.csvPercent(0.4),
            csv.csvPercent(1 / 3),
            csv.csvDecimal(1.5, 2),
            csv.csvDecimal(-0.04, 1),
            csv.csvMoney(null, 'EUR'),
            null,
          ],
        ],
        'ru'
      )
    ).toBe(`${BOM}-1;5;-23,00;1500;1,234;40,0;33,3;1,50;0,0;;\r\n`);
    expect(
      file([[csv.csvMoney(-2300, 'EUR'), csv.csvPercent(0.4)]], 'en')
    ).toBe(`${BOM}-23.00,40.0\r\n`);
  });

  it('имя файла и моменты в поясе отчётов', () => {
    expect(csv.csvName('sources', '2026-06-01', '2026-10-31')).toBe(
      'eile-sources-2026-06-01-2026-10-31.csv'
    );
    expect(csv.csvMoment('2026-10-25T00:30:00Z', 'Europe/Berlin')).toBe(
      '2026-10-25 02:30'
    );
    expect(csv.csvMoment('2026-10-25T01:30:00Z', 'Europe/Berlin')).toBe(
      '2026-10-25 02:30'
    );
    expect(csv.csvMoment('2026-11-15T23:05:00Z', 'UTC')).toBe(
      '2026-11-15 23:05'
    );
    expect(csv.csvMoment(null, 'UTC')).toBe(null);
  });
});

// Форма «Расходов» проверяет строки до отправки: повтор ключа — ошибка, а не тихая замена суммы прежней строки.
describe('черновики строк расхода', () => {
  const draft = (patch: Partial<spend.SpendDraft>): spend.SpendDraft => ({
    key: spend.nextDraftKey(),
    id: null,
    month: '2026-11',
    parts: {},
    currency: 'EUR',
    amount: '60,00',
    note: '',
    ...patch,
  });
  const row = {
    id: 7,
    month: '2026-11',
    parts: { channel: 'x', source: 'y' },
    currency: 'EUR',
  } as unknown as SpendView;

  it('сумма, валюта и заметка — по правилам сервера; ключ — месяц, части без пустых и валюта', () => {
    const bad = draft({ amount: '60,001', note: 'x'.repeat(501) });
    const empty = draft({ currency: '' });
    expect(Object.keys(spend.checkDrafts([bad, empty], [])).toSorted()).toEqual(
      [
        `${bad.key}.amount`,
        `${bad.key}.note`,
        `${empty.key}.currency`,
      ].toSorted()
    );
    expect(
      spend.spendKeyOf('2026-11', { source: 'y', channel: 'x', x: '' }, 'EUR')
    ).toBe(spend.spendKeyOf('2026-11', { channel: 'x', source: 'y' }, 'EUR'));
  });

  it('повтор в форме и строка месяца с тем же ключом — ошибка; правка самой строки — нет', () => {
    const first = draft({ parts: { source: 'y', channel: 'x' } });
    const second = draft({
      parts: { channel: 'x', source: 'y', creative: '' },
    });
    expect(spend.checkDrafts([first, second], [])).toEqual({
      [`${second.key}.parts`]: t('spend.repeatDraft'),
    });
    expect(spend.checkDrafts([first], [row])).toEqual({
      [`${first.key}.parts`]: t('spend.repeatRow'),
    });
    expect(spend.checkDrafts([{ ...first, id: 7 }], [row])).toEqual({});
  });

  it('тело строки: сумма — записью с точкой, пустые части убраны, номер — только у правки', () => {
    expect(
      spend.inputOf(
        draft({
          parts: { source: 'y', channel: '' },
          amount: '1 000,5',
          note: ' x ',
        })
      )
    ).toEqual({
      month: '2026-11',
      parts: { source: 'y' },
      currency: 'EUR',
      amount: '1000.5',
      note: 'x',
    });
    expect(spend.inputOf(draft({ id: 7 })).id).toBe(7);
  });
});

it('копия строки прошлого месяца — новая строка без номера, правка — с номером', () => {
  const row = {
    id: 3,
    month: '2026-06',
    parts: { source: 'y' },
    currency: 'EUR',
    amount: 6000,
    note: 'n',
  } as unknown as SpendView;
  expect(spend.draftOf(row, '60,00').id).toBe(3);
  expect(spend.draftOf(row, '60,00', '2026-07')).toMatchObject({
    id: null,
    month: '2026-07',
    parts: { source: 'y' },
    amount: '60,00',
  });
  expect(spend.inputOf(spend.draftOf(row, '60,00', '2026-07')).id).toBe(
    undefined
  );
});

// «Обзор», «Когорты» и «Сравнение вех» (ADR 0072, этап 3, часть 5): экран показывает ответ сервера, а шкалу,
// состояние ячейки словами, состав среднего, адреса людей и CSV считает сам — по настоящему ответу на файле этапа
// 3 с часами плана тестов (15 ноября 2026, Europe/Berlin).
describe('«Обзор», когорты и сравнение вех в менеджере', () => {
  const NOW = '2026-11-15T12:00:00.000Z';
  const ANNA = { id: 1, name: 'Анна', agent: false };
  const FILTER = /^(?:part|trait|prop|answer)\./;
  let dir = '';
  let app: App;

  const paymentReport = (query: Record<string, string> = {}) =>
    app.analytics.reports.cohorts({
      from: '2026-06-01',
      to: '2026-11-15',
      ...query,
    }) as unknown as cohorts.PaymentCohorts;

  // Список людей по адресу ссылки — как маршрут GET /analytics/people.
  const listed = (query: URLSearchParams): number =>
    app.analytics.people.list({
      test: query.get('test') === '1',
      from: query.get('from'),
      to: query.get('to'),
      by: query.get('by'),
      milestone: query.get('milestone'),
      reached: query.get('reached'),
      filters: Object.fromEntries(
        [...query].filter(({ 0: key }) => FILTER.test(key))
      ),
      limit: 200,
    }).total;

  beforeAll(async () => {
    await loadLanguage('ru');
    dir = mkdtempSync(join(tmpdir(), 'cms-manager-cohorts-'));
    app = createApp({
      databasePath: join(dir, 'site.db'),
      mediaCache: join(dir, 'cache'),
      clock: () => new Date(NOW),
    });
    app.stats.settings.save({ timeZone: 'Europe/Berlin' });
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.settings.save({ enabled: true }, ANNA);
    app.analytics.senders.issue('bot', 'Бот', ANNA);
    await app.analytics.events.import(
      join(import.meta.dir, 'fixtures/analytics-stage3.jsonl')
    );
    app.analytics.settings.save({ baseCurrency: 'EUR' }, ANNA);
    app.analytics.rates.save(
      [
        { currency: 'PLN', day: '2026-06-01', rate: '0.2300' },
        { currency: 'PLN', day: '2026-09-01', rate: '0.2400' },
        { currency: 'PLN', day: '2026-10-01', rate: '0.2500' },
      ],
      ANNA
    );
    app.analytics.spend.save(
      [
        {
          month: '2026-10',
          parts: {},
          currency: 'EUR',
          amount: '50.00',
        },
      ],
      ANNA
    );
    app.analytics.people.refresh();
  });

  afterAll(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('основа, показатели и месяцы жизни — как у сервера; когорты и вехи не переносятся вкладками', () => {
    expect(reports.COHORT_BASES).toEqual(COHORT_BASES);
    expect(reports.COHORT_METRICS).toEqual(COHORT_METRICS);
    expect(reports.COHORT_LIFE).toBe(COHORT_LIMITS.life);
    expect(reports.metricOf(new URLSearchParams())).toBe(
      queryMetric(undefined)
    );
    expect(queryBasis(undefined, true)).toBe('payment');
    const query = new URLSearchParams(
      'days=183&basis=arrival&metric=active&fees=net&part.source=ig'
    );
    expect(reports.REPORT_KEYS).toContain('basis');
    expect(reports.REPORT_KEYS).toContain('metric');
    expect(reports.reportSearch(query)).toBe(
      '?days=183&basis=arrival&metric=active&fees=net&part.source=ig'
    );
    expect(reports.carriedQuery(query)).toBe(
      '?days=183&fees=net&part.source=ig'
    );
    // Период когорт без параметра — 12 месяцев, а не 30 дней: готовый период 12 месяцев — без параметра.
    expect(
      reports.periodOf(new URLSearchParams(), '2026-11-15', reports.COHORT_DAYS)
    ).toEqual({ kind: 'days', days: 365 });
    expect(
      reports.periodPatch({ kind: 'days', days: 365 }, reports.COHORT_DAYS)
    ).toEqual({ days: null, from: null, to: null, all: null });
    expect(
      reports.periodPatch({ kind: 'days', days: 30 }, reports.COHORT_DAYS).days
    ).toBe('30');
  });

  it('шкала: пять ступеней от меньшего к большему по полным и неполным ячейкам, будущих и пустых в ней нет', () => {
    const report = paymentReport();
    const scale = cohorts.heatScale(report.rows, report.metric)!;
    // Октябрь — 0,00 без курса, август — 94,00 по курсу прошлого месяца.
    expect(scale).toEqual({ min: 0, max: 9400 });
    expect(cohorts.heatStep(0, scale)).toBe(0);
    expect(cohorts.heatStep(9400, scale)).toBe(4);
    expect(cohorts.heatStep(4900, scale)).toBe(2);
    expect(cohorts.heatStep(1880, scale)).toBe(1);
    expect(cohorts.heatStep(5, { min: 5, max: 5 })).toBe(2);
    expect(cohorts.heatStep(-200, { min: -200, max: 2100 })).toBe(0);
    expect(cohorts.heatBounds(scale)).toEqual([0, 1880, 3760, 5640, 7520]);
    const june = report.rows[0]!;
    expect(cohorts.cellMeasure(june.cells[4]!, 'cumulative')).toBe(5700);
    expect(cohorts.cellMeasure(june.cells[5]!, 'cumulative')).toBe(null);
    expect(cohorts.cellMeasure(june.cells[6]!, 'cumulative')).toBe(null);
    // Доступ — долей с доступом из проживших месяц: июнь — 2 из 2, 1 из 2, ◌ 0 из 1.
    const active = paymentReport({ metric: 'active' });
    expect(
      active.rows[0]!.cells.slice(0, 5).map((_) =>
        cohorts.cellMeasure(_, 'active')
      )
    ).toEqual([1, 0.5, 0.5, 0, 0]);
    expect(cohorts.heatScale(active.rows, 'active')).toEqual({
      min: 0,
      max: 1,
    });
    // Столбцы — до месяца 5: дальше все ячейки будущие и средних нет.
    expect(cohorts.lifeColumns(report)).toBe(6);
  });

  it('состояние ячейки словами: неполная с «1 из 2», без проживших, будущая, без курса, курс прошлого месяца', () => {
    const report = paymentReport();
    const row = (month: string) => report.rows.find((_) => _.month === month)!;
    expect(cohorts.cellWords(row('2026-06').cells[0]!, row('2026-06'))).toBe(
      ''
    );
    expect(cohorts.cellWords(row('2026-06').cells[4]!, row('2026-06'))).toBe(
      'неполная: прожили 1 из 2'
    );
    expect(cohorts.cellWords(row('2026-11').cells[0]!, row('2026-11'))).toBe(
      'неполная: месяц ещё не прожил никто'
    );
    expect(cohorts.cellWords(row('2026-07').cells[5]!, row('2026-07'))).toBe(
      'ещё не наступил'
    );
    expect(cohorts.cellWords(row('2026-10').cells[0]!, row('2026-10'))).toBe(
      'есть суммы без курса'
    );
    expect(cohorts.cellWords(row('2026-08').cells[1]!, row('2026-08'))).toBe(
      'по курсу прошлого месяца'
    );
    expect(row('2026-11').open).toBe(true);
  });

  it('среднее: вошедшие когорты и их клиенты — те же, что у сервера; текущий месяц и неполные не входят', () => {
    for (const query of [
      {},
      { metric: 'monthly' },
      { metric: 'active' },
      { fees: 'net' },
    ] as Record<string, string>[]) {
      const report = paymentReport(query);
      report.average.forEach((average, k) => {
        const members = cohorts.averageMembers(report.rows, k);
        expect([k, members.length]).toEqual([k, average.cohorts]);
        expect([k, members.reduce((sum, _) => sum + _.customers, 0)]).toEqual([
          k,
          average.customers,
        ]);
        expect(members.some((_) => _.open)).toBe(false);
      });
    }
    const report = paymentReport();
    expect(cohorts.averageMembers(report.rows, 0).map((_) => _.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    // 31,20 € — (21,00 × 2 + 49,00 + 46,00 + 19,00) / 5 по полным ячейкам месяца 0.
    expect(report.average[0]!.value).toBe(
      cohorts
        .averageMembers(report.rows, 0)
        .reduce((sum, row) => sum + row.cells[0]!.value! * row.customers, 0) / 5
    );
  });

  it('CSV когорт — длинной таблицей: строка на «когорта × месяц жизни» без будущих, ниже — среднее', () => {
    const report = paymentReport();
    const rows = cohorts.paymentCohortsCsv(report);
    expect(rows[0]).toEqual([
      'Когорта',
      'Клиентов',
      'Месяц жизни',
      'Состояние',
      'Прожили',
      'Накопленная выручка на клиента (до комиссии), EUR',
      'Когорт в среднем',
      'Мало данных',
      'Отметки',
    ]);
    const cells = report.rows.flatMap((row) =>
      row.cells.filter((_) => _.state !== 'future')
    ).length;
    const averages = report.average.filter((_) => _.value !== null).length;
    expect(rows).toHaveLength(1 + cells + averages);
    const file = csv.csvText(rows, 'ru');
    expect(file).toContain(
      '\r\n2026-06;2;4;неполная;1;57,00;;мало данных;\r\n'
    );
    expect(file).toContain(
      '\r\n2026-08;1;1;полная;1;94,00;;мало данных;курс прошлого месяца\r\n'
    );
    expect(file).toContain(
      '\r\n2026-10;1;0;полная;1;0,00;;мало данных;без курса\r\n'
    );
    expect(file).toContain(
      '\r\n2026-11;1;0;неполная;0;;;мало данных;месяц идёт\r\n'
    );
    expect(file).toContain('\r\nСреднее;5;0;;;31,20;4;;\r\n');
    const active = csv.csvText(
      cohorts.paymentCohortsCsv(paymentReport({ metric: 'active' })),
      'ru'
    );
    expect(active).toContain(
      ';Прожили;С доступом;С доступом, %;Когорт в среднем;'
    );
    expect(active).toContain(
      '\r\n2026-06;2;1;полная;2;1;50,0;;мало данных;\r\n'
    );
    expect(active).toContain('\r\nСреднее;6;0;;;6;100,0;5;;\r\n');
  });

  it('CSV когорт по приходу и сравнения вех: доли — четырьмя столбцами, разница — в пунктах', () => {
    const arrival = app.analytics.reports.cohorts({
      from: '2026-06-01',
      to: '2026-11-15',
      basis: 'arrival',
    }) as unknown as cohorts.ArrivalCohorts;
    const rows = cohorts.arrivalCohortsCsv(arrival);
    expect(rows[0]!.slice(0, 6)).toEqual([
      'Когорта',
      'Новые люди',
      'Активация: засчитано',
      'Активация: из',
      'Активация: ещё в окне',
      'Активация, %',
    ]);
    expect(rows).toHaveLength(1 + arrival.rows.length + 1);
    expect(rows.at(-1)![0]).toBe('Среднее');
    const comparison = app.analytics.reports.milestones({
      from: '2026-06-01',
      to: '2026-10-31',
    }) as unknown as MilestoneComparison;
    const file = csv.csvText(milestones.milestonesCsv(comparison), 'ru');
    // Активация: достигли 2, не достигли 6; оплатили 2 из 2 и 4 из 5, +1 в окне (M7) — разница 20 п. п.
    expect(file).toContain(
      '\r\nactivation;Активация;2;6;0;2;2;0;100,0;4;5;1;80,0;20,0;мало данных\r\n'
    );
    expect(milestones.paidDifference(comparison.milestones[0]!)).toBeCloseTo(
      20,
      9
    );
  });

  it('ссылки в «Людей» ведут к тем же людям, что в числе: когорта, веха достигнута и не достигнута', () => {
    const report = paymentReport({ 'part.channel': 'paid' } as never);
    expect(
      cohorts
        .cohortPeople('2026-11', 'payment', report, '2026-11-15')
        .toString()
    ).toBe('by=payment&from=2026-11-01&to=2026-11-15');
    expect(
      cohorts
        .cohortPeople(
          '2026-06',
          'arrival',
          { filters: { 'part.channel': 'paid' }, test: true },
          '2026-11-15'
        )
        .toString()
    ).toBe('from=2026-06-01&to=2026-06-30&part.channel=paid&test=1');
    for (const row of paymentReport().rows)
      expect([
        row.month,
        listed(
          cohorts.cohortPeople(row.month, 'payment', report, '2026-11-15')
        ),
      ]).toEqual([row.month, row.customers]);
    const arrival = app.analytics.reports.cohorts({
      from: '2026-06-01',
      to: '2026-11-15',
      basis: 'arrival',
    }) as unknown as cohorts.ArrivalCohorts;
    for (const row of arrival.rows)
      expect([
        row.month,
        listed(
          cohorts.cohortPeople(row.month, 'arrival', arrival, '2026-11-15')
        ),
      ]).toEqual([row.month, row.people]);
    const comparison = app.analytics.reports.milestones({
      from: '2026-06-01',
      to: '2026-10-31',
    }) as unknown as MilestoneComparison;
    const activation = comparison.milestones[0]!;
    expect(
      milestones.milestonePeople('activation', false, comparison).toString()
    ).toBe('milestone=activation&reached=0&from=2026-06-01&to=2026-10-31');
    expect(
      listed(milestones.milestonePeople('activation', true, comparison))
    ).toBe(activation.reached);
    expect(
      listed(milestones.milestonePeople('activation', false, comparison))
    ).toBe(activation.missed);
  });

  it('«Обзор»: период посещений — запросом отчёта, плитки ведут в «Источники», «Когорты» и «Расходы»', () => {
    expect(overview.overviewSearch({ days: 7 })).toBe('?days=7');
    const search = overview.overviewSearch({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(search).toBe('?from=2026-10-01&to=2026-10-31');
    const report = app.analytics.reports.overview(
      Object.fromEntries(new URLSearchParams(search))
    ) as unknown as OverviewReport;
    expect([report.from, report.to, report.compare]).toEqual([
      '2026-10-01',
      '2026-10-31',
      { from: '2026-08-31', to: '2026-09-30' },
    ]);
    expect(overview.overviewQueries(search, report)).toEqual({
      sources: '?from=2026-10-01&to=2026-10-31',
      cohorts: '?metric=active',
      spend: '?from=2026-10&to=2026-10',
    });
    // Итоги — как в таблице ADR: 2 и 1 новых человека, по одному клиенту, доступ 2 и 3.
    expect([
      report.current.people,
      report.previous.people,
      report.current.customers,
      report.current.active,
      report.previous.active,
    ]).toEqual([2, 1, 1, 2, 3]);
    expect(
      reports.percentChange(report.current.people, report.previous.people)
    ).toEqual({ kind: 'percent', value: 1 });
  });

  it('BOM — escape-последовательностью в исходнике, в файле — U+FEFF первым знаком', async () => {
    const source = await Bun.file(
      join(import.meta.dir, '../manager/src/lib/csv.ts')
    ).text();
    expect(source.includes('\uFEFF')).toBe(false);
    expect(source).toContain("'\\uFEFF'");
    expect(csv.csvText([['a']], 'ru').charCodeAt(0)).toBe(0xfeff);
  });
});

// «Качество данных», перенос набора, отметки версий и пороги «мало данных» в менеджере (ADR 0072, этап 4, часть
// 5): экран решает, что показать, по своим копиям таблиц сервера и словами по ответу сервера — на настоящем
// ответе сайта с ботом, сводками и сбоями (часы — 25 ноября 2026, 12:00 UTC).
describe('«Качество данных» в менеджере — как у сервера', () => {
  const NOW = '2026-11-25T12:00:00.000Z';
  const ANNA = { id: 1, name: 'Анна', agent: false };
  let dir = '';
  let app: App;
  let now = new Date(NOW);
  let key = '';
  let ids = 0;

  const post = (body: Record<string, unknown>) =>
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
        { requestIP: () => ({ address: '192.0.2.10' }) } as never
      )
      .then((_) => _.json());

  const next = (day: string) => days.addDays(day, 1);

  // Сутки бота: старт в 9 утра, сводка в 03:00 следующих суток (час сводки — 03:30), версия — по суткам.
  const botDay = async (day: string, summary: boolean, version: string) => {
    now = new Date(`${day}T09:00:01Z`);
    await post({
      id: `s_${++ids}`,
      type: 'bot_start',
      at: `${day}T09:00:00Z`,
      subject: `u_${day.replaceAll('-', '')}_01`,
      data: { label: 'post__ig__paid' },
    });
    if (summary) {
      now = new Date(`${next(day)}T03:00:01Z`);
      await post({
        id: `sum_${++ids}`,
        type: 'daily_summary',
        at: `${next(day)}T03:00:00Z`,
        data: { day, counts: { bot_start: 1 }, version },
      });
    }
    now = new Date(`${next(day)}T07:00:00Z`);
    app.analytics.quality.tick();
  };

  beforeAll(async () => {
    await loadLanguage('ru');
    dir = mkdtempSync(join(tmpdir(), 'cms-manager-quality-'));
    app = createApp({
      databasePath: join(dir, 'site.db'),
      mediaCache: join(dir, 'cache'),
      clock: () => now,
      updateCheck: false,
    });
    const answer = await app.fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: app.identity.setup.token(),
          email: 'anna@example.com',
          name: 'Анна',
          password: 'correct horse battery',
        }),
      })
    );
    expect(answer.status).toBe(200);
    now = new Date('2026-11-19T12:00:00Z');
    app.analytics.setup.apply(SUBSCRIPTION, ANNA);
    app.analytics.settings.save({ enabled: true }, ANNA);
    app.analytics.senders.save({ code: 'bot', summaryAt: '03:30' }, ANNA);
    key = app.analytics.senders.issue('bot', 'Бот', ANNA).key;
    await botDay('2026-11-20', true, '1.4.2');
    await botDay('2026-11-21', true, '1.4.2');
    await botDay('2026-11-22', false, '1.4.2');
    await botDay('2026-11-23', true, '1.5.0');
    await botDay('2026-11-24', false, '1.5.0');
    now = new Date(NOW);
    app.analytics.quality.tick();
    app.analytics.quality.resolve(
      { check: 'summary_arrived', day: '2026-11-22', scope: 'bot' },
      'Бот был на обслуживании.',
      ANNA
    );
  });

  afterAll(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const report = () =>
    app.analytics.quality.report({
      days: 30,
      detail: '1',
    }) as unknown as QualityReport;

  it('встроенные проверки, пороги и пределы — копия таблиц сервера', () => {
    expect(
      quality.BUILTIN_CHECKS.map((_) => ({
        code: _.code,
        clock: _.clock,
        scope: _.scope,
        notify: _.notify,
        params: _.params,
        defaults: _.defaults,
        enabled: _.enabled,
      }))
    ).toEqual(
      serverQuality.BUILTIN_CHECKS.map((_) => ({
        code: _.code,
        clock: _.clock,
        scope: _.scope,
        notify: _.notify,
        params: Object.fromEntries(
          Object.entries(_.params).map(({ 0: k, 1: v }) => [k, v.kind])
        ),
        defaults: serverQuality.defaultsOf(_),
        enabled: _.enabled ?? true,
      }))
    );
    expect(CHECK_CODE_LIMIT).toBe(serverQuality.CHECK_CODE_LIMIT);
    const limits = serverQuality.QUALITY_LIMITS;
    expect(quality.QUALITY_LIMITS).toEqual({
      gridDays: limits.gridDays,
      screenDays: 30,
      custom: limits.custom,
      threshold: limits.threshold,
      note: limits.note,
    });
    expect(qualityDrafts.CHECK_METRICS).toEqual(serverQuality.CHECK_METRICS);
    expect(qualityDrafts.METRIC_PARAMS).toEqual(serverQuality.METRIC_PARAMS);
    expect(qualityDrafts.RULE_DAYS).toEqual(serverQuality.RULE_DAYS);
    expect(qualityDrafts.RULE_ROLES).toEqual(
      ROLE_CODES.filter(
        (_) => !serverQuality.RULE_ROLES_EXCLUDED.includes(_ as never)
      )
    );
    expect(RECONCILE_KINDS).toEqual(serverQuality.RECONCILE_KINDS);
    expect(DEFAULT_SUMMARY_AT).toBe(setup.DEFAULT_SUMMARY_AT);
  });

  it('пороги из поля — те же, что примет сервер, у каждого вида', () => {
    const samples = [
      -1, 0, 0.5, 0.05, 1, 9.9, 10, 31, 32, 100, 100.1, 1000, 1001, 10_000,
      10_001, 100_000, 100_001,
    ];
    for (const spec of quality.BUILTIN_CHECKS)
      for (const { 0: param, 1: kind } of Object.entries(spec.params))
        for (const value of samples)
          expect([
            spec.code,
            param,
            value,
            quality.fitsParam(value, kind),
          ]).toEqual([
            spec.code,
            param,
            value,
            accepts(() =>
              serverQuality.checkCorrection(
                { params: { [param]: value } },
                null,
                spec.code,
                'Check'
              )
            ),
          ]);
  });

  it('код своей, час сводки и отметка сверки — по правилам сервера', () => {
    for (const code of [
      'payments_day',
      'a',
      'A',
      'x'.repeat(40),
      'x'.repeat(41),
      'a b',
      '',
    ])
      expect([code, isCheckCode(code)]).toEqual([
        code,
        code.length <= serverQuality.CHECK_CODE_LIMIT &&
          /^[a-z0-9_-]+$/.test(code),
      ]);
    const site = setup.applySet(setup.readSet(SUBSCRIPTION))(
      setup.EMPTY_SETUP
    ).state;
    for (const hour of [
      '06:00',
      '03:30',
      '23:59',
      '00:00',
      '24:00',
      '6:00',
      '06:60',
      '06:00:00',
      '',
    ])
      expect([hour, isSummaryAt(hour)]).toEqual([
        hour,
        accepts(() =>
          setup.saveItem('sender', { code: 'bot', summaryAt: hour })(site)
        ),
      ]);
    for (const kind of KINDS)
      expect([kind, reconcileFor(kind)]).toEqual([
        kind,
        RECONCILE_MARKS.filter((mark) =>
          accepts(() =>
            setup.saveItem('property', {
              scope: 'event',
              code: 'n_check',
              name: 'N',
              kind,
              dictionary: kind === 'choice' ? 'plan' : null,
              reconcile: mark,
            })(site)
          )
        ),
      ]);
  });

  it('названия встроенных проверок — те же, что у сервера, на трёх языках', async () => {
    for (const language of ['ru', 'en', 'de'] as const) {
      await loadLanguage(language);
      for (const code of Object.keys(serverTexts.CHECK_NAMES))
        expect([code, quality.checkName(code, [])]).toEqual([
          code,
          serverTexts.CHECK_NAMES[code]![language],
        ]);
    }
    await loadLanguage('ru');
    expect(
      quality.checkName('payments_day', [
        { code: 'payments_day', name: 'Оплат меньше одной' },
      ])
    ).toBe('Оплат меньше одной');
  });

  it('сроки и начало суток — как у сервера: час сводки, 06:05 UTC, пояс и месяц, через переход времени', () => {
    for (const zone of ['Europe/Berlin', 'UTC', 'America/New_York'])
      for (const day of [
        '2026-10-24',
        '2026-10-25',
        '2026-03-28',
        '2026-03-29',
        '2026-11-24',
        '2026-12-31',
      ]) {
        expect(quality.dayStart(day, zone)).toBe(days.dayStart(day, zone));
        for (const clock of ['summary', 'utc', 'report', 'month'] as const)
          for (const hour of ['03:30', '23:59', null])
            expect([
              zone,
              day,
              clock,
              hour,
              quality.dueAt(clock, day, hour, zone),
            ]).toEqual([
              zone,
              day,
              clock,
              hour,
              serverQuality.dueAt(clock, day, hour, zone),
            ]);
      }
  });

  it('сетка: строки и ячейки ответа — значком и словами, снятое — поверх состояния, месяц — одной ячейкой', () => {
    const answer = report();
    const row = answer.rows.find(
      (_) => _.check === 'summary_arrived' && _.scope === 'bot'
    )!;
    const cell = (day: string) => row.cells.find((_) => _.day === day)!;
    expect(quality.cellState(cell('2026-11-24'))).toBe('failure');
    expect(quality.cellState(cell('2026-11-22'))).toBe('resolved');
    expect(quality.cellState(cell('2026-11-23'))).toBe('ok');
    // Четыре знака разные; у снятого знака нет — его значок рисует StateSymbol (галочка в круге).
    expect(
      new Set(Object.values(quality.STATE_MARKS).map((_) => _.symbol))
    ).toEqual(new Set(['✓', '!', '✕', '–', '']));
    expect(quality.STATE_MARKS.resolved.symbol).toBe('');
    const view = { checks: answer.checks, setup: null };
    expect(quality.cellLabel(row, cell('2026-11-24'), view)).toBe(
      'Сводка пришла, bot, 24 нояб.: сбой — сводки нет'
    );
    expect(quality.cellLabel(row, cell('2026-11-22'), view)).toBe(
      'Сводка пришла, bot, 22 нояб.: сбой, снято вручную — сводки нет'
    );
    const events = answer.rows.find(
      (_) => _.check === 'events_arrived' && _.scope === 'bot'
    )!;
    expect(
      quality.valueText(
        'events_arrived',
        events.cells.find((_) => _.day === '2026-11-24')!
      )
    ).toBe('сводки нет');
    expect(
      quality.valueText(
        'events_arrived',
        events.cells.find((_) => _.day === '2026-11-23')!
      )
    ).toBe('все события дошли');
    // Месячная строка — одна ячейка на все дни месяца в сетке.
    const grid = quality.gridDays('2026-10-28', '2026-11-26');
    expect(grid).toHaveLength(30);
    expect(
      quality
        .gridCells({ zone: 'month', cells: [] }, grid)
        .map((_) => [_.day, _.span])
    ).toEqual([
      ['2026-10-28', 4],
      ['2026-11-01', 26],
    ]);
    expect(quality.gridCells(row, grid).every((_) => _.span === 1)).toBe(true);
  });

  it('главное число и причины словами: у каждой причины «нет данных» — слова, у своей — значение и порог', () => {
    const reasons = [
      'intake_off',
      'no_summary',
      'no_revenue',
      'no_failed',
      'erased',
      'no_schema',
      'low_volume',
      'stats_off',
      'no_links',
      'no_base',
      'stale',
      'no_statement',
    ];
    expect(reasons.filter((_) => !quality.REASON_KEYS[_])).toEqual([]);
    expect(Object.keys(quality.REASON_KEYS).toSorted()).toEqual(
      reasons.toSorted()
    );
    expect(
      quality.valueText('summary_arrived', {
        state: 'failure',
        reason: 'missing',
        value: 3,
      })
    ).toBe('нет сводки 3 дня подряд');
    expect(
      quality.valueText('events_arrived', {
        state: 'failure',
        reason: 'missing',
        value: 2,
      })
    ).toBe('недостаёт 2 событий');
    expect(
      quality.valueText('events_arrived', {
        state: 'failure',
        reason: 'missing',
        value: 1,
      })
    ).toBe('недостаёт 1 события');
    expect(
      quality.valueText('labels_readable', {
        state: 'warning',
        reason: 'unreadable',
        value: 15,
      })
    ).toBe('15 % меток не читаются');
    expect(
      quality.valueText('revenue_matches', {
        state: 'no_data',
        reason: 'erased',
        value: 50,
      })
    ).toBe('стёрты оплаты или возвраты: сумм стёртого сайт не хранит');
    expect(
      quality.valueText('statement_matches', {
        state: 'warning',
        reason: 'no_statement',
        value: null,
      })
    ).toBe('выписки нет');
    const rule = {
      metric: 'revenue',
      sender: null,
      type: null,
      role: null,
      goal: null,
      currency: 'EUR',
      compare: 'lt',
      threshold: 3000,
      days: 7,
      severity: 'failure',
    } as const;
    expect(
      quality.valueText(
        'weekly',
        { state: 'failure', reason: 'below', value: 990 },
        { rule }
      )
    ).toBe(
      `${money(990, 'EUR', 'ru')} — меньше порога ${money(3000, 'EUR', 'ru')}`
    );
  });

  it('плитки — сначала сбои; открытое за сутки из ссылки уведомления; эпизод — с первых суток подряд', () => {
    const answer = report();
    const tiles = quality.tilesOf(answer.rows);
    expect(tiles[0]!.state).toBe('failure');
    expect(tiles.map((_) => _.check)).toContain('summary_arrived');
    expect(tiles.every((_) => _.lines.every((line) => !line.row.test))).toBe(
      true
    );
    expect(
      quality.openOn(answer.rows, '2026-11-24').map((_) => _.row.check)
    ).toContain('summary_arrived');
    // 22-е снято: эпизод 24-го не тянется дальше 23-го.
    const row = answer.rows.find(
      (_) => _.check === 'summary_arrived' && _.scope === 'bot'
    )!;
    expect(quality.episodeStart(row.cells, '2026-11-24')).toBe('2026-11-24');
    expect(
      quality.episodeStart(
        [
          {
            day: '2026-11-22',
            state: 'failure',
            reason: 'missing',
            value: 1,
            resolved: null,
            notified: true,
          },
          {
            day: '2026-11-23',
            state: 'warning',
            reason: 'extra',
            value: 1,
            resolved: null,
            notified: false,
          },
          {
            day: '2026-11-24',
            state: 'failure',
            reason: 'missing',
            value: 1,
            resolved: null,
            notified: false,
          },
        ],
        '2026-11-24'
      )
    ).toBe('2026-11-22');
  });

  it('плашки и пустая сетка: каналы, приём, сводки; первая проверка — по срокам сервера', () => {
    const answer = report();
    const view = app.analytics.setup.get() as never;
    expect(
      quality.bannersOf(answer, true, {
        senders: app.analytics.senders.list(),
      } as never)
    ).toEqual(['channels']);
    expect(
      quality.bannersOf({ channels: true, summaries: [] }, false, {
        senders: app.analytics.senders.list(),
      } as never)
    ).toEqual(['intake', 'summaries']);
    void view;
    expect(quality.emptyReason({ senders: [] }, answer.checks, false)).toBe(
      'senders'
    );
    expect(
      quality.emptyReason(
        { senders: app.analytics.senders.list() } as never,
        answer.checks.map((_) => ({ ..._, enabled: false })),
        true
      )
    ).toBe('disabled');
    expect(
      quality.emptyReason(
        { senders: app.analytics.senders.list() } as never,
        answer.checks,
        false
      )
    ).toBe('events');
    // В 12:00 UTC 25 ноября ближайшая проверка — 26 ноября в 03:35 UTC (час сводки бота + 5 минут).
    expect(
      quality.nextCheck(
        NOW,
        answer.checks,
        app.analytics.senders.list(),
        'Europe/Berlin'
      )
    ).toEqual({ at: '2026-11-26T03:35:00.000Z', zone: 'UTC' });
    expect(quality.whenText('2026-11-26T03:35:00.000Z', 'UTC')).toBe(
      '26 нояб. в 03:35 (UTC)'
    );
  });

  it('счёт приёма по суткам: строки — сутки, отправитель и путь, столбцы — только бывшие исходы', () => {
    const daily = app.analytics.intake.daily({ days: 30 });
    const rows = quality.tallyRows(daily.days);
    expect(rows[0]!.day >= rows.at(-1)!.day).toBe(true);
    expect(quality.tallyColumns(daily.days)).toEqual(['accepted']);
    expect([...quality.TALLY_OUTCOMES].toSorted() as string[]).toEqual(
      [
        ...new Set([
          'accepted',
          'duplicate',
          'conflict',
          'erased',
          'erasure',
          'future',
          'late',
          'invalid',
          'unauthorized',
          'throttled',
          'disabled',
        ]),
      ].toSorted()
    );
  });

  it('поправка встроенной: в теле — только пороги не как у ядра, все как у ядра — params: null; сервер её примет', () => {
    const view = report().checks.find((_) => _.code === 'labels_readable')!;
    const draft = qualityDrafts.correctionDraftOf(view);
    expect(qualityDrafts.correctionProblems(draft)).toEqual({});
    expect(qualityDrafts.correctionBody(draft)).toEqual({
      code: 'labels_readable',
      note: '',
      enabled: true,
      notify: 'failure',
      params: null,
    });
    const changed = { ...draft, params: { share: 12.5, min: '10' } };
    expect(qualityDrafts.correctionBody(changed).params).toEqual({
      share: 12.5,
    });
    expect(
      Object.keys(
        qualityDrafts.correctionProblems({
          ...draft,
          params: { share: '12.55', min: '0' },
        })
      ).toSorted()
    ).toEqual(['params.min', 'params.share']);
    const low = qualityDrafts.correctionBody({
      code: 'low_data',
      enabled: true,
      notify: 'off',
      note: '',
      params: { people: 4, customers: 10 },
    });
    expect(low).toEqual({ code: 'low_data', note: '', params: { people: 4 } });
    const site = setup.applySet(setup.readSet(SUBSCRIPTION))(
      setup.EMPTY_SETUP
    ).state;
    for (const body of [qualityDrafts.correctionBody(changed), low])
      expect(accepts(() => setup.saveItem('check', body)(site))).toBe(true);
  });

  it('своя проверка: тело по показателю сервер примет, поля чужих показателей — null; встроенный код — отказ до отправки', () => {
    const site = setup.applySet(setup.readSet(SUBSCRIPTION))(
      setup.EMPTY_SETUP
    ).state;
    const context = {
      setup: site as unknown as SetupView,
      checks: [],
      existing: null,
    };
    const drafts: Partial<qualityDrafts.RuleDraft>[] = [
      { metric: 'events', sender: 'bot', type: 'purchase' },
      { metric: 'role', role: 'payment' },
      { metric: 'role', role: 'payment', sender: 'bot' },
      { metric: 'people', threshold: '20', days: 7 },
      { metric: 'customers' },
      { metric: 'revenue', currency: 'EUR', threshold: '500,00', days: 30 },
      { metric: 'visitors', compare: 'gt', threshold: 100000 },
      { metric: 'goal', goal: 'go:' },
      { metric: 'goal', goal: 'form', form: 'contact' },
    ];
    for (const patch of drafts) {
      const draft = {
        ...qualityDrafts.EMPTY_RULE,
        code: 'own_check',
        name: 'Своя',
        ...patch,
      } as qualityDrafts.RuleDraft;
      expect([patch, qualityDrafts.ruleProblems(draft, context)]).toEqual([
        patch,
        {},
      ]);
      expect([
        patch,
        accepts(() =>
          setup.saveItem('check', qualityDrafts.ruleBody(draft))(site)
        ),
      ]).toEqual([patch, true]);
    }
    const bad = {
      ...qualityDrafts.EMPTY_RULE,
      code: 'summary_arrived',
      name: '',
      metric: 'revenue',
      currency: 'EUR',
      threshold: '1,001',
    } as qualityDrafts.RuleDraft;
    expect(
      Object.keys(qualityDrafts.ruleProblems(bad, context)).toSorted()
    ).toEqual(['code', 'name', 'threshold']);
    expect(
      qualityDrafts.ruleProblems(
        {
          ...qualityDrafts.EMPTY_RULE,
          code: 'x',
          name: 'X',
          metric: 'people',
          threshold: '100001',
        },
        context
      )
    ).toEqual({ threshold: t('qualityForm.thresholdHint', { n: 100_000 }) });
    // Из списка обратно в форму: порог выручки — суммой с запятой.
    expect(
      qualityDrafts.ruleDraftOf({
        code: 'w',
        builtin: false,
        name: 'W',
        note: '',
        zone: 'report',
        scope: 'site',
        enabled: true,
        notify: 'any',
        params: {
          metric: 'revenue',
          sender: null,
          type: null,
          role: null,
          goal: null,
          currency: 'EUR',
          compare: 'lt',
          threshold: 50000,
          days: 7,
          severity: 'failure',
        },
        defaults: null,
        corrected: false,
        archivedAt: null,
      }).threshold
    ).toBe('500,00');
  });

  it('выписка: сумма со знаком — как `signedMoney` сервера, месяц — до прошлого, повтор ключа — ошибка', () => {
    for (const raw of [
      '150',
      '150,00',
      '-12,50',
      '−12.50',
      '-0',
      '12.345',
      '',
      '-',
      '1 000,50',
    ])
      for (const currency of ['EUR', 'JPY'])
        expect([
          raw,
          currency,
          ((_) => (_ === null ? null : signedMoney(_, currency)))(
            qualityDrafts.parseSignedAmount(raw, currency)
          ),
        ]).toEqual([
          raw,
          currency,
          signedMoney(
            raw
              .replace('−', '-')
              .replace(/[\s ]/g, '')
              .replace(/^(-?\d*),(\d*)$/, '$1.$2'),
            currency
          ),
        ]);
    expect(
      qualityDrafts.lastMonth(
        'Europe/Berlin',
        Date.parse('2026-11-30T23:30:00Z')
      )
    ).toBe('2026-11');
    expect(
      qualityDrafts.lastMonth('UTC', Date.parse('2026-11-30T23:30:00Z'))
    ).toBe('2026-10');
    const draft = {
      month: '2026-10',
      currency: 'EUR',
      amount: '150,00',
      fees: 'gross' as const,
      note: '',
    };
    expect(qualityDrafts.statementProblems(draft, '2026-10', [], true)).toEqual(
      {}
    );
    expect(
      Object.keys(
        qualityDrafts.statementProblems(
          { ...draft, month: '2026-11' },
          '2026-10',
          [],
          true
        )
      )
    ).toEqual(['month']);
    expect(
      Object.keys(
        qualityDrafts.statementProblems(
          draft,
          '2026-10',
          [{ month: '2026-10', currency: 'EUR' }],
          true
        )
      )
    ).toEqual(['month']);
    expect(
      qualityDrafts.statementProblems(
        draft,
        '2026-10',
        [{ month: '2026-10', currency: 'EUR' }],
        false
      )
    ).toEqual({});
    expect(qualityDrafts.statementBody(draft)).toEqual({
      month: '2026-10',
      currency: 'EUR',
      amount: '150.00',
      fees: 'gross',
      note: '',
    });
  });

  it('пороги «мало данных» — из шапки ответа отчёта; ответ без поля — пороги ядра', () => {
    app.analytics.setup.save(
      'check',
      { code: 'low_data', params: { people: 4, customers: 1 } },
      ANNA
    );
    const sources = app.analytics.reports.sources({ days: 30 }) as never;
    expect(reports.lowDataOf(sources)).toEqual({ people: 4, customers: 1 });
    expect(reports.lowDataOf({})).toEqual(reports.LOW_DATA);
    expect(reports.lowDataOf(null)).toEqual(reports.LOW_DATA);
    app.analytics.setup.remove('check', { code: 'low_data' }, ANNA);
    expect(
      reports.lowDataOf(app.analytics.reports.sources({ days: 30 }) as never)
    ).toEqual(reports.LOW_DATA);
  });

  it('отметки версий на графике «Обзора»: тон формой и словом, версия — текстом как прислана', () => {
    const versions = (
      app.analytics.reports.overview({ days: 30 }) as unknown as OverviewReport
    ).versions;
    expect(versions.map((_) => [_.day, _.from, _.to])).toEqual([
      ['2026-11-23', '1.4.2', '1.5.0'],
    ]);
    const marker = '<img src=x onerror=alert(1)>';
    expect(
      overview.versionMarks([
        ...versions,
        {
          day: '2026-11-24',
          sender: 'bot',
          name: 'Бот',
          from: '1.5.0',
          to: marker,
          matched: false,
        },
        {
          day: '2026-11-25',
          sender: 'bot',
          name: 'Бот',
          from: marker,
          to: '1.5.1',
          matched: true,
        },
      ])
    ).toEqual([
      {
        day: '2026-11-23',
        tone: 'ok',
        label: `${versions[0]!.name}: 1.4.2 → 1.5.0, счёт сходится`,
      },
      {
        day: '2026-11-24',
        tone: 'bad',
        label: `Бот: 1.5.0 → ${marker}, счёт не сошёлся`,
      },
      {
        day: '2026-11-25',
        tone: 'ok',
        label: `Бот: ${marker} → 1.5.1, счёт сходится`,
      },
    ]);
  });

  it('журнал: подписи строк этапа 4 — снятие, выписка, проверка, набор; ключ снятия разбирается', () => {
    expect(Object.keys(setupLog.LOG_ITEMS).toSorted()).toEqual(
      [
        ...setup.SETUP_GROUPS,
        'set',
        'settings',
        'key',
        'label',
        'rate',
        'spend',
        'resolution',
        'statement',
      ].toSorted()
    );
    const entries = app.analytics.log.setup({
      before: null,
      limit: 50,
    }) as unknown as SetupLogEntry[];
    const resolution = entries.find((_) => _.item === 'resolution')!;
    expect(resolution.key).toBe('summary_arrived/bot/2026-11-22');
    expect(setupLog.resolutionKey(resolution.key)).toEqual({
      check: 'summary_arrived',
      scope: 'bot',
      day: '2026-11-22',
      test: false,
    });
    expect(setupLog.resolutionKey('all_known/2026-11-22/test')).toEqual({
      check: 'all_known',
      scope: null,
      day: '2026-11-22',
      test: true,
    });
    expect(
      setupLog.resolutionText(resolution, report().checks, {
        senders: app.analytics.senders.list(),
      } as never)
    ).toBe(
      `Сводка пришла · ${app.analytics.senders.list()[0]!.name}, 22 нояб.: снято — «Бот был на обслуживании.»`
    );
    expect(
      setupLog.statementText({
        month: '2026-10',
        currency: 'EUR',
        amount: 15000,
        fees: 'net',
      })
    ).toBe(
      `октябрь 2026 г. · EUR: ${money(15000, 'EUR', 'ru')}, после комиссии`
    );
    expect(
      setupLog.setText({
        before: { type: { 'bot/a': {} } },
        after: { type: { 'bot/a': {}, 'bot/b': {} }, check: { x: {} } },
      })
    ).toBe('Тип события: новых 1, изменено 1; Проверка: новых 1');
  });
});

describe('перенос набора в менеджере', () => {
  let dir = '';
  let app: App;
  let cookie = '';

  beforeAll(async () => {
    await loadLanguage('ru');
    dir = mkdtempSync(join(tmpdir(), 'cms-manager-transfer-'));
    app = createApp({
      databasePath: join(dir, 'site.db'),
      mediaCache: join(dir, 'cache'),
      updateCheck: false,
    });
    const answer = await app.fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: app.identity.setup.token(),
          email: 'anna@example.com',
          name: 'Анна',
          password: 'correct horse battery',
        }),
      })
    );
    cookie = (answer.headers.get('set-cookie') ?? '').split(';')[0]!;
  });

  afterAll(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const plan = (body: string) =>
    app.fetch(
      new Request('http://localhost/manager/api/analytics/set/plan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          origin: 'http://localhost',
        },
        body,
      })
    );

  it('предел файла — тот же, что у тела JSON менеджера: ровно предел проходит, на байт больше — 413', async () => {
    const at = (size: number) => {
      const head = JSON.stringify({
        format: transfer.SET_FORMAT,
        version: 1,
        name: 'x',
      });
      return `${head.slice(0, -1)}${' '.repeat(size - head.length)}}`;
    };
    expect(new TextEncoder().encode(at(transfer.SET_FILE_LIMIT)).length).toBe(
      transfer.SET_FILE_LIMIT
    );
    expect((await plan(at(transfer.SET_FILE_LIMIT))).status).toBe(200);
    const over = await plan(at(transfer.SET_FILE_LIMIT + 1));
    expect([
      over.status,
      ((await over.json()) as { error: { code: string } }).error.code,
    ]).toEqual([413, 'manager.too_large']);
  });

  it('файл читается в браузере: больше предела — без чтения, не JSON и не набор — словами, метка порядка байтов не мешает', async () => {
    expect(
      await transfer.classifySet('{}', transfer.SET_FILE_LIMIT + 1)
    ).toEqual({ kind: 'large' });
    expect(await transfer.classifySet('{"format":', 10)).toEqual({
      kind: 'json',
    });
    expect(await transfer.classifySet('[1,2]', 5)).toEqual({ kind: 'foreign' });
    expect(await transfer.classifySet('{"format":"other"}', 18)).toEqual({
      kind: 'foreign',
    });
    expect(
      await transfer.classifySet(
        `\uFEFF{"format":"eile-analytics-set","version":1}`,
        50
      )
    ).toEqual({
      kind: 'set',
      set: { format: 'eile-analytics-set', version: 1 },
    });
    const source = await Bun.file(
      join(
        import.meta.dir,
        '../manager/src/routes/(app)/stats/setup/transfer.ts'
      )
    ).text();
    expect(source.includes('\uFEFF')).toBe(false);
  });

  it('отчёт пробы словами: группы по порядку, предупреждения и «не трогает» — все коды сервера', () => {
    const sample = app.analytics.sets.plan(
      { sample: 'subscription' },
      'ru'
    ) as unknown as SetPlanReport;
    expect(transfer.canApply(sample)).toBe(true);
    expect(transfer.planGroups(sample).map((_) => _.group)).toEqual(
      SET_GROUPS.filter((group) =>
        sample.created.some((_) => _.group === group)
      )
    );
    expect(SET_GROUPS).toEqual(setup.SETUP_GROUPS);
    expect(Object.keys(transfer.UNTOUCHED_LABELS)).toEqual([
      ...setup.SET_UNTOUCHED,
    ]);
    expect(
      sample.untouched.map(transfer.untouchedText).some((_) => /[a-z]_/.test(_))
    ).toBe(false);
    expect(sample.warnings.map((_) => _.code)).toContain('sender_created');
    const warning = sample.warnings.find((_) => _.code === 'sender_created')!;
    expect(transfer.warningText(warning, sample)).toContain('без ключа');
    expect(Object.keys(transfer.WARNING_LABELS).toSorted()).toEqual(
      [
        'archive_kept',
        'newer_file',
        'role_changed',
        'sender_created',
        'sender_disabled',
        'summary_hour',
      ].toSorted()
    );
    // Ошибки — загрузить нельзя; названия из файла — текстом как прислано.
    const marker = '<img src=x onerror=alert(1)>';
    const broken = app.analytics.sets.plan(
      {
        format: transfer.SET_FORMAT,
        version: 1,
        name: 'x',
        senders: [{ code: 'Bad code', name: marker }],
      },
      'ru'
    ) as unknown as SetPlanReport;
    expect(transfer.canApply(broken)).toBe(false);
    expect(Object.keys(broken.errors)).toEqual(['senders[0]']);
  });

  it('«было → стало» у изменённых полей: было — с сайта, стало — из файла', () => {
    app.analytics.sets.apply({ sample: 'subscription' }, 'ru', null);
    const site = {
      ...app.analytics.setup.get(),
      senders: app.analytics.senders.list(),
      dictionaries: app.analytics.setup.get().dictionaries.map((d) => ({
        ...d,
        values: app.analytics.setup
          .get()
          .values.filter((_) => _.dictionary === d.code),
      })),
    } as unknown as SetupView;
    const file = {
      format: transfer.SET_FORMAT,
      version: 1,
      name: 'x',
      senders: [{ code: 'app', name: 'Бот', summaryAt: '03:30' }],
    };
    const planned = app.analytics.sets.plan(
      file,
      'ru'
    ) as unknown as SetPlanReport;
    const changed = planned.changed.find((_) => _.group === 'sender')!;
    expect(changed.fields.toSorted()).toEqual(['name', 'summaryAt']);
    expect(
      transfer.fieldChanges(site, file, 'sender', 'app', ['summaryAt'])
    ).toEqual([{ field: 'summaryAt', from: '06:00', to: '03:30' }]);
    expect(
      transfer.fieldChanges(site, null, 'sender', 'app', ['summaryAt'])
    ).toEqual([{ field: 'summaryAt', from: '06:00', to: null }]);
    expect(transfer.isEmptySetup(site)).toBe(false);
    expect(transfer.isEmptySetup({ senders: [], types: [] })).toBe(true);
  });

  it('поля «было → стало» — подписью из формы на трёх языках, у незнакомого поля — имя из файла', async () => {
    const fields = [
      ['sender', 'name'],
      ['sender', 'summaryAt'],
      ['property', 'reconcile'],
      ['schema', 'separator'],
      ['milestone', 'days'],
      ['check', 'params'],
    ] as const;
    const shown: Record<string, string[]> = {};
    for (const language of ['ru', 'en', 'de'] as const) {
      await loadLanguage(language);
      shown[language] = fields.map(({ 0: group, 1: field }) =>
        transfer.fieldText(group, field)
      );
      expect(transfer.fieldText('sender', 'colour')).toBe('colour');
      expect(transfer.fieldText('type', 'summaryAt')).toBe('summaryAt');
    }
    await loadLanguage('ru');
    expect(shown).toEqual({
      ru: [
        'Название',
        'Час сводки, UTC',
        'Сверять со счётом сайта',
        'Разделитель',
        'Окно в днях',
        'Пороги и правило',
      ],
      en: [
        'Name',
        'Summary hour, UTC',
        'Compare with the site’s count',
        'Separator',
        'Window in days',
        'Thresholds and rule',
      ],
      de: [
        'Name',
        'Uhrzeit der Zusammenfassung, UTC',
        'Mit der Zählung der Website abgleichen',
        'Trennzeichen',
        'Zeitfenster in Tagen',
        'Schwellenwerte und Regel',
      ],
    });
    // Каждая подпись таблицы — текст словаря: не имя поля и не сам ключ.
    for (const [group, labels] of Object.entries(transfer.FIELD_LABELS))
      for (const [field, key] of Object.entries(labels))
        expect(
          [field, key].includes(transfer.fieldText(group as 'sender', field))
        ).toBe(false);
  });
});

describe('вкладки «Статистики» и права', () => {
  const read = (path: string) =>
    Bun.file(
      join(import.meta.dir, '../manager/src/routes/(app)/stats', path)
    ).text();

  it('девять вкладок: «Качество» — перед «Настройкой», у каждой — раздел справки', async () => {
    const source = await read('StatsTabs.svelte');
    expect(
      [...source.matchAll(/id: '([a-z]+)',\n\s+href:/g)].map((_) => _[1])
    ).toEqual([
      'overview',
      'sources',
      'funnels',
      'cohorts',
      'people',
      'labels',
      'spend',
      'quality',
      'setup',
    ]);
    expect([...source.matchAll(/help: '(analytics-[a-z]+)'/g)]).toHaveLength(9);
    // Вкладки — только с правом analytics.read; точка «Качества» — только при сбое.
    expect(source).toContain("{#if can('analytics.read')}");
    expect(source).toContain('quality.failures > 0');
  });

  it('ссылки «?» экранов аналитики ведут на существующие разделы главы «Аналитика» на трёх языках', async () => {
    // Разделы справки, на которые ссылаются экраны «Статистики»: `help: '…'` вкладок и подвкладок, адреса `#…`.
    const sources = await Promise.all(
      Array.from(
        new Bun.Glob('**/*.{svelte,ts}').scanSync(
          join(import.meta.dir, '../manager/src/routes/(app)/stats')
        )
      ).map(read)
    );
    const anchors = [
      ...new Set(
        sources.flatMap((source) =>
          [...source.matchAll(/'(analytics-[a-z]+)'|#(analytics-[a-z]+)/g)].map(
            (_) => (_[1] ?? _[2])!
          )
        )
      ),
    ].toSorted();
    expect(anchors).toEqual([
      'analytics-labels',
      'analytics-money',
      'analytics-quality',
      'analytics-reports',
      'analytics-sender',
      'analytics-setup',
      'analytics-start',
      'analytics-transfer',
      'analytics-what',
    ]);
    for (const language of ['Ru', 'En', 'De']) {
      const help = await Bun.file(
        join(
          import.meta.dir,
          `../manager/src/routes/(app)/help/Help${language}.svelte`
        )
      ).text();
      const ids = [...help.matchAll(/<section id="(analytics-[a-z]+)"/g)].map(
        (_) => _[1]
      );
      expect([language, anchors.filter((_) => !ids.includes(_))]).toEqual([
        language,
        [],
      ]);
      // Глава — между «Статистикой» и «Быстрой работой», только с правом на аналитику.
      expect(help.indexOf('<h2 id="analytics"')).toBeGreaterThan(
        help.indexOf('<h2 id="stats"')
      );
      expect(help.indexOf('<h2 id="analytics"')).toBeLessThan(
        help.indexOf('<h2 id="speed"')
      );
      expect(help).toContain('{#if analytics}');
      expect(help).not.toMatch(/\{@html (?!icons\.)/);
    }
    // Ссылку рисует ряд разделов; подвкладки «Качества» и «Настройки» называют свой раздел — у каждой он есть.
    const tabs = await read('StatsTabs.svelte');
    expect(tabs).toMatch(
      /href=\{`\$\{resolve\('\/\(app\)\/help'\)\}#\$\{help \?\? section\.help\}`\}/
    );
    const quality = await read('quality/+page.svelte');
    expect(quality).toContain('<StatsTabs help={');
    expect([...quality.matchAll(/help: '(analytics-[a-z]+)'/g)]).toHaveLength(
      4
    );
    const setup = await read('setup/+page.svelte');
    expect(setup).toContain('<StatsTabs help={');
    expect(
      [
        ...setup.matchAll(
          /\{ id: '([a-z]+)', label: '[a-zA-Z.]+', help: '(analytics-[a-z]+)' \}/g
        ),
      ].map((_) => [_[1], _[2]])
    ).toContainEqual(['transfer', 'analytics-transfer']);
    expect([...setup.matchAll(/help: '(analytics-[a-z]+)'/g)]).toHaveLength(12);
    expect(
      await Bun.file(
        join(import.meta.dir, '../manager/src/routes/(app)/help/+page.svelte')
      ).text()
    ).toContain(
      "{ id: 'analytics', title: 'help.chapterAnalytics', analytics: true }"
    );
  });

  it('«Качество» и «Настройка» — за проверкой права раздела, правка — с analytics.edit; старый адрес «Приёма» переводит', async () => {
    expect(await read('+layout.svelte')).toContain(
      "visits || can('analytics.read')"
    );
    expect(await read('quality/+page.svelte')).toContain(
      "can('analytics.edit')"
    );
    expect(await read('setup/+page.ts')).toContain("'tab') === 'intake'");
    expect(await read('setup/+page.ts')).toContain(
      "resolve('/(app)/stats/quality')}?tab=intake"
    );
    expect(allows('editor', 'analytics.read')).toBe(false);
    expect(allows('admin', 'analytics.edit')).toBe(true);
    const status = await Bun.file(
      join(import.meta.dir, '../manager/src/lib/quality-status.svelte.ts')
    ).text();
    expect(status).toContain("can('analytics.read') &&");
  });

  it('данные посторонних — только текстом: в экранах «Качества» и «Переноса» нет {@html} с данными', async () => {
    for (const file of [
      'quality/Summary.svelte',
      'quality/DayDialog.svelte',
      'quality/QualityGrid.svelte',
      'quality/QualityTiles.svelte',
      'quality/StateSymbol.svelte',
      'quality/Statements.svelte',
      'quality/Intake.svelte',
      'quality/Checks.svelte',
      'setup/SetPlan.svelte',
      'setup/Transfer.svelte',
      'setup/Samples.svelte',
      'DailyChart.svelte',
    ])
      expect([
        file,
        [...(await read(file)).matchAll(/\{@html ([^}]+)\}/g)]
          .map((_) => _[1])
          .filter((_) => !/^icons\.[a-zA-Z]+$|^section\.icon$/.test(_!)),
      ]).toEqual([file, []]);
  });
});
