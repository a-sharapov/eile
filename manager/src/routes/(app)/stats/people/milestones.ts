import { pointsChange, shareRate } from '#lib/analytics-reports.ts';
import { type CsvCell, type CsvRow, csvDecimal, csvPercent } from '#lib/csv.ts';
import { t } from '#lib/i18n.ts';
import type { MilestoneComparison, Share } from '#lib/types.ts';

// «Люди → Сравнение вех» (ADR 0072, «Сравнение вех»): разница долей оплативших, адреса «кто достиг» и «кто не
// достиг» и выгрузка в CSV — чистые функции экрана, их проверяет tests/manager-analytics.test.ts.

export type MilestoneRow = MilestoneComparison['milestones'][number];

/** «Мало данных» сравнения вех: достигших или не достигших меньше 30. */

/** Разница долей оплативших среди достигших и среди не достигших, в процентных пунктах; доли нет — null. */
export var paidDifference = (row: MilestoneRow): number | null =>
  ((change) => (change?.kind === 'points' ? change.value : null))(
    pointsChange(
      row.paidReached ? shareRate(row.paidReached) : null,
      row.paidMissed ? shareRate(row.paidMissed) : null
    )
  );

/**
 * Люди вехи в списке «Людей»: те же период, фильтры и тестовые; «кто достиг» — `milestone=<код>`, «кто не достиг» —
 * ещё `reached=0` (окно кончилось, «ещё в окне» не в счёт): число списка равно числу в строке.
 */
export var milestonePeople = (
  code: string,
  reached: boolean,
  report: Pick<MilestoneComparison, 'from' | 'to' | 'filters' | 'test'>
): URLSearchParams =>
  new URLSearchParams([
    ['milestone', code],
    ...(reached ? [] : [['reached', '0'] as [string, string]]),
    ['from', report.from],
    ['to', report.to],
    ...Object.entries(report.filters),
    ...(report.test ? [['test', '1'] as [string, string]] : []),
  ]);

const _share = (share: Share | null): CsvCell[] =>
  share
    ? [share.count, share.base, share.open, csvPercent(shareRate(share))]
    : [null, null, null, null];

const _headers = (name: string): string[] => [
  t('csv.counted', { name }),
  t('csv.base', { name }),
  t('csv.open', { name }),
  t('csv.percent', { name }),
];

/** Сравнение вех в CSV: строка на веху, доли — четырьмя столбцами, разница — в пунктах, «мало данных» — словами. */
export var milestonesCsv = (report: MilestoneComparison): CsvRow[] =>
  ((paid) => [
    [
      t('csv.code'),
      t('milestoneComparison.colMilestone'),
      t('milestoneComparison.colReached'),
      t('milestoneComparison.colMissed'),
      t('milestoneComparison.colOpen'),
      ...(paid
        ? [
            ..._headers(t('milestoneComparison.colPaidReached')),
            ..._headers(t('milestoneComparison.colPaidMissed')),
            t('milestoneComparison.csvDifference'),
          ]
        : []),
      t('csv.lowData'),
    ],
    ...report.milestones.map(
      (row): CsvRow => [
        row.code,
        row.name,
        row.reached,
        row.missed,
        row.open,
        ...(paid
          ? [
              ..._share(row.paidReached),
              ..._share(row.paidMissed),
              csvDecimal(paidDifference(row), 1),
            ]
          : []),
        row.lowData ? t('report.lowData') : null,
      ]
    ),
  ])(report.milestones.some((_) => _.paidReached !== null));
