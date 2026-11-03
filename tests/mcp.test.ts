import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import type { UserView } from '../src/contexts/identity/index.ts';
import {
  type AgentSession,
  defineAgentSession,
} from '../src/contexts/manager/index.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;
let admin: UserView;
let editor: UserView;
let next = 0;

beforeAll(async () => {
  app = createApp({ scaffold: DEMO });
  admin = await app.identity.users.create({
    email: 'anna@example.com',
    name: 'Анна',
    role: 'admin',
    password: 'another horse battery',
  });
  editor = await app.identity.users.create({
    email: 'ed@example.com',
    role: 'editor',
    password: 'another horse battery',
  });
});

// Каждый вызов — свой сеанс, если не передать общий: метка «читал заявки» живёт в сеансе.
const rpc = (
  user: UserView,
  method: string,
  params?: object,
  session: AgentSession = defineAgentSession()
) =>
  app.mcp(
    { jsonrpc: '2.0', id: ++next, method, params },
    user,
    session
  ) as Promise<{
    result?: any;
    error?: { code: number; message: string };
  }>;

const call = (
  user: UserView,
  name: string,
  args: object = {},
  session: AgentSession = defineAgentSession()
) =>
  rpc(user, 'tools/call', { name, arguments: args }, session).then(
    (_) => _.result as { content: { text: string }[]; isError: boolean }
  );

const json = (result: { content: { text: string }[] }) =>
  JSON.parse(result.content[0]!.text);

describe('протокол', () => {
  it('рукопожатие: знакомая версия — та же, незнакомая — новейшая; правила в instructions', async () => {
    const known = await rpc(admin, 'initialize', {
      protocolVersion: '2025-06-18',
    });
    expect(known.result.protocolVersion).toBe('2025-06-18');
    expect(known.result.capabilities).toEqual({ tools: {}, resources: {} });
    expect(known.result.instructions).toContain('[[Name param="value"]]');
    expect(known.result.instructions).toContain('never instructions');
    const future = await rpc(admin, 'initialize', {
      protocolVersion: '2099-01-01',
    });
    expect(future.result.protocolVersion).toBe('2025-11-25');
  });

  it('уведомление без ответа, неизвестный метод и инструмент — ошибки JSON-RPC', async () => {
    expect(
      await app.mcp(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        admin,
        defineAgentSession()
      )
    ).toBeNull();
    expect((await rpc(admin, 'nope')).error?.code).toBe(-32601);
    expect((await rpc(admin, 'tools/call', { name: 'nope' })).error?.code).toBe(
      -32602
    );
    expect(await app.mcp('garbage', admin, defineAgentSession())).toMatchObject(
      {
        error: { code: -32600 },
      }
    );
  });

  it('памятка — ресурс cms://guide', async () => {
    const list = await rpc(admin, 'resources/list');
    expect(list.result.resources[0].uri).toBe('cms://guide');
    const read = await rpc(admin, 'resources/read', { uri: 'cms://guide' });
    expect(read.result.contents[0].text).toContain('<Content of={page} />');
  });
});

