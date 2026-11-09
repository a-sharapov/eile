import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  errorDetail,
  errorKey,
  NO_REPORT,
  type Report,
} from '../../../shared/kernel/report.ts';
import type { PageView, PublishedContent } from '../../content/index.ts';
import type { SiteSettings } from '../../site/index.ts';
import {
  canonicalPath,
  cleanPath,
  endingOf,
  markdownPath,
  pageUrl,
} from '../domain/canonical-path.ts';
import {
  type ContentPart,
  contentComponents,
  expandKeys,
  parseContent,
  resolvePageLinks,
} from '../domain/content-tags.ts';
import { HTML_TYPE, isHtml, isMarkup } from '../domain/content-type.ts';
import { type Alternate, seoHead } from '../domain/discovery.ts';
import {
  fillRegions,
  htmlDocument,
  islandHtml,
  islandLoader,
  type Rendered,
  regionMarker,
  viewTransitionHead,
} from '../domain/document.ts';
import {
  PAGING_TITLE_KEY,
  pagingPath,
  pagingTail,
  pagingTitle,
  withTitleSuffix,
} from '../domain/paging.ts';
import { withSiteKeys } from '../domain/site-keys.ts';
import { oneByLanguage, translationsTag } from '../domain/translations.ts';
import type { Links } from './links.ts';
import type {
  CachedPage,
  Dictionary,
  Hooks,
  LoadedView,
  ModulePage,
  Modules,
  PageCache,
  RedirectRules,
  Region,
  RequestInfo,
  Snapshot,
  TemplateViews,
  ViewRenderer,
} from './ports.ts';
import { REQUEST_TAG, type RenderScope } from './render-scope.ts';

/** hit — из кэша, miss — отрендерена и положена в кэш, bypass — в кэш не положена. */
export type CacheStatus = 'hit' | 'miss' | 'bypass';

export type Delivery =
  | {
      readonly kind: 'page';
      readonly status: number;
      /** Готовый ответ: HTML-документ или текст страницы-файла. */
      readonly html: string;
      /** MIME-тип ответа без параметров. */
      readonly contentType: string;
      readonly cache: CacheStatus;
      /**
       * HTML один и тот же для всех, пока страница не изменится: документ из кэша как есть. У страницы
       * с регионами (форма со штампом, Uncached) каждый ответ свой, его сжатие запоминать незачем.
       */
      readonly shared: boolean;
      /** Страница дерева, которую показали; null — голый 404 без своей страницы. */
      readonly pageId: number | null;
      /** Язык показанной страницы; у голого 404 — пусто. */
      readonly language: string;
    }
  | {
      /** Ответ плагина на запрос, которому не нашлось страницы (ADR 0067): отдаётся как есть, мимо кэша. */
      readonly kind: 'response';
      readonly response: Response;
    }
  | {
      readonly kind: 'redirect';
      readonly location: string;
      /** Внешний адрес отдаётся как есть, без кодирования. */
      readonly external: boolean;
      readonly status: 301 | 302;
      /** Дописать query исходного запроса: у своих адресов и у правил переадресации. */
      readonly query: boolean;
      /** Параметры query, которые узнало правило (`p` у `/?p=12`): их в адрес цели не дописывать. */
      readonly consumed?: readonly string[];
    };

export type PageDeliveryPorts = {
  readonly content: PublishedContent;
  readonly settings: () => SiteSettings;
  readonly dictionary: Dictionary;
  readonly views: TemplateViews;
  readonly renderer: ViewRenderer;
  readonly cache: PageCache;
  readonly links: Links;
  readonly scope: RenderScope;
  readonly hooks: Hooks;
  /** Регион или остров упал: на его месте пусто, а владелец сайта узнаёт. */
  readonly report?: Report;
  /** Модули тегов `[#Form:name]`: что рисует каждый. */
  readonly modules?: Modules;
  /** Правила переадресации из менеджера: адрес без страницы → цель. */
  readonly redirects?: RedirectRules;
  /** Скрипт перед `</body>` каждой HTML-страницы (маячок целей статистики); пусто — ничего. */
  readonly beacon?: () => string;
};

