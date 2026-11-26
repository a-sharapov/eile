import { attempt, fail } from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS } from '../domain/codes.ts';
import {
  addDays,
  addMonths,
  type Day,
  type DayPeriod,
  dayIn,
  dayStart,
  isDay,
  monthOf,
} from '../domain/days.ts';
import { labelParts } from '../domain/labels.ts';
import {
  type CurrencyMoment,
  currencyMomentsOf,
  moneyOf,
  type PersonMoney,
} from '../domain/money.ts';
import type { Amounts, PersonFacts } from '../domain/person.ts';
import type {
  ChangedEvent,
  ErasedTally,
  IntakeTally,
  MoneyStore,
  QualityAlerts,
  QualityCursor,
  QualityStore,
  RefusalTally,
  ReportStore,
  SetupLog,
  SiteVisits,
  SummaryStore,
  Transaction,
} from '../domain/ports.ts';
import {
  allKnown,
  BUILTIN_CHECKS,
  builtinCheck,
  CHECK_CODE_LIMIT,
  type CheckClock,
  type CheckConfig,
  type CheckDay,
  type CheckKey,
  type CheckNotify,
  type CheckResult,
  type CheckScope,
  type CheckState,
  type CheckZone,
  carries,
  checkConfigs,
  checkOrder,
  clockOf,
  connecting,
  countWarning,
  type DayEvent,
  decide,
  defaultsOf,
  distinctTouches,
  eventTime,
  eventTouches,
  type IntakeSwitch,
  intakeOffOn,
  intakeRefusals,
  keyOfRow,
  labelsReadable,
  lastDue,
  linksArrive,
  type Measured,
  matchedOf,
  missingRun,
  monthDay,
  nextRow,
  paymentFacts,
  QUALITY_LIMITS,
  type QualityDecision,
  type ReconciledPayment,
  type ReconcileMark,
  ratePresent,
  resolutionNote,
  ruleFrom,
  SUMMARY_CHECKS,
  type SummaryFacts,
  senderFacts,
  statementMatches,
  summaryExpected,
  TEST_CHECKS,
  type ThresholdRule,
  type TypeFact,
  thresholdCheck,
  touchConflicts,
  unknownIn,
  zoneOf,
} from '../domain/quality.ts';
import { CHECK_NAMES, qualityNotice } from '../domain/quality-texts.ts';
import type { EventRole } from '../domain/roles.ts';
import type { AnalyticsSettings } from '../domain/settings.ts';
import {
  GO_GOAL,
  type Sender,
  type Setup,
  type SetupAuthor,
} from '../domain/setup.ts';
import {
  monthBounds,
  type Statement,
  siteRevenue,
} from '../domain/statements.ts';
import {
  latestSummaries,
  type SummaryDay,
  type VersionMark,
  versionMarks,
} from '../domain/summary.ts';
import { sumIntake, TALLY_LIMITS, utcDay } from '../domain/tally.ts';
import { queryCode, queryFlag, type UtcQuery, utcPeriod } from './query.ts';

export type QualityPorts = {
  readonly store: QualityStore;
  readonly summaries: SummaryStore;
  readonly tally: IntakeTally;
  readonly erased: ErasedTally;
  /** Отказы, которые ещё в памяти: «Отказы приёмника» читает их вместе с базой. */
  readonly refusals: RefusalTally;
  /** Люди по псевдонимам: выбранное первое касание. */
  readonly reports: ReportStore;
  readonly money: MoneyStore;
  readonly visits: SiteVisits;
  readonly setup: () => Setup;
  readonly settings: () => AnalyticsSettings;
  readonly log: SetupLog;
  readonly alerts: QualityAlerts;
  readonly transaction: Transaction;
  readonly clock: () => Date;
  /** Сколько людей ещё в пересчёте: их факты не окончательные — проверка ждёт. */
  readonly stale: () => number;
  /** Ошибка проверки одной пары — в журнал сервера; остальные идут своим ходом. */
  readonly failed: (error: unknown) => void;
};

/** Ячейка сетки: строка дня без подробностей. */
export type QualityCell = {
  readonly day: Day;
  readonly state: CheckState;
  readonly reason: string | null;
  readonly value: number | null;
  readonly resolved: {
    readonly at: string;
    readonly by: string;
    readonly agent: boolean;
    readonly note: string;
  } | null;
  readonly notified: boolean;
};

/** Строка сетки: проверка у отправителя или сайта, последний наступивший день, последний успех, ячейки. */
export type QualityRow = {
  readonly check: string;
  /** Отправитель; null — сайт. */
  readonly scope: string | null;
  readonly test: boolean;
  readonly zone: CheckZone;
  /** Последний наступивший день и его состояние; null — строк ещё нет. */
  readonly day: Day | null;
  readonly state: CheckState | null;
  readonly lastOk: Day | null;
  readonly cells: readonly QualityCell[];
};

/** Проверка для экрана и агента: встроенная — с порогами ядра рядом с действующими, своя — с правилом. */
export type CheckView = {
  readonly code: string;
  readonly builtin: boolean;
  /** У встроенной пусто: название — ядра, на языке менеджера; у своей — владельца. */
  readonly name: string;
  readonly note: string;
  readonly zone: CheckZone;
  /** null — не по расписанию: пороги «мало данных». */
  readonly scope: CheckScope | null;
  readonly enabled: boolean;
  readonly notify: CheckNotify;
  /** Действующие пороги встроенной (поправка поверх значений ядра) или правило своей. */
  readonly params: Readonly<Record<string, number>> | ThresholdRule;
  /** Пороги ядра; у своей — null. */
  readonly defaults: Readonly<Record<string, number>> | null;
  /** Есть ли поправка: её удаление возвращает значения ядра; у своей — false. */
  readonly corrected: boolean;
  readonly archivedAt: string | null;
};

/** Сверка сводки за сутки: типы, валюты, неотправленные и версия — из строк дня проверок сводки. */
export type SummaryCheck = {
  readonly sender: string;
  readonly day: Day;
  readonly test: boolean;
  readonly types: readonly {
    readonly type: string;
    /** null — тип незнаком настройке: его код — текст отправителя. */
    readonly name: string | null;
    readonly summary: number;
    readonly site: number;
    readonly erased: number;
    readonly missing: number;
  }[];
  readonly currencies: readonly {
    readonly currency: string;
    readonly summary: number;
    readonly site: number;
  }[];
  readonly failed: number | null;
  readonly version: string | null;
};

export type QualityReport = {
  readonly asOf: string;
  readonly from: Day;
  readonly to: Day;
  readonly timeZone: string;
  /** Есть ли каналы сбоев: без них уведомления не уходят. */
  readonly channels: boolean;
  readonly checks: readonly CheckView[];
  readonly rows: readonly QualityRow[];
  /** С `detail` — сверка сводок за последние 7 суток со строками у отправителя. */
  readonly summaries?: readonly SummaryCheck[];
  /** С `detail` — замечания и сбои периода с подробностями. */
  readonly open?: readonly CheckDayView[];
  /** С `detail` — смены версий отправителей в периоде. */
  readonly versions?: readonly VersionMark[];
};

/** Строка дня с подробностями: у проверок сводки — и сама сводка. */
export type CheckDayView = QualityCell & {
  readonly check: string;
  readonly scope: string | null;
  readonly test: boolean;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly version: string | null;
  readonly evaluatedAt: string;
  readonly summary: SummaryDay | null;
};

/** Нерешённое в последний наступивший день — для отметки в меню. */
export type QualityStatus = {
  readonly failures: number;
  readonly warnings: number;
  readonly day: Day | null;
};

export type QualityQuery = UtcQuery & {
  readonly check?: unknown;
  readonly sender?: unknown;
  readonly test?: unknown;
  /** Сверка сводок рядом с сеткой — для агента. */
  readonly detail?: unknown;
};

