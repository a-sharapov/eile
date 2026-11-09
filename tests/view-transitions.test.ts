import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string) =>
  app.fetch(new Request(`https://site.test${path}`));

const RULE = '@view-transition{navigation:auto}';

const rules = (html: string): number =>
  html.split('@view-transition').length - 1;

describe('плавные переходы между страницами', () => {
  it('по умолчанию выключены: в странице правила нет', async () => {
    expect(app.site.settings.get().viewTransitions).toBe(false);
    expect(await (await get('/kontakty')).text()).not.toContain(
      '@view-transition'
    );
  });

  it('включены — правило в head каждой HTML-страницы ровно один раз, с оглядкой на «уменьшить движение»', async () => {
    app.site.settings.update({ viewTransitions: true });
    const html = await (await get('/kontakty')).text();
    expect(rules(html)).toBe(1);
    expect(html).toContain(
      `<style>@media (prefers-reduced-motion: no-preference){${RULE}}</style>`
    );
    expect(html.indexOf(RULE)).toBeLessThan(html.indexOf('</head>'));
    expect(rules(await (await get('/')).text())).toBe(1);
    // Страница 404 сайта рисуется шаблоном — она тоже часть сайта.
    const missing = await get('/net-takoy-stranitsy');
    expect(missing.status).toBe(404);
    expect(rules(await missing.text())).toBe(1);
  });

  it('страница-файл и ответ без шаблона правила не получают', async () => {
    app.site.settings.update({ viewTransitions: true });
    app.content.pages.create({
      title: 'feed.xml',
      alias: 'feed.xml',
      template: 'Base',
      contentType: 'application/rss+xml',
      content: '<?xml version="1.0"?>\n<rss></rss>',
      publish: true,
    });
    expect(await (await get('/feed.xml')).text()).not.toContain(
      '@view-transition'
    );
    expect(await (await get('/robots.txt')).text()).not.toContain(
      '@view-transition'
    );
  });

  it('своё правило шаблона важнее: второго не добавляется', async () => {
    app.design.templates.save(
      'Own',
      `<script>let { page } = $props();</script>
<svelte:head><style>@view-transition { navigation: auto; }</style></svelte:head>
<h1>{page.title}</h1>`
    );
    app.content.pages.create({
      title: 'Своя',
      alias: 'svoya',
      template: 'Own',
      publish: true,
    });
    app.site.settings.update({ viewTransitions: true });
    const html = await (await get('/svoya')).text();
    expect(rules(html)).toBe(1);
    expect(html).not.toContain(RULE);
  });

  it('смена настройки сбрасывает кэш страниц', async () => {
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('miss');
    expect((await get('/kontakty')).headers.get('x-cache')).toBe('hit');
    app.site.settings.update({ viewTransitions: true });
    const on = await get('/kontakty');
    expect(on.headers.get('x-cache')).toBe('miss');
    expect(await on.text()).toContain(RULE);
    app.site.settings.update({ viewTransitions: false });
    const off = await get('/kontakty');
    expect(off.headers.get('x-cache')).toBe('miss');
    expect(await off.text()).not.toContain('@view-transition');
  });

  it('не да и не нет — отказ', () => {
    expect(() =>
      app.site.settings.update({
        viewTransitions: 'yes' as unknown as boolean,
      })
    ).toThrow(
      expect.objectContaining({ code: 'site.invalid_view_transitions' })
    );
  });
});
