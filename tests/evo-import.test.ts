import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { convertElement } from '../src/evo-import/convert.ts';
import { type ImportReport, importEvo } from '../src/evo-import/import.ts';
import { parseDump } from '../src/evo-import/sql-dump.ts';
import { DEMO } from './fixtures/demo.ts';

const DUMP = `
-- MySQL dump 10.13
CREATE TABLE \`modx_site_content\` (
  \`id\` int(10) NOT NULL AUTO_INCREMENT,
  \`type\` varchar(20) NOT NULL DEFAULT 'document',
  \`pagetitle\` varchar(255) NOT NULL DEFAULT '',
  \`longtitle\` varchar(255) NOT NULL DEFAULT '',
  \`description\` varchar(255) NOT NULL DEFAULT '',
  \`alias\` varchar(245) DEFAULT '',
  \`published\` int(1) NOT NULL DEFAULT '0',
  \`pub_date\` int(20) NOT NULL DEFAULT '0',
  \`unpub_date\` int(20) NOT NULL DEFAULT '0',
  \`parent\` int(10) NOT NULL DEFAULT '0',
  \`introtext\` text,
  \`content\` mediumtext,
  \`template\` int(10) NOT NULL DEFAULT '0',
  \`menuindex\` int(10) NOT NULL DEFAULT '0',
  \`cacheable\` int(1) NOT NULL DEFAULT '1',
  \`deleted\` int(1) NOT NULL DEFAULT '0',
  \`menutitle\` varchar(255) NOT NULL DEFAULT '',
  \`hidemenu\` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`modx_site_content\` VALUES (1,'document','Главная','','','index',1,0,0,0,NULL,'<p>Добро пожаловать. {{promo? &text=\`Скидки\`}}</p>',3,0,1,0,'',0),(2,'document','О компании','','Мы — это мы','about',1,0,0,0,'','<p>Связь: <a href=\\"[~5~]\\">контакты</a>. [[Wayfinder? &startId=\`0\`]]</p>',3,1,1,0,'Компания',0),(5,'document','Контакты','','','contacts',1,0,0,2,'','<p>Пишите нам.</p>',3,0,1,0,'',0),(6,'reference','Наш GitHub','','','github',1,0,0,0,'','https://github.com/',0,2,1,0,'',0),(7,'document','Старое','','','old',0,0,0,0,'','<p>x</p>',0,3,1,1,'',0);
CREATE TABLE \`modx_site_templates\` (
  \`id\` int(10) NOT NULL AUTO_INCREMENT,
  \`templatename\` varchar(50) NOT NULL DEFAULT '',
  \`content\` mediumtext,
  PRIMARY KEY (\`id\`)
);
INSERT INTO \`modx_site_templates\` VALUES (3,'Main template','<!DOCTYPE html>\\n<html>\\n<head>\\n<title>[*pagetitle*] | [(site_name)]</title>\\n<script>var cfg = {a: 1};</script>\\n</head>\\n<body class=\\"x\\">\\n{{header}}\\n<h1>[*longtitle*]</h1>\\n[*content*]\\n<p class=\\"banner\\">[*banner*]</p>\\n[!Cart!]\\n</body>\\n</html>');
CREATE TABLE \`modx_site_htmlsnippets\` (
  \`id\` int(10) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(50) NOT NULL DEFAULT '',
  \`snippet\` mediumtext,
  PRIMARY KEY (\`id\`)
);
INSERT INTO \`modx_site_htmlsnippets\` VALUES (1,'header','<header>[(site_name)]</header>'),(2,'promo','<b class=\\"promo\\">[+text+]</b>');
INSERT INTO \`modx_site_tmplvars\` (\`id\`,\`type\`,\`name\`,\`caption\`,\`elements\`,\`default_text\`) VALUES (1,'text','banner','Баннер','','@INHERIT'),(2,'number','price','Цена','','0');
INSERT INTO \`modx_site_tmplvar_templates\` (\`tmplvarid\`,\`templateid\`) VALUES (1,3),(2,3);
INSERT INTO \`modx_site_tmplvar_contentvalues\` (\`tmplvarid\`,\`contentid\`,\`value\`) VALUES (1,2,'Летняя распродажа'),(2,5,'1500');
INSERT INTO \`modx_system_settings\` (\`setting_name\`,\`setting_value\`) VALUES ('site_name','Моя компания'),('site_start','1'),('error_page','1');
`;

