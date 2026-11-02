import { defineCompressionCache } from '../../platform/compression.ts';
import type { DomainEvent, EventBus } from '../../shared/kernel/events.ts';
import { pipe } from '../../shared/kernel/pipe.ts';
import type { Report } from '../../shared/kernel/report.ts';
import type {
  ContentEvent,
  PageView,
  PublishedContent,
} from '../content/index.ts';
import type { DesignEvent } from '../design/index.ts';
import { type MediaEvent, stemOf } from '../media/index.ts';
import type { SiteSettings } from '../site/index.ts';
import { SEARCH_TAG } from './application/component-runtime.ts';
import { defineDiscovery } from './application/discovery.ts';
import { defineLinks } from './application/links.ts';
import {
  definePageDelivery,
  type PageDelivery,
} from './application/page-delivery.ts';
import type {
  Dictionary,
  EditBar,
  Hooks,
  Modules,
  PageCache,
  PageCacheStats,
  RedirectRules,
  RequestInfo,
  TemplateViews,
} from './application/ports.ts';
import type { RenderScope } from './application/render-scope.ts';
import { responseType } from './domain/content-type.ts';
import { translationsTag } from './domain/translations.ts';
import content from './infrastructure/Content.svelte' with { type: 'text' };
import form from './infrastructure/Form.svelte' with { type: 'text' };
import island from './infrastructure/Island.svelte' with { type: 'text' };
import { defineMemoryPageCache } from './infrastructure/memory-page-cache.ts';
import { svelteViewRenderer } from './infrastructure/svelte-view-renderer.ts';
import uncached from './infrastructure/Uncached.svelte' with { type: 'text' };
import { defineSiteHandler } from './interface/site-handler.ts';

export {
  type ComponentRuntime,
  defineComponentRuntime,
  type ScriptCatalog,
  SEARCH_TAG,
  type SearchResults,
} from './application/component-runtime.ts';
export type {
  EditBar,
  PageCacheStats,
  RedirectRules,
  SearchHit,
  SiteSearch,
} from './application/ports.ts';
export {
  defineRenderScope,
  type RenderScope,
} from './application/render-scope.ts';
export { htmlToMarkdown } from './domain/markdown.ts';

const _previewRequest = (path: string): RequestInfo => ({
  path,
  origin: '',
  query: {},
  header: () => null,
  cookie: () => null,
});

/** Встроенные компоненты, которые элементы импортируют как обычные модули. */
export var BUILTIN_COMPONENTS: Readonly<Record<string, string>> = {
  '$core/Uncached': uncached as unknown as string,
  '$core/Island': island as unknown as string,
  '$core/Content': content as unknown as string,
  '$core/Form': form as unknown as string,
};

const _page = (event: DomainEvent): readonly string[] => {
  const {
    pageId,
    parentId,
    previousParentId,
    translationOf,
    previousTranslationOf,
  } = event as ContentEvent & {
    pageId: number;
    parentId: number | null;
    previousParentId?: number | null;
    translationOf?: number | null;
    previousTranslationOf?: number | null;
  };
  // Выдачу поиска меняет любая страница: тег search сбрасывается с каждой правкой.
  return [
    SEARCH_TAG,
    `page:${pageId}`,
    `branch:${pageId}`,
    `children:${parentId ?? 'root'}`,
    ...(previousParentId === undefined
      ? []
      : [`children:${previousParentId ?? 'root'}`]),
    // Ссылки на переводы есть у всех страниц набора: и у исходной, и у прежнего набора, если связь сменилась.
    translationsTag(pageId),
    ...[translationOf, previousTranslationOf]
      .filter((_) => typeof _ === 'number')
      .map(translationsTag),
  ];
};

const _element = (event: DomainEvent): readonly string[] => {
  const { kind, name } = event as DesignEvent;
  return [`element:${kind}/${name}`];
};

// null — сбросить всё: настройки и описания полей видны на любой странице.
const _TAGS: Readonly<
  Record<string, (event: DomainEvent) => readonly string[] | null>
