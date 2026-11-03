import { attempt, fail } from '../../../shared/kernel/errors.ts';
import { isEmail, list, text } from './values.ts';

/** Токен почтового шлюза: на сервере — только хэш; сам токен показывается один раз, при выпуске. */
export type GatewayToken = {
  readonly id: string;
  /** Кто ходит с этим токеном: «Plattform». */
  readonly label: string;
  readonly hash: string;
  /** Последние четыре знака: узнать токен в списке. */
  readonly hint: string;
  readonly createdAt: string;
  readonly usedAt: string | null;
};

/** Почтовый шлюз: другие сервисы шлют письма через почту сайта — POST JSON с токеном. */
export type GatewaySettings = {
  readonly enabled: boolean;
  /** Адрес вида `/mailer/`; отвечает и без завершающей косой черты. */
  readonly path: string;
  readonly tokens: readonly GatewayToken[];
  /** Запросов в минуту с одного адреса; 0 — без предела. */
  readonly rateLimit: number;
  /** Кроме отправителя почты, письмо можно подписать этими адресами; чужой адрес заменяется отправителем. */
  readonly senders: readonly string[];
  /** Получатели — только в этих доменах и их поддоменах; пусто — любые. */
  readonly domains: readonly string[];
};

export var DEFAULT_GATEWAY: GatewaySettings = {
  enabled: false,
  path: '/mailer/',
  tokens: [],
  rateLimit: 15,
  senders: [],
  domains: [],
};

export var GATEWAY_TOKEN_PREFIX = 'mail_';
export var MAX_GATEWAY_TOKENS = 10;
export var MAX_RECIPIENTS = 50;
export var MAX_ATTACHMENTS = 40;
/** Предел вложения после base64 — как у прежнего PHP-шлюза, которому шлюз приходит на смену. */
export var MAX_ATTACHMENT_BYTES = 2_000_000;

const _MAX_SENDERS = 20;
const _MAX_DOMAINS = 50;
const _MAX_RATE = 10_000;

/** Токен без хэша: таким его видит менеджер. */
export type GatewayTokenView = Omit<GatewayToken, 'hash'>;

export var tokenView = (token: GatewayToken): GatewayTokenView => ({
  id: token.id,
  label: token.label,
  hint: token.hint,
  createdAt: token.createdAt,
  usedAt: token.usedAt,
});

/** Что нужно, чтобы шлюз принимал письма. */
export type GatewayChecks = {
  readonly enabled: boolean;
  readonly token: boolean;
  readonly sender: boolean;
  readonly smtp: boolean;
};

export var gatewayChecks = (
  gateway: GatewaySettings,
  email: { readonly from: string } | null
): GatewayChecks => ({
  enabled: gateway.enabled,
  token: gateway.tokens.length > 0,
  sender: email !== null && isEmail(email.from),
  smtp: email !== null,
});

export var isReady = (checks: GatewayChecks): boolean =>
  checks.enabled && checks.token && checks.sender && checks.smtp;

// Сегмент: строчная латиница, цифры, «-» и «_» не первым — так `/_cms/*`, robots.txt и
// /.well-known/ шлюзу недоступны. Первые сегменты `manager` и `media` заняты самим сервером.
const _SEGMENT = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const _RESERVED: readonly string[] = ['manager', 'media'];

/** Адрес шлюза вида `/mailer/`: косые по краям добавляются сами, регистр — строчный. */
export var parseGatewayPath = (raw: unknown): string =>
  ((segments) =>
    segments.length > 0 &&
    segments.length <= 4 &&
    segments.every((_) => _SEGMENT.test(_)) &&
    !_RESERVED.includes(segments[0]!)
      ? `/${segments.join('/')}/`
      : fail(
          'notify.invalid_gateway_path',
          'The gateway path is like /mailer/: Latin letters, digits and dashes, not /manager, /media or /_cms'
        ))(text(raw, 300).toLowerCase().split('/').filter(Boolean));

/**
 * Адрес занят шлюзом: включённым — или выключенным, но с токенами, чтобы клиент получил 503, а не чужую
 * страницу. Выключенный шлюз без токенов адрес не занимает.
 */
export var claims = (gateway: GatewaySettings, path: string): boolean =>
  (gateway.enabled || gateway.tokens.length > 0) &&
  (path === gateway.path || path === gateway.path.slice(0, -1));

// Домен — как его видит DNS: «küchen.de» → «xn--kchen-kva.de».
const _host = (domain: string): string =>
  attempt(
    () => new URL(`http://${domain}`).hostname,
    () => domain
  );

const _DOMAIN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const _domain = (raw: unknown): string =>
  ((value) =>
    _DOMAIN.test(value)
      ? value
      : fail('notify.invalid_domain', `"${value}" is not a domain name`))(
    _host(text(raw, 253).toLowerCase().replace(/^@/, ''))
  );

