import { afterAll, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-server-checks-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ids = (app: ReturnType<typeof createApp>): string[] =>
  app.diagnostics.report(true).findings.map((_) => _.id);

it('диагностика сервера: автокопии выключены, сайт открыт по HTTP', () => {
  const app = createApp({
    databasePath: join(dir, 'site.db'),
    scaffold: DEMO,
    updateCheck: false,
  });
  app.site.settings.update({ siteUrl: 'http://example.com' });
  expect(ids(app)).toEqual(
    expect.arrayContaining(['server.backups_off', 'server.no_https'])
  );
  app.upkeep.backups.configure({ enabled: true });
  app.site.settings.update({ siteUrl: 'https://example.com' });
  expect(ids(app)).not.toContain('server.backups_off');
  expect(ids(app)).not.toContain('server.no_https');
  app.close();
});

it('база в памяти и локальный адрес — без находок сервера', () => {
  const app = createApp({ scaffold: DEMO, updateCheck: false });
  app.site.settings.update({ siteUrl: 'http://localhost:8080' });
  expect(ids(app).filter((_) => _.startsWith('server.'))).toEqual([]);
  app.close();
});
