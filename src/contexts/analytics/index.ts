import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineAnalyticsService } from './application/analytics-service.ts';
import type { ImportOptions, ImportReport } from './application/import.ts';
import type { AnalyticsEvent } from './domain/events.ts';
import type {
  QualityAlerts,
  RefusalTally,
  SetSample,
  SiteVisits,
} from './domain/ports.ts';
import { startAnalyticsBackground } from './infrastructure/background.ts';
import { defineImportLedger } from './infrastructure/import-ledger.ts';
import { defineLineSource } from './infrastructure/jsonl.ts';
import {
  cryptoAnalytics,
  defineSenderKeyRepository,
} from './infrastructure/sender-keys.ts';
import {
  defineErasureLog,
  defineEventJournal,
  defineEventStore,
} from './infrastructure/sqlite-events.ts';
import {
  defineErasedTally,
  defineIntakeTally,
  defineSummaryStore,
} from './infrastructure/sqlite-intake.ts';
import { defineLabelRegistry } from './infrastructure/sqlite-labels.ts';
import { defineMoneyStore } from './infrastructure/sqlite-money.ts';
import { definePeopleStore } from './infrastructure/sqlite-people.ts';
import { defineQualityStore } from './infrastructure/sqlite-quality.ts';
import { defineReportStore } from './infrastructure/sqlite-reports.ts';
import {
  defineAnalyticsSettingsRepository,
  defineEventReferences,
  defineSetupLog,
  defineSetupRepository,
} from './infrastructure/sqlite-setup.ts';
import { defineEventsHandler } from './interface/events-handler.ts';
import { defineGoHandler, type GoVisits } from './interface/go-handler.ts';

