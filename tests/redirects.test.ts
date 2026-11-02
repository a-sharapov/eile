import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;
let admin: string;
const _PASSWORD = 'correct horse battery';

const get = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`, { redirect: 'manual' }));

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

const cookieOf = (response: Response): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const pageId = (path: string): number => app.content.published.byPath(path)!.id;

// Все переадресации до ответа без Location: каждая — отдельный запрос; внешний адрес — последний шаг.
const hops = async (path: string, left = 5): Promise<string[]> => {
  const location = (await get(path)).headers.get('location');
  return location === null
    ? []
    : location.startsWith('/') && left > 0
      ? [location, ...(await hops(location, left - 1))]
      : [location];
};

beforeEach(async () => {
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

describe('правила переадресации на сайте', () => {
  it('адрес без страницы: 404, после правила — 301 с query, счётчик растёт', async () => {
    expect((await get('/old-price')).status).toBe(404);
    const { rule } = app.redirects.rules.create({
      from: '/old-price',
      to: '/kontakty',
    });
    const moved = await get('/old-price?utm_source=mail');
    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('/kontakty?utm_source=mail');
    expect(app.redirects.rules.list()[0]).toMatchObject({
      id: rule.id,
      hits: 1,
    });
    expect(app.redirects.rules.list()[0]!.lastHitAt).not.toBeNull();
  });

  it('302 и префикс, который переносит остаток адреса', async () => {
    app.redirects.rules.create({
      from: '/news/*',
      to: '/blog/*',
      status: 302,
    });
    const moved = await get('/news/2024/spring');
    expect(moved.status).toBe(302);
    expect(moved.headers.get('location')).toBe('/blog/2024/spring');
  });

  it('цель-страница идёт за ней после смены алиаса; снятая с публикации — правило молчит', async () => {
    const contacts = pageId('/kontakty');
    app.redirects.rules.create({ from: '/call', to: `[~${contacts}~]` });
    app.content.pages.edit(contacts, { alias: 'svyaz' });
    expect((await get('/call')).headers.get('location')).toBe('/svyaz');
    app.content.pages.unpublish(contacts);
    expect((await get('/call')).status).toBe(404);
  });

  it('внешняя цель получает query запроса', async () => {
    app.redirects.rules.create({
      from: '/shop/*',
      to: 'https://shop.example/*',
    });
    expect((await get('/shop/tea?ref=menu')).headers.get('location')).toBe(
      'https://shop.example/tea?ref=menu'
    );
  });

  it('живая страница важнее правила — правило сохраняется с предупреждением', async () => {
    const { warnings } = app.redirects.rules.create({
      from: '/kontakty',
      to: '/blog',
    });
    expect(warnings.map((_) => _.code)).toEqual(['redirects.shadowed']);
    expect((await get('/kontakty')).status).toBe(200);
  });

  it('правило важнее прежнего адреса страницы', async () => {
    const about = pageId('/o-proekte');
    app.content.pages.edit(about, { alias: 'about' });
    expect((await get('/o-proekte')).headers.get('location')).toBe('/about');
    app.redirects.rules.create({ from: '/o-proekte', to: '/kontakty' });
    expect((await get('/o-proekte')).headers.get('location')).toBe('/kontakty');
  });

  it('цель на прежний адрес страницы — цепочка; на страницу из корзины — отказ', () => {
    const about = pageId('/o-proekte');
    app.content.pages.edit(about, { alias: 'about' });
    expect(
      code(() => app.redirects.rules.create({ from: '/x', to: '/o-proekte' }))
    ).toBe('redirects.chain');
    app.content.pages.trash(about);
    expect(
      code(() => app.redirects.rules.create({ from: '/x', to: `[~${about}~]` }))
    ).toBe('redirects.page_not_found');
  });

  it('два правила с одним адресом — отказ; правка и удаление по id', () => {
    const { rule } = app.redirects.rules.create({ from: '/a', to: '/blog' });
    expect(
      code(() => app.redirects.rules.create({ from: '/a/', to: '/kontakty' }))
    ).toBe('redirects.rule_exists');
    app.redirects.rules.edit(rule.id, {
      from: '/a',
      to: '/kontakty',
      note: 'x',
    });
    expect(app.redirects.rules.list()[0]).toMatchObject({
      to: '/kontakty',
      note: 'x',
    });
    app.redirects.rules.remove(rule.id);
    expect(app.redirects.rules.list()).toEqual([]);
  });
});

describe('старый адрес со слэшем на конце', () => {
  it('/old/ и /old ведут к цели правила одним 301, query сохраняется', async () => {
    app.redirects.rules.create({ from: '/old-page', to: '/kontakty' });
    const moved = await get('/old-page/?utm_source=mail');
    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('/kontakty?utm_source=mail');
    expect(await hops('/old-page/')).toEqual(['/kontakty']);
    expect(await hops('/old-page')).toEqual(['/kontakty']);
    expect(await hops('//old-page//')).toEqual(['/kontakty']);
    expect(app.redirects.rules.list()[0]!.hits).toBe(4);
  });

  it('раздел со звёздочкой: адрес со слэшем — сразу в цель, остаток без слэша', async () => {
    app.redirects.rules.create({ from: '/news/*', to: '/blog/*' });
    expect(await hops('/news/2024/spring/?ref=menu')).toEqual([
      '/blog/2024/spring?ref=menu',
    ]);
    expect((await get('/news/')).headers.get('location')).toBe('/blog');
  });

  it('правило на весь сайт /* не перехватывает живые страницы со слэшем', async () => {
    app.redirects.rules.create({ from: '/*', to: 'https://old.example/*' });
    expect(await hops('/wp-content/uploads/a.jpg/')).toEqual([
      'https://old.example/wp-content/uploads/a.jpg',
    ]);
    expect(await hops('/kontakty/')).toEqual(['/kontakty']);
  });

  it('якорь цели доходит до Location как есть: путь, страница, URL; query — перед якорем', async () => {
    const contacts = pageId('/kontakty');
    app.redirects.rules.create({ from: '/map', to: '/kontakty#map' });
    app.redirects.rules.create({ from: '/office', to: `[~${contacts}~]#form` });
    app.redirects.rules.create({
      from: '/docs',
      to: 'https://docs.example/a#b',
    });
    expect(await hops('/map/?x=1')).toEqual(['/kontakty?x=1#map']);
    expect(await hops('/office/')).toEqual(['/kontakty#form']);
    expect(await hops('/docs/')).toEqual(['https://docs.example/a#b']);
    app.content.pages.edit(contacts, { alias: 'svyaz' });
    expect(await hops('/office')).toEqual(['/svyaz#form']);
  });

  it('CSV со слэшами и якорем: одна переадресация на старый адрес', async () => {
    const report = app.redirects.rules.import(
      'from;to\n/ueber-uns/;/o-proekte/#team\n/kategorie/*;/blog/*\n'
    );
    expect(report).toMatchObject({ added: 2, updated: 0, skipped: [] });
    expect(await hops('/ueber-uns/')).toEqual(['/o-proekte#team']);
    expect(await hops('/kategorie/kuechen/')).toEqual(['/blog/kuechen']);
  });

  it('без правила — как раньше: /b/ → /b; прежний адрес страницы — сразу на новый', async () => {
    expect(await hops('/b/')).toEqual(['/b']);
    expect((await get('/b')).status).toBe(404);
    expect(await hops('/o-proekte/')).toEqual(['/o-proekte']);
    app.content.pages.edit(pageId('/o-proekte'), { alias: 'about' });
    expect(await hops('/o-proekte/')).toEqual(['/about']);
  });
});

