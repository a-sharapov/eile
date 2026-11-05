import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import { type App, createApp } from '../src/app.ts';
import { defineAgentSession } from '../src/contexts/manager/index.ts';
import type { Message, Transports } from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';
import { proofOf } from './fixtures/proof.ts';

// Заказ B2B на немецком сайте: письмо заказчику, код партнёра из cookie, передача заказа во внешний сервис.

let app: App;
let now: Date;
let sent: { to: readonly string[]; item: Message }[];
let page: number;
// Почтовый сервер отказывает этому адресу насовсем: ящика нет.
let missing = '';

const _SOURCE = `<div class="field" data-field="text" data-label="Name">
  <label for="f-name">Name</label><input id="f-name" name="name" required>
</div>
<div class="field" data-field="email" data-label="E-Mail">
  <label for="f-mail">E-Mail</label><input id="f-mail" name="mail" type="email" required>
</div>
<div class="field" data-field="textarea" data-label="Nachricht">
  <label for="f-text">Nachricht</label><textarea id="f-text" name="text"></textarea>
</div>
<input type="hidden" name="partner" data-source="cookie:partner">`;

const transports: Transports = {
  telegram: {
    send: () => Promise.resolve(),
    me: () => Promise.resolve('@bot'),
    chats: () => Promise.resolve([]),
  },
  email: {
    send: (_settings, to, item) =>
      to.includes(missing)
        ? Promise.reject(
            Object.assign(new Error('550 No such user'), { permanent: true })
          )
        : (sent.push({ to, item }), Promise.resolve()),
    mail: () => Promise.resolve(),
    probe: () => Promise.resolve({ ok: true, latencyMs: 1 }),
  },
};

const seconds = (count: number) =>
  void (now = new Date(now.getTime() + count * 1000));

beforeEach(() => {
  now = new Date('2026-11-02T10:00:00Z');
  sent = [];
  missing = 'nobody@nowhere.invalid';
  app = createApp({ scaffold: DEMO, clock: () => now, transports });
  app.site.settings.update({ language: 'de' });
  app.notify.settings.save({
    email: {
      host: 'smtp.test',
      security: 'none',
      from: 'shop@example.com',
      to: 'boss@example.com',
    },
  });
  app.forms.forms.save('order', {
    title: 'Bestellung',
    source: _SOURCE,
    subject: 'Bestellung: {name}',
  });
  page = app.content.pages.create({
    title: 'Bestellen',
    alias: 'bestellen',
    template: 'Base',
    content: '<p>Abo bestellen</p>[#Form:order]',
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
    new Request('https://site.test/_cms/forms/order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        origin: 'https://site.test',
        ...headers,
      },
      body: JSON.stringify(fields),
    }),
    { requestIP: () => ({ address: '203.0.113.9' }) }
  );

const fresh = async (headers: Record<string, string> = {}) => {
  const html = await (await get('/bestellen', headers)).text();
  seconds(5);
  return stampOf(html);
};

const _GOOD = {
  name: ['Anna Schmidt'],
  mail: ['anna@example.com'],
  text: ['Wir möchten das Abo für drei Standorte.'],
};

const submit = async (
  fields: Record<string, string[]> = _GOOD,
  headers: Record<string, string> = {}
) => post({ ...(await fresh(headers)), ...fields }, headers);

describe('немецкий сайт', () => {
  it('форма и её подписи — по-немецки; ошибки сервера — по-немецки', async () => {
    app.forms.forms.save('steps', {
      title: 'Schritte',
      source: `<fieldset class="form-step" data-step="Kontakt"><input name="a" required></fieldset>
<fieldset class="form-step" data-step="Firma"><input name="b"></fieldset>`,
    });
    app.content.pages.edit(page, {
      content: '[#Form:order][#Form:steps]',
    });
    const html = await (await get('/bestellen')).text();
    expect(html).toContain(
      'data-failed="Das Formular konnte nicht gesendet werden."'
    );
    expect(html).toContain('data-next="Weiter" data-back="Zurück"');
    expect(html).toContain('data-progress="Schritt {n} von {m}"');
    expect(html).toContain('Bitte leer lassen');
    // Новая форма без своих текстов — с немецкой кнопкой.
    expect(html).toContain('<button type="submit">Absenden</button>');
    seconds(5);
    const response = await post({
      ...stampOf(html),
      name: [''],
      mail: ['keine-adresse'],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      message: 'Bitte überprüfen Sie Ihre Angaben im Formular',
      errors: {
        name: 'Bitte füllen Sie dieses Feld aus',
        mail: 'Bitte geben Sie eine E-Mail-Adresse ein: name@example.com',
      },
    });
  });

  it('без JS: ошибки у полей после перехода обратно — тоже по-немецки', async () => {
    const stamp = await fresh();
    const response = await app.fetch(
      new Request('https://site.test/_cms/forms/order', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://site.test',
        },
        body: new URLSearchParams({
          _stamp: stamp._stamp[0]!,
          _iat: stamp._iat[0]!,
          _page: String(page),
          // Браузер без JS: решения нет, метку присылает <noscript>.
          _proof: '',
          _nojs: '1',
          name: '',
          mail: 'x',
        }),
      }),
      { requestIP: () => ({ address: '203.0.113.9' }) }
    );
    expect(response.status).toBe(303);
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    const html = await (await get('/bestellen', { cookie })).text();
    expect(html).toContain('Bitte füllen Sie dieses Feld aus');
    expect(html).toContain('Bitte überprüfen Sie Ihre Angaben im Formular');
  });
});

