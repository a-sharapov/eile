import type { Options } from './args.ts';
import type { Language } from './language.ts';
import type { Paint } from './paint.ts';

export type Context = {
  readonly args: readonly string[];
  readonly options: Options;
  readonly paint: Paint;
  readonly language: Language;
  /** stdin и stdout — терминал: можно спросить пароль скрыто. */
  readonly tty: boolean;
  readonly out: (text: string) => void;
};

/** Ошибка для человека: печатается как есть, процесс выходит с кодом 1. */
export type CliError = Error & { readonly cli: true };

export var cliError = (message: string): CliError =>
  Object.assign(new Error(message), { cli: true as const });

export var isCliError = (error: unknown): error is CliError =>
  error instanceof Error && 'cli' in error;
