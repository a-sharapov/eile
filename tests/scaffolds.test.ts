import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import {
  applyScaffold,
  clearWelcome,
  SCAFFOLDS,
  SCAFFOLDS_EN,
  untouched,
  WELCOME,
} from '../src/scaffolds/index.ts';

const get = (app: App, path: string) =>
  app.fetch(new Request(`http://localhost${path}`));

describe.each(SCAFFOLDS.map((_) => [_.name, _] as const))(
  'каркас %s',
  (_name, scaffold) => {
    it('каждая страница отдаётся, теги и ссылки каркаса разрешены', async () => {
      const app = createApp({ scaffold });
      const pages = app.content.drafts
        .tree()
        .filter((_) => _.published && _.kind === 'page');
      expect(pages.length).toBeGreaterThan(2);
      const home = app.site.settings.get().homePageId;
      for (const page of pages) {
        const view = app.content.drafts.view(page.id)!;
        // Главная отдаётся по «/», со своего адреса — 301 туда.
        const path = page.id === home ? '/' : view.path;
        const response = await get(app, path);
        const html = await response.text();
        expect([path, response.status]).toEqual([path, 200]);
        expect(html).toContain('<title>');
        // Незнакомый компонент или модуль вывелся бы тегом как есть.
        expect(html).not.toMatch(/\[\[|\[#|@\{|\[~/);
        expect(app.content.drafts.page(page.id).content).not.toContain('@{');
      }
      app.close();
    });

    it('главная и 404 — из каркаса, формы рисуются', async () => {
      const app = createApp({ scaffold });
      const settings = app.site.settings.get();
      expect(settings.name).toBe(scaffold.siteName);
      expect(settings.homePageId).not.toBeNull();
      expect((await get(app, '/')).status).toBe(200);
      const missing = await get(app, '/no-such-page');
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain('<title>');
      Object.keys(scaffold.forms ?? {}).forEach(
        (name) => void expect(app.forms.forms.exists(name)).toBe(true)
      );
      app.site.customSettings
        .list()
        .forEach((_) => void expect(_.value).not.toContain('@{'));
      app.close();
    });
  }
);

describe('приветствие и каркас поверх него', () => {
  it('приветствие — страница и пустой шаблон Minimal', async () => {
    const app = createApp({ scaffold: WELCOME });
    expect(app.design.elements.list().map((_) => String(_.name))).toEqual([
      'Minimal',
    ]);
    const html = await (await get(app, '/')).text();
    expect(html).toContain('<h1>Добро пожаловать</h1>');
    expect(html).toContain('cms new blog');
    app.close();
  });

  it('нетронутое приветствие заменяется каркасом, пользователи остаются', async () => {
    const app = createApp({ scaffold: WELCOME });
    await app.identity.users.create({
      email: 'anna@example.com',
      password: 'correct horse battery',
    });
    expect(untouched(WELCOME, app)).toBe(true);
    clearWelcome(app);
    applyScaffold(SCAFFOLDS[0]!, app, 'Свой сайт');
    expect(app.site.settings.get().name).toBe('Свой сайт');
    expect(app.design.elements.get('template', 'Minimal')).toBeNull();
    expect(app.identity.users.list()).toHaveLength(1);
    expect((await get(app, '/')).status).toBe(200);
    app.close();
  });

  it('правленое приветствие — уже своя работа', () => {
    const app = createApp({ scaffold: WELCOME });
    const { 0: home } = app.content.drafts.tree();
    app.content.pages.edit(home!.id, { content: '<p>Мой текст</p>' });
    expect(untouched(WELCOME, app)).toBe(false);
    app.close();
  });
});

describe('cms new', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cms-new-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const output: string[] = [];
  const context = (args: string[], db: string): Context => ({
    args,
    options: {
      port: '8080',
      db,
      help: false,
      version: false,
      passwordStdin: false,
      trustProxy: false,
    },
    paint: definePaint(false),
    language: 'ru',
    tty: false,
    out: (_) => void output.push(_),
  });

  it('без имени — список каркасов', async () => {
    await RUN.new!(context([], join(dir, 'x.db')));
    SCAFFOLDS.forEach((_) => void expect(output.join('\n')).toContain(_.name));
  });

  it('разворачивает каркас в новую базу и не трогает сайт со своей работой', async () => {
    const db = join(dir, 'site.db');
    await RUN.new!(context(['blog'], db));
    expect(output.join('\n')).toContain('Блог');
    const app = createApp({ databasePath: db });
    expect(app.design.elements.get('template', 'Post')).not.toBeNull();
    app.close();
    expect(RUN.new!(context(['blog'], db))).rejects.toThrow('уже есть сайт');
    expect(RUN.new!(context(['wiki'], db))).rejects.toThrow('Нет каркаса');
  });
});

// Английский каркас — тот же сайт по-английски: ни одной русской буквы ни в коде, ни в выдаче.
// И следы русского сайта без кириллицы: рубль и ёлочки.
const _CYRILLIC = /[А-Яа-яЁё₽«»]/;

describe.each(SCAFFOLDS_EN.map((_) => [_.name, _] as const))(
  'каркас %s по-английски',
  (name, scaffold) => {
    it('сайт английский: страницы, элементы, формы, поля, настройки и готовый HTML', async () => {
      const app = createApp({ scaffold });
      const russian = SCAFFOLDS.find((_) => _.name === name)!;
      expect(app.site.settings.get().language).toBe('en');
      const tree = app.content.drafts.tree();
      const twin = createApp({ scaffold: russian });
      // То же дерево: страниц столько же, шаблоны те же.
      expect(tree.map((_) => _.template)).toEqual(
        twin.content.drafts.tree().map((_) => _.template)
      );
      twin.close();
      const texts = [
        app.site.settings.get().name,
        app.site.settings.get().description,
        scaffold.title,
        scaffold.summary,
        ...app.design.elements
          .list()
          .map((_) => app.design.elements.get(_.kind, _.name)!.source),
        ...tree.map((_) =>
          ((page) =>
            [
              page.title,
              page.longTitle,
              page.menuTitle,
              page.description,
              page.introText,
              page.alias,
              page.content,
              JSON.stringify(page.fields),
            ].join('\n'))(app.content.drafts.page(_.id))
        ),
        ...app.forms.forms
          .list()
          .map((_) => JSON.stringify(app.forms.forms.get(_.name))),
        ...app.content.fields.list().map((_) => JSON.stringify(_)),
        JSON.stringify(app.site.customSettings.list()),
      ];
      expect(texts.filter((_) => _CYRILLIC.test(_ ?? ''))).toEqual([]);
      const home = app.site.settings.get().homePageId;
      for (const page of tree.filter((_) => _.published && _.kind === 'page')) {
        const path =
          page.id === home ? '/' : app.content.drafts.view(page.id)!.path;
        const response = await get(app, path);
        const html = await response.text();
        expect([path, response.status]).toEqual([path, 200]);
        expect([path, html.match(_CYRILLIC)?.index ?? null]).toEqual([
          path,
          null,
        ]);
      }
      app.close();
    });
  }
);
