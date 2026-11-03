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

// Стили страницы — в файлах по ссылкам из head (ADR 0047).
const stylesOf = (html: string): Promise<string> =>
  Promise.all(
    [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((_) =>
      get(_[1]!).then((response) => response.text())
    )
  ).then((_) => _.join('\n'));

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
    expect(html).not.toContain('<style');
    expect(await stylesOf(html)).toContain('.counter.svelte-');
  });

  it('гидрация стилей не вставляет: модуль без CSS, класс области тот же, что в HTML', async () => {
    const html = await (await get('/kontakty')).text();
    const scope = /<button class="counter (svelte-[a-z0-9]+)">/.exec(html)![1]!;
    const code = await (await get(islandOf(html)![1]!)).text();
    expect(code).toContain(scope);
    expect(code).not.toContain('append_styles');
    expect(code).not.toContain('color: red');
  });

  it('остров с css="injected": стиль остаётся в странице, браузер второй раз его не вставит', async () => {
    app.design.components.save(
      'Counter',
      `<svelte:options css="injected" />${COUNTER}`
    );
    const html = await (await get('/kontakty')).text();
    const scope = /<button class="counter (svelte-[a-z0-9]+)">/.exec(html)![1]!;
    expect(html).toContain(`<style id="${scope}">`);
    // В браузере Svelte вставляет стиль, только если `#${scope}` в head ещё нет.
    const code = await (await get(islandOf(html)![1]!)).text();
    expect(code).toContain('append_styles');
    expect(code).toContain(`'${scope}'`);
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

// Цена партнёра: регион читает cookie на каждом запросе и отдаёт её острову, который считает в браузере.
const _PARTNER_PRICE = `<script>
import { request } from '$core';
import Island from '$core/Island';
let { base = 100 } = $props();
const code = request()?.cookie('partner') ?? '';
const extra = JSON.parse(request()?.cookie('cart') || '{}');
const price = code === 'kuechenly' ? base * 0.9 : base;
</script>
<div class="partner"><Island name="Price" props={{ price, code, ...extra }} /></div>`;

const _PRICE =
  '<script>let { price = 0, code = \'\' } = $props(); let qty = $state(1);</script><p class="price">{price * qty} {code}</p><button onclick={() => qty++}>+</button><style>.price { font-weight: 700; }</style>';

describe('остров в некэшируемом регионе', () => {
  beforeEach(() => {
    app.design.components.save('Price', _PRICE);
    app.design.components.save('PartnerPrice', _PARTNER_PRICE);
    app.design.templates.save(
      'Base',
      '<script>import Uncached from \'$core/Uncached\'; let { page } = $props();</script><h1>{page.title}</h1><Uncached name="PartnerPrice" props={{ base: 100 }} />'
    );
  });

  const visit = (cookie = '') =>
    app.fetch(
      new Request('http://localhost/kontakty', {
        headers: cookie ? { cookie } : {},
      })
    );

  const fragment = /<div class="partner">[\s\S]*?<\/div>/;

  it('props острова считаются на запросе: cookie меняет только фрагмент региона', async () => {
    const partner = await visit('partner=kuechenly');
    const guest = await visit('partner=other');
    expect(partner.headers.get('x-cache')).toBe('miss');
    expect(guest.headers.get('x-cache')).toBe('hit');
    const first = await partner.text();
    const second = await guest.text();
    expect(islandOf(first)![2]).toBe(
      '{&quot;price&quot;:90,&quot;code&quot;:&quot;kuechenly&quot;}'
    );
    expect(islandOf(second)![2]).toBe(
      '{&quot;price&quot;:100,&quot;code&quot;:&quot;other&quot;}'
    );
    expect(first).toMatch(
      /<p class="price svelte-[a-z0-9]+">90 kuechenly<\/p>/
    );
    expect(second).not.toContain('kuechenly');
    expect(first.replace(fragment, '')).toBe(second.replace(fragment, ''));
  });

  it('страница с регионом из кэша сжимается на каждый запрос заново: ответы разные, каждый читается', async () => {
    const compressed = (cookie: string) =>
      app.fetch(
        new Request('http://localhost/kontakty', {
          headers: { cookie, 'accept-encoding': 'br' },
        })
      );
    await compressed('partner=warmup');
    const answers = await Promise.all(
      ['partner=kuechenly', 'partner=other', 'partner=kuechenly'].map(
        compressed
      )
    );
    for (const _ of answers) {
      expect(_.headers.get('x-cache')).toBe('hit');
      expect(_.headers.get('content-encoding')).toBe('br');
    }
    const bodies = await Promise.all(
      answers.map((_) =>
        _.arrayBuffer().then((bytes) =>
          brotliDecompressSync(new Uint8Array(bytes)).toString()
        )
      )
    );
    expect(bodies[0]).toContain('90 kuechenly');
    expect(bodies[1]).not.toContain('kuechenly');
    expect(bodies[2]).toContain('90 kuechenly');
    expect(answers[0]!.headers.get('etag')).toBe(
      answers[2]!.headers.get('etag')
    );
    expect(answers[0]!.headers.get('etag')).not.toBe(
      answers[1]!.headers.get('etag')
    );
  });

  it('в кэш попадает только место региона: страница из кэша без props прошлого запроса', async () => {
    await visit('partner=kuechenly');
    const cached = await visit();
    expect(cached.headers.get('x-cache')).toBe('hit');
    const html = await cached.text();
    expect(html).not.toContain('kuechenly');
    expect(html).not.toContain('<!--cms:region:');
    expect(islandOf(html)![2]).toBe(
      '{&quot;price&quot;:100,&quot;code&quot;:&quot;&quot;}'
    );
  });

  it('остров гидрируется как обычный: маркеры, стили, модуль и один загрузчик', async () => {
    const html = await (await visit('partner=kuechenly')).text();
    const island = islandOf(html)!;
    expect(island[1]).toMatch(/^\/_cms\/islands\/Price\.[a-z0-9]+\.js$/);
    expect(html).toMatch(
      /<cms-island [^>]+><!--\[-->\s*<p class="price svelte-[a-z0-9]+">/
    );
    expect(await stylesOf(html)).toContain('.price.svelte-');
    expect(html.match(/<script type="module">/g)?.length).toBe(1);
    expect((await get(island[1]!)).status).toBe(200);
  });

  it('острова страницы и региона делят один загрузчик', async () => {
    app.design.templates.save(
      'Base',
      '<script>import Island from \'$core/Island\'; import Uncached from \'$core/Uncached\'; let { page } = $props();</script><h1>{page.title}</h1><Island name="Counter" props={{ start: 2 }} /><Uncached name="PartnerPrice" />'
    );
    const html = await (await visit('partner=kuechenly')).text();
    expect(html.match(/<cms-island /g)?.length).toBe(2);
    expect(html.match(/<script type="module">/g)?.length).toBe(1);
  });

  it('значение из cookie не вырывается из атрибута, __proto__ до острова не доходит', async () => {
    const html = await (
      await visit(
        `partner=${encodeURIComponent('</script><script>alert(1)</script>')}; cart=${encodeURIComponent('{"__proto__":{"polluted":true},"items":2}')}`
      )
    ).text();
    expect(html).not.toContain('<script>alert(1)');
    const props = islandOf(html)![2]!;
    expect(props).toContain('&lt;/script>&lt;script>alert(1)&lt;/script>');
    expect(props).toContain('&quot;items&quot;:2');
    expect(props).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('остров в острове запрещён: острову нельзя импортировать $core/Island', async () => {
    app.design.components.save(
      'Wrapper',
      '<script>import Island from \'$core/Island\';</script><div class="wrapper"><Island name="Price" /></div>'
    );
    app.design.templates.save(
      'Base',
      '<script>import Island from \'$core/Island\'; let { page } = $props();</script><h1>{page.title}</h1><Island name="Wrapper" />'
    );
    const html = await (await visit()).text();
    expect(html).toContain('<h1>Контакты</h1>');
    expect(html).not.toContain('<cms-island ');
  });
});
