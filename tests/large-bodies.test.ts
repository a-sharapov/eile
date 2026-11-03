import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, type AppOptions, createApp } from '../src/app.ts';
import { formsMigrations } from '../src/contexts/forms/infrastructure/migrations.ts';
import type { MediaFile } from '../src/contexts/media/index.ts';
import type { Mail } from '../src/contexts/notify/index.ts';
import { migrate } from '../src/platform/database.ts';
import { DEMO } from './fixtures/demo.ts';

// Большие тела (ADR 0043): загрузка в медиатеку, письмо шлюза и файлы заявок — те же байты, те же
// пределы и коды, а временные файлы не остаются.

const root = mkdtempSync(join(tmpdir(), 'cms-large-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let sites = 0;
const fresh = (): string => join(root, `site-${++sites}`);

const _MB = 1024 * 1024;
const _PASSWORD = 'correct horse battery';

const pattern = (size: number, seed = 1): Uint8Array<ArrayBuffer> =>
  new Uint8Array(size).map((_, i) => (i * (seed + 6) + (i >> 11)) % 256);

const sha = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex').slice(0, 16);

const managerCookie = (site: App): Promise<string> =>
  site
    .fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: site.identity.setup.token(),
          email: 'admin@example.com',
          password: _PASSWORD,
        }),
      })
    )
    .then((_) => _.headers.get('set-cookie')!.split(';')[0]!);

const upload = (site: App, cookie: string, form: FormData) =>
  site.fetch(
    new Request('http://localhost/manager/api/media', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
  );

const mediaForm = (path: string, data: Uint8Array, name = 'clip.mp4') =>
  ((form) => (
    form.set('path', path), form.set('file', new Blob([data]), name), form
  ))(new FormData());

const spoolFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).filter((_) => _.startsWith('.upload'))
    : [];

// Кэш на диске — тело загрузки во временном файле рядом с ним; база в памяти — тело в памяти.
const MODES: readonly {
  readonly name: string;
  readonly open: () => { site: App; cache: string | null };
}[] = [
  {
    name: 'тело во временном файле',
    open: () =>
      ((cache) => ({ site: createApp({ mediaCache: cache }), cache }))(fresh()),
  },
  { name: 'тело в памяти', open: () => ({ site: createApp(), cache: null }) },
];

describe.each(MODES)('загрузка в медиатеку: $name', ({ open }) => {
  it('файл в несколько кусков — те же байты, хэш, размер; временного файла нет', async () => {
    const { site, cache } = open();
    const cookie = await managerCookie(site);
    const data = pattern(3 * _MB + 12_345);
    const response = await upload(
      site,
      cookie,
      mediaForm('video/clip.mp4', data)
    );
    expect(response.status).toBe(201);
    const saved = (await response.json()) as MediaFile;
    expect(saved).toMatchObject({
      path: 'video/clip.mp4',
      contentType: 'video/mp4',
      size: data.byteLength,
      hash: sha(data),
      width: null,
      height: null,
    });
    const served = await site.fetch(
      new Request('http://localhost/media/video/clip.mp4')
    );
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(data);
    const range = await site.fetch(
      new Request('http://localhost/media/video/clip.mp4', {
        headers: { range: `bytes=${_MB - 3}-${_MB + 2}` },
      })
    );
    expect(new Uint8Array(await range.arrayBuffer())).toEqual(
      data.subarray(_MB - 3, _MB + 3)
    );
    expect(cache === null ? [] : spoolFiles(cache)).toEqual([]);
    site.close();
  });

  it('замена файла: куски прежней версии уходят, описание остаётся', async () => {
    const { site } = open();
    const cookie = await managerCookie(site);
    await upload(site, cookie, mediaForm('video/clip.mp4', pattern(3 * _MB)));
    site.media.files.describe('video/clip.mp4', 'Ролик');
    const next = pattern(_MB + 1, 2);
    const saved = (await (
      await upload(site, cookie, mediaForm('video/clip.mp4', next))
    ).json()) as MediaFile;
    expect([saved.size, saved.hash, saved.alt]).toEqual([
      next.byteLength,
      sha(next),
      'Ролик',
    ]);
    expect(site.media.files.read('video/clip.mp4')!.data()).toEqual(next);
    site.close();
  });

  it('пределы и коды прежние: больше 32 МБ — 413, больше 25 МиБ — 422, без файла и не форма', async () => {
    const { site, cache } = open();
    const cookie = await managerCookie(site);
    const tooBig = await upload(
      site,
      cookie,
      mediaForm('video/big.mp4', new Uint8Array(33 * _MB))
    );
    expect(tooBig.status).toBe(413);
    expect(((await tooBig.json()) as any).error.code).toBe('manager.too_large');
    const overMedia = await upload(
      site,
      cookie,
      mediaForm('video/big.mp4', new Uint8Array(25 * _MB + 1))
    );
    expect(overMedia.status).toBe(422);
    expect(((await overMedia.json()) as any).error.code).toBe(
      'media.invalid_size'
    );
    const noFile = new FormData();
    noFile.set('path', 'video/none.mp4');
    expect(
      ((await (await upload(site, cookie, noFile)).json()) as any).error.code
    ).toBe('media.no_file');
    const urlencoded = await site.fetch(
      new Request('http://localhost/manager/api/media', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'path=video%2Fa.mp4',
      })
    );
    expect(((await urlencoded.json()) as any).error.code).toBe('media.no_file');
    const broken = await site.fetch(
      new Request('http://localhost/manager/api/media', {
        method: 'POST',
        headers: { cookie, 'content-type': 'multipart/form-data; boundary=x' },
        body: '--x\r\nContent-Disposition: form-data; name="file"; filename="a"',
      })
    );
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as any).error.code).toBe(
      'manager.invalid_form'
    );
    expect(site.media.files.list()).toEqual([]);
    expect(cache === null ? [] : spoolFiles(cache)).toEqual([]);
    site.close();
  });
});

