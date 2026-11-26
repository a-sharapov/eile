import { fail } from '../../../shared/kernel/errors.ts';
import {
  addDays,
  addMonths,
  type Day,
  dayIn,
  dayStart,
  type Month,
  monthOf,
} from './days.ts';
import { checkEvent, dayOf, momentOf } from './envelope.ts';
import { labelParts, parseLabel, valueState } from './labels.ts';
import {
  type CurrencyMoment,
  type ExchangeRate,
  rateAt,
  rateSteps,
} from './money.ts';
import type { Amounts, PersonFacts } from './person.ts';
import type { EventRole } from './roles.ts';
import type { LabelSchema, Parts, PropertyKind, Setup } from './setup.ts';
import type { Statement, StatementFees } from './statements.ts';
import type { SummaryDay } from './summary.ts';
import { type IntakeDay, utcDay } from './tally.ts';

/** Состояние строки дня: в порядке, замечание, сбой, проверять нечем. */
export type CheckState = 'ok' | 'warning' | 'failure' | 'no_data';

export var CHECK_STATES: readonly CheckState[] = [
  'ok',
  'warning',
  'failure',
  'no_data',
];

/** Когда уведомлять: при сбое, при сбое и замечании, никогда. */
export type CheckNotify = 'failure' | 'any' | 'off';

export var CHECK_NOTIFY: readonly CheckNotify[] = ['failure', 'any', 'off'];

/**
 * Чьи сутки и какой срок: `summary` — сутки UTC и час сводки отправителя, `utc` — сутки UTC и 06:05, `report` —
 * сутки пояса отчётов и 6 ч 5 мин после начала следующих, `month` — месяц пояса отчётов и 5-е число следующего
 * в 06:05.
 */
export type CheckClock = 'summary' | 'utc' | 'report' | 'month';

/** Сутки строки на экране: UTC, пояс отчётов или месяц. */
export type CheckZone = 'utc' | 'report' | 'month';

/** Строки проверки: по строке на действующего отправителя или одна на сайт. */
export type CheckScope = 'sender' | 'site';

/** Показатель своей пороговой проверки. */
export type CheckMetric =
  | 'events'
  | 'role'
  | 'people'
  | 'customers'
  | 'revenue'
  | 'visitors'
  | 'goal';

export var CHECK_METRICS: readonly CheckMetric[] = [
  'events',
  'role',
  'people',
  'customers',
  'revenue',
  'visitors',
  'goal',
];

/** Своя пороговая: один показатель, одно сравнение, один порог, период до суток проверки. */
export type ThresholdRule = {
  readonly metric: CheckMetric;
  readonly sender: string | null;
  readonly type: string | null;
  readonly role: EventRole | null;
  readonly goal: string | null;
  readonly currency: string | null;
  readonly compare: 'lt' | 'gt';
  /** Счёт; у выручки — минимальные единицы валюты правила. */
  readonly threshold: number;
  readonly days: 1 | 7 | 30;
  readonly severity: 'warning' | 'failure';
};

/** Поле правила, которое задаёт показатель. */
export type RuleParam = 'sender' | 'type' | 'role' | 'goal' | 'currency';

/** Параметры показателя: обязательные и необязательные; остальные у правила — null. */
export var METRIC_PARAMS: Readonly<
  Record<
    CheckMetric,
    {
      readonly required: readonly RuleParam[];
      readonly optional: readonly RuleParam[];
    }
  >
> = {
  events: { required: ['sender', 'type'], optional: [] },
  role: { required: ['role'], optional: ['sender'] },
  people: { required: [], optional: [] },
  customers: { required: [], optional: [] },
  revenue: { required: ['currency'], optional: [] },
  visitors: { required: [], optional: [] },
  goal: { required: ['goal'], optional: [] },
};

/** Роли, которых у показателя `role` нет: сводка и удаление — служебные события. */
export var RULE_ROLES_EXCLUDED: readonly EventRole[] = ['summary', 'erasure'];

export var RULE_DAYS: readonly ThresholdRule['days'][] = [1, 7, 30];

/**
 * Элемент группы `check`: у встроенной — поправка (пороги, «уведомлять», включена ли), у своей — правило,
 * название и архив.
 */
export type QualityCheck = {
  readonly code: string;
  /** У встроенной пусто: название — ядра, на языке менеджера. */
  readonly name: string;
  readonly note: string;
  readonly enabled: boolean;
  readonly notify: CheckNotify;
  /** У встроенной — только заданные пороги (остальные — значения ядра), у своей — правило. */
  readonly params: Readonly<Record<string, number>> | ThresholdRule;
  readonly archivedAt: string | null;
};

type ParamKind = 'count' | 'percent' | 'min' | 'days' | 'low';

type ParamSpec = { readonly kind: ParamKind; readonly value: number };

/** Встроенная проверка ядра: код, сутки, строки, «уведомлять» и пороги по умолчанию. */
export type BuiltinCheck = {
  readonly code: string;
  /** null — не по расписанию: пороги «мало данных» читают отчёты. */
  readonly clock: CheckClock | null;
  readonly scope: CheckScope | null;
  readonly notify: CheckNotify;
  readonly params: Readonly<Record<string, ParamSpec>>;
  /** false — выключена, пока владелец её не включит; по умолчанию включена. */
  readonly enabled?: boolean;
};

const _p = (kind: ParamKind, value: number): ParamSpec => ({ kind, value });

/** Встроенные проверки (ADR 0072, «Правила встроенных проверок»). */
export var BUILTIN_CHECKS: readonly BuiltinCheck[] = [
  {
    code: 'summary_arrived',
    clock: 'summary',
    scope: 'sender',
    notify: 'failure',
    params: {},
  },
  {
    code: 'events_arrived',
    clock: 'summary',
    scope: 'sender',
    notify: 'failure',
    params: { missing: _p('count', 0) },
  },
  {
    code: 'revenue_matches',
    clock: 'summary',
    scope: 'sender',
    notify: 'failure',
    params: { tolerance: _p('percent', 0) },
  },
  {
    code: 'sender_delivered',
    clock: 'summary',
    scope: 'sender',
    notify: 'failure',
    params: { failed: _p('count', 0) },
  },
  {
    code: 'sender_facts',
    clock: 'utc',
    scope: 'sender',
    notify: 'failure',
    params: { count: _p('count', 0) },
  },
  {
    code: 'labels_readable',
    clock: 'utc',
    scope: 'sender',
    notify: 'failure',
    params: { share: _p('percent', 10), min: _p('min', 10) },
  },
  {
    code: 'intake_refusals',
    clock: 'utc',
    scope: 'site',
    notify: 'failure',
    params: { invalid: _p('count', 0), unauthorized: _p('count', 0) },
  },
  {
    code: 'repeat_conflicts',
    clock: 'utc',
    scope: 'site',
    notify: 'failure',
    params: { count: _p('count', 0) },
  },
  {
    code: 'payment_duplicates',
    clock: 'utc',
    scope: 'site',
    notify: 'failure',
    params: { count: _p('count', 0) },
  },
  {
    code: 'first_touch_stable',
    clock: 'utc',
    scope: 'site',
    notify: 'failure',
    params: { count: _p('count', 0) },
  },
  {
    code: 'event_time',
    clock: 'utc',
    scope: 'site',
    notify: 'failure',
    params: { count: _p('count', 0) },
  },
  {
    code: 'all_known',
    clock: 'utc',
    scope: 'site',
    notify: 'failure',
    params: { count: _p('count', 0) },
  },
  {
    code: 'links_arrive',
    clock: 'report',
    scope: 'site',
    notify: 'failure',
    params: { share: _p('percent', 50), min: _p('min', 10) },
  },
  {
    code: 'rate_present',
    clock: 'report',
    scope: 'site',
    notify: 'any',
    params: { days: _p('days', 2) },
  },
  {
    code: 'statement_matches',
    clock: 'month',
    scope: 'site',
    notify: 'any',
    params: { tolerance: _p('percent', 1) },
    enabled: false,
  },
  {
    code: 'low_data',
    clock: null,
    scope: null,
    notify: 'off',
    params: { people: _p('low', 30), customers: _p('low', 10) },
  },
];

