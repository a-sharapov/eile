import { CODE_LIMITS, isCode } from './codes.ts';
import type { Day } from './days.ts';
import { dayOf, EVENT_LIMITS } from './envelope.ts';
import { isCurrency, moneyOf } from './money.ts';
import type { Amounts } from './person.ts';
import { cleanText } from './text.ts';

/** Событие типа с ролью «сводка», как его читают: без псевдонима, тело разобрано. */
export type SummaryEvent = {
  readonly sender: string;
  readonly seq: number;
  readonly at: string;
  readonly receivedAt: string;
  readonly test: boolean;
  readonly body: Readonly<Record<string, unknown>>;
};

/** Сводка отправителя за сутки UTC: последняя из присланных за эти сутки. */
export type SummaryDay = {
  readonly sender: string;
  readonly day: Day;
  readonly test: boolean;
  readonly seq: number;
  readonly at: string;
  readonly receivedAt: string;
  /** Код типа → число, как прислано; роли «сводка» в сверке нет. */
  readonly counts: Readonly<Record<string, number>>;
  /** Валюта → минимальные единицы; null — отправитель выручку не шлёт. */
  readonly revenue: Amounts | null;
  readonly failed: number | null;
  /** Версия после cleanText; null — не прислана. */
  readonly version: string | null;
};

/** Смена версии отправителя: сутки сводки, где версия не та, что у прошлой сводки с версией. */
export type VersionMark = {
  readonly day: Day;
  readonly sender: string;
  readonly name: string;
  readonly from: string;
  readonly to: string;
  /** «События дошли» и «Выручка сходится» этого дня: обе в порядке — да, сбой — нет, иначе null. */
  readonly matched: boolean | null;
};

type Input = Readonly<Record<string, unknown>>;

// Версия, которую можно отдать агенту: знаки номера сборки, без пробелов и чужого текста.
const _VERSION = /^[A-Za-z0-9._+-]{1,64}$/;

const _isRecord = (raw: unknown): raw is Input =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _absent = (raw: unknown): boolean => raw === undefined || raw === null;

const _isCount = (raw: unknown): raw is number =>
  Number.isSafeInteger(raw) && (raw as number) >= 0;

// Поля роли «сводка» строго, как их проверяет приём: тип мог получить роль после того, как событие принято.
const _FITS: Readonly<Record<string, (raw: unknown) => boolean>> = {
  day: (raw) => dayOf(raw) !== null,
  counts: (raw) =>
    _isRecord(raw) &&
    Object.entries(raw).every(
      ({ 0: type, 1: count }) =>
        isCode(type, CODE_LIMITS.type) && _isCount(count)
    ),
  revenue: (raw) =>
    _absent(raw) ||
    (_isRecord(raw) &&
      Object.entries(raw).every(
        ({ 0: currency, 1: money }) =>
          isCurrency(currency) && moneyOf(money, currency) !== null
      )),
  failed: (raw) => _absent(raw) || _isCount(raw),
  version: (raw) =>
    _absent(raw) ||
    (typeof raw === 'string' && [...raw].length <= EVENT_LIMITS.version),
};

/** Версия из сводки годится агенту: `A-Z a-z 0-9 . _ + -`, 1–64 знака; иначе он её не получает. */
export var isVersionText = (raw: unknown): raw is string =>
  typeof raw === 'string' && _VERSION.test(raw);

const _version = (raw: unknown): string | null =>
  typeof raw === 'string'
    ? ((text) => (text === '' ? null : text))(
        cleanText(raw, EVENT_LIMITS.version)
      )
    : null;

/** Сводка из события; null — поля роли не годятся или событие не про сутки. */
export var readSummary = (event: SummaryEvent): SummaryDay | null =>
  ((data) =>
    data === null ||
    !Object.entries(_FITS).every(({ 0: field, 1: fits }) => fits(data[field]))
      ? null
      : {
          sender: event.sender,
          day: data.day as Day,
          test: event.test,
          seq: event.seq,
          at: event.at,
          receivedAt: event.receivedAt,
          counts: data.counts as Readonly<Record<string, number>>,
          revenue: _absent(data.revenue)
            ? null
            : Object.fromEntries(
                Object.entries(data.revenue as Input).map(
                  ({ 0: currency, 1: money }) => [
                    currency,
                    moneyOf(money, currency) as number,
                  ]
                )
              ),
          failed: _absent(data.failed) ? null : (data.failed as number),
          version: _version(data.version),
        })(_isRecord(event.body.data) ? event.body.data : null);

const _later = (a: SummaryDay, b: SummaryDay): boolean =>
  a.at > b.at || (a.at === b.at && a.seq > b.seq);

const _byDay = (a: SummaryDay, b: SummaryDay): number =>
  a.day < b.day
    ? -1
    : a.day > b.day
      ? 1
      : a.sender < b.sender
        ? -1
        : a.sender > b.sender
          ? 1
          : Number(a.test) - Number(b.test);

/**
 * Сводки по суткам: у отправителя за сутки и с тем же `test` — последняя по `at`, затем по порядку приёма
 * (исправленную сводку отправитель шлёт новым `id`). Порядок — по суткам, отправителю, тестовые после.
 */
export var latestSummaries = (events: readonly SummaryEvent[]): SummaryDay[] =>
  Object.values(
    Object.groupBy(
      events.map(readSummary).filter((_): _ is SummaryDay => _ !== null),
      (_) => `${_.sender}/${_.day}/${Number(_.test)}`
    )
  )
    .map((group) =>
      (group as SummaryDay[]).reduce((latest, _) =>
        _later(_, latest) ? _ : latest
      )
    )
    .toSorted(_byDay);

/** Сводка отправителя за сутки; null — её нет. */
export var summaryOf = (
  events: readonly SummaryEvent[],
  sender: string,
  day: Day,
  test: boolean
): SummaryDay | null =>
  latestSummaries(
    events.filter((_) => _.sender === sender && _.test === test)
  ).find((_) => _.day === day) ?? null;

type _Last = Readonly<Record<string, string>>;

/**
 * Смены версий по сводкам: сутки, где версия не та, что у прошлой по суткам сводки того же отправителя с
 * версией. Тестовые не в счёт, первая версия отправителя — не смена, сводка без версии ничего не меняет.
 * `matched` — итог проверок этого дня; без проверок — null.
 */
export var versionMarks = (
  summaries: readonly SummaryDay[],
  name: (sender: string) => string,
  matched: (sender: string, day: Day) => boolean | null = () => null
): VersionMark[] =>
  summaries
    .filter((_) => !_.test && _.version !== null)
    .toSorted(_byDay)
    .reduce<{ readonly last: _Last; readonly marks: readonly VersionMark[] }>(
      (all, summary) =>
        ((previous, version) => ({
          last: { ...all.last, [summary.sender]: version },
          marks:
            previous === undefined || previous === version
              ? all.marks
              : [
                  ...all.marks,
                  {
                    day: summary.day,
                    sender: summary.sender,
                    name: name(summary.sender),
                    from: previous,
                    to: version,
                    matched: matched(summary.sender, summary.day),
                  },
                ],
        }))(
          Object.hasOwn(all.last, summary.sender)
            ? all.last[summary.sender]
            : undefined,
          summary.version as string
        ),
      { last: {}, marks: [] }
    ).marks as VersionMark[];
