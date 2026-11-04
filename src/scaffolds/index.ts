import { russian } from '../kit/translated.ts';
import { BLOG_EN } from './blog/en.ts';
import { BLOG } from './blog/index.ts';
import { COMPANY_EN } from './company/en.ts';
import { COMPANY } from './company/index.ts';
import { PORTFOLIO_EN } from './portfolio/en.ts';
import { PORTFOLIO } from './portfolio/index.ts';
import type { Scaffold } from './scaffold.ts';
import { SHOP_EN } from './shop/en.ts';
import { SHOP } from './shop/index.ts';
import { SHOWCASE_EN } from './showcase/en.ts';
import { SHOWCASE } from './showcase/index.ts';

export type {
  Scaffold,
  ScaffoldMedia,
  ScaffoldPage,
  ScaffoldReport,
  ScaffoldServices,
  ScaffoldSetting,
} from './scaffold.ts';
export {
  applyScaffold,
  clearWelcome,
  settingValue,
  untouched,
} from './scaffold.ts';
export { WELCOME, WELCOME_EN } from './welcome.ts';

/** Каркасы `cms new` в порядке списка. */
export var SCAFFOLDS: readonly Scaffold[] = [
  BLOG,
  PORTFOLIO,
  COMPANY,
  SHOWCASE,
  SHOP,
];

/**
 * Те же каркасы по-английски: имена, страницы и элементы те же, тексты — английские. Каркас для одного
 * рынка (`kuechenstudio` — немецкий) один на любом языке CLI.
 */
export var SCAFFOLDS_EN: readonly Scaffold[] = [
  BLOG_EN,
  PORTFOLIO_EN,
  COMPANY_EN,
  SHOWCASE_EN,
  SHOP_EN,
];

/** Каркасы на языке: русские — для русского, английские — для любого другого. */
export var scaffoldsFor = (language: string): readonly Scaffold[] =>
  russian(language) ? SCAFFOLDS : SCAFFOLDS_EN;