/** Что перепроверить сейчас: проверка, сутки, отправитель; не задано — все. */
export type RunQuery = {
  readonly check?: unknown;
  readonly day?: unknown;
  readonly scope?: unknown;
};

/** Строка дня по ссылке: проверка, сутки, отправитель (у проверки сайта — нет), тестовая ли. */
export type CheckRef = {
  readonly check: unknown;
  readonly day: unknown;
  readonly scope?: unknown;
  readonly test?: unknown;
};

export type QualityTick = {
  /** Сколько шагов прошёл такт. */
  readonly steps: number;
  /** Ушло ли сообщение. */
  readonly notified: boolean;
};

// Пара «проверка, отправитель»: по ней пишутся строки дней и решается уведомление.
type _Pair = {
  readonly config: CheckConfig;
  readonly clock: CheckClock;
  readonly scope: string;
  readonly test: boolean;
  /** Первые сутки, с которых у пары бывают строки; null — строк нет. */
  readonly start: Day | null;
  /** Последний наступивший день. */
  readonly last: Day;
  /** Только эти сутки — тестовые сводки; null — все. */
  readonly days: ReadonlySet<Day> | null;
};

type _Context = {
  readonly now: string;
  readonly setup: Setup;
  readonly settings: AnalyticsSettings;
  readonly zone: string;
  readonly configs: readonly CheckConfig[];
  readonly summaries: ReadonlyMap<string, readonly SummaryDay[]>;
  readonly switches: readonly IntakeSwitch[];
  /** С каких суток у отправителя (`''` — у сайта) есть события или счёт приёма. */
  readonly starts: ReadonlyMap<string, Day | null>;
  readonly role: (sender: string, type: string) => EventRole | null;
  /** События суток UTC: шаги одних суток читают их раз. */
  readonly day: (day: Day) => readonly DayEvent[];
  /** Деньги людей с суммами: «Курс есть», выписки и свои по выручке читают их раз на такт. */
  readonly ledger: () => readonly PersonMoney[];
  /** Моменты денег людей и строк расхода по валютам — из тех же денег людей. */
  readonly moments: () => readonly CurrencyMoment[];
  readonly statements: () => readonly Statement[];
};

type _Step = {
  readonly kind: 'sender' | 'site' | 'report' | 'month';
  readonly scope: string;
  readonly day: Day;
  readonly pairs: readonly _Pair[];
};

type _Plan = {
  readonly ctx: _Context;
  readonly pairs: readonly _Pair[];
  readonly steps: readonly _Step[];
  readonly cursor: QualityCursor;
  readonly notify: boolean;
  readonly failed: boolean;
};

const _DAY_MS = 86_400_000;

// Сводки до окна такта: первая сводка отправителя и сутки подряд без сводки — не дальше срока счёта приёма.
const _LOOKBACK_DAYS = TALLY_LIMITS.intakeDays;

// Для решений об уведомлении — строки пары за столько суток до D*: эпизод длиннее — от его первого дня.
const _EPISODE_DAYS = 60;

const _AGENT_SUMMARIES = 7;

const _ROLES_OF_MONEY: Readonly<Partial<Record<EventRole, number>>> = {
  payment: 1,
  refund: -1,
};

const _bounds = (day: Day) => ({
  from: `${day}T00:00:00.000Z`,
  to: `${addDays(day, 1)}T00:00:00.000Z`,
});

const _active = (sender: Sender): boolean =>
  sender.enabled && sender.archivedAt === null;

const _isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _byCount = (items: readonly string[]): Readonly<Record<string, number>> =>
  items.reduce<Record<string, number>>(
    (all, _) => ({ ...all, [_]: (all[_] ?? 0) + 1 }),
    {}
  );

const _min = (days: readonly (Day | null)[]): Day | null =>
  days.filter((_): _ is Day => _ !== null).toSorted()[0] ?? null;

const _later = (a: Day, b: Day): Day => (a > b ? a : b);

const _cell = (row: CheckDay): QualityCell => ({
  day: row.day,
  state: row.state,
  reason: row.reason,
  value: row.value,
  resolved: row.resolution,
  notified: row.notifiedAt !== null,
});

/** Проверки для экрана и агента: встроенные с поправками по порядку ядра, за ними свои — и в архиве. */
export var checkViews = (setup: Setup): CheckView[] =>
  checkConfigs(setup).map((_) =>
    _.rule === null
      ? {
          code: _.spec.code,
          builtin: true,
          name: '',
          note: _.correction?.note ?? '',
          zone: _.spec.clock === null ? 'report' : zoneOf(_.spec.clock),
          scope: _.spec.scope,
          enabled: _.enabled,
          notify: _.notify,
          params: _.params,
          defaults: defaultsOf(_.spec),
          corrected: _.correction !== null,
          archivedAt: null,
        }
      : {
          code: _.spec.code,
          builtin: false,
          name: _.correction?.name ?? '',
          note: _.correction?.note ?? '',
          zone: 'report',
          scope: 'site',
          enabled: _.correction?.enabled ?? true,
          notify: _.notify,
          params: _.rule,
          defaults: null,
          corrected: false,
          archivedAt: _.correction?.archivedAt ?? null,
        }
  );

/**
 * Проверки данных (ADR 0072, этап 4): такт по шагам — наступившие, «грязные» и изменившиеся сутки, строки дней,
 * уведомление одним сообщением через порт `alerts`; перепроверка выбранных суток без уведомлений, снятие
 * вручную, отчёт, день и статус. Пишет строки дней только такт сервера и «Проверить заново».
 */
