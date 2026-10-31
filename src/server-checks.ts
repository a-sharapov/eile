import type { HttpsStatus } from './contexts/certificates/index.ts';
import { type Check, finding } from './contexts/diagnostics/index.ts';
import type { SiteService } from './contexts/site/index.ts';
import type { UpkeepService } from './contexts/upkeep/index.ts';
import type { ManagerLanguage } from './shared/kernel/manager-language.ts';

// Проверки сервера для диагностики: автокопии, HTTPS, обновления. Состояние отдают контексты, находки
// собирает корень — диагностика о них не знает.

const _UPKEEP = '/settings?tab=upkeep';
const _DAY = 24 * 60 * 60 * 1000;
const _LOCAL = /^https?:\/\/(?:localhost|127\.|\[::1\])/;

type Said = { readonly title: string; readonly hint: string };

type ServerTexts = {
  readonly backupsOff: Said;
  readonly backupFailed: Said;
  readonly httpsFailing: Said;
  readonly noHttps: Said;
  readonly updateAvailable: Said;
  readonly upkeepTab: string;
  readonly siteUrl: string;
};

const _TEXTS: Readonly<Record<ManagerLanguage, ServerTexts>> = {
  en: {
    backupsOff: {
      title: 'Automatic backups are off',
      hint: 'The whole site is one database file. Turn on scheduled backups: the server will make them itself and keep the latest ones.',
    },
    backupFailed: {
      title: 'The last automatic backup failed',
      hint: 'Until this is fixed, there is no fresh copy of the site. The reason is below; once it is fixed, make a backup by hand.',
    },
    httpsFailing: {
      title: 'The HTTPS certificate isn’t being issued',
      hint: 'The server couldn’t get or renew a Let’s Encrypt certificate. Check that the domain points to the server and port 80 is open.',
    },
    noHttps: {
      title: 'The site is served over HTTP',
      hint: 'Browsers mark such sites as not secure. Start cms with --domain and the certificate is issued automatically, or turn on HTTPS at your proxy and set an https:// address.',
    },
    updateAvailable: {
      title: 'A new version is available',
      hint: 'Update with one command on the server: cms update. The binary is checked against its checksum, and the previous one stays next to it.',
    },
    upkeepTab: 'Backups and updates',
    siteUrl: 'Site address',
  },
  de: {
    backupsOff: {
      title: 'Automatische Sicherungen sind aus',
      hint: 'Die ganze Website ist eine Datenbankdatei. Schalten Sie geplante Sicherungen ein: Der Server erstellt sie selbst und behält die neuesten.',
    },
    backupFailed: {
      title: 'Die letzte automatische Sicherung ist fehlgeschlagen',
      hint: 'Solange das so ist, gibt es keine frische Kopie der Website. Der Grund steht unten; erstellen Sie nach der Behebung eine Sicherung von Hand.',
    },
    httpsFailing: {
      title: 'Das HTTPS-Zertifikat wird nicht ausgestellt',
      hint: 'Der Server konnte kein Let’s-Encrypt-Zertifikat erhalten oder verlängern. Prüfen Sie, ob die Domain auf den Server zeigt und Port 80 offen ist.',
    },
    noHttps: {
      title: 'Die Website ist über HTTP erreichbar',
      hint: 'Browser markieren solche Websites als unsicher. Starten Sie cms mit --domain – das Zertifikat wird automatisch ausgestellt – oder aktivieren Sie HTTPS am Proxy und tragen Sie eine Adresse mit https:// ein.',
    },
    updateAvailable: {
      title: 'Eine neue Version ist verfügbar',
      hint: 'Aktualisieren mit einem Befehl auf dem Server: cms update. Die Datei wird mit ihrer Prüfsumme abgeglichen, die bisherige bleibt daneben liegen.',
    },
    upkeepTab: 'Wartung',
    siteUrl: 'Adresse der Website',
  },
  ru: {
    backupsOff: {
      title: 'Автокопии выключены',
      hint: 'Весь сайт — один файл базы. Включите копии по расписанию: сервер будет делать их сам и хранить последние.',
    },
    backupFailed: {
      title: 'Последняя автокопия не сделалась',
      hint: 'Пока это так, свежей копии сайта нет. Причина — ниже; после исправления сделайте копию вручную.',
    },
    httpsFailing: {
      title: 'Сертификат HTTPS не выпускается',
      hint: 'Сервер не смог получить или продлить сертификат Let’s Encrypt. Проверьте, что домен указывает на сервер и порт 80 открыт.',
    },
    noHttps: {
      title: 'Сайт открыт по HTTP',
      hint: 'Браузеры помечают такие сайты как небезопасные. Запустите cms с --domain — сертификат выпустится сам — или включите HTTPS на своём прокси и укажите адрес с https://.',
    },
    updateAvailable: {
      title: 'Доступна новая версия',
      hint: 'Обновление — одной командой на сервере: cms update. Бинарник сверяется с контрольной суммой, прежний остаётся рядом.',
    },
    upkeepTab: 'Копии и обновления',
    siteUrl: 'Адрес сайта',
  },
};

const _backups = (upkeep: UpkeepService): Check => ({
  id: 'backups',
  run: (language) =>
    ((status, say) => [
      ...finding(
        {
          id: 'server.backups_off',
          group: 'server',
          severity: 'warning',
          ...say.backupsOff,
          fix: { href: _UPKEEP },
        },
        status.schedule.enabled ? [] : [{ label: say.upkeepTab }]
      ),
      ...finding(
        {
          id: 'server.backup_failed',
          group: 'server',
          severity: 'error',
          ...say.backupFailed,
          fix: { href: _UPKEEP },
        },
        status.schedule.enabled && status.failure
          ? [{ label: status.failure.at, detail: status.failure.message }]
          : []
      ),
    ])(upkeep.backups.status(), _TEXTS[language]),
});

const _https = (https: () => HttpsStatus | null, site: SiteService): Check => ({
  id: 'https',
  run: (language) =>
    ((status, url, say) => [
      ...finding(
        {
          id: 'server.https_failing',
          group: 'server',
          severity: 'error',
          ...say.httpsFailing,
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
          ...say.noHttps,
          fix: { href: '/settings?tab=site' },
        },
        !status?.domains.length &&
          url.startsWith('http://') &&
          !_LOCAL.test(url)
          ? [{ label: say.siteUrl, detail: url }]
          : []
      ),
    ])(https(), site.settings.get().siteUrl, _TEXTS[language]),
});

const _updates = (upkeep: UpkeepService): Check => ({
  id: 'updates',
  run: (language) =>
    ((latest, say) =>
      finding(
        {
          id: 'server.update_available',
          group: 'server',
          severity: 'info',
          ...say.updateAvailable,
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
      ))(upkeep.updates.latest(), _TEXTS[language]),
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
