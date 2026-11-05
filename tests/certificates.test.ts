import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { X509Certificate } from 'node:crypto';
import { createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { serveSecure, withHsts } from '../src/cli/https.ts';
import { motd } from '../src/cli/motd.ts';
import { definePaint } from '../src/cli/paint.ts';
import {
  type Certificate,
  defineHttpListener,
  defineHttpsListener,
} from '../src/contexts/certificates/index.ts';
import {
  certificateRequest,
  integer,
  oid,
  tlv,
} from '../src/contexts/certificates/infrastructure/der.ts';
import { HEALTH_PATH } from '../src/health.ts';
import { type MockAcme, readRequest, startMockAcme } from './fixtures/acme.ts';
import { DEMO } from './fixtures/demo.ts';

const _P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const _DOMAINS = ['example.test', 'www.example.test'];
const _HTTPS_PORT = 8443;

describe('DER и запрос сертификата', () => {
  it('целые без лишних нулей и с нулём перед старшим битом, длинная длина, OID', () => {
    expect([...integer(new Uint8Array([0, 0, 5]))]).toEqual([2, 1, 5]);
    expect([...integer(new Uint8Array([0x80]))]).toEqual([2, 2, 0, 0x80]);
    expect([...integer(new Uint8Array([0, 0]))]).toEqual([2, 1, 0]);
    expect([...tlv(4, new Uint8Array(300)).subarray(0, 4)]).toEqual([
      4, 0x82, 1, 44,
    ]);
    expect([...oid('1.2.840.10045.4.3.2')]).toEqual([
      6, 8, 0x2a, 0x86, 0x48, 0xce, 0x3d, 4, 3, 2,
    ]);
  });

  it('CSR: все имена — в subjectAltName, подпись ключа сертификата сходится', async () => {
    const keys = await crypto.subtle.generateKey(_P256, true, [
      'sign',
      'verify',
    ]);
    const request = readRequest(await certificateRequest(_DOMAINS, keys));
    expect(request.names).toEqual(_DOMAINS);
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.publicKey,
        request.signature as Uint8Array<ArrayBuffer>,
        request.info as Uint8Array<ArrayBuffer>
      )
    ).toBe(true);
  });
});

// HTTP-слушатель на случайном порту, центр сертификации ходит к нему за ключом HTTP-01.
const _stand = (
  options: { badNonceOnce?: string[]; days?: number; broken?: boolean } = {},
  clock?: () => Date
) => {
  let handle: (request: Request) => Promise<Response> = () =>
    Promise.resolve(new Response('', { status: 503 }));
  const http = Bun.serve({
    port: 0,
    development: false,
    fetch: (request) => handle(request),
  });
  return startMockAcme({
    // Сломанный стенд ходит не туда: проверка домена не пройдёт.
    resolve: () =>
      options.broken ? 'http://127.0.0.1:9' : `http://127.0.0.1:${http.port}`,
    badNonceOnce: options.badNonceOnce ?? [],
    days: options.days ?? 90,
  }).then((acme) => {
    const app = createApp({
      scaffold: DEMO,
      ...(clock ? { clock } : {}),
      https: {
        domains: _DOMAINS,
        email: 'admin@example.test',
        directory: acme.directory,
        pollMs: 10,
      },
    });
    handle = defineHttpListener({
      domains: _DOMAINS,
      httpsPort: _HTTPS_PORT,
      challenge: app.certificates.challenge,
      secured: () => app.certificates.current() !== null,
      site: app.fetch,
    });
    return {
      app,
      acme,
      http,
      stop: () => (app.close(), acme.stop(), http.stop(true)),
    };
  });
};

// Свободный порт для HTTPS: адрес переадресации строится из номера, поэтому 0 не годится.
const _freePort = (): number =>
  ((server) => ((port) => (server.stop(true), port))(server.port!))(
    Bun.serve({ port: 0, fetch: () => new Response('') })
  );

const _get = (port: number, path: string, host = 'example.test') =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { host },
    redirect: 'manual',
  });

it('ответы по HTTPS — с HSTS, неизменяемый ответ не роняет запрос', async () => {
  const fetch = withHsts(((request: Request) =>
    Promise.resolve(
      new URL(request.url).pathname === '/redirect'
        ? Response.redirect('https://site.test/', 301)
        : new Response('ok')
    )) as never);
  const page = await fetch(new Request('https://site.test/') as never);
  expect(page.headers.get('strict-transport-security')).toBe(
    'max-age=31536000'
  );
  expect(
    (await fetch(new Request('https://site.test/redirect') as never)).status
  ).toBe(301);
});