/** Ключ контекста, через который `$core/Uncached` отмечает свой регион. */
export var REGIONS_CONTEXT = 'cms:regions';

/** Ключ контекста `$core/Content`: разбор тегов и загруженные заранее компоненты. */
export var CONTENT_CONTEXT = 'cms:content';

/**
 * Тег страницы, которая ссылается на файлы стилей: общий файл сайта собран из всех шаблонов и
 * компонентов, поэтому его новый хэш — после правки любого из них.
 */
export var STYLES_TAG = 'styles';

const _BARE_NOT_FOUND =
  '<!doctype html>\n<title>404 Not Found</title>\n<h1>Not Found</h1>\n';

const _EMPTY: Rendered = { head: '', body: '' };

/** Готовое место второй фазы; islands — в нём есть остров, и странице нужен загрузчик. */
type Drawn = Rendered & { readonly islands?: boolean };

// Внутри острова ничего вложенного нет: он гидрируется целиком, а вложенный остров в браузере не ожил бы.
const _INSIDE_ISLAND = new Map([
  [REGIONS_CONTEXT, { mark: () => '', island: () => '', module: () => '' }],
]);

const _redirect = (
  location: string,
  external = false,
  status: 301 | 302 = 301,
  query = !external
): Delivery => ({
  kind: 'redirect',
  location,
  external,
  status,
  query,
});

const _page =
  (
    status: number,
    cache: CacheStatus,
    pageId: number | null,
    contentType = HTML_TYPE,
    language = '',
    shared = false
  ) =>
  (html: string): Delivery => ({
    kind: 'page',
    status,
    html,
    contentType,
    cache,
    shared,
    pageId,
    language,
  });

// Props региона хранятся в кэше: снимок через JSON отвязывает их от объектов рендера. Ключ `__proto__`
// (например, из JSON в cookie) не доходит ни до компонента, ни до браузера: слияние в острове не подменит
// прототип.
const _frozen = (props: unknown): Readonly<Record<string, unknown>> =>
  JSON.parse(JSON.stringify(props ?? {}), (key, value) =>
    key === '__proto__' ? undefined : value
  );

/** Ответ посетителю: канонический адрес, кэш страниц, поиск в дереве, двухфазный рендер. */
/** Сколько хостов без адреса сайта получают свой кэш страниц. */
const _CACHED_HOSTS = 4;

