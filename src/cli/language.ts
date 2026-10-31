import type { Env } from './paint.ts';

/** Язык CLI: справка, MOTD, сообщения команд и приветствие новой базы. */
export type Language = 'ru' | 'en';

/** Из локали системы, как у программ GNU: русская — по-русски, любая другая или никакой — по-английски. */
export var cliLanguage = (env: Env): Language =>
  /^ru/i.test(env.LC_ALL || env.LC_MESSAGES || env.LANG || '') ? 'ru' : 'en';
