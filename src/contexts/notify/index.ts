import type { Database } from '../../platform/database.ts';
import {
  defineNotifyService,
  type SiteFacts,
} from './application/notify-service.ts';
import type { Transports } from './domain/ports.ts';
import { type NotifySettings, restoredSettings } from './domain/settings.ts';
import { startBackground } from './infrastructure/background.ts';
import { cryptoGatewaySecrets } from './infrastructure/gateway-secrets.ts';
import { defineSmtpSender } from './infrastructure/smtp-client.ts';
import {
  defineIncidentRepository,
  defineOutboxRepository,
  defineRuntimeMark,
  defineSettingsRepository,
} from './infrastructure/sqlite-notify.ts';
import { defineTelegramClient } from './infrastructure/telegram-client.ts';
import { defineGatewayHandler } from './interface/gateway-handler.ts';

export type {
  GatewayEntry,
  GatewayOutcome,
} from './application/gateway-service.ts';
export type {
  NotifyService,
  SiteFacts,
} from './application/notify-service.ts';
export type { Delivery } from './domain/delivery.ts';
export type { Mail, MailAttachment } from './domain/gateway.ts';
export type { Incident } from './domain/incident.ts';
export type {
  ChannelKind,
  Message,
  Severity,
} from './domain/message.ts';
export { message } from './domain/message.ts';
export type { SmtpProbe, Transports } from './domain/ports.ts';
export type {
  GatewayStatus,
  NotifySettings,
  NotifyStatus,
} from './domain/settings.ts';
export {
  NOTIFY_TABLES,
  notifyMigrations,
} from './infrastructure/migrations.ts';
export { GATEWAY_BODY_LIMIT } from './interface/gateway-handler.ts';

/** Контекст notify: каналы Telegram и почты, очередь отправки и сбои сайта. */
export var defineNotify = ({
  db,
  clock,
  site,
  transports,
  log = (line) => console.info(line),
  spool = () => null,
}: {
  db: Database;
  clock: () => Date;
  site: () => SiteFacts;
  /** Подмена каналов в тестах: без сети. */
  transports?: Transports;
  /** Журнал почтового шлюза: строка на запрос с письмом; по умолчанию — вывод сервера. */
  log?: (line: string) => void;
  /** Временный файл на диске для большого тела запроса шлюза; null — тело читается в память. */
  spool?: () => string | null;
}) => {
  let kick = (): void => undefined;
  const runtime = defineRuntimeMark(db);
  const settings = defineSettingsRepository(db);
  const service = defineNotifyService({
    settings,
    outbox: defineOutboxRepository(db),
    incidents: defineIncidentRepository(db),
    transports: transports ?? {
      telegram: defineTelegramClient(),
      email: defineSmtpSender(),
    },
    clock,
    site,
    kick: () => kick(),
    secrets: cryptoGatewaySecrets,
    log,
  });
  const gateway = defineGatewayHandler({
    gateway: service.gateway,
    clock,
    spool,
  });
  return {
    ...service,
    gateway: { ...service.gateway, handle: gateway.handle },
    /** Каналы, маршруты и почтовый шлюз с хэшами токенов — для файла настроек сервера. */
    serverSettings: {
      read: (): NotifySettings | null => settings.stored(),
      apply: (value: unknown): void => settings.save(restoredSettings(value)),
    },
    /** Фоновая отправка — только у сервера: команды CLI и тесты гоняют очередь сами. */
    start: (): (() => void) => {
      const background = startBackground({
        run: service.outbox.run,
        purge: service.purge,
      });
      kick = background.kick;
      const crashed = runtime.start(clock().toISOString());
      void (
        crashed &&
        service.incidents.report({
          kind: 'server.recovered',
          severity: 'warning',
          title: {
            en: 'The server restarted without a clean shutdown',
            de: 'Der Server wurde ohne ordnungsgemäßes Herunterfahren neu gestartet',
            ru: 'Сервер перезапущен без штатной остановки',
          },
          detail: {
            en: `Previous start: ${crashed}. The process ended without stopping (a crash, out of memory or kill -9).`,
            de: `Letzter Start: ${crashed}. Der Prozess endete ohne Herunterfahren (Absturz, Speichermangel oder kill -9).`,
            ru: `Прошлый запуск — ${crashed}: процесс завершился без остановки (сбой, нехватка памяти или kill -9).`,
          },
        })
      );
      return () => (
        background.stop(), runtime.stop(), (kick = () => undefined)
      );
    },
  };
};

export type Notify = ReturnType<typeof defineNotify>;
