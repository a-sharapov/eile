/** Язык менеджера: его интерфейс и тексты, которые сервер собирает для него. Первый — запасной. */
export type ManagerLanguage = 'en' | 'de' | 'ru';

export var MANAGER_LANGUAGES: readonly ManagerLanguage[] = ['en', 'de', 'ru'];

export var isManagerLanguage = (value: unknown): value is ManagerLanguage =>
  MANAGER_LANGUAGES.includes(value as ManagerLanguage);

/** Из `Accept-Language`: менеджер ставит свой язык первым; незнакомый — английский. */
export var managerLanguageOf = (
  header: string | null | undefined
): ManagerLanguage =>
  (header ?? '')
    .split(',')
    .map((_) => _.trim().slice(0, 2).toLowerCase())
    .find(isManagerLanguage) ?? MANAGER_LANGUAGES[0]!;

/** Текст на каждом языке менеджера: собранный сервером без запроса — сбой, уведомление. */
export type Localized = Readonly<Record<ManagerLanguage, string>>;

/** Текст на языке; строка — одна на все языки: стек, текст ошибки, имя. */
export var textIn = (
  text: Localized | string,
  language: ManagerLanguage
): string => (typeof text === 'string' ? text : text[language]);

/** Текст на каждом языке из функции языка: одна строка с подстановками на три языка. */
export var localized = (
  text: (language: ManagerLanguage) => string
): Localized =>
  Object.fromEntries(MANAGER_LANGUAGES.map((_) => [_, text(_)])) as Localized;
