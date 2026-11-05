import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import type { Message, Transports } from '../src/contexts/notify/index.ts';
import { applyScaffold } from '../src/scaffolds/index.ts';
import {
  checkPackage,
  readPackageFolder,
  scaffoldPackage,
  textOf,
} from '../src/scaffolds/package/index.ts';
import { pull, push, readFolder } from '../src/workspace/index.ts';
import { DEMO } from './fixtures/demo.ts';
import { proofOf } from './fixtures/proof.ts';

// Форма, которая не хранит адрес и браузер посетителя: политика сайта обещает, что IP только в памяти для лимита.

const _IP = '198.51.100.23';
const _BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/150.0';
const _PASSWORD = 'correct horse battery';

let app: App;
let now: Date;
let sent: { channel: string; message: Message }[];
let hooks: string[];
let server: ReturnType<typeof Bun.serve>;
let page: number;

const transports: Transports = {
  telegram: {
    send: (_settings, _chat, message) => (
      sent.push({ channel: 'telegram', message }), Promise.resolve()
    ),
    me: () => Promise.resolve('@site_bot'),
    chats: () => Promise.resolve([]),
  },
  email: {
    send: (_settings, _to, message) => (
      sent.push({ channel: 'email', message }), Promise.resolve()
    ),
    mail: () => Promise.resolve(),
    probe: () => Promise.resolve({ ok: true, latencyMs: 1 }),
  },
};

const _SOURCE = `<div class="field" data-field="text" data-label="Имя">
  <label for="f-name">Имя</label><input id="f-name" name="name" required>
</div>
<div class="field" data-field="email" data-label="Почта">
  <label for="f-mail">Почта</label><input id="f-mail" name="mail" type="email" required>
</div>`;

beforeEach(() => {
  now = new Date('2026-11-05T10:00:00Z');
  sent = [];
  hooks = [];
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) =>
      request.text().then((body) => (hooks.push(body), new Response('ok'))),
  });
  app = createApp({ scaffold: DEMO, clock: () => now, transports });
  app.notify.settings.save({
    telegram: {
      token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ',
      chats: [{ id: '-100500', title: 'Менеджеры' }],
    },
    email: {
      host: 'smtp.test',
      security: 'none',
      from: 'site@example.com',
      to: 'boss@example.com',
    },
  });
  app.forms.forms.save('callback', {
    title: 'Звонок',
    source: _SOURCE,
    storeClientInfo: false,
    confirmation: { enabled: true, text: 'Спасибо, {name}!' },
    webhook: { url: `http://127.0.0.1:${server.port}/hook` },
  });
  page = app.content.pages.create({
    title: 'Контакты',
    alias: 'zvonok',
    template: 'Base',
    content: '[#Form:callback]',
    publish: true,
  });
});

afterEach(() => (app.close(), void server.stop(true)));

const submit = async (name: string) => {
  const html = await app
    .fetch(new Request('https://site.test/zvonok'))
    .then((_) => _.text());
  now = new Date(now.getTime() + 5000);
  return app.fetch(
    new Request('https://site.test/_cms/forms/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        origin: 'https://site.test',
        'user-agent': _BROWSER,
      },
      body: JSON.stringify({
        _stamp: [/name="_stamp" value="([^"]+)"/.exec(html)![1]!],
        _iat: [/name="_iat" value="([^"]+)"/.exec(html)![1]!],
        _page: [String(page)],
        ...proofOf(html),
        name: [name],
        mail: [`${name.toLowerCase()}@example.com`],
      }),
    }),
    { requestIP: () => ({ address: `::ffff:${_IP}` }) }
  );
};

const leaks = (text: string): string[] =>
  [_IP, _BROWSER, 'Firefox'].filter((_) => text.includes(_));