describe('письмо шлюза с вложениями в несколько МБ', () => {
  const mails: Mail[] = [];
  const options = (dir: string | null): AppOptions => ({
    scaffold: DEMO,
    ...(dir ? { mediaCache: dir } : {}),
    mailLog: () => undefined,
    transports: {
      telegram: {
        send: () => Promise.resolve(),
        me: () => Promise.resolve('@bot'),
        chats: () => Promise.resolve([]),
      },
      email: {
        send: () => Promise.resolve(),
        mail: (_settings, mail) => (mails.push(mail), Promise.resolve()),
        probe: () => Promise.resolve({ ok: true, latencyMs: 1 }),
      },
    },
  });

  it.each([
    ['тело во временном файле', true],
    ['тело в памяти', false],
  ])('%s: вложения доходят целыми, временного файла нет', async (_, onDisk) => {
    const dir = onDisk ? fresh() : null;
    const site = createApp(options(dir));
    const cookie = await managerCookie(site);
    const call = (method: string, path: string, body: unknown) =>
      site.fetch(
        new Request(`http://localhost/manager/api${path}`, {
          method,
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    site.notify.settings.save({
      email: {
        host: 'smtp.example.com',
        user: 'site@example.com',
        password: 'smtp-secret-123',
        from: 'site@example.com',
        to: 'boss@example.com',
      },
    });
    await call('PUT', '/notify', { gateway: { enabled: true } });
    const { token } = (await (
      await call('POST', '/notify/gateway/tokens', { label: 'Plattform' })
    ).json()) as { token: string };
    const files = [1_999_000, 1_200_000, 900_001].map((size, k) =>
      pattern(size, k)
    );
    mails.length = 0;
    const response = await site.fetch(
      new Request('http://localhost/mailer/', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: 'kunde@example.org',
          subject: 'Angebot',
          text: 'Hallo',
          attachments: files.map((content, k) => ({
            filename: `f${k}.pdf`,
            contentType: 'application/pdf',
            contentBase64: content.toBase64(),
          })),
        }),
      }),
      {
        requestIP: () => ({ address: '198.51.100.7' }),
        timeout: () => undefined,
      }
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mails[0]!.attachments.map((_) => _.content)).toEqual(files);
    expect(dir === null ? [] : spoolFiles(dir)).toEqual([]);
    site.close();
  });
});

describe('файлы заявок кусками', () => {
  it('старая база: файл заявки целиком в forms_files.data переезжает в куски, байты те же', () => {
    const dir = fresh();
    const path = `${dir}.db`;
    const db = new Database(path, { create: true, strict: true });
    migrate(
      db,
      formsMigrations.filter((_) => _.id < 'forms/004_file_chunks')
    );
    const big = pattern(2 * _MB + 77, 3);
    db.run(
      `INSERT INTO forms_submissions (form, form_title, field_values, context, search, ip, user_agent, status, created_at, updated_at)
       VALUES ('docs', 'Docs', '[]', '{}', '', '', '', 'new', '2026-11-01T10:00:00Z', '2026-11-01T10:00:00Z')`
    );
    db.query(
      "INSERT INTO forms_files (submission_id, field, name, type, size, data) VALUES (1, 'plan', 'plan.pdf', 'application/pdf', ?, ?)"
    ).run(big.byteLength, big);
    db.close();
    const site = createApp({ databasePath: path });
    const file = site.forms.inbox.file(1, 1);
    expect([file.name, file.size]).toEqual(['plan.pdf', big.byteLength]);
    expect(file.bytes).toEqual(big);
    site.close();
    const check = new Database(path);
    expect(
      check
        .query<{ n: number }, []>(
          'SELECT count(*) AS n FROM forms_file_chunks WHERE file_id = 1'
        )
        .get()!.n
    ).toBe(3);
    expect(
      check
        .query<{ name: string }, []>(
          "SELECT name FROM pragma_table_info('forms_files')"
        )
        .all()
        .map((_) => _.name)
    ).not.toContain('data');
    check.close();
  });
});
