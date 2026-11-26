import { describe, expect, it } from 'bun:test';
import {
  isVersionText,
  latestSummaries,
  readSummary,
  type SummaryDay,
  type SummaryEvent,
  summaryOf,
  versionMarks,
} from './summary.ts';

let seq = 0;

const event = (
  data: Readonly<Record<string, unknown>>,
  extra: Partial<SummaryEvent> = {}
): SummaryEvent => ({
  sender: 'bot',
  seq: ++seq,
  at: '2026-11-25T03:00:00.000Z',
  receivedAt: '2026-11-25T03:00:01.000Z',
  test: false,
  body: { id: `sum_${seq}`, type: 'daily_summary', data },
  ...extra,
});

const day = (
  date: string,
  version: string | null | undefined,
  extra: Partial<SummaryEvent> = {}
): SummaryEvent =>
  event(
    {
      day: date,
      counts: { purchase: 1 },
      ...(version === undefined ? {} : { version }),
    },
    { at: `${date}T23:59:00.000Z`, ...extra }
  );

const NAMES: Readonly<Record<string, string>> = { bot: 'Бот', shop: 'Магазин' };
const name = (code: string): string => NAMES[code] ?? code;

describe('сводка из события', () => {
  it('все поля: счёт по типам как прислан, выручка — в минимальных единицах, версия — после чистки', () => {
    const sent = event({
      day: '2026-11-24',
      counts: { bot_start: 12, purchase: 4, zzz_new: 3 },
      revenue: { EUR: '76.00', JPY: 1200, KWD: '1.250' },
      failed: 2,
      version: ' 1.5.0\u0007\n',
    });
    expect(readSummary(sent)).toEqual({
      sender: 'bot',
      day: '2026-11-24',
      test: false,
      seq: sent.seq,
      at: '2026-11-25T03:00:00.000Z',
      receivedAt: '2026-11-25T03:00:01.000Z',
      counts: { bot_start: 12, purchase: 4, zzz_new: 3 },
      revenue: { EUR: 7600, JPY: 1200, KWD: 1250 },
      failed: 2,
      version: '1.5.0',
    });
  });

  it('без выручки, неотправленных и версии — null; null в поле — то же, что поля нет', () => {
    expect(readSummary(event({ day: '2026-11-24', counts: {} }))).toMatchObject(
      { revenue: null, failed: null, version: null, counts: {} }
    );
    expect(
      readSummary(
        event({
          day: '2026-11-24',
          counts: { purchase: 0 },
          revenue: null,
          failed: null,
          version: null,
        })
      )
    ).toMatchObject({ revenue: null, failed: null, version: null });
    // Версия из одних невидимых знаков — не прислана.
    expect(
      readSummary(event({ day: '2026-11-24', counts: {}, version: '\u200b ' }))
        ?.version
    ).toBeNull();
  });

  it('поля роли не годятся — это не сводка: тип получил роль после приёма', () => {
    for (const data of [
      { counts: { purchase: 1 } },
      { day: '2026-02-30', counts: {} },
      { day: '24.11.2026', counts: {} },
      { day: '2026-11-24' },
      { day: '2026-11-24', counts: { Purchase: 1 } },
      { day: '2026-11-24', counts: { purchase: -1 } },
      { day: '2026-11-24', counts: { purchase: 1.5 } },
      { day: '2026-11-24', counts: [] },
      { day: '2026-11-24', counts: {}, revenue: { EUR: '1.005' } },
      { day: '2026-11-24', counts: {}, revenue: { XXX: '1.00' } },
      { day: '2026-11-24', counts: {}, failed: '2' },
      { day: '2026-11-24', counts: {}, version: 150 },
      { day: '2026-11-24', counts: {}, version: 'v'.repeat(65) },
    ]) {
      expect([data, readSummary(event(data))]).toEqual([data, null]);
    }
    expect(readSummary({ ...event({}), body: { data: 'x' } })).toBeNull();
  });
});

