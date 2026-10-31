import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Атаки из аудита: редактор не должен получить скрипт на общем с менеджером адресе.

let app: App;
let admin: string;
let editor: string;

const _PASSWORD = 'correct horse battery';

const call = (method: string, path: string, body: unknown, cookie: string) =>
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

const json = (response: Response) => response.json() as Promise<any>;

const cookieOf = (response: Response): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

const site = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

const _SCRIPT =
  '<p>Новости</p><script>fetch("/manager/api/users",{method:"POST"})</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>';

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  admin = cookieOf(
    await call(
      'POST',
      '/setup',
      {
        token: app.identity.setup.token(),
        email: 'admin@example.com',
        password: _PASSWORD,
      },
      ''
    )
  );
  await call(
    'POST',
    '/users',
    {
      email: 'editor@example.com',
      name: 'Редактор',
      role: 'editor',
      password: _PASSWORD,
    },
    admin
  );
  editor = cookieOf(
    await call(
      'POST',
      '/session',
      { email: 'editor@example.com', password: _PASSWORD },
      ''
    )
  );
});

afterEach(() => app.close());

const create = (cookie: string, input: Record<string, unknown>) =>
  call(
    'POST',
    '/pages',
    { template: 'Base', publish: true, ...input },
    cookie
  ).then(json);

describe('HTML от редактора', () => {
  it('скрипт, обработчики и javascript: вырезаются при сохранении', async () => {
    const { id } = await create(editor, {
      title: 'Новость',
      alias: 'novost',
      content: _SCRIPT,
      introText: '<b onmouseover="x()">анонс</b>',
    });
    const page = (
      await json(await call('GET', `/pages/${id}`, undefined, admin))
    ).page;
    expect(page.content).toBe('<p>Новости</p><img src=x><a>x</a>');
    expect(page.introText).toBe('<b>анонс</b>');
    expect(await (await site('/novost')).text()).not.toContain('<script>fetch');
  });

  it('правка текста и полей с оформлением — тоже', async () => {
    await call(
      'PUT',
      '/fields/note',
      { label: 'Заметка', type: 'richtext', templates: ['Base'] },
      admin
    );
    const { id } = await create(editor, { title: 'Правка', alias: 'pravka' });
    await call('PATCH', `/pages/${id}`, { content: _SCRIPT }, editor);
    await call(
      'PUT',
      `/pages/${id}/fields`,
      { note: '<p>ок</p><script>1</script>' },
      editor
    );
    const page = (
      await json(await call('GET', `/pages/${id}`, undefined, admin))
    ).page;
    expect(page.content).not.toContain('script');
    expect(page.fields.note).toBe('<p>ок</p>');
  });

  it('администратор пишет любой HTML: у него и так есть код', async () => {
    const { id } = await create(admin, {
      title: 'Счётчик',
      alias: 'schetchik',
      content: '<script>counter()</script>',
    });
    const page = (
      await json(await call('GET', `/pages/${id}`, undefined, admin))
    ).page;
    expect(page.content).toBe('<script>counter()</script>');
  });
});

describe('страницы-файлы для редактора', () => {
  it('исполняемые типы выбрать нельзя, инертные — можно', async () => {
    for (const contentType of [
      'image/svg+xml',
      'application/xhtml+xml',
      'text/xml',
      'application/rss+xml',
      'text/javascript',
    ]) {
      const response = await call(
        'POST',
        '/pages',
        { title: 'x', template: 'Base', contentType, content: '<svg/>' },
        editor
      );
      expect(response.status).toBe(403);
      expect((await json(response)).error.code).toBe(
        'manager.type_not_allowed'
      );
    }
    const css = await create(editor, {
      title: 'Стили',
      alias: 'style.css',
      contentType: 'text/css',
      content: 'a > b { color: red }',
    });
    expect(await (await site('/style.css')).text()).toBe(
      'a > b { color: red }'
    );
    expect(css.id).toBeNumber();
  });

  it('текст ленты администратора редактор не правит, заголовок — правит', async () => {
    const { id } = await create(admin, {
      title: 'Лента',
      alias: 'feed.xml',
      contentType: 'application/rss+xml',
      content: '<rss/>',
    });
    expect(
      (await call('PATCH', `/pages/${id}`, { content: '<x/>' }, editor)).status
    ).toBe(403);
    expect(
      (await call('PATCH', `/pages/${id}`, { title: 'Новости' }, editor)).status
    ).toBe(200);
  });

  it('текст файла, ставший HTML, вычищается', async () => {
    const { id } = await create(editor, {
      title: 'Текст',
      alias: 'tekst',
      contentType: 'text/plain',
      content: '<script>alert(1)</script>ok',
    });
    await call('PATCH', `/pages/${id}`, { contentType: 'text/html' }, editor);
    const page = (
      await json(await call('GET', `/pages/${id}`, undefined, admin))
    ).page;
    expect(page.content).toBe('ok');
  });
});

describe('песочница', () => {
  it('предпросмотр черновика — в песочнице без своего origin', async () => {
    const { id } = await create(admin, {
      title: 'Черновик',
      alias: 'chernovik',
      publish: false,
    });
    const preview = await call('GET', `/pages/${id}/preview`, undefined, admin);
    expect(preview.headers.get('content-security-policy')).toBe(
      'sandbox allow-scripts allow-popups allow-forms'
    );
  });

  it('страница-файл открывается в песочнице, HTML-страница — как обычно', async () => {
    await create(admin, {
      title: 'Логотип',
      alias: 'logo.svg',
      contentType: 'image/svg+xml',
      content: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    expect(
      (await site('/logo.svg')).headers.get('content-security-policy')
    ).toContain('sandbox');
    // HTML-страница — без песочницы; от чужих фреймов её закрывает только frame-ancestors.
    expect(
      (await site('/kontakty')).headers.get('content-security-policy')
    ).toBe("frame-ancestors 'self'");
    expect((await site('/kontakty')).headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    );
  });

  it('service worker со страниц сайта не регистрируется', async () => {
    await create(admin, {
      title: 'sw',
      alias: 'sw.js',
      contentType: 'text/javascript',
      content: 'self.addEventListener("fetch", () => {})',
    });
    expect((await site('/sw.js')).status).toBe(200);
    expect((await site('/sw.js', { 'service-worker': 'script' })).status).toBe(
      404
    );
  });
});
