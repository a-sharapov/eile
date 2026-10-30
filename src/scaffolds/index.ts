import { BLOG } from './blog/index.ts';
import { COMPANY } from './company/index.ts';
import { PORTFOLIO } from './portfolio/index.ts';
import type { Scaffold } from './scaffold.ts';
import { SHOP } from './shop/index.ts';
import { SHOWCASE } from './showcase/index.ts';

export type { Scaffold, ScaffoldReport } from './scaffold.ts';
export {
  applyScaffold,
  clearWelcome,
  untouched,
} from './scaffold.ts';
export { WELCOME } from './welcome.ts';

/** Каркасы `cms new` в порядке списка. */
export var SCAFFOLDS: readonly Scaffold[] = [
  BLOG,
  PORTFOLIO,
  COMPANY,
  SHOWCASE,
  SHOP,
];
