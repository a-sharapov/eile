import { fail } from '../../../shared/kernel/errors.ts';
import {
  type ArrivalCohortRow,
  arrivalCohortsOf,
  COHORT_LIMITS,
  type CohortAverage,
  type CohortMetric,
  type CohortRow,
  paymentCohortsOf,
} from '../domain/cohorts.ts';
import {
  type Day,
  type DayPeriod,
  dayBounds,
  monthOf,
  monthStarts,
  previousPeriod,
} from '../domain/days.ts';
import { type BaseSum, rateSteps } from '../domain/money.ts';
import {
  type MilestoneFact,
  milestoneStateOf,
  type PersonState,
  stateOf,
} from '../domain/person.ts';
import type {
  LabelRegistry,
  MoneyStore,
  ReportStore,
  SiteVisits,
  VisitFilter,
} from '../domain/ports.ts';
import { type LowDataThresholds, lowDataOf } from '../domain/quality.ts';
import {
  type AnswersBody,
  answersOf,
  cohortOf,
  type FunnelStepReport,
  filteredBy,
  hasRole,
  type MilestoneRow,
  milestoneComparisonOf,
  needsOf,
  type OverviewTotals,
  overviewTotals,
  type PaymentWindow,
  type PeopleStep,
  peopleStepReport,
  peopleSteps,
  type ReportFilter,
  type ReportGroup,
  type ReportLookups,
  type ReportNeeds,
  type ReportParams,
  type ReportPerson,
  type ReturnRow,
  reportLookups,
  type SourcesBody,
  type SourcesColumn,
  type SourcesMoney,
  type SourcesRow,
  type StepMoney,
  sourcesOf,
  sourcesTotalOf,
  visitStepReport,
} from '../domain/report.ts';
import {
  definePricing,
  type FeesMode,
  type Lifetime,
  livedBounds,
  type Pricing,
} from '../domain/revenue.ts';
import type { AnalyticsSettings } from '../domain/settings.ts';
import {
  type Funnel,
  type FunnelStep,
  type Setup,
  STEP_SIDES,
} from '../domain/setup.ts';
import {
  awaitingSpend,
  type ReportSpend,
  type SpendParams,
  type SpendReason,
  type SpendScope,
  spendOf,
} from '../domain/spend.ts';
import type { VersionMark } from '../domain/summary.ts';
import {
  listedView,
  type PeoplePage,
  type PeopleQuery,
  peopleFilter,
  personView,
} from './people.ts';
import {
  type CompareKind,
  cohortMonths,
  comparePeriod,
  momentsOf,
  queryBasis,
  queryChoice,
  queryFees,
  queryFlag,
  queryLife,
  queryMetric,
  queryWhole,
  type ReportClock,
  type ReportQuery,
  reportFilters,
  reportFunnel,
  reportParams,
  reportPeriod,
  reportQuestion,
} from './query.ts';

/** Шапка отчёта: период и пояс, когда посчитан, сколько людей ещё в пересчёте, фильтры, пороги «мало данных». */
export type ReportHead = {
  readonly from: Day;
  readonly to: Day;
  readonly timeZone: string;
  readonly asOf: string;
  /** Людей, которых фон ещё пересчитывает по новой настройке; 0 — отчёт свежий. */
  readonly stale: number;
  /** Фильтры отчёта: `part.<код>` и прочие → значение. */
  readonly filters: Readonly<Record<string, string>>;
  readonly test: boolean;
  /** Пороги «мало данных» из настройки, по которым приглушены строки этого ответа. */
  readonly lowData: LowDataThresholds;
};

/** Расход «Источников» под таблицей: где он, почему не по строкам, разложен ли по дням, что не разложено. */
export type SpendSummary = {
  readonly scope: SpendScope;
  readonly reason: SpendReason;
  /** Период не по границам месяцев: расход разложен по дням. */
  readonly prorated: boolean;
  /** Совпали с фильтрами, но без части группы: в итоге и ни в одной строке. */
  readonly unassigned: BaseSum | null;
  /** Шире фильтра: не учтены нигде. */
  readonly broader: BaseSum | null;
};

