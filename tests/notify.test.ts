import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import {
  type Message,
  message,
  type Transports,
} from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;
let now: Date;
let sent: { channel: string; to: string; message: Message }[];
let telegramFails: Error | null;
let admin = '';

const _TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ';
const _PASSWORD = 'correct horse battery';

const transports: Transports = {
  telegram: {
    send: (_settings, chat, item) =>
      telegramFails
        ? Promise.reject(telegramFails)
        : (sent.push({ channel: 'telegram', to: chat, message: item }),
          Promise.resolve()),
    me: () => Promise.resolve('@site_bot'),
    chats: () => Promise.resolve([{ id: '-100500', title: 'Менеджеры' }]),
  },
  email: {
    send: (_settings, to, item) => (
      sent.push({ channel: 'email', to: to.join(','), message: item }),
      Promise.resolve()
    ),
  },
};

const call = (method: string, path: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(admin ? { cookie: admin } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const json = (response: Response) => response.json() as Promise<any>;

const configure = () =>
  app.notify.settings.save({
    telegram: { token: _TOKEN, chats: [{ id: '-100500', title: 'Менеджеры' }] },
    email: {
      host: 'smtp.example.com',
      user: 'site@example.com',
      password: 'secret',
      from: 'site@example.com',
      to: 'boss@example.com',
    },
  });

const minutes = (count: number) =>
  void (now = new Date(now.getTime() + count * 60_000));

beforeEach(async () => {
  now = new Date('2026-10-30T10:00:00Z');
  sent = [];
  telegramFails = null;
  admin = '';
  app = createApp({ scaffold: DEMO, clock: () => now, transports });
  const setup = await call('POST', '/setup', {
    token: app.identity.setup.token(),
    email: 'admin@example.com',
    password: _PASSWORD,
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  sent = [];
});

afterEach(() => app.close());

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));

describe('очередь отправки', () => {
  it('уведомление уходит в каждый настроенный канал по маршруту', async () => {
    configure();
    const ids = app.notify.send(
      message({ topic: 'forms', title: 'Заявка' }),
      null,
      'submission:1'
    );
    expect(ids).toHaveLength(2);
    expect(await app.notify.outbox.run()).toBe(2);
    expect(sent.map((_) => `${_.channel}→${_.to}`)).toEqual([
      'telegram→-100500',
      'email→boss@example.com',
    ]);
    expect(
      app.notify.outbox.bySource('submission:1').map((_) => _.status)
    ).toEqual(['sent', 'sent']);
  });

  it('ненастроенный канал — ничего в очереди', () => {
    expect(
      app.notify.send(message({ topic: 'forms', title: 'Заявка' }), null, null)
    ).toEqual([]);
  });

  it('временный отказ — повтор по расписанию, до срока не трогаем', async () => {
    configure();
    app.notify.send(
      message({ topic: 'forms', title: 'Заявка' }),
      ['telegram'],
      's'
    );
    telegramFails = new Error('ETIMEDOUT');
    await app.notify.outbox.run();
    const [first] = app.notify.outbox.bySource('s');
    expect(first).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'ETIMEDOUT',
    });
    telegramFails = null;
    expect(await app.notify.outbox.run()).toBe(0);
    minutes(2);
    expect(await app.notify.outbox.run()).toBe(1);
    expect(app.notify.outbox.bySource('s')[0]!.status).toBe('sent');
  });

  it('отказ насовсем — о недоставленной заявке другим каналом', async () => {
    configure();
    app.notify.send(
      message({ topic: 'forms', title: 'Заявка' }),
      ['telegram'],
      's'
    );
    telegramFails = Object.assign(
      new Error('Forbidden: bot was blocked by the user'),
      {
        permanent: true,
      }
    );
    await app.notify.outbox.run();
    expect(app.notify.outbox.bySource('s')[0]!.status).toBe('failed');
    await app.notify.outbox.run();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: 'email' });
    expect(sent[0]!.message).toMatchObject({
      severity: 'critical',
      title: 'Не доставлено: Заявка',
    });
  });

  it('«ещё раз» — сразу и с полным расписанием', async () => {
    configure();
    app.notify.send(
      message({ topic: 'forms', title: 'Заявка' }),
      ['telegram'],
      's'
    );
    telegramFails = Object.assign(new Error('chat not found'), {
      permanent: true,
    });
    await app.notify.outbox.run();
    telegramFails = null;
    const [failed] = app.notify.outbox.bySource('s');
    expect(
      (await call('POST', `/notify/outbox/${failed!.id}/retry`)).status
    ).toBe(200);
    await app.notify.outbox.run();
    expect(app.notify.outbox.bySource('s')[0]).toMatchObject({
      status: 'sent',
      attempts: 1,
    });
  });
});

