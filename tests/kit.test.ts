import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { KIT, kitClosure } from '../src/kit/index.ts';

let app: App;
let ids: Record<string, number>;

const _BASE = `<script>
import Breadcrumbs from '$components/Breadcrumbs';
import Menu from '$components/Menu';
import Content from '$core/Content';
let { page } = $props();
</script>
<svelte:head><title>{page.title}</title></svelte:head>
<header><Menu depth={3} /></header>
<Breadcrumbs />
<main><Content of={page} /></main>`;

const create = (
  title: string,
  alias: string,
  parentId: number | null = null,
  extra: Record<string, unknown> = {}
): number =>
  app.content.pages.create({
    title,
    alias,
    parentId,
    template: 'Base',
    publish: true,
    ...extra,
  });

beforeEach(() => {
  app = createApp();
  KIT.forEach((_) => void app.design.components.save(_.name, _.source));
  app.design.templates.save('Base', _BASE);
  const home = create('Главная', 'home');
  const services = create('Услуги', 'uslugi', null, { menuIndex: 1 });
  const design = create('Дизайн', 'dizain', services);
  const logo = create('Логотип', 'logo', design);
  const blog = create('Блог', 'blog', null, {
    menuIndex: 2,
    content: '[[PostList perPage=2 sort="menu"]]',
  });
  [1, 2, 3].forEach(
    (_) =>
      void create(`Пост ${_}`, `post-${_}`, blog, {
        menuIndex: _,
        hiddenFromMenu: true,
        introText: `Анонс ${_}`,
      })
  );
  app.site.settings.update({ homePageId: home, language: 'ru' });
  ids = { home, services, design, logo, blog };
});

afterEach(() => app.close());

const get = (path: string) =>
  app.fetch(new Request(`https://site.test${path}`));

const text = (path: string) => get(path).then((_) => _.text());

it('зависимости ставятся раньше компонента', () => {
  expect(kitClosure('PostList').map((_) => _.name)).toEqual([
    'Pagination',
    'PostList',
  ]);
  expect(kitClosure('Nope')).toEqual([]);
});

it('каждый компонент набора проходит проверку при сохранении', () => {
  const names = new Set(app.design.components.catalog().map((_) => _.name));
  expect(KIT.every((_) => names.has(_.name as never))).toBe(true);
});

describe('меню', () => {
  it('уровни вложены, текущая страница и её ветка отмечены', async () => {
    const html = await text('/uslugi/dizain/logo');
    expect(html).toContain('aria-label="Основное меню"');
    expect(html).toMatch(
      /<li class="[^"]*active[^"]*parent[^"]*"[^>]*><a href="\/uslugi"/
    );
    expect(html).toMatch(
      /<a href="\/uslugi\/dizain\/logo" aria-current="page"[^>]*>Логотип<\/a>/
    );
    expect(html).not.toContain('<!--$s');
    expect(html).not.toContain('Пост 1</a></li></ul></li>');
  });

  it('скрытые из меню страницы в меню не попадают', async () => {
    const menu = /<header>[\s\S]*<\/header>/.exec(await text('/blog'))![0];
    expect(menu).toContain('href="/blog"');
    expect(menu).not.toContain('post-1');
  });

  it('бургер — popover без скриптов, Esc — маленький остров', async () => {
    const html = await text('/blog');
    expect(html).toMatch(/<button[^>]+popovertarget="[^"]+-panel"/);
    expect(html).toMatch(/<div class="panel[^"]*" id="[^"]+-panel" popover/);
    expect(html).toMatch(/\/_cms\/islands\/MenuKeys\.[a-z0-9]+\.js/);
  });
});

describe('хлебные крошки', () => {
  it('путь от главной до текущей страницы', async () => {
    const crumbs = /<nav class="crumbs[\s\S]*?<\/nav>/
      .exec(await text('/uslugi/dizain/logo'))![0]
      .replace(/>\s+</g, '><')
      .replace(/ class="[^"]*"/g, '');
    expect(crumbs).toBe(
      '<nav aria-label="Вы здесь"><ol><li><a href="/">Главная</a></li><li><a href="/uslugi">Услуги</a></li><li><a href="/uslugi/dizain">Дизайн</a></li><li><span aria-current="page">Логотип</span></li></ol></nav>'
    );
  });

  it('на главной крошек нет', async () => {
    expect(await text('/')).not.toContain('class="crumbs');
  });

  it('перенос раздела обновляет крошки в кэше', async () => {
    await text('/uslugi/dizain/logo');
    app.content.pages.edit(ids.services!, { menuTitle: 'Что делаем' });
    expect(await text('/uslugi/dizain/logo')).toContain('>Что делаем</a>');
  });
});