/** Итог прошлого периода с теми же фильтрами, сроком жизни и комиссией, со своим расходом. */
export type SourcesCompare = {
  readonly kind: CompareKind;
  readonly from: Day;
  readonly to: Day;
  readonly total: SourcesRow | ReturnRow;
};

/** «Источники»: `group` — `part:<код>`, `trait:<код>`, `prop:<код>`, `answer:<вопрос>`, `label` или `sender`. */
export type SourcesReport = ReportHead & {
  readonly group: string;
  readonly window: PaymentWindow;
  /** null — базовой валюты нет: деньги одной цифрой, LTV, расход и CAC — null. */
  readonly baseCurrency: string | null;
  readonly life: Lifetime;
  readonly fees: FeesMode;
  /** null — у сайта нет строк расхода или базовой валюты. */
  readonly spend: SpendSummary | null;
  readonly compare: SourcesCompare | null;
} & SourcesBody;

/** Шаги прошлого периода воронки: числа и деньги, обе стороны. */
export type FunnelCompare = {
  readonly kind: CompareKind;
  readonly from: Day;
  readonly to: Day;
  readonly steps: readonly {
    readonly count: number | null;
    readonly money: StepMoney | null;
  }[];
};

export type FunnelReport = ReportHead & {
  readonly funnel: Pick<Funnel, 'code' | 'name' | 'strict' | 'main'>;
  readonly baseCurrency: string | null;
  readonly steps: readonly FunnelStepReport[];
  /** С какого дня у сводок посещений есть разрез источника: раньше фильтр по части даёт шагам-посещениям ноль. */
  readonly visitsSince: Day | null;
  readonly compare: FunnelCompare | null;
};

export type AnswersReport = ReportHead & {
  readonly group: string;
  readonly question: string;
} & AnswersBody;

/** «Обзор»: итоги периода и прошлого периода той же длины, без фильтров; смены версий отправителей в периоде. */
export type OverviewReport = ReportHead & {
  readonly baseCurrency: string | null;
  readonly current: OverviewTotals;
  readonly previous: OverviewTotals;
  readonly compare: { readonly from: Day; readonly to: Day };
  /** Смены версий по сводкам: день — сутки UTC сводки, версии — после cleanText. */
  readonly versions: readonly VersionMark[];
};

/** Когорты по первой оплате: строки — месяцы, ячейки — месяцы жизни 0–12, среднее по полным ячейкам. */
export type PaymentCohortsReport = ReportHead & {
  readonly basis: 'payment';
  readonly metric: CohortMetric;
  /** Показатели, которые есть у сайта: `active` — с ролью «конец доступа» или `paid_until` у клиентов. */
  readonly metrics: readonly CohortMetric[];
  readonly fees: FeesMode;
  readonly baseCurrency: string | null;
  readonly rows: readonly CohortRow[];
  readonly average: readonly CohortAverage[];
};

/** Когорты по приходу: строки — месяцы прихода, столбцы — доли пути, как в «Источниках». */
export type ArrivalCohortsReport = ReportHead & {
  readonly basis: 'arrival';
  readonly columns: readonly SourcesColumn[];
  readonly rows: readonly ArrivalCohortRow[];
  readonly average: ArrivalCohortRow;
};

export type CohortsReport = PaymentCohortsReport | ArrivalCohortsReport;

/** «Сравнение вех»: какая веха лучше предсказывает оплату. */
export type MilestoneComparison = ReportHead & {
  readonly window: PaymentWindow;
  readonly people: number;
  readonly milestones: readonly MilestoneRow[];
};