const _sender = (raw: unknown): string =>
  ((value) =>
    isEmail(value)
      ? value
      : fail('notify.invalid_sender', `"${value}" is not an email address`))(
    text(raw, 254).toLowerCase()
  );

const _limited = <T>(items: readonly T[], max: number, code: string): T[] =>
  items.length > max
    ? fail(code, `At most ${max} entries`)
    : [...new Set(items)];

// Пусто — предел по умолчанию; 0 — без предела.
const _rate = (raw: unknown): number =>
  ((value) =>
    Number.isInteger(value) && value >= 0 && value <= _MAX_RATE
      ? value
      : fail(
          'notify.invalid_rate_limit',
          `The rate limit is a whole number from 0 to ${_MAX_RATE}`
        ))(
    raw === '' || raw === null ? DEFAULT_GATEWAY.rateLimit : Number(raw)
  );

/** Настройки шлюза из формы; токены — только прежние: их выпускают и отзывают отдельно. */
export var parseGateway = (
  raw: Readonly<Record<string, unknown>>,
  previous: GatewaySettings
): GatewaySettings => ({
  enabled: raw.enabled === undefined ? previous.enabled : raw.enabled === true,
  path: raw.path === undefined ? previous.path : parseGatewayPath(raw.path),
  tokens: previous.tokens,
  rateLimit:
    raw.rateLimit === undefined ? previous.rateLimit : _rate(raw.rateLimit),
  senders:
    raw.senders === undefined
      ? previous.senders
      : _limited(
          list(raw.senders).map(_sender),
          _MAX_SENDERS,
          'notify.invalid_sender'
        ),
  domains:
    raw.domains === undefined
      ? previous.domains
      : _limited(
          list(raw.domains).map(_domain),
          _MAX_DOMAINS,
          'notify.invalid_domain'
        ),
});

export var tokenLabel = (raw: unknown): string =>
  ((label) =>
    label === ''
      ? fail('notify.token_label', 'Name the token: who will use it')
      : label)(text(raw, 80));

export var addToken =
  (token: GatewayToken) =>
  (gateway: GatewaySettings): GatewaySettings =>
    gateway.tokens.length >= MAX_GATEWAY_TOKENS
      ? fail(
          'notify.too_many_tokens',
          `At most ${MAX_GATEWAY_TOKENS} gateway tokens`
        )
      : { ...gateway, tokens: [...gateway.tokens, token] };

export var removeToken =
  (id: string) =>
  (gateway: GatewaySettings): GatewaySettings =>
    gateway.tokens.some((_) => _.id === id)
      ? { ...gateway, tokens: gateway.tokens.filter((_) => _.id !== id) }
      : fail(
          'notify.gateway_token_not_found',
          `There is no gateway token ${id}`
        );

export var touchToken =
  (id: string, at: string) =>
  (gateway: GatewaySettings): GatewaySettings => ({
    ...gateway,
    tokens: gateway.tokens.map((_) => (_.id === id ? { ..._, usedAt: at } : _)),
  });

/** Вложение письма шлюза: имя и тип уже очищены, содержимое — байты. */
export type MailAttachment = {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
  /** Для картинок в HTML (`<img src="cid:…">`); пусто — обычное вложение. */
  readonly contentId: string;
  readonly inline: boolean;
};

/** Письмо шлюза: отправитель выбран, адресаты проверены; HTML или текст может быть пустым, но не оба. */
export type Mail = {
  readonly from: { readonly address: string; readonly name: string };
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments: readonly MailAttachment[];
};

/** Почему письмо из запроса не отправить; коды — как у прежнего PHP-шлюза, плюс пределы шлюза Eile. */
export type MailProblem =
  | 'to_required'
  | 'too_many_recipients'
  | 'subject_required'
  | 'body_required'
  | 'recipient_not_allowed';

type Input = Readonly<Record<string, unknown>>;

export var recordOf = (value: unknown): Input | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Input)
    : null;

const _strings = (values: readonly unknown[]): string[] =>
  values.filter((_): _ is string => typeof _ === 'string').map((_) => _.trim());

// Клиенты шлют адрес строкой или объектом: {address}, {email}, а PocketBase — {Address}.
const _ADDRESS_KEYS: readonly string[] = [
  'address',
  'email',
  'Address',
  'Email',
];

/** Адрес из строки или объекта; не похож на адрес — пусто. */
export var addressOf = (value: unknown): string =>
  typeof value === 'string'
    ? ((address) => (isEmail(address) ? address : ''))(value.trim())
    : (_strings(_ADDRESS_KEYS.map((_) => recordOf(value)?.[_])).find(isEmail) ??
      '');

const _nameOf = (value: unknown): string =>
  (_strings([recordOf(value)?.name, recordOf(value)?.Name])[0] ?? '').slice(
    0,
    200
  );

