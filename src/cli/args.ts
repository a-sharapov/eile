import { parseArgs } from 'node:util';
import { attempt } from '../shared/kernel/errors.ts';
import { cliLanguage, type Language } from './language.ts';
import type { Env } from './paint.ts';

export type Options = {
  readonly port: string;
  readonly db: string;
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
        ((domain, email, httpsPort) => ({
          command: parsed.positionals[0] ?? null,
          args: parsed.positionals.slice(1),
          options: {
            // С доменом сайт живёт на своём сервере: HTTP — на 80, рядом с HTTPS.
            port: parsed.values.port ?? env.PORT ?? (domain ? '80' : '8080'),
            db: parsed.values.db ?? env.CMS_DB ?? 'site.db',
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
            ...(env.CMS_ACME_DIRECTORY
              ? { acmeDirectory: env.CMS_ACME_DIRECTORY }
              : {}),
          },
        }))(
          parsed.values.domain ?? env.CMS_DOMAIN,
          parsed.values.email ?? env.CMS_ACME_EMAIL,
          parsed.values['https-port'] ?? env.CMS_HTTPS_PORT
        ))(_parse(argv)),
    (error) => ({ error: _message(error, cliLanguage(env)) })
  );