> = {
  'design.element_changed': _element,
  'design.element_removed': _element,
  'content.page_created': _page,
  'content.page_edited': _page,
  'content.page_published': _page,
  'content.page_unpublished': _page,
  'content.page_moved': _page,
  'content.page_fields_changed': _page,
  'content.page_trashed': _page,
  'content.page_restored': _page,
  'content.page_removed': _page,
  'media.file_saved': (event) => [
    `media:${stemOf((event as MediaEvent).path)}`,
  ],
  'media.file_removed': (event) => [
    `media:${stemOf((event as MediaEvent).path)}`,
  ],
  // Формы рисуются на каждом запросе, а заявки страниц не меняют: кэш страниц от них не сбрасывается.
  'forms.form_saved': () => [],
  'forms.form_removed': () => [],
  'forms.submission_received': () => [],
  'forms.submission_changed': () => [],
  'forms.submission_removed': () => [],
  _: () => null,
};

const _invalidate =
  (cache: PageCache) =>
  (event: DomainEvent): void =>
    pipe(
      (_: DomainEvent) => (_TAGS[_.type] ?? _TAGS._!)(_),
      (tags: readonly string[] | null) =>
        tags === null ? cache.clear() : cache.invalidate(tags)
    )(event);

/** Контекст delivery: публичный сайт с двухфазным кэшем страниц. */
export var defineDelivery = ({
  content,
  settings,
  views,
  scope,
  bus,
  hooks,
  dictionary,
  report,
  modules,
  redirects,
  editBar,
}: {
  content: PublishedContent;
  settings: () => SiteSettings;
  views: TemplateViews;
  scope: RenderScope;
  bus: EventBus;
  hooks: Hooks;
  dictionary: Dictionary;
  /** Сбой отдачи страницы — владельцу сайта. */
  report?: Report;
  /** Модули тегов `[#Form:name]`. */
  modules?: Modules;
  /** Правила переадресации из менеджера. */
  redirects?: RedirectRules;
  /** Полоса правки на сайте для вошедших в менеджер. */
  editBar?: EditBar;
}) => {
  const cache = defineMemoryPageCache(
    () => settings().pageCacheMb * 1024 * 1024
  );
  bus.onAny(_invalidate(cache));
  const delivery = definePageDelivery({
    content,
    settings,
    dictionary,
    views,
    renderer: svelteViewRenderer,
    cache,
    links: defineLinks(content, settings),
    scope,
    hooks,
    report,
    modules,
    redirects,
  });
  // Успешные ответы страниц по кэшу — с запуска или с ручного сброса: видно, работает ли кэш. 404 от
  // ботов, перебирающих адреса, долю не портят.
  const answers = { hit: 0, miss: 0, bypass: 0 };
  let since = new Date().toISOString();
  let manual = false;
  const counted: PageDelivery = {
    ...delivery,
    deliver: (request) =>
      delivery
        .deliver(request)
        .then(
          (_) => (
            void (
              _.kind === 'page' &&
              _.status < 400 &&
              (answers[_.cache] += 1)
            ),
            _
          )
        ),
  };
  const stats = (): PageCacheStats => ({
    ...cache.size(),
    hits: answers.hit,
    misses: answers.miss,
    bypass: answers.bypass,
    since,
    manual,
  });
  const discovery = defineDiscovery({ content, settings, delivery });
  bus.onAny(
    (event) =>
      void (
        (event.type.startsWith('content.') || event.type.startsWith('site.')) &&
        discovery.invalidate()
      )
  );
  return {
    handle: defineSiteHandler(
      counted,
      defineCompressionCache(),
      discovery,
      report,
      editBar
    ),
    /** Кэш страниц в настройках: заполненность и ручной сброс — с ним и карта сайта. */
    cache: {
      stats,
      clear: (): PageCacheStats => (
        cache.clear(),
        discovery.invalidate(),
        Object.assign(answers, { hit: 0, miss: 0, bypass: 0 }),
        (since = new Date().toISOString()),
        (manual = true),
        stats()
      ),
    },
    /** Ответ для предпросмотра; `contentType` — готовый заголовок, с кодировкой. */
    preview: (page: PageView): Promise<{ body: string; contentType: string }> =>
      delivery
        .preview(_previewRequest(page.path), page)
        .then((_) => ({ ..._, contentType: responseType(_.contentType) })),
  };
};
