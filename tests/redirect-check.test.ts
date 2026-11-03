import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, explain, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { type Network, runRedirects } from '../src/cli/redirects.ts';
import { readUrlSource } from '../src/contexts/diagnostics/index.ts';
import { isDomainError } from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-redirect-check-'));
const db = join(dir, 'site.db');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

beforeAll(() => {
  const app = createApp({ databasePath: db, scaffold: DEMO });
  app.redirects.rules.create({ from: '/old-page', to: '/kontakty' });
  app.redirects.rules.create({ from: '/temp', to: '/kontakty', status: 302 });
  app.redirects.rules.create({ from: '/ext', to: 'https://other.example/x' });
  app.close();
});

const file = (name: string, text: string | Uint8Array): string =>
  ((path) => (writeFileSync(path, text), path))(join(dir, name));

const LIST = file(
  'old.txt',
  [
    '# адреса старого сайта',
    'https://old.example/old-page/   # из меню',
    '/old-page/?utm_source=mail',
    '/kontakty',
    '/temp',
    '/ext',
    '/nope/',
    '/?p=12',
    '',
  ].join('\n')
);

type Ran = { readonly out: string; readonly error: string | null };

const run = (
  argv: readonly string[],
  net?: Network,
  language: 'ru' | 'en' = 'ru',
  tty = false
): Promise<Ran> => {
  const out: string[] = [];
  const parsed = parseInvocation(['diagnose', ...argv], {});
  const ctx: Context = {
    args: 'options' in parsed ? parsed.args : [],
    options: 'options' in parsed ? parsed.options : (undefined as never),
    paint: definePaint(false),
    language,
    tty,
    out: (_) => void out.push(_),
  };
  return (net ? runRedirects(ctx, net) : RUN.diagnose!(ctx)).then(
    () => ({ out: out.join('\n'), error: null }),
    (error) => ({ out: out.join('\n'), error: explain(error, language) })
  );
};

const lineOf = (text: string, start: string): string =>
  text.split('\n').find((_) => _.startsWith(start)) ?? '';

describe('cms diagnose redirects на базе', () => {
  it('таблица: переход, слэш и query видны; ошибки — с причиной; код выхода 1', async () => {
    const { out, error } = await run(['redirects', LIST, '--db', db]);
    expect(lineOf(out, '✓ /old-page/ ')).toContain('301 → /kontakty · 200');
    expect(lineOf(out, '✓ /old-page/?utm_source=mail')).toContain(
      '301 → /kontakty?utm_source=mail · 200'
    );
    expect(lineOf(out, '✓ /kontakty')).toContain('200');
    expect(lineOf(out, '! /temp')).toContain('302 — временная');
    expect(lineOf(out, '✗ /ext')).toContain(
      'уводит на другой хост: other.example'
    );
    expect(lineOf(out, '✗ /nope/')).toContain('301 → /nope · 404');
    expect(lineOf(out, '✗ /?p=12')).toContain('query она не видит');
    expect(out).toContain('Адресов 7 на http://localhost');
    expect(out).toContain('в порядке 3: переадресация 2 · отвечает сам 1');
    expect(out).toContain('слэш убран 3');
    expect(out).toContain('query сохранён 2');
    expect(error).toBe('Адресов с ошибками: 4');
  });

  it('второе слово строки — куда ждём: не туда — ошибка', async () => {
    const list = file('expected.txt', '/old-page/ /blog\n/temp /kontakty\n');
    const { out } = await run(['redirects', list, '--db', db, '--json']);
    const report = JSON.parse(out);
    expect(report.results.map((_: { outcome: string }) => _.outcome)).toEqual([
      'wrong_target',
      'temporary',
    ]);
    expect(report.results[0].expected).toBe('/blog');
  });

  it('проверка идёт на снимке: счётчики переходов живой базы не меняются, временных файлов не остаётся', async () => {
    const before = readdirSync(tmpdir()).filter((_) =>
      _.startsWith('cms-redirects-')
    ).length;
    await run(['redirects', LIST, '--db', db]);
    const app = createApp({ databasePath: db });
    expect(app.redirects.rules.list().map((_) => _.hits)).toEqual([0, 0, 0]);
    app.close();
    expect(
      readdirSync(tmpdir()).filter((_) => _.startsWith('cms-redirects-')).length
    ).toBe(before);
  });

  it('JSON — для скриптов: адрес, цепочка, итог, судьба слэша и query', async () => {
    const { out, error } = await run(['redirects', LIST, '--db', db, '--json']);
    const report = JSON.parse(out);
    expect(report.summary).toMatchObject({ total: 7, ok: 3, failed: 4 });
    expect(report.results[1]).toMatchObject({
      input: '/old-page/?utm_source=mail',
      outcome: 'moved',
      query: 'kept',
      slash: 'removed',
      hops: [
        {
          url: 'http://localhost/old-page/?utm_source=mail',
          status: 301,
          location: 'http://localhost/kontakty?utm_source=mail',
        },
        { status: 200, location: null },
      ],
    });
    expect(error).not.toBeNull();
  });

  it('по-английски — те же строки', async () => {
    const { out, error } = await run(
      ['redirects', LIST, '--db', db],
      undefined,
      'en'
    );
    expect(out).toContain('7 addresses on http://localhost');
    expect(out).toContain('leaves for another host');
    expect(out).not.toMatch(/[А-Яа-яЁё]/);
    expect(error).toBe('Addresses with problems: 4');
  });

  it('всё в порядке — код выхода 0', async () => {
    const list = file('fine.txt', '/old-page/\n/kontakty\n');
    expect((await run(['redirects', list, '--db', db])).error).toBeNull();
  });
});