/** Код проверки: тот же вид, что у кодов настройки. */
export var CHECK_CODE_LIMIT = 40;

export var QUALITY_LIMITS = {
  /** Пропущенные сутки после простоя — за столько последних суток каждой проверки. */
  missingDays: 7,
  /** «Грязные» сутки — события с прошлого такта — за столько суток. */
  dirtyDays: 30,
  /** После правки настройки, курсов, выключателя и удалений — за столько суток. */
  changedDays: 7,
  /** Напоминание об эпизоде — не чаще, чем раз в столько суток. */
  remindDays: 7,
  /** Пока у сайта нет сводки — молча столько суток с первого события. */
  quietDays: 7,
  /** Сетка за запрос; по умолчанию — 30. */
  gridDays: 90,
  /** Строки дней живут столько суток. */
  keepDays: 400,
  /** Месячная проверка — за столько последних месяцев: строки живут 400 суток. */
  months: 12,
  /** Своих пороговых на сайт, в архиве — тоже в счёте. */
  custom: 20,
  /** Порог своей пороговой — счёт; у выручки — деньги валюты правила. */
  threshold: 100_000,
  note: 500,
} as const;

const _RANGES: Readonly<
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

type Input = Readonly<Record<string, unknown>>;

const _isRecord = (raw: unknown): raw is Input =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _invalid = (label: string, message: string): never =>
  fail('analytics.invalid_item', `${label}: ${message}`);

/** Встроенная проверка по коду; null — такой нет. */
export var builtinCheck = (code: string): BuiltinCheck | null =>
  BUILTIN_CHECKS.find((_) => _.code === code) ?? null;

/** Пороги ядра: ключ → значение. */
export var defaultsOf = (
  spec: BuiltinCheck
): Readonly<Record<string, number>> =>
  Object.fromEntries(
    Object.entries(spec.params).map(({ 0: key, 1: param }) => [
      key,
      param.value,
    ])
  );

const _fits = (raw: unknown, kind: ParamKind): raw is number =>
  ((range) =>
    typeof raw === 'number' &&
    Number.isFinite(raw) &&
    raw >= range.min &&
    raw <= range.max &&
    (range.tenths
      ? Math.abs(raw * 10 - Math.round(raw * 10)) < 1e-9
      : Number.isInteger(raw)))(_RANGES[kind]);

const _RULES: Readonly<Record<ParamKind, string>> = {
  count: 'a whole number 0 to 100000',
  percent: 'a percent 0 to 100 with up to one digit after the point',
  min: 'a whole number 1 to 10000',
  days: 'a whole number 0 to 31',
  low: 'a whole number 1 to 1000',
};

// Пороги поправки: только ключи проверки и в своих пределах; ключа нет — значение ядра.
const _params = (
  raw: unknown,
  spec: BuiltinCheck,
  label: string
): Readonly<Record<string, number>> =>
  _isRecord(raw)
    ? Object.fromEntries(
        Object.entries(raw).map(({ 0: key, 1: value }) =>
          ((param) =>
            param === undefined
              ? _invalid(
                  label,
                  `params has no "${key}": this check has ${Object.keys(spec.params).join(', ') || 'no thresholds'}`
                )
              : _fits(value, param.kind)
                ? [key, Math.round(value * 10) / 10]
                : _invalid(label, `params.${key} is ${_RULES[param.kind]}`))(
            Object.hasOwn(spec.params, key) ? spec.params[key] : undefined
          )
        )
      )
    : _invalid(label, 'params is an object of thresholds');

/**
 * Поправка встроенной проверки: код — встроенный, своего названия нет, пороги — только свои ключи; у «мало
 * данных» нет «включена» и «уведомлять». Поля, которых нет во входе, остаются прежними.
 */
export var checkCorrection = (
  input: Input,
  previous: QualityCheck | null,
  code: string,
  label: string
): Omit<QualityCheck, 'note'> =>
  ((spec) =>
    spec === null
      ? _invalid(
          label,
          `there is no built-in check ${code}: one of ${BUILTIN_CHECKS.map((_) => _.code).join(', ')}`
        )
      : {
          code,
          name:
            input.name === undefined || input.name === null || input.name === ''
              ? ''
              : _invalid(
                  label,
                  'a built-in check has no name of its own: its name comes with Eile'
                ),
          enabled:
            input.enabled === undefined
              ? (previous?.enabled ?? true)
              : spec.clock === null
                ? _invalid(label, 'low data thresholds cannot be turned off')
                : typeof input.enabled === 'boolean'
                  ? input.enabled
                  : _invalid(label, 'enabled is true or false'),
          notify:
            input.notify === undefined
              ? (previous?.notify ?? spec.notify)
              : spec.clock === null
                ? _invalid(label, 'low data thresholds do not notify')
                : CHECK_NOTIFY.includes(input.notify as CheckNotify)
                  ? (input.notify as CheckNotify)
                  : _invalid(
                      label,
                      `notify is one of ${CHECK_NOTIFY.join(', ')}`
                    ),
          params:
            input.params === undefined
              ? ((previous?.params as Readonly<Record<string, number>>) ?? {})
              : input.params === null
                ? {}
                : _params(input.params, spec, label),
          archivedAt: null,
        })(builtinCheck(code));

/** Правило своей пороговой; у встроенной — null: её код — код ядра. */
export var ruleOf = (check: QualityCheck): ThresholdRule | null =>
  builtinCheck(check.code) === null ? (check.params as ThresholdRule) : null;

