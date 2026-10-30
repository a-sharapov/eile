import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

// Аудит: один запрос с чужим Host отравлял кэш — canonical и og:url уходили на чужой домен всем.

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (url: string) => app.fetch(new Request(url));

const canonical = (html: string) =>
  /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];

describe('заголовок Host', () => {
  it('без адреса сайта чужой Host не попадает в кэш других посетителей', async () => {
    const evil = await get('https://evil.example/kontakty');
    expect(canonical(await evil.text())).toBe('https://evil.example/kontakty');
    const honest = await get('https://site.test/kontakty');
    expect(canonical(await honest.text())).toBe('https://site.test/kontakty');
    const again = await get('https://site.test/kontakty');
    expect(again.headers.get('x-cache')).toBe('hit');
    expect(canonical(await again.text())).toBe('https://site.test/kontakty');
  });

  it('с адресом сайта Host ни на что не влияет', async () => {
    app.site.settings.update({ siteUrl: 'https://example.com/' });
    expect(
      canonical(await (await get('https://evil.example/kontakty')).text())
    ).toBe('https://example.com/kontakty');
    expect(
      await (await get('https://evil.example/sitemap.xml')).text()
    ).not.toContain('evil.example');
    expect(
      await (await get('https://evil.example/robots.txt')).text()
    ).toContain('Sitemap: https://example.com/sitemap.xml');
  });
});