export var definePageDelivery = ({
  content,
  settings,
  dictionary,
  views,
  renderer,
  cache,
  links,
  scope,
  hooks,
  report = NO_REPORT,
  modules = {},
  redirects,
  beacon = () => '',
}: PageDeliveryPorts) => {
  const regionFailed =
    (request: RequestInfo, region: Region) =>
    (error: unknown): Rendered => (
      console.error(error),
      report({
        kind: 'site.region_failed',
        severity: 'error',
        title:
          region.kind === 'island'
            ? {
                en: `Island ${region.name} failed to render on ${request.path}`,
                de: `Insel ${region.name} auf ${request.path} wurde nicht gerendert`,
                ru: `Не отрисовался остров ${region.name} на ${request.path}`,
              }
            : {
                en: `Region ${region.name} failed to render on ${request.path}`,
                de: `Bereich ${region.name} auf ${request.path} wurde nicht gerendert`,
                ru: `Не отрисовался регион ${region.name} на ${request.path}`,
              },
        detail: errorDetail(error),
        key: errorKey(`site.region_failed:${region.name}`, error),
      }),
      _EMPTY
    );

  // Ключи переводов и своих настроек в тексте страницы — на её языке, до разбора тегов контента.
  const localized = (page: PageView, language: string): PageView => {
    const lookup = {
      text: (key: string) => dictionary.text(key, language),
      value: dictionary.value,
    };
    return {
      ...page,
      title: expandKeys(page.title, lookup, false),
      longTitle: expandKeys(page.longTitle, lookup, false),
      menuTitle: expandKeys(page.menuTitle, lookup, false),
      description: expandKeys(page.description, lookup, false),
      introText: expandKeys(page.introText, lookup, false),
      content: expandKeys(page.content, lookup, isMarkup(page.contentType)),
      fields: Object.fromEntries(
        Object.entries(page.fields).map(({ 0: name, 1: value }) => [
          name,
          typeof value === 'string' ? expandKeys(value, lookup, false) : value,
        ])
      ),
    };
  };

  const languageOf = (page: PageView, site: SiteSettings): string =>
    page.language || site.language;

  // «страница 2» — на языке страницы; перевод `pagingTitle` с `{n}` заменяет встроенный текст.
  const pageLabel = (language: string, number: number): string =>
    pagingTitle(dictionary.text(PAGING_TITLE_KEY, language), language, number);

  // Адрес страницы для `[~id~]` в контенте; рендер запоминает, от какой страницы он зависит.
  // Предки цели — тоже зависимость: перенос раздела меняет адрес и страницы внутри.
  const linkTo = (id: number): string | null => {
    scope.record(`page:${id}`);
    content.lineage(id).forEach((_) => void scope.record(`branch:${_}`));
    const target = content.page(id);
    return target && links.urlOf(target);
  };

  // Компоненты из тегов контента и строковых полей грузятся до рендера: SSR синхронный.
  const preload = (page: PageView): Promise<Map<string, LoadedView>> =>
    Promise.all(
      contentComponents(
        [
          page.content,
          ...Object.values(page.fields).filter((_) => typeof _ === 'string'),
        ].join('\n')
      ).map((name) =>
        views.component(name).then(
          (_) => [name, _] as const,
          () => null
        )
      )
    ).then((_) => new Map(_.filter((entry) => entry !== null)));

  /** Адрес сайта для абсолютных ссылок: из настроек, иначе из запроса. */
  const originOf = (request: RequestInfo, site: SiteSettings): string =>
    site.siteUrl || request.origin;

  const urlOf = (page: PageView, site: SiteSettings, origin: string) =>
    `${origin}${pageUrl(page, site.homePageId)}`;

  /** Переводы для hreflang: опубликованные HTML-страницы набора, открытые поиску, по одной на язык. */
  const alternatesOf = (
    page: PageView,
    site: SiteSettings,
    origin: string
  ): Alternate[] =>
    ((alternates) => (alternates.length < 2 ? [] : alternates))(
      oneByLanguage(
        content
          .translations(page.id)
          .filter(
            (_) =>
              _.kind === 'page' &&
              isHtml(_.contentType) &&
              _.searchable &&
              _.id !== site.notFoundPageId
          )
          .map((_) => ({
            language: languageOf(_, site),
            url: urlOf(_, site, origin),
          }))
      )
    );

  // Шапка собирается после рендера, поэтому её зависимости — явными тегами: набор переводов и ветки
  // переводов, от которых зависят их адреса.
  const translationTags = (page: PageView): string[] =>
    ((hub) =>
      hub === null
        ? []
        : [
            translationsTag(hub),
            ...content
              .translations(page.id)
              .flatMap((_) =>
                content.lineage(_.id).map((id) => `branch:${id}`)
              ),
          ])(content.translationHub(page.id));

  /** Номер порции и сколько их всего у постраничного списка; pages null — списка нет. */
  type PageNumber = { readonly number: number; readonly pages: number | null };

  // Теги находимости кэшируются вместе со страницей: всё, что они читают, уже в её тегах кэша.
  const seo = (
    request: RequestInfo,
    page: PageView,
    site: SiteSettings,
    status: number,
    existing: string,
    { number, pages }: PageNumber
  ): string => {
    const origin = originOf(request, site);
    const image = page.socialImage || site.socialImage;
    const base = pageUrl(page, site.homePageId);
    const at = (_: number) =>
      `${origin}${pagingPath(base, site.pagingSegment, _, endingOf(page))}`;
    // Порции 2, 3… — свои заголовок и описание, иначе поисковик видит дубли первой.
    const suffix =
      number > 1 ? ` — ${pageLabel(languageOf(page, site), number)}` : '';
    const description =
      page.description ||
      (page.id === site.homePageId ? site.description : '') ||
      page.introText.replace(/\s+/g, ' ').trim().slice(0, 300);
    return seoHead(
      {
        title: (page.longTitle || page.title) + suffix,
        description: description && description + suffix,
        language: languageOf(page, site),
        url: site.pagingCanonical === 'first' ? at(1) : at(number),
        markdown: `${origin}${markdownPath(base, endingOf(page))}`,
        pagination:
          pages === null || pages < 2
            ? null
            : {
                number,
                prev: number > 1 ? at(number - 1) : null,
                next: number < pages ? at(number + 1) : null,
              },
        searchable: page.searchable && status === 200,
        // У порций 2, 3… переводов нет: переводы — у первой.
        alternates:
          status === 200 && number === 1
            ? alternatesOf(page, site, origin)
            : [],
        image: image ? `${origin}/media/${image}` : null,
        publishedAt: page.publishedAt,
        updatedAt: page.updatedAt,
        trail: [
          ...content
            .lineage(page.id)
            .toReversed()
            .map((_) => content.page(_))
            .filter((_) => _ !== null)
            .map((_) => ({
              title: _.menuTitle || _.title,
              url: urlOf(_, site, origin),
            })),
          // Порция списка в крошках — после самой страницы.
          ...(number > 1
            ? [{ title: page.menuTitle || page.title, url: at(1) }]
            : []),
        ],
      },
      {
        name: site.name,
        description: site.description,
        language: site.language,
        origin,
      },
      existing
    );
  };

  // Страница-файл — её текст как есть: ссылки `[~id~]` и вызовы компонентов, без шаблона и документа.
  const file = (
    page: PageView,
    parts: readonly ContentPart[],
    tags: { view: (name: string) => unknown; links: (html: string) => string },
    context: ReadonlyMap<string, unknown>
  ): Rendered => ({
    head: '',
    // Модулю (форме) в CSS или ленте места нет: тег модуля в странице-файле ничего не выводит.
    body: parts
      .map((part) =>
        'html' in part
          ? tags.links(part.html)
          : 'module' in part
            ? ''
            : ((view) =>
                view === null
                  ? ''
                  : renderer.render(view, { page, ...part.props }, context)
                      .body)(tags.view(part.component))
      )
      .join(''),
  });

  const firstPhase = (
    request: RequestInfo,
    source: PageView,
    site: SiteSettings,
    status = 200,
    number = 1
  ): Promise<{
    snapshot: Snapshot;
    tags: readonly string[];
    pages: number | null;
  }> =>
    ((language, page) =>
      Promise.all([
        isHtml(page.contentType)
          ? views.template(page.template)
          : Promise.resolve(null),
        preload(page),
      ]).then(({ 0: template, 1: called }) => {
        const regions: Region[] = [];
        const add =
          (kind: Region['kind']) =>
          (name: string, props: unknown): string =>
            regionMarker(
              regions.push({ kind, name, props: _frozen(props) }) - 1
            );
        const at: ModulePage = {
          id: page.id,
          title: page.longTitle || page.title,
          path: pageUrl(page, site.homePageId),
        };
        // Неизвестный модуль — тег как есть: пропуск видно на странице.
        const module = (kind: string, name: string): string =>
          kind in modules
            ? add('module')(name, { module: kind, page: at })
            : `[#${kind}:${name}]`;
        const collector = {
          mark: add('uncached'),
          island: add('island'),
          module,
        };
        const contentTags = {
          parse: parseContent,
          view: (name: string) => called.get(name)?.view ?? null,
          links: (html: string) => resolvePageLinks(html, linkTo),
          module,
        };
        const context = new Map<string, unknown>([
          [REGIONS_CONTEXT, collector],
          [CONTENT_CONTEXT, contentTags],
        ]);
        const { result, tags, pages } = scope.run(
          request,
          () =>
            template
              ? renderer.render(
                  template.view,
                  {
                    page,
                    site: withSiteKeys(site, {
                      ...dictionary,
                      text: (key) => dictionary.text(key, language),
                    }),
                  },
                  context
                )
              : file(page, parseContent(page.content), contentTags, context),
          {
            language,
            page,
            paging: {
              base: pageUrl(page, site.homePageId),
              number,
              segment: site.pagingSegment,
              ending: endingOf(page),
            },
          }
        );
        const head =
          number > 1
            ? withTitleSuffix(result.head, ` — ${pageLabel(language, number)}`)
            : result.head;
        // Стили — в конце head вида, перед SEO-шапкой и регионами: там их печатал Svelte, и стили форм
        // (`:where`, нулевая специфичность) по-прежнему идут после них.
        return {
          pages,
          snapshot: {
            body: result.body,
            head: template
              ? head +
                views.styles(result.styles ?? []).join('') +
                seo(request, page, site, status, head, { number, pages }) +
                viewTransitionHead(site.viewTransitions, [
                  head,
                  ...(result.styles ?? []).map((_) => _.code),
                ])
              : '',
            regions,
            language,
            contentType: page.contentType,
          },
          tags: [
            ...tags,
            ...((result.styles ?? []).length > 0 ? [STYLES_TAG] : []),
            ...[
              ...(template?.elements ?? []),
              ...[...called.values()].flatMap((_) => _.elements),
            ].map((_) => `element:${_}`),
            `page:${page.id}`,
            ...content.lineage(page.id).map((_) => `branch:${_}`),
            ...translationTags(page),
          ],
        };
      }))(
      languageOf(source, site),
      localized(source, languageOf(source, site))
    );

  const island = (request: RequestInfo, region: Region): Promise<Drawn> =>
    Promise.all([
      views
        .component(region.name)
        .then(
          ({ view }) =>
            scope.run(request, () =>
              renderer.render(view, region.props, _INSIDE_ISLAND, true)
            ).result
        ),
      views.island(region.name),
    ]).then(({ 0: rendered, 1: module }) => ({
      head: rendered.head,
      body: islandHtml(module, region.props, rendered.body),
      styles: rendered.styles,
      islands: true,
    }));

  // Регион рисуется на каждом запросе, поэтому острова в нём получают props этого запроса и в кэш не
  // попадают: маркеры — только в HTML региона, острова встают на них сразу. Регион и модуль в регионе
  // по-прежнему ничего не выводят.
  const uncached = (request: RequestInfo, region: Region): Promise<Drawn> =>
    views.component(region.name).then(({ view }) => {
      const islands: Region[] = [];
      const context = new Map([
        [
          REGIONS_CONTEXT,
          {
            mark: () => '',
            module: () => '',
            island: (name: string, props: unknown): string =>
              regionMarker(
                islands.push({ kind: 'island', name, props: _frozen(props) }) -
                  1
              ),
          },
        ],
      ]);
      const rendered = scope.run(request, () =>
        renderer.render(view, region.props, context)
      ).result;
      return Promise.all(islands.map(renderRegion(request))).then(
        (drawn): Drawn => ({
          ...fillRegions(rendered, drawn),
          islands: drawn.some((_) => _.islands === true),
        })
      );
    });

  const _REGIONS: Readonly<
    Record<
      Region['kind'],
      (request: RequestInfo, region: Region) => Promise<Drawn>
    >
  > = {
    uncached,
    module: (request, region) =>
      Promise.resolve().then(
        () =>
          modules[String(region.props.module)]?.(
            region.name,
            request,
            (region.props.page as ModulePage | undefined) ?? null
          ) ?? _EMPTY
      ),
    island,
  };

  const renderRegion =
    (request: RequestInfo) =>
    (region: Region): Promise<Drawn> =>
      _REGIONS[region.kind](request, region).then(
        undefined,
        regionFailed(request, region)
      );

  // Один загрузчик на страницу — и для островов страницы, и для островов в регионах.
  const loader = (regions: readonly Drawn[]): Promise<string> =>
    regions.some((_) => _.islands === true)
      ? views.hydrator().then(islandLoader)
      : Promise.resolve('');

  // Маячок — только посетителю: предпросмотр в менеджере его не получает.
  const secondPhase = (
    request: RequestInfo,
    snapshot: Snapshot,
    site: SiteSettings,
    visitor = true
  ): Promise<string> =>
    Promise.all(snapshot.regions.map(renderRegion(request))).then((regions) =>
      loader(regions).then((script) =>
        isHtml(snapshot.contentType)
          ? pipe(
              // Стили регионов — после их head; что уже подключено, второй раз не ставится.
              (_: Rendered) => ({
                head: [
                  _.head,
                  ...views
                    .styles(_.styles ?? [])
                    .filter((tag) => !_.head.includes(tag)),
                ].join(''),
                body: _.body + script + (visitor ? beacon() : ''),
              }),
              (_: Rendered) =>
                htmlDocument(snapshot.language || site.language, _)
            )(fillRegions(snapshot, regions))
          : fillRegions(snapshot, regions).body
      )
    );

  // Адрес сайта не задан — абсолютные адреса в шапке строятся по Host запроса, поэтому Host входит и в
  // ключ кэша: запрос с чужим Host не подменит canonical остальным посетителям.
  const cacheKey = (request: RequestInfo, path: string): string =>
    settings().siteUrl ? path : `${request.origin} ${path}`;

  // Без адреса сайта кэш делится по Host, но только для первых нескольких: подменный Host в каждом
  // запросе иначе вытеснял бы из кэша настоящие страницы. Остальные хосты рисуются без кэша.
  const hosts = new Set<string>();
  const cacheable = (request: RequestInfo): boolean =>
    settings().siteUrl !== '' ||
    hosts.has(request.origin) ||
    (hosts.size < _CACHED_HOSTS && (hosts.add(request.origin), true));

  const store = (
    request: RequestInfo,
    path: string,
    page: PageView,
    snapshot: Snapshot,
    tags: readonly string[],
    html: string
  ): CacheStatus =>
    page.cacheable && !tags.includes(REQUEST_TAG) && cacheable(request)
      ? (cache.set(cacheKey(request, path), {
          content: snapshot.regions.length === 0 ? { html } : { snapshot },
          contentType: page.contentType,
          pageId: page.id,
          language: snapshot.language || settings().language,
          tags: new Set(tags),
        }),
        'miss')
      : 'bypass';

  const render = (
    request: RequestInfo,
    page: PageView,
    site: SiteSettings,
    status: number,
    number = 1
  ): Promise<Delivery> =>
    firstPhase(request, page, site, status, number).then(
      ({ snapshot, tags, pages }) =>
        // Порция за пределами списка или у страницы без списка — 404, а не дубль страницы.
        number > 1 && (pages === null || number > pages)
          ? notFoundPage(request, site)
          : secondPhase(request, snapshot, site).then((html) =>
              ((cache) =>
                _page(
                  status,
                  cache,
                  page.id,
                  page.contentType,
                  snapshot.language || settings().language,
                  cache === 'miss' && snapshot.regions.length === 0
                )(html))(
                status === 200
                  ? store(request, request.path, page, snapshot, tags, html)
                  : 'bypass'
              )
            )
    );

  const notFoundPage = (
    request: RequestInfo,
    site: SiteSettings
  ): Promise<Delivery> => {
    const page =
      site.notFoundPageId === null ? null : content.page(site.notFoundPageId);
    return page
      ? render(request, page, site, 404)
      : Promise.resolve(_page(404, 'bypass', null)(_BARE_NOT_FOUND));
  };

  // Старый адрес страницы (до смены алиаса или переноса) ведёт на новый — поисковики не теряют её.
  // Порция списка по старому адресу ведёт на ту же порцию по новому.
  const movedTo = (path: string, site: SiteSettings): string | null => {
    const moved = content.movedFrom(path);
    const tail = moved ? null : pagingTail(path, site.pagingSegment);
    const base = tail && content.movedFrom(tail.base);
    return moved
      ? pageUrl(moved, site.homePageId)
      : base && tail
        ? pagingPath(
            pageUrl(base, site.homePageId),
            site.pagingSegment,
            tail.number,
            endingOf(base)
          )
        : null;
  };

  // Цель правила `[~id~]` идёт за страницей, якорь `#…` после неё остаётся; страница снята с
  // публикации — правило молчит.
  const ruleTarget = (to: string, site: SiteSettings): string | null =>
    ((match) =>
      match === null
        ? to
        : ((page) =>
            page && `${pageUrl(page, site.homePageId)}${match[2] ?? ''}`)(
            content.page(Number(match[1]))
          ))(/^\[~(\d+)~\](#\S*)?$/.exec(to));

  // Правила владельца сайта: после живых страниц (ошибка в правиле не закроет страницу), но раньше
  // прежних адресов и плагинов — явное решение человека важнее автоматического.
  // Правила записаны без завершающего `/`: `/old/` и `/old` находят одно правило.
  const ruled = (path: string, site: SiteSettings): Delivery | null =>
    ((found) =>
      found &&
      ((to) =>
        to === null
          ? null
          : (redirects!.hit(found.id),
            _redirect(to, !to.startsWith('/'), found.status, true)))(
        ruleTarget(found.to, site)
      ))(redirects?.match(canonicalPath(path) ?? path) ?? null);

  // Правило с query (`/?p=12` со старого WordPress) — раньше страницы и кэша: страница query не видит, и
  // главная молча открылась бы с 200 вместо записи. Узнанные параметры в адрес цели не идут.
  const queried = (request: RequestInfo, path: string): Delivery | null =>
    redirects?.matchQuery && Object.keys(request.query).length > 0
      ? ((found) =>
          found &&
          ((to) =>
            to === null
              ? null
              : (redirects.hit(found.id),
                {
                  ..._redirect(to, !to.startsWith('/'), found.status, true),
                  consumed: found.consumed ?? [],
                }))(ruleTarget(found.to, settings())))(
          redirects.matchQuery(canonicalPath(path) ?? path, request.query)
        )
      : null;

  // Адрес без страницы: правило, иначе прежний адрес страницы; null — ни того, ни другого.
  const redirectOf = (path: string, site: SiteSettings): Delivery | null =>
    ruled(path, site) ??
    ((moved) => (moved === null ? null : _redirect(moved)))(
      movedTo(path, site)
    );

  // Сайт без адресов на `/`: `/old/` без страницы, как и раньше, уходит на `/old` — пусть там решают
  // плагины и страница 404. У стиля адресов со слэшем `/` — часть адреса, и такого шага нет.
  const unslashed = (path: string, site: SiteSettings): Delivery | null =>
    path !== '/' &&
    path.endsWith('/') &&
    !site.folderSlash &&
    site.urlSuffix !== '/'
      ? _redirect(path.slice(0, -1))
      : null;

  // Ничто на сайте не ответило: сначала свой ответ плагина (`handle`), потом редирект плагина (`notFound`),
  // потом страница 404. Ответ плагина — только запросу посетителя (`raw`): предпросмотру и Markdown — нет.
  const answered = (raw: Request | null): Promise<Delivery | null> =>
    raw === null || !hooks.handle
      ? Promise.resolve(null)
      : hooks
          .handle(raw)
          .then((response) =>
            response === null ? null : { kind: 'response', response }
          );

  const notFound = (
    request: RequestInfo,
    site: SiteSettings,
    raw: Request | null
  ): Promise<Delivery> =>
    ((moved) =>
      moved
        ? Promise.resolve(moved)
        : answered(raw).then(
            (answer) =>
              answer ??
              hooks
                .notFound(request.path)
                .then((location) =>
                  location === null
                    ? notFoundPage(request, site)
                    : _redirect(location, !location.startsWith('/'))
                )
          ))(redirectOf(request.path, site) ?? unslashed(request.path, site));

  // Страница по адресу или его варианту (`/katalog` при адресе `/katalog/`): лишнее окончание — 301 в serve.
  const resolve = (path: string, site: SiteSettings): PageView | null =>
    path !== '/'
      ? content.locate(path)
      : site.homePageId === null
        ? null
        : content.page(site.homePageId);

  const followLink = (
    request: RequestInfo,
    site: SiteSettings,
    page: PageView,
    raw: Request | null
  ): Promise<Delivery> => {
    const target = links.urlOf(page);
    return target === null
      ? notFound(request, site, raw)
      : Promise.resolve(_redirect(target, !target.startsWith('/')));
  };

  // Главная по алиасу и `/blog/page-1` уходят на свой единственный адрес.
  const serve = (
    request: RequestInfo,
    site: SiteSettings,
    page: PageView,
    number: number,
    raw: Request | null
  ): Promise<Delivery> => {
    const url = pagingPath(
      pageUrl(page, site.homePageId),
      site.pagingSegment,
      number,
      endingOf(page)
    );
    return page.kind === 'link'
      ? number === 1
        ? followLink(request, site, page, raw)
        : notFoundPage(request, site)
      : url === request.path
        ? render(request, page, site, 200, number)
        : Promise.resolve(_redirect(url));
  };

  // Страница дерева и номер порции её списка. Дерево важнее хвоста: настоящая страница `page-2`
  // открывается сама, а не как порция родителя.
  const located = (
    path: string,
    site: SiteSettings
  ): { readonly page: PageView; readonly number: number } | null => {
    const page = resolve(path, site);
    const tail = page ? null : pagingTail(path, site.pagingSegment);
    const base = tail && resolve(tail.base, site);
    return page
      ? { page, number: 1 }
      : base && tail
        ? { page: base, number: tail.number }
        : null;
  };

  const fromTree = (
    request: RequestInfo,
    raw: Request | null
  ): Promise<Delivery> =>
    ((site) =>
      ((found) =>
        found
          ? serve(request, site, found.page, found.number, raw)
          : notFound(request, site, raw))(located(request.path, site)))(
      settings()
    );

  // `//old`: правило и прежний адрес страницы ведут к цели сразу, без лишнего шага через `/old`. Живая
  // страница важнее правила — у неё 301 сразу на её адрес.
  const normalized = (clean: string): Delivery =>
    ((site) =>
      ((found) =>
        found
          ? _redirect(
              pagingPath(
                pageUrl(found.page, site.homePageId),
                site.pagingSegment,
                found.number,
                endingOf(found.page)
              )
            )
          : (redirectOf(clean, site) ?? _redirect(clean)))(
        located(clean, site)
      ))(settings());

  const fromCache = (
    request: RequestInfo,
    { content, contentType, pageId, language }: CachedPage
  ) =>
    'html' in content
      ? Promise.resolve(
          _page(200, 'hit', pageId, contentType, language, true)(content.html)
        )
      : secondPhase(request, content.snapshot, settings()).then(
          _page(200, 'hit', pageId, contentType, language)
        );

  // Плагины правят HTML: CSS или ленту им не отдаём.
  const rendered =
    (request: RequestInfo) =>
    (_: Delivery): Delivery | Promise<Delivery> =>
      _.kind === 'page' && isHtml(_.contentType)
        ? hooks
            .render(_.html, { path: request.path, status: _.status })
            .then((html) => ({ ..._, html }))
        : _;

  const route =
    (request: RequestInfo, raw: Request | null) =>
    (clean: string | null): Promise<Delivery> => {
      const cached =
        clean === null || !cacheable(request)
          ? undefined
          : cache.get(cacheKey(request, clean));
      const ruled = clean === null ? null : queried(request, clean);
      return ruled
        ? Promise.resolve(ruled)
        : clean === null
          ? notFound(request, settings(), raw)
          : clean !== request.path
            ? Promise.resolve(normalized(clean))
            : cached
              ? fromCache(request, cached)
              : fromTree(request, raw);
    };

  return {
    /** Ответ страницы без кэша — для предпросмотра в менеджере. */
    preview: (
      request: RequestInfo,
      page: PageView
    ): Promise<{ body: string; contentType: string }> =>
      firstPhase(request, page, settings()).then(({ snapshot }) =>
        secondPhase(request, snapshot, settings(), false).then((body) => ({
          body,
          contentType: page.contentType,
        }))
      ),
    /** `raw` — сам запрос посетителя: без него (Markdown, предпросмотр) плагины не отвечают. */
    deliver: (
      request: RequestInfo,
      raw: Request | null = null
    ): Promise<Delivery> =>
      Promise.resolve(request.path).then(
        pipe(cleanPath, route(request, raw), rendered(request))
      ),
    /**
     * Страница 404 сайта сразу, без поиска страницы, правил и плагинов: адрес папки-сайта без файла
     * (ADR 0068) — её адреса принадлежат ей.
     */
    notFound: (request: RequestInfo): Promise<Delivery> =>
      Promise.resolve(request)
        .then((_) => notFoundPage(_, settings()))
        .then(rendered(request)),
  };
};

export type PageDelivery = ReturnType<typeof definePageDelivery>;
