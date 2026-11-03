import { fail } from '../../../shared/kernel/errors.ts';
import type { ManagerLanguage } from '../../../shared/kernel/manager-language.ts';
import { failureOf } from '../domain/delivery.ts';
import {
  addToken,
  claims,
  GATEWAY_TOKEN_PREFIX,
  type GatewaySettings,
  type GatewayToken,
  type GatewayTokenView,
  type Mail,
  type MailProblem,
  mailOf,
  recordOf,
  removeToken,
  tokenLabel,
  tokenView,
  touchToken,
} from '../domain/gateway.ts';
import type { Incident } from '../domain/incident.ts';
import type {
  EmailSender,
  GatewaySecrets,
  SettingsRepository,
  SmtpProbe,
} from '../domain/ports.ts';
import { type GatewayStatus, gatewayStatusOf } from '../domain/settings.ts';
import { isEmail } from '../domain/values.ts';

/** Чем кончился запрос к шлюзу: `sent` или код ошибки, который получит клиент. */
export type GatewayOutcome =
  | 'sent'
  | 'disabled'
  | 'smtp_not_ready'
  | 'rate_limited'
  | 'unauthorized'
  | 'invalid_json'
  | 'too_large'
  | 'from_misconfigured'
  | MailProblem
  | 'send_failed';

/** Строка журнала шлюза: без адресов, темы и текста — чей токен, сколько адресатов и чем кончилось. */
export type GatewayEntry = {
  readonly at: string;
  readonly token: string | null;
  readonly recipients: number;
  readonly attachments: number;
  readonly outcome: GatewayOutcome;
};

/** Готов ли шлюз принимать письма вообще — до токена и тела запроса. */
export type GatewayState = 'ready' | 'disabled' | 'smtp_not_ready';

export type GatewaySent = Pick<
  GatewayEntry,
  'outcome' | 'recipients' | 'attachments'
>;

export type IssuedGatewayToken = GatewayTokenView & { readonly token: string };

export type GatewayPorts = {
  readonly settings: SettingsRepository;
  readonly email: EmailSender;
  readonly secrets: GatewaySecrets;
  readonly clock: () => Date;
  /** Имя сайта — имя отправителя, если клиент своего не дал. */
  readonly siteName: () => string;
  readonly language: () => ManagerLanguage;
  readonly report: (incident: Incident) => void;
  /** Строка журнала на каждый запрос с письмом. */
  readonly log: (line: string) => void;
};

const _WINDOW_MS = 60_000;
const _MAX_CLIENTS = 10_000;
const _RECENT = 20;

const _counted = (
  outcome: GatewayOutcome,
  mail: Mail | null = null
): GatewaySent => ({
  outcome,
  recipients: mail?.to.length ?? 0,
  attachments: mail?.attachments.length ?? 0,
});

