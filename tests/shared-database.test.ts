import { afterAll, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { WELCOME } from '../src/scaffolds/index.ts';
import { DEMO } from './fixtures/demo.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-shared-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const html = (response: Response): Promise<string> => response.text();

it('сервер видит то, что записал в базу другой процесс: страницы и элементы', async () => {
  const path = join(dir, 'site.db');
  const server = createApp({ databasePath: path, scaffold: DEMO });
  const cli = createApp({ databasePath: path });
  try {
    const home = server.site.settings.get().homePageId!;
    expect(
      await server.fetch(new Request('http://localhost/')).then(html)
    ).not.toContain('Снаружи');
    cli.content.pages.edit(home, { title: 'Снаружи' });
    const layout = cli.design.elements.get('template', 'Base')!.source;
    cli.design.templates.save(
      'Base',
      layout.replace('<main', '<main data-outside')
    );

    const page = await server
      .fetch(new Request('http://localhost/'))
      .then(html);
    expect(page).toContain('Снаружи');
    expect(page).toContain('data-outside');
    // Своя запись — не повод собирать контексты заново: кэш страницы цел.
    server.content.pages.edit(home, { description: 'Своё' });
    expect(
      (await server.fetch(new Request('http://localhost/'))).headers.get(
        'x-cache'
      )
    ).toBe('miss');
    expect(
      (await server.fetch(new Request('http://localhost/'))).headers.get(
        'x-cache'
      )
    ).toBe('hit');
  } finally {
    cli.close();
    server.close();
  }
});

it('пока нет пользователей, ссылка настройки из журнала сервера переживает чужую запись', () => {
  const path = join(dir, 'fresh.db');
  const server = createApp({ databasePath: path, scaffold: WELCOME });
  const cli = createApp({ databasePath: path });
  try {
    const token = server.identity.setup.token();
    expect(token).not.toBeNull();
    cli.site.settings.update({ name: 'Новый сайт' });
    server.follow();
    expect(server.site.settings.get().name).toBe('Новый сайт');
    expect(server.identity.setup.token()).toBe(token);
  } finally {
    cli.close();
    server.close();
  }
});
