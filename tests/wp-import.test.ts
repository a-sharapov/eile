import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { definePaint } from '../src/cli/paint.ts';
import { runImportWp } from '../src/cli/wp-import.ts';
import { parseDump } from '../src/evo-import/sql-dump.ts';
import { importWordPress, type WpReport } from '../src/wp-import/import.ts';
import { attachmentsOf } from '../src/wp-import/media.ts';
import { siteFromDump, siteFromWxr } from '../src/wp-import/source.ts';
import { DEMO } from './fixtures/demo.ts';
import { picture } from './fixtures/images.ts';

// --- WXR ---------------------------------------------------------------------------------------

const cdata = (tag: string, value: string | number) =>
  `<${tag}><![CDATA[${value}]]></${tag}>`;
const meta = (key: string, value: string) =>
  `<wp:postmeta>${cdata('wp:meta_key', key)}${cdata('wp:meta_value', value)}</wp:postmeta>`;
const term = (domain: string, slug: string, name: string) =>
  `<category domain="${domain}" nicename="${slug}"><![CDATA[${name}]]></category>`;

type Item = {
  readonly id: number;
  readonly type: string;
  readonly status?: string;
  readonly title?: string;
  readonly slug?: string;
  readonly link?: string;
  readonly content?: string;
  readonly excerpt?: string;
  readonly parent?: number;
  readonly order?: number;
  readonly date?: string;
  readonly password?: string;
  readonly url?: string;
  readonly extra?: string;
};

const item = (_: Item) => `<item>
${cdata('title', _.title ?? '')}
<link>${_.link ?? `https://old.example.de/?p=${_.id}`}</link>
${cdata('dc:creator', 'anna')}
${cdata('content:encoded', _.content ?? '')}
${cdata('excerpt:encoded', _.excerpt ?? '')}
<wp:post_id>${_.id}</wp:post_id>
${cdata('wp:post_date', _.date ?? '2024-05-12 12:00:00')}
${cdata('wp:post_date_gmt', _.date ? _.date.replace(' 09:', ' 08:') : '2024-05-12 10:00:00')}
${cdata('wp:post_name', _.slug ?? '')}
${cdata('wp:status', _.status ?? 'publish')}
<wp:post_parent>${_.parent ?? 0}</wp:post_parent>
<wp:menu_order>${_.order ?? 0}</wp:menu_order>
${cdata('wp:post_type', _.type)}
${cdata('wp:post_password', _.password ?? '')}
${_.url ? cdata('wp:attachment_url', _.url) : ''}
${_.extra ?? ''}
</item>`;

const menuItem = (id: number, order: number, title: string, extra: string) =>
  item({
    id,
    type: 'nav_menu_item',
    title,
    slug: String(id),
    order,
    extra: term('nav_menu', 'haupt', 'Hauptmenü') + extra,
  });

const OLD = 'https://old.example.de';

const WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
<title>Küchen Studio</title>
<link>${OLD}</link>
<description>Küchen nach Maß</description>
<language>de-DE</language>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_site_url>${OLD}</wp:base_site_url>
<wp:base_blog_url>${OLD}</wp:base_blog_url>
<wp:author>${cdata('wp:author_login', 'anna')}${cdata('wp:author_email', 'anna@example.com')}${cdata('wp:author_display_name', 'Anna K.')}</wp:author>
<wp:category><wp:term_id>3</wp:term_id>${cdata('wp:category_nicename', 'tipps')}${cdata('wp:category_parent', '')}${cdata('wp:cat_name', 'Tipps')}</wp:category>
<wp:category><wp:term_id>4</wp:term_id>${cdata('wp:category_nicename', 'news')}${cdata('wp:category_parent', 'tipps')}${cdata('wp:cat_name', 'Neuigkeiten')}</wp:category>
<wp:tag><wp:term_id>5</wp:term_id>${cdata('wp:tag_slug', 'holz')}${cdata('wp:tag_name', 'Holz')}</wp:tag>
<wp:term><wp:term_id>6</wp:term_id>${cdata('wp:term_taxonomy', 'nav_menu')}${cdata('wp:term_slug', 'haupt')}${cdata('wp:term_name', 'Hauptmenü')}</wp:term>
${item({
  id: 2,
  type: 'page',
  title: 'Startseite',
  slug: 'startseite',
  link: `${OLD}/`,
  content: `<!-- wp:heading {"level":1} --><h1>Willkommen</h1><!-- /wp:heading -->