describe('лента постов', () => {
  it('порция с датой, анонсом и пейджером по ЧПУ', async () => {
    const html = await text('/blog');
    expect(html).toContain('>Пост 1</a></h2>');
    expect(html).toContain('<p class="svelte-');
    expect(html).toContain('Анонс 1');
    expect(html).toMatch(/<time datetime="[^"]+"[^>]*>\d+ \S+ \d{4}/);
    expect(html).toContain('href="/blog/page-2"');
    expect(html).toContain('rel="next"');
    const second = await text('/blog/page-2');
    expect(second).toContain('>Пост 3</a></h2>');
    expect(second).toMatch(
      /<span class="number[^"]*" aria-current="page"[^>]*>2<\/span>/
    );
  });

  it('пустой раздел — текст вместо ленты', async () => {
    app.content.pages.edit(ids.services!, {
      content: '[[PostList parent=999]]',
    });
    expect(await text('/uslugi')).toContain('Пока ничего нет.');
  });
});

describe('окна', () => {
  it('окно — dialog с invoker-кнопками, без своего JS на открытие', async () => {
    app.content.pages.edit(ids.services!, {
      content:
        '[[ModalButton modal="callback" text="Перезвоните мне"]]\n[[Modal id="callback" title="Обратный звонок" text="Оставьте телефон"]]',
    });
    const html = await text('/uslugi');
    expect(html).toMatch(
      /<button type="button" class="open primary[^"]*" commandfor="callback" command="show-modal"[^>]*>Перезвоните мне<\/button>/
    );
    expect(html).toMatch(
      /<dialog id="callback" class="modal md[^"]*" aria-labelledby="callback-title" closedby="any" data-modal/
    );
    expect(html).toContain('commandfor="callback" command="close"');
    expect(html).toMatch(/\/_cms\/islands\/ModalLinks\.[a-z0-9]+\.js/);
  });

  it('текст окна берётся со страницы', async () => {
    app.content.pages.edit(ids.design!, { content: '<p>Условия работы</p>' });
    app.content.pages.edit(ids.services!, {
      content: `[[Modal id="terms" source=${ids.design}]]`,
    });
    expect(await text('/uslugi')).toContain('<p>Условия работы</p>');
  });
});

it('острова набора собираются для браузера', async () => {
  app.content.pages.edit(ids.services!, {
    content: '[[Modal id="callback" text="Привет"]]',
  });
  const html = await text('/uslugi');
  const modules = [
    ...html.matchAll(/data-module="(\/_cms\/islands\/[^"]+)"/g),
  ].map((_) => _[1]!);
  expect(modules.some((_) => _.includes('/MenuKeys.'))).toBe(true);
  expect(modules.some((_) => _.includes('/ModalLinks.'))).toBe(true);
  const responses = await Promise.all(modules.map(get));
  expect(responses.map((_) => _.status)).toEqual(modules.map(() => 200));
  expect(await responses[0]!.text()).toContain('addEventListener');
});

describe('набор в менеджере', () => {
  let admin = '';

  const call = (method: string, path: string, body?: unknown) =>
    app.fetch(
      new Request(`http://localhost/manager/api${path}`, {
        method,
        headers: {
          ...(admin ? { cookie: admin } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );

  beforeEach(async () => {
    app.close();
    app = createApp();
    admin = '';
    const setup = await call('POST', '/setup', {
      token: app.identity.setup.token(),
      email: 'admin@example.com',
      password: 'correct horse battery',
    });
    admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  });

  const list = () =>
    call('GET', '/kit').then(
      (_) => _.json() as Promise<{ name: string; state: string }[]>
    );

  it('список: описание, зависимости, состояние', async () => {
    const kit = await list();
    expect(kit.map((_) => _.name)).toEqual(KIT.map((_) => _.name));
    expect(kit.find((_) => _.name === 'Menu')).toMatchObject({
      state: 'missing',
      requires: ['MenuKeys'],
      description: expect.stringContaining('Меню сайта'),
    });
  });

  it('установка ставит и зависимости', async () => {
    const response = await call('POST', '/kit/PostList', {});
    expect(await response.json()).toEqual({
      installed: ['Pagination', 'PostList'],
    });
    const states = Object.fromEntries(
      (await list()).map((_) => [_.name, _.state])
    );
    expect(states).toMatchObject({
      PostList: 'installed',
      Pagination: 'installed',
    });
  });

  it('правленый на сайте компонент заменяется только по просьбе', async () => {
    await call('POST', '/kit/Breadcrumbs', {});
    app.design.components.save('Breadcrumbs', '<nav>Мои крошки</nav>');
    expect((await list()).find((_) => _.name === 'Breadcrumbs')!.state).toBe(
      'changed'
    );
    expect((await call('POST', '/kit/Breadcrumbs', {})).status).toBe(409);
    const replaced = await call('POST', '/kit/Breadcrumbs', { replace: true });
    expect(await replaced.json()).toEqual({ installed: ['Breadcrumbs'] });
    expect((await list()).find((_) => _.name === 'Breadcrumbs')!.state).toBe(
      'installed'
    );
  });

  it('неизвестный компонент — 404', async () => {
    expect((await call('POST', '/kit/Nope', {})).status).toBe(404);
  });
});
