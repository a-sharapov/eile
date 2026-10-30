import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Мелочи из аудита: 500 вместо 400, внешние адреса под видом путей, ключи прототипа.

let app: App;
let admin: string;

const _PASSWORD = 'correct horse battery';

const call = (method: string, path: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        cookie: admin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const codeOf = (response: Response) =>
  response.json().then((_) => (_ as { error: { code: string } }).error.code);

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  const setup = await call('POST', '/setup', {
    token: app.identity.setup.token(),
    email: 'admin@example.com',
    password: _PASSWORD,
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
});

afterEach(() => app.close());

describe('ошибки запроса — 4xx, а не 500', () => {
  it('битая %-последовательность в пути API', async () => {
    const response = await call('GET', '/pages/%E0%A4%A');
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe('manager.bad_path');
  });

  it('файл с расширением из прототипа объекта', async () => {
    const form = new FormData();
    form.set('file', new Blob(['x']), 'a.constructor');
    form.set('path', 'img/a.constructor');
    const response = await app.fetch(
      new Request('http://localhost/manager/api/media', {
        method: 'POST',
        headers: { cookie: admin },
        body: form,
      })
    );
    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe('media.unsupported_type');
  });
});

describe('адреса', () => {
  it('ссылка на //host — не путь сайта', async () => {
    const response = await call('POST', '/pages', {
      title: 'Уход',
      template: 'Base',
      kind: 'link',
      linkTo: '//evil.example/x',
    });
    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe('content.invalid_link');
  });

  it('старый адрес забывается только у своей страницы', async () => {
    const about = app.content.published.byPath('/o-proekte')!.id;
    const contacts = app.content.published.byPath('/kontakty')!.id;
    await call('PATCH', `/pages/${about}`, { alias: 'about' });
    expect(
      (
        await call('DELETE', `/pages/${contacts}/old-paths`, {
          path: '/o-proekte',
        })
      ).status
    ).toBe(404);
    expect(app.content.pages.movedFrom('/o-proekte')).toBe(about);
    expect(
      (
        await call('DELETE', `/pages/${about}/old-paths`, {
          path: '/o-proekte',
        })
      ).status
    ).toBe(200);
  });
});

describe('учётные записи и корзина', () => {
  it('корзину навсегда очищает только администратор', async () => {
    await call('POST', '/users', {
      email: 'editor@example.com',
      name: 'Редактор',
      role: 'editor',
      password: _PASSWORD,
    });
    const login = await call('POST', '/session', {
      email: 'editor@example.com',
      password: _PASSWORD,
    });
    const editor = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const asEditor = await app.fetch(
      new Request('http://localhost/manager/api/trash', {
        method: 'DELETE',
        headers: { cookie: editor },
      })
    );
    expect(asEditor.status).toBe(403);
    expect((await call('DELETE', '/trash')).status).toBe(200);
  });

  it('свой пароль через «Пользователей» не меняется: только с текущим', async () => {
    const response = await call('PATCH', '/users/1', {
      password: 'another horse battery',
    });
    expect(response.status).toBe(403);
    expect(await codeOf(response)).toBe('identity.own_password');
    const own = await call('PUT', '/session/password', {
      current: _PASSWORD,
      password: 'another horse battery',
    });
    expect(own.status).toBe(200);
  });
});

describe('копии, плагины, разбор', () => {
  it('JSON-копия с неизвестной таблицей восстанавливается без её строк', async () => {
    const copy = (await (await call('GET', '/backup?format=json')).json()) as {
      tables: Record<string, unknown[]>;
    };
    copy.tables['evil"; DROP TABLE content_pages; --'] = [{ x: 1 }];
    const restored = await app.fetch(
      new Request('http://localhost/manager/api/backup', {
        method: 'POST',
        headers: { cookie: admin },
        body: JSON.stringify(copy),
      })
    );
    expect(restored.status).toBe(200);
    expect(app.content.published.byPath('/kontakty')).not.toBeNull();
  });

  it('пересозданный плагин с тем же именем работает с новым кодом', async () => {
    const plugin = (mark: string) =>
      `export default { render: (html: string) => html.replace('</body>', '<!--${mark}--></body>') };`;
    app.extensions.plugins.save('Seo', plugin('OLD'));
    const get = () =>
      app.fetch(new Request('http://localhost/kontakty')).then((_) => _.text());
    expect(await get()).toContain('<!--OLD-->');
    app.extensions.plugins.remove('Seo');
    app.extensions.plugins.save('Seo', plugin('NEW'));
    const page = await get();
    expect(page).toContain('<!--NEW-->');
    expect(page).not.toContain('<!--OLD-->');
  });
});
