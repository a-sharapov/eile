import { attempt } from '../../../shared/kernel/errors.ts';
import { type Finding, type FindingItem, finding } from './diagnostics.ts';
import { type CheckTexts, type SiteFindingId, TITLE_LIMIT } from './texts.ts';

/** Страница глазами диагностики: черновики и корзина тоже — на них ведут ссылки. */
export type FactPage = {
  readonly id: number;
  readonly parentId: number | null;
  readonly kind: 'page' | 'link';
  readonly title: string;
  readonly longTitle: string;
  readonly description: string;
  readonly introText: string;
  readonly content: string;
  readonly linkTo: string;
  readonly template: string;
  readonly contentType: string;
  /** Адрес по алиасам предков; главная живёт и на `/`. */
  readonly path: string;
  /** Опубликована, не в корзине, и предки тоже: её видят посетители. */
  readonly live: boolean;
  /** Сама или её ветка в корзине. */
  readonly trashed: boolean;
  readonly hiddenFromMenu: boolean;
  readonly searchable: boolean;
};

export type FactFile = {
  readonly path: string;
  readonly contentType: string;
  readonly size: number;
  readonly alt: string;
};

export type FactForm = {
  readonly name: string;
  readonly title: string;
  readonly source: string;
  /** Каналы, куда реально уходят заявки: свои или из маршрута, только настроенные. */
  readonly channels: readonly string[];
};

/** Всё, что встроенным проверкам нужно знать о сайте; собирает корень приложения. */
export type SiteFacts = {
  readonly pages: readonly FactPage[];
  readonly homePageId: number | null;
  readonly notFoundPageId: number | null;
  readonly siteUrl: string;
  /** Описание сайта: у главной оно заменяет своё. */
  readonly description: string;
  readonly robots: string;
  readonly aiSearch: boolean;
  readonly pagingSegment: string;
  /** Правило переадресации для адреса: куда ведёт; null — правила нет. */
  readonly redirected: (path: string) => string | null;
  /** Страница, которая раньше жила по адресу: сайт отвечает 301 на её новый адрес. */
  readonly movedFrom: (path: string) => number | null;
  readonly media: readonly FactFile[];
  readonly forms: readonly FactForm[];
  /** Уведомлений, которые канал так и не принял. */
  readonly undelivered: number;
  /** Значения своих настроек: шаблоны держат в них id служебных страниц. */
  readonly settingValues: readonly string[];
  /** Шаблоны и компоненты, которые выводят детей страницы: `template/Blog`, `component/PostList`. */
  readonly listers: ReadonlySet<string>;
};

/** Входные данные проверок, разложенные по таблицам один раз на отчёт. */
export type Indexed = {
  readonly facts: SiteFacts;
  readonly byId: ReadonlyMap<number, FactPage>;
  readonly livePaths: ReadonlyMap<string, FactPage>;
  readonly allPaths: ReadonlyMap<string, FactPage>;
  readonly files: ReadonlySet<string>;
};

export var indexFacts = (facts: SiteFacts): Indexed => ({
  facts,
  byId: new Map(facts.pages.map((_) => [_.id, _])),
  livePaths: new Map(facts.pages.filter((_) => _.live).map((_) => [_.path, _])),
  allPaths: new Map(facts.pages.map((_) => [_.path, _])),
  files: new Set(facts.media.map((_) => _.path)),
});

const _pageFix = (id: number) => ({ href: `/pages/${id}` });
const _shown = (page: FactPage): string => page.longTitle || page.title;
const _isHtml = (page: FactPage): boolean =>
  page.kind === 'page' && page.contentType.startsWith('text/html');

// --- ссылки -----------------------------------------------------------------