export type {
  AnalyticsService,
  IntakeDaily,
  IntakeSummary,
  IssuedSenderKey,
  LogQuery,
  SenderKeysApplied,
  SenderSaved,
  SenderView,
  SetApplied,
  TalliesExpired,
} from './application/analytics-service.ts';
export {
  IMPORT_LIMITS,
  type ImportError,
  type ImportOptions,
  type ImportReport,
} from './application/import.ts';
export type {
  Intake,
  IntakeOutcome,
  IntakeRefusal,
} from './application/intake.ts';
export type {
  EventQuery,
  EventsPage,
  EventView,
  RawEvent,
  UnknownReport,
} from './application/journal.ts';
export type {
  LabelCheck,
  LabelIssued,
  LabelsPage,
  LabelsQuery,
} from './application/labels.ts';
export type {
  RatesReport,
  RatesSaved,
  SpendReport,
  SpendSaved,
  SpendView,
  StatementQuery,
  StatementsReport,
  StatementsSaved,
} from './application/money.ts';
export type {
  CardQuery,
  MilestoneView,
  PeopleErased,
  PeoplePage,
  PeopleQuery,
  PersonCard,
  PersonListed,
  PersonView,
} from './application/people.ts';
export type {
  CheckDayView,
  CheckRef,
  CheckView,
  QualityCell,
  QualityQuery,
  QualityReport,
  QualityRow,
  QualityStatus,
  QualityTick,
  RunQuery,
  SummaryCheck,
} from './application/quality.ts';
export {
  type MonthQuery,
  PAGE_LIMITS,
  type ReportQuery,
  type UtcQuery,
} from './application/query.ts';
export type {
  AnswersReport,
  ArrivalCohortsReport,
  CohortsReport,
  FunnelCompare,
  FunnelReport,
  MilestoneComparison,
  OverviewReport,
  PaymentCohortsReport,
  ReportHead,
  SourcesCompare,
  SourcesReport,
  SpendSummary,
} from './application/reports.ts';
export {
  type SampleView,
  type SetPlanReport,
  type Sets,
  sampleViews,
} from './application/sets.ts';
export type {
  SummariesQuery,
  SummariesReport,
} from './application/summaries.ts';
export {
  type ArrivalCohortRow,
  COHORT_BASES,
  COHORT_LIMITS,
  COHORT_METRICS,
  type CohortAverage,
  type CohortBasis,
  type CohortCell,
  type CohortMetric,
  type CohortRow,
  type CohortState,
} from './domain/cohorts.ts';
export type { Day, DayPeriod, Month } from './domain/days.ts';
export {
  canonicalJson,
  type Envelope,
  EVENT_LIMITS,
  type EventOrigin,
  type FieldErrors,
  parseSubject,
  type Touch,
  type TrackedEvent,
} from './domain/envelope.ts';
export type { AnalyticsEvent, ErasureOrigin } from './domain/events.ts';
export {
  type CarriedSenderKey,
  KEY_LIMITS,
  SENDER_KEY_PREFIX,
  type SenderKeyView,
} from './domain/keys.ts';
export {
  type BaseSum,
  type ExchangeRate,
  MINOR_UNITS,
  RATE_LIMITS,
} from './domain/money.ts';
export {
  type AccessSpan,
  type Acquisition,
  type Amounts,
  type Answer,
  type DimValue,
  type FeeEntry,
  type MilestoneFact,
  type MilestoneState,
  type MoneyEntry,
  PERSON_STATES,
  type Person,
  type PersonFacts,
  type PersonState,
  type PersonTouch,
  type ReturnFact,
} from './domain/person.ts';
export type {
  ConflictEntry,
  Erasure,
  ErasureEntry,
  GoSources,
  OriginRow,
  QualityAlerts,
  QualityNotice,
  RefererKind,
  RefusalTally,
  RegisteredLabel,
  SetSample,
  SetupLogEntry,
  SiteVisits,
  Tally,
  VisitFilter,
  VisitSource,
  VisitSums,
} from './domain/ports.ts';
export {
  BUILTIN_CHECKS,
  CHECK_METRICS,
  CHECK_NOTIFY,
  CHECK_STATES,
  type CheckMetric,
  type CheckNotify,
  type CheckState,
  type CheckZone,
  type LowDataThresholds,
  QUALITY_LIMITS,
  type QualityCheck,
  RECONCILE_MARKS,
  type ReconcileMark,
  type ThresholdRule,
} from './domain/quality.ts';
export { CHECK_NAMES } from './domain/quality-texts.ts';
export type { LabelInput } from './domain/registry.ts';
export {
  type AnswersBody,
  type FeeCoverage,
  type FunnelStepReport,
  LOW_DATA,
  type MilestoneRow,
  NONE,
  type OverviewTotals,
  REPORT_LIMITS,
  REST,
  type ReturnRow,
  type Share,
  type SourcesBody,
  type SourcesColumn,
  type SourcesRow,
  type StepMoney,
  UNKNOWN,
} from './domain/report.ts';
export {
  FEES_MODES,
  type FeesMode,
  LIFETIMES,
  type Lifetime,
  type Ltv,
  PAYBACK_MONTHS,
  type Payback,
} from './domain/revenue.ts';
export {
  EVENT_ROLES,
  type EventRole,
  ROLES,
  type RoleField,
  type RoleFieldKind,
  type RoleSpec,
} from './domain/roles.ts';
export type { AnalyticsSettings } from './domain/settings.ts';
export {
  type AnalyticsSet,
  DIMENSION_KINDS,
  type Dictionary,
  type DictionaryPurpose,
  type DictionaryValue,
  type EventType,
  type Funnel,
  type FunnelStep,
  type GoLink,
  type ItemRef,
  type LabelSchema,
  type Milestone,
  type MilestoneCondition,
  type Parts,
  PROPERTY_KINDS,
  type Property,
  type PropertyKind,
  type PropertyScope,
  type ReferrerRule,
  SET_FORMAT,
  SET_UNTOUCHED,
  SET_VERSION,
  SETUP_GROUPS,
  SETUP_LIMITS,
  type Sender,
  type SetEntry,
  type SetErrors,
  type SetItemNote,
  type SetUntouched,
  type Setup,
  type SetupAction,
  type SetupAuthor,
  type SetupGroup,
  type SetupItem,
  type SetupLogItem,
  type SetWarning,
  type SetWarningCode,
  setErrorsOf,
  type TypeProperty,
  type UtmParameter,
} from './domain/setup.ts';
export {
  type PartState,
  SPEND_LIMITS,
  type SpendHint,
  type SpendInput,
  type SpendRow,
} from './domain/spend.ts';
export {
  STATEMENT_FEES,
  STATEMENT_LIMITS,
  type Statement,
  type StatementFees,
  type StatementView,
} from './domain/statements.ts';
export {
  isVersionText,
  type SummaryDay,
  type VersionMark,
} from './domain/summary.ts';
export {
  type ErasedDay,
  type IntakeDay,
  TALLY_LIMITS,
  TALLY_OUTCOMES,
  type TallyOutcome,
} from './domain/tally.ts';
export { cleanText, TEXT_LIMITS } from './domain/text.ts';
export {
  ANALYTICS_DERIVED_TABLES,
  ANALYTICS_SERVER_TABLES,
  analyticsMigrations,
} from './infrastructure/migrations.ts';
export { defineRefusalTally } from './infrastructure/sqlite-intake.ts';
export { clearAnalyticsPeople } from './infrastructure/sqlite-people.ts';
export { GO_PREFIX, type GoVisits } from './interface/go-handler.ts';

/** Приёмник событий отправителей: адрес занят ядром, до сайта и плагинов запрос не доходит. */
export var EVENTS_PATH = '/_cms/events';

