import { COHORT_LIFE, shareRate } from '#lib/analytics-reports.ts';
import { type CsvCell, type CsvRow, csvMoney, csvPercent } from '#lib/csv.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import type {
  ArrivalCohortRow,
  CohortAverage,
  CohortCell,
  CohortMetric,
  CohortRow,
  CohortsReport,
  ReportHead,
  Share,
  SourcesColumn,
} from '#lib/types.ts';
import { columnName } from '../sources/columns.ts';

// Когорты (ADR 0072, «Когорты»): тепловая шкала ячеек, состояние ячейки, кто вошёл в среднее, адрес людей
// когорты и выгрузка в CSV — чистые функции экрана, их проверяет tests/manager-analytics.test.ts.

export type PaymentCohorts = Extract<CohortsReport, { basis: 'payment' }>;
export type ArrivalCohorts = Extract<CohortsReport, { basis: 'arrival' }>;

/** Ступеней тепловой шкалы. */
export var HEAT_STEPS = 5;

/**
 * Величина ячейки для шкалы: деньги — на клиента, доступ — доля с доступом из проживших месяц. Будущей ячейке и
 * ячейке без значения красить нечего — null.
 */
export var cellMeasure = (
  cell: CohortCell,
  metric: CohortMetric
): number | null =>
  cell.state === 'future' || cell.value === null
    ? null
    : metric === 'active'
      ? cell.base > 0
        ? cell.value / cell.base
        : null
      : cell.value;

export type HeatScale = { readonly min: number; readonly max: number };

/** Столбцы месяцев жизни на экране: до последнего, где есть хоть одна не будущая ячейка или среднее; хотя бы один. */
export var lifeColumns = (report: PaymentCohorts): number =>
  Math.max(
    1,
    (Array.from({ length: COHORT_LIFE + 1 }, (_, k) => k).findLast(
      (k) =>
        report.rows.some(
          (row) => (row.cells[k]?.state ?? 'future') !== 'future'
        ) || (report.average[k]?.value ?? null) !== null
    ) ?? -1) + 1
  );

/** Шкала по ячейкам таблицы — полным и неполным, со значением; таких нет — null. */
export var heatScale = (
  rows: readonly CohortRow[],
  metric: CohortMetric
): HeatScale | null =>
  ((values) =>
    values.length === 0
      ? null
      : { min: Math.min(...values), max: Math.max(...values) })(
    rows.flatMap((row) =>
      row.cells.flatMap((cell) =>
        ((value) => (value === null ? [] : [value]))(cellMeasure(cell, metric))
      )
    )
  );

/** Ступень 0–4 от меньшего к большему; все значения равны — средняя. */
export var heatStep = (value: number, scale: HeatScale): number =>
  scale.max === scale.min
    ? Math.floor(HEAT_STEPS / 2)
    : Math.min(
        HEAT_STEPS - 1,
        Math.floor(((value - scale.min) / (scale.max - scale.min)) * HEAT_STEPS)
      );

/** Нижняя граница каждой ступени: для легенды «от … до …». */
export var heatBounds = (scale: HeatScale): number[] =>
  Array.from(
    { length: HEAT_STEPS },
    (_, step) => scale.min + ((scale.max - scale.min) * step) / HEAT_STEPS
  );

/**
 * Ячейка словами для читалки: неполная — «неполная: прожили 1 из 2» (не прожил никто — «неполная: месяц ещё не
 * прожит»), будущая — «ещё не наступил»; без курса и по курсу прошлого месяца — тоже словами.
 */
export var cellWords = (cell: CohortCell, row: CohortRow): string =>
  [
    cell.state === 'future'
      ? t('cohorts.future')
      : cell.state === 'incomplete'
        ? cell.base > 0
          ? t('cohorts.incompleteSr', { count: cell.base, base: row.customers })
          : t('cohorts.incompleteNoneSr')
        : '',
    cell.unpriced ? t('cohorts.unpricedSr') : '',
    cell.staleRate ? t('sources.staleShort') : '',
  ]
    .filter(Boolean)
    .join(', ');

