import type { Env } from './paint.ts';

/** Язык CLI: справка, MOTD, сообщения команд и приветствие новой базы. */
export type Language = 'ru' | 'en';

// На Windows LANG обычно не задан: тогда язык — из региональных настроек системы, их ICU берёт у Windows
// (ADR 0049). install.ps1 смотрит туда же.
const _SYSTEM: Readonly<Record<string, () => string>> = {
  win32: () => Intl.DateTimeFormat().resolvedOptions().locale,
};

/** Из локали системы, как у программ GNU: русская — по-русски, любая другая или никакой — по-английски. */
export var cliLanguage = (
  env: Env,
  system: string = _SYSTEM[process.platform]?.() ?? ''
): Language =>
  /^ru/i.test(env.LC_ALL || env.LC_MESSAGES || env.LANG || system)
    ? 'ru'
    : 'en';
