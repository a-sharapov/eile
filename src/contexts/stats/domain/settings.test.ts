import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import { changeStatsSettings, DEFAULT_STATS_SETTINGS } from './settings.ts';

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const change = (patch: Record<string, unknown>) =>
  changeStatsSettings(DEFAULT_STATS_SETTINGS, patch);

describe('настройки статистики', () => {
  it('по умолчанию счёт выключен: о нём сначала пишут в политике сайта', () => {
    expect(DEFAULT_STATS_SETTINGS).toMatchObject({
      enabled: false,
      beacon: false,
      goalLinks: [],
    });
  });

  it('ссылки-цели — без пробелов по краям и повторов; неизвестные ключи не берутся', () => {
    expect(
      change({
        enabled: true,
        goalLinks: [
          ' https://app.kuechenly.de/projects/new ',
          'https://app.kuechenly.de/projects/new',
          '/kontakt',
          'tel:',
          'mailto:info@',
          '',
        ],
        surprise: 1,
      })
    ).toEqual({
      ...DEFAULT_STATS_SETTINGS,
      enabled: true,
      goalLinks: [
        'https://app.kuechenly.de/projects/new',
        '/kontakt',
        'tel:',
        'mailto:info@',
      ],
    });
  });

  it('ссылка-цель не того вида — отказ', () => {
    for (const link of [
      'javascript:alert(1)',
      'app.kuechenly.de',
      'https://a b',
      'https://"><script>',
      `https://example.com/${'x'.repeat(300)}`,
    ]) {
      expect(code(() => change({ goalLinks: [link] }))).toBe(
        'stats.invalid_link'
      );
    }
    expect(
      code(() =>
        change({
          goalLinks: Array.from({ length: 21 }, (_, n) => `/goal-${n}`),
        })
      )
    ).toBe('stats.too_many_links');
  });

  it('срок хранения — всегда или от месяца; пояс — настоящий', () => {
    expect(change({ retentionDays: '365' }).retentionDays).toBe(365);
    expect(code(() => change({ retentionDays: 7 }))).toBe(
      'stats.invalid_retention'
    );
    expect(change({ timeZone: ' Europe/Berlin ' }).timeZone).toBe(
      'Europe/Berlin'
    );
    expect(change({ timeZone: 'UTC' }).timeZone).toBe('UTC');
    expect(code(() => change({ timeZone: 'Mars/Olympus' }))).toBe(
      'stats.invalid_time_zone'
    );
  });
});
