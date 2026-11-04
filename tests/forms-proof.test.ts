import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import type { Message, Transports } from '../src/contexts/notify/index.ts';
import { DEMO } from './fixtures/demo.ts';
import { removeTemp } from './fixtures/platform.ts';
import { proofTaskOf, solveTask } from './fixtures/proof.ts';

// Доказательство работы в браузере (ADR 0053): показ → решение → отправка через app.fetch, отказ без решения,
// путь без JS, настройки формы.

let app: App;
let now: Date;
let sent: Message[];
let page: number;

const _SOURCE = `<div class="field" data-field="text" data-label="Name">
  <label for="f-name">Name</label><input id="f-name" name="name" required>
</div>
<div class="field" data-field="email" data-label="E-Mail">
  <label for="f-mail">E-Mail</label><input id="f-mail" name="mail" type="email" required>
</div>`;

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

const setup = (options: { databasePath?: string } = {}) => {
  sent = [];
  app = createApp({ scaffold: DEMO, clock: () => now, transports, ...options });
  app.site.settings.update({ language: 'de' });
  app.notify.settings.save({
    email: {
      host: 'smtp.test',
      security: 'none',
      from: 'site@example.com',
      to: 'team@example.com',
    },
  });
};

beforeEach(() => {
  now = new Date('2026-11-03T10:00:00Z');
  setup();
  app.forms.forms.save('demo', {
    title: 'Demo-Termin',
    source: _SOURCE,
    confirmation: { enabled: true, field: 'mail', text: 'Danke, {name}' },
  });
  page = app.content.pages.create({
    title: 'Demo',
    alias: 'demo',
    template: 'Base',
    content: '<p>Demo buchen</p>[#Form:demo]',
    publish: true,
  });
});

afterEach(() => app.close());

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`https://site.test${path}`, { headers }));

const stampOf = (html: string) => ({
  _stamp: /name="_stamp" value="([^"]+)"/.exec(html)![1]!,
  _iat: /name="_iat" value="([^"]+)"/.exec(html)![1]!,
  _page: String(page),
});

const show = async (path = '/demo') => {
  const html = await (await get(path)).text();
  seconds(5);
  return html;
};

const _GOOD = { name: 'Anna Schmidt', mail: 'anna@example.com' };

