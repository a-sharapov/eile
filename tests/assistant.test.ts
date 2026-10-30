import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Поддельная модель в формате OpenAI: отвечает заготовкой и запоминает, что ей прислали.
let model: ReturnType<typeof Bun.serve>;
let received: { headers: Headers; body: any }[] = [];
let reply: { status: number; body: unknown } = {
  status: 200,
  body: { choices: [{ message: { content: '«Кухни мечты»' } }] },
};

beforeAll(() => {
  model = Bun.serve({
    port: 0,
    fetch: (request) =>
      request.json().then((body) => {
        received.push({ headers: request.headers, body });
        return Response.json(reply.body, { status: reply.status });
      }),
  });
});

afterAll(() => model.stop(true));

let app: App;
let admin: string;
const _PASSWORD = 'correct horse battery';

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

const json = (response: Response) => response.json() as Promise<any>;
const cookieOf = (response: Response) =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

const connect = () =>
  call('PUT', '/assistant', {
    url: `http://localhost:${model.port}`,
    model: 'fake-model',
    key: 'secret-key',
    instructions: 'Пишем на «вы»',
  });

const generate = (target: object, request = 'сделай живее', cookie = admin) =>
  call('POST', '/assistant/generate', { target, request }, cookie);

beforeEach(async () => {
  received = [];
  reply = {
    status: 200,
    body: { choices: [{ message: { content: '«Кухни мечты»' } }] },
  };
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
});

afterEach(() => app.close());

describe('ИИ в менеджере', () => {
  it('без подключения — понятная ошибка, и сессия говорит, что палочек нет', async () => {
    expect((await json(await call('GET', '/session'))).ai).toBe(false);
    const response = await generate({ kind: 'text', label: 'Заголовок' });
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe('assistant.not_connected');
  });

  it('подключение сохраняется без выдачи ключа; генерация шлёт ключ и системный промпт', async () => {
    const status = await json(await connect());
    expect(status).toEqual({
      connected: true,
      url: `http://localhost:${model.port}`,
      model: 'fake-model',
      instructions: 'Пишем на «вы»',
    });
    expect((await json(await call('GET', '/session'))).ai).toBe(true);

    const result = await json(
      await generate({
        kind: 'text',
        label: 'Заголовок',
        value: 'Кухни',
        maxLength: 60,
        area: 'страница',
      })
    );
    expect(result.text).toBe('Кухни мечты');
    const sent = received.at(-1)!;
    expect(sent.headers.get('authorization')).toBe('Bearer secret-key');
    expect(sent.body.model).toBe('fake-model');
    expect(sent.body.messages[0].content).toContain('Поле: «Заголовок»');
    expect(sent.body.messages[0].content).toContain('Указания владельца сайта');
    expect(sent.body.messages[1].content).toContain('сделай живее');
  });

  it('проверка подключения и ошибка модели — ответ шлюза с её текстом', async () => {
    await connect();
    expect((await json(await call('POST', '/assistant/test'))).reply).toBe(
      '«Кухни мечты»'
    );
    reply = { status: 401, body: { error: { message: 'Invalid key' } } };
    const response = await generate({ kind: 'text', label: 'Заголовок' });
    expect(response.status).toBe(502);
    expect((await json(response)).error.message).toContain('Invalid key');
  });

  it('редактор генерирует тексты, но не код шаблонов', async () => {
    await connect();
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
    expect(
      (await generate({ kind: 'text', label: 'Анонс' }, 'коротко', editor))
        .status
    ).toBe(200);
    expect(
      (await generate({ kind: 'template', label: 'Код' }, 'футер', editor))
        .status
    ).toBe(403);
    expect((await call('GET', '/assistant', undefined, editor)).status).toBe(
      403
    );
  });

  it('ключ ИИ не попадает в копию сайта и переживает восстановление', async () => {
    await connect();
    const archive = await json(await call('GET', '/backup?format=json'));
    expect(Object.keys(archive.tables)).not.toContain('assistant_connection');
    const copy = new Uint8Array(
      await (await call('GET', '/backup?format=db')).arrayBuffer()
    );
    await call('DELETE', '/assistant');
    await connect();
    await app.fetch(
      new Request('http://localhost/manager/api/backup', {
        method: 'POST',
        headers: { cookie: admin },
        body: copy,
      })
    );
    expect((await json(await call('GET', '/assistant'))).connected).toBe(true);
  });
});

describe('ИИ: аудит', () => {
  const editorCookie = async () => {
    await call('POST', '/users', {
      email: 'editor@example.com',
      name: 'Редактор',
      role: 'editor',
      password: _PASSWORD,
    });
    return cookieOf(
      await call(
        'POST',
        '/session',
        { email: 'editor@example.com', password: _PASSWORD },
        ''
      )
    );
  };

  it('ключ не уходит на новый хост: его вводят заново', async () => {
    await connect();
    const moved = await call('PUT', '/assistant', {
      url: 'http://127.0.0.1:9',
      model: 'fake-model',
    });
    expect(moved.status).toBe(422);
    expect((await json(moved)).error.code).toBe('assistant.no_key');
    const samePath = await call('PUT', '/assistant', {
      url: `http://localhost:${model.port}/v1`,
      model: 'other-model',
    });
    expect(samePath.status).toBe(200);
  });

  it('редирект API не выполняется', async () => {
    const hop = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(null, {
          status: 307,
          headers: { location: `http://localhost:${model.port}` },
        }),
    });
    await call('PUT', '/assistant', {
      url: `http://localhost:${hop.port}`,
      model: 'fake-model',
      key: 'secret-key',
    });
    const response = await generate({ kind: 'text', label: 'Заголовок' });
    expect(response.status).toBe(502);
    expect(received).toHaveLength(0);
    hop.stop(true);
  });

  it('редактор не видит ответ стороннего сервиса об ошибке', async () => {
    await connect();
    reply = { status: 403, body: { error: { message: 'INTERNAL-SECRET' } } };
    const editor = await editorCookie();
    const response = await generate(
      { kind: 'text', label: 'Анонс' },
      'коротко',
      editor
    );
    const body = await json(response);
    expect(body.error.code).toBe('assistant.unavailable');
    expect(JSON.stringify(body)).not.toContain('INTERNAL-SECRET');
    const asAdmin = await json(
      await generate({ kind: 'text', label: 'Анонс' })
    );
    expect(asAdmin.error.message).toContain('INTERNAL-SECRET');
  });

  it('не больше двух генераций разом у одного человека', async () => {
    await connect();
    const statuses = await Promise.all(
      [1, 2, 3].map((i) =>
        generate({ kind: 'text', label: `Поле ${i}` }).then((_) => _.status)
      )
    );
    expect(statuses.filter((_) => _ === 429)).toHaveLength(1);
  });
});
