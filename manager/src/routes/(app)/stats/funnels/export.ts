import { rateOf } from '#lib/analytics-reports.ts';
import { type CsvRow, csvMoney, csvPercent } from '#lib/csv.ts';
import { t } from '#lib/i18n.ts';
import type { BaseSum, FunnelReport, SetupView } from '#lib/types.ts';
import { stepName } from '../names.ts';

// Выгрузка воронки в CSV (ADR 0072, «Выгрузка CSV»): шаг на строку — число, доли от предыдущего и от первого шага
// своей стороны, пропустившие и «ещё в окне», деньги шагов оплаты по валютам и в базовой валюте; при сравнении —
// числа и деньги прошлого периода своими столбцами.

const _notes = (sum: BaseSum | null | undefined): string | null =>
  sum
    ? [
        ...(sum.staleRate ? [t('csv.stale')] : []),
        ...(Object.keys(sum.unpriced).length > 0
          ? [
              t('csv.unpriced', {
                currencies: Object.keys(sum.unpriced).toSorted().join(', '),
              }),
            ]
          : []),
      ].join('; ') || null
    : null;

export var funnelCsv = (report: FunnelReport, setup: SetupView): CsvRow[] =>
  ((currencies, base, compare) =>
    ((previous) => [
      [
        t('csv.step'),
        t('csv.stepName'),
        t('csv.side'),
        t('csv.count'),
        t('csv.ofPrevious'),
        t('csv.ofFirst'),
        t('csv.skipped'),
        t('csv.inWindow'),
        t('csv.lowData'),
        t('funnel.unfiltered'),
        ...currencies.flatMap((currency) => [
          t('csv.revenueIn', { currency }),
          t('csv.perPersonIn', { currency }),
        ]),
        ...(base === null
          ? []
          : [
              t('csv.revenueBase', { currency: base }),
              t('csv.perPayerBase', { currency: base }),
              t('csv.notes', { name: t('csv.revenue') }),
            ]),
        ...(compare === null
          ? []
          : [
              t('csv.wasCount', { from: compare.from, to: compare.to }),
              ...(base === null
                ? []
                : [
                    t('csv.wasRevenue', {
                      currency: base,
                      from: compare.from,
                      to: compare.to,
                    }),
                  ]),
            ]),
      ],
      ...report.steps.map((step, index) => [
        index + 1,
        stepName(setup, step.step),
        t(step.side === 'visits' ? 'funnel.visitsSide' : 'funnel.peopleSide'),
        step.count,
        csvPercent(rateOf(step.count, previous[index]?.previous ?? null)),
        csvPercent(rateOf(step.count, previous[index]?.first ?? null)),
        step.skipped,
        step.open,
        step.lowData ? t('report.lowData') : null,
        step.unfiltered ? t('funnel.unfiltered') : null,
        ...currencies.flatMap((currency) => [
          csvMoney(step.money?.amounts[currency], currency),
          csvMoney(step.money?.perPerson[currency], currency),
        ]),
        ...(base === null
          ? []
          : [
              csvMoney(step.money?.base?.value, base),
              csvMoney(step.money?.perPersonBase, base),
              _notes(step.money?.base),
            ]),
        ...(compare === null
          ? []
          : [
              compare.steps[index]?.count ?? null,
              ...(base === null
                ? []
                : [csvMoney(compare.steps[index]?.money?.base?.value, base)]),
            ]),
      ]),
    ])(
      // Доли — внутри своей стороны: от предыдущего шага стороны и от её первого шага.
      report.steps.map((step, index) =>
        ((side) =>
          ((position) => ({
            previous: position > 0 ? side[position - 1]!.count : null,
            first: position > 0 ? side[0]!.count : null,
          }))(side.findIndex((_) => _.index === index)))(
          report.steps
            .map((_, n) => ({ ..._, index: n }))
            .filter((_) => _.side === step.side)
        )
      )
    ))(
    [
      ...new Set(
        report.steps.flatMap((_) => Object.keys(_.money?.amounts ?? {}))
      ),
    ].toSorted(),
    report.baseCurrency,
    report.compare
  );
