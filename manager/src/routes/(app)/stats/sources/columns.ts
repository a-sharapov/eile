import {
  type Change,
  percentChange,
  pointsChange,
  shareRate,
} from '#lib/analytics-reports.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import type {
  ReturnRow,
  Share,
  SourcesColumn,
  SourcesReport,
  SourcesRow,
} from '#lib/types.ts';

// Столбцы «Источников»: подпись, определение и изменение к прошлому периоду — для таблицы и выгрузки CSV.

type Kind = Exclude<SourcesColumn['kind'], 'milestone'>;

const _COLUMNS: Readonly<Record<Kind, readonly [MessageKey, MessageKey]>> = {
  people: ['sources.colPeople', 'sources.defPeople'],
  trial: ['sources.colTrial', 'sources.defTrial'],
  payment: ['sources.colPayment30', 'sources.defPayment'],
  customers: ['sources.colCustomers', 'sources.defCustomers'],
  revenue: ['sources.colRevenue', 'sources.defRevenue'],
  perCustomer: ['sources.colPerCustomer', 'sources.defPerCustomer'],
  renewal: ['sources.colRenewal', 'sources.defRenewal'],
  ltvCustomer: ['sources.colLtvCustomer', 'sources.defLtvCustomer'],
  ltvPerson: ['sources.colLtvPerson', 'sources.defLtvPerson'],
  spend: ['sources.colSpend', 'sources.defSpend'],
  cac: ['sources.colCac', 'sources.defCac'],
  costPerPerson: ['sources.colCostPerPerson', 'sources.defCostPerPerson'],
  ltvCac: ['sources.colLtvCac', 'sources.defLtvCac'],
  payback: ['sources.colPayback', 'sources.defPayback'],
  returned: ['sources.colReturned', 'sources.defReturned'],
  payments: ['sources.colPayments', 'sources.defPayments'],
  payment7: ['sources.colPayment7', 'sources.defPayment'],
  payment30: ['sources.colPayment30', 'sources.defPayment'],
};

const _WINDOW_COLUMNS: Readonly<Record<number, MessageKey>> = {
  7: 'sources.colPayment7',
  30: 'sources.colPayment30',
  0: 'sources.colPayment0',
};

const _LIFE: Readonly<Record<number, MessageKey>> = {
  0: 'sources.lifeAll',
  3: 'sources.life3',
  6: 'sources.life6',
  12: 'sources.life12',
};

type ReportLike = Pick<
  SourcesReport,
  'window' | 'attribution' | 'life' | 'fees' | 'baseCurrency'
>;

/** Ключ столбца: у вехи — с её кодом. */
export var columnKey = (column: SourcesColumn): string =>
  column.kind === 'milestone' ? `milestone:${column.code}` : column.kind;

export var columnName = (report: ReportLike, column: SourcesColumn): string =>
  column.kind === 'milestone'
    ? column.name
    : column.kind === 'payment'
      ? t(_WINDOW_COLUMNS[report.window] ?? 'sources.colPayment30')
      : column.kind === 'revenue' && report.attribution === 'return'
        ? t('sources.colRevenueReturn')
        : t(_COLUMNS[column.kind][0]);

/** Что значит столбец; у денег — в какой валюте, до или после комиссии и какой срок жизни. */
export var columnDefinition = (
  report: ReportLike,
  column: SourcesColumn
): string =>
  column.kind === 'milestone'
    ? t('sources.defMilestone', { name: column.name })
    : column.kind === 'payment'
      ? t(report.window === 0 ? 'sources.defPayment0' : 'sources.defPayment', {
          n: report.window,
        })
      : column.kind === 'revenue'
        ? [
            t(
              report.attribution === 'return'
                ? 'sources.defRevenueReturn'
                : 'sources.defRevenue'
            ),
            report.baseCurrency === null
              ? ''
              : t('sources.defRevenueBase', { currency: report.baseCurrency }),
            t(report.fees === 'net' ? 'sources.defNet' : 'sources.defGross'),
          ]
            .filter(Boolean)
            .join(' ')
        : column.kind === 'ltvCustomer' || column.kind === 'ltvPerson'
          ? `${t(_COLUMNS[column.kind][1])} ${t(_LIFE[report.life] ?? 'sources.lifeAll')} ${t(report.fees === 'net' ? 'sources.defNet' : 'sources.defGross')}`
          : t(_COLUMNS[column.kind][1], { n: report.window });

export type ColumnChange = {
  readonly change: Change;
  /** Меньше — лучше: цвет обратный. */
  readonly lowerBetter: boolean;
  /** Без оценки: расход. */
  readonly neutral: boolean;
};

