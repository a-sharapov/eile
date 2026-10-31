import type { HttpsStatus } from './contexts/certificates/index.ts';
import { type Check, finding } from './contexts/diagnostics/index.ts';
import type { SiteService } from './contexts/site/index.ts';
import type { UpkeepService } from './contexts/upkeep/index.ts';

// Проверки сервера для диагностики: автокопии, HTTPS, обновления. Состояние отдают контексты, находки
// собирает корень — диагностика о них не знает.

const _UPKEEP = '/settings?tab=upkeep';
const _DAY = 24 * 60 * 60 * 1000;
const _LOCAL = /^https?:\/\/(?:localhost|127\.|\[::1\])/;

const _backups = (upkeep: UpkeepService): Check => ({
  id: 'backups',
  run: () =>
    ((status) => [
      ...finding(
        {
          id: 'server.backups_off',
          group: 'server',
          severity: 'warning',
          title: 'Автокопии выключены',
          hint: 'Весь сайт — один файл базы. Включите копии по расписанию: сервер будет делать их сам и хранить последние.',
          fix: { href: _UPKEEP },
        },
        status.schedule.enabled ? [] : [{ label: 'Копии и обновления' }]
      ),
      ...finding(
        {
          id: 'server.backup_failed',
          group: 'server',
          severity: 'error',
          title: 'Последняя автокопия не сделалась',
          hint: 'Пока это так, свежей копии сайта нет. Причина — ниже; после исправления сделайте копию вручную.',
          fix: { href: _UPKEEP },
        },
        status.schedule.enabled && status.failure
          ? [{ label: status.failure.at, detail: status.failure.message }]
          : []
      ),
    ])(upkeep.backups.status()),
});

const _https = (https: () => HttpsStatus | null, site: SiteService): Check => ({
  id: 'https',
  run: () =>
    ((status, url) => [
      ...finding(
        {
          id: 'server.https_failing',
          group: 'server',
          severity: 'error',
          title: 'Сертификат HTTPS не выпускается',
          hint: 'Сервер не смог получить или продлить сертификат Let’s Encrypt. Проверьте, что домен указывает на сервер и порт 80 открыт.',
          fix: { href: '/settings?tab=site' },
        },
        status?.lastError &&
          (status.notAfter === null ||
            Date.parse(status.notAfter) - Date.now() < 7 * _DAY)
          ? [{ label: status.domains.join(', '), detail: status.lastError }]
          : []
      ),
      ...finding(
        {
          id: 'server.no_https',
          group: 'server',
          severity: 'warning',
          title: 'Сайт открыт по HTTP',
          hint: 'Браузеры помечают такие сайты как небезопасные. Запустите cms с --domain — сертификат выпустится сам — или включите HTTPS на своём прокси и укажите адрес с https://.',
          fix: { href: '/settings?tab=site' },
        },
        !status?.domains.length &&
          url.startsWith('http://') &&
          !_LOCAL.test(url)
          ? [{ label: 'Адрес сайта', detail: url }]
          : []
      ),
    ])(https(), site.settings.get().siteUrl),
});

const _updates = (upkeep: UpkeepService): Check => ({
  id: 'updates',
  run: () =>
    ((latest) =>
      finding(
        {
          id: 'server.update_available',
          group: 'server',
          severity: 'info',
          title: 'Доступна новая версия',
          hint: 'Обновление — одной командой на сервере: cms update. Бинарник сверяется с контрольной суммой, прежний остаётся рядом.',
          fix: { href: _UPKEEP },
        },
        latest
          ? [
              {
                label: `${latest.current} → ${latest.latest}`,
                detail: latest.url,
              },
            ]
          : []
      ))(upkeep.updates.latest()),
});

/** Проверки сервера; автокопии — только у сайта в файле: базу в памяти копировать нечего. */
export var serverChecks = ({
  upkeep,
  https,
  site,
  persistent,
}: {
  upkeep: UpkeepService;
  https: () => HttpsStatus | null;
  site: SiteService;
  persistent: boolean;
}): readonly Check[] => [
  ...(persistent ? [_backups(upkeep)] : []),
  _https(https, site),
  _updates(upkeep),
];
