import { fail } from '../../../shared/kernel/errors.ts';
import { text } from './values.ts';

/**
 * Почтовый сервис с HTTP API: письмо уходит по HTTPS на порт 443, когда хостинг закрыл порты SMTP
 * (ADR 0051).
 */
export type MailProvider = 'brevo' | 'postmark' | 'mailgun' | 'resend' | 'ses';

export var MAIL_PROVIDERS: readonly MailProvider[] = [
  'brevo',
  'postmark',
  'mailgun',
  'resend',
  'ses',
];

/** Имя для людей: в ошибках отправки и строке состояния почты. */
export var PROVIDER_NAMES: Readonly<Record<MailProvider, string>> = {
  brevo: 'Brevo',
  postmark: 'Postmark',
  mailgun: 'Mailgun',
  resend: 'Resend',
  ses: 'Amazon SES',
};

/** Что нужно провайдеру кроме адресов; поля, которых у провайдера нет, — пустые строки. */
export type ApiFields = {
  /** Ключ API; у Postmark — токен сервера, у SES — секретный ключ доступа. */
  readonly key: string;
  /** SES: идентификатор ключа доступа (`AKIA…`). */
  readonly keyId: string;
  /** Mailgun: `us` или `eu`; SES: регион AWS (`eu-central-1`). */
  readonly region: string;
  /** Mailgun: домен отправки (`mg.example.com`). */
  readonly domain: string;
  /** Postmark: поток сообщений; по умолчанию `outbound`. */
  readonly stream: string;
};

type Input = Readonly<Record<string, unknown>>;

const _NONE: Omit<ApiFields, 'key'> = {
  keyId: '',
  region: '',
  domain: '',
  stream: '',
};

// Ключи всех пяти сервисов — печатный ASCII от 20 знаков: короче — обрывок, а не ключ.
const _KEY = /^[\x21-\x7e]{20,512}$/;
const _KEY_ID = /^[A-Z0-9]{16,128}$/;
const _AWS_REGION = /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/;
const _STREAM = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const _DOMAIN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const _MAILGUN_REGIONS: readonly string[] = ['us', 'eu'];

const _stream = (raw: unknown): string =>
  ((stream) =>
    _STREAM.test(stream)
      ? stream
      : fail(
          'notify.invalid_stream',
          'The message stream is an id like outbound'
        ))(text(raw, 100) || 'outbound');

const _mailgunRegion = (raw: unknown): string =>
  ((region) =>
    _MAILGUN_REGIONS.includes(region)
      ? region
      : fail('notify.invalid_region', 'The Mailgun region is us or eu'))(
    text(raw, 10).toLowerCase() || 'us'
  );

const _awsRegion = (raw: unknown): string =>
  ((region) =>
    _AWS_REGION.test(region)
      ? region
      : fail(
          'notify.invalid_region',
          'The AWS region is a code like eu-central-1'
        ))(text(raw, 40).toLowerCase());

// Пусто — домен адреса отправителя: так у Mailgun бывает чаще всего.
const _mailgunDomain = (raw: unknown, from: string): string =>
  ((domain) =>
    _DOMAIN.test(domain)
      ? domain
      : fail(
          'notify.invalid_mail_domain',
          'The Mailgun domain is a domain name like mg.example.com'
        ))(text(raw, 253).toLowerCase() || (from.split('@')[1] ?? ''));

// Временный ключ (ASIA…) живёт часы и без токена сеанса не подписывает: нужен ключ пользователя IAM.
const _keyId = (raw: unknown): string =>
  ((id) =>
    id === ''
      ? fail('notify.no_key_id', 'The access key id is required')
      : id.startsWith('ASIA')
        ? fail(
            'notify.temporary_key',
            'Temporary AWS keys (ASIA…) expire: create an access key of an IAM user (AKIA…)'
          )
        : _KEY_ID.test(id)
          ? id
          : fail(
              'notify.invalid_key_id',
              'The access key id looks like AKIAIOSFODNN7EXAMPLE'
            ))(text(raw, 128).toUpperCase());

const _FIELDS: Readonly<
  Record<MailProvider, (raw: Input, from: string) => Omit<ApiFields, 'key'>>
> = {
  brevo: () => _NONE,
  resend: () => _NONE,
  postmark: (raw) => ({ ..._NONE, stream: _stream(raw.stream) }),
  mailgun: (raw, from) => ({
    ..._NONE,
    region: _mailgunRegion(raw.region),
    domain: _mailgunDomain(raw.domain, from),
  }),
  ses: (raw) => ({
    ..._NONE,
    region: _awsRegion(raw.region),
    keyId: _keyId(raw.keyId),
  }),
};

// Ключ SMTP у Brevo (xsmtpsib-…) API не принимает: частая путаница, о ней — сразу.
const _KEY_RULES: Readonly<
  Record<MailProvider, (key: string) => readonly [string, string] | null>
> = {
  brevo: (key) =>
    key.startsWith('xsmtpsib-')
      ? [
          'notify.brevo_smtp_key',
          'This is a Brevo SMTP key: the API needs an API key (xkeysib-…)',
        ]
      : null,
  resend: (key) =>
    key.startsWith('re_')
      ? null
      : ['notify.resend_key', 'A Resend API key starts with re_'],
  postmark: () => null,
  mailgun: () => null,
  ses: () => null,
};

const _key = (provider: MailProvider, key: string): string =>
  key === ''
    ? fail('notify.no_key', 'The API key is required')
    : !_KEY.test(key)
      ? fail('notify.invalid_key', 'This does not look like an API key')
      : ((problem) => (problem ? fail(problem[0], problem[1]) : key))(
          _KEY_RULES[provider](key)
        );

/** Ключ годится для другого запроса, только если он уходит туда же: тот же сервис, регион и ключ доступа. */
const _sameEndpoint = (
  provider: MailProvider,
  fields: Omit<ApiFields, 'key'>,
  previous: ApiFields & { readonly transport: string }
): boolean =>
  previous.transport === provider &&
  previous.region === fields.region &&
  previous.keyId === fields.keyId;

/**
 * Поля провайдера из формы. Пустой ключ — прежний, но только для того же сервиса, региона и ключа
 * доступа: в другой сервис или регион прежний ключ не уходит.
 */
export var parseApiFields = (
  provider: MailProvider,
  raw: Input,
  from: string,
  previous: (ApiFields & { readonly transport: string }) | null
): ApiFields =>
  ((fields) => ({
    key: _key(
      provider,
      text(raw.key, 512) ||
        (previous && _sameEndpoint(provider, fields, previous)
          ? previous.key
          : '')
    ),
    ...fields,
  }))(_FIELDS[provider](raw, from));

/** Последние четыре знака ключа: узнать его в строке состояния, не показывая. */
export var keyHint = (key: string): string => key.slice(-4);
