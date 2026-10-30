import { parseArgs } from 'node:util';
import { attempt } from '../shared/kernel/errors.ts';
import type { Env } from './paint.ts';

export type Options = {
  readonly port: string;
  readonly db: string;
  readonly name?: string;
  readonly role?: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly passwordStdin: boolean;
  /** За обратным прокси: протокол, адрес сайта и посетителя — из X-Forwarded-*. */
  readonly trustProxy: boolean;
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
  'trust-proxy': { type: 'boolean' },
} as const;

// parseArgs говорит по-английски: «Unknown option '--prot'» — переводим самое частое.
const _message = (error: unknown): string =>
  ((text) =>
    ((unknown) =>
      unknown
        ? `Нет параметра ${unknown[1]}. Список — cms help`
        : /argument missing/i.test(text)
          ? `У параметра нет значения: ${text.match(/'(-[^']+)'/)?.[1] ?? ''}`
          : text)(text.match(/Unknown option '([^']+)'/)))(
    error instanceof Error ? error.message : String(error)
  );

/** `cms [команда] [аргументы] [--параметры]`. */
export var parseInvocation = (argv: readonly string[], env: Env): Invocation =>
  attempt<Invocation>(
    () =>
      ((parsed) => ({
        command: parsed.positionals[0] ?? null,
        args: parsed.positionals.slice(1),
        options: {
          port: parsed.values.port ?? env.PORT ?? '8080',
          db: parsed.values.db ?? env.CMS_DB ?? 'site.db',
          name: parsed.values.name,
          role: parsed.values.role,
          help: parsed.values.help ?? false,
          version: parsed.values.version ?? false,
          passwordStdin: parsed.values['password-stdin'] ?? false,
          trustProxy:
            parsed.values['trust-proxy'] ?? env.CMS_TRUST_PROXY === '1',
        },
      }))(
        parseArgs({
          args: [...argv],
          allowPositionals: true,
          strict: true,
          options: _OPTIONS,
        })
      ),
    (error) => ({ error: _message(error) })
  );