const _ID = /\[~(\d+)~\]/g;
const _HREF = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const _SKIP =
  /^(?:#|mailto:|tel:|javascript:|data:|[a-z][a-z0-9+.-]*:|\/\/|\[~|\{)/i;
const _DISCOVERY = new Set([
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
  '/llms-full.txt',
]);

/** Ссылка из текста: id страницы `[~5~]` или адрес сайта `/about`. */
export type LinkRef =
  | { readonly kind: 'id'; readonly id: number; readonly raw: string }
  | { readonly kind: 'path'; readonly path: string; readonly raw: string };

const _decoded = (path: string): string =>
  attempt(
    () => decodeURIComponent(path),
    () => path
  );

const _canonical = (path: string): string =>
  `/${path.split('/').filter(Boolean).join('/')}`;

export var linksOf = (text: string): LinkRef[] => [
  ...[...text.matchAll(_ID)].map(
    (_): LinkRef => ({ kind: 'id', id: Number(_[1]), raw: _[0] })
  ),
  ...[...text.matchAll(_HREF)]
    .map((_) => (_[1] ?? _[2] ?? '').trim())
    .filter((_) => _.startsWith('/') && !_SKIP.test(_))
    .map(
      (raw): LinkRef => ({
        kind: 'path',
        path: _canonical(_decoded(raw.replace(/[?#].*$/, ''))),
        raw,
      })
    ),
];

/** Что стоит за адресом: страница, файл, переадресация или ничего. */
export type Target = 'ok' | 'broken' | 'unpublished' | 'redirected';

const _pagingBase = (path: string, segment: string): string | null =>
  ((match) => (match ? match[1] || '/' : null))(
    new RegExp(
      `^(.*)/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`
    ).exec(path)
  );

const _ofPage = (page: FactPage | undefined): Target =>
  page === undefined || page.trashed
    ? 'broken'
    : page.live
      ? 'ok'
      : 'unpublished';

export var classifyPath = (index: Indexed, path: string): Target => {
  const { facts } = index;
  const markdown = path.endsWith('.md')
    ? path === '/index.md'
      ? '/'
      : path.slice(0, -3)
    : null;
  const paged = _pagingBase(path, facts.pagingSegment);
  return path.startsWith('/media/')
    ? index.files.has(path.slice('/media/'.length))
      ? 'ok'
      : 'broken'
    : path.startsWith('/_cms/') ||
        path === '/manager' ||
        path.startsWith('/manager/') ||
        _DISCOVERY.has(path)
      ? 'ok'
      : markdown !== null
        ? classifyPath(index, markdown)
        : path === '/'
          ? facts.homePageId !== null &&
            index.byId.get(facts.homePageId)?.live === true
            ? 'ok'
            : 'broken'
          : index.livePaths.has(path)
            ? 'ok'
            : paged !== null && classifyPath(index, paged) === 'ok'
              ? 'ok'
              : facts.redirected(path) !== null ||
                  facts.movedFrom(path) !== null
                ? 'redirected'
                : _ofPage(index.allPaths.get(path));
};

export var classifyLink = (index: Indexed, link: LinkRef): Target =>
  link.kind === 'id'
    ? _ofPage(index.byId.get(link.id))
    : classifyPath(index, link.path);

/** Откуда ведут ссылки: тексты живых страниц, цели страниц-ссылок, формы. */
type Source = {
  readonly label: string;
  readonly text: string;
  readonly fix: { readonly href: string };
};

const _sources = (index: Indexed, say: CheckTexts): Source[] => [
  ...index.facts.pages
    .filter((_) => _.live)
    .map((_) => ({
      label: _shown(_),
      text:
        _.kind === 'link'
          ? /^\d+$/.test(_.linkTo)
            ? `[~${_.linkTo}~]`
            : `href="${_.linkTo}"`
          : _.content,
      fix: _pageFix(_.id),
    })),
  ...index.facts.forms.map((_) => ({
    label: say.form(_.title),
    text: _.source,
    fix: { href: `/forms/${_.name}` },
  })),
];

// Заголовок и пояснение находки — на языке менеджера.
const _said = (say: CheckTexts, id: SiteFindingId) => ({
  id,
  ...say.findings[id],
});

export var linkChecks = (index: Indexed, say: CheckTexts): Finding[] => {
  const found = _sources(index, say).flatMap((source) =>
    linksOf(source.text).map((link) => ({
      source,
      link,
      target: classifyLink(index, link),
    }))
  );
  const items = (target: Target): FindingItem[] =>
    found
      .filter((_) => _.target === target)
      .map((_) => ({
        label: _.source.label,
        detail: _.link.raw,
        fix: _.source.fix,
      }));
  return [
    ...finding(
      {
        ..._said(say, 'links.broken'),
        group: 'links',
        severity: 'error',
      },
      items('broken')
    ),
    ...finding(
      {
        ..._said(say, 'links.unpublished'),
        group: 'links',
        severity: 'warning',
      },
      items('unpublished')
    ),
    ...finding(
      {
        ..._said(say, 'links.redirected'),
        group: 'links',
        severity: 'warning',
      },
      items('redirected')
    ),
  ];
};

// --- страницы ---------------------------------------------------------------

const _TAG = /\[\[([A-Z][A-Za-z0-9]*)([^\]]*)\]\]/g;

const _visible = (index: Indexed): FactPage[] =>
  index.facts.pages.filter(
    (_) =>
      _.live &&
      _isHtml(_) &&
      _.searchable &&
      _.id !== index.facts.notFoundPageId
  );

/** Страницы, на которые есть ссылка или которые выводит список родителя: их найдут посетители. */
export var reachable = (
  index: Indexed,
  say: CheckTexts
): ReadonlySet<number> => {
  const { facts } = index;
  const texts = [
    ..._sources(index, say).map((_) => _.text),
    ...facts.settingValues.map((_) => (/^\d+$/.test(_) ? `[~${_}~]` : _)),
  ];
  const linked = texts
    .flatMap(linksOf)
    .flatMap((link) =>
      link.kind === 'id'
        ? [link.id]
        : ((page) => (page ? [page.id] : []))(index.livePaths.get(link.path))
    );
  // Список детей: шаблон страницы или компонент в её тексте; `parent=12` — список чужой ветки.
  const listed = facts.pages
    .filter((_) => _.live)
    .flatMap((page) => [
      ...(facts.listers.has(`template/${page.template}`) ? [page.id] : []),
      ...[...page.content.matchAll(_TAG)]
        .filter((_) => facts.listers.has(`component/${_[1]}`))
        .map((_) => {
          const parent = /\bparent\s*=\s*"?(\d+)/.exec(_[2] ?? '');
          return parent ? Number(parent[1]) : page.id;
        }),
    ]);
  const parents = new Set(listed);
  return new Set([
    ...linked,
    ...facts.pages
      .filter((_) => _.parentId !== null && parents.has(_.parentId))
      .map((_) => _.id),
  ]);
};

export var pageChecks = (index: Indexed, say: CheckTexts): Finding[] => {
  const { facts } = index;
  const visible = _visible(index);
  const titles = Map.groupBy(visible, (_) => _shown(_).trim().toLowerCase());
  const seen = reachable(index, say);
  const item = (page: FactPage, detail?: string): FindingItem => ({
    label: _shown(page),
    ...(detail ? { detail } : {}),
    fix: _pageFix(page.id),
  });
  const home =
    facts.homePageId === null ? null : index.byId.get(facts.homePageId);
  return [
    ...finding(
      {
        ..._said(say, 'pages.no_home'),
        group: 'pages',
        severity: 'error',
        fix: { href: '/settings?tab=site' },
      },
      facts.pages.length > 0 && home?.live !== true
        ? [
            {
              label: say.homePage,
              fix: { href: '/settings?tab=site' },
            },
          ]
        : []
    ),
    ...finding(
      {
        ..._said(say, 'pages.no_description'),
        group: 'pages',
        severity: 'warning',
      },
      visible
        .filter(
          (_) =>
            // Как в <head>: своё описание, у главной — описание сайта, иначе анонс.
            _.description.trim() === '' &&
            _.introText.trim() === '' &&
            !(_.id === facts.homePageId && facts.description.trim() !== '')
        )
        .map((_) => item(_))
    ),
    ...finding(
      {
        ..._said(say, 'pages.duplicate_titles'),
        group: 'pages',
        severity: 'warning',
      },
      [...titles.values()]
        .filter((_) => _.length > 1)
        .flatMap((group) =>
          group.map((_) => item(_, say.sameTitle(group.length - 1)))
        )
    ),
    ...finding(
      {
        ..._said(say, 'pages.orphans'),
        group: 'pages',
        severity: 'warning',
      },
      visible
        .filter(
          (_) =>
            _.hiddenFromMenu && _.id !== facts.homePageId && !seen.has(_.id)
        )
        .map((_) => item(_))
    ),
    ...finding(
      {
        ..._said(say, 'pages.long_title'),
        group: 'pages',
        severity: 'info',
      },
      visible
        .filter((_) => _shown(_).length > TITLE_LIMIT)
        .map((_) => item(_, say.chars(_shown(_).length)))
    ),
  ];
};

// --- медиа ------------------------------------------------------------------

const _VARIANT = /@\d+\.[a-z0-9]+$/;
const _MB = 1024 * 1024;
// Картинка, которую сайт отдаёт как есть, тяжелее мегабайта — медленная страница на телефоне.
const _HEAVY_IMAGE = _MB;
const _HEAVY_FILE = 10 * _MB;

const _size = (bytes: number, say: CheckTexts, language: string): string =>
  bytes >= _MB
    ? `${(bytes / _MB).toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${say.megabytes}`
    : `${Math.round(bytes / 1024).toLocaleString(language)} ${say.kilobytes}`;

const _stem = (path: string): string =>
  path.slice(0, path.lastIndexOf('.')).replace(/@\d+$/, '');

export var mediaChecks = (
  index: Indexed,
  say: CheckTexts,
  language: string
): Finding[] => {
  const files = index.facts.media;
  const resized = new Set(
    files.filter((_) => _VARIANT.test(_.path)).map((_) => _stem(_.path))
  );
  const originals = files.filter((_) => !_VARIANT.test(_.path));
  const fix = (path: string) => ({
    href: `/media?file=${encodeURIComponent(path)}`,
  });
  return [
    ...finding(
      {
        ..._said(say, 'media.no_alt'),
        group: 'media',
        severity: 'warning',
      },
      originals
        .filter(
          (_) => _.contentType.startsWith('image/') && _.alt.trim() === ''
        )
        .map((_) => ({ label: _.path, fix: fix(_.path) }))
    ),
    ...finding(
      {
        ..._said(say, 'media.heavy'),
        group: 'media',
        severity: 'warning',
      },
      originals
        .filter((_) =>
          _.contentType.startsWith('image/') &&
          _.contentType !== 'image/svg+xml'
            ? _.size > _HEAVY_IMAGE && !resized.has(_stem(_.path))
            : _.size > _HEAVY_FILE
        )
        .map((_) => ({
          label: _.path,
          detail: _size(_.size, say, language),
          fix: fix(_.path),
        }))
    ),
  ];
};

// --- настройки --------------------------------------------------------------

/** robots.txt запрещает всем роботам весь сайт: `User-agent: *` и `Disallow: /`. */
export var blocksEverything = (robots: string): boolean =>
  robots
    .split(/\r?\n/)
    .map((_) => _.replace(/#.*$/, '').trim())
    .reduce<{ star: boolean; blocked: boolean; agents: boolean }>(
      (state, line) =>
        ((match) =>
          match === null
            ? state
            : match[1]!.toLowerCase() === 'user-agent'
              ? {
                  ...state,
                  star: state.agents
                    ? state.star || match[2]!.trim() === '*'
                    : match[2]!.trim() === '*',
                  agents: true,
                }
              : {
                  ...state,
                  agents: false,
                  blocked:
                    state.blocked ||
                    (state.star &&
                      match[1]!.toLowerCase() === 'disallow' &&
                      match[2]!.trim() === '/'),
                })(/^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)),
      { star: false, blocked: false, agents: false }
    ).blocked;

export var settingsChecks = (index: Indexed, say: CheckTexts): Finding[] => {
  const { facts } = index;
  return [
    ...finding(
      {
        ..._said(say, 'settings.robots_block'),
        group: 'settings',
        severity: 'error',
        fix: { href: '/settings?tab=search' },
      },
      blocksEverything(facts.robots)
        ? [
            {
              label: 'robots.txt',
              detail: 'Disallow: /',
              fix: { href: '/settings?tab=search' },
            },
          ]
        : []
    ),
    ...finding(
      {
        ..._said(say, 'settings.no_site_url'),
        group: 'settings',
        severity: 'warning',
        fix: { href: '/settings?tab=search' },
      },
      facts.siteUrl.trim() === ''
        ? [{ label: say.siteUrl, fix: { href: '/settings?tab=search' } }]
        : []
    ),
    ...finding(
      {
        ..._said(say, 'settings.no_404'),
        group: 'settings',
        severity: 'warning',
        fix: { href: '/settings?tab=site' },
      },
      facts.pages.length > 0 &&
        (facts.notFoundPageId === null ||
          index.byId.get(facts.notFoundPageId)?.live !== true)
        ? [{ label: say.notFoundPage, fix: { href: '/settings?tab=site' } }]
        : []
    ),
    ...finding(
      {
        ..._said(say, 'settings.forms_silent'),
        group: 'settings',
        severity: 'warning',
        fix: { href: '/settings?tab=notify' },
      },
      facts.forms
        .filter((_) => _.channels.length === 0)
        .map((_) => ({
          label: say.form(_.title),
          fix: { href: `/forms/${_.name}` },
        }))
    ),
    ...finding(
      {
        ..._said(say, 'settings.undelivered'),
        group: 'settings',
        severity: 'warning',
        fix: { href: '/settings?tab=notify' },
      },
      facts.undelivered > 0
        ? [
            {
              label: say.notifications,
              detail: String(facts.undelivered),
              fix: { href: '/settings?tab=notify' },
            },
          ]
        : []
    ),
    ...finding(
      {
        ..._said(say, 'settings.ai_search_off'),
        group: 'settings',
        severity: 'info',
        fix: { href: '/settings?tab=search' },
      },
      facts.aiSearch
        ? []
        : [{ label: say.aiSearch, fix: { href: '/settings?tab=search' } }]
    ),
  ];
};