/** Проверка по нынешней настройке: поправка поверх значений ядра; у своей — её правило. */
export type CheckConfig = {
  /** У своей — сутки пояса отчётов и одна строка на сайт. */
  readonly spec: BuiltinCheck;
  /** Поправка встроенной; у своей — сама проверка. */
  readonly correction: QualityCheck | null;
  readonly rule: ThresholdRule | null;
  readonly enabled: boolean;
  readonly notify: CheckNotify;
  readonly params: Readonly<Record<string, number>>;
};

const _customSpec = (code: string): BuiltinCheck => ({
  code,
  clock: 'report',
  scope: 'site',
  notify: 'failure',
  params: {},
});

/** Встроенные по порядку ядра, за ними свои по коду; своя в архиве не идёт по расписанию. */
export var checkConfigs = (setup: Setup): CheckConfig[] => [
  ...BUILTIN_CHECKS.map((spec) =>
    ((correction) => ({
      spec,
      correction,
      rule: null,
      enabled: correction?.enabled ?? spec.enabled ?? true,
      notify: spec.clock === null ? 'off' : (correction?.notify ?? spec.notify),
      params: {
        ...defaultsOf(spec),
        ...((correction?.params as Readonly<Record<string, number>>) ?? {}),
      },
    }))(setup.checks.find((_) => _.code === spec.code) ?? null)
  ),
  ...setup.checks.flatMap((check): CheckConfig[] =>
    ((rule) =>
      rule === null
        ? []
        : [
            {
              spec: _customSpec(check.code),
              correction: check,
              rule,
              enabled: check.enabled && check.archivedAt === null,
              notify: check.notify,
              params: {},
            },
          ])(ruleOf(check))
  ),
];

/** Часы проверки по коду: встроенная — ядра, своя — сутки пояса отчётов; кода нет в настройке — null. */
export var clockOf = (setup: Setup, code: string): CheckClock | null =>
  builtinCheck(code)?.clock ??
  (setup.checks.some((_) => _.code === code) ? 'report' : null);

/** Порядок проверок в сетке и списках: встроенные — как в ядре, свои — после них. */
export var checkOrder = (code: string): number =>
  ((index) => (index < 0 ? BUILTIN_CHECKS.length : index))(
    BUILTIN_CHECKS.findIndex((_) => _.code === code)
  );

/** Пороги «мало данных»: строка отчёта из меньшего числа новых людей или клиентов приглушена. */
export type LowDataThresholds = {
  readonly people: number;
  readonly customers: number;
};

/** Пороги «мало данных» по настройке: поправка `low_data` поверх значений ядра (30 и 10). */
export var lowDataOf = (checks: readonly QualityCheck[]): LowDataThresholds =>
  ((params) => ({
    people: params.people as number,
    customers: params.customers as number,
  }))({
    ...defaultsOf(builtinCheck('low_data') as BuiltinCheck),
    ...((checks.find((_) => _.code === 'low_data')?.params as Readonly<
      Record<string, number>
    >) ?? {}),
  });

const _ZONES: Readonly<Record<CheckClock, CheckZone>> = {
  summary: 'utc',
  utc: 'utc',
  report: 'report',
  month: 'month',
};

/** Сутки строки на экране по часам проверки. */
export var zoneOf = (clock: CheckClock | null): CheckZone =>
  clock === null ? 'utc' : _ZONES[clock];

// --- Сроки ---------------------------------------------------------------------------------------------------

const _MINUTE_MS = 60_000;
const _DAY_MS = 86_400_000;

const _after = (moment: string, minutes: number): string =>
  new Date(Date.parse(moment) + minutes * _MINUTE_MS).toISOString();

/** Час сводки за сутки D: D + 1 в `ЧЧ:ММ` UTC — крайний срок, а не время отправки. */
export var summaryExpected = (day: Day, summaryAt: string): string =>
  `${addDays(day, 1)}T${summaryAt}:00.000Z`;

const _DUE: Readonly<
  Record<CheckClock, (day: Day, summaryAt: string, zone: string) => string>
> = {
  summary: (day, summaryAt) => _after(summaryExpected(day, summaryAt), 5),
  // Последний повтор отправителя (через 6 часов) за событие 23:59 приходит к 06:00.
  utc: (day) => `${addDays(day, 1)}T06:05:00.000Z`,
  report: (day, _summaryAt, zone) =>
    _after(dayStart(addDays(day, 1), zone), 6 * 60 + 5),
  // Выписку за месяц банк отдаёт в первые дни следующего: напоминание — 5-го утром.
  month: (day, _summaryAt, zone) =>
    _after(dayStart(`${addMonths(monthOf(day), 1)}-05`, zone), 6 * 60 + 5),
};

/** Срок суток D (у месячной — месяца с первым днём D): с этого момента их проверяют; `summaryAt` — у сводки. */
export var dueAt = (
  clock: CheckClock,
  day: Day,
  summaryAt: string | null,
  zone: string
): string => _DUE[clock](day, summaryAt ?? '06:00', zone);

/** Первый день месяца — сутки строки месячной проверки. */
export var monthDay = (month: Month): Day => `${month}-01`;

/**
 * Последний наступивший день (`D*`): самые поздние сутки, срок которых прошёл. Час сводки 23:59 сдвигает срок
 * на третьи сутки, поэтому кандидатов три; у месячной — прошлый месяц или позапрошлый, первым днём.
 */
export var lastDue = (
  clock: CheckClock,
  now: string,
  summaryAt: string | null,
  zone: string
): Day =>
  clock === 'month'
    ? ((month) =>
        ((previous) =>
          dueAt(clock, previous, null, zone) <= now
            ? previous
            : monthDay(addMonths(month, -2)))(monthDay(addMonths(month, -1))))(
        monthOf(dayIn(now, zone))
      )
    : ((today) =>
        [1, 2, 3]
          .map((_) => addDays(today, -_))
          .find((_) => dueAt(clock, _, summaryAt, zone) <= now) ??
        addDays(today, -4))(
        clock === 'report' ? dayIn(now, zone) : utcDay(now)
      );

/** Предыдущие сутки строки: у месячной — первый день прошлого месяца. */
export var previousDay = (clock: CheckClock, day: Day): Day =>
  clock === 'month' ? monthDay(addMonths(monthOf(day), -1)) : addDays(day, -1);

// --- Строка дня ----------------------------------------------------------------------------------------------

/** Ключ строки дня: проверка, отправитель (`''` — сайт), тестовая ли, сутки. */
export type CheckKey = {
  readonly check: string;
  readonly scope: string;
  readonly test: boolean;
  readonly day: Day;
};

/** Снятие вручную: кто, когда, человек или агент, заметка о причине. */
export type CheckResolution = {
  readonly at: string;
  readonly by: string;
  readonly agent: boolean;
  readonly note: string;
};

/** Что дала проверка за сутки: состояние, причина кодом, главное число, подробности без чужого текста. */
export type CheckResult = {
  readonly state: CheckState;
  readonly reason: string | null;
  readonly value: number | null;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly version: string | null;
};

