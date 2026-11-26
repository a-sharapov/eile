import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import {
  changeAnalyticsSettings,
  DEFAULT_ANALYTICS_SETTINGS,
  retentionCutoff,
} from './settings.ts';

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const change = (patch: Record<string, unknown>) =>
  changeAnalyticsSettings(DEFAULT_ANALYTICS_SETTINGS, patch);

describe('настройки аналитики', () => {
  it('по умолчанию приём выключен, история хранится бессрочно, базовой валюты нет', () => {
    expect(DEFAULT_ANALYTICS_SETTINGS).toEqual({
      enabled: false,
      retentionMonths: 0,
      baseCurrency: null,
    });
  });

  it('неизвестные ключи не берутся, срок — 0 или 1–120 месяцев', () => {
    expect(
      change({ enabled: true, retentionMonths: '36', surprise: 1 })
    ).toEqual({ enabled: true, retentionMonths: 36, baseCurrency: null });
    expect(change({ retentionMonths: 120 }).retentionMonths).toBe(120);
    for (const months of [-1, 121, 1.5, 'год']) {
      expect(code(() => change({ retentionMonths: months }))).toBe(
        'analytics.invalid_retention'
      );
    }
  });

  it('базовая валюта — код ISO 4217 или null; без поля остаётся прежняя', () => {
    const euro = change({ baseCurrency: 'EUR' });
    expect(euro.baseCurrency).toBe('EUR');
    expect(changeAnalyticsSettings(euro, { enabled: true }).baseCurrency).toBe(
      'EUR'
    );
    expect(
      changeAnalyticsSettings(euro, { baseCurrency: null }).baseCurrency
    ).toBeNull();
    for (const currency of ['eur', 'EURO', 'XAU', 'ABC', 978, '', true]) {
      expect([
        currency,
        code(() => change({ baseCurrency: currency })),
      ]).toEqual([currency, 'analytics.invalid_currency']);
    }
  });

  it('граница срока хранения — календарные месяцы назад, в конце месяца — его последний день', () => {
    expect(retentionCutoff('2026-03-31T10:00:00.000Z', 1)).toBe(
      '2026-02-28T10:00:00.000Z'
    );
    expect(retentionCutoff('2026-11-15T12:00:00.000Z', 12)).toBe(
      '2025-11-15T12:00:00.000Z'
    );
  });
});