const _share = (
  row: SourcesRow | ReturnRow,
  pick: (row: SourcesRow) => Share | null | undefined
) =>
  'people' in row
    ? ((share) => (share ? shareRate(share) : null))(pick(row))
    : null;

const _first = <T>(
  row: SourcesRow | ReturnRow,
  pick: (row: SourcesRow) => T
): T | null => ('people' in row ? pick(row) : null);

const _back = <T>(
  row: SourcesRow | ReturnRow,
  pick: (row: ReturnRow) => T
): T | null => ('returned' in row ? pick(row) : null);

// Выручка одной цифрой: в базовой валюте, без неё — если у обоих периодов одна и та же единственная валюта.
const _revenue = (
  row: SourcesRow | ReturnRow
): readonly [string, number] | null =>
  row.revenueBase !== null && row.revenue !== null
    ? ['', row.revenueBase.value]
    : ((entries) => (entries.length === 1 ? entries[0]! : null))(
        Object.entries(row.revenue ?? {})
      );

const _CHANGES: Readonly<
  Record<
    Kind,
    (
      now: SourcesRow | ReturnRow,
      before: SourcesRow | ReturnRow
    ) => Change | null
  >
> = {
  people: (now, before) =>
    percentChange(
      _first(now, (_) => _.people),
      _first(before, (_) => _.people)
    ),
  trial: (now, before) =>
    pointsChange(
      _share(now, (_) => _.trial),
      _share(before, (_) => _.trial)
    ),
  payment: (now, before) =>
    pointsChange(
      _share(now, (_) => _.payment),
      _share(before, (_) => _.payment)
    ),
  customers: (now, before) =>
    percentChange(
      _first(now, (_) => _.customers),
      _first(before, (_) => _.customers)
    ),
  revenue: (now, before) =>
    ((a, b) =>
      a !== null && b !== null && a[0] === b[0]
        ? percentChange(a[1], b[1])
        : null)(_revenue(now), _revenue(before)),
  perCustomer: (now, before) =>
    ((ratio) => percentChange(ratio(now), ratio(before)))(
      (row: SourcesRow | ReturnRow) =>
        _first(row, (_) =>
          _.perCustomer && _.perCustomer.customers > 0
            ? _.perCustomer.payments / _.perCustomer.customers
            : null
        )
    ),
  renewal: (now, before) =>
    pointsChange(
      _share(now, (_) => _.renewal),
      _share(before, (_) => _.renewal)
    ),
  ltvCustomer: (now, before) =>
    percentChange(
      _first(now, (_) => _.ltvCustomer?.value),
      _first(before, (_) => _.ltvCustomer?.value)
    ),
  ltvPerson: (now, before) =>
    percentChange(
      _first(now, (_) => _.ltvPerson?.value),
      _first(before, (_) => _.ltvPerson?.value)
    ),
  spend: (now, before) =>
    percentChange(
      _first(now, (_) => _.spend?.value),
      _first(before, (_) => _.spend?.value)
    ),
  cac: (now, before) =>
    percentChange(
      _first(now, (_) => _.cac),
      _first(before, (_) => _.cac)
    ),
  costPerPerson: (now, before) =>
    percentChange(
      _first(now, (_) => _.costPerPerson),
      _first(before, (_) => _.costPerPerson)
    ),
  ltvCac: (now, before) =>
    percentChange(
      _first(now, (_) => _.ltvCac),
      _first(before, (_) => _.ltvCac)
    ),
  payback: (now, before) =>
    ((a, b) =>
      a === null || a === undefined || b === null || b === undefined
        ? null
        : { kind: 'months', value: a - b })(
      _first(now, (_) => _.payback?.months),
      _first(before, (_) => _.payback?.months)
    ),
  returned: (now, before) =>
    percentChange(
      _back(now, (_) => _.returned),
      _back(before, (_) => _.returned)
    ),
  payments: (now, before) =>
    percentChange(
      _back(now, (_) => _.payments),
      _back(before, (_) => _.payments)
    ),
  payment7: () => null,
  payment30: () => null,
};

const _LOWER_BETTER: ReadonlySet<string> = new Set([
  'cac',
  'costPerPerson',
  'payback',
]);

/** Изменение числа итога к прошлому периоду; сравнить нечего — null. */
export var changeOf = (
  column: SourcesColumn,
  now: SourcesRow | ReturnRow,
  before: SourcesRow | ReturnRow
): ColumnChange | null =>
  ((change) =>
    change === null
      ? null
      : {
          change,
          lowerBetter: _LOWER_BETTER.has(column.kind),
          neutral: column.kind === 'spend',
        })(
    column.kind === 'milestone'
      ? pointsChange(
          _share(now, (_) => _.milestones[column.code]),
          _share(before, (_) => _.milestones[column.code])
        )
      : _CHANGES[column.kind](now, before)
  );