describe('письмо отправителю', () => {
  beforeEach(() => {
    app.forms.forms.save('order', {
      confirmation: {
        enabled: true,
        subject: 'Ihre {form} bei Mühlenhof',
        text: 'Guten Tag {name},\nvielen Dank für Ihre Bestellung.',
      },
    });
  });

  it('принятая заявка — одно письмо на адрес посетителя; второе за 10 минут — нет', async () => {
    expect((await submit()).status).toBe(200);
    seconds(60);
    expect((await submit({ ..._GOOD, text: ['Noch eine Frage'] })).status).toBe(
      200
    );
    await app.notify.outbox.run();
    const letters = sent.filter((_) => _.item.topic === 'confirmation');
    expect(letters).toHaveLength(1);
    expect(letters[0]!.to).toEqual(['anna@example.com']);
    expect(letters[0]!.item).toMatchObject({
      title: 'Ihre Bestellung bei Mühlenhof',
      text: 'Guten Tag Anna Schmidt,\nvielen Dank für Ihre Bestellung.',
      replyTo: null,
    });
    // Уведомления менеджеру — как раньше, на каждую заявку.
    expect(sent.filter((_) => _.item.topic === 'forms')).toHaveLength(2);
    // Через 10 минут — снова можно.
    seconds(10 * 60);
    await submit({ ..._GOOD, text: ['Später'] });
    await app.notify.outbox.run();
    expect(sent.filter((_) => _.item.topic === 'confirmation')).toHaveLength(2);
  });

  it('ошибка поля, ловушка и спам — без письма', async () => {
    await submit({ ..._GOOD, mail: ['kaputt'] });
    await submit({ ..._GOOD, company_website: ['https://bot.example'] });
    await submit({ ..._GOOD, text: ['Billig kaufen: https://spam.example'] });
    await app.notify.outbox.run();
    expect(sent.filter((_) => _.item.topic === 'confirmation')).toEqual([]);
  });

  it('адрес с опечаткой: письмо не доставлено — видно у заявки, но это не сбой сайта', async () => {
    missing = 'anna@example.con';
    await submit({ ..._GOOD, mail: ['anna@example.con'] });
    await app.notify.outbox.run();
    const [submission] = app.forms.inbox.list({ limit: 1 });
    expect(
      app.notify.outbox.bySource(`confirmation:${submission!.id}`)
    ).toMatchObject([{ status: 'failed', lastError: '550 No such user' }]);
    expect(app.notify.incidents.list().map((_) => _.kind)).not.toContain(
      'notify.delivery_failed'
    );
  });

  it('значение посетителя не добавит заголовок в тему', async () => {
    app.forms.forms.save('order', {
      confirmation: { subject: 'Hallo {name}' },
    });
    await submit({ ..._GOOD, name: ['Anna\r\nBcc: x@example.com'] });
    await app.notify.outbox.run();
    const letter = sent.find((_) => _.item.topic === 'confirmation')!;
    expect(letter.item.title).toBe('Hallo Anna Bcc: x@example.com');
    expect(letter.to).toEqual(['anna@example.com']);
  });

  it('включить письмо без поля почты нельзя', () => {
    expect(() =>
      app.forms.forms.save('bare', {
        title: 'Ohne E-Mail',
        source: '<input name="name">',
        confirmation: { enabled: true, text: 'Danke' },
      })
    ).toThrow('no email field');
  });
});

