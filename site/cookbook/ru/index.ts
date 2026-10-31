import type { Chapter } from '../markup.ts';
import { DATA } from './data.ts';
import { LAUNCH } from './launch.ts';
import { LIVE } from './live.ts';
import { START } from './start.ts';
import { TEMPLATES } from './templates.ts';

/** Главы кукбука по-русски, по порядку. */
export var CHAPTERS_RU: readonly Chapter[] = [
  ...START,
  ...TEMPLATES,
  ...DATA,
  ...LIVE,
  ...LAUNCH,
];