/** Строка дня: результат, снятие и отметки уведомлений. */
export type CheckDay = CheckKey &
  CheckResult & {
    readonly evaluatedAt: string;
    readonly resolution: CheckResolution | null;
    readonly notifiedAt: string | null;
    /** Первый день эпизода — у строки, с которой ушло уведомление. */
    readonly episode: Day | null;
    readonly recoveredAt: string | null;
  };

export var keyOfRow = (row: CheckKey): string =>
  `${row.check}/${row.scope}/${Number(row.test)}/${row.day}`;

const _result = (
  state: CheckState,
  reason: string | null = null,
  value: number | null = null,
  detail: Readonly<Record<string, unknown>> = {},
  version: string | null = null
): CheckResult => ({ state, reason, value, detail, version });

const _RANK: Readonly<Record<CheckState, number>> = {
  ok: 0,
  no_data: 0,
  warning: 1,
  failure: 2,
};

/** Тяжелее ли `a`, чем `b`: замечание тяжелее «в порядке», сбой — замечания. */
export var heavier = (a: CheckState, b: CheckState): boolean =>
  _RANK[a] > _RANK[b];

/**
 * Строка после перепроверки: снятие остаётся, пока состояние не стало тяжелее (человек снимал другое),
 * отметки уведомлений — всегда.
 */
export var nextRow = (
  previous: CheckDay | null,
  key: CheckKey,
  result: CheckResult,
  at: string
): CheckDay => ({
  ...key,
  ...result,
  evaluatedAt: at,
  resolution:
    previous?.resolution != null && !heavier(result.state, previous.state)
      ? previous.resolution
      : null,
  notifiedAt: previous?.notifiedAt ?? null,
  episode: previous?.episode ?? null,
  recoveredAt: previous?.recoveredAt ?? null,
});

// --- Проверки сводки -----------------------------------------------------------------------------------------

/** Тип отправителя для сверки: название и роль из настройки. */
export type TypeFact = { readonly name: string; readonly role: EventRole };

/** Всё, что сверяют проверки сводки за сутки D одного отправителя и одного `test`. */
export type SummaryFacts = {
  readonly summary: SummaryDay | null;
  /** Крайний срок сводки: D + 1 в час сводки. */
  readonly expected: string;
  /** Сколько суток подряд, кончая D, сводки нет — с первой сводки отправителя. */
  readonly missingDays: number;
  /** Приём выключали хоть на минуту суток D. */
  readonly intakeOff: boolean;
  /** События отправителя на сайте по типам. */
  readonly site: Readonly<Record<string, number>>;
  /** Счёт стёртого по типам. */
  readonly erased: Readonly<Record<string, number>>;
  /** Оплаты минус возвраты по валютам, в минимальных единицах. */
  readonly revenue: Amounts;
  /** Типы отправителя по настройке. */
  readonly types: ReadonlyMap<string, TypeFact>;
};

/** Строка сверки типа: в сводке, на сайте, стёрто, недостаёт и лишнее; `known` — тип есть в настройке. */
export type TypeCount = {
  readonly type: string;
  readonly known: boolean;
  readonly summary: number;
  readonly site: number;
  readonly erased: number;
  readonly missing: number;
  readonly extra: number;
};

const _sum = (values: readonly number[]): number =>
  values.reduce((sum, _) => sum + _, 0);

export var typeCounts = (facts: SummaryFacts): TypeCount[] =>
  facts.summary === null
    ? []
    : Object.entries(facts.summary.counts)
        .filter(({ 0: type }) => facts.types.get(type)?.role !== 'summary')
        .map(({ 0: type, 1: count }) =>
          ((site, erased) => ({
            type,
            known: facts.types.has(type),
            summary: count,
            site,
            erased,
            missing: Math.max(0, count - site - erased),
            extra: Math.max(0, site + erased - count),
          }))(facts.site[type] ?? 0, facts.erased[type] ?? 0)
        );

const _ERASED_MONEY: readonly EventRole[] = ['payment', 'refund'];

const _share = (part: number, whole: number): number =>
  whole === 0 ? (part === 0 ? 0 : 100) : Math.round((part / whole) * 1000) / 10;

/** Валюта выручки: в сводке и на сайте; расхождение — доля от суммы сводки. */
export type CurrencyCount = {
  readonly currency: string;
  readonly summary: number;
  readonly site: number;
};

export var currencyCounts = (facts: SummaryFacts): CurrencyCount[] =>
  facts.summary?.revenue == null
    ? []
    : ((summary) =>
        [...new Set([...Object.keys(summary), ...Object.keys(facts.revenue)])]
          .toSorted()
          .map((currency) => ({
            currency,
            summary: summary[currency] ?? 0,
            site: facts.revenue[currency] ?? 0,
          }))
          .filter((_) => _.summary !== 0 || _.site !== 0))(
        facts.summary.revenue
      );

type _SummaryCheck = (
  facts: SummaryFacts,
  params: Readonly<Record<string, number>>
) => CheckResult;

const _summaryArrived: _SummaryCheck = (facts) =>
  facts.summary !== null
    ? facts.summary.receivedAt > facts.expected
      ? _result(
          'ok',
          'late',
          null,
          { receivedAt: facts.summary.receivedAt },
          facts.summary.version
        )
      : _result('ok', null, null, {}, facts.summary.version)
    : facts.intakeOff
      ? _result('no_data', 'intake_off')
      : _result('failure', 'missing', facts.missingDays, {
          expected: facts.expected,
        });

const _eventsArrived: _SummaryCheck = (facts, params) =>
  facts.intakeOff
    ? _result('no_data', 'intake_off')
    : facts.summary === null
      ? _result('no_data', 'no_summary')
      : ((types) =>
          ((missing, extra, detail, version) =>
            missing > (params.missing ?? 0)
              ? _result('failure', 'missing', missing, detail, version)
              : extra > 0
                ? _result('warning', 'extra', extra, detail, version)
                : _result('ok', null, missing, detail, version))(
            _sum(types.map((_) => _.missing)),
            _sum(types.map((_) => _.extra)),
            { types },
            facts.summary?.version ?? null
          ))(typeCounts(facts));

const _revenueMatches: _SummaryCheck = (facts, params) =>
  facts.intakeOff
    ? _result('no_data', 'intake_off')
    : facts.summary === null
      ? _result('no_data', 'no_summary')
      : facts.summary.revenue === null
        ? _result('no_data', 'no_revenue', null, {}, facts.summary.version)
        : ((currencies, version) =>
            ((worst) =>
              worst === 0
                ? _result('ok', null, 0, { currencies }, version)
                : Object.entries(facts.erased).some(
                      ({ 0: type, 1: count }) =>
                        count > 0 &&
                        _ERASED_MONEY.includes(
                          facts.types.get(type)?.role as EventRole
                        )
                    )
                  ? _result('no_data', 'erased', worst, { currencies }, version)
                  : _result(
                      'failure',
                      'mismatch',
                      worst,
                      { currencies },
                      version
                    ))(
              currencies.reduce(
                (worst, _) =>
                  ((share) =>
                    share > (params.tolerance ?? 0)
                      ? Math.max(worst, share)
                      : worst)(
                    _share(Math.abs(_.site - _.summary), Math.abs(_.summary))
                  ),
                0
              )
            ))(currencyCounts(facts), facts.summary.version);