describe('скрытое поле из cookie', () => {
  it('значение cookie — в форме при показе и в заявке, присланное не подменит', async () => {
    // Страница уже в кэше: форма — регион, она рисуется на каждый запрос со своими cookie.
    expect(await (await get('/bestellen')).text()).toMatch(
      /data-source="cookie:partner" value=""/
    );
    const cached = await get('/bestellen', {
      cookie: 'partner=KLY-42; other=1',
    });
    expect(cached.headers.get('x-cache')).toBe('hit');
    const html = await cached.text();
    expect(html).toMatch(
      /name="partner" data-source="cookie:partner" value="KLY-42"/
    );
    seconds(5);
    await post(
      { ...stampOf(html), ..._GOOD, partner: ['FAKE'] },
      { cookie: 'partner=KLY-42' }
    );
    const [submission] = app.forms.inbox.list({ limit: 1 });
    expect(submission!.values.find((_) => _.name === 'partner')!.value).toBe(
      'KLY-42'
    );
  });

  it('cookie самой CMS в поле не сохранить — понятная ошибка', () => {
    expect(() =>
      app.forms.forms.save('order', {
        source: `${_SOURCE}<input type="hidden" name="s" data-source="cookie:cms_session">`,
      })
    ).toThrow('belongs to the CMS');
    expect(() =>
      app.forms.forms.save('order', {
        source:
          '<input type="hidden" name="s" data-source="cookie:__Host-cms_session">',
      })
    ).toThrow('belongs to the CMS');
    expect(app.forms.forms.get('order')!.source).toBe(_SOURCE);
  });
});

