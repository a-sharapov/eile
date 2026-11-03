import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Полоса правки на сайте (как QuickManager в Evo): только тому, кто вошёл в менеджер, и мимо общего кэша.

let app: App;
let cookie = '';

const _PASSWORD = 'correct horse battery';

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

const api = (method: string, path: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        cookie,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

// Настройки — в атрибуте скрипта полосы, экранированы как HTML.
const configOf = (html: string) =>
  ((raw) =>
    raw === undefined
      ? null
      : JSON.parse(
          raw
            .replaceAll('&quot;', '"')
            .replaceAll('&#x27;', "'")
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>')
            .replaceAll('&amp;', '&')
        ))(
    /<script src="[^"]+" data-eile-bar="([^"]*)" defer>/.exec(html)?.[1]
  );

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  const setup = await api('POST', '/setup', {
    token: app.identity.setup.token(),
    name: 'Anna </script> Admin',
    email: 'admin@example.com',
    password: _PASSWORD,
  });
  cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
});

afterEach(() => app.close());

describe('полоса правки на сайте', () => {
  it('посетитель её не получает: тот же кэш, ETag и сжатие', async () => {
    const response = await get('/');
    expect(await response.text()).not.toContain('eile-bar');
    expect(response.headers.get('etag')).toBeTruthy();
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('вошедшему — полоса с id страницы, мимо кэша и только ему', async () => {
    await get('/');
    const response = await get('/', { cookie });
    const html = await response.text();
    const config = configOf(html);
    expect(config).toMatchObject({
      page: app.site.settings.get().homePageId,
      canEdit: true,
      edit: `/manager/pages/${app.site.settings.get().homePageId}?embed`,
    });
    // Имя с </script> не закрывает блок настроек раньше времени.
    expect(config.user).toBe('Anna </script> Admin');
    expect(html.indexOf('data-eile-bar')).toBeLessThan(
      html.toLowerCase().lastIndexOf('</body>')
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('x-cache')).toBe('hit');
    // Кэш страниц полосу не запомнил: следующий посетитель получает обычную страницу.
    expect(await (await get('/')).text()).not.toContain('eile-bar');
  });

  it('страница с полосой — с теми же файлами стилей, что у посетителя', async () => {
    const links = (html: string) =>
      html.match(/<link rel="stylesheet" href="\/_cms\/styles\/[^"]+">/g);
    const visitor = await (await get('/')).text();
    const editor = await (await get('/', { cookie })).text();
    expect(editor).toContain('eile-bar');
    expect(links(visitor)?.length).toBeGreaterThan(0);
    expect(links(editor)).toEqual(links(visitor));
    expect(editor).not.toContain('<style id="svelte-');
  });

  it('элемент с id полосы в тексте страницы её настройки не подменит', async () => {
    const page = app.content.pages.create({
      title: 'Подмена',
      alias: 'podmena',
      template: 'Base',
      publish: true,
    });
    // Редактор: текст чистится на сервере, служебные id и name снимаются.
    await api('POST', '/users', {
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    const login = await api('POST', '/session', {
      email: 'editor@example.com',
      password: _PASSWORD,
    });
    const admin = cookie;
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    await api('PATCH', `/pages/${page}`, {
      content:
        '<p id="eile-bar-config">{"accent":"red}</style><img src=x onerror=alert(1)>"}</p><input name="cms_x">',
    });
    cookie = admin;
    const html = await (await get('/podmena', { cookie })).text();
    expect(html).not.toContain('id="eile-bar-config"');
    expect(html).not.toContain('name="cms_x"');
    expect(configOf(html)).toMatchObject({ page, canEdit: true });
  });

  it('устаревший или чужой cookie — обычная страница', async () => {
    expect(
      await (await get('/', { cookie: 'cms_session=nope' })).text()
    ).not.toContain('eile-bar');
  });

  it('тексты — на языке пользователя, без выбранного — на языке браузера', async () => {
    const bar = (headers: Record<string, string>) =>
      get('/', { cookie, ...headers })
        .then((_) => _.text())
        .then((_) => configOf(_).texts.edit);
    expect(await bar({ 'accept-language': 'de-DE,de;q=0.9' })).toBe(
      'Bearbeiten'
    );
    await api('PUT', '/appearance', { language: 'ru' });
    expect(await bar({ 'accept-language': 'de' })).toBe('Редактировать');
  });

  it('на странице 404 — полоса с её id, у страницы-файла — нет', async () => {
    const notFound = await get('/nope', { cookie });
    expect(notFound.status).toBe(404);
    expect(configOf(await notFound.text())?.page).toBe(
      app.site.settings.get().notFoundPageId
    );
    app.content.pages.create({
      title: 'Стили',
      alias: 'site.css',
      template: 'Base',
      contentType: 'text/css',
      content: 'body { color: red }',
      publish: true,
    });
    const css = await get('/site.css', { cookie });
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(await css.text()).not.toContain('eile-bar');
  });

  it('скрипт полосы отдаётся по адресу из страницы и кэшируется навсегда', async () => {
    const html = await (await get('/', { cookie })).text();
    const src = /<script src="(\/manager\/bar\.[a-z0-9]+\.js)"/.exec(html)?.[1];
    const script = await get(src!);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('javascript');
    expect(script.headers.get('cache-control')).toContain('immutable');
    expect(await script.text()).toContain('eileBar');
  });

  it('менеджер встраивается во фрейм только своему сайту и только для окна полосы', async () => {
    const plain = await get('/manager/pages/1');
    const framed = await get('/manager/pages/1?embed');
    expect(plain.headers.get('x-frame-options')).toBe('DENY');
    expect(plain.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'"
    );
    expect(framed.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(framed.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'self'"
    );
  });
});