const _senderDelivered: _SummaryCheck = (facts, params) =>
  facts.summary === null
    ? _result('no_data', 'no_summary')
    : facts.summary.failed === null
      ? _result('no_data', 'no_failed', null, {}, facts.summary.version)
      : facts.summary.failed > (params.failed ?? 0)
        ? _result(
            'failure',
            'failed',
            facts.summary.failed,
            {},
            facts.summary.version
          )
        : _result('ok', null, facts.summary.failed, {}, facts.summary.version);

/** Проверки сводки: «Сводка пришла», «События дошли», «Выручка сходится», «Отправитель доставил всё». */
export var SUMMARY_CHECKS = {
  summary_arrived: _summaryArrived,
  events_arrived: _eventsArrived,
  revenue_matches: _revenueMatches,
  sender_delivered: _senderDelivered,
} as const satisfies Readonly<Record<string, _SummaryCheck>>;

/** Проверки, которые сверяют тестовую сводку с тестовыми событиями: строки с `test`. */
export var TEST_CHECKS: readonly string[] = [
  'events_arrived',
  'revenue_matches',
  'sender_delivered',
];

/** Сколько суток подряд, кончая `day`, сводки нет: от первой сводки отправителя. */
export var missingRun = (
  days: ReadonlySet<Day>,
  day: Day,
  first: Day
): number =>
  day < first || days.has(day)
    ? 0
    : 1 + missingRun(days, addDays(day, -1), first);

/** Переключение приёма в журнале настройки: включён ли он до и после правки. */
export type IntakeSwitch = {
  readonly at: string;
  readonly before: boolean | null;
  readonly after: boolean | null;
};

/**
 * Выключали ли приём хоть на минуту суток UTC: состояние в начале суток — по последней правке до них (до первой
 * правки — её «до», без правок — нынешнее), и правки внутри суток, где он был выключен до или после.
 */
export var intakeOffOn = (
  switches: readonly IntakeSwitch[],
  day: Day,
  enabled: boolean
): boolean =>
  ((from, to) =>
    !(
      switches.findLast((_) => _.at < from)?.after ??
      switches[0]?.before ??
      enabled
    ) ||
    switches.some(
      (_) =>
        _.at >= from && _.at < to && (_.before === false || _.after === false)
    ))(`${day}T00:00:00.000Z`, `${addDays(day, 1)}T00:00:00.000Z`);

// --- Проверки суток UTC ---------------------------------------------------------------------------------------

const _UNREADABLE = ['invalid', 'extra', 'length'] as const;

/** «Метки читаются»: касания отправителя за сутки — разные, непустые; `schema` — схема отправителя. */
export var labelsReadable = (
  labels: readonly string[],
  schema: LabelSchema | null,
  params: Readonly<Record<string, number>>
): CheckResult =>
  schema === null
    ? _result('no_data', 'no_schema', labels.length)
    : labels.length < (params.min ?? 10)
      ? _result('no_data', 'low_volume', labels.length, {
          total: labels.length,
        })
      : ((notes) =>
          ((unreadable) =>
            ((share, detail) =>
              share > (params.share ?? 10)
                ? _result('warning', 'unreadable', share, detail)
                : _result('ok', null, share, detail))(
              _share(unreadable, labels.length),
              {
                total: labels.length,
                unreadable,
                ...Object.fromEntries(
                  _UNREADABLE.map((note) => [
                    note,
                    notes.filter((_) => _.includes(note)).length,
                  ])
                ),
              }
            ))(
            notes.filter((_) => _UNREADABLE.some((note) => _.includes(note)))
              .length
          ))(labels.map((_) => parseLabel(schema, _).notes));

const _count = (
  rows: readonly IntakeDay[],
  outcomes: readonly string[],
  fits: (row: IntakeDay) => boolean = () => true
): number =>
  _sum(
    rows
      .filter((_) => outcomes.includes(_.outcome) && fits(_))
      .map((_) => _.count)
  );

/**
 * «Отказы приёмника»: счёт приёма суток, путь `http`. 400 известному отправителю — сбой (его события теряются),
 * 401 и 429 — замечание; 503 — выключатель владельца, не в счёт.
 */
export var intakeRefusals = (
  rows: readonly IntakeDay[],
  senders: ReadonlySet<string>,
  params: Readonly<Record<string, number>>
): CheckResult =>
  ((http) =>
    ((invalid, unauthorized, detail) =>
      invalid > (params.invalid ?? 0)
        ? _result('failure', 'invalid', invalid, detail)
        : unauthorized > (params.unauthorized ?? 0)
          ? _result('warning', 'unauthorized', unauthorized, detail)
          : _result('ok', null, invalid + unauthorized, detail))(
      _count(
        http,
        ['invalid'],
        (_) => _.sender !== '' && senders.has(_.sender)
      ),
      _count(http, ['unauthorized', 'throttled']),
      {
        refusals: http
          .filter((_) =>
            ['invalid', 'unauthorized', 'throttled'].includes(_.outcome)
          )
          .map((_) => ({
            sender: _.sender === '' ? null : _.sender,
            outcome: _.outcome,
            count: _.count,
          })),
      }
    ))(rows.filter((_) => _.origin === 'http'));

/** Счёт по отправителям с порогом `count`: больше — замечание. */
export var countWarning = (
  bySender: Readonly<Record<string, number>>,
  reason: string,
  params: Readonly<Record<string, number>>
): CheckResult =>
  ((total) =>
    total > (params.count ?? 0)
      ? _result('warning', reason, total, { senders: bySender })
      : _result('ok', null, total, { senders: bySender }))(
    _sum(Object.values(bySender))
  );

/** «Время события»: отметки `future` и `late` счёта приёма суток. */
export var eventTime = (
  rows: readonly IntakeDay[],
  params: Readonly<Record<string, number>>
): CheckResult =>
  ((future, late) =>
    future + late > (params.count ?? 0)
      ? _result('warning', 'odd_time', future + late, { future, late })
      : _result('ok', null, future + late, { future, late }))(
    _count(rows, ['future']),
    _count(rows, ['late'])
  );

/** Событие суток, как его читают проверки: тело разобрано, без псевдонима в результатах. */
export type DayEvent = {
  readonly seq: number;
  readonly sender: string;
  readonly type: string;
  readonly subject: string | null;
  readonly test: boolean;
  readonly at: string;
  readonly receivedAt: string;
  readonly body: Readonly<Record<string, unknown>>;
};

/** Касание события: метка и момент в UTC; без псевдонима наружу не идёт. */
export type EventTouch = {
  readonly subject: string | null;
  readonly label: string;
  readonly at: string;
};