describe('правила в менеджере', () => {
  it('список, создание, CSV туда и обратно, прежние адреса', async () => {
    const about = pageId('/o-proekte');
    app.content.pages.edit(about, { alias: 'about' });
    const created = await call('POST', '/redirects', {
      from: '/promo',
      to: '/blog',
      note: 'листовка',
    });
    expect(created.status).toBe(201);
    const listed = (await (await call('GET', '/redirects')).json()) as any;
    expect(listed.rules).toHaveLength(1);
    expect(listed.moved).toEqual([
      expect.objectContaining({
        path: '/o-proekte',
        pageId: about,
        title: 'О проекте',
      }),
    ]);
    const csv = await (await call('GET', '/redirects/export')).text();
    expect(csv).toContain('/promo,/blog,301,листовка');
    const imported = (await (
      await call('POST', '/redirects/import', {
        csv: 'from;to;code\n/promo;/kontakty;302\n/new;/blog\nbad;/x\n/loop;/loop\n',
      })
    ).json()) as any;
    expect(imported).toMatchObject({ added: 1, updated: 1 });
    expect(imported.skipped.map((_: any) => [_.line, _.code])).toEqual([
      [4, 'redirects.invalid_from'],
      [5, 'redirects.loop'],
    ]);
    await call('POST', '/redirects/forget', { path: '/o-proekte' });
    expect((await get('/o-proekte')).status).toBe(404);
  });

  it('цепочка — 409 с кодом; редактору правила недоступны', async () => {
    await call('POST', '/redirects', { from: '/a', to: '/b' });
    const chain = await call('POST', '/redirects', { from: '/c', to: '/a' });
    expect(chain.status).toBe(409);
    expect(((await chain.json()) as any).error.code).toBe('redirects.chain');
    await app.identity.users.create({
      email: 'editor@example.com',
      role: 'editor',
      password: _PASSWORD,
    });
    const editor = cookieOf(
      await call(
        'POST',
        '/session',
        { email: 'editor@example.com', password: _PASSWORD },
        ''
      )
    );
    expect((await call('GET', '/redirects', undefined, editor)).status).toBe(
      403
    );
    expect((await call('GET', '/diagnostics', undefined, editor)).status).toBe(
      403
    );
  });
});