// Отправка скриптом формы: JSON, ответ JSON.
const post = (fields: Record<string, string>, form = 'demo') =>
  app.fetch(
    new Request(`https://site.test/_cms/forms/${form}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        origin: 'https://site.test',
      },
      body: JSON.stringify(
        Object.fromEntries(
          Object.entries(fields).map(({ 0: key, 1: value }) => [key, [value]])
        )
      ),
    }),
    { requestIP: () => ({ address: '203.0.113.40' }) }
  );

// Отправка браузером без скрипта: обычная форма, ответ — переход.
const postForm = (fields: Record<string, string>) =>
  app.fetch(
    new Request('https://site.test/_cms/forms/demo', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://site.test',
      },
      body: new URLSearchParams(fields),
    }),
    { requestIP: () => ({ address: '203.0.113.41' }) }
  );

type Reply = {
  ok: boolean;
  message: string;
  stamp?: { token: string; iat: number };
  proof?: string;
};

const inbox = () => [
  ...app.forms.inbox.list({ limit: 20 }),
  ...app.forms.inbox.list({ status: 'spam', limit: 20 }),
];

describe('показ формы', () => {
  it('у новой формы защита включена: задача, строки состояния, пустое поле решения и <noscript>', async () => {
    expect(app.forms.forms.get('demo')!.proof).toBe('standard');
    const html = await show();
    const task = proofTaskOf(html, 'demo')!;
    expect(task).toMatch(
      /^SHA-256\.[A-Za-z0-9_-]{16}\.200000\.\d{13}\.[0-9a-f]{64}\.[A-Za-z0-9_-]{43}$/
    );
    expect(html).toContain('data-proof-working="Spam-Schutz wird geprüft…"');
    expect(html).toContain('data-proof-done="Spam-Schutz bestätigt"');
    expect(html).toContain('<input type="hidden" name="_proof" value="">');
    expect(html).toContain(
      '<p class="cms-form-proof" role="status" aria-live="polite"><noscript><input type="hidden" name="_nojs" value="1">Ohne JavaScript'
    );
    // Задача — на каждый показ своя, как печать: страница вокруг формы остаётся в кэше.
    const again = await get('/demo');
    expect(again.headers.get('x-cache')).toBe('hit');
    expect(proofTaskOf(await again.text(), 'demo')).not.toBe(task);
  });

  it('воркер решателя — по своему адресу с хэшем, навсегда; скрипт формы знает этот адрес', async () => {
    const html = await show();
    const src = /src="(\/_cms\/forms\/enhance\.[a-z0-9]+\.js)"/.exec(html)![1]!;
    const script = await (await get(src)).text();
    const worker = /"(\/_cms\/forms\/proof\.[a-z0-9]+\.js)"/.exec(script)![1]!;
    const response = await get(worker);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(response.headers.get('cache-control')).toContain('immutable');
    const text = await response.text();
    expect(text).toContain('proofSearch');
    expect(text).toContain('self.onmessage');
    // Ни cookie, ни хранилища в решателе нет: наружу уходит только число.
    expect(text).not.toMatch(/cookie|localStorage|sessionStorage|fetch\(/);
  });
});

describe('показ → решение → отправка', () => {
  it('решённая задача: заявка принята, уведомление и письмо отправителю ушли', async () => {
    const html = await show();
    const response = await post({
      ...stampOf(html),
      _proof: solveTask(proofTaskOf(html, 'demo')!),
      ..._GOOD,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    const [submission] = app.forms.inbox.list({ limit: 5 });
    expect(submission).toMatchObject({ status: 'new' });
    expect(submission!.context.proof).toBeUndefined();
    await app.notify.outbox.run();
    expect(sent.map((_) => _.topic)).toEqual(
      expect.arrayContaining(['forms', 'confirmation'])
    );
  });

  it('без решения от скрипта — отказ с новой задачей к той же печати; решил её — принята сразу', async () => {
    const html = await show();
    const refused = await post({ ...stampOf(html), _proof: '', ..._GOOD });
    expect(refused.status).toBe(409);
    const reply = (await refused.json()) as Reply;
    expect(reply.message).toBe(
      'Der Spam-Schutz konnte nicht bestätigt werden – bitte laden Sie die Seite neu und senden Sie das Formular noch einmal ab'
    );
    expect(reply.proof).toStartWith('SHA-256.');
    // Печать та же: время заполнения считается от показа, повтор не упрётся в «подождите».
    expect(reply.stamp!.token).toBe(stampOf(html)._stamp);
    expect(inbox()).toEqual([]);
    // Так делает скрипт: печать из ответа, решение новой задачи — и та же отправка.
    const retried = await post({
      _stamp: reply.stamp!.token,
      _iat: String(reply.stamp!.iat),
      _page: String(page),
      _proof: solveTask(reply.proof!),
      ..._GOOD,
    });
    expect(retried.status).toBe(200);
    expect(inbox()).toHaveLength(1);
  });

  it('неверное число, мусор, чужая печать или чужая форма — отказ, в базе ничего', async () => {
    app.forms.forms.save('other', { title: 'Andere', source: _SOURCE });
    app.content.pages.edit(page, { content: '[#Form:demo][#Form:other]' });
    const first = await show();
    const second = await show();
    const stamp = stampOf(first);
    const solution = solveTask(proofTaskOf(first, 'demo')!);
    const wrong = solution.replace(
      /\.(\d+)$/,
      (_match, n: string) => `.${Number(n) + 1}`
    );
    const attempts = [
      { ...stamp, _proof: wrong },
      { ...stamp, _proof: 'garbage' },
      { ...stamp, _proof: `${solution}0` },
      // Решение задачи другого показа: подпись связывает его с той печатью.
      { ...stamp, _proof: solveTask(proofTaskOf(second, 'demo')!) },
      // Решение задачи другой формы той же страницы.
      { ...stamp, _proof: solveTask(proofTaskOf(first, 'other')!) },
    ];
    const statuses = await Promise.all(
      attempts.map((fields) =>
        post({ ...fields, ..._GOOD }).then((_) => _.status)
      )
    );
    expect(statuses).toEqual([409, 409, 409, 409, 409]);
    expect(inbox()).toEqual([]);
  });

  it('повтор той же печатью и тем же решением — одна заявка; старое решение к новой печати не подходит', async () => {
    const html = await show();
    const fields = {
      ...stampOf(html),
      _proof: solveTask(proofTaskOf(html, 'demo')!),
      ..._GOOD,
    };
    expect((await post(fields)).status).toBe(200);
    expect((await post(fields)).status).toBe(200);
    expect(inbox()).toHaveLength(1);
    const fresh = await show();
    const replay = await post({
      ...fields,
      ...stampOf(fresh),
      mail: 'other@example.com',
    });
    expect(replay.status).toBe(409);
    expect(inbox()).toHaveLength(1);
  });

  it('через сутки печать и задача устарели: новые в ответе, скрипт отправит ещё раз', async () => {
    const html = await show();
    seconds(24 * 60 * 60);
    const response = await post({
      ...stampOf(html),
      _proof: solveTask(proofTaskOf(html, 'demo')!),
      ..._GOOD,
    });
    expect(response.status).toBe(409);
    const reply = (await response.json()) as Reply;
    expect(reply.message).toBe(
      'Das Formular ist abgelaufen – bitte senden Sie es noch einmal ab'
    );
    expect(reply.stamp?.token).toBeString();
    expect(reply.proof).toStartWith('SHA-256.');
    expect(inbox()).toEqual([]);
  });

  it('защиту включили, пока страница была открыта: задачи в форме не было — сервер выдаст её', async () => {
    app.forms.forms.save('demo', { proof: 'off' });
    const html = await show();
    expect(html).not.toContain('data-proof=');
    app.forms.forms.save('demo', { proof: 'light' });
    const reply = (await (
      await post({ ...stampOf(html), ..._GOOD })
    ).json()) as Reply;
    expect(reply.proof).toMatch(/^SHA-256\.[^.]+\.50000\./);
    const retried = await post({
      _stamp: reply.stamp!.token,
      _iat: String(reply.stamp!.iat),
      _page: String(page),
      _proof: solveTask(reply.proof!),
      ..._GOOD,
    });
    expect(retried.status).toBe(200);
  });

  it('защита выключена: задачи нет, заявка без решения принимается, как раньше', async () => {
    app.forms.forms.save('demo', { proof: 'off' });
    const html = await show();
    expect(html).not.toContain('data-proof');
    expect(html).not.toContain('<noscript>');
    const response = await post({ ...stampOf(html), ..._GOOD });
    expect(response.status).toBe(200);
    expect(app.forms.inbox.list({ limit: 5 })).toHaveLength(1);
  });
});

describe('без JS', () => {
  // Так шлёт браузер с выключенным JS: поле решения пустое, метку добавил <noscript>.
  const noScript = (html: string, fields: Record<string, string> = _GOOD) =>
    postForm({ ...stampOf(html), _proof: '', _nojs: '1', ...fields });

  it('заявка сохраняется спамом с пометкой: посетитель видит «спасибо», уведомлений и письма нет', async () => {
    const response = await noScript(await show());
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/demo?sent=demo#form-demo');
    expect(app.forms.inbox.list({ limit: 5 })).toEqual([]);
    const [spam] = app.forms.inbox.list({ status: 'spam', limit: 5 });
    expect(spam).toMatchObject({
      status: 'spam',
      context: { proof: 'missing', pageId: page },
    });
    expect(spam!.values.find((_) => _.name === 'mail')!.value).toBe(
      'anna@example.com'
    );
    await app.notify.outbox.run();
    expect(sent).toEqual([]);
  });

  it('ловушка, печать и время проверяются, как всегда', async () => {
    const html = await show();
    // Заполненная ловушка — успех без записи.
    expect(
      (await noScript(html, { ..._GOOD, company_website: 'x' })).status
    ).toBe(303);
    expect(inbox()).toEqual([]);
    // Чужая печать — обратно с сообщением, без записи.
    const stale = await noScript(html, { ..._GOOD, _stamp: 'forged' });
    expect(stale.headers.get('location')).toBe('/demo#form-demo');
    expect(stale.headers.get('set-cookie')).toContain('cms_form=');
    expect(inbox()).toEqual([]);
    // Быстрее минимального времени — «подождите».
    const quick = await (await get('/demo')).text();
    const fast = await noScript(quick);
    expect(fast.headers.get('location')).toBe('/demo#form-demo');
    expect(inbox()).toEqual([]);
  });

  it('ошибки полей — обратно к форме, как без защиты', async () => {
    const response = await noScript(await show(), { name: '', mail: 'x' });
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    const html = await (await get('/demo', { cookie })).text();
    expect(html).toContain('Bitte füllen Sie dieses Feld aus');
    expect(inbox()).toEqual([]);
  });

  it('браузер со скриптами, но без решения (скрипт не загрузился): обратно с понятной ошибкой, без записи', async () => {
    const response = await postForm({
      ...stampOf(await show()),
      _proof: '',
      ..._GOOD,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/demo#form-demo');
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    const html = await (await get('/demo', { cookie })).text();
    expect(html).toContain(
      'Der Spam-Schutz konnte nicht bestätigt werden – bitte laden Sie die Seite neu'
    );
    expect(inbox()).toEqual([]);
  });
});

describe('настройки формы', () => {
  it('уровень — из списка; иначе форма не сохраняется', () => {
    expect(app.forms.forms.save('demo', { proof: 'strong' }).proof).toBe(
      'strong'
    );
    expect(() =>
      app.forms.forms.save('demo', { proof: 'max' as never })
    ).toThrow('Spam protection is one of off, light, standard, strong');
    expect(app.forms.forms.get('demo')!.proof).toBe('strong');
  });

  it('через API менеджера: уровень сохраняется, неверный — 422 с кодом', async () => {
    const setupResponse = await app.fetch(
      new Request('https://site.test/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: app.identity.setup.token(),
          email: 'admin@example.com',
          password: 'correct horse battery',
        }),
      })
    );
    const cookie = (setupResponse.headers.get('set-cookie') ?? '').split(
      ';'
    )[0]!;
    const put = (body: unknown) =>
      app.fetch(
        new Request('https://site.test/manager/api/forms/demo', {
          method: 'PUT',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    const saved = await put({ proof: 'light' });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { proof: string }).proof).toBe('light');
    const refused = await put({ proof: 'ultra' });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({
      error: { code: 'forms.invalid_proof' },
    });
  });

  it('форма, сохранённая до защиты, остаётся без неё: сайт после обновления принимает заявки, как принимал', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cms-proof-'));
    const path = join(dir, 'site.db');
    app.close();
    setup({ databasePath: path });
    app.forms.forms.save('legacy', { title: 'Alt', source: _SOURCE });
    app.close();
    // Настройки старой версии — без ключа proof.
    const db = new Database(path);
    const row = db
      .query<{ settings: string }, []>(
        "SELECT settings FROM forms_forms WHERE name = 'legacy'"
      )
      .get()!;
    const { proof: _proof, ...old } = JSON.parse(row.settings) as Record<
      string,
      unknown
    >;
    db.query("UPDATE forms_forms SET settings = ? WHERE name = 'legacy'").run(
      JSON.stringify(old)
    );
    db.close();
    setup({ databasePath: path });
    expect(app.forms.forms.get('legacy')!.proof).toBe('off');
    page = app.content.pages.create({
      title: 'Alt',
      alias: 'alt',
      template: 'Base',
      content: '[#Form:legacy]',
      publish: true,
    });
    const html = await show('/alt');
    expect(html).not.toContain('data-proof');
    const response = await post({ ...stampOf(html), ..._GOOD }, 'legacy');
    expect(response.status).toBe(200);
    // Новая форма на том же сайте — уже с защитой.
    expect(
      app.forms.forms.save('fresh', { title: 'Neu', source: _SOURCE }).proof
    ).toBe('standard');
    removeTemp(dir);
  });
});
