import { fail } from '../shared/kernel/errors.ts';

/** Перевод исходника — пары «как в исходнике → как на другом языке», по порядку. */
export type Translation = readonly (readonly [string, string])[];

/**
 * Исходник на другом языке: каждая пара заменяет все свои вхождения. Пары, которой нет в исходнике, — ошибка:
 * перевод отстал от исходника, и тест каркасов скажет об этом раньше посетителя.
 */
export var translated = (source: string, pairs: Translation): string =>
  pairs.reduce(
    (text, { 0: from, 1: to }) =>
      text.includes(from)
        ? // Функция, а не строка: `$` в переводе — знак доллара, а не шаблон замены.
          text.replaceAll(from, () => to)
        : fail(
            'scaffold.stale_translation',
            `"${from.slice(0, 80)}" is not in the source any more`
          ),
    source
  );

/** Русский — язык исходников; любой другой язык сайта получает английский перевод. */
export var russian = (language: string): boolean =>
  language === '' || /^ru(?:-|$)/i.test(language);