<!-- wp:paragraph --><p>Lesen Sie den <a href="${OLD}/2024/05/erster-beitrag/">ersten Beitrag</a> oder <a href="/?page_id=10">über uns</a>.</p><!-- /wp:paragraph -->
<!-- wp:image {"id":20} --><figure class="wp-block-image size-large"><img src="${OLD}/wp-content/uploads/2024/05/Kitchen-Foto-1024x768.jpg" alt="Unsere Küche" class="wp-image-20"/><figcaption>Die Ausstellung</figcaption></figure><!-- /wp:image -->
<!-- wp:latest-posts {"postsToShow":3} /-->`,
  extra: meta('_yoast_wpseo_metadesc', 'Küchen aus Berlin: %%sitedesc%%'),
})}
${item({
  id: 10,
  type: 'page',
  title: 'Über uns',
  slug: 'ueber-uns',
  link: `${OLD}/ueber-uns/`,
  order: 2,
  content: `Wir planen Küchen seit 1990.

[gallery ids="20,21" columns="2"]

[caption id="attachment_20" align="alignright" width="300"]<img class="size-medium wp-image-20" src="${OLD}/wp-content/uploads/2024/05/Kitchen-Foto-300x225.jpg" alt="" /> Unser Studio[/caption]

<h2>Team</h2>
Mehr im <a href="${OLD}/ueber-uns/team/">Team</a>.`,
  extra:
    meta('_yoast_wpseo_title', '%%title%% %%sep%% %%sitename%%') +
    meta('_yoast_wpseo_metadesc', 'Wer wir sind'),
})}
${item({ id: 11, type: 'page', status: 'draft', title: 'Team', slug: 'team', parent: 10, content: '<p>Bald.</p>' })}
${item({
  id: 12,
  type: 'page',
  title: 'Kontakt',
  slug: 'kontakt',
  link: `${OLD}/kontakt/`,
  order: 3,
  content: '<p>Schreiben Sie uns.</p>[contact-form-7 id="7" title="Kontakt"]',
  extra:
    meta('_yoast_wpseo_meta-robots-noindex', '1') +
    meta('_yoast_wpseo_title', 'Kontakt aufnehmen | Küchen Studio'),
})}
${item({
  id: 13,
  type: 'page',
  title: 'Küche',
  slug: 'k%c3%bcche',
  link: `${OLD}/k%c3%bcche/`,
  order: 4,
  content: '<p>Alles über Küchen.</p>\n\nhttps://youtu.be/dQw4w9WgXcQ',
})}
${item({
  id: 14,
  type: 'page',
  title: 'Planung',
  slug: 'planung',
  link: `${OLD}/planung/`,
  order: 5,
  content: '<p>fallback</p>',
  extra:
    meta('_elementor_edit_mode', 'builder') +
    meta(
      '_elementor_data',
      JSON.stringify([
        {
          elType: 'section',
          elements: [
            {
              elType: 'widget',
              widgetType: 'heading',
              settings: { title: 'So planen wir', header_size: 'h1' },
            },
            {
              elType: 'widget',
              widgetType: 'text-editor',
              settings: { editor: '<p>Gemeinsam mit Ihnen.</p>' },
            },
          ],
        },
      ])
    ),
})}
${item({ id: 15, type: 'page', title: 'Geheim', slug: 'geheim', link: `${OLD}/geheim/`, password: 'x', content: '<p>Nur mit Passwort.</p>' })}
${item({
  id: 30,
  type: 'post',
  title: 'Erster Beitrag',
  slug: 'erster-beitrag',
  link: `${OLD}/2024/05/erster-beitrag/`,
  excerpt: 'Unser erster Beitrag.',
  content: `<!-- wp:paragraph --><p>Hallo <strong>Welt</strong>. Siehe <a href="${OLD}/ueber-uns/#team">Team</a>, <a href="${OLD}/category/tipps/">Tipps</a> und <a href="${OLD}/gibts-nicht/">alt</a>.</p><!-- /wp:paragraph -->
