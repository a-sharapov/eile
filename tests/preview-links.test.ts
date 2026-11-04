import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';
import { removeTemp } from './fixtures/platform.ts';

// Ссылки предпросмотра (ADR 0054): черновик — клиенту без входа в менеджер, и больше ничего.

const PASSWORD = 'correct horse battery';
let app: App;
let admin = '';
let draft = 0;
let now = new Date('2026-11-03T10:00:00Z');

const api = (
  method: string,
  path: string,
  {
    body,
    cookie,
    bearer,
  }: { body?: unknown; cookie?: string; bearer?: string } = {}
) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const json = (response: Response) => response.json() as Promise<any>;

const share = (body: object) =>
  api('POST', '/review/links', { cookie: admin, body });

const visit = (url: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(url, { headers }), {
    requestIP: () => ({ address: '203.0.113.7' }),
  });

beforeEach(async () => {
  now = new Date('2026-11-03T10:00:00Z');
  app = createApp({ scaffold: DEMO, clock: () => now });
  const setup = await api('POST', '/setup', {
    body: {
      token: app.identity.setup.token(),
      email: 'anna@example.com',
      name: 'Анна',
      password: PASSWORD,
    },
  });
  admin = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  app.forms.forms.save('callback', {
    title: 'Обратный звонок',
    source: '<label>Имя <input name="name" required></label>',
  });
  draft = app.content.pages.create({
    title: 'Новая кухня',
    alias: 'novaya-kuhnya',
    template: 'Base',
    content: '<p>Черновик для клиента</p>[#Form:callback]',
  });
});

