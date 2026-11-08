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

describe('поля страницы в индексе', () => {
  it('ищет по тексту полей, а в отрывок не пускает JSON, выбор, флаги и умолчания', () => {
    app.content.fields.save({
      name: 'params',
      label: 'Параметры',
      type: 'text',
      templates: ['Base'],
    });
    app.content.fields.save({
      name: 'subheading',
      label: 'Подзаголовок',
      type: 'text',
      defaultValue: 'Смотреть ещё цвета ([+rows.total+])',
      templates: ['Base'],
    });
    app.content.fields.save({
      name: 'feed',
      label: 'Фид',
      type: 'select',
      options: ['Да', 'Нет'],
      templates: ['Base'],
    });
    const id = page('Памятник АП-2152', '<p>Стела.</p>', {
      fields: {
        params: JSON.stringify({
          fieldValue: [
            {
              name: 'Камень:',
              value: 'Габбро-диабаз',
              image: 'assets/images/a.jpg',
            },
          ],
          fieldSettings: { autoincrement: 1 },
        }),
        feed: 'Да',
      },
    });
    expect(find('габбро').map((_) => _.id)).toEqual([id]);
    const snippet = find('габбро')[0]!.snippet;
    expect(snippet).not.toContain('fieldValue');
    expect(snippet).not.toContain('{');
    expect(snippet).not.toContain('assets/images');
    // Умолчание одинаково на всех страницах: по нему страница не находится.
    expect(find('цвета')).toEqual([]);
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

describe('фразы, синонимы и опечатки', () => {
  it('фраза в кавычках — слова подряд, в любых формах', () => {
    page('Белая кухня', '<p>Белая кухня из дуба для маленькой квартиры.</p>');
    page('Кухня и белая плитка', '<p>Кухня с плиткой: белая, глянцевая.</p>');
    expect(titles('белая кухня').toSorted()).toEqual([
      'Белая кухня',
      'Кухня и белая плитка',
    ]);
    expect(titles('"белой кухни"')).toEqual(['Белая кухня']);
    expect(titles('«белая кух')).toEqual(['Белая кухня']);
  });

  it('синоним из настроек находит страницу без этого слова; в отрывке — найденное слово', () => {
    page('Мягкая мебель', '<p>Диваны и кресла на заказ.</p>');
    expect(titles('софа')).toEqual([]);
    app.site.settings.update({ searchSynonyms: 'диван, софа\nкресло, стул' });
    const found = find('софу');
    expect(found.map((_) => _.title)).toEqual(['Мягкая мебель']);
    expect(found[0]!.snippet).toContain('<mark>Диваны</mark>');
  });

  it('опечатка: ничего не нашлось — выдача по исправленному запросу, слово — как на странице', () => {
    page('Каталог кухонь', '<p>Весь каталог фасадов и столешниц.</p>');
    const result = app.search.search('ктаалог фасадв', { language: 'ru' });
    expect(result.hits.map((_) => _.title)).toEqual(['Каталог кухонь']);
    expect(result.corrected).toBe('каталог фасадов');
    expect(result.hits[0]!.snippet).toContain('<mark>');
    // Нашлось без исправлений — исправления нет; нет и похожих слов — пусто.
    expect(
      app.search.search('каталог', { language: 'ru' }).corrected
    ).toBeNull();
    expect(app.search.search('зебра', { language: 'ru' })).toMatchObject({
      total: 0,
      corrected: null,
    });
  });

  it('новые слова индекса — в исправлениях сразу', () => {
    expect(app.search.search('терракота', { language: 'ru' }).total).toBe(0);
    page('Цвета', '<p>Терракотовый и оливковый.</p>');
    expect(app.search.search('теракотовый', { language: 'ru' }).corrected).toBe(
      'терракотовый'
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

// Поиск — у каркасов со страницей выдачи; у сайта студии из девяти страниц его нет.
describe.each(
  SCAFFOLDS.filter((_) => _.settings?.searchPage !== undefined).map(
    (_) => [_.name, _] as const
  )
)('поиск в каркасе %s', (_name, scaffold) => {
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
});
