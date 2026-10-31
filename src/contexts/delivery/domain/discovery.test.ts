import { describe, expect, it } from 'bun:test';
import {
  llmsTxt,
  prefersMarkdown,
  robotsTxt,
  seoHead,
  sitemapXml,
} from './discovery.ts';

const site = {
  name: 'Сайт',
  description: 'О чём сайт',
  language: 'ru',
  origin: 'https://site.ru',
};

const page = {
  title: 'Контакты',
  description: 'Как связаться',
  language: 'ru',
  url: 'https://site.ru/kontakty',
  searchable: true,
  image: 'https://site.ru/media/c.jpg',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  trail: [],
};

describe('находимость', () => {
  it('sitemap.xml экранирует адреса и берёт дату правки', () => {
    expect(
      sitemapXml([
        { url: 'https://site.ru/a?b&c', lastmod: '2026-10-02T10:00:00Z' },
      ])
    ).toContain(
      '<url><loc>https://site.ru/a?b&amp;c</loc><lastmod>2026-10-02</lastmod></url>'
    );
  });

  it('robots.txt закрывает менеджер и ботов ИИ по настройкам', () => {
    const open = robotsTxt({
      origin: 'https://site.ru',
      aiSearch: true,
      aiTraining: true,
      extra: '',
    });
    expect(open).toBe(
      'User-agent: *\nDisallow: /manager\n\nSitemap: https://site.ru/sitemap.xml\n'
    );
    const closed = robotsTxt({
      origin: 'https://site.ru',
      aiSearch: true,
      aiTraining: false,
      extra: 'Disallow: /tmp',
    });
    expect(closed).toContain('User-agent: GPTBot\nUser-agent: ClaudeBot');
    expect(closed).not.toContain('OAI-SearchBot');
    expect(closed).toContain('Disallow: /tmp');
  });

  it('llms.txt — заголовок, описание и разделы со ссылками', () => {
    expect(
      llmsTxt({
        name: 'Сайт',
        description: 'О чём\nсайт',
        sections: [
          {
            title: 'Страницы',
            pages: [
              {
                title: 'Главная',
                url: 'https://site.ru/index.md',
                description: '',
                depth: 0,
              },
              {
                title: 'Команда',
                url: 'https://site.ru/o/komanda.md',
                description: 'Кто мы',
                depth: 1,
              },
            ],
          },
          { title: 'Пусто', pages: [] },
        ],
      })
    ).toBe(
      '# Сайт\n\n> О чём сайт\n\n## Страницы\n\n- [Главная](https://site.ru/index.md)\n  - [Команда](https://site.ru/o/komanda.md): Кто мы\n'
    );
  });

  it('SEO-шапка: canonical, Open Graph, JSON-LD; что есть в шаблоне — не дублируется', () => {
    const head = seoHead(
      page,
      site,
      '<meta name="description" content="своё">'
    );
    expect(head).toContain(
      '<link rel="canonical" href="https://site.ru/kontakty">'
    );
    expect(head).not.toContain('name="description"');
    expect(head).toContain(
      '<meta property="og:image" content="https://site.ru/media/c.jpg">'
    );
    expect(head).toContain('"@type":"BreadcrumbList"');
    expect(head).toContain('href="https://site.ru/kontakty.md"');
    expect(seoHead({ ...page, searchable: false }, site, '')).toContain(
      '<meta name="robots" content="noindex">'
    );
    expect(seoHead({ ...page, title: '</script>' }, site, '')).not.toContain(
      '"name":"</script>"'
    );
  });

  it('JSON-LD: у сайта — язык сайта и его описания, у страницы — язык её ветки', () => {
    const graph = (head: string) =>
      JSON.parse(
        head.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]!
      )['@graph'] as { '@type': string; inLanguage?: string }[];
    const [website, webpage] = graph(
      seoHead({ ...page, language: 'en' }, site, '')
    );
    expect([website!['@type'], website!.inLanguage]).toEqual(['WebSite', 'ru']);
    expect([webpage!['@type'], webpage!.inLanguage]).toEqual(['WebPage', 'en']);
  });
});

it('Markdown по Accept: только если text/markdown не ниже text/html', () => {
  expect(prefersMarkdown('text/markdown')).toBe(true);
  expect(prefersMarkdown('text/markdown, text/html;q=0.9, */*;q=0.8')).toBe(
    true
  );
  expect(prefersMarkdown('text/markdown, text/html')).toBe(true);
  expect(prefersMarkdown('text/html, text/markdown;q=0.5')).toBe(false);
  expect(
    prefersMarkdown(
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    )
  ).toBe(false);
  expect(prefersMarkdown('*/*')).toBe(false);
  expect(prefersMarkdown('text/markdown;q=0')).toBe(false);
  expect(prefersMarkdown(null)).toBe(false);
});
