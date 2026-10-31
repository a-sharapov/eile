import { type Invocation, parseInvocation } from './cli/args.ts';
import {
  type Context,
  cliError,
  explain,
  helpFor,
  RUN,
  unknownCommand,
} from './cli/commands.ts';
import { cliLanguage } from './cli/language.ts';
import { colorsWanted, definePaint } from './cli/paint.ts';
import { named, PROGRAM } from './cli/program.ts';
import { VERSION } from './cli/version.ts';
import { PRODUCT } from './product.ts';

// CLI: вызов → команда (src/cli/). Ошибка — одной строкой в stderr и код выхода 1.
const _paint = definePaint(
  colorsWanted(process.env, process.stdout.isTTY === true)
);
const _stderr = definePaint(
  colorsWanted(process.env, process.stderr.isTTY === true)
);
const _language = cliLanguage(process.env);
const _ERROR = { ru: 'Ошибка:', en: 'Error:' } as const;

const _fail = (error: unknown): void =>
  (
    // write, а не console.error: Bun красит console.error в TTY целиком, поверх наших акцентов.
    process.stderr.write(
      `${_stderr.error(_ERROR[_language])} ${named(PROGRAM)(explain(error, _language))}\n`
    ),
    void (process.exitCode = 1)
  );

const _run = (
  invocation: Exclude<Invocation, { error: string }>
): Promise<void> =>
  ((command) =>
    invocation.options.version
      ? Promise.resolve(console.log(`${PRODUCT} ${VERSION}`))
      : invocation.options.help
        ? helpFor(
            _paint,
            invocation.command === 'help'
              ? invocation.args[0]
              : (invocation.command ?? undefined),
            _language
          ).then(console.log)
        : (
            RUN[command] ??
            (() => Promise.reject(unknownCommand(command, _language)))
          )({
            args: invocation.args,
            options: invocation.options,
            paint: _paint,
            language: _language,
            tty: process.stdin.isTTY === true && process.stdout.isTTY === true,
            out: console.log,
          } satisfies Context))(invocation.command ?? 'serve');

void ((invocation: Invocation) =>
  'error' in invocation
    ? Promise.reject(cliError(invocation.error))
    : _run(invocation))(
  parseInvocation(process.argv.slice(2), process.env)
).then(undefined, _fail);
