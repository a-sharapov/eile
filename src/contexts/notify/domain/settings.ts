import { fail } from '../../../shared/kernel/errors.ts';
import {
  CHANNELS,
  type ChannelKind,
  SEVERITIES,
  type Severity,
} from './message.ts';

/** Чат, куда бот пишет: id из Telegram и название для людей. */
export type Chat = { readonly id: string; readonly title: string };

export type TelegramSettings = {
  readonly token: string;
  readonly chats: readonly Chat[];
  /** HTTP-прокси до api.telegram.org: `http://user:pass@host:3128`; пусто — напрямую. */
  readonly proxy: string;
};

/** tls — шифрование сразу (порт 465), starttls — после приветствия (587), none — без шифрования. */
export type SmtpSecurity = 'tls' | 'starttls' | 'none';

export type EmailSettings = {
  readonly host: string;
  readonly port: number;
  readonly security: SmtpSecurity;
  /** Пусто — сервер принимает письма без входа (релей в своей сети). */
  readonly user: string;
  readonly password: string;
  readonly from: string;
  readonly to: readonly string[];
};

/** Каналы и маршруты: куда заявки, куда сбои и с какой важности. Настройка сервера, в копию не идёт. */
export type NotifySettings = {
  readonly telegram: TelegramSettings | null;
  readonly email: EmailSettings | null;
  readonly forms: readonly ChannelKind[];
  readonly incidents: readonly ChannelKind[];
  /** Сбои ниже этой важности — только в журнал. */
  readonly level: Severity;
};

export var EMPTY_SETTINGS: NotifySettings = {
  telegram: null,
  email: null,
  forms: CHANNELS,
  incidents: CHANNELS,
  level: 'error',
};

/** Настройки для менеджера: без токена и пароля — их он не показывает и не отдаёт. */
export type NotifyStatus = {
  readonly telegram:
    | (Omit<TelegramSettings, 'token'> & { readonly hasToken: true })
    | null;
  readonly email:
    | (Omit<EmailSettings, 'password'> & { readonly hasPassword: boolean })
    | null;
  readonly forms: readonly ChannelKind[];
  readonly incidents: readonly ChannelKind[];
  readonly level: Severity;
};

export var statusOf = (settings: NotifySettings): NotifyStatus => ({
  telegram: settings.telegram && {
    chats: settings.telegram.chats,
    proxy: settings.telegram.proxy,
    hasToken: true,
  },
  email: settings.email && {
    host: settings.email.host,
    port: settings.email.port,
    security: settings.email.security,
    user: settings.email.user,
    from: settings.email.from,
    to: settings.email.to,
    hasPassword: settings.email.password !== '',
  },
  forms: settings.forms,
  incidents: settings.incidents,
  level: settings.level,
});

/** Каналы, которые настроены: маршрут к ненастроенному каналу ничего не отправляет. */
export var configured = (settings: NotifySettings): ChannelKind[] =>
  CHANNELS.filter((_) => settings[_] !== null);

type Input = Record<string, unknown>;

const _TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
const _CHAT_ID = /^(?:-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/;
const _PROXY = /^https?:\/\/[^\s/?#]+(?::\d+)?\/?$/i;
const _HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const _EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const _SECURITY: readonly SmtpSecurity[] = ['tls', 'starttls', 'none'];
const _PORTS: Readonly<Record<SmtpSecurity, number>> = {
  tls: 465,
  starttls: 587,
  none: 25,
};

const _text = (value: unknown, max = 500): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const _list = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,;]+/).filter(Boolean)
      : [];

/** Адрес почты: строчными, без мусора вокруг; не похож на адрес — отказ. */
export var parseEmail = (raw: unknown): string =>
  ((value) =>
    _EMAIL.test(value)
      ? value
      : fail('notify.invalid_email', `"${value}" is not an email address`))(
    _text(raw, 254).toLowerCase()
  );

const _chats = (raw: unknown): Chat[] =>
  ((chats) =>
    chats.length > 20
      ? fail('notify.invalid_chat', 'At most 20 chats')
      : chats)(
    _list(raw).map((item): Chat => {
      const chat = (item ?? {}) as Input;
      const id = _text(chat.id ?? item, 40);
      return _CHAT_ID.test(id)
        ? { id, title: _text(chat.title, 100) || id }
        : fail('notify.invalid_chat', `"${id}" is not a Telegram chat id`);
    })
  );

// Пустой токен — прежний: в форму он не возвращается.
const _telegram = (
  raw: Input,
  previous: TelegramSettings | null
): TelegramSettings => {
  const token = _text(raw.token, 200) || previous?.token || '';
  const proxy = _text(raw.proxy, 300);
  return {
    token:
      token === ''
        ? fail('notify.no_token', 'The bot token is required')
        : _TOKEN.test(token)
          ? token
          : fail('notify.invalid_token', 'This does not look like a bot token'),
    chats: _chats(raw.chats ?? previous?.chats ?? []),
    proxy:
      proxy === '' || _PROXY.test(proxy)
        ? proxy
        : fail('notify.invalid_proxy', 'Proxy is http(s)://host:port'),
  };
};

// Пустой пароль — прежний, но только для того же сервера и входа: на чужой хост он не уходит.
const _email = (raw: Input, previous: EmailSettings | null): EmailSettings => {
  const host = _text(raw.host, 253).toLowerCase();
  const security = (_text(raw.security) || 'tls') as SmtpSecurity;
  const port = Number(raw.port || _PORTS[security] || 0);
  const user = _text(raw.user, 200);
  const same = previous?.host === host && previous.user === user;
  const password =
    (typeof raw.password === 'string' ? raw.password : '') ||
    (same ? previous.password : '');
  return {
    host: _HOST.test(host)
      ? host
      : fail('notify.invalid_host', 'Mail server is a host name'),
    port:
      Number.isInteger(port) && port > 0 && port < 65536
        ? port
        : fail('notify.invalid_port', 'Port is a number from 1 to 65535'),
    security: _SECURITY.includes(security)
      ? security
      : fail('notify.invalid_security', 'Security is tls, starttls or none'),
    user,
    password:
      user !== '' && password === ''
        ? fail('notify.no_password', 'The password is required')
        : password,
    from: parseEmail(raw.from),
    to: ((to) =>
      to.length === 0 || to.length > 10
        ? fail('notify.invalid_email', 'From 1 to 10 recipients')
        : to)([...new Set(_list(raw.to).map(parseEmail))]),
  };
};

const _channels = (raw: unknown): ChannelKind[] =>
  CHANNELS.filter((_) => _list(raw).includes(_));

/** Новые настройки из формы; `telegram: null` или `email: null` убирают канал. */
export var parseSettings = (
  input: Input,
  previous: NotifySettings
): NotifySettings => ({
  telegram:
    input.telegram === undefined
      ? previous.telegram
      : input.telegram === null
        ? null
        : _telegram(input.telegram as Input, previous.telegram),
  email:
    input.email === undefined
      ? previous.email
      : input.email === null
        ? null
        : _email(input.email as Input, previous.email),
  forms: input.forms === undefined ? previous.forms : _channels(input.forms),
  incidents:
    input.incidents === undefined
      ? previous.incidents
      : _channels(input.incidents),
  level:
    input.level === undefined
      ? previous.level
      : SEVERITIES.includes(input.level as Severity)
        ? (input.level as Severity)
        : fail(
            'notify.invalid_level',
            'Level is critical, error, warning or info'
          ),
});
