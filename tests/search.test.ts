import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { SCAFFOLDS } from '../src/scaffolds/index.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const find = (query: string, language = 'ru') =>
  app.search.search(query, { language }).hits;

const titles = (query: string, language = 'ru') =>
  find(query, language).map((_) => _.title);

const page = (title: string, content: string, extra = {}) =>
  app.content.pages.create({
    title,
    template: 'Base',
    content,
    publish: true,
    ...extra,
  });

const client = (address: string) => ({
  requestIP: () => ({ address }),
});

const get = (path: string, from = '10.0.0.1') =>
  app.fetch(new Request(`http://localhost${path}`), client(from));

describe('индекс', () => {
  it('страница попадает в поиск при публикации и уходит при снятии, корзине и удалении', () => {
    const id = page(
      'Записки читателя',
      '<p>Медленное чтение с карандашом.</p>'
    );
    expect(titles('карандаш')).toEqual(['Записки читателя']);
    app.content.pages.edit(id, { content: '<p>Теперь про тетради.</p>' });
    expect(titles('карандаш')).toEqual([]);
    expect(titles('тетрадь')).toEqual(['Записки читателя']);
    app.content.pages.unpublish(id);
    expect(titles('тетрадь')).toEqual([]);
    app.content.pages.publish(id);
    app.content.pages.trash(id);
    expect(titles('тетрадь')).toEqual([]);
    app.content.pages.restore(id);
    expect(titles('тетрадь')).toEqual(['Записки читателя']);
  });

  it('корзина раздела снимает и его потомков, восстановление возвращает', () => {
    const section = page('Раздел', '<p>Обычный текст.</p>');
    const child = app.content.pages.create({
      parentId: section,
      title: 'Вложенная',
      template: 'Base',
      content: '<p>Глиняный кувшин.</p>',
      publish: true,
    });
    expect(find('кувшин').map((_) => _.id)).toEqual([child]);
    app.content.pages.trash(section);
    expect(find('кувшин')).toEqual([]);
    app.content.pages.restore(section);
    expect(find('кувшин').map((_) => _.id)).toEqual([child]);
  });

  it('формы слова находят друг друга, префикс — недописанное слово', () => {
    page('Библиотека', '<p>Здесь лежит одна книга.</p>');
    expect(titles('книги')).toEqual(['Библиотека']);
    expect(titles('книгами')).toEqual(['Библиотека']);
    expect(titles('библиот')).toEqual(['Библиотека']);
  });

  it('заголовок весит больше текста', () => {
    page('Про текст', '<p>Глазурь, глазурь и ещё раз глазурь.</p>');
    page('Глазурь', '<p>Коротко.</p>');
    expect(titles('глазурь')).toEqual(['Глазурь', 'Про текст']);
  });

  it('теги компонентов, модулей и скрипты в индекс не попадают', () => {
    page(
      'Теги',
      '<p>Видимый текст.</p>[[Callout title="скрытоеслово"]][#Form:секретформа]<script>скриптовоеслово()</script>'
    );
    expect(titles('видимый')).toEqual(['Теги']);
    expect(titles('скрытоеслово')).toEqual([]);
    expect(titles('секретформа')).toEqual([]);
    expect(titles('скриптовоеслово')).toEqual([]);
  });

  it('скрытые от поисковиков страницы, 404 и чужой язык — не в выдаче', () => {
    page('Секрет', '<p>Слово невидимка.</p>', { searchable: false });
    page('English', '<p>Invisible word невидимка.</p>', { language: 'en' });
    expect(titles('невидимка')).toEqual([]);
    expect(titles('невидимка', 'en')).toEqual(['English']);
    expect(titles('invisible', 'en')).toEqual(['English']);
    expect(titles('такой')).toEqual([]);
  });

  it('отрывок экранирован: разметка из текста страницы не исполняется', () => {
    page(
      'Опасный',
      '<p>Сравнение: a &lt; b, и &lt;img onerror=x&gt; рядом с утюгом.</p>'
    );
    const { 0: hit } = find('утюг');
    expect(hit!.snippet).toContain('<mark>утюгом</mark>');
    expect(hit!.snippet).toContain('&lt;img onerror=x&gt;');
    expect(hit!.snippet).not.toContain('<img');
  });

  it('индекс строится заново, если его сбросили, и после восстановления копии', async () => {
    page('Чайник', '<p>Медный чайник.</p>');
    app.search.invalidate();
    expect(titles('чайник')).toEqual(['Чайник']);
    const archive = new TextEncoder().encode(JSON.stringify(app.archive()));
    const other = createApp({ scaffold: DEMO });
    await other.restore(archive);
    expect(
      other.search.search('медный', { language: 'ru' }).hits.map((_) => _.title)
    ).toEqual(['Чайник']);
    other.close();
  });
});

