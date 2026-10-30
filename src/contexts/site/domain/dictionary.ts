import { fail } from '../../../shared/kernel/errors.ts';

/**
 * Ключ перевода или своей настройки — идентификатор JS: `{i18n.footerText}` в шаблоне — это
 * обращение к свойству, `[@phone]` — просто имя.
 */
export type DictionaryKey = string & { readonly __key: unique symbol };

const _KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const _LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export var parseKey = (raw: string): DictionaryKey =>
  _KEY.test(raw)
    ? (raw as DictionaryKey)
    : fail(
        'site.invalid_key',
        `Key "${raw}" must be latin letters, digits and _ and start with a letter`
      );

/** Перевод: ключ и текст на каждом языке сайта; пустой текст — перевода на этот язык нет. */
export type Translation = {
  readonly key: DictionaryKey;
  readonly values: Readonly<Record<string, string>>;
};

/** Своя настройка: значение, которое `[@key]` подставляет в шаблоны и контент. */
export type CustomSetting = {
  readonly key: DictionaryKey;
  readonly value: string;
};

const _MAX_VALUE = 10_000;

export var createTranslation = (
  key: string,
  values: Readonly<Record<string, unknown>>
): Translation => ({
  key: parseKey(key),
  values: Object.fromEntries(
    Object.entries(values)
      .map(
        ({ 0: language, 1: value }) => [language, String(value ?? '')] as const
      )
      .filter(({ 1: value }) => value !== '')
      .map(({ 0: language, 1: value }) =>
        _LANGUAGE.test(language) && value.length <= _MAX_VALUE
          ? ([language, value] as const)
          : fail(
              'site.invalid_translation',
              `Translation "${key}" for "${language}" is not valid`
            )
      )
  ),
});

export var createCustomSetting = (key: string, value: unknown): CustomSetting =>
  ((text) =>
    text.length <= _MAX_VALUE
      ? { key: parseKey(key), value: text }
      : fail(
          'site.invalid_setting',
          `Setting "${key}" is over ${_MAX_VALUE} characters`
        ))(String(value ?? ''));

/** Перевод на язык: свой, иначе язык сайта по умолчанию; null — ключа нет или текста нет ни на одном. */
export var translate = (
  translation: Translation | undefined,
  language: string,
  fallback: string
): string | null =>
  translation?.values[language] ??
  translation?.values[language.split('-')[0]!] ??
  translation?.values[fallback] ??
  null;

export type DictionaryRepository = {
  readonly translations: () => Translation[];
  readonly saveTranslation: (translation: Translation) => void;
  readonly removeTranslation: (key: DictionaryKey) => void;
  readonly settings: () => CustomSetting[];
  readonly saveSetting: (setting: CustomSetting) => void;
  readonly removeSetting: (key: DictionaryKey) => void;
};