export var defineQuality = ({
  store,
  summaries,
  tally,
  erased,
  refusals,
  reports,
  money,
  visits,
  setup,
  settings,
  log,
  alerts,
  transaction,
  clock,
  stale,
  failed,
}: QualityPorts) => {
  let plan: _Plan | null = null;
  // Что такт видел в прошлый раз: последние наступившие дни, каналы, первый ли такт процесса.
  let signature = '';
  let ready = false;
  let fresh = true;
  // Строка ждёт конца пересчёта людей: такт вернётся к ней, когда пересчёт кончится.
  let waiting = false;

  const now = (): string => clock().toISOString();

  const summariesOf = (snapshot: Setup, since: string) =>
    new Map(
      snapshot.senders.map((sender) => [
        sender.code,
        latestSummaries(
          snapshot.types
            .filter((_) => _.role === 'summary' && _.sender === sender.code)
            .flatMap((_) => summaries.events(sender.code, _.code, since))
        ),
      ])
    );

  // Деньги людей и строки расхода: строка расхода — моментом начала своего месяца в поясе отчётов.
  const momentsOf = (ledger: readonly PersonMoney[], zone: string) => [
    ...currencyMomentsOf(ledger),
    ...money.spend(null, null).map((row) => ({
      currency: row.currency,
      at: dayStart(`${row.month}-01`, zone),
    })),
  ];

  const context = (at: string, snapshot: Setup): _Context => {
    const zone = visits.timeZone();
    let cached: { day: Day; events: readonly DayEvent[] } | null = null;
    let ledger: readonly PersonMoney[] | null = null;
    let moments: readonly CurrencyMoment[] | null = null;
    let statements: readonly Statement[] | null = null;
    const roles = new Map(
      snapshot.types.map((_) => [`${_.sender}/${_.code}`, _.role])
    );
    return {
      now: at,
      setup: snapshot,
      settings: settings(),
      zone,
      configs: checkConfigs(snapshot),
      summaries: summariesOf(
        snapshot,
        `${addDays(utcDay(at), -QUALITY_LIMITS.dirtyDays - _LOOKBACK_DAYS)}T00:00:00.000Z`
      ),
      switches: store.switches(),
      starts: ((site) =>
        new Map<string, Day | null>([
          ['', site],
          // Отправитель, который что-то присылал, — с суток сайта; не присылавший ничего — без строк.
          ...snapshot.senders.map((_): [string, Day | null] => [
            _.code,
            ((own) => (own === null ? null : _min([own, site])))(
              store.started(_.code)
            ),
          ]),
        ]))(store.started(null)),
      role: (sender, type) => roles.get(`${sender}/${type}`) ?? null,
      day: (day) =>
        cached !== null && cached.day === day
          ? cached.events
          : ((events) => ((cached = { day, events }), events))(
              ((bounds) => store.events(bounds.from, bounds.to))(_bounds(day))
            ),
      ledger: () => (ledger ??= money.ledger()),
      moments: () => (moments ??= momentsOf((ledger ??= money.ledger()), zone)),
      statements: () => (statements ??= money.statements(null, null)),
    };
  };

  // Пары проверок по нынешней настройке: включённые проверки, действующие отправители.
  const pairsOf = (ctx: _Context): _Pair[] =>
    ((active) =>
      active.length === 0
        ? []
        : ctx.configs
            .filter((_) => _.enabled && _.spec.clock !== null)
            .flatMap((config): _Pair[] =>
              ((clock) =>
                config.spec.scope === 'site'
                  ? [
                      {
                        config,
                        clock,
                        scope: '',
                        test: false,
                        // Месячная — с первого месяца сайта, строкой первого дня месяца.
                        start: ((start) =>
                          start === null || clock !== 'month'
                            ? start
                            : monthDay(monthOf(start)))(
                          ctx.starts.get('') ?? null
                        ),
                        last: lastDue(clock, ctx.now, null, ctx.zone),
                        days: null,
                      },
                    ]
                  : clock === 'summary'
                    ? active
                        .filter(
                          (sender) =>
                            sender.summaryAt !== null &&
                            ctx.setup.types.some(
                              (_) =>
                                _.sender === sender.code && _.role === 'summary'
                            )
                        )
                        .flatMap((sender) =>
                          ((found, last) =>
                            ((real, test) => [
                              {
                                config,
                                clock,
                                scope: sender.code,
                                test: false,
                                // До первой сводки отправителя строк нет: первая включает проверки с её дня.
                                start: _min(real.map((_) => _.day)),
                                last,
                                days: null,
                              },
                              ...(TEST_CHECKS.includes(config.spec.code) &&
                              test.length > 0
                                ? [
                                    {
                                      config,
                                      clock,
                                      scope: sender.code,
                                      test: true,
                                      start: _min(test.map((_) => _.day)),
                                      last,
                                      days: new Set(test.map((_) => _.day)),
                                    },
                                  ]
                                : []),
                            ])(
                              found.filter((_) => !_.test),
                              found.filter((_) => _.test)
                            ))(
                            ctx.summaries.get(sender.code) ?? [],
                            lastDue(clock, ctx.now, sender.summaryAt, ctx.zone)
                          )
                        )
                    : active
                        // Счёт отправителя — только у того, у чьих типов оплаты есть свойство с отметкой сверки.
                        .filter(
                          (sender) =>
                            config.spec.code !== 'sender_facts' ||
                            marksOf(ctx, sender.code).size > 0
                        )
                        .map((sender) => ({
                          config,
                          clock,
                          scope: sender.code,
                          test: false,
                          start: ctx.starts.get(sender.code) ?? null,
                          last: lastDue(clock, ctx.now, null, ctx.zone),
                          days: null,
                        })))(config.spec.clock as CheckClock)
            ))(ctx.setup.senders.filter(_active));

  // Сутки окна пары: не раньше её первых суток и не дальше `depth` суток до D*; у месячной — последние 12 месяцев.
  const windowOf = (pair: _Pair, depth: number): Day[] =>
    pair.start === null
      ? []
      : pair.clock === 'month'
        ? Array.from({ length: QUALITY_LIMITS.months }, (_, n) =>
            monthDay(
              addMonths(monthOf(pair.last), n + 1 - QUALITY_LIMITS.months)
            )
          ).filter((_) => _ >= (pair.start as Day))
        : ((first) =>
            first > pair.last
              ? []
              : Array.from(
                  {
                    length:
                      Math.round(
                        (Date.parse(`${pair.last}T00:00:00Z`) -
                          Date.parse(`${first}T00:00:00Z`)) /
                          _DAY_MS
                      ) + 1,
                  },
                  (_, n) => addDays(first, n)
                ).filter((_) => pair.days === null || pair.days.has(_)))(
            _later(pair.start, addDays(pair.last, 1 - depth))
          );

  // --- Факты проверок ---------------------------------------------------------------------------------------

  const typesOf = (ctx: _Context, sender: string): Map<string, TypeFact> =>
    new Map(
      ctx.setup.types
        .filter((_) => _.sender === sender)
        .map((_) => [_.code, { name: _.name, role: _.role }])
    );

  // `events` false — сверке сводки события суток не нужны («Сводка пришла»): их чтение не роняет её строку.
  const summaryFacts = (
    ctx: _Context,
    sender: string,
    test: boolean,
    day: Day,
    events = true
  ): SummaryFacts =>
    ((found, events) => ({
      summary: found.find((_) => _.day === day && _.test === test) ?? null,
      expected: summaryExpected(
        day,
        ctx.setup.senders.find((_) => _.code === sender)?.summaryAt ?? '06:00'
      ),
      missingDays: ((days) => missingRun(days, day, _min([...days]) ?? day))(
        new Set(found.filter((_) => _.test === test).map((_) => _.day))
      ),
      intakeOff: intakeOffOn(ctx.switches, day, ctx.settings.enabled),
      site: _byCount(events.map((_) => _.type)),
      erased: Object.fromEntries(
        erased
          .daily(day, day)
          .filter((_) => _.sender === sender && _.test === test)
          .map((_) => [_.type, _.events])
      ),
      revenue: events.reduce<Amounts>(
        (sum, event) =>
          ((sign, data) =>
            sign === undefined ||
            data === null ||
            typeof data.currency !== 'string'
              ? sum
              : ((amount) =>
                  amount === null
                    ? sum
                    : {
                        ...sum,
                        [data.currency as string]:
                          (sum[data.currency as string] ?? 0) + sign * amount,
                      })(moneyOf(data.amount, data.currency as string)))(
            _ROLES_OF_MONEY[ctx.role(sender, event.type) as EventRole],
            _isRecord(event.body.data) ? event.body.data : null
          ),
        {}
      ),
      types: typesOf(ctx, sender),
    }))(
      ctx.summaries.get(sender) ?? [],
      events
        ? ctx.day(day).filter((_) => _.sender === sender && _.test === test)
        : []
    );

  const intakeRows = (day: Day) =>
    sumIntake([
      ...tally.daily(day, day),
      ...refusals.pending().filter((_) => _.day === day),
    ]);

  const real = (ctx: _Context, day: Day): readonly DayEvent[] =>
    ctx.day(day).filter((_) => !_.test);

  const duplicates = (ctx: _Context, day: Day): Record<string, number> =>
    ((payments) =>
      Object.fromEntries(
        Object.entries(
          Object.groupBy(
            payments.filter((payment) =>
              store
                .payments(payment.sender, payment.id)
                .some(
                  (_) =>
                    _.seq !== payment.seq &&
                    !_.test &&
                    ctx.role(payment.sender, _.type) === 'payment'
                )
            ),
            (_) => _.sender
          )
        ).map(({ 0: sender, 1: found }) => [
          sender,
          new Set((found ?? []).map((_) => _.id)).size,
        ])
      ))(
      real(ctx, day).flatMap((event) =>
        ctx.role(event.sender, event.type) === 'payment' &&
        _isRecord(event.body.data) &&
        typeof event.body.data.payment_id === 'string'
          ? [
              {
                sender: event.sender,
                seq: event.seq,
                id: event.body.data.payment_id,
              },
            ]
          : []
      )
    );

  const touchesChanged = (ctx: _Context, day: Day): Record<string, number> =>
    ((events) =>
      ((chosen) =>
        Object.fromEntries(
          [...new Set(events.map((_) => _.sender))]
            .map((sender): [string, number] => [
              sender,
              touchConflicts(
                events.filter((_) => _.sender === sender),
                chosen
              ),
            ])
            .filter(({ 1: count }) => count > 0)
        ))(
        new Map(
          reports
            .facts([
              ...new Set(
                events
                  .map((_) => _.subject)
                  .filter((_): _ is string => _ !== null)
              ),
            ])
            .map((_) => [_.subject, _.firstTouch])
        )
      ))(real(ctx, day).filter((_) => _.body.first_touch !== undefined));

  const linkCounts = (ctx: _Context, day: Day) =>
    ((from, to) =>
      ((events) =>
        ctx.setup.links
          .filter(
            (_) => _.archivedAt === null && Object.keys(_.parts).length > 0
          )
          .map((link) =>
            ((schema) => ({
              link: link.code,
              goals: visits.sums(
                { from: day, to: day },
                { goal: `${GO_GOAL}${link.code}` }
              ).total,
              people: new Set(
                distinctTouches(
                  events
                    .filter((_) => _.sender === link.sender)
                    .flatMap((_) => eventTouches(_, ctx.role(_.sender, _.type)))
                )
                  .filter(
                    (_) =>
                      _.subject !== null &&
                      _.at >= from &&
                      _.at < to &&
                      schema !== null &&
                      carries(labelParts(schema, _.label), link.parts)
                  )
                  .map((_) => _.subject)
              ).size,
            }))(ctx.setup.schemas.find((_) => _.sender === link.sender) ?? null)
          ))(store.events(from, to).filter((_) => !_.test)))(
      dayStart(day, ctx.zone),
      dayStart(addDays(day, 1), ctx.zone)
    );

  // Свойства с отметкой сверки у типов оплаты отправителя: код типа → пары «свойство, отметка».
  const marksOf = (
    ctx: _Context,
    sender: string
  ): ReadonlyMap<string, readonly (readonly [string, ReconcileMark])[]> =>
    ((marked) =>
      new Map(
        ctx.setup.types
          .filter((_) => _.sender === sender && _.role === 'payment')
          .flatMap((type) =>
            ((found) =>
              found.length === 0 ? [] : [[type.code, found] as const])(
              type.properties.flatMap((_) =>
                ((mark) =>
                  mark === undefined ? [] : [[_.code, mark] as const])(
                  marked.get(_.code)
                )
              )
            )
          )
      ))(
      new Map(
        ctx.setup.properties
          .filter((_) => _.scope === 'event' && _.reconcile !== null)
          .map((_) => [_.code, _.reconcile as ReconcileMark])
      )
    );

  // Оплаты отправителя за сутки UTC с отметками сверки: присланное и факты людей из таблицы людей.
  const reconciled = (
    ctx: _Context,
    sender: string,
    day: Day
  ): ReconciledPayment[] =>
    ((marks, events) =>
      ((payments) =>
        ((people) =>
          payments.map((event) => ({
            sent: Object.fromEntries(
              (marks.get(event.type) ?? []).flatMap(
                ({ 0: property, 1: mark }) =>
                  ((data) =>
                    data === null ||
                    data[property] === undefined ||
                    data[property] === null
                      ? []
                      : [[mark, data[property]]])(
                    _isRecord(event.body.data) ? event.body.data : null
                  )
              )
            ),
            facts: ((person) =>
              person === undefined
                ? null
                : paymentFacts(
                    person,
                    event.at,
                    events.filter(
                      (_) =>
                        _.subject === event.subject &&
                        _.at === event.at &&
                        _.seq < event.seq &&
                        ctx.role(_.sender, _.type) === 'payment'
                    ).length
                  ))(people.get(event.subject as string)),
          })))(
          new Map<string, PersonFacts>(
            (payments.length === 0
              ? []
              : reports.facts([
                  ...new Set(payments.map((_) => _.subject as string)),
                ])
            ).map((_) => [_.subject, _])
          )
        ))(
        marks.size === 0
          ? []
          : events.filter(
              (_) =>
                _.sender === sender && _.subject !== null && marks.has(_.type)
            )
      ))(marksOf(ctx, sender), real(ctx, day));

  const _STALE: CheckResult = {
    state: 'no_data',
    reason: 'stale',
    value: null,
    detail: {},
    version: null,
  };

  // Показатель своей пороговой за период пояса отчётов; люди и деньги — из таблицы людей, ждут пересчёта.
  const _MEASURE: Readonly<
    Record<
      ThresholdRule['metric'],
      (
        ctx: _Context,
        rule: ThresholdRule,
        bounds: { readonly from: string; readonly to: string },
        period: DayPeriod
      ) => Measured
    >
  > = {
    events: (_ctx, rule, bounds) => ({
      value: store.count(
        rule.sender as string,
        rule.type as string,
        bounds.from,
        bounds.to
      ),
    }),
    role: (ctx, rule, bounds) => ({
      value: ctx.setup.types
        .filter(
          (_) =>
            _.role === rule.role &&
            (rule.sender === null || _.sender === rule.sender)
        )
        .reduce(
          (sum, _) =>
            sum + store.count(_.sender, _.code, bounds.from, bounds.to),
          0
        ),
    }),
    people: (_ctx, _rule, bounds) =>
      stale() > 0
        ? { reason: 'stale' }
        : { value: store.arrivals(bounds.from, bounds.to) },
    customers: (_ctx, _rule, bounds) =>
      stale() > 0
        ? { reason: 'stale' }
        : { value: store.firstPayments(bounds.from, bounds.to) },
    revenue: (ctx, rule, bounds) =>
      stale() > 0
        ? { reason: 'stale' }
        : {
            value: siteRevenue(
              ctx.ledger(),
              bounds,
              rule.currency as string,
              'gross'
            ),
          },
    visitors: (_ctx, _rule, _bounds, period) =>
      visits.enabled()
        ? { value: visits.sums(period).total }
        : { reason: 'stats_off' },
    goal: (_ctx, rule, _bounds, period) =>
      visits.enabled()
        ? { value: visits.sums(period, { goal: rule.goal as string }).total }
        : { reason: 'stats_off' },
  };

  const thresholdOf = (
    ctx: _Context,
    rule: ThresholdRule,
    day: Day
  ): CheckResult =>
    ((period) =>
      thresholdCheck(
        rule,
        _MEASURE[rule.metric](
          ctx,
          rule,
          {
            from: dayStart(period.from, ctx.zone),
            to: dayStart(addDays(period.to, 1), ctx.zone),
          },
          period
        ),
        day
      ))({ from: ruleFrom(rule, day), to: day });

  const _EVALUATE: Readonly<
    Record<string, (ctx: _Context, pair: _Pair, day: Day) => CheckResult>
  > = {
    summary_arrived: (ctx, pair, day) =>
      SUMMARY_CHECKS.summary_arrived(
        summaryFacts(ctx, pair.scope, pair.test, day, false),
        pair.config.params
      ),
    events_arrived: (ctx, pair, day) =>
      SUMMARY_CHECKS.events_arrived(
        summaryFacts(ctx, pair.scope, pair.test, day),
        pair.config.params
      ),
    revenue_matches: (ctx, pair, day) =>
      SUMMARY_CHECKS.revenue_matches(
        summaryFacts(ctx, pair.scope, pair.test, day),
        pair.config.params
      ),
    sender_delivered: (ctx, pair, day) =>
      SUMMARY_CHECKS.sender_delivered(
        summaryFacts(ctx, pair.scope, pair.test, day, false),
        pair.config.params
      ),
    sender_facts: (ctx, pair, day) =>
      stale() > 0
        ? _STALE
        : senderFacts(reconciled(ctx, pair.scope, day), pair.config.params),
    labels_readable: (ctx, pair, day) =>
      labelsReadable(
        distinctTouches(
          real(ctx, day)
            .filter((_) => _.sender === pair.scope)
            .flatMap((_) => eventTouches(_, ctx.role(_.sender, _.type)))
        ).map((_) => _.label),
        ctx.setup.schemas.find((_) => _.sender === pair.scope) ?? null,
        pair.config.params
      ),
    intake_refusals: (ctx, pair, day) =>
      intakeRefusals(
        intakeRows(day),
        new Set(ctx.setup.senders.map((_) => _.code)),
        pair.config.params
      ),
    repeat_conflicts: (_ctx, pair, day) =>
      ((bounds) =>
        countWarning(
          Object.fromEntries(
            store
              .conflicts(bounds.from, bounds.to)
              .map((_) => [_.sender, _.count])
          ),
          'conflicts',
          pair.config.params
        ))(_bounds(day)),
    payment_duplicates: (ctx, pair, day) =>
      countWarning(duplicates(ctx, day), 'duplicates', pair.config.params),
    first_touch_stable: (ctx, pair, day) =>
      stale() > 0
        ? _STALE
        : countWarning(touchesChanged(ctx, day), 'changed', pair.config.params),
    event_time: (_ctx, pair, day) =>
      eventTime(intakeRows(day), pair.config.params),
    all_known: (ctx, pair, day) =>
      allKnown(
        real(ctx, day).map((_) =>
          unknownIn(_, ctx.setup, ctx.role(_.sender, _.type))
        ),
        pair.config.params
      ),
    links_arrive: (ctx, pair, day) =>
      linksArrive(
        visits.enabled(),
        visits.enabled() ? linkCounts(ctx, day) : [],
        pair.config.params
      ),
    rate_present: (ctx, pair, day) =>
      stale() > 0
        ? _STALE
        : ratePresent(
            ctx.settings.baseCurrency,
            ctx.settings.baseCurrency === null ? [] : ctx.moments(),
            ctx.settings.baseCurrency === null ? [] : money.rates(),
            day,
            ctx.zone,
            pair.config.params
          ),
    // Выручка сайта за месяц пояса — деньги людей по моменту, как в выписке: до или после комиссии.
    statement_matches: (ctx, pair, day) =>
      stale() > 0
        ? _STALE
        : ((month) =>
            ((bounds) =>
              statementMatches(
                ctx.statements().filter((_) => _.month === month),
                (statement) =>
                  siteRevenue(
                    ctx.ledger(),
                    bounds,
                    statement.currency,
                    statement.fees
                  ),
                pair.config.params
              ))(monthBounds(month, ctx.zone)))(monthOf(day)),
  };

  const evaluate = (ctx: _Context, pair: _Pair, day: Day): CheckResult =>
    pair.config.rule === null
      ? (_EVALUATE[pair.config.spec.code] as (typeof _EVALUATE)[string])(
          ctx,
          pair,
          day
        )
      : thresholdOf(ctx, pair.config.rule, day);

  const keyOf = (pair: _Pair, day: Day): CheckKey => ({
    check: pair.config.spec.code,
    scope: pair.scope,
    test: pair.test,
    day,
  });

  // Шаг: проверки одних суток читают вне транзакции, строки пишут одной короткой; ошибка проверки одной пары
  // пишется в журнал сервера и не останавливает остальные. Ответ — все ли прошли.
  const runStep = (ctx: _Context, step: _Step): boolean =>
    ((results) =>
      attempt(
        () => (
          transaction(() =>
            results.forEach(
              (_) =>
                void (
                  _ !== null &&
                  store.put(nextRow(store.row(_.key), _.key, _.result, ctx.now))
                )
            )
          ),
          void (
            results.some((_) => _?.result.reason === 'stale') &&
            (waiting = true)
          ),
          results.every((_) => _ !== null)
        ),
        (error) => (failed(error), false)
      ))(
      step.pairs.map((pair) =>
        attempt(
          () => ({
            key: keyOf(pair, step.day),
            result: evaluate(ctx, pair, step.day),
          }),
          (error) => (failed(error), null)
        )
      )
    );

  const kindOf = (pair: _Pair): _Step['kind'] =>
    pair.clock === 'report' || pair.clock === 'month'
      ? pair.clock
      : pair.scope === ''
        ? 'site'
        : 'sender';

  // Шаги работы: сутки одного отправителя, сутки сайта UTC, сутки пояса, месяц — по порядку суток.
  const stepsOf = (work: readonly { pair: _Pair; day: Day }[]): _Step[] =>
    Object.values(
      Object.groupBy(work, (_) => `${_.day} ${kindOf(_.pair)} ${_.pair.scope}`)
    )
      .map((group) =>
        ((items) =>
          ((first) => ({
            kind: kindOf(first.pair),
            scope: first.pair.scope,
            day: first.day,
            pairs: items.map((_) => _.pair),
          }))(items[0] as { pair: _Pair; day: Day }))(
          group as { pair: _Pair; day: Day }[]
        )
      )
      .toSorted((a, b) =>
        `${a.day} ${a.kind} ${a.scope}` < `${b.day} ${b.kind} ${b.scope}`
          ? -1
          : 1
      );

  // «Грязные» сутки по событиям после курсора: сутки UTC момента у отправителя и сайта, сутки пояса, сутки сводки;
  // у своей — сутки её периода, у месячной — месяц денег (уточнение комиссии меняет любой месяц).
  const dirtyOf = (changes: readonly ChangedEvent[], ctx: _Context) =>
    ((utc, report, summary, paid, money) => ({
      has: (pair: _Pair, day: Day): boolean =>
        pair.clock === 'month'
          ? money.has('') || money.has(monthOf(day))
          : pair.clock === 'report'
            ? pair.config.rule !== null
              ? [...report].some(
                  (_) =>
                    _ <= day &&
                    _ >= ruleFrom(pair.config.rule as ThresholdRule, day)
                )
              : pair.config.spec.code === 'rate_present'
                ? // Оплата с моментом в прошлом меняет «Курс есть» всех суток после неё; возврат и комиссия берут
                  // момент своей оплаты — нового момента у них нет.
                  [...paid].some((_) => _ <= day)
                : report.has(day)
            : pair.scope === ''
              ? utc.has(`/0/${day}`)
              : utc.has(`${pair.scope}/${Number(pair.test)}/${day}`) ||
                (pair.clock === 'summary' &&
                  summary.has(`${pair.scope}/${Number(pair.test)}/${day}`)),
    }))(
      new Set(
        changes.flatMap((_) => [
          `${_.sender}/${Number(_.test)}/${utcDay(_.at)}`,
          ...(_.test ? [] : [`/0/${utcDay(_.at)}`]),
        ])
      ),
      new Set(changes.filter((_) => !_.test).map((_) => dayIn(_.at, ctx.zone))),
      new Set(
        changes
          .filter(
            (_) => _.day !== null && ctx.role(_.sender, _.type) === 'summary'
          )
          .map((_) => `${_.sender}/${Number(_.test)}/${_.day}`)
      ),
      new Set(
        changes
          .filter((_) => !_.test && ctx.role(_.sender, _.type) === 'payment')
          .map((_) => dayIn(_.at, ctx.zone))
      ),
      new Set(
        changes
          .filter((_) => !_.test)
          .flatMap((_) =>
            ((role) =>
              role === 'payment' || role === 'refund'
                ? [monthOf(dayIn(_.at, ctx.zone))]
                : role === 'amendment'
                  ? ['']
                  : [])(ctx.role(_.sender, _.type))
          )
      )
    );

  // Подпись наступивших дней: сменилась — у какой-то пары появились сутки без строки.
  const signatureOf = (at: string, snapshot: Setup): string =>
    ((zone) =>
      [
        snapshot.revision,
        ...snapshot.senders
          .filter(_active)
          .map(
            (_) =>
              `${_.code}:${lastDue('summary', at, _.summaryAt ?? '06:00', zone)}`
          ),
        lastDue('utc', at, null, zone),
        lastDue('report', at, null, zone),
        lastDue('month', at, null, zone),
      ].join(' '))(visits.timeZone());

  // Что изменилось с прошлого такта для пары: ревизия — у всех, удаления — у сверки событий и своих, курсы,
  // расходы и базовая валюта — у «Курс есть», выписки — у сверки с выпиской, выключатель — у проверок сводки.
  const changedFor =
    (
      cursor: QualityCursor,
      revision: number,
      erasures: number,
      logged: readonly string[]
    ) =>
    (pair: _Pair): boolean =>
      cursor.revision !== revision ||
      (cursor.marks.erasures !== erasures &&
        (pair.clock !== 'report' || pair.config.rule !== null)) ||
      (pair.config.spec.code === 'rate_present' &&
        logged.some(
          (_) => _ === 'rate' || _ === 'spend' || _ === 'settings'
        )) ||
      (pair.config.spec.code === 'statement_matches' &&
        logged.includes('statement')) ||
      (pair.clock === 'summary' && logged.includes('settings'));

  // Работа такта: без курсора — 30 суток молча; иначе сутки без строки и изменившиеся — за 7, «грязные» — за 30,
  // строки «ждёт пересчёта людей» — снова.
  const workOf = (
    ctx: _Context,
    pairs: readonly _Pair[],
    cursor: QualityCursor | null,
    marks: ReturnType<QualityStore['marks']>
  ): { pair: _Pair; day: Day }[] =>
    ((windows) =>
      ((days) =>
        ((existing, dirty, changed) =>
          windows.flatMap(({ pair, days: window }) =>
            window
              .filter((day) =>
                ((row, recent) =>
                  cursor === null ||
                  row?.reason === 'stale' ||
                  (recent && (row === undefined || changed(pair))) ||
                  (dirty?.has(pair, day) ?? false))(
                  existing.get(keyOfRow(keyOf(pair, day))),
                  pair.clock === 'month' ||
                    day >= addDays(pair.last, 1 - QUALITY_LIMITS.changedDays)
                )
              )
              .map((day) => ({ pair, day }))
          ))(
          new Map(
            (days.length === 0
              ? []
              : store.rows(days[0] as Day, days.at(-1) as Day)
            ).map((_) => [keyOfRow(_), _])
          ),
          cursor === null ? null : dirtyOf(store.changes(cursor.seq), ctx),
          cursor === null
            ? () => false
            : changedFor(
                cursor,
                ctx.setup.revision,
                marks.erasures,
                store.logged(cursor.marks.log)
              )
        ))(windows.flatMap((_) => _.days).toSorted()))(
      pairs.map((pair) => ({
        pair,
        days: windowOf(pair, QUALITY_LIMITS.dirtyDays),
      }))
    );

  // План такта; null — работы нет: курсор, ревизия, журналы и наступившие дни те же, каналы не появились.
  const begin = (): _Plan | null =>
    ((at, snapshot, marks, cursor, channels) =>
      ((appeared, sign, first) => (
        (ready = channels),
        !snapshot.senders.some(_active) ||
        (cursor !== null &&
          cursor.seq === marks.seq &&
          cursor.revision === snapshot.revision &&
          cursor.marks.log === marks.log &&
          cursor.marks.erasures === marks.erasures &&
          sign === signature &&
          !appeared &&
          !first &&
          !(waiting && stale() === 0))
          ? null
          : ((ctx) =>
              ((pairs) =>
                ((work) => (
                  (signature = sign),
                  (fresh = false),
                  (waiting = false),
                  {
                    ctx,
                    pairs,
                    steps: stepsOf(work),
                    cursor: {
                      seq: marks.seq,
                      revision: snapshot.revision,
                      marks: { log: marks.log, erasures: marks.erasures },
                    },
                    notify: work.length > 0 || appeared || first,
                    failed: false,
                  }
                ))(workOf(ctx, pairs, cursor, marks)))(pairsOf(ctx)))(
              context(at, snapshot)
            )
      ))(channels && !ready, signatureOf(at, snapshot), fresh))(
      now(),
      setup(),
      store.marks(),
      store.cursor(),
      alerts.ready()
    );

  // --- Уведомления ------------------------------------------------------------------------------------------

  // Названия — из настройки: у своей проверки — владельца, у встроенной — ядра на языке уведомления.
  const noticeContext = (ctx: _Context) => ({
    sender: (code: string) =>
      `${ctx.setup.senders.find((_) => _.code === code)?.name ?? code} (${code})`,
    type: (sender: string, code: string) =>
      ctx.setup.types.find((_) => _.sender === sender && _.code === code)
        ?.name ?? null,
    summaryAt: (sender: string) =>
      ctx.setup.senders.find((_) => _.code === sender)?.summaryAt ?? null,
    clock: (check: string) => clockOf(ctx.setup, check),
    check: (check: string) =>
      builtinCheck(check) === null
        ? (ctx.setup.checks.find((_) => _.code === check)?.name ?? null)
        : null,
    zone: ctx.zone,
  });

  // Последним шагом такта: решения по строкам D* — одной транзакцией с отметками и постановкой в очередь.
  // Отметка — по условию «ещё не отмечено»: второй процесс на той же базе её не повторит.
  const notifyStep = (ctx: _Context, pairs: readonly _Pair[]): boolean =>
    ((watched) =>
      watched.length === 0 ||
      !alerts.ready() ||
      connecting(
        ctx.now,
        store.firstEvent(),
        [...ctx.summaries.values()].some((_) => _.some((day) => !day.test))
      )
        ? false
        : transaction(() =>
            ((notified) =>
              ((rows) =>
                ((marked) =>
                  marked.length > 0 &&
                  (alerts.send(
                    qualityNotice(marked, noticeContext(ctx), ctx.now)
                  ),
                  true))(
                  watched
                    .flatMap((pair): QualityDecision[] =>
                      ((found) => (found === null ? [] : [found]))(
                        decide(
                          rows.get(`${pair.config.spec.code}/${pair.scope}`) ??
                            [],
                          pair.last,
                          pair.config.notify,
                          ctx.now,
                          pair.clock
                        )
                      )
                    )
                    .filter((_) =>
                      _.kind === 'recovered'
                        ? store.recover(_.row, ctx.now)
                        : store.mark(
                            _.row,
                            ctx.now,
                            _.episode,
                            _.row.notifiedAt
                          )
                    )
                ))(
                Map.groupBy(
                  store
                    .rows(
                      _min([
                        ...watched.map((_) => addDays(_.last, -_EPISODE_DAYS)),
                        ...notified
                          .filter((_) => _.recoveredAt === null)
                          .map((_) => _.episode),
                      ]) as Day,
                      watched
                        .map((_) => _.last)
                        .toSorted()
                        .at(-1) as Day
                    )
                    .filter((_) => !_.test),
                  (_) => `${_.check}/${_.scope}`
                )
              ))(store.notified())
          ))(pairs.filter((_) => !_.test && _.config.notify !== 'off'));

  const finish = (current: _Plan): boolean =>
    ((sent) => (
      void (sent.ok && !current.failed && store.keep(current.cursor)),
      sent.value
    ))(
      attempt(
        () => ({
          ok: true,
          value: current.notify && notifyStep(current.ctx, current.pairs),
        }),
        (error) => (failed(error), { ok: false, value: false })
      )
    );

  const advance = (current: _Plan): _Plan => ({
    ...current,
    steps: current.steps.slice(1),
    failed: !runStep(current.ctx, current.steps[0] as _Step) || current.failed,
  });

  const complete = (current: _Plan): { steps: number; notified: boolean } =>
    ((done) => ({ steps: current.steps.length, notified: finish(done) }))(
      current.steps.reduce<_Plan>((all) => advance(all), current)
    );

  // --- Чтение -----------------------------------------------------------------------------------------------

  const viewIn = (ctx: _Context, row: CheckDay): CheckDayView => ({
    ..._cell(row),
    check: row.check,
    scope: row.scope === '' ? null : row.scope,
    test: row.test,
    detail: row.detail,
    version: row.version,
    evaluatedAt: row.evaluatedAt,
    summary:
      builtinCheck(row.check)?.clock === 'summary' && row.scope !== ''
        ? ((ctx.summaries.get(row.scope) ?? []).find(
            (_) => _.day === row.day && _.test === row.test
          ) ?? null)
        : null,
  });

  const viewOf = (row: CheckDay): CheckDayView =>
    viewIn(context(now(), setup()), row);

  // Проверка по коду: встроенная по расписанию или своя из настройки — и в архиве: её строки остаются.
  const checkOf = (raw: unknown) =>
    ((code) =>
      BUILTIN_CHECKS.find((_) => _.code === code && _.clock !== null) ??
      ((custom) =>
        custom === undefined
          ? fail(
              'analytics.check_not_found',
              `There is no check ${String(raw ?? '')}`
            )
          : { code: custom.code, scope: 'site' as CheckScope })(
        setup().checks.find(
          (_) => _.code === code && builtinCheck(_.code) === null
        )
      ))(queryCode(raw, CHECK_CODE_LIMIT, 'check'));

  const refOf = (ref: CheckRef): CheckKey =>
    ((spec) => ({
      check: spec.code,
      scope:
        spec.scope === 'site'
          ? ''
          : (queryCode(ref.scope, CODE_LIMITS.sender, 'scope') ??
            fail(
              'analytics.invalid_query',
              `The check ${spec.code} is per sender: give the sender code as scope`
            )),
      test: queryFlag(ref.test, 'test'),
      day: isDay(ref.day)
        ? ref.day
        : fail('analytics.invalid_query', 'The day is YYYY-MM-DD'),
    }))(checkOf(ref.check));

  const found = (key: CheckKey): CheckDay =>
    store.row(key) ??
    fail(
      'analytics.check_not_found',
      `The check ${key.check} has no result for ${key.day}${key.scope === '' ? '' : ` of ${key.scope}`}`
    );

  const logKey = (key: CheckKey): string =>
    `${[key.check, ...(key.scope === '' ? [] : [key.scope]), key.day].join('/')}${key.test ? '/test' : ''}`;

  // Строки периода из базы: у месячной — ещё её D* и месяцы, которых период касается, хоть их первый день раньше.
  const storedOf = (
    ctx: _Context,
    period: DayPeriod,
    pairs: readonly _Pair[]
  ): CheckDay[] => [
    ...store
      .rows(period.from, period.to)
      .filter((_) => clockOf(ctx.setup, _.check) !== 'month'),
    ...BUILTIN_CHECKS.filter((_) => _.clock === 'month').flatMap((spec) =>
      store.rowsOf(
        spec.code,
        [
          monthDay(monthOf(period.from)),
          ...pairs
            .filter((_) => _.config.spec.code === spec.code)
            .map((_) => _.last),
        ].toSorted()[0] as Day,
        period.to
      )
    ),
  ];

  const rowsOf = (
    ctx: _Context,
    stored: readonly CheckDay[],
    test: boolean,
    check: string | null,
    sender: string | null
  ): QualityRow[] =>
    ((rows, pairs) =>
      ((keys) =>
        keys.map(
          (key): QualityRow =>
            ((cells, pair, clock) =>
              ((day) => ({
                check: key.check,
                scope: key.scope === '' ? null : key.scope,
                test: key.test,
                zone: zoneOf(clock),
                day,
                state:
                  day === null
                    ? null
                    : (cells.find((_) => _.day === day)?.state ?? null),
                lastOk: cells.findLast((_) => _.state === 'ok')?.day ?? null,
                cells: cells.map(_cell),
              }))(
                pair?.last ??
                  (clock === null
                    ? null
                    : lastDue(
                        clock,
                        ctx.now,
                        ctx.setup.senders.find((_) => _.code === key.scope)
                          ?.summaryAt ?? null,
                        ctx.zone
                      ))
              ))(
              rows.filter(
                (_) =>
                  _.check === key.check &&
                  _.scope === key.scope &&
                  _.test === key.test
              ),
              pairs.find(
                (_) =>
                  _.config.spec.code === key.check &&
                  _.scope === key.scope &&
                  _.test === key.test
              ),
              clockOf(ctx.setup, key.check)
            )
        ))(
        Object.values(
          Object.groupBy(
            [
              ...pairs.map((_) => ({
                check: _.config.spec.code,
                scope: _.scope,
                test: _.test,
              })),
              ...rows.map((_) => ({
                check: _.check,
                scope: _.scope,
                test: _.test,
              })),
            ],
            (_) => `${_.check}/${_.scope}/${Number(_.test)}`
          )
        )
          .map(
            (_) =>
              (_ as { check: string; scope: string; test: boolean }[])[0] as {
                check: string;
                scope: string;
                test: boolean;
              }
          )
          .toSorted(
            (a, b) =>
              checkOrder(a.check) - checkOrder(b.check) ||
              (a.check < b.check ? -1 : a.check > b.check ? 1 : 0) ||
              (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0) ||
              Number(a.test) - Number(b.test)
          )
      ))(
      stored.filter(
        (_) =>
          (test || !_.test) &&
          (check === null || _.check === check) &&
          (sender === null || _.scope === sender)
      ),
      pairsOf(ctx).filter(
        (_) =>
          (test || !_.test) &&
          (check === null || _.config.spec.code === check) &&
          (sender === null || _.scope === sender)
      )
    );

  // Сверка сводок: строки «События дошли», «Выручка сходится», «Отправитель доставил всё» за последние сутки.
  const summaryChecks = (
    ctx: _Context,
    stored: readonly CheckDay[],
    test: boolean,
    sender: string | null
  ): SummaryCheck[] =>
    ((stored) =>
      Object.values(
        Object.groupBy(
          stored.filter((_) => _.check === 'events_arrived'),
          (_) => `${_.scope}/${Number(_.test)}`
        )
      ).flatMap((group) =>
        (group as CheckDay[])
          .toSorted((a, b) => (a.day < b.day ? 1 : -1))
          .slice(0, _AGENT_SUMMARIES)
          .map((row) =>
            ((revenue, delivered) => ({
              sender: row.scope,
              day: row.day,
              test: row.test,
              types: (
                (row.detail.types ?? []) as readonly {
                  type: string;
                  known: boolean;
                  summary: number;
                  site: number;
                  erased: number;
                  missing: number;
                }[]
              ).map((_) => ({
                type: _.type,
                name: _.known
                  ? (ctx.setup.types.find(
                      (type) =>
                        type.sender === row.scope && type.code === _.type
                    )?.name ?? null)
                  : null,
                summary: _.summary,
                site: _.site,
                erased: _.erased,
                missing: _.missing,
              })),
              currencies: (revenue?.detail.currencies ??
                []) as SummaryCheck['currencies'],
              failed: delivered?.value ?? null,
              version: row.version,
            }))(
              stored.find(
                (_) =>
                  _.check === 'revenue_matches' &&
                  _.scope === row.scope &&
                  _.test === row.test &&
                  _.day === row.day
              ),
              stored.find(
                (_) =>
                  _.check === 'sender_delivered' &&
                  _.scope === row.scope &&
                  _.test === row.test &&
                  _.day === row.day &&
                  _.reason !== 'no_failed' &&
                  _.reason !== 'no_summary'
              )
            )
          )
      ))(
      stored.filter(
        (_) =>
          (test || !_.test) &&
          _.scope !== '' &&
          (sender === null || _.scope === sender)
      )
    );

  const reportOf = (query: QualityQuery, at: string): QualityReport =>
    ((ctx, period, test, check, sender) =>
      ((stored) => ({
        asOf: at,
        from: period.from,
        to: period.to,
        timeZone: ctx.zone,
        channels: alerts.ready(),
        checks: checkViews(ctx.setup),
        rows: rowsOf(ctx, stored, test, check, sender),
        ...(queryFlag(query.detail, 'detail')
          ? {
              summaries: summaryChecks(ctx, stored, test, sender),
              open: stored
                .filter(
                  (_) =>
                    (_.state === 'warning' || _.state === 'failure') &&
                    (test || !_.test) &&
                    (check === null || _.check === check) &&
                    (sender === null || _.scope === sender)
                )
                .map((_) => viewIn(ctx, _)),
              versions: versionMarks(
                [...ctx.summaries.values()].flat(),
                (code) =>
                  ctx.setup.senders.find((_) => _.code === code)?.name ?? code,
                matchedOf(stored)
              ).filter(
                (_) =>
                  _.day >= period.from &&
                  _.day <= period.to &&
                  (sender === null || _.sender === sender)
              ),
            }
          : {}),
      }))(storedOf(ctx, period, pairsOf(ctx))))(
      context(at, setup()),
      utcPeriod(query, at, QUALITY_LIMITS.gridDays),
      queryFlag(query.test, 'test'),
      query.check === undefined || query.check === null || query.check === ''
        ? null
        : checkOf(query.check).code,
      queryCode(query.sender, CODE_LIMITS.sender, 'sender')
    );

  const statusOf = (): QualityStatus =>
    ((ctx) =>
      ((pairs) =>
        ((rows) =>
          ((open) => ({
            failures: open.filter((_) => _.state === 'failure').length,
            warnings: open.filter((_) => _.state === 'warning').length,
            day:
              pairs
                .map((_) => _.last)
                .toSorted()
                .at(-1) ?? null,
          }))(
            pairs
              .map((pair) => rows.get(keyOfRow(keyOf(pair, pair.last))))
              .filter(
                (_): _ is CheckDay =>
                  _ !== undefined &&
                  _.resolution === null &&
                  (_.state === 'failure' || _.state === 'warning')
              )
          ))(
          new Map(
            (pairs.length === 0
              ? []
              : store.rows(
                  pairs.map((_) => _.last).toSorted()[0] as Day,
                  pairs
                    .map((_) => _.last)
                    .toSorted()
                    .at(-1) as Day
                )
            ).map((_) => [keyOfRow(_), _])
          )
        ))(pairsOf(ctx).filter((_) => !_.test)))(context(now(), setup()));

  return {
    /**
     * Один шаг такта для фона сервера: план работы, затем шаг за шагом, затем уведомления и курсор. true —
     * работа осталась: фон зовёт снова через паузу.
     */
    step: (): boolean =>
      plan === null
        ? ((next) => next !== null && ((plan = next), true))(begin())
        : plan.steps.length === 0
          ? ((current) => (finish(current), (plan = null), false))(plan)
          : ((plan = advance(plan)), true),
    /** Такт целиком, без пауз: тесты и проверка вручную; без фона строки дней пишет только он. */
    tick: (): QualityTick =>
      ((next) =>
        next === null ? { steps: 0, notified: false } : complete(next))(
        begin()
      ),
    /** Сетка «день × проверка»: сутки UTC (`days` до 90, по умолчанию 30), проверки, каналы сбоев. */
    report: (query: QualityQuery = {}): QualityReport => reportOf(query, now()),
    /** Строка дня с подробностями; у проверок сводки — и сводка. */
    day: (ref: CheckRef): CheckDayView => viewOf(found(refOf(ref))),
    /** Нерешённые сбои и замечания последних наступивших дней: отметка в меню. */
    status: statusOf,
    /** Проверки для экрана настройки: встроенные с поправками и свои, и в архиве. */
    checks: (): CheckView[] => checkViews(setup()),
    /**
     * Снять замечание или сбой вручную с заметкой о причине: кто снял — в строке и журнале настройки. Не
     * замечание и не сбой или уже снято — `analytics.check_not_open`.
     */
    resolve: (
      ref: CheckRef,
      note: unknown,
      author: SetupAuthor | null = null
    ): CheckDayView =>
      ((key, text) =>
        viewOf(
          transaction(() =>
            ((row, at) =>
              row.resolution !== null ||
              (row.state !== 'warning' && row.state !== 'failure')
                ? fail(
                    'analytics.check_not_open',
                    `The result of ${key.check} for ${key.day} is ${row.resolution === null ? row.state : 'already resolved'}: only an open warning or failure is resolved`
                  )
                : ((next) => (
                    store.put(next),
                    log.append([
                      {
                        at,
                        author,
                        item: 'resolution',
                        key: logKey(key),
                        action: 'created',
                        before: null,
                        after: {
                          state: row.state,
                          reason: row.reason,
                          value: row.value,
                          note: text,
                        },
                      },
                    ]),
                    next
                  ))({
                    ...row,
                    resolution: {
                      at,
                      by: author?.name ?? '',
                      agent: author?.agent === true,
                      note: text,
                    },
                  }))(found(key), now())
          )
        ))(refOf(ref), resolutionNote(note)),
    /** Вернуть снятое: отметка снятия уходит, журнал пишет `removed`. */
    reopen: (ref: CheckRef, author: SetupAuthor | null = null): CheckDayView =>
      ((key) =>
        viewOf(
          transaction(() =>
            ((row, at) =>
              row.resolution === null
                ? fail(
                    'analytics.check_not_open',
                    `The result of ${key.check} for ${key.day} is not resolved`
                  )
                : ((next) => (
                    store.put(next),
                    log.append([
                      {
                        at,
                        author,
                        item: 'resolution',
                        key: logKey(key),
                        action: 'removed',
                        before: {
                          state: row.state,
                          note: row.resolution.note,
                          by: row.resolution.by,
                        },
                        after: null,
                      },
                    ]),
                    next
                  ))({ ...row, resolution: null }))(found(key), now())
          )
        ))(refOf(ref)),
    /**
     * Проверить заново выбранные сутки сейчас, без уведомлений: о них решит такт сервера по строкам в базе.
     * Без суток — последние 7 у каждой пары.
     */
    run: (query: RunQuery = {}): QualityReport =>
      ((at, check, day, scope) =>
        ((ctx) =>
          ((pairs) =>
            ((work) => (
              stepsOf(work).forEach((_) => void runStep(ctx, _)),
              reportOf(
                {
                  from:
                    day ??
                    _min(work.map((_) => _.day)) ??
                    addDays(utcDay(at), 1 - QUALITY_LIMITS.changedDays),
                  to: day === null ? utcDay(at) : day,
                  check: check ?? undefined,
                  sender: scope ?? undefined,
                },
                at
              )
            ))(
              pairs.flatMap((pair) =>
                (day === null
                  ? windowOf(pair, QUALITY_LIMITS.changedDays)
                  : windowOf(pair, QUALITY_LIMITS.dirtyDays).filter(
                      (_) =>
                        _ ===
                        (pair.clock === 'month' ? monthDay(monthOf(day)) : day)
                    )
                ).map((_) => ({ pair, day: _ }))
              )
            ))(
            pairsOf(ctx).filter(
              (_) =>
                (check === null || _.config.spec.code === check) &&
                (scope === null || _.scope === scope)
            )
          ))(context(at, setup())))(
        now(),
        query.check === undefined || query.check === null || query.check === ''
          ? null
          : checkOf(query.check).code,
        query.day === undefined || query.day === null || query.day === ''
          ? null
          : isDay(query.day) && query.day <= utcDay(now())
            ? query.day
            : fail(
                'analytics.invalid_query',
                'The day is YYYY-MM-DD, not later than today'
              ),
        queryCode(query.scope, CODE_LIMITS.sender, 'scope')
      ),
    /** Сошёлся ли счёт за сутки отправителя: отметки смены версии на графике «Обзора». */
    matched: (period: DayPeriod) =>
      matchedOf([
        ...store.rowsOf('events_arrived', period.from, period.to),
        ...store.rowsOf('revenue_matches', period.from, period.to),
      ]),
    /** Срок хранения строк дней: 400 суток. */
    expire: (): number =>
      store.expire(addDays(utcDay(now()), -QUALITY_LIMITS.keepDays)),
    /** Названия встроенных проверок на языках менеджера. */
    names: CHECK_NAMES,
  };
};

export type Quality = ReturnType<typeof defineQuality>;
