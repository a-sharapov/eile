import type { Assistant, Connection } from './contexts/assistant/index.ts';
import type { Forms } from './contexts/forms/index.ts';
import type {
  CarriedToken,
  Identity,
  TokensApplied,
} from './contexts/identity/index.ts';
import type { Notify, NotifySettings } from './contexts/notify/index.ts';
import type { SiteService } from './contexts/site/index.ts';
import type {
  Upkeep,
  UpkeepApplied,
  UpkeepServerSettings,
} from './contexts/upkeep/index.ts';
import { sealBytes, unsealBytes } from './platform/seal.ts';
import { fail } from './shared/kernel/errors.ts';
import { pipe } from './shared/kernel/pipe.ts';

// Файл настроек сервера (ADR 0045) — то, что владелец настроил на этой машине и что в копию сайта не входит:
// каналы уведомлений, почтовый шлюз, секрет печатей форм, расписание копий, хранилище с ключом копий,
// подключение ИИ и ключи API. Сеансов, ссылок сброса, сертификатов, очереди и журнала сбоев в нём нет.

export type ServerSettings = {
  readonly format: 'eile-server-settings';
  readonly version: 1;
  readonly createdAt: string;
  /** Откуда файл: версия программы, имя и адрес сайта — чтобы человек узнал его. */
  readonly from: {
    readonly product: string;
    readonly site: string;
    readonly url: string;
  };
  readonly notify: NotifySettings | null;
  readonly forms: { readonly secret: string } | null;
  readonly upkeep: UpkeepServerSettings;
  readonly assistant: Connection | null;
  readonly tokens: readonly CarriedToken[];
};

/** Что применилось: разделы файла и поправки по правилам переезда. */
export type ServerSettingsReport = {
  readonly notify: boolean;
  readonly forms: boolean;
  readonly assistant: boolean;
  readonly upkeep: UpkeepApplied;
  readonly tokens: TokensApplied;
};

/** Контексты, чьи настройки сервера переезжают. */
export type SettingsParts = {
  readonly notify: Pick<Notify, 'serverSettings'>;
  readonly forms: Pick<Forms, 'serverSettings'>;
  readonly upkeep: Pick<Upkeep, 'serverSettings'>;
  readonly assistant: Pick<Assistant, 'serverSettings'>;
  readonly identity: Pick<Identity, 'serverSettings'>;
  readonly site: Pick<SiteService, 'settings'>;
};

export var readServerSettings = (
  parts: SettingsParts,
  product: string,
  now: Date
): ServerSettings =>
  ((site) => ({
    format: 'eile-server-settings',
    version: 1,
    createdAt: now.toISOString(),
    from: { product, site: site.name, url: site.siteUrl },
    notify: parts.notify.serverSettings.read(),
    forms: parts.forms.serverSettings.read(),
    upkeep: parts.upkeep.serverSettings.read(),
    assistant: parts.assistant.serverSettings.read(),
    tokens: parts.identity.serverSettings.read(),
  }))(parts.site.settings.get());

const _present = (value: unknown): boolean =>
  value !== null && value !== undefined;

/**
 * Привезённое — в эту базу: что есть в файле, заменяет своё; чего нет (null) — остаётся. Итоги копий,
 * сеансы и сертификаты этой машины не трогаются. Вызывать внутри транзакции.
 */
export var applyServerSettings = (
  parts: SettingsParts,
  settings: ServerSettings
): ServerSettingsReport => ({
  notify:
    _present(settings.notify) &&
    (parts.notify.serverSettings.apply(settings.notify), true),
  forms:
    _present(settings.forms) &&
    (parts.forms.serverSettings.apply(settings.forms), true),
  assistant:
    _present(settings.assistant) &&
    (parts.assistant.serverSettings.apply(settings.assistant), true),
  upkeep: parts.upkeep.serverSettings.apply(settings.upkeep ?? {}),
  tokens: parts.identity.serverSettings.apply(settings.tokens ?? []),
});

const _parse = (bytes: Uint8Array): ServerSettings =>
  pipe(
    (_: Uint8Array) => new TextDecoder().decode(_),
    (text) => JSON.parse(text) as Partial<ServerSettings> | null,
    (value) =>
      value?.format === 'eile-server-settings' && value.version === 1
        ? (value as ServerSettings)
        : fail('settings.invalid', 'The file is not a server settings file')
  )(bytes);

/** Файл настроек: JSON, запечатанный паролем владельца. */
export var sealServerSettings = (
  settings: ServerSettings,
  passphrase: string
): Promise<Uint8Array<ArrayBuffer>> =>
  sealBytes(new TextEncoder().encode(JSON.stringify(settings)), 'settings', {
    passphrase,
  });

export var openServerSettings = (
  bytes: Uint8Array<ArrayBuffer>,
  passphrase: string
): Promise<ServerSettings> =>
  unsealBytes(bytes, 'settings', { passphrase }).then(_parse);

/** Пароль файла настроек — не короче 12 знаков: в файле пароль почты, ключ ИИ и ключ копий. */
export var SETTINGS_PASSPHRASE_MIN = 12;

export var checkPassphrase = (passphrase: string): string =>
  [...passphrase].length >= SETTINGS_PASSPHRASE_MIN
    ? passphrase
    : fail(
        'settings.weak_passphrase',
        `The passphrase needs at least ${SETTINGS_PASSPHRASE_MIN} characters`
      );
