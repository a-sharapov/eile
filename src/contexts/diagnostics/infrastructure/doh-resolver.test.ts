import { describe, expect, it } from 'bun:test';
import { defineDohResolver, dohAnswer } from './doh-resolver.ts';

describe('DNS поверх HTTPS', () => {
  it('ответ Cloudflare: CNAME в цепочке, TXT в кавычках, RRSIG пропускается', () => {
    expect(
      dohAnswer({
        Status: 0,
        AD: true,
        Answer: [
          {
            name: '_dmarc.muehlenhof.example',
            type: 5,
            TTL: 60,
            data: 'muehlenhof.example.',
          },
          {
            name: 'muehlenhof.example',
            type: 16,
            TTL: 60,
            data: '"v=spf1 a" " mx ~all"',
          },
          {
            name: 'muehlenhof.example',
            type: 46,
            TTL: 60,
            data: 'TXT 13 2 300 …',
          },
        ],
      })
    ).toEqual({
      status: 'ok',
      authenticated: true,
      records: [
        {
          name: '_dmarc.muehlenhof.example',
          type: 'CNAME',
          ttl: 60,
          data: 'muehlenhof.example',
        },
        {
          name: 'muehlenhof.example',
          type: 'TXT',
          ttl: 60,
          data: 'v=spf1 a mx ~all',
        },
      ],
    });
  });

  it('ответ Google: имена с точкой, MX нормализуется; NXDOMAIN и SERVFAIL', () => {
    expect(
      dohAnswer({
        Status: 0,
        Answer: [
          {
            name: 'Muehlenhof.example.',
            type: 15,
            TTL: 60,
            data: '10 Muehlenhof.example.',
          },
        ],
      }).records
    ).toEqual([
      {
        name: 'muehlenhof.example',
        type: 'MX',
        ttl: 60,
        data: '10 muehlenhof.example',
      },
    ]);
    expect(dohAnswer({ Status: 3 }).status).toBe('nxdomain');
    expect(dohAnswer({ Status: 2 })).toMatchObject({
      status: 'failed',
      error: 'rcode 2',
    });
  });

  it('CAA в общем виде RFC 3597 — как обычная запись', () => {
    expect(
      dohAnswer({
        Status: 0,
        Answer: [
          {
            name: 'a.de',
            type: 257,
            TTL: 300,
            data: '\\# 22 00 05 69 73 73 75 65 6c 65 74 73 65 6e 63 72 79 70 74 2e 6f 72 67',
          },
        ],
      }).records[0]!.data
    ).toBe('0 issue "letsencrypt.org"');
  });

  it('провайдер не отвечает — следующий; оба молчат — unreachable', async () => {
    const asked: string[] = [];
    const resolver = defineDohResolver({
      fetch: (url) => (
        asked.push(new URL(url).host),
        url.includes('cloudflare')
          ? Promise.reject(new TypeError('fetch failed'))
          : Promise.resolve(
              Response.json({
                Status: 0,
                Answer: [{ name: 'a.de', type: 1, TTL: 5, data: '192.0.2.1' }],
              })
            )
      ),
    });
    expect((await resolver.query('a.de', 'A')).records[0]!.data).toBe(
      '192.0.2.1'
    );
    await resolver.query('b.de', 'A');
    expect(asked).toEqual(['cloudflare-dns.com', 'dns.google', 'dns.google']);
    expect(resolver.sources()).toEqual(['google']);
    const dead = defineDohResolver({
      fetch: () => Promise.resolve(new Response('', { status: 502 })),
    });
    expect(await dead.query('a.de', 'A')).toMatchObject({
      status: 'failed',
      error: 'unreachable',
    });
  });
});
