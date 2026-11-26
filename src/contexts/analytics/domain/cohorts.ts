import { lifeMonth, type Month, shiftMonths } from './days.ts';
import { divideRound } from './money.ts';
import { accessIn } from './person.ts';
import { type LowDataThresholds, lowDataOf } from './quality.ts';
import {
  columnMilestones,
  hasRole,
  LOW_DATA,
  milestoneShare,
  paymentShare,
  type ReportPerson,
  type Share,
  type SourcesColumn,
  trialShare,
} from './report.ts';
import {
  type FeesMode,
  flowsOf,
  livedMonths,
  type Pricing,
  worthOf,
} from './revenue.ts';
import type { Setup } from './setup.ts';

/** Когорты по первой оплате (клиенты) или по приходу (новые люди). */
export type CohortBasis = 'payment' | 'arrival';
export var COHORT_BASES: readonly CohortBasis[] = ['payment', 'arrival'];

/** Накопленная выручка на клиента, выручка месяца на клиента, доля клиентов с доступом. */
export type CohortMetric = 'cumulative' | 'monthly' | 'active';
export var COHORT_METRICS: readonly CohortMetric[] = [
  'cumulative',
  'monthly',
  'active',
];

export var COHORT_LIMITS = {
  /** Месяцев-строк в отчёте. */
  months: 121,
  /** Последний месяц жизни: столбцы 0–12. */
  life: 12,
} as const;

/** Полная — прожили все; неполная — не все, но кто-то дошёл до месяца; будущая — не дошёл никто. */
export type CohortState = 'complete' | 'incomplete' | 'future';

export type CohortCell = {
  readonly state: CohortState;
  /** Прожили месяц k целиком: у полной ячейки — все клиенты когорты. */
  readonly base: number;
  /** cumulative, monthly — минимальные единицы базовой валюты на клиента; active — сколько с доступом. */
  readonly value: number | null;
  /** У кого-то из проживших сумма без курса: в среднее не входит. */
  readonly unpriced: boolean;
  readonly staleRate: boolean;
};

export type CohortRow = {
  readonly month: Month;
  readonly customers: number;
  /** Месяц ещё идёт: клиенты прибавляются. */
  readonly open: boolean;
  readonly lowData: boolean;
  /** Месяцы жизни 0–12. */
  readonly cells: readonly CohortCell[];
};

/** Среднее месяца жизни по полным ячейкам без сумм без курса, взвешенное по клиентам. */
export type CohortAverage = {
  /** Деньги — минимальные единицы на клиента; active — сколько с доступом из `customers`; null — ячеек нет. */
  readonly value: number | null;
  readonly cohorts: number;
  readonly customers: number;
};

/** Месяц-строка когорты: начало и начало следующего месяца — моментами UTC пояса отчётов. */
export type CohortMonth = {
  readonly month: Month;
  readonly from: string;
  readonly to: string;
};

/** Что считают когорты по первой оплате. */
export type PaymentCohortSpec = {
  readonly metric: CohortMetric;
  readonly fees: FeesMode;
  /** null — у сайта нет базовой валюты: денег у ячеек нет, `active` считается. */
  readonly pricing: Pricing | null;
  readonly now: string;
  /** `livedBounds(сейчас, 13)`: прожил месяц k целиком — первая оплата не позже границы k + 1. */
  readonly bounds: readonly string[];
};

const _LIFE = COHORT_LIMITS.life + 1;

/** Месяц жизни клиента: сумма в базовой валюте, есть ли в ней суммы без курса и по курсу прошлого месяца. */
type _Bin = {
  readonly value: bigint;
  readonly unpriced: boolean;
  readonly stale: boolean;
};

const _EMPTY: _Bin = { value: 0n, unpriced: false, stale: false };

/** Клиент когорты: сколько месяцев прожил, деньги и доступ по месяцам жизни 0–12. */
type _Life = {
  readonly months: number;
  readonly bins: readonly _Bin[];
  readonly access: readonly boolean[];
};

const _add = (bin: _Bin, value: bigint | null, stale: boolean): _Bin => ({
  value: bin.value + (value ?? 0n),
  unpriced: bin.unpriced || value === null,
  stale: bin.stale || stale,
});

const _join = (a: _Bin, b: _Bin): _Bin => ({
  value: a.value + b.value,
  unpriced: a.unpriced || b.unpriced,
  stale: a.stale || b.stale,
});

const _prefix = (bins: readonly _Bin[]): _Bin[] =>
  bins.reduce<_Bin[]>(
    (all, bin) => [...all, _join(all.at(-1) ?? _EMPTY, bin)],
    []
  );

