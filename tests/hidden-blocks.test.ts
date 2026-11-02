import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import type { UserView } from '../src/contexts/identity/index.ts';
import { defineAgentSession } from '../src/contexts/manager/index.ts';
import { DEMO } from './fixtures/demo.ts';

// Скрытый блок `[[Name hidden]]`, `[#Form:name hidden]`: лежит в тексте, но нигде не выводится.

let app: App;
let editor: UserView;

const _FIELD =
  '<div class="field" data-field="text" data-label="Имя"><label for="f-name">Имя</label><input id="f-name" name="name" required></div>';

const _CONTENT = [
  '<p>Открытый абзац про кухни</p>',
  '[[Callout title="Видимая" text="Обычная врезка"]]',
  '[[Callout title="Тайная" text="Секретнаяакция" hidden]]',
  '<p>[#Form:callback hidden]</p>',
  '[#Form:faq]',
].join('\n');

const _PASSWORD = 'correct horse battery';

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  app.forms.forms.save('callback', { title: 'Звонок', source: _FIELD });
  app.forms.forms.save('faq', { title: 'Вопрос', source: _FIELD });
  app.content.pages.create({
    title: 'Акции',
    alias: 'akcii',
    template: 'Base',
    content: _CONTENT,
    publish: true,
  });
  editor = await app.identity.users.create({
    email: 'ed@example.com',
    role: 'editor',
    password: _PASSWORD,
  });
});

afterEach(() => app.close());

const get = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`)).then((_) => _.text());

const api = (method: string, path: string, body: unknown, cookie: string) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const login = () =>
  api(
    'POST',
    '/session',
    { email: 'ed@example.com', password: _PASSWORD },
    ''
  ).then((_) => (_.headers.get('set-cookie') ?? '').split(';')[0]!);

describe('скрытый блок', () => {
  it('на странице нет ни скрытого компонента, ни скрытой формы, ни пустой обёртки', async () => {
    const html = await get('/akcii');
    expect(html).toContain('Обычная врезка');
    expect(html).toContain('data-cms-form="faq"');
    expect(html).not.toContain('Секретнаяакция');
    expect(html).not.toContain('Тайная');
    expect(html).not.toContain('data-cms-form="callback"');
    const body = html.slice(html.indexOf('<body>'));
    expect(body).not.toMatch(/\[\[|\[#/);
    expect(body).not.toMatch(/<p>\s*<\/p>/);
  });

  it('Markdown-версия и llms-full.txt — без скрытых блоков', async () => {
    const markdown = await get('/akcii.md');
    expect(markdown).toContain('Открытый абзац про кухни');
    expect(markdown).not.toContain('Секретнаяакция');
    expect(markdown).not.toContain('[#Form');
    const full = await get('/llms-full.txt');
    expect(full).toContain('Открытый абзац про кухни');
    expect(full).not.toContain('Секретнаяакция');
    expect(full).not.toContain('[#Form');
    expect(full).not.toContain('hidden');
  });

  it('поиск находит страницу, но не текст скрытого блока', () => {
    const find = (query: string) =>
      app.search.search(query, { language: 'ru' }).hits.map((_) => _.title);
    expect(find('кухни')).toEqual(['Акции']);
    expect(find('Секретнаяакция')).toEqual([]);
  });

  it('форма под скрытым тегом всё равно занята: её не удалить мимо страницы', () => {
    expect(
      app.content.usage.module('Form', 'callback').map((_) => _.title)
    ).toEqual(['Акции']);
  });

  it('скрытый список не ведёт к страницам: диагностика видит потерянные посты', () => {
    const orphans = () =>
      app.diagnostics
        .report(true)
        .findings.find((_) => _.id === 'pages.orphans')
        ?.items.map((_) => _.label) ?? [];
    const blog = app.content.published.byPath('/blog')!.id;
    expect(orphans()).toEqual([]);
    app.content.pages.edit(blog, {
      content: '[[PostList perPage=2 title="hidden gems" hidden]]',
    });
    expect(orphans()).toHaveLength(3);
    app.content.pages.edit(blog, {
      content: '[[PostList perPage=2 title="hidden gems"]]',
    });
    expect(orphans()).toEqual([]);
  });

  it('редактор без права на код сохраняет текст — флаг остаётся', async () => {
    const cookie = await login();
    const created = (await (
      await api(
        'POST',
        '/pages',
        {
          title: 'Скрытое',
          alias: 'skrytoe',
          template: 'Base',
          publish: true,
          content: _CONTENT,
        },
        cookie
      )
    ).json()) as { id: number };
    expect(app.content.drafts.page(created.id).content).toBe(_CONTENT);
    await api(
      'PATCH',
      `/pages/${created.id}`,
      { content: `${_CONTENT}\n[[Callout text="Ещё" hidden]]` },
      cookie
    );
    expect(app.content.drafts.page(created.id).content).toContain(
      '[[Callout text="Ещё" hidden]]'
    );
    expect(await get('/skrytoe')).not.toContain('Ещё');
  });

  it('инструменты агента: флаг доходит до текста и обратно, просмотр — без блока', async () => {
    const call = (name: string, args: object) =>
      app
        .mcp(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
          },
          editor,
          defineAgentSession()
        )
        .then(
          (_) =>
            (_ as { result: { content: { text: string }[] } }).result
              .content[0]!.text
        );
    const { id } = JSON.parse(
      await call('create_page', {
        title: 'От агента',
        template: 'Base',
        content: _CONTENT,
      })
    ) as { id: number };
    expect(JSON.parse(await call('get_page', { id })).page.content).toBe(
      _CONTENT
    );
    const view = await call('view_page', { id, format: 'html' });
    expect(view).toContain('Обычная врезка');
    expect(view).not.toContain('Секретнаяакция');
  });
});