<!-- wp:embed {"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","providerNameSlug":"youtube"} --><figure class="wp-block-embed"><div class="wp-block-embed__wrapper">https://www.youtube.com/watch?v=dQw4w9WgXcQ</div></figure><!-- /wp:embed -->`,
  extra:
    term('category', 'tipps', 'Tipps') +
    term('category', 'news', 'Neuigkeiten') +
    term('post_tag', 'holz', 'Holz') +
    meta('_thumbnail_id', '20') +
    meta('_yoast_wpseo_primary_category', '4'),
})}
${item({ id: 31, type: 'post', status: 'future', title: 'Geplant', slug: 'geplant', date: '2030-01-01 09:00:00', content: '<p>Kommt bald.</p>' })}
${item({ id: 32, type: 'post', status: 'private', title: 'Privat', slug: 'privat', content: '<p>Intern.</p>' })}
${item({
  id: 33,
  type: 'post',
  title: 'Zweiter Beitrag',
  slug: 'zweiter-beitrag',
  link: `${OLD}/2024/06/zweiter-beitrag/`,
  date: '2024-06-01 09:00:00',
  content: '<p>Ein ganz langer Text '.concat('Wort '.repeat(80), '</p>'),
  extra: term('category', 'tipps', 'Tipps'),
})}
${item({
  id: 20,
  type: 'attachment',
  status: 'inherit',
  title: 'Kitchen Foto',
  slug: 'kitchen-foto',
  link: `${OLD}/2024/05/erster-beitrag/kitchen-foto/`,
  parent: 30,
  url: `${OLD}/wp-content/uploads/2024/05/Kitchen-Foto.jpg`,
  extra:
    meta('_wp_attached_file', '2024/05/Kitchen-Foto.jpg') +
    meta('_wp_attachment_image_alt', 'Küche mit Insel') +
    meta(
      '_wp_attachment_metadata',
      'a:2:{s:4:"file";s:24:"2024/05/Kitchen-Foto.jpg";s:5:"sizes";a:1:{s:6:"medium";a:1:{s:4:"file";s:24:"Kitchen-Foto-300x225.jpg";}}}'
    ),
})}
${item({
  id: 21,
  type: 'attachment',
  status: 'inherit',
  title: 'Preisliste',
  slug: 'preisliste',
  link: `${OLD}/preisliste/`,
  url: `${OLD}/wp-content/uploads/2024/05/Preisliste-Ä.pdf`,
  extra: meta('_wp_attached_file', '2024/05/Preisliste-Ä.pdf'),
})}
${item({ id: 22, type: 'attachment', status: 'inherit', title: 'Film', slug: 'film', extra: meta('_wp_attached_file', '2024/05/film.exe') })}
${menuItem(40, 1, 'Home', meta('_menu_item_type', 'post_type') + meta('_menu_item_object', 'page') + meta('_menu_item_object_id', '2'))}
${menuItem(41, 2, '', meta('_menu_item_type', 'post_type') + meta('_menu_item_object', 'page') + meta('_menu_item_object_id', '10'))}
${menuItem(42, 3, 'Blog', meta('_menu_item_type', 'taxonomy') + meta('_menu_item_object', 'category') + meta('_menu_item_object_id', '3'))}
${menuItem(43, 4, 'Shop', meta('_menu_item_type', 'custom') + meta('_menu_item_url', 'https://shop.example.com/'))}
${menuItem(44, 5, 'Schreiben', meta('_menu_item_type', 'post_type') + meta('_menu_item_object', 'page') + meta('_menu_item_object_id', '12'))}
${item({ id: 50, type: 'revision', status: 'inherit', title: 'Über uns', slug: '10-revision-v1', parent: 10 })}
${item({ id: 60, type: 'product', title: 'Spüle', slug: 'spuele' })}
${item({ id: 61, type: 'post', status: 'trash', title: 'Weg', slug: 'weg__trashed' })}
</channel>
</rss>`;

// --- дамп MySQL ----------------------------------------------------------------------------------

const POST_COLUMNS =
  '`ID`,`post_author`,`post_date`,`post_date_gmt`,`post_content`,`post_title`,`post_excerpt`,`post_status`,`post_name`,`post_parent`,`menu_order`,`post_type`,`post_password`,`guid`,`post_mime_type`';

const sql = (value: string | number) =>
  typeof value === 'number'
    ? String(value)
    : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const row = (values: (string | number)[]) => `(${values.map(sql).join(',')})`;

const post = (
  id: number,
  type: string,
  status: string,
  title: string,
  slug: string,
  content = '',
  parent = 0,
  order = 0,
  date = '2023-03-04 10:00:00'
) =>
  row([
    id,
    1,
    date,
    date,
    content,
    title,
    '',
    status,
    slug,
    parent,
    order,
    type,
    '',
    `http://wp.test/?p=${id}`,
    '',
  ]);

const ACF_TEXT =
  'a:3:{s:4:"type";s:4:"text";s:4:"name";s:5:"title";s:5:"label";s:5:"Titel";}';
const ACF_AREA = 'a:2:{s:4:"type";s:8:"textarea";s:4:"name";s:4:"desc";}';
const ACF_IMAGE = 'a:2:{s:4:"type";s:5:"image";s:4:"name";s:4:"icon";}';
const LOCATIONS =
  'a:2:{s:18:"custom_css_post_id";i:-1;s:18:"nav_menu_locations";a:1:{s:7:"primary";i:9;}}';