// Ответ почтового сервера бывает с адресом («550 <user@x>: unknown»): в журнал сбоев адреса не попадают.
const _scrub = (message: string): string =>
  message.replace(/[^\s<>"',;:]+@[^\s<>"',;]+/g, '<…>');

const _TEST: Readonly<
  Record<
    ManagerLanguage,
    {
      readonly subject: string;
      readonly text: (site: string, path: string) => string;
    }
  >
> = {
  en: {
    subject: 'Mail gateway test',
    text: (site, path) =>
      `This letter went through the mail gateway of “${site}” (${path}): the same path the letters of other services take.`,
  },
  de: {
    subject: 'Test des Mail-Gateways',
    text: (site, path) =>
      `Diese E-Mail ging über das Mail-Gateway der Website „${site}“ (${path}) – denselben Weg wie die E-Mails anderer Dienste.`,
  },
  ru: {
    subject: 'Проверка почтового шлюза',
    text: (site, path) =>
      `Это письмо прошло через почтовый шлюз сайта «${site}» (${path}) — тем же путём, что письма других сервисов.`,
  },
};

/** Почтовый шлюз: токены, предел запросов, письмо из запроса и его отправка через почту сайта. */
export var defineGatewayService = ({
  settings,
  email,
  secrets,
  clock,
  siteName,
  language,
  report,
  log,
}: GatewayPorts) => {
  // Окно в минуту на адрес клиента: начало окна и сколько запросов в нём.
  const windows = new Map<string, { start: number; count: number }>();
  let recent: readonly GatewayEntry[] = [];

  const iso = (): string => clock().toISOString();

  const change = (next: (gateway: GatewaySettings) => GatewaySettings): void =>
    ((current) =>
      settings.save({ ...current, gateway: next(current.gateway) }))(
      settings.get()
    );

  const own = (from: string): Mail['from'] => ({
    address: from,
    name: siteName(),
  });

  const failed = (token: GatewayToken, error: unknown): void =>
    report({
      kind: 'notify.gateway_failed',
      severity: 'warning',
      title: {
        en: 'Mail gateway: a letter was not sent',
        de: 'Mail-Gateway: Eine E-Mail wurde nicht gesendet',
        ru: 'Почтовый шлюз: письмо не ушло',
      },
      detail: `${token.label}: ${_scrub(failureOf(error).message)}`,
      key: 'notify.gateway_failed',
      avoid: ['email'],
    });

  const deliver = (token: GatewayToken, mail: Mail): Promise<GatewaySent> =>
    ((current) =>
      current
        ? email.mail(current, mail).then(
            () => _counted('sent', mail),
            (error) => (failed(token, error), _counted('send_failed', mail))
          )
        : Promise.resolve(_counted('smtp_not_ready', mail)))(
      settings.get().email
    );

  return {
    /** Этот адрес — шлюза: запрос идёт ему, а не сайту, даже если там страница или переадресация. */
    claims: (path: string): boolean => claims(settings.get().gateway, path),
    state: (): GatewayState =>
      ((current) =>
        !current.gateway.enabled
          ? 'disabled'
          : current.email === null
            ? 'smtp_not_ready'
            : 'ready')(settings.get()),
    status: (): GatewayStatus => gatewayStatusOf(settings.get()),
    /** Ещё один запрос с адреса клиента: укладывается ли он в предел минуты. */
    allowed: (client: string): boolean => {
      const limit = settings.get().gateway.rateLimit;
      const at = clock().getTime();
      const window = windows.get(client);
      const next =
        window && at - window.start < _WINDOW_MS
          ? { start: window.start, count: window.count + 1 }
          : { start: at, count: 1 };
      void (windows.size >= _MAX_CLIENTS && windows.clear());
      windows.set(client, next);
      return limit === 0 || next.count <= limit;
    },
    /**
     * Токен из `Authorization: Bearer …`. Хэш предъявленного сравнивается с каждым сохранённым за
     * постоянное время и без выхода на первом совпадении.
     */
    authorize: (presented: string | null): GatewayToken | null =>
      presented
        ? ((hash) =>
            ((found) => (
              void (found && change(touchToken(found.id, iso()))), found
            ))(
              settings
                .get()
                .gateway.tokens.reduce<GatewayToken | null>(
                  (match, token) =>
                    secrets.same(token.hash, hash) ? token : match,
                  null
                )
            ))(secrets.hash(presented))
        : null,
    /** Письмо из тела запроса — через почту сайта сразу, без очереди: клиент узнаёт, принял ли его сервер. */
    send: (body: unknown, token: GatewayToken): Promise<GatewaySent> =>
      Promise.resolve(settings.get()).then((current) =>
        ((input, from) =>
          input === null
            ? _counted('invalid_json')
            : from === null
              ? _counted('smtp_not_ready')
              : !isEmail(from)
                ? _counted('from_misconfigured')
                : ((mail) =>
                    'problem' in mail
                      ? _counted(mail.problem)
                      : deliver(token, mail))(
                    mailOf(input, own(from), current.gateway)
                  ))(recordOf(body), current.email?.from ?? null)
      ),
    /** Журнал: строка в вывод сервера и последние запросы в памяти — для менеджера. */
    record: (entry: Omit<GatewayEntry, 'at'>): void =>
      ((full) => (
        (recent = [full, ...recent].slice(0, _RECENT)),
        log(
          `mail-gateway ${full.at} token=${full.token === null ? '-' : JSON.stringify(full.token)} to=${full.recipients} files=${full.attachments} ${full.outcome}`
        )
      ))({ at: iso(), ...entry }),
    recent: (): readonly GatewayEntry[] => recent,
    /** Почтовый сервер на связи — без входа; почта не настроена — null. */
    probe: (): Promise<SmtpProbe | null> =>
      ((current) => (current ? email.probe(current) : Promise.resolve(null)))(
        settings.get().email
      ),
    /** Проверочное письмо тому, кто нажал кнопку: тем же путём, что письма клиентов шлюза. */
    test: (to: string): Promise<void> =>
      Promise.resolve(settings.get()).then((current) =>
        current.email
          ? email
              .mail(current.email, {
                from: own(current.email.from),
                to: [to],
                subject: `${_TEST[language()].subject} — ${siteName()}`,
                html: '',
                text: _TEST[language()].text(siteName(), current.gateway.path),
                attachments: [],
              })
              .then(undefined, (error) =>
                fail('notify.test_failed', failureOf(error).message)
              )
          : fail('notify.not_configured', 'Email is not configured')
      ),
    tokens: {
      /** Новый токен: сам токен — только в этом ответе, на сервере остаётся хэш. */
      issue: (label: unknown): IssuedGatewayToken =>
        ((name, token) =>
          ((entry) => (
            change(addToken(entry)),
            report({
              kind: 'notify.gateway_token_issued',
              severity: 'info',
              title: {
                en: 'A new mail gateway token',
                de: 'Neuer Token für das Mail-Gateway',
                ru: 'Выпущен токен почтового шлюза',
              },
              detail: name,
              key: `notify.gateway_token_issued:${entry.id}`,
            }),
            { ...tokenView(entry), token }
          ))({
            id: secrets.id(),
            label: name,
            hash: secrets.hash(token),
            hint: token.slice(-4),
            createdAt: iso(),
            usedAt: null,
          }))(tokenLabel(label), `${GATEWAY_TOKEN_PREFIX}${secrets.issue()}`),
      revoke: (id: string): void => change(removeToken(id)),
    },
  };
};

export type GatewayService = ReturnType<typeof defineGatewayService>;