describe('ссылка на черновик', () => {
  it('жизнь ссылки: выпуск один раз, список без секрета, просмотр, отзыв', async () => {
    const created = await share({ page: draft, label: 'Для клиента' });
    expect(created.status).toBe(201);
    const link = await json(created);
    expect(link.url).toBe(`http://localhost/_cms/preview/${link.token}`);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{44}$/);
    expect(link).toMatchObject({
      label: 'Для клиента',
      target: { page: draft, changeSet: null },
      live: true,
      createdBy: { name: 'Анна' },
      expiresAt: '2026-11-10T10:00:00.000Z',
    });
    const list = await json(
      await api('GET', `/review/links?page=${draft}&set=`, { cookie: admin })
    );
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(link.token);
    expect(JSON.stringify(list)).not.toContain(link.token.slice(12));

    const page = await visit(link.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Черновик для клиента');
    expect(
      (
        await json(
          await api('GET', `/review/links?page=${draft}`, { cookie: admin })
        )
      )[0].uses
    ).toBe(1);

    expect(
      (await api('DELETE', `/review/links/${link.id}`, { cookie: admin }))
        .status
    ).toBe(200);
    expect((await visit(link.url)).status).toBe(404);
  });

  it('в базе — хэш секрета, а не токен', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eile-review-test-'));
    const path = join(dir, 'site.db');
    const disk = createApp({ databasePath: path, scaffold: DEMO });
    const user = await disk.identity.users.create({
      email: 'a@example.com',
      role: 'admin',
      password: PASSWORD,
    });
    const id = disk.content.pages.create({
      title: 'Черновик',
      template: 'Base',
    });
    const link = disk.review.links.create({
      target: { page: id, changeSet: null },
      by: { id: user.id, name: user.name },
    });
    disk.close();
    const db = new Database(path, { readonly: true });
    const row = db
      .query<{ selector: string; verifier_hash: string }, []>(
        'SELECT selector, verifier_hash FROM review_share_links'
      )
      .get()!;
    db.close();
    removeTemp(dir);
    expect(row.selector).toBe(link.token.slice(0, 12));
    expect(row.verifier_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.verifier_hash).not.toContain(link.token.slice(12));
  });

  it('ответ: noindex, мимо кэшей, без Referer, без полосы правки, плашка на языке сайта', async () => {
    const link = await json(await share({ page: draft }));
    // Вошедший в менеджер полосы правки на предпросмотре не получает.
    const page = await visit(link.url, { cookie: admin });
    expect(page.headers.get('x-robots-tag')).toContain('noindex');
    expect(page.headers.get('cache-control')).toContain('no-store');
    expect(page.headers.get('cache-control')).toContain('private');
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
    expect(page.headers.get('etag')).toBeNull();
    expect(page.headers.get('x-cache')).toBeNull();
    const html = await page.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('Предпросмотр — не опубликовано');
    expect(html).not.toContain('/manager/bar.');
    expect(html).toContain('<html lang="ru"');
    // Кэш страниц предпросмотр не трогает; черновик по своему адресу — по-прежнему 404.
    const cache = await json(await api('GET', '/cache', { cookie: admin }));
    expect(cache.pages).toBe(0);
    expect((await visit('http://localhost/novaya-kuhnya')).status).toBe(404);
  });

  it('формы в предпросмотре не отправляются, а стили — файлами сайта', async () => {
    const link = await json(await share({ page: draft }));
    const html = await (await visit(link.url)).text();
    expect(html).toMatch(/<form[^>]*method="dialog"[^>]*data-cms-preview/);
    expect(html).not.toMatch(/<form[^>]*action=/);
    expect(html).toContain('<fieldset disabled');
    expect(html).toContain('Формы в предпросмотре не отправляются.');
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/_cms\/styles\/site\.[a-z0-9]+\.css">/
    );
  });

  it('шрифты медиатеки — с CORS: их получит и предпросмотр в песочнице', async () => {
    app.media.files.save({
      path: 'fonts/brand.woff2',
      data: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]),
    });
    const font = await visit('http://localhost/media/fonts/brand.woff2');
    expect(font.headers.get('content-type')).toBe('font/woff2');
    expect(font.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('плашка — на языке страницы', async () => {
    const de = app.content.pages.create({
      title: 'Küche',
      template: 'Base',
      language: 'de',
    });
    const link = await json(await share({ page: de }));
    expect(await (await visit(link.url)).text()).toContain(
      'Vorschau — nicht veröffentlicht'
    );
  });

  it('срок: по умолчанию 7 дней, свой — до 90; истёкшая — 404', async () => {
    const week = await json(await share({ page: draft }));
    const day = await json(await share({ page: draft, days: 1 }));
    expect((await share({ page: draft, days: 91 })).status).toBe(422);
    now = new Date('2026-11-04T10:00:01Z');
    expect((await visit(day.url)).status).toBe(404);
    expect((await visit(week.url)).status).toBe(200);
    const links = await json(
      await api('GET', `/review/links?page=${draft}`, { cookie: admin })
    );
    expect(links.map((_: { live: boolean }) => _.live)).toEqual([false, true]);
    await api('PUT', '/review/settings', {
      cookie: admin,
      body: { linkDays: 30 },
    });
    expect((await json(await share({ page: draft }))).expiresAt).toBe(
      '2026-12-04T10:00:01.000Z'
    );
  });

  it('опубликованная страница — не черновик; корзина и чужие страницы — нет', async () => {
    expect((await share({ page: 2 })).status).toBe(409);
    const link = await json(await share({ page: draft }));
    app.content.pages.trash(draft);
    expect((await visit(link.url)).status).toBe(404);
  });

  it('токен открывает только свою страницу: хвост адреса и подбор — 404', async () => {
    const link = await json(await share({ page: draft }));
    expect((await visit(`${link.url}/../2`)).status).toBe(404);
    expect((await visit(`${link.url}x`)).status).toBe(404);
    const forged = `${link.token.slice(0, 12)}${'A'.repeat(32)}`;
    expect(
      (await visit(`http://localhost/_cms/preview/${forged}`)).status
    ).toBe(404);
    expect(
      (await app.fetch(new Request(link.url, { method: 'POST', body: 'x' })))
        .status
    ).toBe(405);
  });

  it('частые неверные поиски с одного адреса — 429', async () => {
    const tries = await Promise.all(
      Array.from({ length: 25 }, (_, n) =>
        visit(`http://localhost/_cms/preview/${String(n).padStart(44, 'x')}`)
      )
    );
    expect(tries.map((_) => _.status)).toContain(429);
    const link = await json(await share({ page: draft }));
    expect((await visit(link.url)).status).toBe(429);
    expect(
      (
        await app.fetch(new Request(link.url), {
          requestIP: () => ({ address: '198.51.100.1' }),
        })
      ).status
    ).toBe(200);
  });

  it('ссылку выдаёт только вошедший человек, не ключ API', async () => {
    const issued = await json(
      await api('POST', '/tokens', { cookie: admin, body: { name: 'Claude' } })
    );
    const response = await api('POST', '/review/links', {
      bearer: issued.token,
      body: { page: draft },
    });
    expect(response.status).toBe(403);
    expect((await json(response)).error.code).toBe('identity.session_required');
  });
});
