import { afterAll, beforeAll, beforeEach, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Поддельная модель в формате OpenAI: по очереди отдаёт заготовленные ответы и запоминает запросы.
let model: ReturnType<typeof Bun.serve>;
let script: unknown[] = [];
let received: any[] = [];

beforeAll(() => {
  model = Bun.serve({
    port: 0,
    fetch: (request) =>
      request.json().then((body) => {
        received.push(body);
        return Response.json({
          choices: [{ message: script.shift() ?? { content: 'Готово.' } }],
        });
      }),
  });
});

afterAll(() => model.stop(true));

const PASSWORD = 'correct horse battery';
let app: App;
let admin = '';
let editor = '';

const call = (method: string, path: string, body: unknown, cookie: string) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        cookie,
        'content-type': 'application/json',
        'accept-language': 'ru',
      },
      body: JSON.stringify(body),
    })
  );

const cookieOf = (response: Response) =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

const lines = (response: Response) =>
  response.text().then((text) =>
    text
      .trim()
      .split('\n')
      .map((_) => JSON.parse(_))
  );

const toolCall = (id: string, name: string, args: object) => ({
  content: '',
  tool_calls: [
    {
      id,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});

beforeEach(async () => {
  script = [];
  received = [];
  app = createApp({ scaffold: DEMO });
  admin = cookieOf(
    await call(
      'POST',
      '/setup',
      {
        token: app.identity.setup.token(),
        email: 'anna@example.com',
        name: 'Анна',
        password: PASSWORD,
      },
      ''
    )
  );
  await app.identity.users.create({
    email: 'ed@example.com',
    role: 'editor',
    password: PASSWORD,
  });
  editor = cookieOf(
    await call(
      'POST',
      '/session',
      { email: 'ed@example.com', password: PASSWORD },
      ''
    )
  );
  await call(
    'PUT',
    '/assistant',
    { url: `http://localhost:${model.port}`, model: 'fake', key: 'k' },
    admin
  );
});

it('агент вызывает инструменты по очереди, шаги идут потоком, последняя строка — ответ', async () => {
  script = [
    toolCall('1', 'create_page', {
      title: 'Акция',
      template: 'Base',
      content: '<p>Скидки</p>',
    }),
    toolCall('2', 'get_page', { id: 'не число' }),
    { content: 'Создал черновик «Акция».' },
  ];
  const response = await call(
    'POST',
    '/assistant/agent',
    {
      messages: [{ role: 'user', content: 'Сделай страницу акции' }],
      place: 'страница 1',
    },
    admin
  );
  expect(response.headers.get('content-type')).toStartWith(
    'application/x-ndjson'
  );
  const events = await lines(response);
  expect(events.map((_) => Object.keys(_)[0])).toEqual([
    'step',
    'step',
    'reply',
  ]);
  expect(events[0].step).toMatchObject({ tool: 'create_page', ok: true });
  expect(events[1].step).toMatchObject({ tool: 'get_page', ok: false });
  expect(events[2].reply).toMatchObject({
    reply: 'Создал черновик «Акция».',
    steps: 2,
    stopped: false,
  });
  expect(app.content.drafts.tree().some((_) => _.title === 'Акция')).toBe(true);

  // Модель видит инструменты, свой вызов и ответ инструмента; промпт знает место и язык менеджера.
  expect(received[0].tools.map((_: any) => _.function.name)).toContain(
    'save_element'
  );
  expect(received[0].messages[0].content).toContain('страница 1');
  expect(received[0].messages[0].content).toContain('(ru)');
  const last = received.at(-1).messages;
  expect(last.at(-1)).toMatchObject({ role: 'tool', tool_call_id: '2' });
  expect(last.at(-1).content).toContain('must be integer');
  expect(last.at(-2).tool_calls[0].function.name).toBe('get_page');
});

it('редактору — только его инструменты; код ему не сохранить и через агента', async () => {
  script = [
    toolCall('1', 'save_element', {
      kind: 'component',
      name: 'Hack',
      source: '<p/>',
    }),
    { content: 'Не могу.' },
  ];
  const events = await lines(
    await call(
      'POST',
      '/assistant/agent',
      { messages: [{ role: 'user', content: 'Сохрани компонент' }] },
      editor
    )
  );
  expect(received[0].tools.map((_: any) => _.function.name)).not.toContain(
    'save_element'
  );
  expect(events[0].step).toMatchObject({ tool: 'save_element', ok: false });
  expect(app.design.elements.get('component', 'Hack')).toBeNull();
});

it('шагов не больше предела: агент останавливается и говорит об этом', async () => {
  script = Array.from({ length: 20 }, (_, index) =>
    toolCall(String(index), 'list_templates', {})
  );
  const events = await lines(
    await call(
      'POST',
      '/assistant/agent',
      { messages: [{ role: 'user', content: 'Крутись' }] },
      admin
    )
  );
  expect(events.at(-1).reply).toMatchObject({ stopped: true, steps: 12 });
});

it('без подключения и без вопроса — ошибка последней строкой', async () => {
  const empty = await lines(
    await call('POST', '/assistant/agent', { messages: [] }, admin)
  );
  expect(empty.at(-1).error.code).toBe('assistant.empty_request');
  await call('DELETE', '/assistant', {}, admin);
  const off = await lines(
    await call(
      'POST',
      '/assistant/agent',
      { messages: [{ role: 'user', content: 'Привет' }] },
      admin
    )
  );
  expect(off.at(-1).error.code).toBe('assistant.not_connected');
});

it('ответ агента в менеджере: Markdown размечается, HTML из ответа — только текстом', async () => {
  const { replyHtml } = await import('../manager/src/lib/reply-html.ts');
  expect(replyHtml('**Готово.** Шаблон `Base`.\n\n- раз\n- два')).toBe(
    '<p><strong>Готово.</strong> Шаблон <code>Base</code>.</p><ul><li>раз</li><li>два</li></ul>'
  );
  expect(replyHtml('<img src=x onerror=alert(1)> **<b>x</b>**')).toBe(
    '<p>&lt;img src=x onerror=alert(1)&gt; <strong>&lt;b&gt;x&lt;/b&gt;</strong></p>'
  );
});

it('в разговоре после заявок код не сохраняется: заявка не командует агентом', async () => {
  script = [
    toolCall('1', 'list_submissions', {}),
    toolCall('2', 'save_element', {
      kind: 'component',
      name: 'Backdoor',
      source: '<p/>',
    }),
    { content: 'Не стал менять код.' },
  ];
  const events = await lines(
    await call(
      'POST',
      '/assistant/agent',
      { messages: [{ role: 'user', content: 'Разбери заявки' }] },
      admin
    )
  );
  expect(events[0].step).toMatchObject({ tool: 'list_submissions', ok: true });
  expect(events[1].step).toMatchObject({ tool: 'save_element', ok: false });
  expect(events[1].step.result).toStartWith('agent.tainted');
  expect(app.design.elements.get('component', 'Backdoor')).toBeNull();
  // Следующий запрос — новый сеанс: человек сам попросил, код сохраняется.
  script = [
    toolCall('3', 'save_element', {
      kind: 'component',
      name: 'Fine',
      source: '<p/>',
    }),
    { content: 'Готово.' },
  ];
  const next = await lines(
    await call(
      'POST',
      '/assistant/agent',
      { messages: [{ role: 'user', content: 'Сохрани компонент Fine' }] },
      admin
    )
  );
  expect(next[0].step).toMatchObject({ tool: 'save_element', ok: true });
});
