import type { SetSample } from '../../contexts/analytics/index.ts';
import { SHOP_SAMPLE } from './shop.ts';
import { SUBSCRIPTION_SAMPLE } from './subscription.ts';

/**
 * Наборы-образцы настройки аналитики в бинарнике: шаблоны рода дела без сайта — без переходов, имён и значений
 * кампаний. Корень передаёт их аналитике портом `samples`; сама аналитика их не импортирует.
 */
export var ANALYTICS_SAMPLES: readonly SetSample[] = [
  SUBSCRIPTION_SAMPLE,
  SHOP_SAMPLE,
];
