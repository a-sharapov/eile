import { fail } from '../../../shared/kernel/errors.ts';

/** Код элемента: латиница в нижнем регистре, цифры, `_` и `-`; не меняется — новый код, новый элемент. */
const _CODE = /^[a-z0-9_-]+$/;

/** Предел длины кода по группе настройки. */
export var CODE_LIMITS = {
  sender: 20,
  type: 40,
  property: 40,
  dictionary: 40,
  value: 60,
  /** Ключ схемы метки — код её отправителя. */
  schema: 20,
  referrer: 40,
  link: 40,
  milestone: 40,
  funnel: 40,
} as const;

export var isCode = (raw: unknown, max: number): raw is string =>
  typeof raw === 'string' && raw.length <= max && _CODE.test(raw);

/**
 * Значение из чужого входа для текста отказа: строка — до 100 знаков, список и объект — словом. `String()` списка
 * в тысячу уровней ушёл бы в рекурсию, а мегабайт строки — в ответ.
 */
export var shownValue = (raw: unknown): string =>
  typeof raw === 'string'
    ? [...raw].slice(0, 100).join('')
    : typeof raw === 'number' || typeof raw === 'boolean'
      ? String(raw)
      : Array.isArray(raw)
        ? '[…]'
        : raw !== null && typeof raw === 'object'
          ? '{…}'
          : '';

/** Код до `max` знаков; `what` — чей код, для текста отказа. */
export var parseCode = (raw: unknown, max: number, what = 'Code'): string =>
  isCode(raw, max)
    ? raw
    : fail(
        'analytics.invalid_code',
        `${what} "${shownValue(raw)}" is not a code: a-z 0-9 _ - up to ${max} characters`
      );