const DUMP = `-- MySQL dump 10.13
CREATE TABLE \`wpx_options\` (
  \`option_id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`option_name\` varchar(191) NOT NULL DEFAULT '',
  \`option_value\` longtext NOT NULL,
  PRIMARY KEY (\`option_id\`)
);
INSERT INTO \`wpx_options\` (\`option_id\`,\`option_name\`,\`option_value\`) VALUES (1,'home','http://wp.test'),(2,'blogname','Holzwerk'),(3,'permalink_structure','/%category%/%postname%/'),(4,'show_on_front','page'),(5,'page_on_front','5'),(6,'page_for_posts','6'),(7,'WPLANG','ru_RU'),(8,'stylesheet','holz'),(9,'theme_mods_holz','${LOCATIONS}'),(10,'admin_email','owner@example.com'),(11,'category_base','rubrika');
INSERT INTO \`wpx_users\` (\`ID\`,\`user_login\`,\`user_email\`,\`user_pass\`,\`user_nicename\`,\`display_name\`) VALUES (1,'boss','boss@example.com','$P$secret','boss','Иван');
INSERT INTO \`wpx_posts\` (${POST_COLUMNS}) VALUES ${[
  post(5, 'page', 'publish', 'Главная', 'glavnaya', '<p>Добро пожаловать.</p>'),
  post(6, 'page', 'publish', 'Новости', 'news', '', 0, 2),
  post(7, 'page', 'publish', 'Услуги', 'uslugi', '', 0, 1),
  post(
    8,
    'post',
    'publish',
    'Шкаф',
    'shkaf',
    '<p>Сделали шкаф. <a href="http://wp.test/?page_id=7">Услуги</a>.</p>'
  ),
  post(16, 'acf-field', 'publish', 'Titel', 'field_title', ACF_TEXT),
  post(17, 'acf-field', 'publish', 'Desc', 'field_desc', ACF_AREA),
  post(18, 'acf-field', 'publish', 'Icon', 'field_icon', ACF_IMAGE),
  post(20, 'nav_menu_item', 'publish', '', '20', '', 0, 1),
  post(21, 'nav_menu_item', 'publish', 'Блог', '21', '', 0, 2),
  post(22, 'nav_menu_item', 'publish', '', '22', '', 0, 1),
].join(',')};
INSERT INTO \`wpx_postmeta\` (\`meta_id\`,\`post_id\`,\`meta_key\`,\`meta_value\`) VALUES ${[
  [1, 7, 'blocks_0_title', 'Мебель на заказ'],
  [2, 7, '_blocks_0_title', 'field_title'],
  [3, 7, 'blocks_0_desc', 'Из массива дуба.\n\nСрок — месяц.'],
  [4, 7, '_blocks_0_desc', 'field_desc'],
  [5, 7, 'blocks_0_icon', '30'],
  [6, 7, '_blocks_0_icon', 'field_icon'],
  [7, 7, 'rank_math_title', '%title% %sep% %sitename%'],
  [8, 7, 'rank_math_description', 'Мебель из дуба'],
  [9, 7, 'rank_math_robots', 'a:1:{i:0;s:7:"noindex";}'],
  [10, 20, '_menu_item_type', 'post_type'],
  [11, 20, '_menu_item_object_id', '7'],
  [12, 21, '_menu_item_type', 'post_type'],
  [13, 21, '_menu_item_object_id', '6'],
  [14, 22, '_menu_item_type', 'post_type'],
  [15, 22, '_menu_item_object_id', '5'],
]
  .map((_) => row(_))
  .join(',')};
INSERT INTO \`wpx_terms\` (\`term_id\`,\`name\`,\`slug\`) VALUES (2,'Мебель','mebel'),(9,'Главное','glavnoe');
INSERT INTO \`wpx_term_taxonomy\` (\`term_taxonomy_id\`,\`term_id\`,\`taxonomy\`,\`description\`,\`parent\`) VALUES (12,2,'category','',0),(19,9,'nav_menu','',0);
INSERT INTO \`wpx_term_relationships\` (\`object_id\`,\`term_taxonomy_id\`,\`term_order\`) VALUES (8,12,0),(20,19,0),(21,19,0),(22,19,0);
INSERT INTO \`wpx_comments\` (\`comment_ID\`,\`comment_post_ID\`,\`comment_author_email\`,\`comment_approved\`) VALUES (1,8,'x@example.com','1'),(2,8,'y@example.com','spam');
`;

// --- общее -------------------------------------------------------------------------------------

let uploads: string;

beforeAll(async () => {
  uploads = mkdtempSync(join(tmpdir(), 'cms-wp-uploads-'));
  mkdirSync(join(uploads, 'wp-content', 'uploads', '2024', '05'), {
    recursive: true,
  });
  await Bun.write(
    join(uploads, 'wp-content', 'uploads', '2024', '05', 'Kitchen-Foto.jpg'),
    await picture(1200, 900, 'jpeg')
  );
  await Bun.write(
    join(uploads, 'wp-content', 'uploads', '2024', '05', 'Preisliste-Ä.pdf'),
    '%PDF-1.4 test'
  );
});

afterAll(() => rmSync(uploads, { recursive: true, force: true }));

const get = (app: App, path: string) =>
  app.fetch(
    new Request(`http://localhost${encodeURI(path)}`, { redirect: 'manual' })
  );

const location = (app: App, path: string) =>
  get(app, path).then((_) =>
    `${_.status} ${_.headers.get('location') ?? ''}`.trim()
  );

