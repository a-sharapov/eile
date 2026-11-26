import { t } from '#lib/i18n.ts';
import type { OverviewReport, VersionMark } from '#lib/types.ts';

// «Обзор» (ADR 0072, «„Обзор“»): период посещений запросом и куда ведут плитки итогов — чистые функции, их
// проверяет tests/manager-analytics.test.ts.

/** Период «Обзора»: последние N дней или свои даты — тот же, что у посещений под итогами. */
export type OverviewPeriod =
  | { readonly days: number }
  | { readonly from: string; readonly to: string };

/** Период запросом: `?days=7` или `?from=…&to=…` — так его понимают и посещения, и отчёты аналитики. */
export var overviewSearch = (period: OverviewPeriod): string =>
  'days' in period
    ? `?days=${period.days}`
    : `?${new URLSearchParams({ from: period.from, to: period.to })}`;

/**
 * Запросы вкладок, куда ведут плитки: люди, клиенты, выручка и CAC — «Источники» с тем же периодом; доступ —
 * «Когорты» с показателем «Действующий доступ» (их период — месяцами, по умолчанию 12); расход — «Расходы»
 * месяцев периода.
 */
export var overviewQueries = (
  search: string,
  report: Pick<OverviewReport, 'from' | 'to'>
): {
  readonly sources: string;
  readonly cohorts: string;
  readonly spend: string;
} => ({
  sources: search,
  cohorts: '?metric=active',
  spend: `?${new URLSearchParams({
    from: report.from.slice(0, 7),
    to: report.to.slice(0, 7),
  })}`,
});

/** Отметка на графике: день, подпись и тон — «сошлось», «не сошлось», «не сверялось» (формой и словом). */
export type ChartMark = {
  readonly day: string;
  readonly label: string;
  readonly tone: 'ok' | 'bad' | 'none';
};

const _TONES: Readonly<Record<string, ChartMark['tone']>> = {
  true: 'ok',
  false: 'bad',
  null: 'none',
};

/**
 * Смены версий отправителей — отметками на графике посещений: день сводки, «Бот: 1.4.2 → 1.5.0, счёт сходится».
 * Версия — текст отправителя: в подписи только текстом.
 */
export var versionMarks = (versions: readonly VersionMark[]): ChartMark[] =>
  versions.map((_) => ({
    day: _.day,
    tone: _TONES[String(_.matched)] ?? 'none',
    label: t(
      _.matched === true
        ? 'analyticsOverview.versionOk'
        : _.matched === false
          ? 'analyticsOverview.versionBad'
          : 'analyticsOverview.versionNone',
      { sender: _.name, from: _.from, to: _.to }
    ),
  }));
