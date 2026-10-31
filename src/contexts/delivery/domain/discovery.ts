// Находимость сайта: что видят поисковики и ИИ — sitemap.xml, robots.txt, llms.txt, SEO-разметка страницы.

const _xml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Перевод страницы для поисковиков: язык и адрес. */
export type Alternate = { readonly language: string; readonly url: string };

export type SitemapEntry = {
  readonly url: string;
  readonly lastmod: string;
  /** Переводы страницы, включая её саму; пусто — переводов нет. */
  readonly alternates?: readonly Alternate[];
};

const _xhtml = (alternates: readonly Alternate[]): string =>
  alternates
    .map(
      (_) =>
        `<xhtml:link rel="alternate" hreflang="${_xml(_.language)}" href="${_xml(_.url)}"/>`
    )
    .join('');

/** Карта сайта: адреса страниц для поиска, дата их последней правки и переводы. */
export var sitemapXml = (entries: readonly SitemapEntry[]): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    entries.some((_) => (_.alternates?.length ?? 0) > 0)
      ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
      : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (_) =>
        `  <url><loc>${_xml(_.url)}</loc><lastmod>${_.lastmod.slice(0, 10)}</lastmod>${_xhtml(_.alternates ?? [])}</url>`
    ),
    '</urlset>',
    '',
  ].join('\n');

// Боты ИИ по назначению: поиск с цитатами на сайт и сбор текстов для обучения моделей.
export var AI_SEARCH_BOTS: readonly string[] = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
];

export var AI_TRAINING_BOTS: readonly string[] = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
  'Bytespider',
];

export type RobotsPolicy = {
  readonly origin: string;
  readonly aiSearch: boolean;
  readonly aiTraining: boolean;
  readonly extra: string;
};

const _deny = (bots: readonly string[], why: string): string[] => [
  '',
  `# ${why}`,
  ...bots.flatMap((_) => [`User-agent: ${_}`]),
  'Disallow: /',
];

/** robots.txt: сайт открыт, менеджер закрыт; ботам ИИ — по настройкам сайта. */
export var robotsTxt = (policy: RobotsPolicy): string =>
  [
    'User-agent: *',
    'Disallow: /manager',
    ...(policy.aiSearch
      ? []
      : _deny(AI_SEARCH_BOTS, 'AI search and assistants are not allowed')),
    ...(policy.aiTraining
      ? []
      : _deny(AI_TRAINING_BOTS, 'AI model training is not allowed')),
    ...(policy.extra.trim() ? ['', policy.extra.trim()] : []),
    '',
    `Sitemap: ${policy.origin}/sitemap.xml`,
    '',
  ].join('\n');

export type LlmsPage = {
  readonly title: string;
  readonly url: string;
  readonly description: string;
  readonly depth: number;
};

export type LlmsSection = {
  readonly title: string;
  readonly pages: readonly LlmsPage[];
};

const _line = (page: LlmsPage): string =>
  `${'  '.repeat(page.depth)}- [${page.title.replaceAll(']', '\\]')}](${page.url})${page.description ? `: ${page.description}` : ''}`;

/** llms.txt (llmstxt.org): имя и описание сайта, разделы со ссылками на Markdown-версии страниц. */
export var llmsTxt = (site: {
  readonly name: string;
  readonly description: string;
  readonly sections: readonly LlmsSection[];
}): string =>
  [
    `# ${site.name}`,
    ...(site.description
      ? ['', `> ${site.description.replace(/\s+/g, ' ')}`]
      : []),
    ...site.sections
      .filter((_) => _.pages.length > 0)
      .flatMap((_) => ['', `## ${_.title}`, '', ..._.pages.map(_line)]),
    '',
  ].join('\n');

export type SeoPage = {
  readonly title: string;
  readonly description: string;
  /** Язык страницы (её ветки): у WebPage в JSON-LD. */
  readonly language: string;
  readonly url: string;
  readonly searchable: boolean;
  readonly image: string | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
  /** Предки от корня, для хлебных крошек в JSON-LD. */
  readonly trail: readonly { readonly title: string; readonly url: string }[];
  /** Постраничный список: соседние порции; null — списка нет или он в одну порцию. */
  readonly pagination?: {
    readonly number: number;
    readonly prev: string | null;
    readonly next: string | null;
  } | null;
  /** Переводы, включая саму страницу, исходная первой; пусто — переводов нет. */
  readonly alternates?: readonly Alternate[];
};

export type SeoSite = {
  readonly name: string;
  readonly description: string;
  /** Язык сайта — язык его описания: у WebSite в JSON-LD, на страницах любой ветки. */
  readonly language: string;
  readonly origin: string;
};

const _attr = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

// JSON внутри <script>: «</» не должно закрыть тег раньше времени.
const _json = (value: unknown): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c');

