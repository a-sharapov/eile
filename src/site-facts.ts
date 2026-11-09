import {
  addressKey,
  type ContentService,
  type PageNode,
} from './contexts/content/index.ts';
import type { DesignService } from './contexts/design/index.ts';
import type { FactPage, SiteFacts } from './contexts/diagnostics/index.ts';
import type { FormsService } from './contexts/forms/index.ts';
import type { MediaService } from './contexts/media/index.ts';
import type { NotifyService } from './contexts/notify/index.ts';
import type {
  RedirectsService,
  SitePages,
} from './contexts/redirects/index.ts';
import type { SiteService } from './contexts/site/index.ts';

// Адаптеры корня: правилам переадресации и диагностике нужен сайт целиком, а контексты друг о друге
// не знают.

type Tree = {
  readonly nodes: readonly PageNode[];
  readonly byId: ReadonlyMap<number, PageNode>;
};

const _tree = (nodes: readonly PageNode[]): Tree => ({
  nodes,
  byId: new Map(nodes.map((_) => [_.id, _])),
});

const _parent = (tree: Tree, node: PageNode): PageNode | undefined =>
  node.parentId === null ? undefined : tree.byId.get(node.parentId);

const _chain = (tree: Tree, node: PageNode | undefined): PageNode[] =>
  node === undefined ? [] : [..._chain(tree, _parent(tree, node)), node];

// Адрес без завершающего `/`: префикс правила `/katalog/*` накрывает и папку `/katalog/`.
const _bare = (path: string): string =>
  path.length > 1 ? path.replace(/\/$/, '') : path;

// Видна посетителям: опубликована, не в корзине — и вся цепочка предков тоже.
const _live = (tree: Tree, node: PageNode): boolean =>
  _chain(tree, node).every((_) => _.published && !_.trashed);

const _trashed = (tree: Tree, node: PageNode): boolean =>
  _chain(tree, node).some((_) => _.trashed);

/** Что правила переадресации знают о страницах: живые адреса и прежние адреса. */
export var redirectPages = (
  content: ContentService,
  site: SiteService
): SitePages => {
  const over = (tree: () => Tree): SitePages => ({
    at: (path) =>
      ((page) => page && { id: page.id, title: page.longTitle || page.title })(
        path === '/'
          ? ((home) => (home === null ? null : content.published.page(home)))(
              site.settings.get().homePageId
            )
          : content.published.locate(path)
      ),
    under: (base) =>
      ((tree) =>
        tree.nodes.filter(
          (_) => _live(tree, _) && `${_bare(_.path)}/`.startsWith(`${base}/`)
        ).length)(tree()),
    page: (id) =>
      ((tree) =>
        ((node) =>
          node
            ? {
                title: node.title,
                published: _live(tree, node),
                trashed: _trashed(tree, node),
              }
            : null)(tree.byId.get(id)))(tree()),
    movedFrom: content.pages.movedFrom,
    snapshot: () =>
      ((fixed) => over(() => fixed))(_tree(content.drafts.tree())),
  });
  return over(() => _tree(content.drafts.tree()));
};

const _IMPORT = /from\s+['"]\$components\/([A-Za-z0-9]+)['"]/g;
// Список детей: `listing(`, `children(` с includeHidden или компонент набора, который это делает.
const _LISTS = /\blisting\s*\(|\bchildren\s*\([^)]*includeHidden/;

/** Шаблоны и компоненты, которые сами или через импорты выводят детей страницы. */
const _listers = (design: DesignService): ReadonlySet<string> => {
  const sources = new Map(
    design.elements
      .list()
      .filter((_) => _.kind === 'template' || _.kind === 'component')
      .map((_) => [
        `${_.kind}/${_.name}`,
        design.elements.get(_.kind, _.name)?.source ?? '',
      ])
  );
  const lists = (key: string, seen: ReadonlySet<string>): boolean =>
    ((source) =>
      _LISTS.test(source) ||
      [...source.matchAll(_IMPORT)]
        .map((_) => `component/${_[1]}`)
        .some((_) => !seen.has(_) && lists(_, new Set([...seen, key]))))(
      sources.get(key) ?? ''
    );
  return new Set([...sources.keys()].filter((_) => lists(_, new Set())));
};

/** Снимок сайта для встроенных проверок диагностики. */
export var siteFacts =
  ({
    content,
    site,
    media,
    forms,
    notify,
    design,
    redirects,
  }: {
    content: ContentService;
    site: SiteService;
    media: MediaService;
    forms: FormsService;
    notify: NotifyService;
    design: DesignService;
    redirects: RedirectsService;
  }) =>
  (): SiteFacts => {
    const tree = _tree(content.drafts.tree());
    const settings = site.settings.get();
    const status = notify.settings.status();
    const configured = (['telegram', 'email'] as const).filter(
      (_) => status[_] !== null
    );
    return {
      pages: tree.nodes.map((node): FactPage => {
        const page = content.drafts.page(node.id);
        return {
          id: node.id,
          parentId: node.parentId,
          kind: node.kind,
          title: page.title,
          longTitle: page.longTitle,
          description: page.description,
          introText: page.introText,
          content: page.content,
          linkTo: page.linkTo,
          template: page.template,
          contentType: page.contentType,
          path: node.path,
          live: _live(tree, node),
          trashed: _trashed(tree, node),
          hiddenFromMenu: page.hiddenFromMenu,
          searchable: page.searchable,
        };
      }),
      homePageId: settings.homePageId,
      notFoundPageId: settings.notFoundPageId,
      siteUrl: settings.siteUrl,
      description: settings.description,
      robots: settings.robots,
      aiSearch: settings.aiSearch,
      pagingSegment: settings.pagingSegment,
      addressKey: (path) =>
        addressKey(path, {
          suffix: settings.urlSuffix,
          folderSlash: settings.folderSlash,
        }),
      redirected: (path) => redirects.match(path)?.to ?? null,
      movedFrom: content.pages.movedFrom,
      media: media.files.list().map((_) => ({
        path: _.path,
        contentType: _.contentType,
        size: _.size,
        alt: _.alt,
      })),
      // Ссылка на файл связанной папки по исходному адресу или на страницу папки-сайта — не битая (ADR 0065, 0068).
      fileAt: (
        (serving) => (path: string) =>
          path.startsWith('/media/')
            ? media.files.resolve(path.slice('/media/'.length)) !== null
            : (serving.some((_) => path.startsWith(`/${_}/`)) &&
                media.links.serves(path.slice(1))) ||
              ((answer) =>
                answer?.kind === 'slash' ||
                (answer?.kind === 'file' && answer.status === 200))(
                media.statics.resolve(path)
              )
      )(media.links.serving()),
      forms: forms.forms.list().flatMap((summary) =>
        ((form) =>
          form
            ? [
                {
                  name: form.name,
                  title: form.title,
                  source: form.source,
                  channels: (form.channels ?? status.forms).filter((_) =>
                    configured.includes(_)
                  ),
                },
              ]
            : [])(forms.forms.get(summary.name))
      ),
      // Письмо посетителю на адрес с опечаткой — не отказ канала: оно видно в карточке заявки.
      undelivered: notify.outbox
        .recent(500)
        .filter(
          (_) => _.status === 'failed' && _.message.topic !== 'confirmation'
        ).length,
      settingValues: site.customSettings.list().map((_) => String(_.value)),
      listers: _listers(design),
    };
  };