describe('HTTPS без прокси', () => {
  let stand: Awaited<ReturnType<typeof _stand>>;
  beforeAll(async () => {
    stand = await _stand({ badNonceOnce: ['/order'] });
  });
  afterAll(() => stand.stop());

  it('пока сертификата нет, HTTP отдаёт сам сайт', async () => {
    const response = await _get(stand.http.port!, '/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Главная');
  });

  it('выпуск: проверка HTTP-01, повтор на badNonce, сертификат на все домены', async () => {
    expect(await stand.app.certificates.ensure()).toBe('issued');
    expect(stand.acme.badNonces()).toBe(1);
    const certificate = stand.app.certificates.current()!;
    expect(new X509Certificate(certificate.chain).subjectAltName).toBe(
      'DNS:example.test, DNS:www.example.test'
    );
    const status = stand.app.certificates.status()!;
    expect(status.lastError).toBe('');
    expect(Date.parse(status.notAfter!) - Date.now()).toBeGreaterThan(
      89 * 86_400_000
    );
    expect(await stand.app.certificates.ensure()).toBe('unchanged');
  });

  it('после выпуска HTTP ведёт на HTTPS основного домена — и с дополнительного, и с чужого Host', async () => {
    const primary = await _get(stand.http.port!, '/blog?x=1');
    expect(primary.status).toBe(308);
    expect(primary.headers.get('location')).toBe(
      `https://example.test:${_HTTPS_PORT}/blog?x=1`
    );
    const secondary = await _get(
      stand.http.port!,
      '/blog?x=1',
      'www.example.test'
    );
    expect(secondary.status).toBe(308);
    expect(secondary.headers.get('location')).toBe(
      `https://example.test:${_HTTPS_PORT}/blog?x=1`
    );
    const foreign = await _get(stand.http.port!, '/', 'evil.test');
    expect(foreign.headers.get('location')).toBe(
      `https://example.test:${_HTTPS_PORT}/`
    );
    const unknown = await _get(
      stand.http.port!,
      '/.well-known/acme-challenge/nope'
    );
    expect(unknown.status).toBe(404);
  });

  it('по HTTPS цепочка проверяется корнем центра, вход ставит cookie с __Host- и Secure', async () => {
    const { chain, key } = stand.app.certificates.current() as Certificate;
    const https = Bun.serve({
      port: 0,
      development: false,
      tls: { cert: chain, key },
      fetch: stand.app.fetch,
    });
    const response = await fetch(
      `https://127.0.0.1:${https.port}/manager/api/setup`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: stand.app.identity.setup.token(),
          email: 'admin@example.test',
          password: 'correct horse battery',
        }),
        tls: { ca: stand.acme.caPem, serverName: 'example.test' },
      }
    );
    https.stop(true);
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toStartWith('__Host-cms_session=');
    expect(cookie).toContain('Secure');
  });

  it('serveSecure: дополнительный домен — на основной по HTTP и HTTPS, с HSTS; здоровье и петля — сайт', async () => {
    const httpsPort = _freePort();
    const secure = serveSecure({
      app: stand.app,
      domains: _DOMAINS,
      port: 0,
      httpsPort,
      base: {
        hostname: '127.0.0.1',
        maxRequestBodySize: 1024 * 1024,
        development: false,
        error: () => new Response('', { status: 500 }),
      },
      issued: () => undefined,
      failed: () => undefined,
    });
    const secured = (path: string, host: string, init: RequestInit = {}) =>
      fetch(`https://127.0.0.1:${httpsPort}${path}`, {
        ...init,
        headers: { host },
        redirect: 'manual',
        tls: { ca: stand.acme.caPem, serverName: 'example.test' },
      });
    const plain = await _get(
      secure.http.port!,
      '/blog?x=1',
      'www.example.test'
    );
    expect(plain.status).toBe(308);
    expect(plain.headers.get('location')).toBe(
      `https://example.test:${httpsPort}/blog?x=1`
    );
    const moved = await secured('/blog?x=1', 'www.example.test', {
      method: 'POST',
      body: 'a=1',
    });
    expect(moved.status).toBe(308);
    expect(moved.headers.get('location')).toBe(
      `https://example.test:${httpsPort}/blog?x=1`
    );
    expect(moved.headers.get('strict-transport-security')).toBe(
      'max-age=31536000'
    );
    const page = await secured('/', 'example.test');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Главная');
    expect(page.headers.get('strict-transport-security')).toBe(
      'max-age=31536000'
    );
    const health = await secured(HEALTH_PATH, 'www.example.test');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    expect(
      (await _get(secure.http.port!, HEALTH_PATH, 'www.example.test')).status
    ).toBe(200);
    expect((await secured('/', `127.0.0.1:${httpsPort}`)).status).toBe(200);
    secure.stop();
  });

  it('сертификат и ключ — сервера: в копию сайта не попадают', () => {
    const tables = Object.keys(stand.app.archive().tables);
    expect(tables.some((_) => _.startsWith('certificates_'))).toBe(false);
    expect(tables).toContain('content_pages');
  });

  it('менеджер видит состояние сертификата', async () => {
    const setup = await stand.app.fetch(
      new Request('http://localhost/manager/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.test',
          password: 'correct horse battery',
        }),
      })
    );
    const cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
    const status = await stand.app
      .fetch(
        new Request('http://localhost/manager/api/https', {
          headers: { cookie },
        })
      )
      .then((_) => _.json());
    expect(status).toMatchObject({
      domains: _DOMAINS,
      lastError: '',
      staging: true,
    });
  });
});

