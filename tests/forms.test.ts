import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import type { Message, Transports } from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;
let now: Date;
let sent: Message[];
let page: number;

const _SOURCE = `<div class="field" data-field="text" data-label="Имя">
  <label for="f-name">Имя</label><input id="f-name" name="name" required>
</div>
<div class="field" data-field="tel" data-label="Телефон">
  <label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" required pattern="\\+?[0-9 \\(\\)\\-]{10,}">
</div>
<div class="field" data-field="textarea" data-label="Комментарий">
  <label for="f-text">Комментарий</label><textarea id="f-text" name="text"></textarea>
</div>
<input type="hidden" name="product" data-source="page.title">`;

const transports: Transports = {
  telegram: {
    send: () => Promise.resolve(),
    me: () => Promise.resolve('@bot'),
    chats: () => Promise.resolve([]),
  },
  email: {
    send: (_settings, _to, item) => (sent.push(item), Promise.resolve()),
  },
};

const seconds = (count: number) =>
  void (now = new Date(now.getTime() + count * 1000));

beforeEach(() => {
  now = new Date('2026-10-30T10:00:00Z');
  sent = [];
  app = createApp({ scaffold: DEMO, clock: () => now, transports });
  app.notify.settings.save({
    email: {
      host: 'smtp.test',
      security: 'none',
      from: 'site@example.com',
      to: 'boss@example.com',
    },
  });
  app.forms.forms.save('callback', {
    title: 'Обратный звонок',
    source: _SOURCE,
    subject: 'Звонок: {name}',
  });
  page = app.content.pages.create({
    title: 'Кухни',
    alias: 'kuhni',
    template: 'Base',
    content: '<p>Оставьте заявку</p>[#Form:callback]',
    publish: true,
  });
});

afterEach(() => app.close());

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`https://site.test${path}`, { headers }));

const stampOf = (html: string) => ({
  _stamp: [/name="_stamp" value="([^"]+)"/.exec(html)![1]!],
  _iat: [/name="_iat" value="([^"]+)"/.exec(html)![1]!],
  _page: [String(page)],
});

const post = (
  fields: Record<string, string[]>,
  headers: Record<string, string> = {}
) =>
  app.fetch(
    new Request('https://site.test/_cms/forms/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        origin: 'https://site.test',
        ...headers,
      },
      body: JSON.stringify(fields),
    }),
    { requestIP: () => ({ address: '203.0.113.7' }) }
  );

// Ответ приёма формы: что смотрят тесты.
type Reply = {
  ok: boolean;
  stamp: { token: string };
  errors: Record<string, string>;
};
const reply = (response: Response) => response.json() as Promise<Reply>;

const fresh = async () => {
  const html = await (await get('/kuhni')).text();
  seconds(5);
  return stampOf(html);
};

const _GOOD = {
  name: ['Иван'],
  phone: ['+7 900 000-00-00'],
  text: ['Перезвоните'],
};

