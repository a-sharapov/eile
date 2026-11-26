import { addDays, addMonths, dayIn } from '#lib/analytics-reports.ts';
import { currentLanguage, type MessageKey, number, t, tn } from '#lib/i18n.ts';
import { money } from '#lib/money.ts';
import type {
  CheckDayView,
  CheckNotify,
  CheckState,
  CheckView,
  CheckZone,
  IntakeDay,
  QualityCell,
  QualityReport,
  QualityRow,
  SetupView,
  TallyOutcome,
  ThresholdRule,
} from '#lib/types.ts';

// «Качество данных» (ADR 0072, этап 4, «Экраны этапа 4»): состояния ячеек сетки словами и значками, главное число
// строки словами, причины «нет данных», сутки и сроки проверок, плитки и эпизоды. Таблица встроенных проверок,
// сроки и пороги — копии сервера (`analytics/domain/quality.ts`); совпадение проверяет
// tests/manager-analytics.test.ts.

/** Чьи сутки и какой срок — как `CheckClock` сервера: сводка, сутки UTC, пояс отчётов, месяц. */
export type CheckClock = 'summary' | 'utc' | 'report' | 'month';

/** Вид порога встроенной проверки: счёт, процент до десятых, «не меньше», дни, «мало данных». */
export type ParamKind = 'count' | 'percent' | 'min' | 'days' | 'low';

export type BuiltinCheck = {
  readonly code: string;
  readonly clock: CheckClock | null;
  readonly scope: 'sender' | 'site' | null;
  readonly notify: CheckNotify;
  readonly params: Readonly<Record<string, ParamKind>>;
  readonly defaults: Readonly<Record<string, number>>;
  /** false — выключена, пока владелец её не включит. */
  readonly enabled: boolean;
};

const _b = (
  code: string,
  clock: CheckClock | null,
  scope: 'sender' | 'site' | null,
  notify: CheckNotify,
  params: Readonly<Record<string, readonly [ParamKind, number]>> = {},
  enabled = true
): BuiltinCheck => ({
  code,
  clock,
  scope,
  notify,
  params: Object.fromEntries(
    Object.entries(params).map(({ 0: key, 1: spec }) => [key, spec[0]])
  ),
  defaults: Object.fromEntries(
    Object.entries(params).map(({ 0: key, 1: spec }) => [key, spec[1]])
  ),
  enabled,
});

/** Встроенные проверки по порядку ядра — как `BUILTIN_CHECKS` сервера. */
export var BUILTIN_CHECKS: readonly BuiltinCheck[] = [
  _b('summary_arrived', 'summary', 'sender', 'failure'),
  _b('events_arrived', 'summary', 'sender', 'failure', {
    missing: ['count', 0],
  }),
  _b('revenue_matches', 'summary', 'sender', 'failure', {
    tolerance: ['percent', 0],
  }),
  _b('sender_delivered', 'summary', 'sender', 'failure', {
    failed: ['count', 0],
  }),
  _b('sender_facts', 'utc', 'sender', 'failure', { count: ['count', 0] }),
  _b('labels_readable', 'utc', 'sender', 'failure', {
    share: ['percent', 10],
    min: ['min', 10],
  }),
  _b('intake_refusals', 'utc', 'site', 'failure', {
    invalid: ['count', 0],
    unauthorized: ['count', 0],
  }),
  _b('repeat_conflicts', 'utc', 'site', 'failure', { count: ['count', 0] }),
  _b('payment_duplicates', 'utc', 'site', 'failure', { count: ['count', 0] }),
  _b('first_touch_stable', 'utc', 'site', 'failure', { count: ['count', 0] }),
  _b('event_time', 'utc', 'site', 'failure', { count: ['count', 0] }),
  _b('all_known', 'utc', 'site', 'failure', { count: ['count', 0] }),
  _b('links_arrive', 'report', 'site', 'failure', {
    share: ['percent', 50],
    min: ['min', 10],
  }),
  _b('rate_present', 'report', 'site', 'any', { days: ['days', 2] }),
  _b(
    'statement_matches',
    'month',
    'site',
    'any',
    { tolerance: ['percent', 1] },
    false
  ),
  _b('low_data', null, null, 'off', {
    people: ['low', 30],
    customers: ['low', 10],
  }),
];