export type ReportsPorts = {
  readonly store: ReportStore;
  readonly registry: LabelRegistry;
  readonly visits: SiteVisits;
  readonly money: MoneyStore;
  readonly settings: () => AnalyticsSettings;
  readonly setup: () => Setup;
  readonly clock: () => Date;
  /** Без фона сервера — пересчитать отставших по ревизии до отчёта. */
  readonly ensure: () => void;
  readonly stale: () => number;
  /** Смены версий отправителей с сутками сводки в периоде. */
  readonly versions: (period: DayPeriod) => readonly VersionMark[];
};

// Читать дольше 45 дней — таблицу подряд, а не двумя индексами по `OR`: 60 дней людей на 40 000 человек подряд —
// 19 мс против 33, на 10 000 — 4,6 против 6,1; на 30 днях поровну (замер ADR 0072, этап 3, часть 3).
const _SCAN_DAYS = 45;
const _DAY_MS = 86_400_000;
// Когорты по умолчанию — 12 месяцев: `days=365` касается 13 месяцев.
const _COHORT_DAYS = 365;

const _STAGES = ['reached', 'stopped'] as const;
const _ATTRIBUTIONS = ['first', 'return'] as const;
const _BY = ['payment'] as const;
const _METRICS_MONEY: readonly CohortMetric[] = ['cumulative', 'monthly'];
const _NO_WINDOW: MilestoneFact = [null, null, null];

const _NEEDS: ReportNeeds = {
  returns: false,
  answers: false,
  firsts: false,
  dims: false,
  traits: false,
  fees: false,
  access: false,
};

// Группа, которой у «Обзора» нет: расход периода — все строки, только итог.
const _WHOLE: ReportGroup = { kind: 'sender', code: '' };

const _absent = (raw: unknown): boolean =>
  raw === undefined || raw === null || raw === '';

const _groupText = (group: ReportGroup): string =>
  group.code === '' ? group.kind : `${group.kind}:${group.code}`;

const _filtersText = (
  filters: readonly ReportFilter[]
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    filters.map((_) => [
      _.kind === 'sender' ? 'sender' : `${_.kind}.${_.code}`,
      _.value,
    ])
  );

const _isPeople = (step: FunnelStep): boolean =>
  STEP_SIDES[step.kind] === 'people';

const _visitFilter = (step: FunnelStep): VisitFilter =>
  step.kind === 'goal'
    ? { goal: step.goal }
    : step.kind === 'visits' && step.page !== null
      ? { page: step.page }
      : {};

const _byList = (a: ReportPerson, b: ReportPerson): number =>
  a.lastAt < b.lastAt
    ? 1
    : a.lastAt > b.lastAt
      ? -1
      : a.subject < b.subject
        ? 1
        : a.subject > b.subject
          ? -1
          : 0;

const _summary = (spend: ReportSpend | null): SpendSummary | null =>
  spend === null
    ? null
    : {
        scope: spend.scope,
        reason: spend.reason,
        prorated: spend.prorated,
        unassigned: spend.unassigned,
        broader: spend.broader,
      };

const _earlier = (a: string, b: string): string => (a < b ? a : b);

/**
 * Отчёты по таблице людей (ADR 0072): «Источники», воронка, «Метка и ответ», «Обзор», когорты, «Сравнение вех» и
 * список людей с параметрами отчёта. Считаются на лету: постоянный запрос нужных столбцов, сложение — чистые
 * функции `domain/report.ts`, `revenue.ts` и `cohorts.ts`; курсы и расходы — раз на отчёт.
 */