describe('вебхук', () => {
  let server: ReturnType<typeof Bun.serve>;
  let received: { body: string; signature: string | null }[];
  let answers: number[];

  beforeEach(() => {
    received = [];
    answers = [];
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) =>
        request.text().then((body) => {
          received.push({
            body,
            signature: request.headers.get('x-eile-signature'),
          });
          return new Response(answers.length > 0 ? 'busy' : 'ok', {
            status: answers.shift() ?? 200,
          });
        }),
    });
    app.forms.forms.save('order', {
      webhook: { url: `http://127.0.0.1:${server.port}/hook` },
    });
  });

  afterEach(() => void server.stop(true));

  const secret = () => app.forms.forms.get('order')!.webhook.secret;

  it('заявка уходит JSON-ом с верной подписью; доставка видна у заявки', async () => {
    await submit(_GOOD, { cookie: 'partner=KLY-42' });
    expect(await app.forms.webhooks.run()).toBe(1);
    expect(received).toHaveLength(1);
    const { body, signature } = received[0]!;
    expect(signature).toBe(
      `sha256=${createHmac('sha256', secret()).update(body).digest('hex')}`
    );
    const [submission] = app.forms.inbox.list({ limit: 1 });
    expect(JSON.parse(body)).toEqual({
      form: 'order',
      submissionId: submission!.id,
      receivedAt: submission!.createdAt,
      values: {
        name: 'Anna Schmidt',
        mail: 'anna@example.com',
        text: 'Wir möchten das Abo für drei Standorte.',
        partner: 'KLY-42',
      },
      files: [],
      page: { id: page, url: expect.stringContaining('/bestellen') },
    });
    expect(app.forms.webhooks.of(submission!.id)).toMatchObject({
      status: 'delivered',
      attempts: 1,
      lastError: '',
    });
    // Доставлено — второй проход ничего не шлёт.
    expect(await app.forms.webhooks.run()).toBe(0);
  });

  it('сбой приёмника — повтор по расписанию, потом доставлено', async () => {
    answers = [500];
    await submit();
    await app.forms.webhooks.run();
    const [submission] = app.forms.inbox.list({ limit: 1 });
    expect(app.forms.webhooks.of(submission!.id)).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'HTTP 500: busy',
    });
    // Пауза ещё не прошла — не шлём.
    seconds(30);
    expect(await app.forms.webhooks.run()).toBe(0);
    seconds(31);
    expect(await app.forms.webhooks.run()).toBe(1);
    expect(received).toHaveLength(2);
    expect(app.forms.webhooks.of(submission!.id)).toMatchObject({
      status: 'delivered',
      attempts: 2,
    });
  });

  it('отказ насовсем — сбой в журнале и повтор вручную', async () => {
    answers = [404];
    await submit();
    await app.forms.webhooks.run();
    const [submission] = app.forms.inbox.list({ limit: 1 });
    expect(app.forms.webhooks.of(submission!.id)).toMatchObject({
      status: 'failed',
      lastError: 'HTTP 404: busy',
    });
    expect(app.notify.incidents.list().map((_) => _.kind)).toContain(
      'forms.webhook_failed'
    );
    app.forms.webhooks.retry(submission!.id);
    await app.forms.webhooks.run();
    expect(app.forms.webhooks.of(submission!.id)?.status).toBe('delivered');
  });

  it('спам и заявки без вебхука на вебхук не уходят', async () => {
    await submit({ ..._GOOD, text: ['Billig: https://spam.example'] });
    app.forms.forms.save('order', { webhook: { url: '' } });
    seconds(200);
    await submit({ ..._GOOD, text: ['Ohne Webhook'] });
    expect(await app.forms.webhooks.run()).toBe(0);
    expect(received).toEqual([]);
  });

  it('недоступный приёмник — временный сбой без адреса в тексте ошибки', async () => {
    app.forms.forms.save('order', {
      webhook: { url: 'http://user:secret@127.0.0.1:9/hook' },
    });
    await submit();
    await app.forms.webhooks.run();
    const [submission] = app.forms.inbox.list({ limit: 1 });
    const delivery = app.forms.webhooks.of(submission!.id)!;
    expect(delivery.status).toBe('pending');
    expect(delivery.lastError).toStartWith('Network error');
    expect(delivery.lastError).not.toContain('secret');
  });
});

