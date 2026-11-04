import type { Localized } from '../../../shared/kernel/manager-language.ts';
import type { Delivery, DeliveryStatus } from './delivery.ts';
import type { Mail } from './gateway.ts';
import type { ChannelKind, Message, Severity } from './message.ts';
import type {
  Chat,
  EmailSettings,
  NotifySettings,
  TelegramSettings,
} from './settings.ts';

export type SettingsRepository = {
  readonly get: () => NotifySettings;
  readonly save: (settings: NotifySettings) => void;
};

export type NewDelivery = {
  readonly channel: ChannelKind;
  readonly recipient: string;
  readonly message: Message;
  readonly source: string | null;
};

export type OutboxRepository = {
  readonly add: (delivery: NewDelivery, now: string) => number;
  /** Пора отправлять: `pending`, чей срок наступил, старые первыми. */
  readonly due: (now: string, limit: number) => Delivery[];
  readonly get: (id: number) => Delivery | null;
  readonly bySource: (source: string) => Delivery[];
  readonly recent: (limit: number) => Delivery[];
  readonly mark: (
    id: number,
    change: {
      readonly status: DeliveryStatus;
      readonly attempts: number;
      readonly nextAt: string;
      readonly lastError: string;
      readonly sentAt: string | null;
    }
  ) => void;
  /** Удаляет отправленные и отказанные старше момента; ждущие не трогает. */
  readonly purge: (before: string) => number;
};

/** Строка журнала сбоев: повторы одного сбоя — счётчиком. */
export type IncidentRecord = {
  readonly id: number;
  readonly fingerprint: string;
  readonly kind: string;
  readonly severity: Severity;
  /** На каждом языке; строка — запись со старой версии или одна на все языки. */
  readonly title: Localized | string;
  readonly detail: Localized | string;
  readonly count: number;
  readonly firstAt: string;
  readonly lastAt: string;
};

export type IncidentRepository = {
  readonly record: (
    incident: Omit<IncidentRecord, 'id' | 'count' | 'firstAt' | 'lastAt'>,
    now: string
  ) => IncidentRecord;
  readonly list: (limit: number) => IncidentRecord[];
  readonly purge: (before: string) => number;
};

/** Бот Telegram: отправка, проверка токена и чаты, которые ему писали. */
export type TelegramApi = {
  readonly send: (
    settings: TelegramSettings,
    chat: string,
    message: Message,
    site: string
  ) => Promise<void>;
  /** Имя бота: заодно проверка токена и прокси. */
  readonly me: (
    settings: Pick<TelegramSettings, 'token' | 'proxy'>
  ) => Promise<string>;
  readonly chats: (
    settings: Pick<TelegramSettings, 'token' | 'proxy'>
  ) => Promise<Chat[]>;
};

/**
 * Почта на связи — без входа и без письма: сервер SMTP подключился и поздоровался кодом 220, HTTP API
 * сервиса ответил по HTTPS.
 */
export type SmtpProbe = {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly error?:
    | 'connect_failed'
    | 'timeout'
    | 'tls_failed'
    | 'unexpected_reply';
};

/** Отправка почты; `S` — настройки одного способа отправки, у общего отправителя — любые. */
export type EmailSender<S extends EmailSettings = EmailSettings> = {
  readonly send: (
    settings: S,
    to: readonly string[],
    message: Message,
    site: string
  ) => Promise<void>;
  /** Готовое письмо почтового шлюза: HTML, текст и вложения пришли от другого сервиса. */
  readonly mail: (settings: S, mail: Mail) => Promise<void>;
  readonly probe: (settings: S) => Promise<SmtpProbe>;
};

/** Токены шлюза: выпуск, хэш для хранения и сравнение хэшей за постоянное время. */
export type GatewaySecrets = {
  readonly issue: () => string;
  readonly id: () => string;
  readonly hash: (token: string) => string;
  readonly same: (a: string, b: string) => boolean;
};

export type Transports = {
  readonly telegram: TelegramApi;
  readonly email: EmailSender;
};
