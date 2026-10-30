import { attempt } from '../../../shared/kernel/errors.ts';
import type {
  ChildrenOptions,
  ListSort,
  PageView,
  PublishedContent,
} from '../../content/index.ts';
import { type ImageSet, stemOf } from '../../media/index.ts';
import type { SiteSettings } from '../../site/index.ts';
import { type PagerItem, pagerWindow, pagingPath } from '../domain/paging.ts';
import { type SiteKeys, withSiteKeys } from '../domain/site-keys.ts';
import { defineLinks } from './links.ts';
import type { Dictionary, RequestInfo } from './ports.ts';
import { REQUEST_TAG, type RenderScope } from './render-scope.ts';

export type ListingOptions = {
  /** Страниц в порции, 1–100; по умолчанию 10. */
  readonly perPage?: number;
  readonly sort?: ListSort;
  /** Уровней вниз: 1 — только дети. */
  readonly depth?: number;
  /** И скрытые из меню; по умолчанию да — посты блога обычно скрыты. */
  readonly includeHidden?: boolean;
  /** Номер порции из адреса (`/blog/page-2`); false — всегда первая. */
  readonly paged?: boolean;
};

/** Порция списка: страницы, номер, всего страниц и адреса для пейджера. */
export type Listing = {
  readonly items: PageView[];
  readonly number: number;
  readonly pages: number;
  readonly total: number;
  /** Адрес порции; первая — адрес самой страницы. null — вне рендера страницы. */
  readonly url: (number: number) => string | null;
  /** Первая, последняя и `around` номеров вокруг текущей, разрывы — `{ kind: 'gap' }`. */
  readonly pager: (around?: number) => PagerItem[];
};

/** Модуль `$core` для шаблонов и компонентов: каждый экспорт — публичный API разработчиков сайтов. */
export type ComponentRuntime = {
  /** Адрес страницы или цель ссылки; null, если вести некуда — Svelte тогда не выводит `href={link(5)}`. */
  readonly link: (id: number) => string | null;
  readonly page: (id: number) => PageView | null;
  /** По порядку в меню; `null` — верхний уровень дерева. */
  readonly children: (
    parentId: number | null,
    options?: ChildrenOptions
  ) => PageView[];
  /** Страница, которую рендерим; в `Uncached` и острове — null. */
  readonly current: () => PageView | null;
  /** Предки от корня до родителя: для хлебных крошек и активной ветки меню. */
  readonly ancestors: (id: number) => PageView[];
  /** Дети или потомки страницы порциями; первый постраничный список берёт номер из адреса. */
  readonly listing: (
    parentId: number | null,
    options?: ListingOptions
  ) => Listing;
  readonly site: () => SiteSettings & SiteKeys;
  /** Текущий запрос. Шаблон, который его читает, не кэшируется; в `Uncached` — можно. */
  readonly request: () => RequestInfo | null;
  /** URL файла медиатеки с версией — кэшируется браузером навсегда; null — файла нет. */
  readonly media: (path: string) => string | null;
  /** `src`, `srcset` из вариантов `photo@960.webp` и размеры для `<img>`. */
  readonly image: (path: string) => ImageSet | null;
  /** Перевод ключа на язык страницы; ключа нет — `{i18n.key}`, чтобы пропуск было видно. */
  readonly t: (key: string) => string;
  /** Своя настройка сайта; нет такой — `[@key]`. */
  readonly setting: (key: string) => string;
};

export type MediaCatalog = {
  readonly url: (path: string) => string | null;
  readonly image: (path: string) => ImageSet | null;
};

export var defineComponentRuntime = (
  content: PublishedContent,
  settings: () => SiteSettings,
  scope: RenderScope,
  media: MediaCatalog,
  dictionary: Dictionary
): ComponentRuntime => {
  // Неверный путь в шаблоне — пустое место, а не ошибка всей страницы.
  const lookup =
    <T>(find: (path: string) => T | null) =>
    (path: string): T | null => (
      scope.record(`media:${stemOf(path)}`),
      attempt(
        () => find(path),
        () => null
      )
    );
  const links = defineLinks(content, settings);
  const page = (id: number): PageView | null => (
    scope.record(`page:${id}`), content.page(id)
  );
  // Перенос предка меняет цепочку — как у ссылки `[~id~]`, зависимость и от ветки.
  const ancestors = (id: number): PageView[] => {
    const lineage = content.lineage(id);
    scope.record(`page:${id}`);
    lineage.forEach((_) => void scope.record(`branch:${_}`));
    return lineage
      .toReversed()
      .map(page)
      .filter((_) => _ !== null);
  };
  const urlOf = (number: number): string | null =>
    ((paging) => paging && pagingPath(paging.base, paging.segment, number))(
      scope.paging()
    );
  const listing = (
    parentId: number | null,
    options: ListingOptions = {}
  ): Listing => {
    const perPage = Math.min(
      100,
      Math.max(1, Math.trunc(options.perPage ?? 10) || 10)
    );
    const depth = options.depth ?? 1;
    const paged = options.paged ?? true;
    const number = paged ? (scope.paging()?.number ?? 1) : 1;
    content
      .containers(parentId, depth)
      .forEach((_) => void scope.record(`children:${_ ?? 'root'}`));
    const { items, total } = content.list(parentId, {
      sort: options.sort,
      depth,
      includeHidden: options.includeHidden ?? true,
      offset: (number - 1) * perPage,
      limit: perPage,
    });
    const pages = Math.max(1, Math.ceil(total / perPage));
    void (paged && scope.paged(pages));
    return {
      items,
      number,
      pages,
      total,
      url: urlOf,
      pager: (around = 1) =>
        pagerWindow(number, pages, around, (_) => urlOf(_) ?? '#'),
    };
  };
  return {
    link: (id) => {
      const found = page(id);
      return found && links.urlOf(found);
    },
    page,
    children: (parentId, options) => (
      scope.record(`children:${parentId ?? 'root'}`),
      content.children(parentId, options)
    ),
    current: scope.page,
    ancestors,
    listing,
    site: () =>
      ((site) =>
        withSiteKeys(
          site,
          (key) => dictionary.text(key, scope.language() ?? site.language),
          dictionary.value
        ))(settings()),
    request: () => (scope.record(REQUEST_TAG), scope.request()),
    media: lookup(media.url),
    image: lookup(media.image),
    t: (key) =>
      dictionary.text(key, scope.language() ?? settings().language) ??
      `{i18n.${key}}`,
    setting: (key) => dictionary.value(key) ?? `[@${key}]`,
  };
};
