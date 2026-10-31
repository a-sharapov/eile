/** Тег кэша набора переводов: страницы со ссылками на переводы сбрасываются, когда набор меняется. */
export var translationsTag = (hub: number): string => `translations:${hub}`;

/** Один перевод на язык: исходная страница и ранние переводы важнее. */
export var oneByLanguage = <T extends { readonly language: string }>(
  items: readonly T[]
): T[] =>
  items.filter(
    (item, index) =>
      items.findIndex((_) => _.language === item.language) === index
  );
