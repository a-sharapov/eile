import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { type App, createApp } from '../src/app.ts';
import { designMigrations } from '../src/contexts/design/index.ts';
import type { UserView } from '../src/contexts/identity/index.ts';
import { defineAgentSession } from '../src/contexts/manager/index.ts';
import { migrate, openDatabase } from '../src/platform/database.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

const STAGE =
  "const stage = document.querySelector('[data-stage]');\nstage?.setAttribute('data-ready', '');\n";

// Рекомендованная форма: тег в <svelte:head>, на верхнем уровне разметки <script> не компилируется.
const BASE = `<script>
  import { script } from '$core';
  let { page } = $props();
  const src = script('kitchen-stage');
</script>
<svelte:head>{#if src}<script type="module" {src}></script>{/if}</svelte:head>
<h1>{page.title}</h1><div data-stage></div>`;

const get = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`http://localhost${path}`, init));

const scriptUrl = (html: string): string | null =>
  /<script type="module" src="(\/_cms\/scripts\/[^"]+)"><\/script>/.exec(
    html
  )?.[1] ?? null;

const errorCode = (action: () => void): string | undefined =>
  attempt(
    () => void action(),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
  app.design.scripts.save('kitchen-stage', STAGE);
  app.design.templates.save('Base', BASE);
});

afterEach(() => app.close());