export var defineReports = ({
  store,
  registry,
  visits,
  money,
  settings,
  setup,
  clock,
  ensure,
  stale,
  versions,
}: ReportsPorts) => {
  const clockOf = (test: boolean): ReportClock => ({
    now: clock().toISOString(),
    zone: visits.timeZone(),
    firstArrival: () => store.firstArrival(test),
  });

  const scan = (from: string, now: string): boolean =>
    Date.parse(now) - Date.parse(from) > _SCAN_DAYS * _DAY_MS;

  const headOf = (
    params: Pick<ReportParams, 'period' | 'filters' | 'test'>,
    clocked: ReportClock,
    snapshot: Setup
  ): ReportHead => ({
    from: params.period.from,
    to: params.period.to,
    timeZone: clocked.zone,
    asOf: clocked.now,
    stale: stale(),
    filters: _filtersText(params.filters),
    test: params.test,
    lowData: lowDataOf(snapshot.checks),
  });

  // Реестр нужен только группе «метка целиком»: названия строк и «не из реестра».
  const lookupsOf = (
    snapshot: Setup,
    group: ReportGroup | null
  ): ReportLookups =>
    reportLookups(snapshot, group?.kind === 'label' ? registry.list(null) : []);

  // Всё, что отчёт читает, — по людям, пересчитанным по нынешней ревизии; без фона пересчёт идёт здесь.
  const prepared = (query: ReportQuery, days?: number) =>
    ((snapshot, clocked) => ({
      snapshot,
      clocked,
      params: reportParams(query, snapshot, clocked, days),
    }))((ensure(), setup()), clockOf(queryFlag(query.test, 'test')));

  const cohort = (
    params: Pick<ReportParams, 'moments' | 'filters' | 'test'>,
    lookups: ReportLookups,
    now: string,
    needs: ReportNeeds
  ): ReportPerson[] =>
    cohortOf(
      store.arrived(
        params.moments.from,
        params.moments.to,
        params.test,
        scan(params.moments.from, now),
        needs
      ),
      params,
      lookups
    );

  const funnelSteps = (
    funnel: Funnel,
    people: readonly ReportPerson[],
    now: string
  ): PeopleStep[] =>
    peopleSteps(people, funnel.steps.filter(_isPeople), funnel.strict, now);

  // Перевод в базовую валюту — раз на отчёт: шаги курсов к нынешней базе; без базовой валюты — null.
  const pricingOf = (zone: string): Pricing | null =>
    ((base) =>
      base === null
        ? null
        : definePricing(rateSteps(money.rates(), base, zone)))(
      settings().baseCurrency
    );

  // Расход отчёта: строки месяцев всех его периодов, строка переводится моментом начала своего месяца. Без
  // базовой валюты или без строк расхода у сайта — null: столбцов расхода нет.
  const spendingOf = (
    pricing: Pricing | null,
    periods: readonly DayPeriod[],
    zone: string
  ): ((params: SpendParams, lookups: ReportLookups) => ReportSpend) | null =>
    pricing === null || money.spendCount(null) === 0
      ? null
      : ((rows) =>
          (
            (starts) => (params: SpendParams, lookups: ReportLookups) =>
              spendOf(
                rows,
                params,
                (row) =>
                  pricing.price(
                    row.currency,
                    row.amount,
                    starts.get(row.month) as string
                  ),
                lookups
              )
          )(
            monthStarts(
              rows.map((_) => _.month),
              zone
            )
          ))(
          money.spend(
            monthOf(periods.map((_) => _.from).toSorted()[0] as Day),
            monthOf(
              periods
                .map((_) => _.to)
                .toSorted()
                .at(-1) as Day
            )
          )
        );

  // Значения части группы, на которые деньги тратятся всегда: «расход не введён» вместо «—».
  const awaitingOf = (
    snapshot: Setup,
    group: ReportGroup
  ): ReadonlySet<string> =>
    group.kind === 'part'
      ? new Set(
          awaitingSpend(snapshot)
            .filter((_) => _.dictionary === group.code)
            .map((_) => _.code)
        )
      : new Set();

  return {
    /**
     * «Источники»: строки по группе, итог, ряд по дням; `attribution=return` — по возвращениям. Деньги — в базовой
     * валюте по курсам, LTV со сроком жизни `life`, комиссия по `fees`, расход и CAC; `compare` — итог прошлого
     * периода. Люди читаются один раз — от начала более раннего периода.
     */
    sources: (query: ReportQuery = {}): SourcesReport => {
      const { snapshot, clocked, params } = prepared(query);
      const lookups = lookupsOf(snapshot, params.group);
      const life = queryLife(query.life);
      const fees = queryFees(query.fees);
      const versus = comparePeriod(query, params.period);
      const compared: ReportParams | null =
        versus === null
          ? null
          : {
              ...params,
              period: versus.period,
              moments: momentsOf(versus.period, clocked.zone),
            };
      const pricing = pricingOf(clocked.zone);
      const spending = spendingOf(
        pricing,
        compared === null ? [params.period] : [params.period, compared.period],
        clocked.zone
      );
      const awaiting = awaitingOf(snapshot, params.group);
      const moneyOf = (of: ReportParams): SourcesMoney => ({
        pricing,
        fees,
        life,
        spend: spending === null ? null : spending(of, lookups),
        awaiting,
      });
      const from =
        compared === null
          ? params.moments.from
          : _earlier(compared.moments.from, params.moments.from);
      const people = store.active(
        from,
        params.test,
        scan(from, clocked.now),
        needsOf(params, { fees: fees === 'net' })
      );
      const current = moneyOf(params);
      return {
        ...headOf(params, clocked, snapshot),
        group: _groupText(params.group),
        window: params.window,
        baseCurrency: pricing?.base ?? null,
        life,
        fees,
        ...sourcesOf(
          people,
          params,
          lookups,
          clocked.now,
          dayBounds(params.period, clocked.zone),
          current
        ),
        spend: _summary(current.spend),
        compare:
          compared === null || versus === null
            ? null
            : {
                kind: versus.kind,
                from: compared.period.from,
                to: compared.period.to,
                total: sourcesTotalOf(
                  people,
                  compared,
                  lookups,
                  clocked.now,
                  moneyOf(compared)
                ),
              },
      };
    },
    /**
     * Воронка: шаги-посещения из сводок статистики за те же дни, шаги-люди — по когорте новых людей периода под
     * фильтрами; атрибуция — всегда первое касание, деньги шагов оплаты — до комиссии и в базовой валюте.
     * `compare` — числа и деньги шагов прошлого периода. Нет такой воронки — `analytics.funnel_not_found`.
     */
    funnel: (
      query: ReportQuery & { readonly funnel?: unknown } = {}
    ): FunnelReport => {
      const { snapshot, clocked, params } = prepared(query);
      const funnel = reportFunnel(query.funnel, snapshot);
      const lookups = lookupsOf(snapshot, null);
      const versus = comparePeriod(query, params.period);
      const pricing = pricingOf(clocked.zone);
      const counting = visits.enabled();
      const needs = needsOf(
        { attribution: 'first', filters: params.filters, group: null },
        { firsts: funnel.steps.some((_) => _.kind === 'type') }
      );
      const stepsOf = (of: ReportParams): FunnelStepReport[] =>
        ((results) =>
          funnel.steps.map((step, index) =>
            _isPeople(step)
              ? peopleStepReport(
                  step,
                  results[
                    funnel.steps.slice(0, index).filter(_isPeople).length
                  ] as PeopleStep,
                  pricing,
                  lookups.lowData
                )
              : visitStepReport(
                  step,
                  counting ? visits.sums(of.period, _visitFilter(step)) : null,
                  of.filters,
                  lookups
                )
          ))(
          funnelSteps(
            funnel,
            cohort(of, lookups, clocked.now, needs),
            clocked.now
          )
        );
      return {
        ...headOf(params, clocked, snapshot),
        funnel: {
          code: funnel.code,
          name: funnel.name,
          strict: funnel.strict,
          main: funnel.main,
        },
        baseCurrency: pricing?.base ?? null,
        steps: stepsOf(params),
        visitsSince: funnel.steps.some((_) => !_isPeople(_))
          ? visits.since().origins
          : null,
        compare:
          versus === null
            ? null
            : {
                kind: versus.kind,
                from: versus.period.from,
                to: versus.period.to,
                steps: stepsOf({
                  ...params,
                  period: versus.period,
                  moments: momentsOf(versus.period, clocked.zone),
                }).map((_) => ({ count: _.count, money: _.money })),
              },
      };
    },
    /** «Метка и ответ»: новые люди периода по значениям группы и ответам на вопрос (по умолчанию — первый). */
    answers: (
      query: ReportQuery & { readonly question?: unknown } = {}
    ): AnswersReport =>
      ((ready) =>
        ((question, lookups) => ({
          ...headOf(ready.params, ready.clocked, ready.snapshot),
          group: _groupText(ready.params.group),
          question,
          ...answersOf(
            cohort(
              ready.params,
              lookups,
              ready.clocked.now,
              needsOf(
                { ...ready.params, attribution: 'first' },
                { answers: true }
              )
            ),
            ready.params.group,
            question,
            lookups,
            ready.params.limit
          ),
        }))(
          reportQuestion(query.question, ready.snapshot),
          lookupsOf(ready.snapshot, ready.params.group)
        ))(prepared(query)),
    /**
     * «Обзор»: итоги периода (по умолчанию 30 дней) и прошлого той же длины без фильтров — новые люди и клиенты,
     * выручка до и после комиссии, действующий доступ в конце периода, расход и CAC. Клиенты для доступа — все,
     * по частичному индексу: доступ бывает и у давних.
     */
    overview: (query: ReportQuery = {}): OverviewReport => {
      const { snapshot, clocked, params } = prepared({
        days: query.days,
        from: query.from,
        to: query.to,
        all: query.all,
        test: query.test,
      });
      const lookups = lookupsOf(snapshot, null);
      const previous = previousPeriod(params.period);
      const before = momentsOf(previous, clocked.zone);
      const pricing = pricingOf(clocked.zone);
      const spending = spendingOf(
        pricing,
        [previous, params.period],
        clocked.zone
      );
      const people = store.active(
        before.from,
        params.test,
        scan(before.from, clocked.now),
        { ..._NEEDS, fees: true }
      );
      const customers = store.paid(null, params.moments.to, params.test, {
        ..._NEEDS,
        fees: true,
        access: true,
      });
      const fees = customers.some((_) => _.feeMoney.length > 0);
      const access =
        hasRole(snapshot, 'lapse') ||
        customers.some((_) => _.paidUntil !== null);
      const totals = (
        period: DayPeriod,
        moments: ReportParams['moments']
      ): OverviewTotals =>
        overviewTotals(
          people,
          customers,
          moments,
          clocked.now,
          {
            pricing,
            spend:
              spending === null
                ? null
                : spending(
                    {
                      period,
                      attribution: 'first',
                      group: _WHOLE,
                      filters: [],
                    },
                    lookups
                  ).total,
            fees,
            access,
          },
          snapshot
        );
      return {
        ...headOf(params, clocked, snapshot),
        baseCurrency: pricing?.base ?? null,
        current: totals(params.period, params.moments),
        previous: totals(previous, before),
        compare: previous,
        versions: versions(params.period),
      };
    },
    /**
     * Когорты (по умолчанию 12 месяцев: `days=365`): по первой оплате — клиенты месяца и месяцы жизни 0–12 с
     * показателем `metric` и комиссией по `fees`; по приходу — новые люди месяца и доли пути. Фильтры — по первому
     * касанию. Клиенты читаются по частичному индексу `first_paid_at`.
     */
    cohorts: (query: ReportQuery = {}): CohortsReport => {
      const { snapshot, clocked, params } = prepared(query, _COHORT_DAYS);
      const lookups = lookupsOf(snapshot, null);
      const basis = queryBasis(query.basis, hasRole(snapshot, 'payment'));
      const metric = queryMetric(query.metric);
      const fees = queryFees(query.fees);
      const months = cohortMonths(params.period, clocked.zone);
      const from = (months[0] as (typeof months)[number]).from;
      const to = (months.at(-1) as (typeof months)[number]).to;
      const head = headOf(params, clocked, snapshot);
      const filtered = (people: readonly ReportPerson[]): ReportPerson[] =>
        people.filter((_) =>
          filteredBy(
            _,
            { attribution: 'first', filters: params.filters, moments: null },
            lookups
          )
        );
      const needs = (extra: Partial<ReportNeeds>): ReportNeeds =>
        needsOf(
          { attribution: 'first', filters: params.filters, group: null },
          extra
        );
      return basis === 'arrival'
        ? {
            ...head,
            basis,
            ...arrivalCohortsOf(
              filtered(
                store.arrived(
                  from,
                  to,
                  params.test,
                  scan(from, clocked.now),
                  needs({})
                )
              ),
              months,
              snapshot,
              clocked.now
            ),
          }
        : ((customers) =>
            ((metrics) =>
              metrics.includes(metric)
                ? ((pricing) => ({
                    ...head,
                    basis,
                    metric,
                    metrics,
                    fees,
                    baseCurrency: pricing?.base ?? null,
                    ...paymentCohortsOf(
                      customers,
                      months,
                      {
                        metric,
                        fees,
                        pricing,
                        now: clocked.now,
                        bounds: livedBounds(
                          clocked.now,
                          COHORT_LIMITS.life + 1
                        ),
                      },
                      lookups.lowData
                    ),
                  }))(pricingOf(clocked.zone))
                : fail(
                    'analytics.invalid_query',
                    'The metric active needs access data: an event type with the role lapse or paid_until in payments'
                  ))(
              hasRole(snapshot, 'lapse') ||
                customers.some((_) => _.paidUntil !== null)
                ? [..._METRICS_MONEY, 'active' as const]
                : _METRICS_MONEY
            ))(
            filtered(
              store.paid(
                from,
                to,
                params.test,
                needs({ fees: fees === 'net', access: metric === 'active' })
              )
            )
          );
    },
    /**
     * «Сравнение вех»: у новых людей периода под фильтрами по каждой вехе не в архиве — достигли, не достигли,
     * ещё в окне и доля «Оплаты за окно» (`window`) среди достигших и не достигших.
     */
    milestones: (query: ReportQuery = {}): MilestoneComparison => {
      const { snapshot, clocked, params } = prepared(query);
      const lookups = lookupsOf(snapshot, null);
      const people = cohort(
        params,
        lookups,
        clocked.now,
        needsOf({ attribution: 'first', filters: params.filters, group: null })
      );
      return {
        ...headOf(params, clocked, snapshot),
        window: params.window,
        people: people.length,
        milestones: milestoneComparisonOf(
          people,
          params.window,
          clocked.now,
          snapshot
        ),
      };
    },
    /**
     * Список людей с параметрами отчёта: период по приходу (у `return` — по возвращению, у `by=payment` — по первой
     * оплате), фильтры, достигшие вехи (с `reached=0` — не достигшие), дошедшие до шага воронки или остановившиеся
     * перед ним. Считается по строкам людей, а не по индексу списка.
     */
    people: (query: PeopleQuery): PeoplePage => {
      ensure();
      const snapshot = setup();
      const test = query.test === true;
      const clocked = clockOf(test);
      const period = reportPeriod(query, clocked);
      const moments = period === null ? null : momentsOf(period, clocked.zone);
      const funnel =
        query.funnel === undefined ||
        query.funnel === null ||
        query.funnel === ''
          ? null
          : reportFunnel(query.funnel, snapshot);
      const attribution =
        funnel !== null
          ? 'first'
          : (queryChoice(query.attribution, _ATTRIBUTIONS, 'attribution') ??
            'first');
      const by = queryChoice(query.by, _BY, 'by');
      void (
        by !== null &&
        (attribution !== 'first' || funnel !== null) &&
        fail(
          'analytics.invalid_query',
          'by payment lists customers by their first payment: only with attribution first and without a funnel'
        )
      );
      const filters = reportFilters(query.filters, snapshot);
      const lookups = lookupsOf(snapshot, null);
      const listed = peopleFilter(query, clocked.now);
      const milestone = _absent(query.milestone)
        ? null
        : (snapshot.milestones.find((_) => _.code === query.milestone)?.code ??
          fail(
            'analytics.invalid_query',
            `There is no milestone ${String(query.milestone)}`
          ));
      const reached = _absent(query.reached)
        ? true
        : milestone === null
          ? fail(
              'analytics.invalid_query',
              'reached goes with milestone: reached=0 lists people who missed it'
            )
          : queryFlag(query.reached, 'reached');
      const needs = needsOf(
        { attribution, filters, group: null },
        { firsts: funnel?.steps.some((_) => _.kind === 'type') === true }
      );
      const rows =
        by !== null
          ? moments === null
            ? store.all(test, needs).filter((_) => _.firstPaidAt !== null)
            : store.paid(moments.from, moments.to, test, needs)
          : moments === null
            ? store.all(test, needs)
            : attribution === 'first'
              ? store.arrived(
                  moments.from,
                  moments.to,
                  test,
                  scan(moments.from, clocked.now),
                  needs
                )
              : store.active(
                  moments.from,
                  test,
                  scan(moments.from, clocked.now),
                  needs
                );
      const chosen = rows.filter(
        (person) =>
          filteredBy(
            person,
            { attribution, filters, moments: by === null ? moments : null },
            lookups
          ) &&
          (listed.state === null ||
            stateOf(person, clocked.now) === (listed.state as PersonState)) &&
          (listed.sender === null || person.senders.includes(listed.sender)) &&
          (listed.prefix === null ||
            person.subject.startsWith(listed.prefix)) &&
          (!listed.conflict || person.firstTouchConflict) &&
          (milestone === null ||
            ((fact) =>
              reached
                ? fact[0] !== null
                : milestoneStateOf(fact, clocked.now) === 'missed')(
              Object.hasOwn(person.milestones, milestone)
                ? (person.milestones[milestone] as MilestoneFact)
                : _NO_WINDOW
            ))
      );
      const selected =
        funnel === null
          ? chosen
          : ((subjects) => chosen.filter((_) => subjects.has(_.subject)))(
              _stageOf(funnel, query, chosen, clocked.now, funnelSteps)
            );
      const page = selected
        .toSorted(_byList)
        .slice(listed.offset, listed.offset + listed.limit);
      return {
        people: store
          .facts(page.map((_) => _.subject))
          .map((_) =>
            listedView(
              personView(_, snapshot, clocked.now),
              stateOf(_, clocked.now)
            )
          ),
        total: selected.length,
        stale: stale(),
      };
    },
  };
};