// Деньги по месяцам жизни: месяц записи считается раз; у `cumulative` — сразу накопленное к концу месяца.
const _bins = (
  customer: ReportPerson,
  spec: PaymentCohortSpec
): readonly _Bin[] =>
  ((pricing) =>
    pricing === null
      ? []
      : ((marked) =>
          ((months) =>
            spec.metric === 'cumulative' ? _prefix(months) : months)(
            Array.from({ length: _LIFE }, (_, month) =>
              marked.reduce(
                (bin, entry) =>
                  entry.month === month
                    ? _add(bin, entry.value, entry.stale)
                    : bin,
                _EMPTY
              )
            )
          ))(
          worthOf(flowsOf(customer, spec.fees), pricing).map((_) => ({
            month: lifeMonth(customer.firstPaidAt as string, _.at),
            value: _.priced.value,
            stale: _.priced.stale,
          }))
        ))(spec.metric === 'active' ? null : spec.pricing);

// Доступ в каждом прожитом месяце жизни: 14 границ `shiftMonths` на клиента — только у показателя `active`.
const _access = (
  customer: ReportPerson,
  months: number,
  spec: PaymentCohortSpec
): readonly boolean[] =>
  spec.metric !== 'active'
    ? []
    : ((edges) =>
        Array.from({ length: Math.min(months, _LIFE) }, (_, month) =>
          accessIn(
            customer.access,
            edges[month] as string,
            edges[month + 1] as string
          )
        ))(
        Array.from({ length: Math.min(months, _LIFE) + 1 }, (_, n) =>
          shiftMonths(customer.firstPaidAt as string, n)
        )
      );

const _life = (customer: ReportPerson, spec: PaymentCohortSpec): _Life =>
  ((months) => ({
    months,
    bins: _bins(customer, spec),
    access: _access(customer, months, spec),
  }))(livedMonths(customer.firstPaidAt as string, spec.bounds));

type _Cell = CohortCell & {
  /** Сумма проживших (деньги) или сколько с доступом: среднее складывает её, а не значение на клиента. */
  readonly sum: bigint;
};

const _cell = (
  lives: readonly _Life[],
  month: number,
  open: boolean,
  spec: PaymentCohortSpec
): _Cell =>
  ((lived) =>
    ((state: CohortState) =>
      ((sum) => ({
        state,
        base: state === 'future' ? 0 : lived.length,
        value:
          state === 'future' ||
          lived.length === 0 ||
          (spec.metric !== 'active' && spec.pricing === null)
            ? null
            : spec.metric === 'active'
              ? Number(sum.value)
              : Number(divideRound(sum.value, BigInt(lived.length))),
        unpriced: sum.unpriced,
        staleRate: sum.stale,
        sum: sum.value,
      }))(
        spec.metric === 'active'
          ? {
              value: BigInt(
                lived.filter((_) => _.access[month] === true).length
              ),
              unpriced: false,
              stale: false,
            }
          : lived.map((_) => _.bins[month] ?? _EMPTY).reduce(_join, _EMPTY)
      ))(
      lives.length > 0 && !open && lived.length === lives.length
        ? 'complete'
        : lives.some((_) => _.months >= month)
          ? 'incomplete'
          : 'future'
    ))(lives.filter((_) => _.months >= month + 1));

/**
 * Когорты по первой оплате: строка — месяц первой оплаты (`months` — все месяцы периода, от старых к новым),
 * столбцы — месяцы жизни 0–12 от первой оплаты каждого клиента. Ячейка — по клиентам, прожившим месяц k целиком;
 * месяц, который ещё идёт, полных ячеек не имеет. Среднее — по полным ячейкам без сумм без курса, по клиентам.
 */
export var paymentCohortsOf = (
  customers: readonly ReportPerson[],
  months: readonly CohortMonth[],
  spec: PaymentCohortSpec,
  low: LowDataThresholds = LOW_DATA
): {
  readonly rows: CohortRow[];
  readonly average: CohortAverage[];
} =>
  ((rows) => ({
    rows: rows.map(({ cells, ...row }) => ({
      ...row,
      cells: cells.map(({ sum: _sum, ...cell }) => cell),
    })),
    average: Array.from({ length: _LIFE }, (_, month) =>
      ((complete) =>
        ((customers) => ({
          value:
            complete.length === 0 ||
            (spec.metric !== 'active' && spec.pricing === null)
              ? null
              : spec.metric === 'active'
                ? Number(complete.reduce((sum, _) => sum + _.sum, 0n))
                : Number(
                    divideRound(
                      complete.reduce((sum, _) => sum + _.sum, 0n),
                      BigInt(customers)
                    )
                  ),
          cohorts: complete.length,
          customers,
        }))(complete.reduce((sum, _) => sum + _.base, 0)))(
        rows
          .map((_) => _.cells[month] as _Cell)
          .filter((_) => _.state === 'complete' && !_.unpriced)
      )
    ),
  }))(
    months.map((month) =>
      ((members, open) =>
        ((lives) => ({
          month: month.month,
          customers: members.length,
          open,
          lowData: members.length < low.customers,
          cells: Array.from({ length: _LIFE }, (_, k) =>
            _cell(lives, k, open, spec)
          ),
        }))(members.map((_) => _life(_, spec))))(
        customers.filter(
          (_) =>
            _.firstPaidAt !== null &&
            _.firstPaidAt >= month.from &&
            _.firstPaidAt < month.to
        ),
        spec.now < month.to
      )
    )
  );