const _touch = (raw: unknown, subject: string | null): EventTouch | null =>
  _isRecord(raw) && typeof raw.label === 'string'
    ? ((at) =>
        at === null ? null : { subject, label: raw.label as string, at })(
        momentOf(raw.at)
      )
    : null;

/** Касания события: метка события-касания, `first_touch`, `last_touch`; пустые — нет. */
export var eventTouches = (
  event: DayEvent,
  role: EventRole | null
): EventTouch[] =>
  [
    role === 'touch' &&
    _isRecord(event.body.data) &&
    typeof event.body.data.label === 'string'
      ? { subject: event.subject, label: event.body.data.label, at: event.at }
      : null,
    _touch(event.body.first_touch, event.subject),
    _touch(event.body.last_touch, event.subject),
  ].filter((_): _ is EventTouch => _ !== null && _.label.trim() !== '');

/** Разные касания: псевдоним, метка, момент — `first_touch` бот шлёт в каждом событии. */
export var distinctTouches = (touches: readonly EventTouch[]): EventTouch[] =>
  Object.values(
    Object.groupBy(
      touches,
      (_) => `${_.subject ?? ''}\u0000${_.label}\u0000${_.at}`
    )
  ).map((_) => (_ as EventTouch[])[0] as EventTouch);

/**
 * «Первое касание неизменно»: люди, у которых событие суток принесло `first_touch` не тот, что выбран у
 * человека (другая метка или момент после приведения к UTC). Ответ — сколько таких людей.
 */
export var touchConflicts = (
  events: readonly DayEvent[],
  chosen: ReadonlyMap<
    string,
    { readonly label: string; readonly at: string } | null
  >
): number =>
  new Set(
    events.flatMap((event) =>
      ((touch) =>
        touch === null || event.subject === null || !chosen.has(event.subject)
          ? []
          : ((person) =>
              person === null ||
              person === undefined ||
              person.label !== touch.label ||
              person.at !== touch.at
                ? [event.subject as string]
                : [])(chosen.get(event.subject)))(
        _touch(event.body.first_touch, event.subject)
      )
    )
  ).size;

/** Что незнакомо в событии: вид → сколько; кодов нет — они в «Незнакомых». */
export type UnknownKinds = Readonly<Record<string, number>>;

const _WARNINGS: readonly (readonly [prefix: string, kind: string])[] = [
  ['unknown_type', 'type'],
  ['unknown_value:data.question', 'question'],
  ['unknown_value:data.answer', 'answer'],
  ['unknown_value:traits.', 'trait'],
  ['unknown_value:data.', 'value'],
];

const _kindOf = (warning: string): string | null =>
  _WARNINGS.find(({ 0: prefix }) => warning.startsWith(prefix))?.[1] ?? null;

/**
 * Незнакомое в событии по нынешней настройке: тип, вопрос и ответ опроса, значение выбора и признака вне
 * справочника — повторной проверкой тела, части меток касаний вне справочника части.
 */
export var unknownIn = (
  event: DayEvent,
  setup: Setup,
  role: EventRole | null
): string[] =>
  ((checked, schema) => [
    ...(checked.ok
      ? checked.warnings.map(_kindOf).filter((_): _ is string => _ !== null)
      : []),
    ...eventTouches(event, role).flatMap((touch) =>
      Object.entries(labelParts(schema, touch.label))
        .filter(
          ({ 0: part, 1: value }) =>
            valueState(setup, part, value) === 'unknown'
        )
        .map(() => 'part')
    ),
  ])(
    checkEvent(event.body, {
      setup,
      sender: event.sender,
      now: event.receivedAt,
    }),
    setup.schemas.find((_) => _.sender === event.sender) ?? null
  );

/** «Всё знакомо»: события суток с незнакомым — больше `count` — замечание; подробности — по видам. */
export var allKnown = (
  found: readonly (readonly string[])[],
  params: Readonly<Record<string, number>>
): CheckResult =>
  ((events, kinds) =>
    events > (params.count ?? 0)
      ? _result('warning', 'unknown', events, { kinds })
      : _result('ok', null, events, { kinds }))(
    found.filter((_) => _.length > 0).length,
    found
      .flat()
      .reduce<Record<string, number>>(
        (all, _) => ({ ...all, [_]: (all[_] ?? 0) + 1 }),
        {}
      )
  );

// --- Проверки суток пояса ------------------------------------------------------------------------------------

/** Переход с заданными частями за сутки: цели статистики и люди с касанием, чья метка несёт эти части. */
export type LinkCount = {
  readonly link: string;
  readonly goals: number;
  readonly people: number;
};

/** Несёт ли метка все заданные части перехода. */
export var carries = (parts: Parts, preset: Parts): boolean =>
  Object.entries(preset).every(
    ({ 0: part, 1: value }) => parts[part] === value
  );

/**
 * «Переходы доходят»: по каждому переходу людей меньше `share` % целей при целях не меньше `min` — замечание;
 * людей больше целей — норма (QR-код и приложение открывают переход без посещения).
 */
export var linksArrive = (
  statsOn: boolean,
  links: readonly LinkCount[],
  params: Readonly<Record<string, number>>
): CheckResult =>
  !statsOn
    ? _result('no_data', 'stats_off')
    : links.length === 0
      ? _result('no_data', 'no_links')
      : ((counted) =>
          counted.length === 0
            ? _result('no_data', 'low_volume', null, { links })
            : ((lagging) =>
                lagging.length > 0
                  ? _result('warning', 'lagging', lagging.length, { links })
                  : _result('ok', null, 0, { links }))(
                counted.filter(
                  (_) => _share(_.people, _.goals) < (params.share ?? 50)
                )
              ))(links.filter((_) => _.goals >= (params.min ?? 10)));

/**
 * «Курс есть» за сутки D: суммы в валютах, кроме базовой, с моментом раньше начала суток D + 1 − `days` пояса.
 * Сумма без курса — сбой, по курсу прошлого месяца — замечание (месяц, за который ввести курс).
 */
export var ratePresent = (
  base: string | null,
  moments: readonly CurrencyMoment[],
  rates: readonly ExchangeRate[],
  day: Day,
  zone: string,
  params: Readonly<Record<string, number>>
): CheckResult =>
  base === null
    ? _result('no_data', 'no_base')
    : ((steps, cutoff) =>
        ((priced) =>
          ((missing, stale) =>
            missing.length > 0
              ? _result('failure', 'no_rate', missing.length, {
                  missing,
                  stale,
                })
              : stale.length > 0
                ? _result('warning', 'stale_rate', stale.length, {
                    missing,
                    stale,
                  })
                : _result('ok', null, 0, { missing, stale }))(
            [
              ...new Set(
                priced.filter((_) => _.step === null).map((_) => _.currency)
              ),
            ].toSorted(),
            Object.values(
              Object.groupBy(
                priced.filter(
                  (_) => _.step !== null && _.at >= _.step.staleFrom
                ),
                (_) => `${_.currency}/${dayIn(_.at, zone).slice(0, 7)}`
              )
            )
              .map((_) =>
                ((first) => ({
                  currency: first.currency,
                  month: dayIn(first.at, zone).slice(0, 7),
                }))((_ as typeof priced)[0] as (typeof priced)[number])
              )
              .toSorted((a, b) =>
                `${a.currency}${a.month}` < `${b.currency}${b.month}` ? -1 : 1
              )
          ))(
          moments
            .filter((_) => _.currency !== base && _.at < cutoff)
            .map((_) => ({ ..._, step: rateAt(steps, _.currency, _.at) }))
        ))(
        rateSteps(rates, base, zone),
        dayStart(addDays(day, 1 - (params.days ?? 2)), zone)
      );