/** Пределы порогов по виду — как у сервера: счёт 0–100 000, доля 0–100 до десятых, `min` 1–10 000, дни 0–31. */
export var PARAM_RANGES: Readonly<
  Record<
    ParamKind,
    { readonly min: number; readonly max: number; readonly tenths: boolean }
  >
> = {
  count: { min: 0, max: 100_000, tenths: false },
  percent: { min: 0, max: 100, tenths: true },
  min: { min: 1, max: 10_000, tenths: false },
  days: { min: 0, max: 31, tenths: false },
  low: { min: 1, max: 1000, tenths: false },
};

/** Пределы проверок — как `QUALITY_LIMITS` сервера (то, что нужно экрану). */
export var QUALITY_LIMITS = {
  /** Сетка за запрос. */
  gridDays: 90,
  /** Сетка на экране. */
  screenDays: 30,
  custom: 20,
  threshold: 100_000,
  note: 500,
} as const;

export var builtinCheck = (code: string): BuiltinCheck | null =>
  BUILTIN_CHECKS.find((_) => _.code === code) ?? null;

/** Порог годится: число вида в пределах, у доли — до десятых. */
export var fitsParam = (raw: number, kind: ParamKind): boolean =>
  ((range) =>
    Number.isFinite(raw) &&
    raw >= range.min &&
    raw <= range.max &&
    (range.tenths
      ? Math.abs(raw * 10 - Math.round(raw * 10)) < 1e-9
      : Number.isInteger(raw)))(PARAM_RANGES[kind]);

// --- Названия ------------------------------------------------------------------------------------------------

/** Названия встроенных проверок — те же, что у сервера (`CHECK_NAMES`), на языке менеджера. */
export var CHECK_NAME_KEYS: Readonly<Record<string, MessageKey>> = {
  summary_arrived: 'qualityCheck.summary_arrived',
  events_arrived: 'qualityCheck.events_arrived',
  revenue_matches: 'qualityCheck.revenue_matches',
  sender_delivered: 'qualityCheck.sender_delivered',
  sender_facts: 'qualityCheck.sender_facts',
  labels_readable: 'qualityCheck.labels_readable',
  intake_refusals: 'qualityCheck.intake_refusals',
  repeat_conflicts: 'qualityCheck.repeat_conflicts',
  payment_duplicates: 'qualityCheck.payment_duplicates',
  first_touch_stable: 'qualityCheck.first_touch_stable',
  event_time: 'qualityCheck.event_time',
  all_known: 'qualityCheck.all_known',
  links_arrive: 'qualityCheck.links_arrive',
  rate_present: 'qualityCheck.rate_present',
  statement_matches: 'qualityCheck.statement_matches',
  low_data: 'qualityCheck.low_data',
};

/** Что сравнивает встроенная проверка — строкой. */
export var CHECK_ABOUT_KEYS: Readonly<Record<string, MessageKey>> = {
  summary_arrived: 'qualityAbout.summary_arrived',
  events_arrived: 'qualityAbout.events_arrived',
  revenue_matches: 'qualityAbout.revenue_matches',
  sender_delivered: 'qualityAbout.sender_delivered',
  sender_facts: 'qualityAbout.sender_facts',
  labels_readable: 'qualityAbout.labels_readable',
  intake_refusals: 'qualityAbout.intake_refusals',
  repeat_conflicts: 'qualityAbout.repeat_conflicts',
  payment_duplicates: 'qualityAbout.payment_duplicates',
  first_touch_stable: 'qualityAbout.first_touch_stable',
  event_time: 'qualityAbout.event_time',
  all_known: 'qualityAbout.all_known',
  links_arrive: 'qualityAbout.links_arrive',
  rate_present: 'qualityAbout.rate_present',
  statement_matches: 'qualityAbout.statement_matches',
  low_data: 'qualityAbout.low_data',
};