describe('форма без адреса и браузера посетителя', () => {
  it('заявка хранится без IP и User-Agent, а уведомления, письмо и вебхук их не несут', async () => {
    expect((await submit('Анна')).status).toBe(200);
    const [submission] = app.forms.inbox.list({ limit: 1 });
    expect(submission).toMatchObject({ ip: '', userAgent: '' });
    expect(leaks(JSON.stringify(submission))).toEqual([]);
    await app.notify.outbox.run();
    expect(sent.map((_) => _.channel).sort()).toEqual([
      'email',
      'email',
      'telegram',
    ]);
    expect(leaks(JSON.stringify(sent))).toEqual([]);
    expect(await app.forms.webhooks.run()).toBe(1);
    expect(hooks).toHaveLength(1);
    expect(leaks(hooks[0]!)).toEqual([]);
  });

  it('лимит отправок с адреса работает: адрес — в памяти, не в заявке', async () => {
    const names = ['Анна', 'Борис', 'Вера', 'Глеб', 'Дина'];
    for (const name of names) expect((await submit(name)).status).toBe(200);
    expect((await submit('Ева')).status).toBe(429);
    expect(app.forms.inbox.list({ limit: 10 }).map((_) => _.ip)).toEqual(
      names.map(() => '')
    );
  });

  it('по умолчанию адрес и браузер хранятся, как раньше', async () => {
    app.forms.forms.save('callback', { storeClientInfo: true });
    await submit('Анна');
    expect(app.forms.inbox.list({ limit: 1 })[0]).toMatchObject({
      ip: _IP,
      userAgent: _BROWSER,
    });
    expect(app.forms.forms.get('callback')!.storeClientInfo).toBe(true);
    app.forms.forms.save('fresh', { title: 'Новая', source: _SOURCE });
    expect(app.forms.forms.get('fresh')!.storeClientInfo).toBe(true);
  });

  it('только true или false: «false» строкой хранение молча не включит', () => {
    expect(() =>
      app.forms.forms.save('callback', {
        storeClientInfo: 'false' as unknown as boolean,
      })
    ).toThrow('Expected true or false');
    expect(app.forms.forms.get('callback')!.storeClientInfo).toBe(false);
  });

  it('CSV менеджера — с пустым IP', async () => {
    const call = (method: string, path: string, body?: unknown, cookie = '') =>
      app.fetch(
        new Request(`https://site.test/manager/api${path}`, {
          method,
          headers: {
            ...(cookie ? { cookie } : {}),
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
    const cookie = (
      await call('POST', '/setup', {
        token: app.identity.setup.token(),
        email: 'admin@example.com',
        password: _PASSWORD,
      })
    ).headers
      .get('set-cookie')!
      .split(';')[0]!;
    await submit('Анна');
    const csv = await (
      await call('GET', '/inbox.csv?lang=ru', undefined, cookie)
    ).text();
    expect(csv).toContain('Анна');
    expect(leaks(csv)).toEqual([]);
    const form = (await (
      await call('GET', '/forms/callback', undefined, cookie)
    ).json()) as { storeClientInfo: boolean };
    expect(form.storeClientInfo).toBe(false);
  });
});

describe('настройка в папке элементов', () => {
  let dir = '';
  beforeEach(
    () => void (dir = mkdtempSync(join(tmpdir(), 'cms-client-info-')))
  );
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('pull выкладывает storeClientInfo в forms/имя.json, push меняет её', async () => {
    await pull(app, dir);
    const file = join(dir, 'forms/callback.json');
    const settings = await Bun.file(file).json();
    expect(settings.storeClientInfo).toBe(false);
    await Bun.write(
      file,
      JSON.stringify({ ...settings, storeClientInfo: true }, null, 2)
    );
    expect(push(app, await readFolder(dir)).changed).toEqual([
      'forms/callback.html',
    ]);
    expect(app.forms.forms.get('callback')!.storeClientInfo).toBe(true);
  });

  it('файл без настройки (выложен до неё) не считается изменённым и её не трогает', async () => {
    await pull(app, dir);
    const file = join(dir, 'forms/callback.json');
    const { storeClientInfo: _, ...older } = await Bun.file(file).json();
    await Bun.write(file, JSON.stringify(older, null, 2));
    expect(push(app, await readFolder(dir)).changed).toEqual([]);
    expect(app.forms.forms.get('callback')!.storeClientInfo).toBe(false);
  });
});

describe('настройка в пакете каркаса', () => {
  it('forms/имя.json пакета ставит форму без адреса и браузера, а выгрузка каркаса её сохраняет', () => {
    const files = new Map(
      readPackageFolder(resolve(import.meta.dir, '../packages/beispiel')).files
    );
    const encode = (text: string) => new TextEncoder().encode(text);
    files.set('forms/anfrage.html', encode(_SOURCE));
    files.set(
      'forms/anfrage.json',
      encode(JSON.stringify({ title: 'Anfrage', storeClientInfo: false }))
    );
    const checked = checkPackage(files, {
      language: 'ru',
      allowPlugins: false,
    });
    expect(checked.problems).toEqual([]);
    const site = createApp();
    try {
      applyScaffold(checked.scaffold!, site);
      expect(site.forms.forms.get('anfrage')!.storeClientInfo).toBe(false);
    } finally {
      site.close();
    }
    expect(
      JSON.parse(
        textOf(scaffoldPackage(checked.scaffold!), 'forms/anfrage.json')
      )
    ).toMatchObject({ storeClientInfo: false });
  });
});
