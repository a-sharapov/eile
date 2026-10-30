import type { PageView, PublishedContent } from '../../content/index.ts';
import type { SiteSettings } from '../../site/index.ts';
import { pageUrl } from '../domain/canonical-path.ts';
import { resolvePageLinks } from '../domain/content-tags.ts';
import { isHtml } from '../domain/content-type.ts';
import {
  type LlmsPage,
  llmsTxt,
  robotsTxt,
  sitemapXml,
} from '../domain/discovery.ts';
import { htmlToMarkdown } from '../domain/markdown.ts';
import type { PageDelivery } from './page-delivery.ts';
import type { RequestInfo } from './ports.ts';

/** Текстовый ответ для поисковиков и ИИ. */
export type Discovered = {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
};

// Готовых файлов не больше: четыре пути на несколько адресов сайта.
const _READY_LIMIT = 16;

// Полный текст сайта для ИИ — не больше 5 МБ: дальше llms-full.txt перестаёт помещаться в контекст.
const _FULL_LIMIT = 5 * 1024 * 1024;

const _TAG = /\[\[[A-Z][\s\S]*?\]\]|\[#[A-Z][A-Za-z0-9]*:[a-z0-9-]+\]/g;

const _text =
  (contentType: string) =>
  (body: string): Discovered => ({
    status: 200,
    contentType,
    body,
  });

/** sitemap.xml, robots.txt, llms.txt, llms-full.txt и Markdown-версии страниц `/путь.md`. */
export var defineDiscovery = ({
  content,
  settings,
  delivery,
}: {
  content: PublishedContent;
  settings: () => SiteSettings;
  delivery: PageDelivery;
}) => {
  const originOf = (request: RequestInfo, site: SiteSettings): string =>
    site.siteUrl || request.origin;

  // Что показывать поиску: опубликованные HTML-страницы, не скрытые от поиска и не страница 404.
  const findable = (page: PageView, site: SiteSettings): boolean =>
    page.kind === 'page' &&
    isHtml(page.contentType) &&
    page.searchable &&
    page.id !== site.notFoundPageId;

  const walk = (
    parentId: number | null,
    depth: number
  ): { page: PageView; depth: number }[] =>
    content
      .children(parentId, { includeHidden: true })
      .flatMap((page) => [{ page, depth }, ...walk(page.id, depth + 1)]);

  const pages = (site: SiteSettings) =>
    walk(null, 0).filter((_) => findable(_.page, site));

  const url = (page: PageView, site: SiteSettings, origin: string) =>
    `${origin}${pageUrl(page, site.homePageId)}`;

  const markdownUrl = (page: PageView, site: SiteSettings, origin: string) =>
    page.id === site.homePageId
      ? `${origin}/index.md`
      : `${url(page, site, origin)}.md`;

  const sitemap = (request: RequestInfo): Discovered =>
    ((site, origin) =>
      _text('application/xml; charset=utf-8')(
        sitemapXml(
          pages(site).map(({ page }) => ({
            url: url(page, site, origin),
            lastmod: page.updatedAt,
          }))
        )
      ))(settings(), originOf(request, settings()));

  const robots = (request: RequestInfo): Discovered =>
    ((site) =>
      _text('text/plain; charset=utf-8')(
        robotsTxt({
          origin: originOf(request, site),
          aiSearch: site.aiSearch,
          aiTraining: site.aiTraining,
          extra: site.robots,
        })
      ))(settings());

  // Разделы llms.txt: страницы верхнего уровня, затем каждая ветка со своими страницами.
  const llms = (request: RequestInfo): Discovered => {
    const site = settings();
    const origin = originOf(request, site);
    const all = pages(site);
    const line = (page: PageView, depth: number): LlmsPage => ({
      title: page.longTitle || page.title,
      url: markdownUrl(page, site, origin),
      description: page.description,
      depth,
    });
    const roots = all.filter((_) => _.depth === 0);
    return _text('text/markdown; charset=utf-8')(
      llmsTxt({
        name: site.name,
        description: site.description,
        sections: [
          { title: site.name, pages: roots.map((_) => line(_.page, 0)) },
          ...roots.map(({ page: root }) => ({
            title: root.title,
            pages: walk(root.id, 0)
              .filter((_) => findable(_.page, site))
              .map((_) => line(_.page, _.depth)),
          })),
        ],
      })
    );
  };

  const absolute = (origin: string) => (href: string) =>
    href.startsWith('/') && !href.startsWith('//') ? `${origin}${href}` : href;

  // Полный текст — из контента страниц, без рендера шаблонов: быстро и без меню и подвалов.
  const llmsFull = (request: RequestInfo): Discovered => {
    const site = settings();
    const origin = originOf(request, site);
    const linkTo = (id: number) =>
      ((page) => (page ? pageUrl(page, site.homePageId) : null))(
        content.page(id)
      );
    const body = pages(site)
      .map(({ page }) =>
        [
          `# ${page.longTitle || page.title}`,
          `URL: ${url(page, site, origin)}`,
          ...(page.description ? [`> ${page.description}`] : []),
          htmlToMarkdown(
            resolvePageLinks(page.content.replace(_TAG, ''), linkTo),
            absolute(origin)
          ),
        ].join('\n\n')
      )
      .join('\n\n---\n\n');
    return _text('text/markdown; charset=utf-8')(
      `# ${site.name}\n\n${body}`.slice(0, _FULL_LIMIT)
    );
  };

  // /about.md → страница /about целиком, как её видит посетитель, но в Markdown; /index.md — главная.
  const markdown = (request: RequestInfo): Promise<Discovered> => {
    const site = settings();
    const origin = originOf(request, site);
    const path = request.path === '/index.md' ? '/' : request.path.slice(0, -3);
    const page = path === '/' ? null : content.byPath(path);
    return page && !findable(page, site)
      ? Promise.resolve({
          status: 404,
          contentType: 'text/plain; charset=utf-8',
          body: 'Not Found',
        })
      : delivery.deliver({ ...request, path }).then((_) =>
          _.kind === 'page' && _.status === 200
            ? _text('text/markdown; charset=utf-8')(
                ((md) =>
                  md.startsWith('# ')
                    ? md
                    : `# ${page?.longTitle || page?.title || site.name}\n\n${md}`)(
                  htmlToMarkdown(_.html, absolute(origin))
                )
              )
            : {
                status: 404,
                contentType: 'text/plain; charset=utf-8',
                body: 'Not Found',
              }
        );
  };

  const _ROUTES: Readonly<
    Record<string, (request: RequestInfo) => Discovered>
  > = {
    '/sitemap.xml': sitemap,
    '/robots.txt': robots,
    '/llms.txt': llms,
    '/llms-full.txt': llmsFull,
  };

  // Карта сайта и llms.txt строятся обходом всего дерева: держим готовые до правки контента или настроек.
  // Ключ — путь и адрес сайта: Host запроса участвует, только пока адрес в настройках не задан, и записей
  // не больше _READY_LIMIT — перебор Host не раздует память.
  const ready = new Map<string, Discovered>();

  const keep = (key: string, made: Discovered): Discovered => (
    ready.size >= _READY_LIMIT && ready.delete(ready.keys().next().value!),
    ready.set(key, made),
    made
  );

  const cached = (
    request: RequestInfo,
    build: (request: RequestInfo) => Discovered
  ) =>
    ((key) => ready.get(key) ?? keep(key, build(request)))(
      `${request.path} ${originOf(request, settings())}`
    );

  return {
    /** Ответ для пути находимости; null — путь обычной страницы. Своя страница `/robots.txt` важнее. */
    respond: (request: RequestInfo): Promise<Discovered> | null =>
      (_ROUTES[request.path] || request.path.endsWith('.md')) &&
      content.byPath(request.path) === null
        ? _ROUTES[request.path]
          ? Promise.resolve(cached(request, _ROUTES[request.path]!))
          : markdown(request)
        : null,
    invalidate: (): void => ready.clear(),
  };
};

export type Discovery = ReturnType<typeof defineDiscovery>;