/** Название проверки: встроенной — ядра на языке менеджера, своей — владельца; незнакомой — код. */
export var checkName = (
  code: string,
  checks: readonly Pick<CheckView, 'code' | 'name'>[]
): string =>
  CHECK_NAME_KEYS[code]
    ? t(CHECK_NAME_KEYS[code])
    : checks.find((_) => _.code === code)?.name || code;

/** Отправитель строки: его название из настройки; null — сайт. */
export var scopeName = (
  setup: Pick<SetupView, 'senders'> | null,
  scope: string | null
): string =>
  scope === null
    ? t('quality.site')
    : (setup?.senders.find((_) => _.code === scope)?.name ?? scope);

// --- Состояния -----------------------------------------------------------------------------------------------

/** Состояние ячейки на экране: снятое вручную — поверх состояния. */
export type CellState = CheckState | 'resolved';

export var cellState = (
  cell: Pick<QualityCell, 'state' | 'resolved'>
): CellState => (cell.resolved !== null ? 'resolved' : cell.state);

/** Значок, тон и слово состояния: смысл несут значок и слово, цвет только помогает. У снятого знака нет — его
 *  значок рисует `StateSymbol.svelte` (галочка в круге). */
export var STATE_MARKS: Readonly<
  Record<
    CellState,
    {
      readonly symbol: string;
      readonly tone: 'ok' | 'warn' | 'danger' | 'plain';
      readonly label: MessageKey;
    }
  >
> = {
  ok: { symbol: '✓', tone: 'ok', label: 'quality.stateOk' },
  warning: { symbol: '!', tone: 'warn', label: 'quality.stateWarning' },
  failure: { symbol: '✕', tone: 'danger', label: 'quality.stateFailure' },
  no_data: { symbol: '–', tone: 'plain', label: 'quality.stateNoData' },
  resolved: { symbol: '', tone: 'plain', label: 'quality.stateResolved' },
};

const _RANK: Readonly<Record<CheckState, number>> = {
  ok: 1,
  no_data: 0,
  warning: 2,
  failure: 3,
};

/** Тяжелее ли состояние: сбой — замечания, замечание — «в порядке», «в порядке» — «нет данных». */
export var heavier = (a: CheckState, b: CheckState): boolean =>
  _RANK[a] > _RANK[b];

// --- Причины и главное число ---------------------------------------------------------------------------------

/** Причины «нет данных» и замечаний без числа — словами. */
export var REASON_KEYS: Readonly<Record<string, MessageKey>> = {
  intake_off: 'qualityReason.intake_off',
  no_summary: 'qualityReason.no_summary',
  no_revenue: 'qualityReason.no_revenue',
  no_failed: 'qualityReason.no_failed',
  erased: 'qualityReason.erased',
  no_schema: 'qualityReason.no_schema',
  low_volume: 'qualityReason.low_volume',
  stats_off: 'qualityReason.stats_off',
  no_links: 'qualityReason.no_links',
  no_base: 'qualityReason.no_base',
  stale: 'qualityReason.stale',
  no_statement: 'qualityReason.no_statement',
};

/** Причина словами; незнакомая — код (новый сервер). */
export var reasonText = (reason: string | null): string =>
  reason === null ? '' : REASON_KEYS[reason] ? t(REASON_KEYS[reason]) : reason;

const _percent = (value: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    maximumFractionDigits: 1,
  }).format(value);

/** Что нужно словам строки: правило своей проверки (у выручки — валюта порога). */
export type ValueContext = {
  readonly rule: ThresholdRule | null;
};

type _Words = (
  cell: Pick<QualityCell, 'state' | 'reason' | 'value'>,
  value: number
) => string;

const _counted =
  (warning: MessageKey, ok: MessageKey): _Words =>
  (cell, value) =>
    cell.state === 'warning' || cell.state === 'failure'
      ? tn(warning, value)
      : value > 0
        ? tn(warning, value)
        : t(ok);

