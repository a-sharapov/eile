import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;
let admin: string;

const _PASSWORD = 'correct horse battery';

const call = (
  method: string,
  path: string,
  body?: Uint8Array | object,
  cookie = admin
) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined || body instanceof Uint8Array
          ? {}
          : { 'content-type': 'application/json' }),
      },
      body:
        body === undefined || body instanceof Uint8Array
          ? body
          : JSON.stringify(body),
    })
  );

const json = (response: Response) => response.json() as Promise<any>;

const cookieOf = (response: Response): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

const html = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`)).then((_) => _.text());

const contacts = () => app.content.published.byPath('/kontakty')!.id;

const setup = async () => {
  admin = cookieOf(
    await call(
      'POST',
      '/setup',
      {
        token: app.identity.setup.token(),
        email: 'admin@example.com',
        password: _PASSWORD,
      },
      ''
    )
  );
};

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  await setup();
});

afterEach(() => app.close());

const download = (format: 'db' | 'json') =>
  call('GET', `/backup?format=${format}`).then((_) => _.arrayBuffer());

describe('копия сайта', () => {
  it('файл .db возвращает сайт к моменту копии: страницы, шаблоны, кэш', async () => {
    await call('PATCH', `/pages/${contacts()}`, { title: 'Контакты v1' });
    const copy = new Uint8Array(await download('db'));
    expect(new TextDecoder().decode(copy.subarray(0, 15))).toBe(
      'SQLite format 3'
    );
    expect(await html('/kontakty')).toContain('Контакты v1');

    await call('PATCH', `/pages/${contacts()}`, { title: 'Контакты v2' });
    await call('POST', '/pages', { title: 'Лишняя', parentId: null });
    // Шаблон меняется после копии — восстановление вернёт и его, и уже собранные страницы.
    const template = await json(await call('GET', '/elements/template/Base'));
    await call('PUT', '/elements/template/Base', {
      source: `${template.source}\n<footer>после копии</footer>`,
    });
    expect(await html('/kontakty')).toContain('после копии');

    const restored = await json(await call('POST', '/backup', copy));
    expect(restored.savedTo).toBeNull();
    expect(app.content.published.byPath('/lishnyaya')).toBeNull();
    const page = await html('/kontakty');
    expect(page).toContain('Контакты v1');
    expect(page).not.toContain('после копии');
    // Тот, кто восстанавливал, остался в менеджере: в копии под его id — он же.
    expect((await call('GET', '/pages')).status).toBe(200);
  });

  it('JSON — те же записи текстом, без сеансов; восстанавливается так же', async () => {
    app.media.files.save({
      path: 'images/logo.png',
      data: new TextEncoder().encode('png'),
    });
    const archive = JSON.parse(
      new TextDecoder().decode(await download('json'))
    );
    expect(archive.format).toBe('cms-archive');
    expect(archive.migrations).toContain('media/002_alt');
    expect(Object.keys(archive.tables)).not.toContain('identity_sessions');
    expect(archive.tables.media_files[0].data.$base64).toBe(
      Buffer.from('png').toString('base64')
    );

    await call('PATCH', `/pages/${contacts()}`, { title: 'Другое' });
    app.media.files.remove('images/logo.png');
    await call(
      'POST',
      '/backup',
      new TextEncoder().encode(JSON.stringify(archive))
    );
    expect(app.content.drafts.view(contacts())?.title).toBe('Контакты');
    expect(app.media.files.read('images/logo.png')).not.toBeNull();
  });

  it('чужой файл, битый JSON и копия из более новой версии не принимаются', async () => {
    const code = (body: Uint8Array) =>
      call('POST', '/backup', body)
        .then(json)
        .then((_) => _.error.code);
    expect(await code(new TextEncoder().encode('не копия'))).toBe(
      'backup.invalid'
    );
    expect(await code(new TextEncoder().encode('{"format":"x"}'))).toBe(
      'backup.invalid'
    );
    const archive = JSON.parse(
      new TextDecoder().decode(await download('json'))
    );
    expect(
      await code(
        new TextEncoder().encode(
          JSON.stringify({
            ...archive,
            migrations: [...archive.migrations, 'site/999_future'],
          })
        )
      )
    ).toBe('backup.newer');
    // Ничего не испорчено: сайт работает как прежде.
    expect(await html('/kontakty')).toContain('Контакты');
  });

  it('в копии под тем же id другой человек — сеанс закрывается', async () => {
    const archive = JSON.parse(
      new TextDecoder().decode(await download('json'))
    );
    archive.tables.identity_users[0].email = 'someone@example.com';
    await call(
      'POST',
      '/backup',
      new TextEncoder().encode(JSON.stringify(archive))
    );
    expect((await call('GET', '/pages')).status).toBe(401);
  });

  it('копия и восстановление — только администратору', async () => {
    await app.identity.users.create({
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    const cookie = cookieOf(
      await call(
        'POST',
        '/session',
        { email: 'editor@example.com', password: _PASSWORD },
        ''
      )
    );
    expect((await call('GET', '/backup', undefined, cookie)).status).toBe(403);
    expect(
      (await call('POST', '/backup', new Uint8Array([1]), cookie)).status
    ).toBe(403);
  });
});

describe('копия сайта в файле', () => {
  let dir: string;

  beforeEach(async () => {
    app.close();
    dir = mkdtempSync(join(tmpdir(), 'cms-backup-'));
    app = createApp({ databasePath: join(dir, 'site.db'), scaffold: DEMO });
    await setup();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('в .db-копии нет сеансов и ключа ИИ: они не уходят с сервера', async () => {
    app.assistant.connection.save({
      url: 'https://ai.example',
      model: 'm',
      key: 'sk-AUDIT-SECRET',
    });
    const bytes = new Uint8Array(await download('db'));
    expect(new TextDecoder().decode(bytes)).not.toContain('sk-AUDIT-SECRET');
    const file = join(dir, 'check.db');
    await Bun.write(file, bytes);
    const db = new Database(file, { readonly: true });
    const count = (table: string) =>
      db.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()!
        .n;
    expect(count('identity_sessions')).toBe(0);
    expect(count('assistant_connection')).toBe(0);
    expect(count('identity_users')).toBe(1);
    db.close();
  });

  it('копий «до восстановления» рядом с базой — не больше трёх', async () => {
    const copy = new Uint8Array(await download('db'));
    for (const _ of [1, 2, 3, 4, 5]) {
      expect((await call('POST', '/backup', copy)).status).toBe(200);
    }
    const saved = readdirSync(dir).filter((_) =>
      _.startsWith('site.before-restore-')
    );
    expect(saved).toHaveLength(3);
    expect(statSync(join(dir, saved[0]!)).mode & 0o777).toBe(0o600);
  });

  it('перед восстановлением состояние сохраняется рядом с базой', async () => {
    const copy = new Uint8Array(await download('db'));
    const restored = await json(await call('POST', '/backup', copy));
    expect(restored.savedTo).toStartWith(join(dir, 'site.before-restore-'));
    expect(
      readdirSync(dir).some((_) => _.startsWith('site.before-restore-'))
    ).toBe(true);
  });
});

describe('бэкап командой', () => {
  it('бэкап — один файл со всем сайтом, который открывается как база', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cms-'));
    const site = createApp({
      databasePath: join(dir, 'site.db'),
      scaffold: DEMO,
    });
    site.media.files.save({
      path: 'docs/a.txt',
      data: new TextEncoder().encode('a'),
    });
    site.assistant.connection.save({
      url: 'https://ai.example',
      model: 'm',
      key: 'sk-CLI-SECRET',
    });
    site.backup(join(dir, 'copy.db'));
    site.close();
    expect(statSync(join(dir, 'copy.db')).mode & 0o777).toBe(0o600);
    expect(await Bun.file(join(dir, 'copy.db')).text()).not.toContain(
      'sk-CLI-SECRET'
    );
    const copy = createApp({ databasePath: join(dir, 'copy.db') });
    expect(copy.content.published.byPath('/kontakty')?.title).toBe('Контакты');
    expect(copy.media.files.list().map((_) => String(_.path))).toEqual([
      'docs/a.txt',
    ]);
    expect(
      await (await copy.fetch(new Request('http://localhost/kontakty'))).text()
    ).toContain('<h1>Контакты</h1>');
    copy.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
