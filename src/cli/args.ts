import { parseArgs } from 'node:util';
import { attempt } from '../shared/kernel/errors.ts';
import { cliLanguage, type Language } from './language.ts';
import type { Env } from './paint.ts';

export type Options = {
  readonly port: string;
  readonly db: string;
  /** Каталог кэша медиатеки; не задан — `<база>.media-cache` рядом с базой. */
  readonly mediaCache?: string;
  readonly name?: string;
  readonly role?: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly passwordStdin: boolean;
  /** `cms update --check`: только сказать, есть ли новая версия. */
  readonly check?: boolean;
  /** За обратным прокси: протокол, адрес сайта и посетителя — из X-Forwarded-*. */
  readonly trustProxy: boolean;
  /** HTTPS без прокси: домены через запятую — сервер сам получает сертификат Let's Encrypt. */
  readonly domain?: string;
  /** Почта для писем Let's Encrypt о сертификате. */
  readonly email?: string;
  /** Порт HTTPS; по умолчанию 443. */
  readonly httpsPort?: string;
  /** Тестовый центр Let's Encrypt — проба без лимитов боевого. */
  readonly acmeStaging?: boolean;
  /** Свой каталог ACME — для проверки на стенде. */
  readonly acmeDirectory?: string;
  /** `cms elements push --prune`: удалить из сайта то, чего нет в папке. */
  readonly prune?: boolean;
  /** `cms elements push --watch`: отправлять при каждом сохранении файла. */
  readonly watch?: boolean;
  /** Итог в JSON — для скриптов и агентов. */
  readonly json?: boolean;
  /** `cms mcp --user <почта>`: от чьего имени и с чьими правами работает агент. */
  readonly user?: string;
  /** Адрес, на котором слушает сервер; по умолчанию — все адреса машины. */
  readonly host?: string;
  /** `cms service install --from <файл>`: перенести в службу сайт из этой базы. */
  readonly from?: string;
  /** `cms service install --print`: только показать юнит, ничего не менять. */
  readonly print?: boolean;
  /** `cms service install --force`: заменить другой юнит с этим именем. */
  readonly force?: boolean;
  /** `cms service logs -f`: следить за журналом. */
  readonly follow?: boolean;
  /** `cms update --no-restart`: не перезапускать службу systemd. */
  readonly noRestart?: boolean;
};

/** Разобранная строка вызова: команда, её аргументы и параметры; или ошибка для человека. */
export type Invocation =
  | {
      /** null — команды нет: запуск сервера, а `--help` показывает общую справку. */
      readonly command: string | null;
      readonly args: readonly string[];
      readonly options: Options;
    }
  | { readonly error: string };

const _OPTIONS = {
  port: { type: 'string' },
  db: { type: 'string' },
  'media-cache': { type: 'string' },
  name: { type: 'string' },
  role: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  'password-stdin': { type: 'boolean' },
  check: { type: 'boolean' },
  'trust-proxy': { type: 'boolean' },
  domain: { type: 'string' },
  email: { type: 'string' },
  'https-port': { type: 'string' },
  'acme-staging': { type: 'boolean' },
  prune: { type: 'boolean' },
  watch: { type: 'boolean' },
  json: { type: 'boolean' },
  user: { type: 'string' },
  host: { type: 'string' },
  from: { type: 'string' },
  print: { type: 'boolean' },
  force: { type: 'boolean' },
  follow: { type: 'boolean', short: 'f' },
  'no-restart': { type: 'boolean' },
} as const;

// parseArgs говорит длинно: «Unknown option '--prot'…» — самое частое говорим коротко и на языке CLI.
const _SAY = {
  ru: {
    unknown: (option: string) => `Нет параметра ${option}. Список — cms help`,
    missing: (option: string) => `У параметра нет значения: ${option}`,
  },
  en: {
    unknown: (option: string) => `No option ${option}. List them: cms help`,
    missing: (option: string) => `The option has no value: ${option}`,
  },
} satisfies Record<Language, unknown>;

const _message = (error: unknown, language: Language): string =>
  ((text) =>
    ((unknown) =>
      unknown
        ? _SAY[language].unknown(unknown[1]!)
        : /argument missing/i.test(text)
          ? _SAY[language].missing(text.match(/'(-[^']+)'/)?.[1] ?? '')
          : text)(text.match(/Unknown option '([^']+)'/)))(
    error instanceof Error ? error.message : String(error)
  );

const _parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: _OPTIONS,
  });

/** `cms [команда] [аргументы] [--параметры]`. */
export var parseInvocation = (argv: readonly string[], env: Env): Invocation =>
  attempt<Invocation>(
    () =>
      ((parsed) =>
        ((domain, email, httpsPort, mediaCache, host) => ({
          command: parsed.positionals[0] ?? null,
          args: parsed.positionals.slice(1),
          options: {
            // С доменом сайт живёт на своём сервере: HTTP — на 80, рядом с HTTPS.
            port: parsed.values.port ?? env.PORT ?? (domain ? '80' : '8080'),
            db: parsed.values.db ?? env.CMS_DB ?? 'site.db',
            ...(mediaCache ? { mediaCache } : {}),
            name: parsed.values.name,
            role: parsed.values.role,
            help: parsed.values.help ?? false,
            version: parsed.values.version ?? false,
            passwordStdin: parsed.values['password-stdin'] ?? false,
            ...(parsed.values.check ? { check: true } : {}),
            trustProxy:
              parsed.values['trust-proxy'] ?? env.CMS_TRUST_PROXY === '1',
            ...(domain ? { domain } : {}),
            ...(email ? { email } : {}),
            ...(httpsPort ? { httpsPort } : {}),
            ...(parsed.values['acme-staging'] ? { acmeStaging: true } : {}),
            ...(parsed.values.prune ? { prune: true } : {}),
            ...(parsed.values.watch ? { watch: true } : {}),
            ...(parsed.values.json ? { json: true } : {}),
            ...(parsed.values.user ? { user: parsed.values.user } : {}),
            ...(host ? { host } : {}),
            ...(parsed.values.from ? { from: parsed.values.from } : {}),
            ...(parsed.values.print ? { print: true } : {}),
            ...(parsed.values.force ? { force: true } : {}),
            ...(parsed.values.follow ? { follow: true } : {}),
            ...(parsed.values['no-restart'] ? { noRestart: true } : {}),
            ...(env.CMS_ACME_DIRECTORY
              ? { acmeDirectory: env.CMS_ACME_DIRECTORY }
              : {}),
          },
        }))(
          parsed.values.domain ?? env.CMS_DOMAIN,
          parsed.values.email ?? env.CMS_ACME_EMAIL,
          parsed.values['https-port'] ?? env.CMS_HTTPS_PORT,
          parsed.values['media-cache'] ?? env.CMS_MEDIA_CACHE,
          parsed.values.host ?? env.CMS_HOST
        ))(_parse(argv)),
    (error) => ({ error: _message(error, cliLanguage(env)) })
  );
