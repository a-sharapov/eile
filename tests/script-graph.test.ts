import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { brotliDecompressSync } from 'node:zlib';
import { type App, createApp } from '../src/app.ts';
import type { UserView } from '../src/contexts/identity/index.ts';
import { defineAgentSession } from '../src/contexts/manager/index.ts';
import {
  attempt,
  type DomainError,
  isDomainError,
} from '../src/shared/kernel/errors.ts';
import { filesOf, push } from '../src/workspace/index.ts';
import { DEMO } from './fixtures/demo.ts';

// Сборка с разделением кода: вход, общий рантайм, ленивая сцена и воркер.
const SHARED =
  "export const state = { ready: false };\nexport const log = (x) => console.log('shared', x);\n";
const LAZY =
  "import { state, log } from './shared.js';\nexport const start = () => { state.ready = true; log('lazy'); };\n";
const WORKER =
  "import { log } from './shared.js';\nself.onmessage = (e) => { log(e.data); self.postMessage(e.data * 2); };\n";
const ENTRY = [
  "import { state } from './shared.js';",
  "const note = './shared.js';",
  'const code = "import(\'./lazy.js\')";',
  "const scene = () => import('./lazy.js').then((_) => _.start());",
  "const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });",
  'export { state, note, code, scene, worker };',
  '',
].join('\n');

// Так пишет Rolldown: общий рантайм — во входе, ленивый кусок импортирует его оттуда.
const SHELL =
  'export const runtime = { mounted: 0 };\nexport const open = () => import(`./viewer.js`);\n';
const VIEWER =
  "import { runtime } from './shell.js';\nexport const mount = () => (runtime.mounted += 1, new URL(`./pixels.js`, import.meta.url));\n";
const PIXELS = 'self.onmessage = () => self.postMessage(1);\n';

const BASE = `<script>
  import { script } from '$core';
  let { page } = $props();
</script>
<svelte:head><script type="module" src={script('entry')}></script></svelte:head>
<h1>{page.title}</h1>`;

let app: App;

const get = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`http://localhost${path}`, init));

const url = (name: string) => app.design.scripts.url(name)!;

const hashOf = (name: string) => /\.([a-z0-9]+)\.js$/.exec(url(name))![1]!;

const body = (name: string) => get(url(name)).then((_) => _.text());

const pageScript = (html: string): string | null =>
  /<script type="module" src="(\/_cms\/scripts\/[^"]+)"><\/script>/.exec(
    html
  )?.[1] ?? null;

const errorOf = (action: () => void): DomainError | null =>
  attempt(
    () => (action(), null),
    (error) => (isDomainError(error) ? error : null)
  );

const saveGraph = () => {
  const batch = new Map([
    ['entry', ENTRY],
    ['lazy', LAZY],
    ['worker', WORKER],
    ['shared', SHARED],
  ]);
  batch.forEach(
    (source, name) => void app.design.scripts.save(name, source, batch)
  );
};

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

