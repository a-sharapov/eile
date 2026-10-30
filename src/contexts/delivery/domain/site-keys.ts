// Переводы и свои настройки — в `site` шаблона и компонента: `{site.i18n.footer}`, `{site.custom.phone}`.
// Это обычные выражения Svelte, исходник ничем не переписывается. Нет ключа — сам ключ в скобках,
// как в тексте страницы: пропущенный перевод виден на сайте, а не исчезает молча.

export type SiteKeys = {
  readonly i18n: Readonly<Record<string, string>>;
  readonly custom: Readonly<Record<string, string>>;
};

const _keys = (
  lookup: (key: string) => string | null,
  missing: (key: string) => string
): Readonly<Record<string, string>> =>
  new Proxy(
    {},
    {
      get: (_target, key) =>
        typeof key === 'string' ? (lookup(key) ?? missing(key)) : undefined,
    }
  );

/** Настройки сайта плюс переводы на языке страницы и свои настройки. */
export var withSiteKeys = <S extends object>(
  site: S,
  text: (key: string) => string | null,
  value: (key: string) => string | null
): S & SiteKeys => ({
  ...site,
  i18n: _keys(text, (key) => `{i18n.${key}}`),
  custom: _keys(value, (key) => `[@${key}]`),
});