// --- Счёт отправителя ----------------------------------------------------------------------------------------

/** Отметка сверки свойства: что ядро считает само и с чем сверяет присланное отправителем. */
export type ReconcileMark =
  | 'payment_number'
  | 'customer_since'
  | 'after_trial'
  | 'returning';

export var RECONCILE_MARKS: readonly ReconcileMark[] = [
  'payment_number',
  'customer_since',
  'after_trial',
  'returning',
];

/** Вид свойства под отметку: номер оплаты — число, день первой оплаты — дата, остальное — да или нет. */
export var RECONCILE_KINDS: Readonly<Record<ReconcileMark, PropertyKind>> = {
  payment_number: 'number',
  customer_since: 'date',
  after_trial: 'boolean',
  returning: 'boolean',
};

/** Что ядро знает об оплате по таблице людей. */
export type PaymentFacts = {
  /** Номер оплаты человека: записи `money` с суммой больше нуля по времени. */
  readonly number: number;
  /** Сутки UTC первой оплаты. */
  readonly customerSince: Day;
  /** Пробный период начался не позже оплаты. */
  readonly afterTrial: boolean;
  /** Оплата после конца доступа — среди возвращений. */
  readonly returning: boolean;
};

/**
 * Факты оплаты в момент `at`: `earlier` — оплаты человека в тот же момент, принятые раньше. Оплаты нет в свёртке
 * (не прошла поля роли) — null: сверять нечего.
 */
export var paymentFacts = (
  person: Pick<PersonFacts, 'money' | 'firstPaidAt' | 'trialAt' | 'returns'>,
  at: string,
  earlier: number
): PaymentFacts | null =>
  ((index) =>
    index < 0 || person.firstPaidAt === null
      ? null
      : {
          number: index + 1 + earlier,
          customerSince: utcDay(person.firstPaidAt),
          afterTrial: person.trialAt !== null && person.trialAt <= at,
          returning: person.returns.some((_) => _.at === at),
        })(person.money.filter((_) => _[2] > 0).findIndex((_) => _[0] === at));

// Дата сверки — сутки UTC: день как прислан, момент — его сутки UTC.
const _sentDay = (raw: unknown): Day | null =>
  dayOf(raw) ??
  ((moment) => (moment === null ? null : utcDay(moment)))(momentOf(raw));

const _MATCHES: Readonly<
  Record<ReconcileMark, (sent: unknown, facts: PaymentFacts) => boolean>
> = {
  payment_number: (sent, facts) => sent === facts.number,
  customer_since: (sent, facts) => _sentDay(sent) === facts.customerSince,
  after_trial: (sent, facts) => sent === facts.afterTrial,
  returning: (sent, facts) => sent === facts.returning,
};

/** Оплата суток для сверки: присланные значения свойств с отметкой и факты ядра. */
export type ReconciledPayment = {
  readonly sent: Readonly<Partial<Record<ReconcileMark, unknown>>>;
  readonly facts: PaymentFacts | null;
};

/**
 * «Счёт отправителя»: оплаты суток, у типа которых есть свойство с отметкой сверки, — присланное против фактов
 * ядра. Не сошлось больше `count` оплат — замечание. В подробностях — только счёт по отметкам: значения прислал
 * отправитель.
 */
export var senderFacts = (
  payments: readonly ReconciledPayment[],
  params: Readonly<Record<string, number>>
): CheckResult =>
  ((checked) =>
    ((results) =>
      ((mismatched, detail) =>
        mismatched > (params.count ?? 0)
          ? _result('warning', 'mismatch', mismatched, detail)
          : _result('ok', null, mismatched, detail))(
        results.filter((_) => _.some((mark) => !mark.match)).length,
        {
          checked: checked.length,
          mismatched: results.filter((_) => _.some((mark) => !mark.match))
            .length,
          marks: Object.fromEntries(
            RECONCILE_MARKS.flatMap((mark) =>
              ((found) =>
                found.length === 0
                  ? []
                  : [
                      [
                        mark,
                        {
                          checked: found.length,
                          mismatched: found.filter((_) => !_.match).length,
                        },
                      ],
                    ])(results.flat().filter((_) => _.mark === mark))
            )
          ),
        }
      ))(
      checked.map((payment) =>
        (Object.keys(payment.sent) as ReconcileMark[]).map((mark) => ({
          mark,
          match: _MATCHES[mark](
            payment.sent[mark],
            payment.facts as PaymentFacts
          ),
        }))
      )
    ))(
    payments.filter((_) => _.facts !== null && Object.keys(_.sent).length > 0)
  );

// --- Сверка с выпиской ---------------------------------------------------------------------------------------

/** Выписка месяца по валюте рядом с выручкой сайта; доля расхождения — от суммы выписки. */
export type StatementCount = {
  readonly currency: string;
  readonly fees: StatementFees;
  readonly statement: number;
  readonly site: number;
  readonly share: number;
};

/**
 * «Сверка с выпиской» за месяц: по каждой валюте выписки выручка сайта (`site` — до или после комиссии, как у
 * выписки) расходится больше `tolerance` % от выписки — сбой; выписок за месяц нет к сроку — замечание.
 */
export var statementMatches = (
  statements: readonly Statement[],
  site: (statement: Statement) => number,
  params: Readonly<Record<string, number>>
): CheckResult =>
  statements.length === 0
    ? _result('warning', 'no_statement')
    : ((currencies, tolerance) =>
        ((worst) =>
          worst === 0
            ? _result('ok', null, 0, { currencies, tolerance })
            : _result('failure', 'mismatch', worst, { currencies, tolerance }))(
          currencies.reduce(
            (worst, _) =>
              _.share > tolerance ? Math.max(worst, _.share) : worst,
            0
          )
        ))(
        statements.map(
          (statement): StatementCount =>
            ((amount) => ({
              currency: statement.currency,
              fees: statement.fees,
              statement: statement.amount,
              site: amount,
              share: _share(
                Math.abs(amount - statement.amount),
                Math.abs(statement.amount)
              ),
            }))(site(statement))
        ),
        params.tolerance ?? 1
      );

// --- Свои пороговые ------------------------------------------------------------------------------------------