/**
 * Когорты, вошедшие в среднее месяца жизни k, — как у сервера: полные ячейки без сумм без курса; неполные и
 * когорта месяца, который ещё идёт, не входят.
 */
export var averageMembers = (
  rows: readonly CohortRow[],
  k: number
): CohortRow[] =>
  rows.filter(
    (row) =>
      !row.open &&
      row.cells[k]?.state === 'complete' &&
      row.cells[k]?.unpriced === false &&
      row.customers > 0
  );

/**
 * Месяц когорты коротко: «февр. 2026», «Feb 2026», «Feb. 2026» — без «г.»: в узкой закреплённой колонке месяц
 * помещается в строку. Полностью («февраль 2026 г.») — в подсказках.
 */
export var monthShort = (month: string, language: string): string =>
  new Intl.DateTimeFormat(language, {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  })
    .formatToParts(Date.parse(`${month}-01T00:00:00Z`))
    .filter((_) => _.type !== 'literal' || _.value.trim() === '')
    .map((_) => _.value)
    .join('')
    .trim();

/** Последний день месяца `ГГГГ-ММ`. */
export var monthEnd = (month: string): string =>
  `${month}-${String(
    new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
    ).getUTCDate()
  ).padStart(2, '0')}`;

/**
 * Люди когорты в списке «Людей»: месяц — днями от первого до последнего (не позже сегодня в поясе отчёта), по
 * первой оплате — `by=payment`, по приходу — без него; фильтры и тестовые — те же, что у отчёта.
 */
export var cohortPeople = (
  month: string,
  basis: CohortsReport['basis'],
  report: Pick<ReportHead, 'filters' | 'test'>,
  today: string
): URLSearchParams =>
  new URLSearchParams([
    ...(basis === 'payment' ? [['by', 'payment'] as [string, string]] : []),
    ['from', `${month}-01`],
    ['to', ((end) => (end > today ? today : end))(monthEnd(month))],
    ...Object.entries(report.filters),
    ...(report.test ? [['test', '1'] as [string, string]] : []),
  ]);

const _METRIC_NAMES: Readonly<Record<CohortMetric, MessageKey>> = {
  cumulative: 'cohorts.metricCumulative',
  monthly: 'cohorts.metricMonthly',
  active: 'cohorts.metricActive',
};

export var metricName = (metric: CohortMetric): string =>
  t(_METRIC_NAMES[metric]);

const _notes = (...notes: (string | false)[]): string | null =>
  notes.filter(Boolean).join('; ') || null;

const _stateWord = (cell: CohortCell): string =>
  t(cell.state === 'complete' ? 'cohorts.complete' : 'cohorts.incomplete');

/**
 * Когорты по первой оплате в CSV — длинной таблицей: строка на «когорта × месяц жизни» без будущих ячеек, со
 * значением, прожившими и состоянием, под ними — среднее по месяцам жизни (без пустых). Деньги — в базовой валюте,
 * доступ — числом и процентом; отметки словами.
 */
