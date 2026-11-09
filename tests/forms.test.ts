import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import type { Message, Transports } from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';
import { proofOf } from './fixtures/proof.ts';

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
    mail: () => Promise.resolve(),
    probe: () => Promise.resolve({ ok: true, latencyMs: 1 }),
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

// Печать и решение задачи защиты первой формы страницы — как их пришлёт скрипт формы.
const stampOf = (html: string) => ({
  _stamp: [/name="_stamp" value="([^"]+)"/.exec(html)![1]!],
  _iat: [/name="_iat" value="([^"]+)"/.exec(html)![1]!],
  _page: [String(page)],
  ...proofOf(html),
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

  it('скрипт улучшения отдаётся навсегда и улучшает формы, появившиеся позже, по разу', async () => {
    const html = await (await get('/kuhni')).text();
    const src = /src="(\/_cms\/forms\/enhance\.[a-z0-9]+\.js)"/.exec(html)![1]!;
    const script = await get(src);
    expect(script.headers.get('cache-control')).toContain('immutable');
    const text = await script.text();
    expect(text).toContain('cms:form-sent');
    // Поведение в браузере проверено в Chrome (ADR 0060): здесь — что скрипт следит за документом и метит форму.
    expect(text).toContain('new MutationObserver(');
    expect(text).toContain("Symbol.for('cms:form-enhanced')");
    expect(text).toContain("form.querySelector('template[data-sent]')");
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

  it('подписи уведомления — на языке уведомлений, поля — как на сайте', async () => {
    app.notify.settings.save({ language: 'en' });
    await post({ ...(await fresh()), ..._GOOD });
    await app.notify.outbox.run();
    expect(sent[0]).toMatchObject({ title: 'Звонок: Иван', language: 'en' });
    expect(sent[0]!.fields.map((_) => _.label)).toEqual(
      expect.arrayContaining(['Телефон', 'Page'])
    );
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

  it('своя разметка ответа: без JS — из <template data-sent> со ссылкой на страницу, с JS — в форме', async () => {
    app.forms.forms.save('callback', {
      source: `${_SOURCE}<template data-sent><h2 id="done" tabindex="-1">Перезвоним</h2><p>Пока — <a href="[~${page}~]">кухни</a>.</p></template>`,
    });
    expect(app.forms.forms.get('callback')!.fields.map((_) => _.name)).toEqual([
      'name',
      'phone',
      'text',
      'product',
    ]);
    const form = await (await get('/kuhni')).text();
    expect(form).toContain(
      '<template data-sent><h2 id="callback-done" tabindex="-1">Перезвоним</h2><p>Пока — <a href="/kuhni">кухни</a>.</p></template>'
    );
    seconds(5);
    expect(
      (await postForm({ ...stampOf(form), ..._GOOD })).headers.get('location')
    ).toBe('/kuhni?sent=callback#form-callback');
    const html = await (await get('/kuhni?sent=callback')).text();
    expect(html).toContain(
      '<div class="cms-form cms-form-sent" id="form-callback" role="status"><h2 id="callback-done" tabindex="-1">Перезвоним</h2><p>Пока — <a href="/kuhni">кухни</a>.</p></div>'
    );
    expect(html).not.toContain(app.forms.forms.get('callback')!.successText);
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
    // Страница с номером: заявки от offset и сколько всего под фильтром.
    expect(
      await (await call('GET', '/inbox/page?offset=0&limit=25')).json()
    ).toMatchObject({ total: 1, items: [{ id: row!.id }] });
    expect(
      await (await call('GET', '/inbox/page?offset=1&limit=25')).json()
    ).toEqual({ total: 1, items: [] });
    expect(await (await call('GET', '/inbox/page?q=пётр')).json()).toEqual({
      total: 0,
      items: [],
    });
  });

  it('CSV для Excel: BOM, точка с запятой, подписи полей столбцами', async () => {
    const csv = await (await call('GET', '/inbox.csv?lang=ru')).text();
    expect(
      csv.startsWith('﻿№;Дата;Форма;Статус;Имя;Телефон;Комментарий;product')
    ).toBe(true);
    // Заголовки — на языке менеджера из адреса, подписи полей — как в форме.
    expect(
      (await (await call('GET', '/inbox.csv?lang=de')).text()).startsWith(
        '﻿Nr.;Datum;Formular;Status;Имя;'
      )
    ).toBe(true);
    // Телефон с «+» — текстом: иначе Excel счёл бы его формулой.
    expect(csv).toContain(
      ";Обратный звонок;new;Иван;'+7 900 000-00-00;Перезвоните;Кухни;"
    );
  });

  it('CSV: значение посетителя, похожее на формулу, остаётся текстом', async () => {
    seconds(200);
    await post(
      {
        ...(await fresh()),
        name: ['=SUM(1;"x")'],
        phone: ['+7 900 000-00-01'],
        text: ['@SUM(1)'],
      },
      { 'x-forwarded-for': '203.0.113.40' }
    );
    const csv = await (await call('GET', '/inbox.csv?lang=ru')).text();
    expect(csv).toContain(`"'=SUM(1;""x"")"`);
    expect(csv).toContain(";'@SUM(1);");
    expect(csv).not.toMatch(/;=SUM/);
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
    // Статус и заметку редактор меняет, а удалить заявку навсегда может только администратор.
    const [first] = (await (await call('GET', '/inbox')).json()) as {
      id: number;
    }[];
    expect(
      (await call('PATCH', `/inbox/${first!.id}`, { status: 'in_work' })).status
    ).toBe(200);
    expect((await call('DELETE', `/inbox/${first!.id}`)).status).toBe(403);
    expect(app.forms.inbox.list({ limit: 10 })).toHaveLength(1);
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

describe('файлы, условия и шаги', () => {
  const _DOCS = `<fieldset class="form-step" data-step="Контакты"><legend>Контакты</legend>
<div class="field" data-field="text"><label for="f-name">Имя</label><input id="f-name" name="name" required></div>
<fieldset class="field" data-field="radio"><legend>Доставка</legend>
  <label><input type="radio" name="delivery" value="courier" required> Курьер</label>
  <label><input type="radio" name="delivery" value="pickup" required> Самовывоз</label>
</fieldset>
<div class="field" data-field="text" data-show-if="delivery=courier"><label for="f-address">Адрес</label><input id="f-address" name="address" required></div>
</fieldset>
<fieldset class="form-step" data-step="Чертёж"><legend>Чертёж</legend>
<div class="field" data-field="file"><label for="f-plan">Чертёж</label><input id="f-plan" type="file" name="plan" accept=".pdf" data-max-size="0.001" required></div>
</fieldset>`;
  const _PASSWORD = 'correct horse battery';
  let docsPage = 0;
  let cookie = '';

  const manager = (path: string) =>
    app.fetch(
      new Request(`https://site.test/manager/api${path}`, {
        headers: { cookie },
      })
    );

  const multipart = (fields: Record<string, string>, file: File | null) =>
    get('/docs')
      .then((_) => _.text())
      .then((html) => {
        seconds(5);
        const body = new FormData();
        body.set('_stamp', /name="_stamp" value="([^"]+)"/.exec(html)![1]!);
        body.set('_iat', /name="_iat" value="([^"]+)"/.exec(html)![1]!);
        body.set('_page', String(docsPage));
        body.set('_proof', proofOf(html)._proof![0]!);
        Object.entries(fields).forEach(
          ({ 0: name, 1: value }) => void body.set(name, value)
        );
        void (file && body.set('plan', file));
        return app.fetch(
          new Request('https://site.test/_cms/forms/docs', {
            method: 'POST',
            headers: {
              accept: 'application/json',
              origin: 'https://site.test',
            },
            body,
          }),
          { requestIP: () => ({ address: '203.0.113.9' }) }
        );
      });

  beforeEach(async () => {
    app.forms.forms.save('docs', { title: 'Документы', source: _DOCS });
    docsPage = app.content.pages.create({
      title: 'Документы',
      alias: 'docs',
      template: 'Base',
      content: '[#Form:docs]',
      publish: true,
    });
    const setup = await app.fetch(
      new Request('https://site.test/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: app.identity.setup.token(),
          email: 'admin@example.com',
          password: _PASSWORD,
        }),
      })
    );
    cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  });

  it('скрытое поле с серверным источником решает условие своим значением, а не присланным', async () => {
    app.forms.forms.save('licence', {
      title: 'Лицензия',
      source: `<input type="hidden" name="plan" data-source="page.id">
<div class="field" data-field="text" data-show-if="plan=${docsPage}"><label for="f-l">Лицензия</label><input id="f-l" name="licence" required></div>`,
    });
    app.content.pages.edit(docsPage, { content: '[#Form:licence]' });
    const html = await (await get('/docs')).text();
    seconds(5);
    const response = await app.fetch(
      new Request('https://site.test/_cms/forms/licence', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          origin: 'https://site.test',
        },
        body: JSON.stringify({
          _stamp: [/name="_stamp" value="([^"]+)"/.exec(html)![1]!],
          _iat: [/name="_iat" value="([^"]+)"/.exec(html)![1]!],
          _page: [String(docsPage)],
          ...proofOf(html),
          plan: ['nope'],
        }),
      }),
      { requestIP: () => ({ address: '203.0.113.30' }) }
    );
    expect(response.status).toBe(422);
    expect(Object.keys(((await response.json()) as any).errors)).toEqual([
      'licence',
    ]);
  });

  it('большое тело — только форме с файлами: несуществующей — 404, без файлов — 413', async () => {
    const big = () => {
      const body = new FormData();
      body.set('name', 'x');
      body.set('f', new File([new Uint8Array(200_000)], 'a.bin'));
      return body;
    };
    const send = (form: string) =>
      app.fetch(
        new Request(`https://site.test/_cms/forms/${form}`, {
          method: 'POST',
          headers: { origin: 'https://site.test' },
          body: big(),
        }),
        { requestIP: () => ({ address: '203.0.113.20' }) }
      );
    expect((await send('nope')).status).toBe(404);
    expect((await send('callback')).status).toBe(413);
    // Форма с файлами принимает большое тело — до ограничения частоты.
    expect((await send('docs')).status).not.toBe(413);
  });

  it('форма с файлом — multipart и подписи шагов на языке страницы', async () => {
    const html = await (await get('/docs')).text();
    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toContain('data-next="Далее"');
  });

  it('заявка с файлом: скрытое условием поле не нужно, файл — в карточке и скачивается', async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);
    const response = await multipart(
      { name: 'Анна', delivery: 'pickup' },
      new File([pdf], 'план.pdf', { type: 'application/pdf' })
    );
    expect(response.status).toBe(200);
    const [submission] = app.forms.inbox
      .list({ limit: 10 })
      .filter((_) => _.form === 'docs');
    expect(submission!.values.map((_) => [_.name, _.value])).toEqual([
      ['name', 'Анна'],
      ['delivery', 'Самовывоз'],
      ['plan', 'план.pdf'],
    ]);
    const detail = (await (
      await manager(`/inbox/${submission!.id}`)
    ).json()) as { files: { id: number; name: string; size: number }[] };
    expect(detail.files).toMatchObject([{ name: 'план.pdf', size: 6 }]);
    const file = await manager(
      `/inbox/${submission!.id}/files/${detail.files[0]!.id}`
    );
    expect(file.headers.get('content-type')).toBe('application/octet-stream');
    expect(file.headers.get('content-disposition')).toContain('attachment');
    expect(file.headers.get('content-security-policy')).toContain('sandbox');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
    // Заявка удалена — файла больше нет.
    app.forms.inbox.remove(submission!.id);
    expect(
      (await manager(`/inbox/${submission!.id}/files/${detail.files[0]!.id}`))
        .status
    ).toBe(404);
  });

  it('показанное поле обязательно; файл больше предела или чужого типа — ошибка поля', async () => {
    const courier = await multipart(
      { name: 'Анна', delivery: 'courier' },
      new File([new Uint8Array(4000)], 'plan.pdf', { type: 'application/pdf' })
    );
    expect(courier.status).toBe(422);
    expect(
      Object.keys(((await courier.json()) as any).errors).toSorted()
    ).toEqual(['address', 'plan']);
    const wrong = await multipart(
      { name: 'Анна', delivery: 'pickup' },
      new File([new Uint8Array(10)], 'plan.exe', {
        type: 'application/x-msdownload',
      })
    );
    expect(((await wrong.json()) as any).errors).toEqual({
      plan: 'Такой файл здесь не подходит',
    });
  });
});