describe('плагины, менеджер и агенты', () => {
  let cookie = '';
  const _PASSWORD = 'correct horse battery';

  const call = (method: string, path: string, body?: unknown) =>
    app.fetch(
      new Request(`https://site.test/manager/api${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );

  beforeEach(async () => {
    cookie = '';
    const setup = await call('POST', '/setup', {
      token: app.identity.setup.token(),
      email: 'admin@example.com',
      password: _PASSWORD,
    });
    cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  });

  it('плагин получает значения принятой заявки в событии', async () => {
    const seen = globalThis as { eileReceived?: unknown };
    delete seen.eileReceived;
    app.extensions.plugins.save(
      'Crm',
      `export default { on: { 'forms.submission_received': (event) => { (globalThis as any).eileReceived = event; } } };`
    );
    await submit(_GOOD, { cookie: 'partner=KLY-7' });
    // Плагины грузятся асинхронно: подождать, пока событие дойдёт.
    for (let i = 0; i < 50 && !seen.eileReceived; i++) await Bun.sleep(10);
    expect(seen.eileReceived).toMatchObject({
      type: 'forms.submission_received',
      form: 'order',
      spam: false,
      values: { name: 'Anna Schmidt', partner: 'KLY-7' },
    });
    delete seen.eileReceived;
  });

  it('настройки письма и вебхука — через API; карточка заявки показывает доставку', async () => {
    const saved = await call('PUT', '/forms/order', {
      confirmation: { enabled: true, text: 'Danke, {name}!' },
      webhook: { url: 'https://crm.example.com/eile' },
    });
    expect(saved.status).toBe(200);
    const form = (await saved.json()) as {
      webhook: { url: string; secret: string };
    };
    expect(form.webhook.url).toBe('https://crm.example.com/eile');
    expect(form.webhook.secret).toMatch(/^[0-9a-f]{64}$/);
    const refused = await call('PUT', '/forms/order', {
      source: '<input type="hidden" name="s" data-source="cookie:cms_session">',
    });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({
      error: { code: 'forms.reserved_cookie' },
    });
    expect(
      (
        await call('PUT', '/forms/order', {
          webhook: { url: 'http://crm.example.com/eile' },
        })
      ).status
    ).toBe(422);

    await submit();
    const [submission] = app.forms.inbox.list({ limit: 1 });
    const detail = (await (
      await call('GET', `/inbox/${submission!.id}`)
    ).json()) as {
      confirmations: { recipient: string; status: string }[];
      webhook: { status: string; url: string };
    };
    expect(detail.confirmations).toMatchObject([
      { recipient: 'anna@example.com', status: 'pending' },
    ]);
    expect(detail.webhook).toMatchObject({
      status: 'pending',
      url: 'https://crm.example.com/eile',
    });
    expect(
      (await call('POST', `/inbox/${submission!.id}/webhook`)).status
    ).toBe(200);
  });

  it('агент ставит вебхук, письмо и хранение адреса через MCP, но секрета не видит', async () => {
    const admin = app.identity.users
      .list()
      .find((_) => _.email === 'admin@example.com')!;
    const tool = (name: string, args: object) =>
      app
        .mcp(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
          },
          admin,
          defineAgentSession()
        )
        .then(
          (_) =>
            JSON.parse(
              (_ as { result: { content: { text: string }[] } }).result
                .content[0]!.text
            ) as { webhook: { url: string; secret: string } }
        );
    const saved = await tool('save_form', {
      name: 'order',
      webhook: { url: 'https://crm.example.com/agent' },
      confirmation: { enabled: true, text: 'Danke!' },
      storeClientInfo: false,
    });
    expect(saved.webhook.url).toBe('https://crm.example.com/agent');
    expect(saved.webhook.secret).not.toBe(secret());
    expect(saved.webhook.secret).toContain('hidden');
    expect((await tool('get_form', { name: 'order' })).webhook.secret).not.toBe(
      secret()
    );
    expect(app.forms.forms.get('order')!.confirmation.enabled).toBe(true);
    expect(app.forms.forms.get('order')!.storeClientInfo).toBe(false);
  });

  const secret = () => app.forms.forms.get('order')!.webhook.secret;
});

describe('скрытое поле с подписями: пакет из адреса', () => {
  const _PAKET =
    '<input type="hidden" name="paket" data-source="query:paket" data-label="Paket" data-labels="berater=KI-Küchenberater|planung=KI-Küchenberater + KI-Planung">';
  const _LABEL = 'KI-Küchenberater + KI-Planung';
  let server: ReturnType<typeof Bun.serve>;
  let received: { body: string; signature: string | null }[];
  let cookie = '';

  const call = (method: string, path: string, body?: unknown) =>
    app.fetch(
      new Request(`https://site.test/manager/api${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );

  beforeEach(async () => {
    received = [];
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) =>
        request.text().then((body) => {
          received.push({
            body,
            signature: request.headers.get('x-eile-signature'),
          });
          return new Response('ok');
        }),
    });
    app.forms.forms.save('order', {
      source: `${_PAKET}\n${_SOURCE}`,
      subject: 'Bestellung: {paket}, {name}',
      confirmation: {
        enabled: true,
        subject: 'Ihre Bestellung: {paket}',
        text: 'Guten Tag {name},\nPaket: {paket}',
      },
      webhook: { url: `http://127.0.0.1:${server.port}/hook` },
    });
    cookie = '';
    const setup = await call('POST', '/setup', {
      token: app.identity.setup.token(),
      email: 'admin@example.com',
      password: 'correct horse battery',
    });
    cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  });

  afterEach(() => void server.stop(true));

  const order = (paket = 'planung') => submit({ ..._GOOD, paket: [paket] });

  it('в форме — ключ из адреса; письмо заказчику, тема и текст уведомления — подпись', async () => {
    expect(await (await get('/bestellen?paket=planung')).text()).toMatch(
      /name="paket" data-source="query:paket"[^>]* value="planung"/
    );
    expect((await order()).status).toBe(200);
    await app.notify.outbox.run();
    expect(
      sent.find((_) => _.item.topic === 'confirmation')!.item
    ).toMatchObject({
      title: `Ihre Bestellung: ${_LABEL}`,
      text: `Guten Tag Anna Schmidt,\nPaket: ${_LABEL}`,
    });
    const notice = sent.find((_) => _.item.topic === 'forms')!.item;
    expect(notice.title).toBe(`Bestellung: ${_LABEL}, Anna Schmidt`);
    expect(notice.fields[0]).toEqual({ label: 'Paket', value: _LABEL });
  });

  it('значение без подписи — как есть', async () => {
    await order('sonderpaket');
    await app.notify.outbox.run();
    expect(sent.find((_) => _.item.topic === 'forms')!.item.title).toBe(
      'Bestellung: sonderpaket, Anna Schmidt'
    );
  });

  it('карточка, список и CSV в менеджере — подпись; ключ остаётся в заявке', async () => {
    await order();
    const [submission] = app.forms.inbox.list({ limit: 1 });
    const paket = {
      name: 'paket',
      label: 'Paket',
      kind: 'hidden' as const,
      value: _LABEL,
      raw: 'planung',
    };
    expect(submission!.values[0]).toEqual(paket);
    const detail = (await (
      await call('GET', `/inbox/${submission!.id}`)
    ).json()) as { values: unknown[] };
    expect(detail.values[0]).toEqual(paket);
    const [row] = (await (await call('GET', '/inbox')).json()) as {
      preview: string;
    }[];
    expect(row!.preview).toStartWith(`${_LABEL} · Anna Schmidt`);
    const csv = await (await call('GET', '/inbox.csv?lang=de')).text();
    const [head, line] = csv.replace('﻿', '').split('\r\n');
    const column = head!.split(';').indexOf('Paket');
    expect(column).toBeGreaterThan(0);
    expect(line!.split(';')[column]).toBe(_LABEL);
  });

  it('вебхук: в values — ключ, как раньше; подпись — в labels, тело подписано', async () => {
    await submit(
      { ..._GOOD, paket: ['planung'] },
      { cookie: 'partner=KLY-42' }
    );
    expect(await app.forms.webhooks.run()).toBe(1);
    const { body, signature } = received[0]!;
    expect(signature).toBe(
      `sha256=${createHmac('sha256', app.forms.forms.get('order')!.webhook.secret).update(body).digest('hex')}`
    );
    expect(JSON.parse(body)).toMatchObject({
      values: {
        paket: 'planung',
        name: 'Anna Schmidt',
        partner: 'KLY-42',
      },
      labels: { paket: _LABEL },
    });
  });

  it('неверные data-labels форма не сохранит: понятная ошибка в коде и в API менеджера', async () => {
    expect(() =>
      app.forms.forms.save('order', {
        source:
          '<input type="hidden" name="paket" data-labels="berater|planung=Planung">',
      })
    ).toThrow('data-labels of field "paket": "berater" is not value=label');
    const twice = await call('PUT', '/forms/order', {
      source: '<input type="hidden" name="paket" data-labels="a=A|a=B">',
    });
    expect(twice.status).toBe(422);
    expect(await twice.json()).toMatchObject({
      error: { code: 'forms.invalid_labels' },
    });
    const misplaced = await call('PUT', '/forms/order', {
      source:
        '<select name="paket" data-labels="a=A"><option value="a">A</option></select>',
    });
    expect(misplaced.status).toBe(422);
    expect(await misplaced.json()).toMatchObject({
      error: { code: 'forms.labels_not_hidden' },
    });
    expect(app.forms.forms.get('order')!.source).toStartWith(_PAKET);
  });
});