describe('перенос из WXR в пустой сайт', () => {
  let app: App;
  let report: WpReport;

  beforeEach(async () => {
    app = createApp();
    report = await importWordPress(app, siteFromWxr(WXR), {
      into: null,
      media: { kind: 'dir', path: uploads },
      dryRun: false,
    });
  });

  afterEach(() => app.close());

  it('страницы с прежними id, деревом, ярлыками и статусами; личное и с паролем — черновики', () => {
    const page = (id: number) => app.content.drafts.page(id);
    expect(page(10)).toMatchObject({
      alias: 'ueber-uns',
      published: true,
      template: 'Page',
    });
    expect(page(11)).toMatchObject({ parentId: 10, published: false });
    expect(String(page(13).alias)).toBe('kueche');
    expect(page(15).published).toBe(false);
    expect(page(32).published).toBe(false);
    expect(page(31)).toMatchObject({
      published: false,
      publishAt: '2030-01-01T08:00:00.000Z',
    });
    expect(page(2).template).toBe('Home');
    expect(app.site.settings.get()).toMatchObject({
      name: 'Küchen Studio',
      language: 'de',
      homePageId: 2,
    });
    expect(report.pages).toMatchObject({
      total: 7,
      published: 5,
      drafts: 1,
      protected: 1,
    });
    expect(report.posts).toMatchObject({
      total: 4,
      published: 2,
      scheduled: 1,
      private: 1,
    });
    expect(report.skipped).toEqual([
      { type: 'revision', status: 'inherit', count: 1 },
      { type: 'product', status: 'publish', count: 1 },
      { type: 'post', status: 'trash', count: 1 },
    ]);
    expect(report.warnings).toEqual([]);
  });

  it('записи — в разделе с лентой, по дате; рубрики и метки — поля, обложка — из медиатеки', async () => {
    const section = report.section!;
    expect(section).toMatchObject({ title: 'Blog', created: true });
    const post = app.content.drafts.page(30);
    expect(post).toMatchObject({
      parentId: section.id,
      template: 'Post',
      hiddenFromMenu: true,
      publishedAt: '2024-05-12T10:00:00.000Z',
      introText: 'Unser erster Beitrag.',
      fields: {
        cover: 'uploads/2024/05/kitchen-foto.jpg',
        categories: 'Neuigkeiten, Tipps',
        tags: 'Holz',
      },
    });
    expect(app.content.drafts.page(33).introText).toEndWith('Wort…');
    const blog = await (await get(app, '/blog')).text();
    expect(blog.indexOf('Zweiter Beitrag')).toBeLessThan(
      blog.indexOf('Erster Beitrag')
    );
    expect(blog).not.toContain('Geplant');
  });

  it('текст: разрешённые теги, ссылки [~id~], картинки и видео — тегами компонентов', async () => {
    const home = app.content.drafts.page(2).content;
    expect(home).toContain('<h2>Willkommen</h2>');
    expect(home).toContain(
      '<a href="[~30~]">ersten Beitrag</a> oder <a href="[~10~]">über uns</a>'
    );
    expect(home).toContain(
      '[[Figure src="uploads/2024/05/kitchen-foto.jpg" alt="Unsere Küche" caption="Die Ausstellung"]]'
    );
    expect(home).toContain(
      `[[RecentPosts parent=${report.section!.id} count=3]]`
    );
    expect(app.content.drafts.page(10).content).toContain(
      '<a href="[~11~]">Team</a>'
    );
    expect(app.content.drafts.page(13).content).toContain(
      '[[Video url="https://youtu.be/dQw4w9WgXcQ"]]'
    );
    // В галерее только картинки: PDF из ids в неё не попадает, одна картинка — Figure.
    expect(app.content.drafts.page(10).content).toContain(
      '<p>Wir planen Küchen seit 1990.</p>\n[[Figure src="uploads/2024/05/kitchen-foto.jpg"]]'
    );
    expect(await (await get(app, '/kueche')).text()).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'
    );
    expect(app.content.drafts.page(30).content).toContain(
      `<a href="[~10~]#team">Team</a>, <a href="[~${report.section!.id}~]">Tipps</a>`
    );
    const all = app.content.drafts
      .tree()
      .map((_) => app.content.drafts.page(_.id).content)
      .join('\n');
    expect(all).not.toMatch(/<img|<h1|<table|<figure|class=/);
    const page = await (await get(app, '/')).text();
    expect(page).toContain('<figcaption');
    expect(page).toMatch(
      /<img src="\/media\/uploads\/2024\/05\/kitchen-foto\.jpg\?v=[0-9a-f]+"/
    );
    expect(report.content).toMatchObject({
      unresolved: ['/gibts-nicht/'],
      forms: ['contact-form-7'],
      shifted: true,
    });
  });

  it('конструктор: текст Elementor вместо запасного, в отчёте; SEO Yoast — длинный заголовок, описание, noindex', () => {
    expect(app.content.drafts.page(14).content).toBe(
      '<h2>So planen wir</h2>\n<p>Gemeinsam mit Ihnen.</p>'
    );
    expect(report.builders).toEqual([
      { id: 14, title: 'Planung', builder: 'Elementor', text: true },
    ]);
    expect(app.content.drafts.page(10)).toMatchObject({
      longTitle: '',
      description: 'Wer wir sind',
    });
    expect(app.content.drafts.page(12)).toMatchObject({
      longTitle: 'Kontakt aufnehmen',
      searchable: false,
    });
    expect(app.content.drafts.page(2).description).toBe(
      'Küchen aus Berlin: Küchen nach Maß'
    );
    expect(report.seo).toEqual({
      plugins: ['Yoast SEO'],
      titles: 1,
      descriptions: 2,
      noindex: 1,
    });
  });

  it('меню: порядок и подписи пунктов, раздел — на месте рубрики, свой адрес — ссылка, остальное скрыто', () => {
    const top = app.content.drafts
      .tree()
      .filter((_) => _.parentId === null && !_.hiddenFromMenu)
      .toSorted((a, b) => a.menuIndex - b.menuIndex);
    expect(top.map((_) => _.title)).toEqual([
      'Startseite',
      'Über uns',
      'Blog',
      'Shop',
      'Kontakt',
    ]);
    expect(app.content.drafts.page(2).menuTitle).toBe('Home');
    expect(app.content.drafts.page(12).menuTitle).toBe('Schreiben');
    expect(app.content.drafts.page(13).hiddenFromMenu).toBe(true);
    expect(top.find((_) => _.title === 'Shop')).toMatchObject({ kind: 'link' });
    expect(report.menu).toMatchObject({
      name: 'Hauptmenü',
      items: 5,
      links: 1,
    });
  });

  it('медиатека: файлы под uploads/ строчными латинскими путями, описание из alt, чужой тип — в отчёт', () => {
    const files = app.media.files.list().map((_) => String(_.path));
    expect(files).toContain('uploads/2024/05/kitchen-foto.jpg');
    expect(files).toContain('uploads/2024/05/preisliste-ae.pdf');
    expect(
      app.media.files
        .list()
        .find((_) => _.path === 'uploads/2024/05/kitchen-foto.jpg')?.alt
    ).toBe('Küche mit Insel');
    expect(report.media).toMatchObject({
      imported: 2,
      featured: 1,
      skipped: [{ file: '2024/05/film.exe', reason: 'type' }],
    });
  });

  it('прежние адреса ведут на новые: по дате, с умлаутом, ?p= и ?page_id=, рубрики, вложения, uploads', async () => {
    expect(await location(app, '/2024/05/erster-beitrag/')).toBe(
      '301 /blog/erster-beitrag'
    );
    expect(await location(app, '/?p=30&utm_source=x')).toBe(
      '301 /blog/erster-beitrag?utm_source=x'
    );
    expect(await location(app, '/?page_id=10')).toBe('301 /ueber-uns');
    expect(await location(app, '/küche/')).toBe('301 /kueche');
    expect(await location(app, '/category/tipps/news/')).toBe('301 /blog');
    expect(await location(app, '/tag/holz/')).toBe('301 /blog');
    expect(await location(app, '/2024/06/')).toBe('301 /blog');
    expect(await location(app, '/2024/05/erster-beitrag/kitchen-foto/')).toBe(
      '301 /media/uploads/2024/05/kitchen-foto.jpg'
    );
    expect(
      await location(app, '/wp-content/uploads/2024/05/Preisliste-Ä.pdf')
    ).toBe('301 /media/uploads/2024/05/preisliste-ae.pdf');
    expect(
      await location(app, '/wp-content/uploads/2024/05/Kitchen-Foto.jpg')
    ).toBe('301 /media/uploads/2024/05/Kitchen-Foto.jpg');
    expect(
      (await get(app, '/media/uploads/2024/05/Kitchen-Foto.jpg')).status
    ).toBe(200);
    expect(await location(app, '/ueber-uns/')).toBe('301 /ueber-uns');
    expect(report.redirects.skipped).toEqual([]);
  });

  it('варианты картинок делает сервер: после очереди у Figure есть srcset', async () => {
    await app.media.variants.run();
    expect(await (await get(app, '/')).text()).toMatch(
      /srcset="[^"]*kitchen-foto@960\.webp/
    );
  });
});