describe('форма на странице', () => {
  it('тег [#Form:имя] рисует форму со стилями и скриптом, страница остаётся в кэше', async () => {
    const first = await get('/kuhni');
    const html = await first.text();
    expect(html).toContain(
      '<p>Оставьте заявку</p><form class="cms-form" id="form-callback"'
    );
    expect(html).toContain('<style data-cms-form>');
    expect(html).toMatch(
      /<script type="module" src="\/_cms\/forms\/enhance\.[a-z0-9]+\.js">/
    );
    expect(html).toMatch(
      /name="product" data-source="page.title" value="Кухни"/
    );
    seconds(1);
    const second = await get('/kuhni');
    expect(second.headers.get('x-cache')).toBe('hit');
    expect(stampOf(await second.text())._iat).not.toEqual(stampOf(html)._iat);
  });

  it('скрипт улучшения отдаётся навсегда', async () => {
    const html = await (await get('/kuhni')).text();
    const src = /src="(\/_cms\/forms\/enhance\.[a-z0-9]+\.js)"/.exec(html)![1]!;
    const script = await get(src);
    expect(script.headers.get('cache-control')).toContain('immutable');
    expect(await script.text()).toContain('cms:form-sent');
  });

  it('ссылка [~id~] в форме — адрес страницы; подпись скрытого поля — data-label', async () => {
    const policy = app.content.pages.create({
      title: 'Политика',
      alias: 'policy',
      template: 'Base',
      publish: true,
    });
    app.forms.forms.save('callback', {
      source: `${_SOURCE}<div class="field" data-field="consent" data-label="Согласие"><label><input type="checkbox" name="ok" value="yes" required> Согласен с <a href="[~${policy}~]">политикой</a></label></div><input type="hidden" name="src" data-source="utm" data-label="Метки">`,
    });
    expect(await (await get('/kuhni')).text()).toContain(
      '<a href="/policy">политикой</a>'
    );
    expect(
      app.forms.forms.get('callback')!.fields.find((_) => _.name === 'src')!
        .label
    ).toBe('Метки');
  });

  it('незнакомый модуль — тег как есть', async () => {
    app.content.pages.edit(page, { content: '[#Poll:x]' });
    expect(await (await get('/kuhni')).text()).toContain('[#Poll:x]');
  });

  it('$core/Form — та же форма из шаблона', async () => {
    app.design.templates.save(
      'Landing',
      '<script>import Form from \'$core/Form\'; let { page } = $props();</script><h1>{page.title}</h1><Form name="callback" />'
    );
    app.content.pages.edit(page, { template: 'Landing' });
    expect(await (await get('/kuhni')).text()).toContain(
      'data-cms-form="callback"'
    );
  });
});