export var paymentCohortsCsv = (report: PaymentCohorts): CsvRow[] =>
  ((active, base) =>
    ((values: (cell: { value: number | null; base: number }) => CsvCell[]) => [
      [
        t('cohorts.colMonth'),
        t('cohorts.colCustomers'),
        t('cohorts.lifeMonth'),
        t('cohorts.csvState'),
        t('cohorts.csvLived'),
        ...(active
          ? [t('cohorts.csvWithAccess'), t('cohorts.csvWithAccessPercent')]
          : [
              t(base === null ? 'cohorts.csvMoneyNoBase' : 'cohorts.csvMoney', {
                metric: metricName(report.metric),
                fees: t(
                  report.fees === 'net'
                    ? 'cohorts.feesNetShort'
                    : 'cohorts.feesGrossShort'
                ),
                currency: base ?? '',
              }),
            ]),
        t('cohorts.csvCohorts'),
        t('csv.lowData'),
        t('cohorts.csvNotes'),
      ],
      ...report.rows.flatMap((row) =>
        row.cells.flatMap((cell, k): CsvRow[] =>
          cell.state === 'future'
            ? []
            : [
                [
                  row.month,
                  row.customers,
                  k,
                  _stateWord(cell),
                  cell.base,
                  ...values(cell),
                  null,
                  row.lowData ? t('report.lowData') : null,
                  _notes(
                    row.open && t('cohorts.csvOpen'),
                    cell.unpriced && t('csv.noRate'),
                    cell.staleRate && t('csv.stale')
                  ),
                ],
              ]
        )
      ),
      ...report.average.flatMap((average: CohortAverage, k): CsvRow[] =>
        average.value === null
          ? []
          : [
              [
                t('cohorts.average'),
                average.customers,
                k,
                null,
                null,
                ...values({ value: average.value, base: average.customers }),
                average.cohorts,
                null,
                null,
              ],
            ]
      ),
    ])((cell) =>
      active
        ? [
            cell.value,
            csvPercent(
              cell.value === null || cell.base === 0
                ? null
                : cell.value / cell.base
            ),
          ]
        : [base === null ? null : csvMoney(cell.value, base)]
    ))(report.metric === 'active', report.baseCurrency);

const _share = (share: Share | null | undefined): CsvCell[] =>
  share
    ? [share.count, share.base, share.open, csvPercent(shareRate(share))]
    : [null, null, null, null];

const _shareHeaders = (name: string): string[] => [
  t('csv.counted', { name }),
  t('csv.base', { name }),
  t('csv.open', { name }),
  t('csv.percent', { name }),
];

/** Столбцы-доли когорт по приходу: вехи, пробный период, оплата за 7 и за 30 дней. */
export var arrivalShares = (
  columns: readonly SourcesColumn[]
): SourcesColumn[] =>
  columns.filter((_) => _.kind !== 'people' && _.kind !== 'customers');

export var arrivalShare = (
  row: ArrivalCohortRow,
  column: SourcesColumn
): Share | null =>
  column.kind === 'milestone'
    ? (row.milestones[column.code] ?? null)
    : column.kind === 'trial'
      ? row.trial
      : column.kind === 'payment7'
        ? row.payment7
        : column.kind === 'payment30'
          ? row.payment30
          : null;

const _ARRIVAL_REPORT = {
  window: 30,
  attribution: 'first',
  life: 0,
  fees: 'gross',
  baseCurrency: null,
} as const;

/** Подпись столбца когорт по приходу — как у «Источников». */
export var arrivalColumnName = (column: SourcesColumn): string =>
  columnName(_ARRIVAL_REPORT, column);

/** Когорты по приходу в CSV: строка на месяц, доли — четырьмя столбцами, внизу — среднее. */
export var arrivalCohortsCsv = (report: ArrivalCohorts): CsvRow[] =>
  ((shares) => [
    [
      t('cohorts.colMonth'),
      arrivalColumnName({ kind: 'people' }),
      ...shares.flatMap((column) => _shareHeaders(arrivalColumnName(column))),
      ...(report.columns.some((_) => _.kind === 'customers')
        ? [arrivalColumnName({ kind: 'customers' })]
        : []),
      t('csv.lowData'),
      t('cohorts.csvNotes'),
    ],
    ...[...report.rows, report.average].map(
      (row): CsvRow => [
        row.month === '' ? t('cohorts.average') : row.month,
        row.people,
        ...shares.flatMap((column) => _share(arrivalShare(row, column))),
        ...(report.columns.some((_) => _.kind === 'customers')
          ? [row.customers]
          : []),
        row.month !== '' && row.lowData && row.people > 0
          ? t('report.lowData')
          : null,
        _notes(row.open && t('cohorts.csvOpen')),
      ]
    ),
  ])(arrivalShares(report.columns));