describe('медиатека со старого сайта', () => {
  it('картинки с одной основой (Kitchen-Foto.jpg и .png) получают разные основы: варианты не общие', () => {
    const site = siteFromWxr(
      WXR.replace(
        '</channel>',
        `${item({
          id: 23,
          type: 'attachment',
          status: 'inherit',
          title: 'Kitchen Foto PNG',
          slug: 'kitchen-foto-png',
          url: `${OLD}/wp-content/uploads/2024/05/Kitchen-Foto.png`,
          extra: meta('_wp_attached_file', '2024/05/Kitchen-Foto.png'),
        })}</channel>`
      )
    );
    expect(
      attachmentsOf(site)
        .list.filter((_) => _.path.includes('kitchen-foto'))
        .map((_) => _.path)
    ).toEqual([
      'uploads/2024/05/kitchen-foto.jpg',
      'uploads/2024/05/kitchen-foto-2.png',
    ]);
  });

  it('скачивает по адресу; 404 и больше 25 МБ — пропуск с причиной', async () => {
    const app = createApp();
    const asked: string[] = [];
    const jpeg = await picture(600, 400, 'jpeg');
    const net = ((url: string) => (
      asked.push(url),
      Promise.resolve(
        url.endsWith('Kitchen-Foto.jpg')
          ? new Response(jpeg)
          : url.includes('Preisliste')
            ? new Response('x', {
                headers: { 'content-length': String(30 * 1024 * 1024) },
              })
            : new Response('no', { status: 404 })
      )
    )) as unknown as typeof fetch;
    const report = await importWordPress(app, siteFromWxr(WXR), {
      into: null,
      media: { kind: 'url', base: 'https://old.example.de' },
      dryRun: false,
      fetch: net,
    });
    expect(asked).toContain(
      'https://old.example.de/wp-content/uploads/2024/05/Kitchen-Foto.jpg'
    );
    expect(asked).toContain(
      'https://old.example.de/wp-content/uploads/2024/05/Preisliste-%C3%84.pdf'
    );
    expect(report.media.imported).toBe(1);
    expect(report.media.skipped).toEqual([
      { file: '2024/05/film.exe', reason: 'type' },
      { file: '2024/05/Preisliste-Ä.pdf', reason: 'too-large' },
    ]);
    app.close();
  });

  it('без --media файлы не переносятся, картинки из текста — в отчёт', async () => {
    const app = createApp();
    const report = await importWordPress(app, siteFromWxr(WXR), {
      into: null,
      media: null,
      dryRun: false,
    });
    expect(app.media.files.list()).toEqual([]);
    expect(report.media).toMatchObject({ imported: 0, source: null });
    expect(report.content.images).toContain(
      `${OLD}/wp-content/uploads/2024/05/Kitchen-Foto-1024x768.jpg`
    );
    expect(app.content.drafts.page(2).content).not.toContain('[[Figure');
    app.close();
  });
});

