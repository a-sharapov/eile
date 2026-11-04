import { beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import type { UserView } from '../src/contexts/identity/index.ts';
import {
  type AgentSession,
  defineAgentSession,
} from '../src/contexts/manager/index.ts';
import { DEMO } from './fixtures/demo.ts';

// Проверка правок агентов (ADR 0054): правки ключом API и через MCP — предложения, решение — за человеком.

const PASSWORD = 'correct horse battery';
let app: App;
let admin = '';
let anna: UserView;
let token = '';
let tokenId = 0;
let now = new Date('2026-11-03T10:00:00Z');
let next = 0;

const api = (
  method: string,
  path: string,
  {
    body,
    cookie,
    bearer,
    headers = {},
  }: {
    body?: unknown;
    cookie?: string;
    bearer?: string;
    headers?: Record<string, string>;
  } = {}
) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const json = (response: Response) => response.json() as Promise<any>;

const asAdmin = (method: string, path: string, body?: unknown) =>
  api(method, path, { cookie: admin, ...(body === undefined ? {} : { body }) });

const asAgent = (method: string, path: string, body?: unknown) =>
  api(method, path, { bearer: token, ...(body === undefined ? {} : { body }) });

const page = (id: number) => app.content.drafts.page(id);

const call = (
  name: string,
  args: object = {},
  session: AgentSession = defineAgentSession({
    key: { id: tokenId, name: 'Claude' },
  })
) =>
  app
    .mcp(
      {
        jsonrpc: '2.0',
        id: ++next,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      anna,
      session
    )
    .then(
      (_) =>
        (_ as { result: { content: { text: string }[]; isError: boolean } })
          .result
    );

const text = (result: { content: { text: string }[] }) =>
  result.content[0]!.text;

const reviewAll = (on: boolean) =>
  asAdmin('PUT', '/review/settings', { agents: on });

beforeEach(async () => {
  now = new Date('2026-11-03T10:00:00Z');
  app = createApp({ scaffold: DEMO, clock: () => now });
  const setup = await api('POST', '/setup', {
    body: {
      token: app.identity.setup.token(),
      email: 'anna@example.com',
      name: 'Анна',
      password: PASSWORD,
    },
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  anna = app.identity.users.list()[0]!;
  const issued = await json(
    await asAdmin('POST', '/tokens', { name: 'Claude' })
  );
  token = issued.token;
  tokenId = issued.id;
});

describe('включение проверки', () => {
  it('выключена — правка ключом сразу на сайте, как раньше', async () => {
    const response = await asAgent('PATCH', '/pages/2', { title: 'Сразу' });
    expect(response.status).toBe(200);
    expect(page(2).title).toBe('Сразу');
    expect(app.review.changeSets.list()).toEqual([]);
  });

  it('для всех агентов: правка ключом — предложение, страница не меняется', async () => {
    await reviewAll(true);
    const before = page(2);
    const response = await asAgent('PATCH', '/pages/2', {
      title: 'Через проверку',
    });
    expect(response.status).toBe(202);
    const receipt = await json(response);
    expect(receipt).toMatchObject({
      pending: true,
      target: 'page:2',
      operations: ['edited'],
    });
    expect(receipt.message).toContain('submit_changes');
    expect(page(2)).toEqual(before);
    const [set] = app.review.changeSets.list();
    expect(set).toMatchObject({
      id: receipt.changeSet,
      status: 'open',
      agent: { userName: 'Анна', tokenName: 'Claude' },
      counts: { pending: 1 },
    });
  });

  it('у одного ключа: другой ключ правит сразу; отметку меняет только вошедший', async () => {
    const other = await json(await asAdmin('POST', '/tokens', { name: 'n8n' }));
    expect(
      (await asAgent('PATCH', `/tokens/${tokenId}`, { review: true })).status
    ).toBe(403);
    const marked = await json(
      await asAdmin('PATCH', `/tokens/${tokenId}`, { review: true })
    );
    expect(marked).toMatchObject({ id: tokenId, review: true });
    expect((await asAgent('PATCH', '/pages/2', { title: 'Ждёт' })).status).toBe(
      202
    );
    expect(
      (
        await api('PATCH', '/pages/3', {
          bearer: other.token,
          body: { title: 'Сразу' },
        })
      ).status
    ).toBe(200);
    expect(page(2).title).toBe('О проекте');
    expect(page(3).title).toBe('Сразу');
  });

  it('проверку не выключить и свои правки не принять ключом агента', async () => {
    await reviewAll(true);
    expect(
      (await asAgent('PUT', '/review/settings', { agents: false })).status
    ).toBe(403);
    const receipt = await json(
      await asAgent('PATCH', '/pages/2', { title: 'Сам себе' })
    );
    const accept = await asAgent(
      'POST',
      `/review/sets/${receipt.changeSet}/accept`,
      {}
    );
    expect(accept.status).toBe(403);
    expect((await json(accept)).error.code).toBe('identity.session_required');
    expect(page(2).title).toBe('О проекте');
    // Чужие наборы агенту не видны: свои — через /review/mine.
    expect((await asAgent('GET', '/review/sets')).status).toBe(403);
    expect(
      (await json(await asAgent('GET', '/review/mine'))).changeSets
    ).toHaveLength(1);
  });

  it('человек в менеджере и ассистент правят сразу и при проверке', async () => {
    await reviewAll(true);
    expect((await asAdmin('PATCH', '/pages/2', { title: 'Сам' })).status).toBe(
      200
    );
    expect(page(2).title).toBe('Сам');
  });
});

describe('предложения', () => {
  beforeEach(() => reviewAll(true));

  it('правки одной страницы сливаются в одно предложение, база — что агент видел', async () => {
    await asAgent('PATCH', '/pages/2', { title: 'Первый' });
    await asAgent('PATCH', '/pages/2', {
      title: 'Второй',
      content: '<p>Новый текст</p>',
    });
    await asAgent('PUT', '/pages/2/fields', {});
    const [set] = app.review.changeSets.list();
    const view = app.review.changeSets.get(set!.id);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]!.changes).toContainEqual({
      key: 'title',
      before: 'О проекте',
      after: 'Второй',
    });
    expect(
      view.items[0]!.content!.filter(
        (_) => _.kind !== 'same' && _.kind !== 'skip'
      )
    ).toEqual([
      {
        kind: 'old',
        pieces: [
          { text: '<p>', changed: false },
          {
            text: 'Алиас этой страницы получен из заголовка транслитерацией.',
            changed: true,
          },
          { text: '</p>', changed: false },
        ],
      },
      {
        kind: 'new',
        pieces: [
          { text: '<p>', changed: false },
          { text: 'Новый текст', changed: true },
          { text: '</p>', changed: false },
        ],
      },
    ]);
  });

  it('каждая операция страницы: создание, правка, поля, перенос, публикация, корзина', async () => {
    const created = await json(
      await asAgent('POST', '/pages', {
        title: 'Новая',
        template: 'Base',
        content: '<p>Здравствуйте</p><script>alert(1)</script>',
        parentId: 4,
      })
    );
    expect(created).toMatchObject({ pending: true, operations: ['created'] });
    expect(created.id).toBeGreaterThan(8);
    expect(app.content.drafts.view(created.id)).toBeNull();
    const child = await json(
      await asAgent('POST', '/pages', {
        title: 'Под новой',
        template: 'Base',
        parentId: created.id,
      })
    );
    expect(child.id).toBe(created.id + 1);
    await asAgent('POST', `/pages/${created.id}/publish`);
    await asAgent('POST', '/pages/3/move', { parentId: 4 });
    await asAgent('POST', '/pages/5/unpublish');
    await asAgent('POST', '/pages/6/trash');
    app.content.pages.unpublish(7);
    app.content.pages.trash(8);
    await asAgent('POST', '/pages/7/publish');
    await asAgent('POST', '/pages/8/restore');
    const [set] = app.review.changeSets.list();
    const items = app.review.changeSets.get(set!.id).items;
    expect(
      items.map((_) => [
        _.target.kind === 'page' ? _.target.id : 0,
        _.operations,
      ])
    ).toEqual([
      [created.id, ['created', 'published']],
      [child.id, ['created']],
      [3, ['moved']],
      [5, ['unpublished']],
      [6, ['trashed']],
      [7, ['published']],
      [8, ['restored']],
    ]);
    expect(items[2]!.tree).toEqual({
      before: null,
      after: { id: 4, title: 'Блог' },
    });
    // HTML агента чистится уже в предложении: проверяющий видит то, что ляжет на сайт.
    expect(JSON.stringify(items[0])).not.toContain('<script>');
    expect(app.content.drafts.page(3).parentId).toBeNull();

    const accepted = await json(
      await asAdmin('POST', `/review/sets/${set!.id}/accept`, {})
    );
    expect(accepted.status).toBe('closed');
    expect(accepted.counts).toMatchObject({ accepted: 7, pending: 0 });
    expect(page(created.id)).toMatchObject({
      title: 'Новая',
      parentId: 4,
      published: true,
    });
    expect(page(created.id).content).not.toContain('<script>');
    expect(page(child.id).parentId).toBe(created.id);
    expect(page(3).parentId as number | null).toBe(4);
    expect(page(5).published).toBe(false);
    expect(page(6).trashedAt).not.toBeNull();
    expect(page(7).published).toBe(true);
    expect(page(8).trashedAt).toBeNull();
    const activity = await json(await asAdmin('GET', '/activity?limit=10'));
    expect(
      activity.find(
        (_: { pageId: number; action: string }) =>
          _.pageId === created.id && _.action === 'created'
      )
    ).toMatchObject({ userName: 'Анна' });
  });

  it('создать страницу с id, который никто не занимал, нельзя; свой занятый — можно', () => {
    expect(() =>
      app.content.pages.create({ title: 'Чужой', template: 'Base' }, 1000)
    ).toThrow('not reserved');
    const id: number = app.content.pages.reserveId();
    expect(
      app.content.pages.create({ title: 'Свой', template: 'Base' }) as number
    ).toBe(id + 1);
    expect(
      app.content.pages.create(
        { title: 'Занятый', template: 'Base' },
        id
      ) as number
    ).toBe(id);
  });

  it('элементы: компонент и шаблон с ошибкой компиляции — ошибка сразу, со строкой', async () => {
    const saved = await asAgent('PUT', '/elements/component/Note', {
      source: '<p class="note">Заметка</p>',
    });
    expect(saved.status).toBe(202);
    expect(app.design.elements.get('component', 'Note')).toBeNull();
    const broken = await asAgent('PUT', '/elements/template/Base', {
      source: '<p>{</p>',
    });
    expect(broken.status).toBe(422);
    expect((await json(broken)).error).toMatchObject({
      code: 'design.compile_failed',
      at: { line: 1 },
    });
    const [set] = app.review.changeSets.list();
    const view = app.review.changeSets.get(set!.id);
    expect(view.items.map((_) => _.operations)).toEqual([['created']]);
    expect(view.items[0]!.source).toEqual([
      {
        kind: 'new',
        pieces: [{ text: '<p class="note">Заметка</p>', changed: true }],
      },
    ]);
    await asAdmin('POST', `/review/sets/${set!.id}/accept`, {});
    expect(app.design.elements.get('component', 'Note')?.source).toBe(
      '<p class="note">Заметка</p>'
    );
  });

  it('возврат к версии — тоже предложение: правка текстом и полями версии', async () => {
    await asAdmin('PATCH', '/pages/2', { content: '<p>Правка человека</p>' });
    now = new Date(now.getTime() + 11 * 60_000);
    await asAdmin('PATCH', '/pages/2', { content: '<p>Ещё правка</p>' });
    const [revision] = app.content.revisions.list(2);
    const response = await asAgent(
      'POST',
      `/pages/2/revisions/${revision!.id}/restore`
    );
    expect(response.status).toBe(202);
    expect(page(2).content).toBe('<p>Ещё правка</p>');
  });

  it('формы, поля, настройки и описание файла — отказ с понятной ошибкой', async () => {
    const refusals = await Promise.all(
      [
        ['PUT', '/forms/callback', { source: '<input name="a">' }],
        ['PATCH', '/settings', { name: 'Другой' }],
        ['PUT', '/fields/price', { type: 'text', templates: ['Base'] }],
        ['DELETE', '/trash'],
        ['POST', '/pages/2/duplicate', {}],
      ].map(({ 0: method, 1: path, 2: body }) =>
        asAgent(method as string, path as string, body).then(json)
      )
    );
    expect(refusals.map((_) => _.error.code)).toEqual([
      'review.not_reviewable',
      'review.not_reviewable',
      'review.not_reviewable',
      'review.not_reviewable',
      'review.not_reviewable',
    ]);
    expect(refusals[0].error.message).toContain('Tell the person');
    expect(app.site.settings.get().name).not.toBe('Другой');
  });

  it('медиатека: новый файл можно, заменить существующий — нет', async () => {
    const upload = (path: string) => {
      const form = new FormData();
      form.set('path', path);
      form.set('file', new Blob(['hello']));
      return app.fetch(
        new Request('http://localhost/manager/api/media', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: form,
        })
      );
    };
    expect((await upload('notes/a.txt')).status).toBe(201);
    const again = await upload('notes/a.txt');
    expect(again.status).toBe(403);
    expect((await json(again)).error.code).toBe('review.not_reviewable');
  });
});

describe('решение', () => {
  beforeEach(() => reviewAll(true));

  const propose = async () => {
    await asAgent('PATCH', '/pages/2', { title: 'Агент 2' });
    await asAgent('PATCH', '/pages/3', { title: 'Агент 3' });
    return app.review.changeSets.list()[0]!;
  };

  it('принять выбранные — история подписана агентом; остальные ждут', async () => {
    const set = await propose();
    const items = app.review.changeSets.get(set.id).items;
    const view = await json(
      await asAdmin('POST', `/review/sets/${set.id}/accept`, {
        items: [items[0]!.id],
      })
    );
    expect(view.status).toBe('open');
    expect(view.counts).toMatchObject({ accepted: 1, pending: 1 });
    expect(page(2).title).toBe('Агент 2');
    expect(page(3).title).toBe('Контакты');
    expect(view.items[0]).toMatchObject({
      status: 'accepted',
      decidedBy: 'Анна',
    });
  });

  it('история правок: версия до принятия подписана пользователем агента', async () => {
    now = new Date(now.getTime() + 20 * 60_000);
    const set = await propose();
    await asAdmin('POST', `/review/sets/${set.id}/accept`, {});
    expect(app.content.revisions.list(2)[0]).toMatchObject({
      author: { id: anna.id, name: 'Анна' },
      changed: ['title'],
    });
  });

  it('отклонить — сайт не меняется, набор закрыт', async () => {
    const set = await propose();
    const view = await json(
      await asAdmin('POST', `/review/sets/${set.id}/reject`, {})
    );
    expect(view).toMatchObject({
      status: 'closed',
      counts: { rejected: 2, pending: 0 },
    });
    expect(page(2).title).toBe('О проекте');
    expect(app.review.changeSets.list()).toEqual([]);
    expect(app.review.changeSets.list(true)).toHaveLength(1);
  });

  it('конфликт: страницу правили после предложения — без override отказ, с ним — правка агента', async () => {
    const set = await propose();
    await asAdmin('PATCH', '/pages/2', { title: 'Человек' });
    const view = app.review.changeSets.get(set.id);
    expect(view.conflicts).toBe(1);
    const conflicted = view.items.find((_) => _.conflicts.length > 0)!;
    expect(conflicted.conflicts).toEqual(['title']);
    expect(conflicted.changes[0]).toEqual({
      key: 'title',
      before: 'Человек',
      after: 'Агент 2',
      was: 'О проекте',
    });
    const refused = await asAdmin('POST', `/review/sets/${set.id}/accept`, {});
    expect(refused.status).toBe(409);
    expect((await json(refused)).error.code).toBe('review.conflict');
    expect(page(3).title).toBe('Контакты');
    await asAdmin('POST', `/review/sets/${set.id}/accept`, {
      override: [conflicted.id],
    });
    expect(page(2).title).toBe('Агент 2');
    expect(page(3).title).toBe('Агент 3');
  });

  it('то же значение уже на сайте — не конфликт', async () => {
    const set = await propose();
    await asAdmin('PATCH', '/pages/2', { title: 'Агент 2' });
    expect(app.review.changeSets.get(set.id).conflicts).toBe(0);
  });

  it('сбой при применении откатывает всё и остаётся у предложения', async () => {
    await asAgent('PATCH', '/pages/2', { title: 'Хорошо' });
    await asAgent('POST', '/pages', {
      title: 'Сирота',
      template: 'Base',
      parentId: 3,
    });
    const set = app.review.changeSets.list()[0]!;
    app.content.pages.trash(3);
    app.content.trash.empty();
    const response = await asAdmin('POST', `/review/sets/${set.id}/accept`, {});
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe('review.apply_failed');
    expect(page(2).title).toBe('О проекте');
    expect(
      app.review.changeSets.get(set.id).items.find((_) => _.error !== '')
    ).toMatchObject({ status: 'pending' });
  });

  it('редактор не принимает элементы', async () => {
    await asAgent('PUT', '/elements/component/Note', { source: '<p>x</p>' });
    const set = app.review.changeSets.list()[0]!;
    await app.identity.users.create({
      email: 'ed@example.com',
      role: 'editor',
      password: PASSWORD,
    });
    const login = await api('POST', '/session', {
      body: { email: 'ed@example.com', password: PASSWORD },
    });
    const editor = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const response = await api('POST', `/review/sets/${set.id}/accept`, {
      cookie: editor,
      body: {},
    });
    expect(response.status).toBe(403);
    expect(app.design.elements.get('component', 'Note')).toBeNull();
  });
});

describe('агент через MCP', () => {
  beforeEach(() => reviewAll(true));

  it('ответы инструментов — квитанция; набор на сеанс; список, отзыв, отправка', async () => {
    app.notify.settings.save({
      telegram: {
        token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ',
        chats: [{ id: '-100500', title: 'Менеджеры' }],
      },
    });
    const session = defineAgentSession({
      key: { id: tokenId, name: 'Claude' },
    });
    const edited = JSON.parse(
      text(await call('edit_page', { id: 2, title: 'MCP' }, session))
    );
    expect(edited).toMatchObject({ pending: true, target: 'page:2' });
    const created = JSON.parse(
      text(
        await call(
          'create_page',
          { title: 'Из MCP', template: 'Base' },
          session
        )
      )
    );
    expect(created.changeSet).toBe(edited.changeSet);
    expect(created.note).toContain(`[~${created.id}~]`);
    // Другой сеанс того же ключа — свой набор.
    const other = JSON.parse(
      text(await call('edit_page', { id: 3, title: 'Другой' }))
    );
    expect(other.changeSet).not.toBe(edited.changeSet);

    const mine = JSON.parse(text(await call('list_proposals', {}, session)));
    expect(mine.reviewed).toBe(true);
    expect(mine.changeSets.map((_: { id: number }) => _.id)).toEqual([
      other.changeSet,
      edited.changeSet,
    ]);

    const withdrawn = JSON.parse(
      text(
        await call(
          'withdraw_proposal',
          { changeSet: edited.changeSet, proposal: created.proposal },
          session
        )
      )
    );
    expect(withdrawn.counts).toMatchObject({ withdrawn: 1, pending: 1 });

    const submitted = JSON.parse(
      text(
        await call(
          'submit_changes',
          { title: 'Заголовок страницы', description: 'Короче и яснее' },
          session
        )
      )
    );
    expect(submitted).toMatchObject({
      status: 'ready',
      title: 'Заголовок страницы',
      description: 'Короче и яснее',
    });
    const [notice] = app.notify.outbox.recent();
    expect(notice!.message.title).toBe('Правки агента ждут проверки');
    expect(notice!.message.text).toContain('Заголовок страницы');
    // Отправленный набор закрыт для новых правок: следующая ложится в новый.
    const later = JSON.parse(
      text(await call('edit_page', { id: 2, title: 'Позже' }, session))
    );
    expect(later.changeSet).not.toBe(edited.changeSet);
  });

  it('чужой набор не отозвать', async () => {
    const receipt = JSON.parse(
      text(await call('edit_page', { id: 2, title: 'x' }))
    );
    const second = await json(
      await asAdmin('POST', '/tokens', { name: 'Codex' })
    );
    const result = await call(
      'withdraw_proposal',
      { changeSet: receipt.changeSet },
      defineAgentSession({ key: { id: second.id, name: 'Codex' } })
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('review.change_set_not_found');
  });

  it('instructions говорят о режиме проверки, когда он включён', async () => {
    const instructions = async () =>
      (
        (await app.mcp(
          { jsonrpc: '2.0', id: ++next, method: 'initialize', params: {} },
          anna,
          defineAgentSession({ key: { id: tokenId, name: 'Claude' } })
        )) as { result: { instructions: string } }
      ).result.instructions;
    expect(await instructions()).toContain('Review mode is on');
    await reviewAll(false);
    expect(await instructions()).not.toContain('Review mode is on');
  });

  it('`cms mcp` без ключа — тоже на проверку, ассистент в менеджере — нет', async () => {
    const stdio = JSON.parse(
      text(
        await call('edit_page', { id: 2, title: 'stdio' }, defineAgentSession())
      )
    );
    expect(stdio.pending).toBe(true);
    const assistant = await call(
      'edit_page',
      { id: 3, title: 'Ассистент' },
      defineAgentSession({ channel: 'assistant' })
    );
    expect(assistant.isError).toBe(false);
    expect(page(3).title).toBe('Ассистент');
  });

  it('текст посетителей по-прежнему закрывает код и при проверке', async () => {
    const session = defineAgentSession({
      key: { id: tokenId, name: 'Claude' },
    });
    await call('list_submissions', {}, session);
    const result = await call(
      'save_element',
      { kind: 'component', name: 'Bad', source: '<p>x</p>' },
      session
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toStartWith('agent.tainted');
    expect(app.review.changeSets.list()).toEqual([]);
  });

  it('read_guide знает тему review', async () => {
    expect(text(await call('read_guide', { topic: 'review' }))).toContain(
      'submit_changes'
    );
  });
});

describe('предпросмотр набора', () => {
  beforeEach(() => reviewAll(true));

  it('страница с правками агента и предложенным компонентом — в менеджере и по ссылке', async () => {
    await asAgent('PUT', '/elements/component/Note', {
      source:
        '<p class="note">Компонент агента</p><style>.note { color: tomato; }</style>',
    });
    await asAgent('PATCH', '/pages/2', {
      content: '<p>Текст агента</p>[[Note]]',
    });
    const set = app.review.changeSets.list()[0]!;
    const preview = await asAdmin('GET', `/review/sets/${set.id}/preview/2`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-security-policy')).toContain('sandbox');
    const html = await preview.text();
    expect(html).toContain('Текст агента');
    expect(html).toContain('Компонент агента');
    expect(html).toMatch(/<style[^>]*>[^<]*tomato/);
    // Живой сайт не изменился, и кэш страниц правки не видел.
    const live = await (
      await app.fetch(new Request('http://localhost/o-proekte'))
    ).text();
    expect(live).not.toContain('Текст агента');

    const link = await json(
      await asAdmin('POST', '/review/links', { page: 2, changeSet: set.id })
    );
    const shared = await app.fetch(new Request(link.url));
    expect(shared.status).toBe(200);
    expect(shared.headers.get('content-security-policy')).toContain('sandbox');
    const body = await shared.text();
    expect(body).toContain('Текст агента');
    expect(body).toContain(
      'Предпросмотр предложенных правок — не опубликовано'
    );
    expect(
      (await asAdmin('POST', '/review/links', { page: 3, changeSet: set.id }))
        .status
    ).toBe(409);
  });

  it('после решения ссылка набора показывает страницу без отклонённого', async () => {
    await asAgent('PATCH', '/pages/2', { content: '<p>Отклонят</p>' });
    const set = app.review.changeSets.list()[0]!;
    const link = await json(
      await asAdmin('POST', '/review/links', { page: 2, changeSet: set.id })
    );
    await asAdmin('POST', `/review/sets/${set.id}/reject`, {});
    expect(await (await app.fetch(new Request(link.url))).text()).not.toContain(
      'Отклонят'
    );
  });
});