// Главное число по проверке и причине: что случилось — числом и словами.
const _WORDS: Readonly<Record<string, _Words>> = {
  summary_arrived: (cell, value) =>
    cell.state === 'failure'
      ? value > 1
        ? tn('qualityValue.noSummaryDays', value)
        : t('qualityValue.noSummary')
      : cell.reason === 'late'
        ? t('qualityValue.summaryLate')
        : t('qualityValue.summaryOk'),
  events_arrived: (cell, value) =>
    cell.reason === 'extra'
      ? tn('qualityValue.extra', value)
      : value > 0
        ? tn('qualityValue.missing', value)
        : t('qualityValue.allArrived'),
  revenue_matches: (cell, value) =>
    cell.state === 'ok'
      ? t('qualityValue.revenueOk')
      : t('qualityValue.revenueOff', { share: _percent(value) }),
  sender_delivered: _counted(
    'qualityValue.notDelivered',
    'qualityValue.delivered'
  ),
  sender_facts: _counted('qualityValue.factsOff', 'qualityValue.factsOk'),
  labels_readable: (cell, value) =>
    t(
      cell.state === 'warning'
        ? 'qualityValue.unreadable'
        : 'qualityValue.readable',
      { share: _percent(value) }
    ),
  intake_refusals: (cell, value) =>
    cell.reason === 'invalid'
      ? tn('qualityValue.invalid', value)
      : cell.reason === 'unauthorized'
        ? tn('qualityValue.unauthorized', value)
        : value > 0
          ? tn('qualityValue.refusals', value)
          : t('qualityValue.noRefusals'),
  repeat_conflicts: _counted(
    'qualityValue.conflicts',
    'qualityValue.noConflicts'
  ),
  payment_duplicates: _counted(
    'qualityValue.duplicates',
    'qualityValue.noDuplicates'
  ),
  first_touch_stable: _counted(
    'qualityValue.touchChanged',
    'qualityValue.touchStable'
  ),
  event_time: _counted('qualityValue.oddTime', 'qualityValue.timeOk'),
  all_known: _counted('qualityValue.unknown', 'qualityValue.allKnown'),
  links_arrive: _counted('qualityValue.lagging', 'qualityValue.linksOk'),
  rate_present: (cell, value) =>
    cell.reason === 'no_rate'
      ? tn('qualityValue.noRate', value)
      : cell.reason === 'stale_rate'
        ? tn('qualityValue.staleRate', value)
        : t('qualityValue.ratesOk'),
  statement_matches: (cell, value) =>
    cell.state === 'ok'
      ? t('qualityValue.statementOk')
      : t('qualityValue.statementOff', { share: _percent(value) }),
};

const _ruleValue = (value: number, rule: ThresholdRule): string =>
  rule.metric === 'revenue' && rule.currency
    ? money(value, rule.currency, currentLanguage())
    : number(value);

/**
 * Главное число строки словами: «недостаёт 2 событий», «15 % меток не читаются», «нет сводки 3 дня подряд»; у
 * «нет данных» — причина словами, у своей проверки — значение и порог.
 */
export var valueText = (
  check: string,
  cell: Pick<QualityCell, 'state' | 'reason' | 'value'>,
  context: ValueContext = { rule: null }
): string =>
  cell.state === 'no_data' || cell.reason === 'no_statement'
    ? reasonText(cell.reason) || t('quality.stateNoData')
    : context.rule !== null
      ? t(
          cell.state === 'ok'
            ? 'qualityValue.ruleOk'
            : cell.reason === 'above'
              ? 'qualityValue.ruleAbove'
              : 'qualityValue.ruleBelow',
          {
            value: _ruleValue(cell.value ?? 0, context.rule),
            threshold: _ruleValue(context.rule.threshold, context.rule),
          }
        )
      : _WORDS[check]
        ? _WORDS[check](cell, cell.value ?? 0)
        : t(STATE_MARKS[cell.state].label);

/** Правило своей проверки из списка проверок; у встроенной — null. */
export var ruleOf = (
  code: string,
  checks: readonly CheckView[]
): ThresholdRule | null =>
  ((found) =>
    found === undefined || found.builtin
      ? null
      : (found.params as ThresholdRule))(checks.find((_) => _.code === code));

