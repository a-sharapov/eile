import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { brotliDecompressSync } from 'node:zlib';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

const COUNTER =
  '<script>let { start = 0 } = $props(); let n = $state(start);</script><button class="counter" onclick={() => n++}>{n}</button><style>.counter { color: red; }</style>';

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
  app.design.components.save('Counter', COUNTER);
  app.design.templates.save(
    'Base',
    '<script>import Island from \'$core/Island\'; let { page } = $props();</script><h1>{page.title}</h1><Island name="Counter" props={{ start: 2 }} />'
  );
});

afterEach(() => app.close());

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));

const islandOf = (html: string) =>
  /<cms-island data-module="([^"]+)" data-props="([^"]+)"/.exec(html);

describe('острова', () => {
  it('страница несёт серверный HTML острова, props и один загрузчик', async () => {
    const html = await (await get('/kontakty')).text();
    const island = islandOf(html)!;
    expect(island[1]).toMatch(/^\/_cms\/islands\/Counter\.[a-z0-9]+\.js$/);
    expect(island[2]).toBe('{&quot;start&quot;:2}');
    expect(html).toMatch(
      /<!--\[-->\s*<button class="counter svelte-[a-z0-9]+">2<\/button>/
    );
    expect(html.match(/<script type="module">/g)?.length).toBe(1);
    expect(html).toContain('.counter.svelte-');
  });

  it('модуль острова ссылается на рантайм, оба кэшируются навсегда', async () => {
    const html = await (await get('/kontakty')).text();
    const module = await get(islandOf(html)![1]!);
    expect(module.headers.get('cache-control')).toContain('immutable');
    const code = await module.text();
    const runtime = /'(\/_cms\/runtime\/[a-z0-9]+\/internal-client\.js)'/.exec(
      code
    )![1]!;
    const response = await get(runtime);
    expect(response.status).toBe(200);
    expect((await response.text()).length).toBeGreaterThan(100);
  });

  it('рантайм и модуль острова уходят сжатыми, если браузер умеет', async () => {
    const html = await (await get('/kontakty')).text();
    const code = await (await get(islandOf(html)![1]!)).text();
    const runtime = /'(\/_cms\/runtime\/[a-z0-9]+\/internal-client\.js)'/.exec(
      code
    )![1]!;
    const plain = await (await get(runtime)).text();
    const packed = await app.fetch(
      new Request(`http://localhost${runtime}`, {
        headers: { 'accept-encoding': 'gzip, deflate, br' },
      })
    );
    expect(packed.headers.get('content-encoding')).toBe('br');
    expect(packed.headers.get('vary')).toBe('accept-encoding');
    const bytes = new Uint8Array(await packed.arrayBuffer());
    expect(bytes.byteLength).toBeLessThan(plain.length / 2);
    expect(new TextDecoder().decode(brotliDecompressSync(bytes))).toBe(plain);
  });

  it('страница без островов — без скриптов', async () => {
    app.design.templates.save(
      'Base',
      '<script>let { page } = $props();</script><h1>{page.title}</h1>'
    );
    // Разметка JSON-LD — данные, а не скрипт: JS на странице без островов нет.
    expect(await (await get('/kontakty')).text()).not.toMatch(
      /<script(?! type="application\/ld\+json")/
    );
  });

  it('остров не может читать сервер', async () => {
    app.design.components.save(
      'Counter',
      "<script>import { site } from '$core';</script><b>{site().name}</b>"
    );
    const html = await (await get('/kontakty')).text();
    expect(html).toContain('<h1>Контакты</h1>');
    expect(islandOf(html)).toBeNull();
  });

  it('текст со словами import и from в острове — не импорт', async () => {
    app.design.components.save(
      'Counter',
      "<script>let { start = 0 } = $props(); const word = 'import';</script><button class=\"counter\">{word} {start} from 'svelte'</button>"
    );
    const html = await (await get('/kontakty')).text();
    const code = await (await get(islandOf(html)![1]!)).text();
    expect(code).toContain("from 'svelte'");
  });

  it('неизвестный файл — 404', async () => {
    expect((await get('/_cms/islands/Nope.x.js')).status).toBe(404);
  });
});