describe('перенос под страницу живого сайта', () => {
  it('--into: id со сдвигом, шаблон страницы, лента тегом в тексте; правила и файлы не перезаписываются', async () => {
    const app = createApp({ scaffold: DEMO });
    const target = app.content.pages.create({
      title: 'Archiv',
      alias: 'archiv',
      template: 'Base',
      publish: true,
    });
    const before = app.content.drafts.tree().length;
    const shift = Math.max(...app.content.drafts.tree().map((_) => _.id));
    app.redirects.rules.create({ from: '/kontakt', to: '/kontakty' });
    const report = await importWordPress(app, siteFromWxr(WXR), {
      into: target,
      media: { kind: 'dir', path: uploads },
      dryRun: false,
    });
    expect(app.content.drafts.page(shift + 10)).toMatchObject({
      parentId: target,
      template: 'Base',
      alias: 'ueber-uns',
    });
    const section = app.content.drafts.page(report.section!.id);
    expect(section).toMatchObject({ parentId: target, template: 'Base' });
    expect(section.content).toContain('[[PostList perPage=10]]');
    expect(app.design.elements.get('component', 'PostList')).not.toBeNull();
    expect(await location(app, '/?p=30')).toBe(
      `301 /archiv/blog/erster-beitrag`
    );
    expect(report.redirects.skipped).toContainEqual({
      from: '/kontakt',
      reason: 'redirects.rule_exists',
    });
    expect(app.site.settings.get().name).not.toBe('Küchen Studio');
    expect(app.content.drafts.tree().length).toBeGreaterThan(before);
    await expect(
      importWordPress(app, siteFromWxr(WXR), {
        into: target,
        media: null,
        dryRun: false,
      })
    ).rejects.toMatchObject({ code: 'wp.into_not_empty' });
    await expect(
      importWordPress(app, siteFromWxr(WXR), {
        into: null,
        media: null,
        dryRun: false,
      })
    ).rejects.toMatchObject({ code: 'wp.not_empty' });
    app.close();
  });
});

