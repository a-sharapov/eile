import type { PageView } from '../../content/index.ts';
import type { Paging } from '../domain/paging.ts';
import type { RequestInfo } from './ports.ts';

/** Страница списка, которую рендерим, и слово страниц для адресов пейджера. */
export type ScopePaging = Paging & { readonly segment: string };

type Scope = {
  readonly request: RequestInfo;
  readonly tags: Set<string>;
  /** Язык страницы, которую рендерим: по нему `t()` выбирает перевод. */
  readonly language: string | null;
  /** Страница первой фазы; в регионах и островах — null. */
  readonly page: PageView | null;
  readonly paging: ScopePaging | null;
  /** Сколько страниц у постраничного списка; null — номер страницы никто не читал. */
  pages: number | null;
};

export type ScopeOptions = {
  readonly language?: string | null;
  readonly page?: PageView | null;
  readonly paging?: ScopePaging | null;
};

/** Тег чтения запроса: такая первая фаза не попадает в кэш, иначе в него утечёт чужой запрос. */
export var REQUEST_TAG = 'request';

/**
 * Что прочитал рендер. SSR Svelte синхронный, поэтому одной текущей области хватает:
 * между запуском и возвратом `run` другой рендер не начнётся.
 */
export var defineRenderScope = () => {
  let current: Scope | null = null;

  return {
    record: (tag: string): void => void current?.tags.add(tag),
    request: (): RequestInfo | null => current?.request ?? null,
    language: (): string | null => current?.language ?? null,
    page: (): PageView | null => current?.page ?? null,
    paging: (): ScopePaging | null => current?.paging ?? null,
    /** Постраничный список сообщает число своих страниц; главный — первый на странице. */
    paged: (pages: number): void =>
      void (current && current.pages === null && (current.pages = pages)),
    run: <T>(
      request: RequestInfo,
      render: () => T,
      options: ScopeOptions = {}
    ): {
      readonly result: T;
      readonly tags: readonly string[];
      readonly pages: number | null;
    } => {
      const previous = current;
      const scope: Scope = {
        request,
        tags: new Set(),
        language: options.language ?? null,
        page: options.page ?? null,
        paging: options.paging ?? null,
        pages: null,
      };
      current = scope;
      try {
        return { result: render(), tags: [...scope.tags], pages: scope.pages };
      } finally {
        current = previous;
      }
    },
  };
};

export type RenderScope = ReturnType<typeof defineRenderScope>;