const _ld = (page: SeoPage, site: SeoSite): unknown => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${site.origin}/#website`,
      url: `${site.origin}/`,
      name: site.name,
      ...(site.description && { description: site.description }),
      inLanguage: site.language,
    },
    {
      '@type': 'WebPage',
      '@id': `${page.url}#webpage`,
      url: page.url,
      name: page.title,
      ...(page.description && { description: page.description }),
      isPartOf: { '@id': `${site.origin}/#website` },
      inLanguage: page.language,
      ...(page.publishedAt && { datePublished: page.publishedAt }),
      dateModified: page.updatedAt,
      ...(page.image && {
        primaryImageOfPage: { '@type': 'ImageObject', url: page.image },
      }),
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          ...page.trail,
          { title: page.title, url: page.url },
        ].map((_, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: _.title,
          item: _.url,
        })),
      },
    },
  ],
});

// Что уже есть в шаблоне, то не дублируется: разработчик может задать любой тег сам.
const _HAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/<link[^>]+rel=["']?canonical/i, 'canonical'],
  [/<meta[^>]+name=["']?description/i, 'description'],
  [/<meta[^>]+name=["']?robots/i, 'robots'],
  [/<meta[^>]+property=["']?og:/i, 'og'],
  [/<meta[^>]+name=["']?twitter:/i, 'twitter'],
  [/application\/ld\+json/i, 'ld'],
  [/<link[^>]+type=["']?text\/markdown/i, 'markdown'],
  [/<link[^>]+rel=["']?(?:prev|next)\b/i, 'pagination'],
  [/<link[^>]+hreflang=/i, 'hreflang'],
];

/** Теги находимости для <head>: canonical, описание, robots, Open Graph, Twitter, JSON-LD, Markdown-версия, переводы. */
export var seoHead = (
  page: SeoPage,
  site: SeoSite,
  existing: string
): string => {
  const has = new Set(_HAS.filter((_) => _[0].test(existing)).map((_) => _[1]));
  const tags: ReadonlyArray<readonly [string, string]> = [
    ['canonical', `<link rel="canonical" href="${_attr(page.url)}">`],
    [
      'description',
      page.description
        ? `<meta name="description" content="${_attr(page.description)}">`
        : '',
    ],
    ['robots', page.searchable ? '' : '<meta name="robots" content="noindex">'],
    [
      'og',
      [
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${_attr(site.name)}">`,
        `<meta property="og:title" content="${_attr(page.title)}">`,
        page.description
          ? `<meta property="og:description" content="${_attr(page.description)}">`
          : '',
        `<meta property="og:url" content="${_attr(page.url)}">`,
        page.image
          ? `<meta property="og:image" content="${_attr(page.image)}">`
          : '',
      ].join(''),
    ],
    [
      'twitter',
      `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}">`,
    ],
    [
      'ld',
      `<script type="application/ld+json">${_json(_ld(page, site))}</script>`,
    ],
    [
      'pagination',
      [
        page.pagination?.prev
          ? `<link rel="prev" href="${_attr(page.pagination.prev)}">`
          : '',
        page.pagination?.next
          ? `<link rel="next" href="${_attr(page.pagination.next)}">`
          : '',
      ].join(''),
    ],
    [
      'markdown',
      // У порций 2, 3… Markdown-версии нет: она одна, у самой страницы.
      page.searchable && (page.pagination?.number ?? 1) === 1
        ? `<link rel="alternate" type="text/markdown" href="${_attr(page.url === `${site.origin}/` ? `${site.origin}/index.md` : `${page.url}.md`)}">`
        : '',
    ],
    [
      // Переводы и x-default — исходная страница: её показывают тем, чей язык не подошёл ни к одному.
      'hreflang',
      page.searchable && (page.alternates?.length ?? 0) > 1
        ? [
            ...page.alternates!.map(
              (_) =>
                `<link rel="alternate" hreflang="${_attr(_.language)}" href="${_attr(_.url)}">`
            ),
            `<link rel="alternate" hreflang="x-default" href="${_attr(page.alternates![0]!.url)}">`,
          ].join('')
        : '',
    ],
  ];
  return tags
    .filter(({ 0: kind }) => !has.has(kind))
    .map((_) => _[1])
    .join('');
};

// Вес типа в Accept: `text/markdown;q=0.9` → 0,9; без q — 1; не назван — 0.
const _quality = (accept: string, type: string): number =>
  accept
    .split(',')
    .map((_) => _.trim().split(';'))
    .filter((_) => _[0]!.trim().toLowerCase() === type)
    .map((_) =>
      ((q) => (q === undefined ? 1 : Number(q.trim().slice(2)) || 0))(
        _.slice(1).find((part) => part.trim().startsWith('q='))
      )
    )
    .reduce((best, _) => Math.max(best, _), 0);

/**
 * Агент просит Markdown заголовком Accept: text/markdown назван и не ниже text/html. Браузеры его не
 * называют, `*\/*` у curl — тоже нет: им по-прежнему HTML.
 */
export var prefersMarkdown = (accept: string | null): boolean =>
  ((markdown) =>
    markdown > 0 && markdown >= _quality(accept ?? '', 'text/html'))(
    _quality(accept ?? '', 'text/markdown')
  );