describe('скрипты ссылаются друг на друга', () => {
  it('отдаются с путями ./имя.хэш.js: статический, динамический импорт и воркер', async () => {
    saveGraph();
    const entry = await body('entry');
    expect(entry).toContain(
      `import { state } from './shared.${hashOf('shared')}.js';`
    );
    expect(entry).toContain(`import('./lazy.${hashOf('lazy')}.js')`);
    expect(entry).toContain(
      `new URL('./worker.${hashOf('worker')}.js', import.meta.url)`
    );
    expect(await body('lazy')).toContain(
      `from './shared.${hashOf('shared')}.js'`
    );
    expect(await body('worker')).toContain(
      `from './shared.${hashOf('shared')}.js'`
    );
    expect(await body('shared')).toBe(SHARED);
    // Строка, где только написано «./shared.js», — не ссылка.
    expect(entry).toContain("const note = './shared.js';");
    expect(entry).toContain('const code = "import(\'./lazy.js\')";');
    // Относительный путь от адреса входа ведёт на адрес куска.
    expect(
      new URL(`./shared.${hashOf('shared')}.js`, `http://x${url('entry')}`)
        .pathname
    ).toBe(url('shared'));
  });

  it('заголовки — как у любого скрипта; br и длина — по телу с хэшами', async () => {
    saveGraph();
    const plain = await get(url('entry'));
    expect(plain.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8'
    );
    expect(plain.headers.get('x-content-type-options')).toBe('nosniff');
    expect(plain.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(plain.headers.get('etag')).toBe(`"${hashOf('entry')}"`);
    const text = await plain.text();
    const head = await get(url('entry'), { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe(
      String(new TextEncoder().encode(text).byteLength)
    );
    const packed = await get(url('entry'), {
      headers: { 'accept-encoding': 'br' },
    });
    expect(
      new TextDecoder().decode(
        brotliDecompressSync(new Uint8Array(await packed.arrayBuffer()))
      )
    ).toBe(text);
  });

  it('правка общего куска меняет адреса всех, кто до него доходит, и перерисовывает страницу', async () => {
    saveGraph();
    app.design.templates.save('Base', BASE);
    const first = await get('/kontakty');
    const old = {
      entry: url('entry'),
      lazy: url('lazy'),
      shared: url('shared'),
    };
    expect(pageScript(await first.text())).toBe(old.entry);
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('hit');
    const packedBefore = await get(old.entry, {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(packedBefore.status).toBe(200);

    app.design.scripts.save('shared', `${SHARED}export const v = 2;\n`);

    expect(url('shared')).not.toBe(old.shared);
    expect(url('lazy')).not.toBe(old.lazy);
    expect(url('entry')).not.toBe(old.entry);
    const next = await get('/kontakty');
    expect(next.headers.get('x-cache')).toBe('miss');
    expect(pageScript(await next.text())).toBe(url('entry'));
    expect((await get(old.entry)).status).toBe(404);
    expect((await get(old.shared)).status).toBe(404);
    expect(await body('entry')).toContain(`./shared.${hashOf('shared')}.js`);
    const packedAfter = await get(url('entry'), {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(packedAfter.headers.get('etag')).toBe(`"${hashOf('entry')}-gzip"`);
    expect(
      new TextDecoder().decode(
        Bun.gunzipSync(new Uint8Array(await packedAfter.arrayBuffer()))
      )
    ).toContain(`./shared.${hashOf('shared')}.js`);
  });

  it('правка скрипта, на который никто не ссылается, адреса других не трогает', () => {
    saveGraph();
    app.design.scripts.save('other', 'export const x = 1;\n');
    const entry = url('entry');
    app.design.scripts.save('other', 'export const x = 2;\n');
    expect(url('entry')).toBe(entry);
  });

  it('скрипт без ссылок — прежний хэш исходника', () => {
    app.design.scripts.save('shared', SHARED);
    expect(hashOf('shared')).toBe(Bun.hash(SHARED).toString(36));
  });

  it('по кругу: вход и ленивый кусок — один хэш, оба пути с ним; правка любого меняет оба', async () => {
    const batch = new Map([
      ['shell', SHELL],
      ['viewer', VIEWER],
      ['pixels', PIXELS],
    ]);
    app.design.scripts.saveAll(batch);
    expect(hashOf('shell')).toBe(hashOf('viewer'));
    expect(hashOf('pixels')).not.toBe(hashOf('shell'));
    expect(await body('shell')).toContain(
      `import(\`./viewer.${hashOf('viewer')}.js\`)`
    );
    const viewer = await body('viewer');
    expect(viewer).toContain(`from './shell.${hashOf('shell')}.js'`);
    expect(viewer).toContain(
      `new URL(\`./pixels.${hashOf('pixels')}.js\`, import.meta.url)`
    );
    const before = { shell: url('shell'), pixels: url('pixels') };
    app.design.scripts.save('viewer', `${VIEWER}export const v = 2;\n`);
    expect(url('shell')).not.toBe(before.shell);
    expect(url('pixels')).toBe(before.pixels);
    app.design.scripts.save('pixels', `${PIXELS}// 2\n`);
    expect(url('shell')).not.toBe(before.shell);
    expect(await body('viewer')).toContain(`./pixels.${hashOf('pixels')}.js`);
    // Ссылка на себя — тоже круг.
    app.design.scripts.save(
      'self',
      "export const again = () => import('./self.js');\n"
    );
    expect(await body('self')).toContain(
      `import('./self.${hashOf('self')}.js')`
    );
  });

  it('по кругу страница с входом перерисовывается от правки ленивого куска', async () => {
    const batch = new Map([
      ['entry', SHELL],
      ['viewer', VIEWER.replace('./shell.js', './entry.js')],
      ['pixels', PIXELS],
    ]);
    app.design.scripts.saveAll(batch);
    app.design.templates.save('Base', BASE);
    const old = pageScript(await (await get('/kontakty')).text());
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('hit');
    app.design.scripts.save('pixels', `${PIXELS}// 2\n`);
    const next = await get('/kontakty');
    expect(next.headers.get('x-cache')).toBe('miss');
    const fresh = pageScript(await next.text());
    expect(fresh).not.toBe(old);
    expect(fresh).toBe(url('entry'));
  });

  it('каркас ставит скрипты одним набором: круг из новых — тоже', () => {
    const site = createApp({
      scaffold: {
        ...DEMO,
        scripts: { shell: SHELL, viewer: VIEWER, pixels: PIXELS },
      },
    });
    expect(site.design.scripts.url('shell')).toBe(
      site.design.scripts.url('viewer')!.replace('viewer', 'shell')
    );
    site.close();
  });

  it('скрипта, на который ссылаются, нет — сохранение отклоняется с местом ссылки', () => {
    const error = errorOf(() => app.design.scripts.save('entry', ENTRY));
    expect(error?.code).toBe('design.unknown_script');
    expect(error?.message).toContain('"shared"');
    expect(error?.at).toEqual({ line: 1, column: 23 });
    expect(app.design.scripts.url('entry')).toBeNull();
    app.design.scripts.save('shared', SHARED);
    expect(
      errorOf(() => app.design.scripts.save('entry', ENTRY))?.message
    ).toContain('"lazy"');
  });

  it('по одному — сначала куски, затем вход', () => {
    app.design.scripts.save('shared', SHARED);
    app.design.scripts.save('lazy', LAZY);
    app.design.scripts.save('worker', WORKER);
    app.design.scripts.save('entry', ENTRY);
    expect(url('entry')).toStartWith('/_cms/scripts/entry.');
  });

  it('другие пути — по-прежнему script_import, подсказка про ./имя.js', () => {
    const error = errorOf(() =>
      app.design.scripts.save('entry', "import x from './chunks/x.js';\n")
    );
    expect(error?.code).toBe('design.script_import');
    expect(error?.message).toContain('./name.js');
  });

  it('скрипт, на который ссылается другой, не удаляется; usage его называет', () => {
    saveGraph();
    expect(
      app.design.elements.importers('shared', 'script').toSorted()
    ).toEqual(['entry', 'lazy', 'worker'] as never);
    expect(app.design.elements.importers('lazy', 'script')).toEqual([
      'entry',
    ] as never);
    expect(
      errorOf(() => app.design.elements.remove('script', 'shared'))?.code
    ).toBe('design.element_in_use');
    app.design.elements.remove('script', 'entry');
    app.design.elements.remove('script', 'lazy');
    app.design.elements.remove('script', 'worker');
    app.design.elements.remove('script', 'shared');
    expect(app.design.scripts.url('shared')).toBeNull();
  });

  it('прежний хэш — 404, незнакомый — 404', async () => {
    saveGraph();
    const old = url('lazy');
    app.design.scripts.save('lazy', `${LAZY}// 2\n`);
    expect((await get(old)).status).toBe(404);
    expect((await get(url('lazy'))).status).toBe(200);
    expect((await get('/_cms/scripts/lazy.js')).status).toBe(404);
  });
});

describe('скрипты папки элементов одной отправкой', () => {
  // Папка — как после pull: все элементы сайта, кроме скриптов, и эти скрипты.
  const folder = (scripts: Record<string, string>) =>
    new Map([
      ...[...filesOf(app)].filter(
        ({ 0: path }) => !path.startsWith('scripts/')
      ),
      ...Object.entries(scripts).map(
        ({ 0: name, 1: source }) => [`scripts/${name}.js`, source] as const
      ),
    ]);

  it('граф уходит целиком в любом порядке; переименованный кусок, prune убирает прежний', () => {
    const first = push(
      app,
      folder({ entry: ENTRY, lazy: LAZY, shared: SHARED, worker: WORKER })
    );
    expect(first.problems).toEqual([]);
    expect(first.saved).toBe(true);
    const entry = url('entry');

    const renamed = (_: string) => _.replaceAll('./shared.js', './runtime.js');
    const second = push(
      app,
      folder({
        entry: renamed(ENTRY),
        lazy: renamed(LAZY),
        runtime: SHARED,
        worker: renamed(WORKER),
      }),
      { prune: true }
    );
    expect(second.problems).toEqual([]);
    expect(second.added).toEqual(['scripts/runtime.js']);
    expect(second.removed).toContain('scripts/shared.js');
    expect(app.design.scripts.url('shared')).toBeNull();
    expect(url('entry')).not.toBe(entry);
  });

  it('без prune прежний кусок остаётся; ссылка в никуда — ошибка файла с местом, ничего не сохранено', () => {
    push(
      app,
      folder({ entry: ENTRY, lazy: LAZY, shared: SHARED, worker: WORKER })
    );
    const report = push(
      app,
      folder({
        entry: ENTRY.replaceAll('./lazy.js', './lost.js'),
        lazy: LAZY,
        shared: SHARED,
        worker: WORKER,
      }),
      { dryRun: true }
    );
    expect(report.saved).toBe(false);
    expect(report.problems).toEqual([
      expect.objectContaining({
        file: 'scripts/entry.js',
        code: 'design.unknown_script',
        line: 4,
        column: 28,
      }),
    ]);
  });

  it('скрипты по кругу prune удаляет вместе; оставшийся вход держит кусок', () => {
    const cycle = { shell: SHELL, viewer: VIEWER, pixels: PIXELS };
    expect(push(app, folder(cycle)).problems).toEqual([]);
    const kept = push(app, folder({ shell: SHELL }), { prune: true });
    expect(kept.saved).toBe(false);
    expect(kept.problems).toEqual([
      expect.objectContaining({
        file: 'scripts/viewer.js',
        code: 'design.element_in_use',
      }),
    ]);
    const gone = push(app, folder({}), { prune: true });
    expect(gone.problems).toEqual([]);
    expect([...gone.removed].toSorted()).toEqual([
      'scripts/pixels.js',
      'scripts/shell.js',
      'scripts/viewer.js',
    ]);
  });
});

describe('скрипты по кругу у агента и в менеджере', () => {
  const PASSWORD = 'correct horse battery';
  let cookie = '';
  let anna: UserView;
  // Один сеанс агента — один набор правок.
  let session = defineAgentSession();

  const call = (method: string, path: string, body?: unknown) =>
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

  const tool = (name: string, args: object) =>
    app
      .mcp(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        },
        anna,
        session
      )
      .then(
        (_) =>
          (_ as { result: { isError: boolean; content: { text: string }[] } })
            .result
      );

  beforeEach(async () => {
    session = defineAgentSession();
    cookie = (
      (
        await call('POST', '/setup', {
          token: app.identity.setup.token(),
          email: 'anna@example.com',
          password: PASSWORD,
        })
      ).headers.get('set-cookie') ?? ''
    ).split(';')[0]!;
    anna = app.identity.users
      .list()
      .find((_) => _.email === 'anna@example.com')!;
  });

  it('по одному круг не сохранить: ошибка называет пропавший скрипт', async () => {
    const shell = await tool('save_element', {
      kind: 'script',
      name: 'shell',
      source: SHELL,
    });
    expect(shell.isError).toBe(true);
    expect(shell.content[0]!.text).toStartWith('design.unknown_script: shell:');
    expect(shell.content[0]!.text).toContain('(line 2, column');
  });

  it('save_element со scripts сохраняет круг одним шагом', async () => {
    const saved = await tool('save_element', {
      kind: 'script',
      name: 'shell',
      source: SHELL,
      scripts: { viewer: VIEWER, pixels: PIXELS },
    });
    expect(saved.isError).toBe(false);
    expect(hashOf('shell')).toBe(hashOf('viewer'));
    expect(app.design.scripts.url('pixels')).toStartWith('/_cms/scripts/');
  });

  it('API: со scripts — всё или ничего; usage скрипта называет скрипты', async () => {
    const broken = await call('PUT', '/elements/script/shell', {
      source: SHELL,
      scripts: { viewer: VIEWER, pixels: 'export const = 1;' },
    });
    expect(broken.status).toBe(422);
    expect(await broken.json()).toMatchObject({
      error: { code: 'design.script_syntax' },
    });
    expect(app.design.scripts.url('viewer')).toBeNull();
    expect(
      (
        await call('PUT', '/elements/script/shell', {
          source: SHELL,
          scripts: [VIEWER],
        })
      ).status
    ).toBe(422);
    const saved = await call('PUT', '/elements/script/shell', {
      source: SHELL,
      scripts: { viewer: VIEWER, pixels: PIXELS },
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ kind: 'script', name: 'shell' });
    expect(
      await (await call('GET', '/elements/script/pixels/usage')).json()
    ).toEqual({ pages: [], elements: ['viewer'] });
    expect((await call('DELETE', '/elements/script/pixels')).status).toBe(409);
  });

  it('в режиме проверки куски предлагаются по очереди или вместе и принимаются вместе', async () => {
    expect(
      (await call('PUT', '/review/settings', { agents: true })).status
    ).toBe(200);
    const one = (name: string, source: string) =>
      tool('save_element', { kind: 'script', name, source }).then(
        (_) => _.isError
      );
    expect(await one('pixels', PIXELS)).toBe(false);
    expect(await one('shell', SHELL)).toBe(true);
    expect(
      (
        await tool('save_element', {
          kind: 'script',
          name: 'shell',
          source: SHELL,
          scripts: { viewer: VIEWER },
        })
      ).isError
    ).toBe(false);
    expect(app.design.scripts.url('shell')).toBeNull();
    const sets = (await (await call('GET', '/review/sets')).json()) as {
      id: number;
    }[];
    const accepted = await call(
      'POST',
      `/review/sets/${sets[0]!.id}/accept`,
      {}
    );
    expect(accepted.status).toBe(200);
    expect(hashOf('shell')).toBe(hashOf('viewer'));
    expect(app.design.scripts.url('pixels')).toStartWith('/_cms/scripts/');
  });
});
