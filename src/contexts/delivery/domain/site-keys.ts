// Переводы и свои настройки — в `site` шаблона и компонента: `{site.i18n.footer}`, `{site.custom.phone}`.
// Это обычные выражения Svelte, исходник ничем не переписывается. Нет ключа — сам ключ в скобках,
// как в тексте страницы: пропущенный перевод виден на сайте, а не исчезает молча.

export type SiteKeys = {
  readonly i18n: Readonly<Record<string, string>>;
  readonly custom: Readonly<Record<string, string>>;
};

/** Словарь для `site`: текст ключа на языке страницы, значение своей настройки и списки ключей. */
export type SiteDictionary = {
  readonly text: (key: string) => string | null;
  readonly value: (key: string) => string | null;
  readonly translationKeys: () => readonly string[];
  readonly settingKeys: () => readonly string[];
};

// Объект перечисляется: Object.keys, entries, JSON.stringify и `in` видят ключи, у которых есть значение
// (у перевода — на языке страницы или на языке сайта, как при чтении), — словарь целиком можно отдать
// скрипту страницы. Список считается один раз на объект и только когда его просят: чтение по ключу его
// не трогает.
const _keys = (
  lookup: (key: string) => string | null,
  missing: (key: string) => string,
  known: () => readonly string[]
): Readonly<Record<string, string>> => {
  let present: ReadonlySet<string> | null = null;
  const keys = (): ReadonlySet<string> =>
    (present ??= new Set(known().filter((_) => lookup(_) !== null)));
  return new Proxy(
    {},
    {
      get: (_target, key) =>
        typeof key === 'string' ? (lookup(key) ?? missing(key)) : undefined,
      has: (_target, key) => typeof key === 'string' && keys().has(key),
      ownKeys: () => [...keys()],
      // У пустой цели свойства нет, поэтому configurable: иначе Proxy нарушил бы свой инвариант.
      getOwnPropertyDescriptor: (_target, key) =>
        typeof key === 'string' && keys().has(key)
          ? {
              value: lookup(key),
              enumerable: true,
              configurable: true,
              writable: false,
            }
          : undefined,
    }
  );
};

/** Настройки сайта плюс переводы на языке страницы и свои настройки. */
export var withSiteKeys = <S extends object>(
  site: S,
  dictionary: SiteDictionary
): S & SiteKeys => ({
  ...site,
  i18n: _keys(
    dictionary.text,
    (key) => `{i18n.${key}}`,
    dictionary.translationKeys
  ),
  custom: _keys(dictionary.value, (key) => `[@${key}]`, dictionary.settingKeys),
});