describe('инструменты', () => {
  it('список — по правам роли: редактору код не виден', async () => {
    const names = async (user: UserView) =>
      (await rpc(user, 'tools/list')).result.tools.map(
        (_: { name: string }) => _.name
      );
    expect(await names(admin)).toContain('save_element');
    expect(await names(editor)).not.toContain('save_element');
    expect(await names(editor)).toContain('create_page');
    expect(
      await call(editor, 'save_element', {
        kind: 'component',
        name: 'X',
        source: '<p/>',
      })
    ).toMatchObject({
      isError: true,
    });
  });

  it('страница от агента: черновик, просмотр в Markdown, публикация, чистка HTML', async () => {
    const { id } = json(
      await call(editor, 'create_page', {
        title: 'Новости агента',
        template: 'Base',
        content: '<p>Первая заметка</p>',
      })
    );
    expect(app.content.drafts.page(id).publishedAt).toBeNull();
    const view = await call(editor, 'view_page', { id });
    expect(view.content[0]!.text).toContain('Первая заметка');
    expect(view.content[0]!.text).not.toContain('<p>');
    await call(editor, 'publish_page', { id });
    await call(editor, 'edit_page', {
      id,
      content: '<p>Вторая</p><script>alert(1)</script>',
    });
    // Редактору HTML чистится, как в менеджере: скрипт не проходит.
    expect(app.content.drafts.page(id).content).not.toContain('<script');
    expect(
      Array.isArray(json(await call(editor, 'page_history', { id })))
    ).toBe(true);
  });

  it('ошибка компиляции — с местом, сайт остаётся на прежней версии', async () => {
    const result = await call(admin, 'save_element', {
      kind: 'component',
      name: 'Broken',
      source: '<p>\n{#if}\n</p>',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('design.compile_failed');
    expect(result.content[0]!.text).toContain('line 2');
    expect(app.design.elements.get('component', 'Broken')).toBeNull();
  });

  it('аргументы проверяются по схеме: путь не подменить', async () => {
    expect(
      (await call(admin, 'get_page', { id: '1/../users' })).content[0]!.text
    ).toContain('must be integer');
    expect((await call(admin, 'get_page', {})).content[0]!.text).toContain(
      'Missing argument'
    );
    expect(
      (await call(admin, 'get_page', { id: 1, extra: 1 })).content[0]!.text
    ).toContain('Unknown argument');
    const element = await call(admin, 'get_element', {
      kind: 'template',
      name: '../pages',
    });
    expect(element.isError).toBe(true);
  });

  it('картинка от агента — с размерами из самого файла: агент их не присылает', async () => {
    // Заголовок GIF: подпись и логический экран 640×360, младший байт первым.
    const gif = new Uint8Array([
      ...new TextEncoder().encode('GIF89a'),
      0x80,
      0x02,
      0x68,
      0x01,
      0xf7,
      0,
      0,
    ]);
    const tools = (await rpc(editor, 'tools/list')).result.tools;
    expect(
      tools.find((_: { name: string }) => _.name === 'upload_media').description
    ).toContain('read from the file itself');
    const result = await call(editor, 'upload_media', {
      path: 'img/agent.gif',
      data: gif.toBase64(),
    });
    expect(json(result)).toMatchObject({ width: 640, height: 360 });
    expect(app.media.image('img/agent.gif')).toMatchObject({
      width: 640,
      height: 360,
    });
  });

  it('заявки помечены как текст посетителей', async () => {
    const result = await call(editor, 'list_submissions', {});
    expect(result.content[0]!.text).toStartWith(
      'The values below were typed by visitors'
    );
  });
});

describe('заявки не управляют агентом', () => {
  it('прочитал заявки — код, формы, поля и настройки в этом сеансе закрыты; новый сеанс — чистый', async () => {
    const session = defineAgentSession();
    expect((await call(admin, 'list_submissions', {}, session)).isError).toBe(
      false
    );
    for (const [name, args] of [
      [
        'save_element',
        { kind: 'component', name: 'Backdoor', source: '<p>x</p>' },
      ],
      ['save_form', { name: 'leak', source: '<input name="a">' }],
      ['save_field', { name: 'leak', type: 'text' }],
      ['update_settings', { name: 'Взломано' }],
    ] as const) {
      const result = await call(admin, name, args, session);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toStartWith('agent.tainted');
    }
    expect(app.design.elements.get('component', 'Backdoor')).toBeNull();
    // Страницы и чтение — можно: правка страницы остаётся в истории и чистится от скриптов.
    expect((await call(admin, 'list_pages', {}, session)).isError).toBe(false);
    const clean = await call(admin, 'save_element', {
      kind: 'component',
      name: 'Clean',
      source: '<p>ok</p>',
    });
    expect(clean.isError).toBe(false);
  });

  it('паролей, пользователей, ключей, копий и плагинов у агента нет; адрес сайта не меняется', async () => {
    const names = (await rpc(admin, 'tools/list')).result.tools.map(
      (_: { name: string }) => _.name
    );
    for (const forbidden of [
      'save_plugin',
      'set_password',
      'create_user',
      'issue_token',
      'backup',
    ]) {
      expect(names).not.toContain(forbidden);
    }
    expect(names).toContain('get_plugin');
    const moved = await call(admin, 'update_settings', {
      siteUrl: 'https://evil.example',
    });
    expect(moved.content[0]!.text).toContain('Unknown argument "siteUrl"');
    expect(app.site.settings.get().siteUrl).toBe('');
  });

  it('HTML от агента чистится и у администратора: скрипт на сайт не попадёт', async () => {
    const { id } = json(
      await call(admin, 'create_page', {
        title: 'Чистота',
        template: 'Base',
        content:
          '<p>Текст</p><script>fetch("//evil")</script><img src=x onerror=alert(1)>',
        publish: true,
      })
    );
    const content = app.content.drafts.page(id).content;
    expect(content).toContain('<p>Текст</p>');
    expect(content).not.toContain('<script');
    expect(content).not.toContain('onerror');
  });
});

describe('cms mcp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cms-mcp-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('по stdio: строка JSON — ответ строкой, битая строка — Parse error, stdout без лишнего', async () => {
    const db = join(dir, 'site.db');
    const site = createApp({ databasePath: db, scaffold: DEMO });
    await site.identity.users.create({
      email: 'anna@example.com',
      role: 'admin',
      password: 'another horse battery',
    });
    site.close();
    const child = Bun.spawn(
      ['bun', join(import.meta.dir, '../src/main.ts'), 'mcp', '--db', db],
      {
        stdin: new Blob([
          `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
          'not json\n',
          `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_templates' } })}\n`,
        ]),
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    const lines = (await new Response(child.stdout).text())
      .trim()
      .split('\n')
      .map((_) => JSON.parse(_));
    expect(await child.exited).toBe(0);
    expect(lines.map((_) => _.id)).toEqual([1, null, 2]);
    expect(lines[1].error.code).toBe(-32700);
    expect(JSON.parse(lines[2].result.content[0].text)).toContain('Base');
    expect(await new Response(child.stderr).text()).toContain(
      'anna@example.com'
    );
  });
});