let app: App;
let report: ImportReport;

beforeEach(() => {
  app = createApp();
  report = importEvo(app, parseDump(DUMP));
});

afterEach(() => app.close());

const html = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`)).then((_) => _.text());

describe('дамп MySQL', () => {
  it('строки по колонкам CREATE TABLE и списка в INSERT, с экранированием', () => {
    const tables = parseDump(DUMP);
    const pages = tables.get('modx_site_content')!;
    expect(pages.length).toBe(5);
    expect(pages[1]).toMatchObject({
      id: 2,
      pagetitle: 'О компании',
      parent: 0,
    });
    expect(String(pages[1]!.content)).toContain('<a href="[~5~]">');
    expect(tables.get('modx_site_tmplvars')![0]).toMatchObject({
      name: 'banner',
      default_text: '@INHERIT',
    });
  });
});

describe('перенос с Evo', () => {
  it('отчёт: что перенесено и какие сниппеты переписать', () => {
    expect(report).toMatchObject({
      pages: 5,
      templates: 1,
      components: 2,
      fields: 2,
      values: 2,
      snippets: ['Cart', 'Wayfinder'],
    });
    expect(report.warnings).toEqual([]);
  });

  it('id и дерево сохраняются, ссылки [~id~] ведут по текущему адресу', async () => {
    expect(app.content.published.byPath('/about/contacts')?.id).toBe(5);
    expect(app.content.drafts.page(2).content).toContain('href="[~5~]"');
    expect(await html('/about')).toContain(
      '<a href="/about/contacts">контакты</a>'
    );
    app.content.pages.move(5, null);
    expect(await html('/about')).toContain('<a href="/contacts">контакты</a>');
  });

  it('шаблон собран из чанков, настроек и полей; скобки JS не ломают Svelte', async () => {
    const page = await html('/about');
    expect(page).toContain('<title>О компании | Моя компания</title>');
    expect(page).toContain('<script>var cfg = {a: 1};</script>');
    expect(page).toContain('<header>Моя компания</header>');
    expect(page).toContain('<p class="banner">Летняя распродажа</p>');
    expect(page).toContain('<!-- Evo snippet: [[Wayfinder? &startId=`0`]] -->');
  });

  it('TV с @INHERIT наследуется, чанк с параметром — компонент в контенте', async () => {
    expect(await html('/about/contacts')).toContain(
      '<p class="banner">Летняя распродажа</p>'
    );
    expect(await html('/')).toContain('<b class="promo">Скидки</b>');
    expect(app.content.published.byPath('/about/contacts')!.fields.price).toBe(
      1500
    );
  });

  it('weblink — ссылка, удалённый — в корзине, главная — по site_start', async () => {
    const github = await app.fetch(new Request('http://localhost/github'));
    expect(github.headers.get('location')).toBe('https://github.com/');
    expect(app.content.drafts.page(7).trashedAt).not.toBeNull();
    expect(app.site.settings.get()).toMatchObject({
      name: 'Моя компания',
      homePageId: 1,
    });
  });
});

it('чанк с плейсхолдерами — компонент с props', () => {
  const converted = convertElement(
    '<b>[+title+] — [+sub-title+]</b>',
    'component',
    new Map()
  );
  expect(converted.source).toContain(
    'let { page, title, subTitle } = $props();'
  );
  expect(converted.source).toContain('{title}');
});

it('вложенные ссылки на текущую страницу и на главную', () => {
  const { source } = convertElement(
    '<a href="[~[*id*]~]">я</a><a href="[~[(site_start)]~]">дом</a>',
    'template',
    new Map()
  );
  expect(source).toContain("{@html link(page.id) ?? ''}");
  expect(source).toContain('"}/{@html');
});

describe('дамп Evo не становится кодом', () => {
  it('имена настроек, плейсхолдеров и параметры чанков не выходят в Svelte', async () => {
    const evil = createApp({ scaffold: DEMO });
    const converted = convertElement(
      '<p>[(x--><b>{7*6}</b><!--)]</p><p>[+y--><i>{6*7}</i><!--+]</p><p>[[Snip? &a=`--><s>{5*9}</s><!--`]]</p><p>[(__proto__)]</p>',
      'template',
      new Map()
    );
    expect(
      convertElement(
        '<p>{{promo? &text=`{1+`}}+process.env.HOME}"/></p>',
        'component',
        new Map()
      ).source
    ).toContain('text={"{1+"}');
    evil.design.templates.save('Evil', converted.source);
    evil.content.pages.edit(evil.content.published.byPath('/kontakty')!.id, {
      template: 'Evil',
    });
    const page = await (
      await evil.fetch(new Request('http://localhost/kontakty'))
    ).text();
    expect(page).not.toMatch(/<b>42<\/b>|<i>42<\/i>|<s>45<\/s>/);
    expect(page).toContain('<!-- Evo setting: x- -><b>{7*6}</b><!- - -->');
    evil.close();
  });
});

describe('разбор дампа линейный', () => {
  it('незакрытые CREATE TABLE и ALTER не тормозят', () => {
    const started = performance.now();
    parseDump('CREATE TABLE `a` (\n'.repeat(20000));
    parseDump('ALTER TABLE `a` ADD COLUMN `b` int '.repeat(20000));
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('безопасность импорта Evo', () => {
  let app: App;
  beforeEach(() => {
    app = createApp();
  });
  afterEach(() => app.close());

  it('чистит HTML страниц из дампа; документ со своим НЕ-HTML типом не трогает', () => {
    const evil =
      '<p>safe</p><script>alert(1)</script><img src=x onerror=boom><svg onload=boom>';
    const intro = '<em>e</em><img src=y onerror=boom2>';
    const xml = '<urlset><url><loc>https://x/a</loc></url></urlset>';
    const columns = [
      'id',
      'type',
      'pagetitle',
      'longtitle',
      'description',
      'alias',
      'published',
      'pub_date',
      'unpub_date',
      'parent',
      'introtext',
      'content',
      'template',
      'menuindex',
      'cacheable',
      'deleted',
      'menutitle',
      'hidemenu',
      'contentType',
    ]
      .map((_) => `  \`${_}\` text,`)
      .join('\n');
    const row = (
      id: number,
      alias: string,
      introtext: string,
      content: string,
      type: string
    ) =>
      `(${id},'document','P${id}','','','${alias}',1,0,0,0,'${introtext}','${content}',3,${id},1,0,'',0,'${type}')`;
    const dump = `
CREATE TABLE \`modx_site_content\` (
${columns}
  PRIMARY KEY (\`id\`)
);
INSERT INTO \`modx_site_content\` VALUES ${row(1, 'index', '', '<p>hi</p>', 'text/html')},${row(8, 'evil', intro, evil, 'text/html')},${row(9, 'sitemap', '', xml, 'application/xml')};
CREATE TABLE \`modx_site_templates\` (
  \`id\` int,
  \`templatename\` varchar(255),
  \`content\` mediumtext
);
INSERT INTO \`modx_site_templates\` VALUES (3,'Main','<body>[*content*]</body>');
CREATE TABLE \`modx_system_settings\` (
  \`setting_name\` varchar(50),
  \`setting_value\` text
);
INSERT INTO \`modx_system_settings\` VALUES ('site_name','Co'),('site_start','1');
`;
    importEvo(app, parseDump(dump));
    const page = app.content.drafts.page(8)!;
    expect(page.content).not.toContain('<script');
    expect(`${page.content} ${page.introText}`).not.toContain('onerror');
    expect(page.content).not.toContain('onload');
    expect(page.content).toContain('<p>safe</p>');
    expect(page.introText).toContain('<em>e</em>');
    // Документ со своим типом (sitemap.xml) — не HTML: его XML не разбирается санитайзером.
    const sitemap = app.content.drafts.page(9)!;
    expect(sitemap.contentType).toBe('application/xml');
    expect(sitemap.content).toContain('<urlset>');
  });
});