describe('сбои сайта', () => {
  const boom = () => {
    app.design.templates.save(
      'Boom',
      "<script>let { page } = $props(); const fail = () => { throw new Error('boom'); };</script><p>{fail()}</p>"
    );
    return app.content.pages.create({
      title: 'Сломанная',
      alias: 'broken',
      template: 'Boom',
      publish: true,
    });
  };

  it('500 на сайте — критично, со стеком; повторы за 15 минут склеиваются', async () => {
    configure();
    boom();
    expect((await get('/broken')).status).toBe(500);
    expect((await get('/broken')).status).toBe(500);
    await app.notify.outbox.run();
    expect(sent.map((_) => _.channel)).toEqual(['telegram', 'email']);
    expect(sent[0]!.message).toMatchObject({
      topic: 'incidents',
      severity: 'critical',
      title: 'Сайт ответил 500 на /broken',
      mono: true,
    });
    expect(sent[0]!.message.text).toContain('boom');
    const journal = await json(await call('GET', '/notify/incidents'));
    expect(journal[0]).toMatchObject({ kind: 'site.error', count: 2 });
    minutes(16);
    await get('/broken');
    await app.notify.outbox.run();
    expect(sent.at(-1)!.message.fields).toEqual([
      { label: 'Повторялось', value: expect.stringContaining('1 раз') },
    ]);
  });

  it('ниже порога — только журнал', async () => {
    configure();
    await call('POST', '/users', {
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    await app.notify.outbox.run();
    expect(sent).toEqual([]);
    const journal = await json(await call('GET', '/notify/incidents'));
    expect(journal.map((_: any) => _.kind)).toContain('identity.user_created');
    app.notify.settings.save({ level: 'info' });
    await call('POST', '/users', {
      email: 'second@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    await app.notify.outbox.run();
    expect(sent.map((_) => _.message.title)).toContain(
      'В менеджере новый пользователь'
    );
  });

  it('упавший регион — пусто на странице и сообщение', async () => {
    configure();
    app.design.components.save(
      'Cart',
      "<script>const fail = () => { throw new Error('cart down'); };</script><p>{fail()}</p>"
    );
    app.design.templates.save(
      'Base',
      '<script>import Uncached from \'$core/Uncached\'; let { page } = $props();</script><h1>{page.title}</h1><Uncached name="Cart" />'
    );
    const response = await get('/kontakty');
    expect(response.status).toBe(200);
    await app.notify.outbox.run();
    expect(sent[0]!.message.title).toBe(
      'Не отрисовался регион Cart на /kontakty'
    );
  });
});

describe('язык уведомлений', () => {
  const broken = () => (
    app.design.templates.save(
      'Boom',
      "<script>let { page } = $props(); const fail = () => { throw new Error('boom'); };</script><p>{fail()}</p>"
    ),
    app.content.pages.create({
      title: 'Сломанная',
      alias: 'broken',
      template: 'Boom',
      publish: true,
    })
  );
  const journal = (language: string) =>
    app
      .fetch(
        new Request('http://localhost/manager/api/notify/incidents', {
          headers: { cookie: admin, 'accept-language': language },
        })
      )
      .then(json);

  it('по умолчанию — язык сайта, в настройках — свой; журнал читают на своём', async () => {
    configure();
    broken();
    await get('/broken');
    await get('/broken');
    await app.notify.outbox.run();
    expect(sent[0]!.message).toMatchObject({
      title: 'Сайт ответил 500 на /broken',
      language: 'ru',
    });
    app.notify.settings.save({ language: 'de' });
    minutes(16);
    await get('/broken');
    await app.notify.outbox.run();
    expect(sent.at(-1)!.message).toMatchObject({
      title: 'Die Website antwortete 500 auf /broken',
      language: 'de',
      fields: [
        { label: 'Wiederholt', value: expect.stringContaining('1-mal') },
      ],
    });
    expect((await journal('en'))[0]).toMatchObject({
      title: 'The site answered 500 on /broken',
      detail: expect.stringContaining('boom'),
    });
    expect((await journal('ru'))[0].title).toBe('Сайт ответил 500 на /broken');
  });

  it('проверка канала — на языке уведомлений; null возвращает язык сайта', async () => {
    configure();
    app.notify.settings.save({ language: 'en' });
    await call('POST', '/notify/test', { channel: 'email' });
    expect(sent[0]!.message.title).toBe('Notification test');
    expect(
      await json(await call('PUT', '/notify', { language: null }))
    ).toMatchObject({ language: null });
    await call('POST', '/notify/test', { channel: 'email' });
    expect(sent[1]!.message.title).toBe('Проверка уведомлений');
  });

  it('незнакомый язык — 422', async () => {
    const response = await call('PUT', '/notify', { language: 'fr' });
    expect(response.status).toBe(422);
    expect((await json(response)).error.code).toBe('notify.invalid_language');
  });
});

describe('настройки в менеджере', () => {
  it('токен и пароль не уходят в менеджер; пустые — прежние', async () => {
    configure();
    const status = await json(await call('GET', '/notify'));
    expect(JSON.stringify(status)).not.toContain(_TOKEN);
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(status.telegram).toMatchObject({ hasToken: true });
    expect(status.email).toMatchObject({ hasPassword: true, port: 465 });
    const saved = await json(
      await call('PUT', '/notify', {
        telegram: { token: '', chats: status.telegram.chats, proxy: '' },
        forms: ['email'],
      })
    );
    expect(saved).toMatchObject({
      forms: ['email'],
      telegram: { hasToken: true },
    });
  });

  it('ошибка в форме — код и 422', async () => {
    const response = await call('PUT', '/notify', {
      telegram: { token: 'nope' },
    });
    expect(response.status).toBe(422);
    expect((await json(response)).error.code).toBe('notify.invalid_token');
  });

  it('проверка канала, имя бота и чаты', async () => {
    configure();
    expect(
      (await call('POST', '/notify/test', { channel: 'telegram' })).status
    ).toBe(200);
    expect(sent[0]!.message.title).toBe('Проверка уведомлений');
    expect(await json(await call('POST', '/notify/telegram/bot', {}))).toEqual({
      bot: '@site_bot',
    });
    expect(
      await json(await call('POST', '/notify/telegram/chats', {}))
    ).toEqual([{ id: '-100500', title: 'Менеджеры' }]);
  });

  it('проверка ненастроенного канала — понятный отказ', async () => {
    const response = await call('POST', '/notify/test', { channel: 'email' });
    expect(response.status).toBe(502);
    expect((await json(response)).error.code).toBe('notify.test_failed');
  });

  it('редактору раздел недоступен', async () => {
    await call('POST', '/users', {
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    const signed = await call('POST', '/session', {
      email: 'editor@example.com',
      password: _PASSWORD,
    });
    admin = (signed.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await call('GET', '/notify')).status).toBe(403);
  });
});

it('каналы и очередь — настройка сервера: в копию сайта не попадают', () => {
  configure();
  app.notify.send(message({ topic: 'forms', title: 'Заявка' }), null, 's');
  const archive = JSON.stringify(app.archive());
  expect(archive).not.toContain(_TOKEN);
  expect(archive).not.toContain('notify_outbox');
});