describe('перенос из дампа MySQL', () => {
  let app: App;
  let report: WpReport;

  beforeEach(async () => {
    app = createApp();
    report = await importWordPress(app, siteFromDump(parseDump(DUMP)), {
      into: null,
      media: null,
      dryRun: false,
    });
  });

  afterEach(() => app.close());

  it('приставка находится сама; главная и страница записей — из настроек, язык — из WPLANG', () => {
    expect(app.site.settings.get()).toMatchObject({
      name: 'Holzwerk',
      language: 'ru',
      homePageId: 5,
    });
    expect(report.section).toMatchObject({
      id: 6,
      title: 'Новости',
      created: false,
    });
    expect(app.content.drafts.page(6).template).toBe('Blog');
    expect(app.content.drafts.page(8)).toMatchObject({
      parentId: 6,
      fields: { categories: 'Мебель' },
    });
    expect(app.content.drafts.page(8).content).toContain(
      '<a href="[~7~]">Услуги</a>'
    );
    expect(report.comments).toBe(1);
    expect(report.authors).toEqual([{ name: 'Иван', posts: 4 }]);
  });

  it('ACF: тексты полей по порядку, значки не идут в текст; Rank Math — описание и noindex', () => {
    expect(app.content.drafts.page(7).content).toBe(
      '<h2>Мебель на заказ</h2>\n<p>Из массива дуба.</p>\n<p>Срок — месяц.</p>'
    );
    expect(app.content.drafts.page(7)).toMatchObject({
      longTitle: '',
      description: 'Мебель из дуба',
      searchable: false,
    });
    expect(report.builders).toEqual([
      { id: 7, title: 'Услуги', builder: 'ACF', text: true },
    ]);
  });

  it('меню из места темы primary; адреса записей — по структуре с рубрикой, архив — по своей базе', async () => {
    const top = app.content.drafts
      .tree()
      .filter((_) => _.parentId === null && !_.hiddenFromMenu)
      .toSorted((a, b) => a.menuIndex - b.menuIndex);
    expect(top.map((_) => _.title)).toEqual(['Услуги', 'Главная', 'Новости']);
    expect(app.content.drafts.page(6).menuTitle).toBe('Блог');
    expect(await location(app, '/mebel/shkaf/')).toBe('301 /news/shkaf');
    expect(await location(app, '/rubrika/mebel/')).toBe('301 /news');
    expect(await location(app, '/?p=8')).toBe('301 /news/shkaf');
  });

  it('дамп Evo и не-WordPress — понятный отказ', () => {
    expect(() =>
      siteFromDump(parseDump("INSERT INTO `modx_site_content` VALUES (1,'x');"))
    ).toThrow(expect.objectContaining({ code: 'wp.evo_dump' }));
    expect(() =>
      siteFromDump(parseDump('INSERT INTO `x` VALUES (1);'))
    ).toThrow(expect.objectContaining({ code: 'wp.not_wordpress' }));
    expect(() => siteFromWxr('<?xml version="1.0"?><feed/>')).toThrow(
      expect.objectContaining({ code: 'wp.not_wxr' })
    );
  });
});

describe('cms import-wp', () => {
  let dir: string;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'cms-wp-cli-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (args: string[], options: Record<string, unknown>) => {
    const lines: string[] = [];
    return runImportWp({
      args,
      options: {
        port: '8080',
        help: false,
        version: false,
        passwordStdin: false,
        trustProxy: false,
        ...options,
      } as never,
      paint: definePaint(false),
      language: 'ru',
      tty: false,
      out: (_) => void lines.push(_),
    }).then(() => lines.join('\n'));
  };

  it('--dry-run не создаёт базу и не меняет существующую; затем перенос; повтор — отказ', async () => {
    const db = join(dir, 'site.db');
    await Bun.write(
      join(dir, 'wp.sql.gz'),
      Bun.gzipSync(new TextEncoder().encode(DUMP))
    );
    await Bun.write(join(dir, 'wp.xml'), WXR);
    const dry = await run([join(dir, 'wp.xml')], {
      db,
      dryRun: true,
      media: uploads,
    });
    expect(dry).toContain('Пробный прогон');
    expect(dry).toContain('формы плагинов: contact-form-7');
    expect(existsSync(db)).toBe(false);
    const done = await run([join(dir, 'wp.sql.gz')], { db, json: true });
    expect(JSON.parse(done)).toMatchObject({
      source: 'sql',
      pages: { total: 3 },
    });
    const pages = () =>
      ((app) => ((n) => (app.close(), n))(app.content.drafts.tree().length))(
        createApp({ databasePath: db })
      );
    const before = pages();
    const into = await run([join(dir, 'wp.xml')], {
      db,
      dryRun: true,
      into: '7',
      json: true,
    });
    expect(JSON.parse(into)).toMatchObject({
      dryRun: true,
      into: 7,
      pages: { total: 7 },
    });
    expect(pages()).toBe(before);
    await expect(run([join(dir, 'wp.xml')], { db })).rejects.toMatchObject({
      code: 'wp.not_empty',
    });
    await expect(run([join(dir, 'nope.xml')], { db })).rejects.toThrow(
      'Нет файла'
    );
    await expect(
      run([join(dir, 'wp.xml')], { db: join(dir, 'x.db'), into: 'abc' })
    ).rejects.toThrow('--into — id страницы');
    expect(existsSync(join(dir, 'x.db'))).toBe(false);
  });
});