// Пауза между пачками загрузки длиннее шага, которым SQLite ждёт занятую базу (до 25 мс): сервер на той же
// базе просыпается внутри паузы и берёт блокировку записи (замер ADR 0072), а в своём процессе — отвечает.
const _IMPORT_PAUSE_MS = 30;

/**
 * Контекст analytics: настройка аналитики клиентского пути, отправители и их ключи, приём событий со счётом по
 * суткам, люди из событий, удаление истории и срок хранения, отчёты, сводки отправителей, проверки данных,
 * реестр меток, курсы и расходы, переход `/_cms/go/<код>`. `visits` — порты статистики посещений: их собирает
 * корень, `stats` аналитика не импортирует. `refusals` — счёт отказов процесса (`defineRefusalTally`): его
 * создаёт корень один раз, как счётчик статистики. `alerts` — уведомления о проверках: каналы сбоев `notify`,
 * их тоже собирает корень. `samples` — наборы-образцы бинарника из `src/scaffolds/analytics/`: аналитика их не
 * импортирует. `version` — версия Eile для выгрузки набора, `siteName` — название сайта для её имени.
 */
export var defineAnalytics = ({
  db,
  bus,
  clock,
  siteUrl,
  visits,
  refusals,
  alerts,
  samples,
  version,
  siteName,
}: {
  db: Database;
  bus: EventBus;
  clock: () => Date;
  siteUrl: () => string;
  visits: SiteVisits & { readonly go: GoVisits };
  refusals: RefusalTally;
  alerts: QualityAlerts;
  samples: readonly SetSample[];
  version: string;
  siteName: () => string;
}) => {
  let running = false;
  let kick = (): void => undefined;
  const service = defineAnalyticsService({
    settings: defineAnalyticsSettingsRepository(db),
    setup: defineSetupRepository(db),
    log: defineSetupLog(db),
    references: defineEventReferences(db),
    keys: defineSenderKeyRepository(db),
    events: defineEventStore(db),
    journal: defineEventJournal(db),
    erasures: defineErasureLog(db),
    people: definePeopleStore(db),
    crypto: cryptoAnalytics,
    // Правка и приём читают и пишут одной транзакцией: блокировка записи — сразу, а не при первой записи.
    transaction: (run) => db.transaction(run).immediate(),
    bus,
    clock,
    running: () => running,
    pause: () => Bun.sleep(_IMPORT_PAUSE_MS),
    ledger: defineImportLedger,
    reports: defineReportStore(db),
    registry: defineLabelRegistry(db),
    visits,
    siteUrl,
    money: defineMoneyStore(db),
    tally: defineIntakeTally(db),
    erased: defineErasedTally(db),
    refusals,
    summaries: defineSummaryStore(db),
    quality: defineQualityStore(db),
    alerts,
    failed: (error) => console.error(error),
    samples,
    version,
    siteName,
  });
  // Правка справочников меняет роли: фон пересчитывает людей сразу, не дожидаясь минуты.
  bus.on<AnalyticsEvent>('analytics.setup_changed', () => kick());
  return {
    ...service,
    events: {
      ...service.events,
      /**
       * Загрузка истории из файла JSON Lines: путь к файлу или поток его байтов, читается построчно, а не
       * целиком. Каждая строка проходит приём, как событие по HTTP; `dryRun` ничего не пишет.
       */
      import: (
        source: string | ReadableStream<Uint8Array>,
        options: ImportOptions = {}
      ): Promise<ImportReport> =>
        service.events.import(
          defineLineSource(
            typeof source === 'string' ? Bun.file(source).stream() : source
          ),
          options
        ),
    },
    /** HTTP приёмника `POST /_cms/events`; `client` — адрес отправителя для предела перебора ключа. */
    handle: defineEventsHandler(service.intake),
    /**
     * HTTP перехода `/_cms/go/<код>`: `302` с меткой или `405`; null — перехода нет, корень отвечает страницей 404
     * сайта. `client` — адрес посетителя: по нему статистика находит его посещение дня.
     */
    go: defineGoHandler(service.labels, visits.go),
    /**
     * Фон у сервера: пересчёт людей пачками, счёт отказов в базу раз в минуту и при остановке, такт проверок
     * данных раз в минуту и при запуске, срок хранения раз в сутки. Без фона (CLI, `cms mcp`, тесты) список
     * людей пересчитывает отставших сам, срок хранения — `people.expire()` и `intake.expire()`, строки дней
     * проверок пишет только `quality.tick()`, а счёт отказов — закрытие приложения.
     */
    start: (): (() => void) =>
      ((background) => (
        (running = true),
        (kick = background.kick),
        () => (background.stop(), (running = false), (kick = () => undefined))
      ))(startAnalyticsBackground(service.background)),
  };
};

export type Analytics = ReturnType<typeof defineAnalytics>;
