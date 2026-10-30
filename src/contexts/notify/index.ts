import type { Database } from '../../platform/database.ts';
import {
  defineNotifyService,
  type SiteFacts,
} from './application/notify-service.ts';
import type { Transports } from './domain/ports.ts';
import { startBackground } from './infrastructure/background.ts';
import { defineSmtpSender } from './infrastructure/smtp-client.ts';
import {
  defineIncidentRepository,
  defineOutboxRepository,
  defineRuntimeMark,
  defineSettingsRepository,
} from './infrastructure/sqlite-notify.ts';
import { defineTelegramClient } from './infrastructure/telegram-client.ts';

export type {
  NotifyService,
  SiteFacts,
} from './application/notify-service.ts';
export type { Delivery } from './domain/delivery.ts';
export type { Incident } from './domain/incident.ts';
export type {
  ChannelKind,
  Message,
  Severity,
} from './domain/message.ts';
export { message } from './domain/message.ts';
export type { Transports } from './domain/ports.ts';
export type { NotifyStatus } from './domain/settings.ts';
export {
  NOTIFY_TABLES,
  notifyMigrations,
} from './infrastructure/migrations.ts';

/** Контекст notify: каналы Telegram и почты, очередь отправки и сбои сайта. */
export var defineNotify = ({
  db,
  clock,
  site,
  transports,
}: {
  db: Database;
  clock: () => Date;
  site: () => SiteFacts;
  /** Подмена каналов в тестах: без сети. */
  transports?: Transports;
}) => {
  let kick = (): void => undefined;
  const runtime = defineRuntimeMark(db);
  const service = defineNotifyService({
    settings: defineSettingsRepository(db),
    outbox: defineOutboxRepository(db),
    incidents: defineIncidentRepository(db),
    transports: transports ?? {
      telegram: defineTelegramClient(),
      email: defineSmtpSender(),
    },
    clock,
    site,
    kick: () => kick(),
  });
  return {
    ...service,
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
          title: 'Сервер перезапущен без штатной остановки',
          detail: `Прошлый запуск — ${crashed}: процесс завершился без остановки (сбой, нехватка памяти или kill -9).`,
        })
      );
      return () => (
        background.stop(), runtime.stop(), (kick = () => undefined)
      );
    },
  };
};

export type Notify = ReturnType<typeof defineNotify>;
