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

/**
 * Своя настройка: значение, которое `[@key]` подставляет в шаблоны и контент. Пояснение — для людей в
 * менеджере: что это за значение и где его взять; на сайт оно не попадает.
 */
export type CustomSetting = {
  readonly key: DictionaryKey;
  readonly value: string;
  readonly note: string;
};

const _MAX_VALUE = 10_000;
const _MAX_NOTE = 500;

// Значение может быть в несколько строк — список хранят по пункту на строку. Переводы строк — LF, откуда
// бы ни пришло значение: `t(key).split('\n')` в шаблоне не оставит `\r` в конце пункта.
const _text = (value: unknown): string =>
  String(value ?? '').replace(/\r\n?/g, '\n');

export var createTranslation = (
  key: string,
  values: Readonly<Record<string, unknown>>
): Translation => ({
  key: parseKey(key),
  values: Object.fromEntries(
    Object.entries(values)
      .map(({ 0: language, 1: value }) => [language, _text(value)] as const)
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

// Пояснение — одна строка: менеджер показывает его под ключом.
const _note = (key: string, note: unknown): string =>
  ((text) =>
    text.length <= _MAX_NOTE
      ? text
      : fail(
          'site.invalid_setting',
          `Note of setting "${key}" is over ${_MAX_NOTE} characters`
        ))(
    String(note ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  );

export var createCustomSetting = (
  key: string,
  value: unknown,
  note: unknown = ''
): CustomSetting =>
  ((text) =>
    text.length <= _MAX_VALUE
      ? { key: parseKey(key), value: text, note: _note(key, note) }
      : fail(
          'site.invalid_setting',
          `Setting "${key}" is over ${_MAX_VALUE} characters`
        ))(_text(value));

/**
 * Правка перевода по языкам: названные языки заменяются, остальные остаются; пустой текст убирает язык.
 * Новый текст — только на языке сайта (`languages`): на другом его не покажут ни сайт, ни менеджер.
 */
export var patchTranslation = (
  key: string,
  current: Translation | undefined,
  patch: Readonly<Record<string, unknown>>,
  languages: readonly string[]
): Translation =>
  ((foreign) =>
    foreign === undefined
      ? createTranslation(key, { ...current?.values, ...patch })
      : fail(
          'site.unknown_language',
          `Translation "${key}": "${foreign}" is not a language of the site (${languages.join(', ')}); add it to the site languages first`
        ))(
    Object.entries(patch).find(({ 0: language, 1: value }) =>
      ((text) =>
        text !== '' &&
        text !== current?.values[language] &&
        !languages.includes(language))(_text(value))
    )?.[0]
  );

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
  /** Несколько переводов разом, одной транзакцией: всё или ничего. */
  readonly saveTranslations: (
    save: readonly Translation[],
    remove: readonly DictionaryKey[]
  ) => void;
  readonly settings: () => CustomSetting[];
  readonly saveSetting: (setting: CustomSetting) => void;
  readonly removeSetting: (key: DictionaryKey) => void;
};
