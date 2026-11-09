/** Страница списка: адрес страницы без хвоста и номер; номер 1 — сам адрес страницы. */
export type Paging = {
  readonly base: string;
  readonly number: number;
};

/** Пункт пейджера: номер со ссылкой или пропуск «…». */
export type PagerItem =
  | {
      readonly kind: 'page';
      readonly number: number;
      readonly url: string;
      readonly current: boolean;
    }
  | { readonly kind: 'gap' };

// Номер без ведущих нулей и с потолком: `page-02` и `page-99999999` — не страницы списка. После номера —
// окончание адреса страницы: `.html` у документа, `/` у папки (ADR 0063).
const _NUMBER = /^([1-9]\d{0,5})(\.[a-z0-9]{1,10})?$/;

/**
 * Хвост `/<segment>-<N>` в конце пути, с окончанием или без: `/blog/page-2` → `{ base: '/blog', number: 2 }`,
 * `/katalog/page-2/` и `/novosti/page-2.html` — тоже порция 2 своей страницы, `/page-3` → `{ base: '/',
 * number: 3 }`. Иначе null. Каким окончание должно быть, решает адрес страницы: другое — 301.
 */
export var pagingTail = (path: string, segment: string): Paging | null => {
  const bare = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const at = bare.lastIndexOf('/');
  const last = bare.slice(at + 1);
  const prefix = `${segment}-`;
  const match = last.startsWith(prefix)
    ? _NUMBER.exec(last.slice(prefix.length))
    : null;
  return match
    ? { base: at === 0 ? '/' : bare.slice(0, at), number: Number(match[1]) }
    : null;
};

/**
 * Адрес порции с номером; первая — адрес самой страницы. `ending` — окончание адреса страницы, оно идёт
 * после номера: `/katalog/` → `/katalog/page-2/`, `/novosti.html` → `/novosti/page-2.html`.
 */
export var pagingPath = (
  base: string,
  segment: string,
  number: number,
  ending = ''
): string =>
  number <= 1
    ? base
    : `${base === '/' ? '' : base.slice(0, base.length - ending.length)}/${segment}-${number}${ending}`;

/**
 * Окно пейджера: первая, последняя и `around` номеров вокруг текущей, разрывы — пропуском.
 * Пропуск ставится, только если скрывает больше одного номера: `1 … 3` хуже, чем `1 2 3`.
 */
export var pagerWindow = (
  current: number,
  pages: number,
  around: number,
  url: (number: number) => string
): PagerItem[] => {
  const shown = Array.from({ length: pages }, (_, index) => index + 1).filter(
    (_) =>
      _ === 1 ||
      _ === pages ||
      Math.abs(_ - current) <= around ||
      // Соседний с краем номер вместо пропуска на одно место.
      (_ === 2 && current - around === 3) ||
      (_ === pages - 1 && current + around === pages - 2)
  );
  return shown.reduce<PagerItem[]>(
    (items, number, index) => [
      ...items,
      ...(index > 0 && number - shown[index - 1]! > 1
        ? [{ kind: 'gap' } as const]
        : []),
      { kind: 'page', number, url: url(number), current: number === current },
    ],
    []
  );
};

/** Ключ перевода с `{n}`, который заменяет встроенное «страница N». */
export var PAGING_TITLE_KEY = 'pagingTitle';

const _PAGE_WORD: Readonly<Record<string, string>> = {
  ru: 'страница {n}',
  uk: 'сторінка {n}',
  be: 'старонка {n}',
  de: 'Seite {n}',
  fr: 'page {n}',
  es: 'página {n}',
  _: 'page {n}',
};

/** «страница 2» для заголовка и описания порции; `custom` — перевод сайта, если задан. */
export var pagingTitle = (
  custom: string | null,
  language: string,
  number: number
): string =>
  (
    custom ??
    _PAGE_WORD[language.split('-')[0]!.toLowerCase()] ??
    _PAGE_WORD._!
  ).replaceAll('{n}', String(number));

const _text = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

/** Дописывает текст в конец первого `<title>` шапки; заголовка нет — шапка как есть. */
export var withTitleSuffix = (head: string, suffix: string): string =>
  ((at) =>
    at < 0 ? head : `${head.slice(0, at)}${_text(suffix)}${head.slice(at)}`)(
    head.indexOf('</title>')
  );