describe('скрипты сайта', () => {
  it('отдаются по адресу с хэшем: тип, nosniff, навсегда в кэше, ETag', async () => {
    const url = app.design.scripts.url('kitchen-stage')!;
    expect(url).toMatch(/^\/_cms\/scripts\/kitchen-stage\.[a-z0-9]+\.js$/);
    const response = await get(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8'
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    const etag = response.headers.get('etag')!;
    expect(etag).toMatch(/^"[a-z0-9]+"$/);
    expect(await response.text()).toBe(STAGE);
    const again = await get(url, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });

  it('HEAD — заголовки и длина без тела; другие методы — 405', async () => {
    const url = app.design.scripts.url('kitchen-stage')!;
    const head = await get(url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(
      String(new TextEncoder().encode(STAGE).byteLength)
    );
    expect(head.headers.get('content-type')).toContain('text/javascript');
    expect(await head.text()).toBe('');
    expect((await get(url, { method: 'POST' })).status).toBe(405);
  });

  it('сжимается br, если браузер умеет; у сжатой копии свой ETag', async () => {
    const big = `export const data = ${JSON.stringify('кухня '.repeat(5000))};\n`;
    app.design.scripts.save('kitchen-stage', big);
    const url = app.design.scripts.url('kitchen-stage')!;
    const packed = await get(url, {
      headers: { 'accept-encoding': 'gzip, br' },
    });
    expect(packed.headers.get('content-encoding')).toBe('br');
    expect(packed.headers.get('vary')).toBe('accept-encoding');
    expect(packed.headers.get('etag')).toMatch(/-br"$/);
    const bytes = new Uint8Array(await packed.arrayBuffer());
    expect(bytes.byteLength).toBeLessThan(big.length / 10);
    expect(new TextDecoder().decode(brotliDecompressSync(bytes))).toBe(big);
  });

  it('незнакомое имя, прежний хэш и чужой путь — 404', async () => {
    const url = app.design.scripts.url('kitchen-stage')!;
    expect((await get('/_cms/scripts/nope.abc.js')).status).toBe(404);
    expect((await get(url.replace(/\.[a-z0-9]+\.js$/, '.zzz.js'))).status).toBe(
      404
    );
    expect((await get('/_cms/scripts/kitchen-stage.js')).status).toBe(404);
    expect((await get('/_cms/scripts/../islands/x.js')).status).toBe(404);
    expect(app.design.scripts.url('nope')).toBeNull();
    expect(app.design.scripts.url('Not A Name')).toBeNull();
  });

  it('правка скрипта перерисовывает страницу из кэша: новый адрес, прежний — 404', async () => {
    const first = await get('/kontakty');
    const old = scriptUrl(await first.text())!;
    expect(old).toBe(app.design.scripts.url('kitchen-stage')!);
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('hit');

    app.design.scripts.save('kitchen-stage', `${STAGE}console.log('v2');\n`);

    const next = await get('/kontakty');
    expect(next.headers.get('x-cache')).toBe('miss');
    const fresh = scriptUrl(await next.text())!;
    expect(fresh).not.toBe(old);
    expect(fresh).toBe(app.design.scripts.url('kitchen-stage')!);
    expect((await get(old)).status).toBe(404);
    expect(await (await get(fresh)).text()).toContain("console.log('v2')");
  });

  it('скрипта ещё нет — тега нет; появился — страница перерисована с ним', async () => {
    app.design.templates.save(
      'Base',
      BASE.replaceAll('kitchen-stage', 'later')
    );
    const before = await (await get('/kontakty')).text();
    expect(before).not.toContain('/_cms/scripts/');
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('hit');
    app.design.scripts.save('later', STAGE);
    const after = await get('/kontakty');
    expect(after.headers.get('x-cache')).toBe('miss');
    expect(scriptUrl(await after.text())).toBe(app.design.scripts.url('later'));
  });

  it('script() без {#if}: без скрипта Svelte не выводит src', async () => {
    app.design.templates.save(
      'Base',
      `<script>import { script } from '$core'; let { page } = $props();</script><svelte:head><script type="module" src={script('kitchen-stage')}></script></svelte:head><h1>{page.title}</h1>`
    );
    expect(scriptUrl(await (await get('/kontakty')).text())).toBe(
      app.design.scripts.url('kitchen-stage')
    );
  });

  it('удалить скрипт, который подключает шаблон, нельзя', () => {
    expect(app.design.elements.importers('kitchen-stage', 'script')).toEqual([
      'Base',
    ] as never);
    expect(
      errorCode(() => app.design.elements.remove('script', 'kitchen-stage'))
    ).toBe('design.element_in_use');
    app.design.templates.save('Base', '<h1>Без сцены</h1>');
    app.design.elements.remove('script', 'kitchen-stage');
    expect(app.design.scripts.url('kitchen-stage')).toBeNull();
  });

  it('при сохранении: имя, синтаксис и импорты проверяются, сайт остаётся на прежней версии', () => {
    const url = app.design.scripts.url('kitchen-stage');
    expect(errorCode(() => app.design.scripts.save('Kitchen', STAGE))).toBe(
      'design.invalid_script_name'
    );
    expect(
      errorCode(() => app.design.scripts.save('kitchen-stage', 'const = 1;'))
    ).toBe('design.script_syntax');
    expect(
      errorCode(() =>
        app.design.scripts.save('kitchen-stage', "import * as T from 'three';")
      )
    ).toBe('design.script_import');
    expect(app.design.scripts.url('kitchen-stage')).toBe(url);
    expect(app.design.elements.get('script', 'kitchen-stage')?.revision).toBe(
      1
    );
  });

  it('скрипт переживает копию сайта', async () => {
    const copy = app.archive();
    const restored = createApp();
    await restored.restore(new TextEncoder().encode(JSON.stringify(copy)));
    expect(
      restored.design.elements.get('script', 'kitchen-stage')?.source
    ).toBe(STAGE);
    restored.close();
  });
});

describe('миграция design/002_scripts', () => {
  it('старая база: элементы остаются, скрипт сохраняется', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cms-scripts-'));
    const path = join(dir, 'old.db');
    const db = openDatabase(path);
    migrate(db, designMigrations.slice(0, 1));
    db.run(
      "INSERT INTO design_elements (kind, name, source, revision, updated_at) VALUES ('component', 'Old', '<p>old</p>', 3, '2026-01-01')"
    );
    expect(() =>
      db.run(
        "INSERT INTO design_elements (kind, name, source, revision, updated_at) VALUES ('script', 'x', 'x', 1, '2026-01-01')"
      )
    ).toThrow();
    db.close();
    const upgraded = createApp({ databasePath: path });
    expect(upgraded.design.elements.get('component', 'Old')).toMatchObject({
      source: '<p>old</p>',
      revision: 3,
    });
    upgraded.design.scripts.save('stage', STAGE);
    expect(upgraded.design.scripts.url('stage')).toStartWith('/_cms/scripts/');
    upgraded.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('скрипты в менеджере и у агента', () => {
  const PASSWORD = 'correct horse battery';
  let admin = '';

  const call = (method: string, path: string, body?: unknown, cookie = admin) =>
    app.fetch(
      new Request(`http://localhost/manager/api${path}`, {
        method,
        headers: {
          cookie,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );

  const cookieOf = (response: Response): string =>
    (response.headers.get('set-cookie') ?? '').split(';')[0]!;

  const tool = (
    user: UserView,
    name: string,
    args: object,
    session = defineAgentSession()
  ) =>
    app
      .mcp(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        },
        user,
        session
      )
      .then(
        (_) =>
          (_ as { result: { isError: boolean; content: { text: string }[] } })
            .result
      );

  beforeEach(async () => {
    admin = cookieOf(
      await call(
        'POST',
        '/setup',
        {
          token: app.identity.setup.token(),
          email: 'anna@example.com',
          password: PASSWORD,
        },
        ''
      )
    );
  });

  it('API: создать, прочитать с адресом, ошибка — с местом, использование, удаление', async () => {
    const created = await call('PUT', '/elements/script/menu-toggle', {
      source: STAGE,
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      kind: 'script',
      name: 'menu-toggle',
      revision: 1,
    });
    const read = (await (
      await call('GET', '/elements/script/menu-toggle')
    ).json()) as { url: string };
    expect(read.url).toBe(app.design.scripts.url('menu-toggle')!);
    expect(
      (
        (await (await call('GET', '/elements')).json()) as {
          kind: string;
          name: string;
        }[]
      )
        .filter((_) => _.kind === 'script')
        .map((_) => _.name)
    ).toEqual(['kitchen-stage', 'menu-toggle']);

    const broken = await call('PUT', '/elements/script/menu-toggle', {
      source: 'let a = 1;\nlet a = 2;\n',
    });
    expect(broken.status).toBe(422);
    expect(await broken.json()).toMatchObject({
      error: { code: 'design.script_syntax', at: { line: 2, column: 5 } },
    });

    expect(
      await (await call('GET', '/elements/script/kitchen-stage/usage')).json()
    ).toEqual({
      pages: [],
      elements: ['Base'],
    });
    expect(
      (await call('DELETE', '/elements/script/kitchen-stage')).status
    ).toBe(409);
    expect((await call('DELETE', '/elements/script/menu-toggle')).status).toBe(
      200
    );
    expect((await call('GET', '/elements/script/menu-toggle')).status).toBe(
      404
    );
    expect((await call('GET', '/elements/nope/menu-toggle')).status).toBe(404);
    expect((await call('DELETE', '/elements/nope/menu-toggle')).status).toBe(
      404
    );
  });

  it('API: скрипт больше 2 МиБ JSON-ом доходит до проверки размера', async () => {
    const huge = `export const a = '${'x'.repeat(2 * 1024 * 1024 + 10)}';`;
    const response = await call('PUT', '/elements/script/huge', {
      source: huge,
    });
    expect(response.status).toBe(422);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code
    ).toBe('design.source_too_large');
    const fits = `export const a = '${'x'.repeat(2 * 1024 * 1024 - 64)}';`;
    expect(
      (await call('PUT', '/elements/script/huge', { source: fits })).status
    ).toBe(200);
  });

  it('редактору скрипты закрыты — как шаблоны и компоненты', async () => {
    await call('POST', '/users', {
      email: 'ed@example.com',
      password: PASSWORD,
      role: 'editor',
    });
    const editor = cookieOf(
      await call(
        'POST',
        '/session',
        { email: 'ed@example.com', password: PASSWORD },
        ''
      )
    );
    expect(
      (await call('PUT', '/elements/script/x', { source: STAGE }, editor))
        .status
    ).toBe(403);
    expect(
      (await call('GET', '/elements/script/kitchen-stage', undefined, editor))
        .status
    ).toBe(403);
  });

  it('агент с правом на код сохраняет скрипт; прочитал заявки — нельзя', async () => {
    const anna = app.identity.users
      .list()
      .find((_) => _.email === 'anna@example.com')!;
    const saved = await tool(anna, 'save_element', {
      kind: 'script',
      name: 'agent-stage',
      source: STAGE,
    });
    expect(saved.isError).toBe(false);
    expect(app.design.scripts.url('agent-stage')).toStartWith(
      '/_cms/scripts/agent-stage.'
    );
    const read = await tool(anna, 'get_element', {
      kind: 'script',
      name: 'agent-stage',
    });
    expect(JSON.parse(read.content[0]!.text).url).toBe(
      app.design.scripts.url('agent-stage')
    );
    const bare = await tool(anna, 'save_element', {
      kind: 'script',
      name: 'agent-stage',
      source: "import 'three';",
    });
    expect(bare.isError).toBe(true);
    expect(bare.content[0]!.text).toContain('bundle your dependencies');

    const session = defineAgentSession();
    await tool(anna, 'list_submissions', {}, session);
    const tainted = await tool(
      anna,
      'save_element',
      { kind: 'script', name: 'backdoor', source: STAGE },
      session
    );
    expect(tainted.content[0]!.text).toStartWith('agent.tainted');
    expect(app.design.scripts.url('backdoor')).toBeNull();
  });

  it('памятка агента знает про скрипты и script(name)', async () => {
    const anna = app.identity.users
      .list()
      .find((_) => _.email === 'anna@example.com')!;
    const guide = await tool(anna, 'read_guide', { topic: 'script' });
    expect(guide.content[0]!.text).toContain(
      'Bundle your dependencies: build with code splitting'
    );
    expect(guide.content[0]!.text).toContain(
      "new URL('./name.js', import.meta.url)"
    );
    const core = await tool(anna, 'read_guide', { topic: 'core' });
    expect(core.content[0]!.text).toContain('script(name)');
    const template = await tool(anna, 'read_guide', { topic: 'template' });
    expect(template.content[0]!.text).toContain(
      `<svelte:head><script type="module" src={script('kitchen-stage')}></script></svelte:head>`
    );
  });
});