// --- Сутки и сроки -------------------------------------------------------------------------------------------

/** Сутки дня словами: «24 нояб.», с годом — «24 нояб. 2026 г.». */
export var dayText = (day: string, year = false): string =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
  });

/** Месяц словами: «октябрь 2026 г.». */
export var monthText = (day: string): string =>
  new Date(`${day.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString(
    currentLanguage(),
    { timeZone: 'UTC', month: 'long', year: 'numeric' }
  );

/** Сутки строки — у месячной месяц, у остальных день. */
export var rowDayText = (zone: CheckZone, day: string): string =>
  zone === 'month' ? monthText(day) : dayText(day);

/** Чьи сутки у строки: «сутки UTC», «сутки Europe/Berlin», «месяц Europe/Berlin». */
export var zoneText = (zone: CheckZone, timeZone: string): string =>
  zone === 'utc'
    ? t('quality.zoneUtc')
    : t(zone === 'month' ? 'quality.zoneMonth' : 'quality.zoneReport', {
        zone: timeZone,
      });

const _clock = (zone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

// Смещение пояса в момент: настенное время минус сам момент (до секунды) — как `_offset` сервера.
const _offset = (ms: number, zone: string): number =>
  ((parts) =>
    Date.UTC(
      parts('year'),
      parts('month') - 1,
      parts('day'),
      parts('hour'),
      parts('minute'),
      parts('second')
    ) -
    (ms - (((ms % 1000) + 1000) % 1000)))(
    (
      (all) => (type: string) =>
        Number(all.find((_) => _.type === type)?.value ?? 0)
    )(_clock(zone).formatToParts(ms))
  );

/** Начало дня в поясе — момент ISO, как `dayStart` сервера (через переход времени тоже). */
export var dayStart = (day: string, zone: string): string =>
  ((wall) =>
    ((guess) =>
      ((first) =>
        new Date(first === guess ? wall - guess : wall - first).toISOString())(
        _offset(wall - guess, zone)
      ))(_offset(Date.parse(`${day}T12:00:00Z`), zone)))(
    Date.parse(`${day}T00:00:00Z`)
  );

const _after = (moment: string, minutes: number): string =>
  new Date(Date.parse(moment) + minutes * 60_000).toISOString();

const _DUE: Readonly<
  Record<CheckClock, (day: string, summaryAt: string, zone: string) => string>
> = {
  summary: (day, summaryAt) =>
    _after(`${addDays(day, 1)}T${summaryAt}:00.000Z`, 5),
  utc: (day) => `${addDays(day, 1)}T06:05:00.000Z`,
  report: (day, _summaryAt, zone) =>
    _after(dayStart(addDays(day, 1), zone), 6 * 60 + 5),
  month: (day, _summaryAt, zone) =>
    _after(dayStart(`${addMonths(day.slice(0, 7), 1)}-05`, zone), 6 * 60 + 5),
};

/** Срок суток D (у месячной — месяца с первым днём D) — как `dueAt` сервера. */
export var dueAt = (
  clock: CheckClock,
  day: string,
  summaryAt: string | null,
  zone: string
): string => _DUE[clock](day, summaryAt ?? '06:00', zone);

/** Часы проверки: встроенной — ядра, своей — пояс отчётов. */
export var clockOf = (code: string): CheckClock =>
  builtinCheck(code)?.clock ?? 'report';

const _ZONES: Readonly<Record<CheckClock, CheckZone>> = {
  summary: 'utc',
  utc: 'utc',
  report: 'report',
  month: 'month',
};

/** Сутки строки по часам проверки — как `zoneOf` сервера. */
export var zoneOfCheck = (code: string): CheckZone => _ZONES[clockOf(code)];

/**
 * Ближайшая проверка после `now`: по часам включённых проверок и часу сводки действующих отправителей. Ответ —
 * момент и пояс, в котором его назвать; null — проверять некому.
 */
export var nextCheck = (
  now: string,
  checks: readonly Pick<CheckView, 'code' | 'enabled' | 'archivedAt'>[],
  senders: readonly Pick<
    SetupView['senders'][number],
    'summaryAt' | 'enabled' | 'archivedAt'
  >[],
  zone: string
): { readonly at: string; readonly zone: string } | null =>
  ((active) =>
    active.length === 0
      ? null
      : (checks
          .filter(
            (_) =>
              _.enabled &&
              _.archivedAt === null &&
              builtinCheck(_.code)?.clock !== null
          )
          .flatMap((check) =>
            ((clock) =>
              (clock === 'summary'
                ? active
                    .map((_) => _.summaryAt)
                    .filter((_): _ is string => _ !== null)
                : [null]
              ).flatMap((summaryAt) =>
                ((today) =>
                  [-3, -2, -1, 0].map((n) => ({
                    at: dueAt(
                      clock,
                      clock === 'month'
                        ? `${addMonths(today.slice(0, 7), n < -1 ? -1 : 0)}-01`
                        : addDays(today, n),
                      summaryAt,
                      zone
                    ),
                    zone: clock === 'summary' || clock === 'utc' ? 'UTC' : zone,
                  })))(
                  clock === 'summary' || clock === 'utc'
                    ? now.slice(0, 10)
                    : dayIn(now, zone)
                )
              ))(clockOf(check.code))
          )
          .filter((_) => _.at > now)
          .toSorted((a, b) => (a.at < b.at ? -1 : 1))[0] ?? null))(
    senders.filter((_) => _.enabled && _.archivedAt === null)
  );

/** Момент словами в поясе: «25 нояб. в 03:35 UTC». */
export var whenText = (at: string, zone: string): string =>
  t('quality.when', {
    day: new Date(at).toLocaleDateString(currentLanguage(), {
      timeZone: zone,
      day: 'numeric',
      month: 'short',
    }),
    time: new Date(at).toLocaleTimeString(currentLanguage(), {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
    zone,
  });

/** Когда идёт проверка суток: «на следующие сутки в 03:35 UTC (час сводки + 5 минут)». */
export var dueRule = (
  code: string,
  zone: string,
  summaryAt: string | null = null
): string =>
  (
    ({
      summary: () =>
        summaryAt === null
          ? t('qualityDue.summaryAny')
          : t('qualityDue.summary', {
              time: dueAt('summary', '2026-01-01', summaryAt, 'UTC').slice(
                11,
                16
              ),
            }),
      utc: () => t('qualityDue.utc'),
      report: () => t('qualityDue.report', { zone }),
      month: () => t('qualityDue.month', { zone }),
    }) satisfies Record<CheckClock, () => string>
  )[clockOf(code)]();

// --- Сетка, плитки, эпизоды ----------------------------------------------------------------------------------

/** Сутки сетки по порядку, новые справа. */
export var gridDays = (from: string, to: string): string[] =>
  from > to ? [] : [from, ...gridDays(addDays(from, 1), to)];

/** Столбцы строки: ячейка на сутки; у месячной — одна на все дни месяца в сетке. */
export type GridCell = {
  readonly day: string;
  readonly span: number;
  readonly cell: QualityCell | null;
};

export var gridCells = (
  row: Pick<QualityRow, 'zone' | 'cells'>,
  days: readonly string[]
): GridCell[] =>
  row.zone === 'month'
    ? Object.values(Object.groupBy(days, (_) => _.slice(0, 7))).map((inMonth) =>
        ((list) => ({
          day: list[0] as string,
          span: list.length,
          cell:
            row.cells.find(
              (_) => _.day.slice(0, 7) === (list[0] as string).slice(0, 7)
            ) ?? null,
        }))(inMonth as string[])
      )
    : days.map((day) => ({
        day,
        span: 1,
        cell: row.cells.find((_) => _.day === day) ?? null,
      }));

/** Ячейка для читалки: «События дошли, Бот, 24 нояб.: сбой — недостаёт 2 событий». */
export var cellLabel = (
  row: Pick<QualityRow, 'check' | 'scope' | 'zone' | 'test'>,
  cell: QualityCell,
  names: {
    readonly checks: readonly CheckView[];
    readonly setup: Pick<SetupView, 'senders'> | null;
  }
): string =>
  t(cell.resolved ? 'quality.cellResolved' : 'quality.cell', {
    check: checkName(row.check, names.checks),
    scope: `${scopeName(names.setup, row.scope)}${row.test ? `, ${t('analytics.testMark')}` : ''}`,
    day: rowDayText(row.zone, cell.day),
    state: t(STATE_MARKS[cell.state].label),
    value: valueText(row.check, cell, {
      rule: ruleOf(row.check, names.checks),
    }),
  });

/**
 * Первые сутки эпизода, кончая `day`: подряд идущие замечания или сбои без снятия. У месячной — по месяцам.
 */
export var episodeStart = (
  cells: readonly QualityCell[],
  day: string,
  zone: CheckZone = 'utc'
): string =>
  ((previous) =>
    ((cell) =>
      cell !== undefined &&
      cell.resolved === null &&
      (cell.state === 'warning' || cell.state === 'failure')
        ? episodeStart(cells, previous, zone)
        : day)(cells.find((_) => _.day === previous)))(
    zone === 'month' ? `${addMonths(day.slice(0, 7), -1)}-01` : addDays(day, -1)
  );

/** Строка плитки: отправитель (или сайт), сутки и состояние `D*`, последний успех, снятие. */
export type TileLine = {
  readonly row: QualityRow;
  readonly cell: QualityCell | null;
};

export type Tile = {
  readonly check: string;
  readonly zone: CheckZone;
  /** Самое тяжёлое состояние строк плитки; снятое — как «в порядке». */
  readonly state: CellState | null;
  readonly lines: readonly TileLine[];
};

const _TILE_ORDER: Readonly<Record<CellState | 'none', number>> = {
  failure: 0,
  warning: 1,
  ok: 2,
  resolved: 2,
  no_data: 3,
  none: 4,
};

/**
 * Плитки — по проверке, строки — её отправители (у проверки сайта — одна); тестовых строк в плитках нет. Сначала
 * сбои, потом замечания, в порядке, «нет данных»; внутри — порядок проверок ядра.
 */
export var tilesOf = (rows: readonly QualityRow[]): Tile[] =>
  _tiles(rows).toSorted(
    (a, b) => _TILE_ORDER[a.state ?? 'none'] - _TILE_ORDER[b.state ?? 'none']
  );

const _tiles = (rows: readonly QualityRow[]): Tile[] =>
  Object.values(
    Object.groupBy(
      rows.filter((_) => !_.test),
      (_) => _.check
    )
  ).map((group) =>
    ((list) =>
      ((lines) => ({
        check: list[0]!.check,
        zone: list[0]!.zone,
        state: lines.reduce<CellState | null>(
          (worst, line) =>
            line.cell === null
              ? worst
              : ((state) =>
                  worst === null ||
                  (state !== 'resolved' &&
                    (worst === 'resolved' || heavier(state, worst)))
                    ? state
                    : worst)(cellState(line.cell)),
          null
        ),
        lines,
      }))(
        list.map((row) => ({
          row,
          cell: row.cells.find((_) => _.day === row.day) ?? null,
        }))
      ))(group as QualityRow[])
  );

/** Нерешённые замечания и сбои за сутки — для строки «открыто за 24 нояб.» по ссылке из уведомления. */
export var openOn = (
  rows: readonly QualityRow[],
  day: string
): { readonly row: QualityRow; readonly cell: QualityCell }[] =>
  rows.flatMap((row) =>
    row.cells
      .filter(
        (_) =>
          (row.zone === 'month'
            ? _.day.slice(0, 7) === day.slice(0, 7)
            : _.day === day) &&
          _.resolved === null &&
          (_.state === 'warning' || _.state === 'failure')
      )
      .map((cell) => ({ row, cell }))
  );

/** Плашки сверху «Сводки»: уведомления не уходят, приём выключен, ни одной сводки. */
export var bannersOf = (
  report: Pick<QualityReport, 'channels' | 'summaries'>,
  intakeEnabled: boolean,
  setup: Pick<SetupView, 'senders'>
): ('channels' | 'intake' | 'summaries')[] =>
  [
    !report.channels && 'channels',
    !intakeEnabled && 'intake',
    (report.summaries ?? []).length === 0 &&
      setup.senders.some(
        (_) => _.enabled && _.archivedAt === null && _.summaryAt !== null
      ) &&
      'summaries',
  ].filter((_): _ is 'channels' | 'intake' | 'summaries' => _ !== false);

/** Почему сетка пуста: нет отправителей, проверки выключены, событий ещё нет, сроки не наступили. */
export var emptyReason = (
  setup: Pick<SetupView, 'senders'>,
  checks: readonly Pick<CheckView, 'code' | 'enabled' | 'archivedAt'>[],
  events: boolean
): 'senders' | 'disabled' | 'events' | 'due' =>
  !setup.senders.some((_) => _.enabled && _.archivedAt === null)
    ? 'senders'
    : !checks.some(
          (_) =>
            _.enabled &&
            _.archivedAt === null &&
            builtinCheck(_.code)?.clock !== null
        )
      ? 'disabled'
      : events
        ? 'due'
        : 'events';

/** Куда ведёт строка дня: экраны, где видно подробности, кроме самой проверки. */
export type DayLink =
  | 'labels'
  | 'events'
  | 'people'
  | 'unknown'
  | 'rates'
  | 'statements'
  | 'import';

export var DAY_LINKS: Readonly<Record<string, readonly DayLink[]>> = {
  events_arrived: ['import', 'events'],
  revenue_matches: ['import', 'events'],
  summary_arrived: ['import'],
  sender_delivered: ['import'],
  labels_readable: ['labels'],
  repeat_conflicts: ['events'],
  payment_duplicates: ['events'],
  first_touch_stable: ['events', 'people'],
  all_known: ['unknown'],
  rate_present: ['rates'],
  statement_matches: ['statements'],
};

/** Подробности строки дня: поле `detail` как прислано — чужие коды в нём только текстом. */
export var detailOf = <T>(
  view: Pick<CheckDayView, 'detail'>,
  key: string
): T | null => (view.detail[key] ?? null) as T | null;

// --- Счёт приёма ---------------------------------------------------------------------------------------------

/** Исходы счёта приёма по порядку столбцов: решения по событию, отметки среди принятых, отказы. */
export var TALLY_OUTCOMES: readonly TallyOutcome[] = [
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
];

/** Строка таблицы «сутки × исход»: сутки, отправитель (`''` — ключ не узнан), путь и счёт по исходам. */
export type TallyRow = {
  readonly day: string;
  readonly sender: string;
  readonly origin: 'http' | 'file';
  readonly counts: Readonly<Partial<Record<TallyOutcome, number>>>;
};

/** Сутки от новых к старым; в сутках — отправители по коду, сначала сеть, потом файл. */
export var tallyRows = (days: readonly IntakeDay[]): TallyRow[] =>
  Object.values(Object.groupBy(days, (_) => `${_.day}/${_.sender}/${_.origin}`))
    .map((group) =>
      ((list) => ({
        day: list[0]!.day,
        sender: list[0]!.sender,
        origin: list[0]!.origin,
        counts: list.reduce<Partial<Record<TallyOutcome, number>>>(
          (all, _) => ({
            ...all,
            [_.outcome]: (all[_.outcome] ?? 0) + _.count,
          }),
          {}
        ),
      }))(group as IntakeDay[])
    )
    .toSorted(
      (a, b) =>
        (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) ||
        (a.sender < b.sender ? -1 : a.sender > b.sender ? 1 : 0) ||
        (a.origin === b.origin ? 0 : a.origin === 'http' ? -1 : 1)
    );

/** Столбцы таблицы — только исходы, которые были за период. */
export var tallyColumns = (days: readonly IntakeDay[]): TallyOutcome[] =>
  TALLY_OUTCOMES.filter((outcome) =>
    days.some((_) => _.outcome === outcome && _.count > 0)
  );