/** Когорта по приходу: новые люди месяца, вехи-столбцы, пробный период, оплата за 7 и 30 дней, клиенты на сегодня. */
export type ArrivalCohortRow = {
  /** У среднего — пусто. */
  readonly month: Month;
  readonly people: number;
  readonly open: boolean;
  readonly lowData: boolean;
  readonly milestones: Readonly<Record<string, Share>>;
  readonly trial: Share | null;
  readonly payment7: Share | null;
  readonly payment30: Share | null;
  /** Клиенты на сегодня; null — у сайта нет роли «оплата». */
  readonly customers: number | null;
};

const _sumShares = (shares: readonly Share[]): Share => ({
  count: shares.reduce((sum, _) => sum + _.count, 0),
  base: shares.reduce((sum, _) => sum + _.base, 0),
  open: 0,
});

// Доля в среднем — только полные ячейки: без «ещё в окне» и не из месяца, который идёт.
const _completeShares = (
  rows: readonly ArrivalCohortRow[],
  share: (row: ArrivalCohortRow) => Share | null
): Share | null =>
  ((shares) => (shares.length === 0 ? null : _sumShares(shares)))(
    rows.flatMap((row) =>
      ((found) =>
        found === null || row.open || found.open > 0 ? [] : [found])(share(row))
    )
  );

/**
 * Когорты по приходу: строка — месяц прихода и его новые люди, доли — по правилам «Источников». Ячейка неполная,
 * если в ней есть «ещё в окне» или месяц ещё идёт. Среднее — Σ засчитанных / Σ знаменателей по полным ячейкам.
 */
export var arrivalCohortsOf = (
  people: readonly ReportPerson[],
  months: readonly CohortMonth[],
  setup: Setup,
  now: string
): {
  readonly columns: SourcesColumn[];
  readonly rows: ArrivalCohortRow[];
  readonly average: ArrivalCohortRow;
} =>
  ((milestones, trial, payment, low) =>
    ((rows) => ({
      columns: [
        { kind: 'people' as const },
        ...milestones.map((_) => ({
          kind: 'milestone' as const,
          code: _.code,
          name: _.name,
        })),
        ...(trial ? [{ kind: 'trial' as const }] : []),
        ...(payment
          ? (['payment7', 'payment30', 'customers'] as const).map((kind) => ({
              kind,
            }))
          : []),
      ],
      rows,
      average: ((total) => ({
        month: '',
        people: total,
        open: false,
        lowData: total < low.people,
        milestones: Object.fromEntries(
          milestones.map((milestone) => [
            milestone.code,
            _completeShares(
              rows,
              (_) => _.milestones[milestone.code] ?? null
            ) ?? { count: 0, base: 0, open: 0 },
          ])
        ),
        trial: trial ? _completeShares(rows, (_) => _.trial) : null,
        payment7: payment ? _completeShares(rows, (_) => _.payment7) : null,
        payment30: payment ? _completeShares(rows, (_) => _.payment30) : null,
        customers: payment
          ? rows.reduce((sum, _) => sum + (_.customers ?? 0), 0)
          : null,
      }))(rows.reduce((sum, _) => sum + _.people, 0)),
    }))(
      months.map(
        (month): ArrivalCohortRow =>
          ((cohort) => ({
            month: month.month,
            people: cohort.length,
            open: now < month.to,
            lowData: cohort.length < low.people,
            milestones: Object.fromEntries(
              milestones.map((_) => [
                _.code,
                milestoneShare(cohort, _.code, now),
              ])
            ),
            trial: trial ? trialShare(cohort) : null,
            payment7: payment ? paymentShare(cohort, 7, now) : null,
            payment30: payment ? paymentShare(cohort, 30, now) : null,
            customers: payment
              ? cohort.filter((_) => _.firstPaidAt !== null).length
              : null,
          }))(
            people.filter(
              (_) => _.arrivedAt >= month.from && _.arrivedAt < month.to
            )
          )
      )
    ))(
    columnMilestones(setup),
    hasRole(setup, 'trial'),
    hasRole(setup, 'payment'),
    lowDataOf(setup.checks)
  );