describe('выдача на сайте', () => {
  it('$core.search в шаблоне: страница сбрасывается из кэша при новой странице', async () => {
    app.design.templates.save(
      'Found',
      "<script>import { search } from '$core'; let { page } = $props();</script><p>Найдено: {search('кувшин').total}</p>"
    );
    app.content.pages.create({
      title: 'Счётчик',
      alias: 'counter',
      template: 'Found',
      publish: true,
    });
    const html = () => get('/counter').then((_) => _.text());
    expect(await html()).toContain('Найдено: 0');
    page('Кувшин', '<p>Кувшин.</p>');
    expect(await html()).toContain('Найдено: 1');
  });

  it('регион SearchResults: запрос из адреса, отрывки и пейджер; страница вокруг — из кэша', async () => {
    Array.from({ length: 12 }, (_, n) =>
      page(`Чашка ${n + 1}`, '<p>Фарфоровая чашка ручной работы.</p>')
    );
    app.design.templates.save(
      'Search',
      '<script>import Uncached from \'$core/Uncached\'; let { page } = $props();</script><h1>{page.title}</h1><Uncached name="SearchResults" props={{ perPage: 5 }} />'
    );
    app.content.pages.create({
      title: 'Поиск',
      alias: 'search',
      template: 'Search',
      hiddenFromMenu: true,
      searchable: false,
      publish: true,
    });
    const first = await get('/search?q=%D1%87%D0%B0%D1%88%D0%BA%D0%B8');
    const html = await first.text();
    expect(html).toContain('Найдено: 12');
    expect(html).toContain('<mark>чашка</mark>');
    expect(html).toContain(
      'href="/search?q=%D1%87%D0%B0%D1%88%D0%BA%D0%B8&amp;page=2"'
    );
    const second = await get('/search?q=%D1%87%D0%B0%D1%88%D0%BA%D0%B8&page=3');
    expect(await second.text()).toContain('aria-current="page">3<');
    expect(second.headers.get('x-cache')).toBe('hit');
    expect(await (await get('/search')).text()).toContain(
      'Введите слово или фразу'
    );
  });
});

describe('GET /_cms/search', () => {
  it('JSON: адреса, заголовки, отрывки; не кэшируется', async () => {
    page('Глиняная ваза', '<p>Ваза из красной глины.</p>', { alias: 'vaza' });
    const response = await get('/_cms/search?q=%D0%B2%D0%B0%D0%B7%D1%8B');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      total: number;
      items: { title: string; url: string; snippet: string }[];
    };
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      title: 'Глиняная ваза',
      url: '/vaza',
    });
    expect(body.items[0]!.snippet).toContain('<mark>Ваза</mark>');
  });

  it('только GET, и не чаще 60 запросов в минуту с одного адреса', async () => {
    expect(
      (
        await app.fetch(
          new Request('http://localhost/_cms/search?q=x', { method: 'POST' }),
          client('10.0.0.2')
        )
      ).status
    ).toBe(405);
    const statuses = await Promise.all(
      Array.from({ length: 61 }, () =>
        get('/_cms/search?q=x', '10.0.0.3').then((_) => _.status)
      )
    );
    expect(statuses.filter((_) => _ === 200)).toHaveLength(60);
    expect(statuses.at(-1)).toBe(429);
    expect((await get('/_cms/search?q=x', '10.0.0.4')).status).toBe(200);
  });
});

describe.each(SCAFFOLDS.map((_) => [_.name, _] as const))(
  'поиск в каркасе %s',
  (_name, scaffold) => {
    it('поле в шапке и страница выдачи находят текст каркаса', async () => {
      const site = createApp({ scaffold });
      const html = await site
        .fetch(new Request('http://localhost/'))
        .then((_) => _.text());
      expect(html).toContain('role="search"');
      const action = html.match(/role="search"[^>]*action="([^"]+)"/)?.[1];
      expect(action).toBeTruthy();
      // Длинное слово из текста главной: его каркас точно содержит.
      const word = site.content.drafts
        .view(site.site.settings.get().homePageId!)!
        .content.replace(/<[^>]*>|\[\[[^\]]*\]\]/g, ' ')
        .match(/[а-яё]{6,}/i)![0];
      const found = await site
        .fetch(
          new Request(`http://localhost${action}?q=${encodeURIComponent(word)}`)
        )
        .then((_) => _.text());
      expect(found).toContain('<mark>');
      expect(found).not.toMatch(/\[\[|\[#|@\{/);
      site.close();
    });
  }
);
