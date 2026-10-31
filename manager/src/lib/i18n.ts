import type { errors, messages } from './locales/ru.ts';

// Строки интерфейса менеджера — словари в locales/: ru.ts задаёт ключи, en.ts и de.ts повторяют их все.
// Загружается один словарь — выбранного языка; смена языка подгружает другой и перерисовывает менеджер.

/** Язык менеджера. */
export type Language = 'en' | 'de' | 'ru';

export var LANGUAGES: readonly Language[] = ['en', 'de', 'ru'];

/** Если браузер не просит ни одного из языков менеджера. */
export var FALLBACK_LANGUAGE: Language = 'en';

/** Название языка на нём самом — так его находят в списке. */
export var LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  en: 'English',
  de: 'Deutsch',
  ru: 'Русский',
};

export type MessageKey = keyof typeof messages;
export type ErrorCode = keyof typeof errors;

export type Dictionary = {
  readonly messages: Readonly<Record<MessageKey, string>>;
  readonly errors: Readonly<Record<ErrorCode, string>>;
};

const _LOAD: Readonly<Record<Language, () => Promise<Dictionary>>> = {
  en: () => import('./locales/en.ts'),
  de: () => import('./locales/de.ts'),
  ru: () => import('./locales/ru.ts'),
};

// Формы через «|» — в порядке категорий Intl.PluralRules этого языка.
const _PLURAL_ORDER: Readonly<
  Record<Language, readonly Intl.LDMLPluralRule[]>
> = {
  en: ['one', 'other'],
  de: ['one', 'other'],
  ru: ['one', 'few', 'many'],
};

let _language: Language = FALLBACK_LANGUAGE;
let _dictionary: Dictionary | null = null;

export var isLanguage = (value: unknown): value is Language =>
  LANGUAGES.includes(value as Language);

export var currentLanguage = (): Language => _language;

const _fill = (
  text: string,
  params: Readonly<Record<string, string | number>>
): string =>
  text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );

/** Строка интерфейса; `{name}` в ней — из `params`. Нет ключа — выводится сам ключ: его видно и в интерфейсе, и в тестах. */
export var t = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>
): string =>
  ((text) => (params ? _fill(text, params) : text))(
    _dictionary?.messages[key] ?? key
  );

/** Название в кавычках этого языка: «Контакты», “Contacts”, „Kontakt“. */
export var quoted = (text: string): string => t('common.quoted', { text });

/** Число по правилам языка: «1 234», «1,234», «1.234». */
export var number = (value: number): string => value.toLocaleString(_language);

/** Строка с числом в нужной форме: «{n} страница|{n} страницы|{n} страниц». */
export var tn = (
  key: MessageKey,
  n: number,
  params: Readonly<Record<string, string | number>> = {}
): string =>
  // Форм меньше, чем категорий, — берётся последняя: «{n} стр.» годится для любого числа.
  ((forms, index) =>
    _fill(
      forms[Math.min(index < 0 ? forms.length : index, forms.length - 1)]!,
      {
        n: number(n),
        ...params,
      }
    ))(
    t(key).split('|'),
    _PLURAL_ORDER[_language].indexOf(new Intl.PluralRules(_language).select(n))
  );

export var errorMessage = (code: string, detail = ''): string | null =>
  (_dictionary?.errors as Readonly<Record<string, string>> | undefined)?.[
    code
  ]?.replace('{detail}', detail) ?? null;

/** Подгрузить словарь и сделать язык текущим. */
export var loadLanguage = (language: Language): Promise<Language> =>
  _LOAD[language]().then(
    (_) => ((_dictionary = _), (_language = language), language)
  );
