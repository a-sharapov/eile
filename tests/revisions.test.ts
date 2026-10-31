import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

const _PASSWORD = 'correct horse battery';
const anna = { id: 1, name: 'Анна' };
const boris = { id: 2, name: 'Борис' };

let app: App;
let now: Date;
let admin: string;

// Демо разворачивается «сейчас» — его правки ещё создание; потом часы уходят на 11 минут вперёд.
const advance = (minutes: number) =>
  void (now = new Date(now.getTime() + minutes * 60_000));

const call = (method: string, path: string, body?: unknown, cookie = admin) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const cookieOf = (response: Response): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

const pageAt = (path: string): number => app.content.published.byPath(path)!.id;

beforeEach(async () => {
  now = new Date();
  app = createApp({ scaffold: DEMO, clock: () => now });
  advance(11);
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
});

afterEach(() => app.close());

describe('история правок страницы', () => {
  it('правка запоминает прежнее состояние, автора и что изменилось', () => {
    const id = pageAt('/o-proekte');
    app.content.pages.edit(id, { content: '<p>Новый текст</p>' }, anna);
    const { 0: revision, length } = app.content.revisions.list(id);
    expect(length).toBe(1);
    expect(revision).toMatchObject({
      action: 'edited',
      author: anna,
      changed: ['content'],
    });
    expect(app.content.revisions.get(id, revision!.id).snapshot.content).toBe(
      '<p>Алиас этой страницы получен из заголовка транслитерацией.</p>'
    );
  });

  it('правки того же человека за 10 минут — одна версия; другой человек — новая', () => {
    const id = pageAt('/o-proekte');
    app.content.pages.edit(id, { content: '<p>Раз</p>' }, anna);
    advance(4);
    app.content.pages.edit(id, { title: 'О нас' }, anna);
    expect(app.content.revisions.list(id)).toMatchObject([
      { author: anna, changed: ['title', 'content'] },
    ]);
    advance(1);
    app.content.pages.edit(id, { content: '<p>Два</p>' }, boris);
    expect(app.content.revisions.list(id).map((_) => _.author)).toEqual([
      boris,
      anna,
    ]);
  });

  it('публикация, перенос и порядок в меню историю не трогают', () => {
    const id = pageAt('/o-proekte');
    app.content.pages.unpublish(id);
    app.content.pages.edit(id, { menuIndex: 9, hiddenFromMenu: true }, anna);
    app.content.pages.publish(id);
    expect(app.content.revisions.list(id)).toEqual([]);
  });

  it('правки в первые 10 минут после создания версий не дают', () => {
    now = new Date();
    const id = app.content.pages.create({
      title: 'Черновик',
      template: 'Base',
    });
    app.content.pages.edit(id, { content: '<p>Набросок</p>' }, anna);
    expect(app.content.revisions.list(id)).toEqual([]);
  });

  it('возврат к версии: текст и поля как тогда, нынешнее — в историю, сайт видит сразу', async () => {
    const id = pageAt('/o-proekte');
    app.content.fields.save({
      name: 'cover',
      type: 'image',
      templates: ['Base'],
    });
    app.content.pages.edit(id, { content: '<p>Второй вариант</p>' }, anna);
    advance(20);
    app.content.pages.setFields(id, { cover: 'a.jpg' }, anna);
    expect(
      await (await app.fetch(new Request('http://localhost/o-proekte'))).text()
    ).toContain('Второй вариант');
    const first = app.content.revisions.list(id).at(-1)!;
    advance(5);
    app.content.revisions.restore(id, first.id, { author: boris });
    const page = app.content.drafts.page(id);
    expect(page.content).toBe(
      '<p>Алиас этой страницы получен из заголовка транслитерацией.</p>'
    );
    expect(page.fields).toEqual({});
    expect(app.content.revisions.list(id)[0]).toMatchObject({
      action: 'restored',
      author: boris,
      restoredFrom: first.at,
      changed: ['content', 'fields.cover'],
    });
    expect(
      await (await app.fetch(new Request('http://localhost/o-proekte'))).text()
    ).toContain('Алиас этой страницы');
  });

  it('хранится не больше 30 версий', () => {
    const id = pageAt('/o-proekte');
    Array.from({ length: 35 }).forEach(
      (_, i) =>
        void (advance(11),
        app.content.pages.edit(id, { content: `<p>${i}</p>` }, anna))
    );
    const list = app.content.revisions.list(id);
    expect(list).toHaveLength(30);
    expect(app.content.revisions.get(id, list[0]!.id).snapshot.content).toBe(
      '<p>33</p>'
    );
  });

  it('удалённая навсегда страница уходит вместе с историей; история — в копии сайта', () => {
    const id = pageAt('/o-proekte');
    app.content.pages.edit(id, { content: '<p>x</p>' }, anna);
    const rows = () => app.archive().tables.content_revisions ?? [];
    expect(rows()).toHaveLength(1);
    app.content.pages.trash(id);
    app.content.trash.empty();
    expect(rows()).toHaveLength(0);
  });
});

describe('история в менеджере', () => {
  it('правка из менеджера подписана пользователем; версию можно открыть и вернуть', async () => {
    const id = pageAt('/kontakty');
    expect(
      (await call('PATCH', `/pages/${id}`, { content: '<p>Звоните</p>' }))
        .status
    ).toBe(200);
    const list = (await (
      await call('GET', `/pages/${id}/revisions`)
    ).json()) as {
      id: number;
      author: { name: string };
      changed: string[];
    }[];
    expect(list).toMatchObject([
      { author: { name: 'admin' }, changed: ['content'] },
    ]);
    const revision = (await (
      await call('GET', `/pages/${id}/revisions/${list[0]!.id}`)
    ).json()) as { snapshot: { content: string } };
    expect(revision.snapshot.content).toContain('компилируются при сохранении');
    const restored = await call(
      'POST',
      `/pages/${id}/revisions/${list[0]!.id}/restore`
    );
    expect(restored.status).toBe(200);
    expect(
      ((await restored.json()) as { page: { content: string } }).page.content
    ).toContain('компилируются при сохранении');
    expect((await call('GET', `/pages/${id}/revisions/999`)).status).toBe(404);
  });

  it('редактору возвращённый HTML чистится, как при сохранении', async () => {
    const id = pageAt('/kontakty');
    await call('PATCH', `/pages/${id}`, {
      content: '<p>Раз</p><script>alert(1)</script>',
    });
    advance(15);
    await call('PATCH', `/pages/${id}`, { content: '<p>Два</p>' });
    await app.identity.users.create({
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    const editor = cookieOf(
      await call(
        'POST',
        '/session',
        { email: 'editor@example.com', password: _PASSWORD },
        ''
      )
    );
    const { 0: latest } = (await (
      await call('GET', `/pages/${id}/revisions`, undefined, editor)
    ).json()) as { id: number }[];
    const restored = await call(
      'POST',
      `/pages/${id}/revisions/${latest!.id}/restore`,
      undefined,
      editor
    );
    expect(restored.status).toBe(200);
    const { content } = app.content.drafts.page(id);
    expect(content).toContain('<p>Раз</p>');
    expect(content).not.toContain('<script');
  });
});