describe('сводка за сутки', () => {
  it('из нескольких за сутки — последняя по at, при равном at — по порядку приёма', () => {
    const first = day('2026-11-24', '1.4.2', {
      at: '2026-11-25T03:00:00.000Z',
    });
    const fixed = event(
      { day: '2026-11-24', counts: { purchase: 4 }, version: '1.4.2' },
      { at: '2026-11-25T03:30:00.000Z' }
    );
    // Опоздавшая по приёму, но ранняя по времени — не исправление.
    const late = day('2026-11-24', '1.4.1', {
      at: '2026-11-25T02:00:00.000Z',
    });
    const same = event(
      { day: '2026-11-24', counts: { purchase: 5 } },
      { at: '2026-11-25T03:30:00.000Z' }
    );
    expect(latestSummaries([first, fixed, late])).toEqual([
      readSummary(fixed) as SummaryDay,
    ]);
    // При равном at — принятая позже, в каком бы порядке ни пришли строки.
    expect(latestSummaries([same, first, fixed]).map((_) => _.seq)).toEqual([
      same.seq,
    ]);
    expect(latestSummaries([fixed, same]).map((_) => _.seq)).toEqual([
      same.seq,
    ]);
  });

  it('тестовая — отдельно от настоящей, отправители — отдельно; порядок по суткам', () => {
    const events = [
      day('2026-11-24', '1.0.0', { test: true }),
      day('2026-11-23', '1.0.0'),
      day('2026-11-24', '1.0.0'),
      day('2026-11-24', '2.0.0', { sender: 'shop' }),
    ];
    expect(
      latestSummaries(events).map((_) => [_.day, _.sender, _.test])
    ).toEqual([
      ['2026-11-23', 'bot', false],
      ['2026-11-24', 'bot', false],
      ['2026-11-24', 'bot', true],
      ['2026-11-24', 'shop', false],
    ]);
    expect(summaryOf(events, 'bot', '2026-11-24', true)?.seq).toBe(
      events[0]!.seq
    );
    expect(summaryOf(events, 'bot', '2026-11-24', false)?.seq).toBe(
      events[2]!.seq
    );
    expect(summaryOf(events, 'bot', '2026-11-22', false)).toBeNull();
    // Негодное событие среди сводок пропускается.
    expect(
      latestSummaries([...events, event({ day: '2026-11-22' })])
    ).toHaveLength(4);
  });
});

describe('смены версий', () => {
  const marks = (events: readonly SummaryEvent[]) =>
    versionMarks(latestSummaries(events), name).map((_) => [
      _.day,
      _.sender,
      _.from,
      _.to,
    ]);

  it('первая версия — не смена; смена — сутки, где версия не та, что у прошлой сводки', () => {
    expect(
      marks([
        day('2026-11-20', '1.4.2'),
        day('2026-11-21', '1.4.2'),
        day('2026-11-22', '1.5.0'),
        day('2026-11-23', '1.5.0'),
        day('2026-11-24', '1.4.2'),
      ])
    ).toEqual([
      ['2026-11-22', 'bot', '1.4.2', '1.5.0'],
      ['2026-11-24', 'bot', '1.5.0', '1.4.2'],
    ]);
  });

  it('сводка без версии между двумя с версией ничего не меняет; порядок — по суткам, а не по приёму', () => {
    expect(
      marks([
        day('2026-11-23', '1.5.0'),
        day('2026-11-21', '1.4.2'),
        day('2026-11-22', undefined),
        day('2026-11-24', null),
        day('2026-11-25', '1.5.0'),
      ])
    ).toEqual([['2026-11-23', 'bot', '1.4.2', '1.5.0']]);
  });

  it('тестовые не в счёт, отправители — каждый своей цепочкой; подпись — название отправителя', () => {
    const found = versionMarks(
      latestSummaries([
        day('2026-11-20', '1.0.0'),
        day('2026-11-21', '9.9.9-dev', { test: true }),
        day('2026-11-21', '2.0.0', { sender: 'shop' }),
        day('2026-11-22', '1.1.0'),
        day('2026-11-23', '2.1.0', { sender: 'shop' }),
      ]),
      name
    );
    expect(found).toEqual([
      {
        day: '2026-11-22',
        sender: 'bot',
        name: 'Бот',
        from: '1.0.0',
        to: '1.1.0',
        matched: null,
      },
      {
        day: '2026-11-23',
        sender: 'shop',
        name: 'Магазин',
        from: '2.0.0',
        to: '2.1.0',
        matched: null,
      },
    ]);
    // Итог проверок дня приходит снаружи: до части проверок — null.
    expect(
      versionMarks(
        latestSummaries([day('2026-11-20', 'a'), day('2026-11-21', 'b')]),
        name,
        (sender, date) => sender === 'bot' && date === '2026-11-21'
      )[0]?.matched
    ).toBe(true);
  });

  it('isVersionText: номер сборки — да; пробел, кириллица, разметка и 65 знаков — нет', () => {
    for (const ok of [
      '1.5.0',
      '2026.11.1+build.7',
      'v2_beta-1',
      'a'.repeat(64),
    ]) {
      expect([ok, isVersionText(ok)]).toEqual([ok, true]);
    }
    for (const bad of [
      '1.5.0 beta',
      'версия-2',
      '<b>1</b>',
      'a'.repeat(65),
      '',
      15,
      null,
    ]) {
      expect([bad, isVersionText(bad)]).toEqual([bad, false]);
    }
  });
});