describe('основной домен', () => {
  const site = (request: Request) =>
    Promise.resolve(
      ((url) => new Response(`${request.method} ${url.host}${url.pathname}`))(
        new URL(request.url)
      )
    );
  const overHttp = (secured = true, httpsPort = _HTTPS_PORT) =>
    defineHttpListener({
      domains: _DOMAINS,
      httpsPort,
      challenge: (token) => (token === 'token' ? 'token.key' : null),
      secured: () => secured,
      site,
      direct: [HEALTH_PATH],
    });
  const overHttps = (httpsPort = _HTTPS_PORT) =>
    defineHttpsListener({
      domains: _DOMAINS,
      httpsPort,
      site,
      direct: [HEALTH_PATH],
    });

  it('HTTP: с дополнительного домена — сразу на HTTPS основного, одним шагом', async () => {
    const moved = await overHttp()(
      new Request('http://www.example.test/blog?x=1')
    );
    expect(moved.status).toBe(308);
    const location = moved.headers.get('location')!;
    expect(location).toBe(`https://example.test:${_HTTPS_PORT}/blog?x=1`);
    const landed = await overHttps()(new Request(location));
    expect(landed.status).toBe(200);
    expect(await landed.text()).toBe(`GET example.test:${_HTTPS_PORT}/blog`);
  });

  it('HTTP: проверка HTTP-01 и здоровье на дополнительном домене — как раньше', async () => {
    const challenge = await overHttp()(
      new Request('http://www.example.test/.well-known/acme-challenge/token')
    );
    expect(challenge.status).toBe(200);
    expect(await challenge.text()).toBe('token.key');
    const health = await overHttp()(
      new Request(`http://www.example.test${HEALTH_PATH}`)
    );
    expect(health.status).toBe(200);
    expect(await health.text()).toBe(`GET www.example.test${HEALTH_PATH}`);
  });

  it('HTTP без сертификата: дополнительный домен открывает сайт как есть', async () => {
    const response = await overHttp(false)(
      new Request('http://www.example.test/blog')
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('GET www.example.test/blog');
  });

  it('HTTPS: дополнительный домен — на тот же путь и query основного, 308 на сутки', async () => {
    const moved = await overHttps()(
      new Request(`https://www.example.test:${_HTTPS_PORT}/form?x=1&y=2`, {
        method: 'POST',
        body: 'name=a',
      })
    );
    expect(moved.status).toBe(308);
    expect(moved.headers.get('location')).toBe(
      `https://example.test:${_HTTPS_PORT}/form?x=1&y=2`
    );
    expect(moved.headers.get('cache-control')).toBe('max-age=86400');
    expect(
      (
        await overHttps()(new Request('https://www.example.test./'))
      ).headers.get('location')
    ).toBe(`https://example.test:${_HTTPS_PORT}/`);
  });

  it('HTTPS: чужой домен — 308 на основной; основной, петля и localhost — сайт как есть', async () => {
    const foreign = await overHttps()(
      new Request(`https://evil.test:${_HTTPS_PORT}/blog?x=1`)
    );
    expect(foreign.status).toBe(308);
    expect(foreign.headers.get('location')).toBe(
      `https://example.test:${_HTTPS_PORT}/blog?x=1`
    );
    expect(foreign.headers.get('cache-control')).toBe('max-age=86400');
    const answers = await Promise.all(
      [
        'https://example.test/blog',
        `https://127.0.0.1:${_HTTPS_PORT}/blog`,
        'https://[::1]/blog',
        'https://localhost/blog',
      ].map((url) =>
        overHttps()(new Request(url)).then((_) =>
          _.text().then((text) => `${_.status} ${text}`)
        )
      )
    );
    expect(answers).toEqual([
      '200 GET example.test/blog',
      `200 GET 127.0.0.1:${_HTTPS_PORT}/blog`,
      '200 GET [::1]/blog',
      '200 GET localhost/blog',
    ]);
  });

  it('HTTPS: проверка здоровья отвечает на дополнительном домене', async () => {
    const health = await overHttps()(
      new Request(`https://www.example.test${HEALTH_PATH}?probe=1`)
    );
    expect(health.status).toBe(200);
    expect(await health.text()).toBe(`GET www.example.test${HEALTH_PATH}`);
  });

  it('порт HTTPS — в адресе переадресации, если он не 443', async () => {
    const location = (response: Promise<Response>) =>
      response.then((_) => _.headers.get('location'));
    expect(
      await location(overHttps(443)(new Request('https://www.example.test/a')))
    ).toBe('https://example.test/a');
    expect(
      await location(
        overHttps(18443)(new Request('https://www.example.test:18443/a'))
      )
    ).toBe('https://example.test:18443/a');
    expect(
      await location(
        overHttp(true, 443)(new Request('http://www.example.test/a'))
      )
    ).toBe('https://example.test/a');
    expect(
      await location(
        overHttp(true, 18443)(new Request('http://www.example.test:8080/a'))
      )
    ).toBe('https://example.test:18443/a');
  });
});

describe('продление и сбои', () => {
  it('сертификат на 20 дней продлевается сразу, start сообщает о новом', async () => {
    const stand = await _stand({ days: 20 });
    expect(await stand.app.certificates.ensure()).toBe('issued');
    const first = stand.app.certificates.current()!;
    const renewed = await new Promise<Certificate>((resolve) => {
      const stop = stand.app.certificates.start((_) => (stop(), resolve(_)));
    });
    expect(renewed.chain).not.toBe(first.chain);
    stand.stop();
  });

  it('проверка домена не прошла — сбой в журнале, ошибка в состоянии, повтор не раньше чем через час', async () => {
    let now = new Date('2026-11-01T12:00:00Z');
    const stand = await _stand({ broken: true }, () => now);
    expect(await stand.app.certificates.ensure()).toBe('failed');
    const status = stand.app.certificates.status()!;
    expect(status.lastError).toContain('example.test');
    expect(stand.app.certificates.current()).toBeNull();
    const incident = stand.app.notify.incidents
      .list()
      .find((_) => _.kind === 'certificates.failed');
    expect(incident).toMatchObject({ severity: 'critical' });
    expect(await stand.app.certificates.ensure()).toBe('unchanged');
    now = new Date('2026-11-01T13:00:00Z');
    expect(await stand.app.certificates.ensure()).toBe('failed');
    stand.stop();
  });

  it('без --domain HTTPS не забота сервера', async () => {
    const app = createApp({ scaffold: DEMO });
    expect(app.certificates.status()).toBeNull();
    expect(await app.certificates.ensure()).toBe('unchanged');
    app.close();
  });
});

describe('запуск с --domain', () => {
  const options = (argv: string[], env: Record<string, string> = {}) =>
    ((_) => ('options' in _ ? _.options : null))(parseInvocation(argv, env));

  it('с доменом HTTP по умолчанию — на 80, HTTPS — на 443; флаги сильнее окружения', () => {
    expect(options(['--domain', 'example.com'])).toMatchObject({
      domain: 'example.com',
      port: '80',
    });
    expect(options([])).toMatchObject({ port: '8080' });
    expect(options([])!.domain).toBeUndefined();
    expect(
      options(['--port', '8141', '--https-port', '18443'], {
        CMS_DOMAIN: 'example.com',
        CMS_ACME_EMAIL: 'a@example.com',
      })
    ).toMatchObject({
      domain: 'example.com',
      email: 'a@example.com',
      port: '8141',
      httpsPort: '18443',
    });
    expect(options(['--acme-staging'])).toMatchObject({ acmeStaging: true });
  });

  it('приветствие говорит, есть ли сертификат', () => {
    const summary = {
      version: '0.0.1',
      url: 'https://example.com/',
      db: 'site.db',
      fresh: false,
      pages: 3,
      published: 3,
      trashed: 0,
      setupUrl: null,
    };
    const plain = definePaint(false);
    expect(
      motd(
        plain,
        {
          ...summary,
          https: { notAfter: '2027-01-30T00:00:00.000Z', staging: false },
        },
        'ru'
      )
    ).toContain('HTTPS      сертификат до 2027-01-30');
    expect(
      motd(
        plain,
        { ...summary, https: { notAfter: null, staging: true } },
        'ru'
      )
    ).toContain('выпускается сертификат — пока сайт по HTTP · тестовый центр');
  });
});
