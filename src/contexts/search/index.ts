import type { Database } from '../../platform/database.ts';
import type { DomainEvent, EventBus } from '../../shared/kernel/events.ts';
import type { PageNode, PublishedContent } from '../content/index.ts';
import {
  defineSearchService,
  type SearchPages,
} from './application/search-service.ts';
import { htmlText } from './infrastructure/html-text.ts';
import { defineSearchIndex } from './infrastructure/sqlite-search-index.ts';
import { defineSearchHandler } from './interface/search-handler.ts';

export type {
  SearchHit,
  SearchOptions,
  SearchResult,
  SearchService,
} from './application/search-service.ts';
export { MAX_LIMIT as SEARCH_MAX_LIMIT } from './application/search-service.ts';
export { QUERY_LIMITS } from './domain/query.ts';
export {
  SEARCH_TABLES,
  searchMigrations,
} from './infrastructure/migrations.ts';
export {
  clearSearchIndex,
  defineSearchIndex,
} from './infrastructure/sqlite-search-index.ts';
export { SEARCH_PATH } from './interface/search-handler.ts';

// Что меняет страницу или её ветку, а что — все страницы сразу (описания полей, язык сайта, 404).
const _BRANCH = new Set([
  'content.page_created',
  'content.page_edited',
  'content.page_published',
  'content.page_unpublished',
  'content.page_moved',
  'content.page_fields_changed',
  'content.page_trashed',
  'content.page_restored',
  'content.page_removed',
]);
const _EVERYTHING = new Set([
  'content.field_saved',
  'content.field_removed',
  'site.settings_changed',
]);

// Потомки по дереву менеджера: в нём все страницы, опубликованность решает модель чтения.
const _descendants = (nodes: readonly PageNode[], id: number): number[] => {
  const children = nodes.reduce(
    (map, node) =>
      node.parentId === null
        ? map
        : map.set(node.parentId, [...(map.get(node.parentId) ?? []), node.id]),
    new Map<number, number[]>()
  );
  const walk = (ids: readonly number[]): number[] =>
    ids.flatMap((_) => [_, ...walk(children.get(_) ?? [])]);
  return walk(children.get(id) ?? []);
};

/** Контекст search: индекс опубликованных страниц на FTS5 и поиск по нему. */
export var defineSearch = ({
  db,
  bus,
  published,
  tree,
  fields,
  site,
}: {
  db: Database;
  bus: EventBus;
  published: PublishedContent;
  tree: () => PageNode[];
  /** Поля страниц: тип и умолчание — что из значений искать. */
  fields: SearchPages['fields'];
  site: SearchPages['site'];
}) => {
  const pages: SearchPages = {
    page: published.page,
    branch: (id) =>
      [id, ..._descendants(tree(), id)]
        .map(published.page)
        .filter((_) => _ !== null),
    all: () =>
      tree()
        .filter((_) => _.published && !_.trashed)
        .map((_) => published.page(_.id))
        .filter((_) => _ !== null),
    ancestors: (id) => published.lineage(id).toReversed(),
    fields,
    site,
  };
  const service = defineSearchService({
    index: defineSearchIndex(db),
    pages,
    text: htmlText,
  });
  bus.onAny(
    (event: DomainEvent) =>
      void (_BRANCH.has(event.type)
        ? service.reindex((event as unknown as { pageId: number }).pageId)
        : _EVERYTHING.has(event.type) && service.invalidate())
  );
  return {
    ...service,
    handler: (urlOf: (id: number) => string | null) =>
      defineSearchHandler({
        search: service.search,
        urlOf,
        language: () => site().language,
      }),
  };
};

export type Search = ReturnType<typeof defineSearch>;