describe('приём заявки', () => {
  it('принята: сохранена со снимком полей и контекстом, уведомление ушло', async () => {
    const response = await post({
      ...(await fresh()),
      ..._GOOD,
      product: ['подмена'],
      _utm: ['utm_source=ya'],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, redirect: null });
    const [submission] = app.forms.inbox.list({ limit: 10 });
    expect(submission).toMatchObject({
      form: 'callback',
      formTitle: 'Обратный звонок',
      status: 'new',
      ip: '203.0.113.7',
      readAt: null,
      context: { pageId: page, pageTitle: 'Кухни', utm: { utm_source: 'ya' } },
    });
    // Скрытое поле страницы — с сервера: подмена из браузера не проходит.
    expect(submission!.values.find((_) => _.name === 'product')!.value).toBe(
      'Кухни'
    );
    await app.notify.outbox.run();
    expect(sent[0]).toMatchObject({ topic: 'forms', title: 'Звонок: Иван' });
    expect(sent[0]!.fields).toContainEqual({
      label: 'Телефон',
      value: '+7 900 000-00-00',
    });
  });

  it('ошибки полей — по правилам HTML5', async () => {
    const response = await post({
      ...(await fresh()),
      name: [''],
      phone: ['12'],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      errors: {
        name: 'Заполните это поле',
        phone: 'Значение не подходит по формату',
      },
    });
    expect(app.forms.inbox.list({ limit: 10 })).toEqual([]);
  });

  it('устаревшая или поддельная печать — 409 и новая печать', async () => {
    const response = await post({
      ...(await fresh()),
      _stamp: ['forged'],
      ..._GOOD,
    });
    expect(response.status).toBe(409);
    expect((await reply(response)).stamp.token).toBeString();
  });

  it('быстрее пары секунд — не человек', async () => {
    const html = await (await get('/kuhni')).text();
    seconds(1);
    const response = await post({ ...stampOf(html), ..._GOOD });
    expect(response.status).toBe(429);
  });

  it('ловушка заполнена — успех без записи', async () => {
    const response = await post({
      ...(await fresh()),
      ..._GOOD,
      company_website: ['http://spam'],
    });
    expect((await reply(response)).ok).toBe(true);
    expect(app.forms.inbox.list({ limit: 10 })).toEqual([]);
  });

  it('двойная отправка той же печатью — одна заявка', async () => {
    const stamp = await fresh();
    await post({ ...stamp, ..._GOOD });
    const again = await post({ ...stamp, ..._GOOD });
    expect((await reply(again)).ok).toBe(true);
    expect(app.forms.inbox.list({ limit: 10 })).toHaveLength(1);
  });

  it('ссылки в тексте — спам: сохранён, но без уведомления', async () => {
    await post({
      ...(await fresh()),
      ..._GOOD,
      text: ['Дёшево: cheap-pills.xyz'],
    });
    expect(app.forms.inbox.list({ limit: 10 })).toEqual([]);
    expect(app.forms.inbox.list({ status: 'spam', limit: 10 })).toHaveLength(1);
    await app.notify.outbox.run();
    expect(sent).toEqual([]);
  });

  it('больше пяти заявок за 10 минут с адреса — подождать', async () => {
    const statuses: number[] = [];
    for (const index of [1, 2, 3, 4, 5, 6]) {
      const response = await post({
        ...(await fresh()),
        ..._GOOD,
        text: [`№${index}`],
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('с чужого сайта — 403', async () => {
    const response = await post(
      { ...(await fresh()), ..._GOOD },
      { origin: 'https://evil.test' }
    );
    expect(response.status).toBe(403);
  });

  it('незнакомая форма — 404', async () => {
    const response = await app.fetch(
      new Request('https://site.test/_cms/forms/nope', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: '{}',
      })
    );
    expect(response.status).toBe(404);
  });
});

describe('без JS', () => {
  const postForm = (fields: Record<string, string[]>) =>
    app.fetch(
      new Request('https://site.test/_cms/forms/callback', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://site.test',
        },
        body: new URLSearchParams(
          Object.entries(fields).flatMap(({ 0: name, 1: values }) =>
            values.map((_) => [name, _] as [string, string])
          )
        ),
      })
    );

  it('успех — переход обратно со «спасибо» вместо формы', async () => {
    const response = await postForm({ ...(await fresh()), ..._GOOD });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/kuhni?sent=callback#form-callback'
    );
    const html = await (await get('/kuhni?sent=callback')).text();
    expect(html).toContain(
      'class="cms-form cms-form-sent" id="form-callback" role="status"'
    );
    expect(html).not.toContain('data-cms-form="callback"');
  });

  it('ошибка — обратно с введённым и ошибками у полей', async () => {
    const response = await postForm({
      ...(await fresh()),
      name: ['Иван'],
      phone: ['12'],
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/kuhni#form-callback');
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    const html = await (
      await get('/kuhni', { cookie: cookie.split(';')[0]! })
    ).text();
    expect(html).toContain('value="Иван"');
    expect(html).toContain('<p class="field-error" id="callback-err-phone">');
    expect(html).toContain(
      '<p class="cms-form-message" role="alert">Проверьте поля формы</p>'
    );
  });

  it('страница «Спасибо» из настроек формы', async () => {
    const thanks = app.content.pages.create({
      title: 'Спасибо',
      alias: 'spasibo',
      template: 'Base',
      publish: true,
    });
    app.forms.forms.save('callback', { successPage: thanks });
    const response = await postForm({ ...(await fresh()), ..._GOOD });
    expect(response.headers.get('location')).toBe('/spasibo');
  });
});

describe('хранение', () => {
  it('заявки старше срока формы удаляются', async () => {
    await post({ ...(await fresh()), ..._GOOD });
    now = new Date(now.getTime() + 31 * 86_400_000);
    expect(app.forms.purge()).toBe(1);
    expect(app.forms.inbox.list({ limit: 10 })).toEqual([]);
  });

  it('секрет печатей в копию сайта не попадает, формы и заявки — попадают', async () => {
    await post({ ...(await fresh()), ..._GOOD });
    const archive = app.archive();
    expect(Object.keys(archive.tables)).toContain('forms_submissions');
    expect(Object.keys(archive.tables)).not.toContain('forms_secret');
  });
});

describe('заявки и формы в менеджере', () => {
  let cookie = '';
  const _PASSWORD = 'correct horse battery';

  const call = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ) =>
    app.fetch(
      new Request(`https://site.test/manager/api${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );

  const signIn = (email: string) =>
    call('POST', '/session', { email, password: _PASSWORD }).then(
      (_) => void (cookie = (_.headers.get('set-cookie') ?? '').split(';')[0]!)
    );

  beforeEach(async () => {
    cookie = '';
    const setup = await call('POST', '/setup', {
      token: app.identity.setup.token(),
      email: 'admin@example.com',
      password: _PASSWORD,
    });
    cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
    await post({ ...(await fresh()), ..._GOOD });
  });

  it('сводка для конверта: непрочитанные, по формам, последние', async () => {
    const summary = (await (await call('GET', '/inbox/summary')).json()) as {
      unread: number;
      today: number;
      byForm: unknown[];
      daily: number[];
      latest: { preview: string; read: boolean }[];
    };
    expect(summary).toMatchObject({ unread: 1, today: 1 });
    expect(summary.byForm).toEqual([
      { form: 'callback', title: 'Обратный звонок', unread: 1, total: 1 },
    ]);
    expect(summary.daily).toHaveLength(14);
    expect(summary.daily.at(-1)).toBe(1);
    expect(summary.latest[0]).toMatchObject({
      preview: 'Иван · +7 900 000-00-00 · Перезвоните',
      read: false,
    });
  });

  it('открытие — прочитана, статус и заметка; поиск по значениям', async () => {
    const [row] = (await (await call('GET', '/inbox')).json()) as {
      id: number;
    }[];
    const opened = (await (await call('GET', `/inbox/${row!.id}`)).json()) as {
      readAt: string | null;
      deliveries: unknown[];
    };
    expect(opened.readAt).not.toBeNull();
    expect(opened.deliveries).toHaveLength(1);
    const changed = await call('PATCH', `/inbox/${row!.id}`, {
      status: 'done',
      note: 'Перезвонили',
    });
    expect(await changed.json()).toMatchObject({
      status: 'done',
      note: 'Перезвонили',
    });
    expect(await (await call('GET', '/inbox?q=иван')).json()).toHaveLength(1);
    expect(await (await call('GET', '/inbox?q=пётр')).json()).toHaveLength(0);
    expect(await (await call('GET', '/inbox?unread=1')).json()).toHaveLength(0);
  });

  it('CSV для Excel: BOM, точка с запятой, подписи полей столбцами', async () => {
    const csv = await (await call('GET', '/inbox.csv')).text();
    expect(
      csv.startsWith('﻿№;Дата;Форма;Статус;Имя;Телефон;Комментарий;product')
    ).toBe(true);
    expect(csv).toContain(
      ';Обратный звонок;new;Иван;+7 900 000-00-00;Перезвоните;Кухни;'
    );
  });

  it('редактор разбирает заявки, но формы не правит', async () => {
    await call('POST', '/users', {
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    await signIn('editor@example.com');
    expect((await call('GET', '/inbox')).status).toBe(200);
    expect((await call('GET', '/forms')).status).toBe(200);
    expect((await call('GET', '/forms/callback')).status).toBe(403);
    expect((await call('PUT', '/forms/x', { title: 'X' })).status).toBe(403);
  });

  it('форма: поля по HTML, «только создать», предпросмотр в песочнице', async () => {
    const form = (await (await call('GET', '/forms/callback')).json()) as {
      fields: { name: string }[];
    };
    expect(form.fields.map((_) => _.name)).toEqual([
      'name',
      'phone',
      'text',
      'product',
    ]);
    const twin = await call(
      'PUT',
      '/forms/callback',
      { title: 'X' },
      { 'if-none-match': '*' }
    );
    expect(twin.status).toBe(409);
    const preview = await call('POST', '/forms/preview', {
      source: '<input name="a" required>',
      submitLabel: 'Жду',
    });
    expect(preview.headers.get('content-security-policy')).toBe('sandbox');
    expect(await preview.text()).toContain(
      '<button type="submit">Жду</button>'
    );
    expect(
      await (
        await call('POST', '/forms/fields', {
          source: '<input name="b" type="email">',
        })
      ).json()
    ).toMatchObject([{ name: 'b', kind: 'email' }]);
  });

  it('удаление формы: где стоит её тег, после — тег пуст, заявки остаются', async () => {
    expect(
      await (await call('GET', '/forms/callback/usage')).json()
    ).toMatchObject({ pages: [{ id: page, title: 'Кухни', trashed: false }] });
    expect((await call('DELETE', '/forms/callback')).status).toBe(200);
    expect(await (await call('GET', '/forms')).json()).toEqual([]);
    expect(await (await get('/kuhni')).text()).not.toContain('cms-form');
    expect(await (await call('GET', '/inbox')).json()).toMatchObject([
      { form: 'callback' },
    ]);
    expect((await call('DELETE', '/forms/callback')).status).toBe(404);
  });
});