/** Адресаты: строка, объект или их список; без повторов, негодные отброшены. */
export var recipientsOf = (to: unknown): string[] =>
  (Array.isArray(to) ? to : [to])
    .map(addressOf)
    .filter((_) => _ !== '')
    .reduce<string[]>(
      (all, address) =>
        all.some((_) => _.toLowerCase() === address.toLowerCase())
          ? all
          : [...all, address],
      []
    );

/**
 * Отправитель: адрес клиента — если это отправитель почты сайта или адрес из разрешённых, иначе
 * отправитель почты сайта; имя — клиента, иначе имя сайта.
 */
export var senderOf = (
  from: unknown,
  own: Mail['from'],
  allowed: readonly string[]
): Mail['from'] =>
  ((address, name) => ({
    address: [own.address, ...allowed].some(
      (_) => address !== '' && _.toLowerCase() === address.toLowerCase()
    )
      ? address
      : own.address,
    name: name || own.name,
  }))(addressOf(from), _nameOf(from));

const _allowed = (address: string, domains: readonly string[]): boolean =>
  domains.length === 0 ||
  ((host) => domains.some((_) => host === _ || host.endsWith(`.${_}`)))(
    _host(address.slice(address.lastIndexOf('@') + 1).toLowerCase())
  );

// Очистка — как у прежнего PHP-шлюза: имя без пути и только из [A-Za-z0-9._-], тип — без параметров.
const _filename = (raw: unknown): string =>
  ((name) => (/^\.*$/.test(name) ? '' : name))(
    (
      String(raw ?? 'file')
        .split(/[\\/]/)
        .at(-1) ?? ''
    )
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .slice(0, 150)
  );

const _TYPE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/;

const _contentType = (raw: unknown): string =>
  ((type) => (_TYPE.test(type) ? type : 'application/octet-stream'))(
    String(raw ?? '')
      .split(';')[0]!
      .replace(/[^A-Za-z0-9.+/-]+/g, '')
      .toLowerCase()
  );

const _contentId = (raw: unknown): string =>
  String(raw ?? '')
    .replace(/[^A-Za-z0-9._@-]+/g, '')
    .slice(0, 200);

const _EMPTY = new Uint8Array(0);

// Битый base64 — пустое вложение, оно отбрасывается, а не роняет письмо.
const _content = (item: Input): Uint8Array =>
  typeof item.contentBase64 === 'string'
    ? attempt(
        () => Uint8Array.fromBase64(item.contentBase64 as string),
        () => _EMPTY
      )
    : typeof item.content === 'string'
      ? new TextEncoder().encode(item.content)
      : _EMPTY;

const _attachment = (item: Input): MailAttachment | null => {
  const filename = _filename(item.filename);
  const content = filename === '' ? _EMPTY : _content(item);
  const contentId = _contentId(item.contentId ?? item.content_id);
  return content.length === 0 || content.length > MAX_ATTACHMENT_BYTES
    ? null
    : {
        filename,
        contentType: _contentType(item.contentType ?? item.content_type),
        content,
        contentId,
        inline: contentId !== '' && item.inline !== false,
      };
};

/** Вложения: не больше 40, каждое до 2 МБ; пустые, битые и слишком большие отброшены молча, как в PHP. */
export var attachmentsOf = (raw: unknown): MailAttachment[] =>
  (Array.isArray(raw) ? raw : []).reduce<MailAttachment[]>(
    (all, value) =>
      ((item) =>
        all.length >= MAX_ATTACHMENTS || item === null
          ? all
          : ((attachment) => (attachment ? [...all, attachment] : all))(
              _attachment(item)
            ))(recordOf(value)),
    []
  );

/** Письмо из тела запроса шлюза — или первая причина отказа, в том же порядке, что у PHP-шлюза. */
export var mailOf = (
  body: Input,
  own: Mail['from'],
  gateway: GatewaySettings
): Mail | { readonly problem: MailProblem } => {
  const to = recipientsOf(body.to);
  const subject = text(body.subject, 900);
  const html = typeof body.html === 'string' ? body.html : '';
  const plain = typeof body.text === 'string' ? body.text : '';
  const problem: MailProblem | null =
    to.length === 0
      ? 'to_required'
      : to.length > MAX_RECIPIENTS
        ? 'too_many_recipients'
        : subject === ''
          ? 'subject_required'
          : html === '' && plain === ''
            ? 'body_required'
            : to.some((_) => !_allowed(_, gateway.domains))
              ? 'recipient_not_allowed'
              : null;
  return problem
    ? { problem }
    : {
        from: senderOf(body.from, own, gateway.senders),
        to,
        subject,
        html,
        text: plain,
        attachments: attachmentsOf(body.attachments),
      };
};
