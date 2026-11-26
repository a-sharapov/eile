import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { shiftMonths } from './days.ts';
import { isCurrency } from './money.ts';

/** Настройки аналитики сайта: идут в копию сайта вместе с ним. */
export type AnalyticsSettings = {
  /** Принимать события. Выключено, пока владелец не включит: о сборе истории нужно сказать в политике сайта. */
  readonly enabled: boolean;
  /** Сколько месяцев после последнего события человека хранить его историю; 0 — бессрочно. */
  readonly retentionMonths: number;
  /**
   * Валюта, в которой отчёты сводят суммы разных валют, — код ISO 4217; null — не задана, и LTV, расход и CAC
   * пусты. Ядро её не выбирает: задаёт человек в менеджере.
   */
  readonly baseCurrency: string | null;
};

export var DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  enabled: false,
  retentionMonths: 0,
  baseCurrency: null,
};

const _MAX_RETENTION = 120;

const _retention = (settings: AnalyticsSettings): AnalyticsSettings =>
  Number.isInteger(settings.retentionMonths) &&
  settings.retentionMonths >= 0 &&
  settings.retentionMonths <= _MAX_RETENTION
    ? settings
    : fail(
        'analytics.invalid_retention',
        `Keep the history 1 to ${_MAX_RETENTION} months or always (0), not "${settings.retentionMonths}"`
      );

const _currency = (raw: unknown, current: string | null): string | null =>
  raw === undefined
    ? current
    : raw === null || isCurrency(raw)
      ? raw
      : fail(
          'analytics.invalid_currency',
          `The base currency is an ISO 4217 code of three capital letters or null, not "${String(raw)}"`
        );

/**
 * Граница срока хранения: `months` календарных месяцев до `now` по UTC; дня, которого в том месяце нет (31
 * февраля), не бывает — берётся последний день месяца. Человек с последним событием раньше границы стирается.
 */
export var retentionCutoff = (now: string, months: number): string =>
  shiftMonths(now, -months);

/** Новые настройки поверх нынешних: неизвестные ключи не берутся, нарушенное правило — отказ. */
export var changeAnalyticsSettings = (
  current: AnalyticsSettings,
  patch: Readonly<Record<string, unknown>>
): AnalyticsSettings =>
  pipe(
    (_: Readonly<Record<string, unknown>>) => ({
      enabled: _.enabled === undefined ? current.enabled : _.enabled === true,
      retentionMonths:
        _.retentionMonths === undefined
          ? current.retentionMonths
          : Number(_.retentionMonths),
      baseCurrency: _currency(_.baseCurrency, current.baseCurrency),
    }),
    _retention
  )(patch);