describe('cms diagnose redirects: откуда список', () => {
  const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://old.example/old-page/</loc><lastmod>2024-01-01</lastmod></url>
  <url><loc>https://old.example/kontakty</loc></url>
</urlset>`;

  // Индекс sitemap старого сайта и его файлы — по «сети», которую подставляет тест.
  const oldSite: Network = (url) =>
    Promise.resolve(
      url === 'https://old.example/sitemap_index.xml'
        ? new Response(`<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://old.example/page-sitemap.xml</loc></sitemap>
  <sitemap><loc>https://old.example/post-sitemap.xml.gz</loc></sitemap>
</sitemapindex>`)
        : url === 'https://old.example/page-sitemap.xml'
          ? new Response(SITEMAP)
          : url === 'https://old.example/post-sitemap.xml.gz'
            ? new Response(Bun.gzipSync(new TextEncoder().encode('/nope\n')))
            : new Response('Not Found', { status: 404 })
    );

  it('sitemap.xml файлом', async () => {
    const { out } = await run([
      'redirects',
      file('sitemap.xml', SITEMAP),
      '--db',
      db,
    ]);
    expect(out).toContain('Адресов 2');
    expect(out).toContain('✓ /old-page/');
  });

  it('индекс sitemap по адресу: его файлы скачиваются, .gz распаковывается', async () => {
    const { out, error } = await run(
      ['redirects', 'https://old.example/sitemap_index.xml', '--db', db],
      oldSite
    );
    expect(out).toContain('Адресов 3');
    expect(lineOf(out, '✗ /nope')).toContain('404');
    expect(error).toBe('Адресов с ошибками: 1');
  });

  it('список .gz файлом; не скачался — понятная ошибка', async () => {
    const gz = file(
      'list.txt.gz',
      Bun.gzipSync(new TextEncoder().encode('/kontakty\n'))
    );
    expect((await run(['redirects', gz, '--db', db])).out).toContain(
      '✓ /kontakty'
    );
    expect(
      (await run(['redirects', 'https://old.example/gone.xml'], oldSite)).error
    ).toBe('https://old.example/gone.xml не скачался: ответ 404');
  });

  it('XML, но не sitemap; пустой список; без списка в терминале; нет файла', async () => {
    expect(
      (await run(['redirects', file('feed.xml', '<rss><channel/></rss>')]))
        .error
    ).toContain('не sitemap');
    expect(
      (await run(['redirects', file('empty.txt', '# ничего\n'), '--db', db]))
        .error
    ).toBe('В списке нет ни одного адреса.');
    expect(
      (await run(['redirects', '--db', db], undefined, 'ru', true)).error
    ).toContain('stdin');
    expect(
      (await run(['redirects', join(dir, 'missing.txt'), '--db', db])).error
    ).toBe(`Нет файла ${join(dir, 'missing.txt')}.`);
  });

  it('разбор sitemap без сети: индекс глубже двух уровней — отказ', async () => {
    const index = new TextEncoder().encode(
      '<sitemapindex><sitemap><loc>https://a.example/i.xml</loc></sitemap></sitemapindex>'
    );
    const code = await readUrlSource(index, () => Promise.resolve(index)).then(
      () => 'resolved',
      (error) => (isDomainError(error) ? error.code : String(error))
    );
    expect(code).toBe('diagnostics.sitemap_depth');
  });
});

describe('cms diagnose redirects --base: живой сайт', () => {
  // «Живой сайт» за подставленной сетью: цепочка, петля и молчание — то, чего Eile сама не отдаёт.
  const live: Network = (url) =>
    ((path) =>
      path === '/a/'
        ? Promise.resolve(
            new Response(null, { status: 301, headers: { location: '/a' } })
          )
        : path === '/a'
          ? Promise.resolve(
              new Response(null, {
                status: 301,
                headers: { location: 'https://new.example/b' },
              })
            )
          : path === '/b'
            ? Promise.resolve(new Response('ok'))
            : path === '/loop'
              ? Promise.resolve(
                  new Response(null, {
                    status: 308,
                    headers: { location: '/loop/' },
                  })
                )
              : path === '/loop/'
                ? Promise.resolve(
                    new Response(null, {
                      status: 308,
                      headers: { location: '/loop' },
                    })
                  )
                : path === '/down'
                  ? Promise.reject(new Error('Unable to connect'))
                  : Promise.resolve(new Response('', { status: 404 })))(
      new URL(url).pathname
    );

  it('цепочка, петля, нет ответа — по сети до --base', async () => {
    const list = file('live.txt', '/a/\n/b\n/loop\n/down\n');
    const { out, error } = await run(
      ['redirects', list, '--base', 'https://new.example/ignored/path'],
      live
    );
    expect(lineOf(out, '! /a/')).toContain(
      '301 → /a · 301 → /b · 200 — переходов 2, а нужен один'
    );
    expect(lineOf(out, '✓ /b')).toContain('200');
    expect(lineOf(out, '✗ /loop')).toContain('петля');
    expect(lineOf(out, '✗ /down')).toContain('нет ответа: Unable to connect');
    expect(out).toContain('на https://new.example (по сети)');
    expect(error).toBe('Адресов с ошибками: 3');
  });

  it('живой Eile за подставленной сетью отвечает так же, как снимок', async () => {
    const app = createApp({ databasePath: db });
    const { out } = await run(
      ['redirects', LIST, '--base', 'https://new.example'],
      (url, init) => app.fetch(new Request(url, init))
    );
    app.close();
    expect(lineOf(out, '✓ /old-page/ ')).toContain('301 → /kontakty · 200');
    expect(out).toContain('в порядке 3');
  });

  it('--base — только адрес http(s)', async () => {
    expect(
      (await run(['redirects', LIST, '--base', 'new.example'], live)).error
    ).toContain('--base — адрес сайта');
  });

  it('у diagnose одна подкоманда — redirects', async () => {
    expect((await run(['links', '--db', db])).error).toContain(
      'Нет подкоманды diagnose links'
    );
  });
});