/** Первые сутки периода своей: `days` суток пояса отчётов, кончая сутками проверки. */
export var ruleFrom = (rule: ThresholdRule, day: Day): Day =>
  addDays(day, 1 - rule.days);

/** Значение показателя за период или причина «нет данных»: счёт посещений выключен, люди пересчитываются. */
export type Measured = { readonly value: number } | { readonly reason: string };

/**
 * Своя пороговая за сутки D: показатель за период против порога — `lt` срабатывает ниже порога, `gt` — выше;
 * сработала — состояние по важности правила. В подробностях — правило и период, без данных людей.
 */
export var thresholdCheck = (
  rule: ThresholdRule,
  measured: Measured,
  day: Day
): CheckResult =>
  ((detail) =>
    'reason' in measured
      ? _result('no_data', measured.reason, null, detail)
      : (
            rule.compare === 'lt'
              ? measured.value < rule.threshold
              : measured.value > rule.threshold
          )
        ? _result(
            rule.severity,
            rule.compare === 'lt' ? 'below' : 'above',
            measured.value,
            detail
          )
        : _result('ok', null, measured.value, detail))({
    metric: rule.metric,
    compare: rule.compare,
    threshold: rule.threshold,
    days: rule.days,
    from: ruleFrom(rule, day),
    currency: rule.currency,
  });

// --- Эпизоды и уведомления -----------------------------------------------------------------------------------

const _ALERTS: Readonly<Record<CheckNotify, readonly CheckState[]>> = {
  failure: ['failure'],
  any: ['failure', 'warning'],
  off: [],
};

/** Уведомляют ли о строке: состояние не ниже «уведомлять» проверки и не снято. */
export var alerting = (
  row: CheckDay | undefined,
  notify: CheckNotify
): row is CheckDay =>
  row !== undefined &&
  row.resolution === null &&
  _ALERTS[notify].includes(row.state);

/** Что такт решил по паре «проверка, отправитель»: уведомить, напомнить, «снова в порядке». */
export type QualityDecision =
  | {
      readonly kind: 'alert' | 'remind';
      readonly row: CheckDay;
      /** Первый день эпизода. */
      readonly episode: Day;
    }
  | {
      readonly kind: 'recovered';
      /** Строка, с которой ушло уведомление эпизода. */
      readonly row: CheckDay;
      readonly episode: Day;
    };

const _episodeStart = (
  byDay: ReadonlyMap<Day, CheckDay>,
  day: Day,
  notify: CheckNotify,
  clock: CheckClock
): Day =>
  alerting(byDay.get(previousDay(clock, day)), notify)
    ? _episodeStart(byDay, previousDay(clock, day), notify, clock)
    : day;

const _between = (rows: readonly CheckDay[], from: Day, to: Day): CheckDay[] =>
  rows.filter((_) => _.day >= from && _.day <= to);

/**
 * Решение по паре: строки пары (не тестовые), `D*`, «уведомлять» и «сейчас». Уведомление — о `D*` в состоянии,
 * о котором уведомляют, если в эпизоде ещё не уведомляли; напоминание — если последнее ушло 7 и больше суток
 * назад, и той же строкой `D*`; не больше одного в сутки. «Снова в порядке» — раз, когда строки эпизода больше не в таком состоянии
 * и хотя бы одна из них стала «в порядке» перепроверкой, а не снятием. У месячной эпизод идёт по месяцам.
 */
export var decide = (
  rows: readonly CheckDay[],
  dStar: Day,
  notify: CheckNotify,
  now: string,
  clock: CheckClock = 'utc'
): QualityDecision | null =>
  ((byDay, recent) =>
    ((current) =>
      alerting(current, notify)
        ? ((episode) =>
            ((notified) =>
              // Уже отмеченная строка D* (у месячной она — весь месяц) получает только напоминание.
              recent
                ? null
                : notified.length === 0
                  ? { kind: 'alert' as const, row: current, episode }
                  : Date.parse(now) -
                        Math.max(
                          ...notified.map((_) =>
                            Date.parse(_.notifiedAt as string)
                          )
                        ) >=
                      QUALITY_LIMITS.remindDays * _DAY_MS
                    ? { kind: 'remind' as const, row: current, episode }
                    : null)(
              _between(rows, episode, dStar).filter(
                (_) => _.notifiedAt !== null
              )
            ))(_episodeStart(byDay, dStar, notify, clock))
        : ((last) =>
            last === undefined ||
            last.recoveredAt !== null ||
            last.episode === null
              ? null
              : ((episode) =>
                  _between(rows, episode, dStar).some((_) =>
                    alerting(_, notify)
                  ) ||
                  !_between(rows, episode, last.day).some(
                    (_) => _.state === 'ok'
                  )
                    ? null
                    : { kind: 'recovered' as const, row: last, episode })(
                  last.episode
                ))(
            rows.findLast((_) => _.notifiedAt !== null && _.day <= dStar)
          ))(byDay.get(dStar)))(
    new Map(rows.map((_) => [_.day, _])),
    rows.some(
      (_) =>
        _.notifiedAt !== null &&
        Date.parse(now) - Date.parse(_.notifiedAt) < _DAY_MS
    )
  );

/**
 * Пока идёт подключение — молча: у сайта нет ни одной не тестовой сводки и с первого принятого не тестового
 * события не прошло 7 суток.
 */
export var connecting = (
  now: string,
  firstEvent: string | null,
  summaries: boolean
): boolean =>
  !summaries &&
  (firstEvent === null ||
    Date.parse(now) - Date.parse(firstEvent) <
      QUALITY_LIMITS.quietDays * _DAY_MS);

/**
 * Сошёлся ли счёт за сутки — для отметки смены версии: «События дошли» в порядке и «Выручка сходится» в
 * порядке или без выручки — да; сбой хоть одной — нет; иначе null.
 */
export var matchedOf =
  (rows: readonly CheckDay[]) =>
  (sender: string, day: Day): boolean | null =>
    ((events, revenue) =>
      events?.state === 'failure' || revenue?.state === 'failure'
        ? false
        : events?.state === 'ok' &&
            (revenue === undefined ||
              revenue.state === 'ok' ||
              revenue.state === 'no_data')
          ? true
          : null)(
      rows.find(
        (_) =>
          _.check === 'events_arrived' &&
          _.scope === sender &&
          !_.test &&
          _.day === day
      ),
      rows.find(
        (_) =>
          _.check === 'revenue_matches' &&
          _.scope === sender &&
          !_.test &&
          _.day === day
      )
    );

/** Заметка снятия: 1–500 знаков после обрезки пробелов. */
export var resolutionNote = (raw: unknown): string =>
  ((note) =>
    note.length >= 1 && [...note].length <= QUALITY_LIMITS.note
      ? note
      : fail(
          'analytics.invalid_note',
          `A note of 1 to ${QUALITY_LIMITS.note} characters says why the check is resolved`
        ))(typeof raw === 'string' ? raw.trim() : '');