// Шаг воронки для списка: номер с нуля среди всех шагов, только шаг-человек; дошли — засчитаны на нём,
// остановились — засчитаны на шаге-человеке перед ним (у первого — вся когорта), а на нём — нет.
const _stageOf = (
  funnel: Funnel,
  query: PeopleQuery,
  cohort: readonly ReportPerson[],
  now: string,
  steps: (
    funnel: Funnel,
    people: readonly ReportPerson[],
    now: string
  ) => PeopleStep[]
): ReadonlySet<string> =>
  ((index, stage) =>
    index === null || !_isPeople(funnel.steps[index] as FunnelStep)
      ? fail(
          'analytics.invalid_query',
          'step is the number of a step of people in the funnel, from 0'
        )
      : ((results, at) =>
          ((reached) =>
            stage === 'stopped'
              ? new Set(
                  (at === 0 ? cohort : (results[at - 1] as PeopleStep).counted)
                    .map((_) => _.subject)
                    .filter((_) => !reached.has(_))
                )
              : reached)(
            new Set((results[at] as PeopleStep).counted.map((_) => _.subject))
          ))(
          steps(funnel, cohort, now),
          funnel.steps.slice(0, index).filter(_isPeople).length
        ))(
    queryWhole(query.step, 'step', 0, funnel.steps.length - 1),
    queryChoice(query.stage, _STAGES, 'stage') ?? 'reached'
  );

export type Reports = ReturnType<typeof defineReports>;
