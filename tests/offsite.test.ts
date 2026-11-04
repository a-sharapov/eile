import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { s3Remote } from '../src/contexts/upkeep/index.ts';
import { isSqlite } from '../src/platform/archive.ts';
import {
  keyIdOf,
  newBackupKey,
  parseRecoveryKey,
  sealInfo,
} from '../src/platform/seal.ts';
import { isDomainError } from '../src/shared/kernel/errors.ts';
import { removeTemp } from './fixtures/platform.ts';
import { type FakeS3, startFakeS3 } from './fixtures/s3.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-offsite-'));
let s3: FakeS3;
beforeAll(() => {
  s3 = startFakeS3({ pageSize: 2 });
});
afterAll(() => {
  s3.stop();
  removeTemp(dir);
});

const SECRET = 'fake-secret-do-not-leak-1234567890';

let site = 0;
const siteWith = (name = 'site') => {
  const folder = join(dir, `site-${++site}`);
  mkdirSync(folder);
  let now = new Date(2026, 10, 3, 3, 30);
  const app = createApp({
    databasePath: join(folder, `${name}.db`),
    clock: () => now,
  });
  return {
    app,
    folder,
    tick: () => void (now = new Date(now.getTime() + 60_000)),
  };
};

const storage = (patch: Record<string, unknown> = {}) => ({
  enabled: true,
  endpoint: s3.endpoint,
  bucket: s3.bucket,
  accessKey: s3.accessKey,
  secret: SECRET,
  ...patch,
});

const codeOf = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'resolved',
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const prefixed = (prefix: string): string[] =>
  [...s3.objects.keys()].filter((_) => _.startsWith(prefix)).toSorted();

const clear = () => void s3.objects.clear();

describe('копии вне сервера', () => {
  it('первое включение создаёт ключ копий: ключ восстановления — только в этом ответе', () => {
    const { app } = siteWith();
    const first = app.upkeep.offsite.configure(storage({ prefix: 'a' }));
    expect(first.recoveryKey).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){10}$/);
    expect(first.keyId).toBe(keyIdOf(parseRecoveryKey(first.recoveryKey!)));
    expect(first).toMatchObject({
      hasSecret: true,
      settings: { prefix: 'a/', bucket: s3.bucket },
    });
    const again = app.upkeep.offsite.configure({ keep: 3 });
    expect(again.recoveryKey).toBeUndefined();
    expect(again.keyId).toBe(first.keyId);
    const text = JSON.stringify([again, app.upkeep.offsite.status()]);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(first.recoveryKey!.replaceAll('-', ''));
    app.close();
  });

  it('секрет остаётся для того же хранилища; другое хранилище без секрета не включить', () => {
    const { app } = siteWith();
    app.upkeep.offsite.configure(storage());
    expect(app.upkeep.offsite.configure({ keep: 5 }).hasSecret).toBe(true);
    expect(() =>
      app.upkeep.offsite.configure({ endpoint: 'https://fra1.example.com' })
    ).toThrow(expect.objectContaining({ code: 'upkeep.offsite_no_secret' }));
    expect(() =>
      app.upkeep.offsite.configure({ endpoint: 'ftp://x', secret: 'x' })
    ).toThrow(expect.objectContaining({ code: 'upkeep.invalid_endpoint' }));
    expect(() =>
      app.upkeep.offsite.configure({ prefix: '../up', secret: 'x' })
    ).toThrow(expect.objectContaining({ code: 'upkeep.invalid_prefix' }));
    app.close();
  });

  it('автокопия уходит в хранилище запечатанной; открывается ключом сервера в ту же базу', async () => {
    clear();
    const { app } = siteWith();
    const { keyId } = app.upkeep.offsite.configure(storage({ prefix: 'b' }));
    const run = await app.upkeep.backups.run(false);
    const name = `${basename(run.file)}.enc`;
    expect(prefixed('b/')).toEqual([`b/${name}`]);
    const sealed = s3.objects.get(`b/${name}`)!.data;
    expect(isSqlite(sealed)).toBe(false);
    expect(sealInfo(sealed)).toMatchObject({ content: 'site', keyId });
    expect(app.upkeep.offsite.status()).toMatchObject({
      last: { name, size: sealed.byteLength },
      failure: null,
    });
    const target = join(dir, 'fetched.db');
    await app.upkeep.offsite.fetch(name, target);
    expect(await Bun.file(target).bytes()).toEqual(
      await Bun.file(run.file).bytes()
    );
    app.close();
  });

  it('хранит последние `keep` копий этой базы, чужие объекты не трогает', async () => {
    clear();
    s3.objects.set('c/other-auto-20260101-0000.db.enc', {
      data: new Uint8Array(1),
      at: new Date(),
    });
    s3.objects.set('c/notes.txt', { data: new Uint8Array(1), at: new Date() });
    const { app, tick } = siteWith();
    app.upkeep.offsite.configure(storage({ prefix: 'c', keep: 2 }));
    for (const _ of [1, 2, 3, 4]) {
      tick();
      await app.upkeep.backups.run(false);
    }
    expect(prefixed('c/')).toEqual([
      'c/notes.txt',
      'c/other-auto-20260101-0000.db.enc',
      'c/site-auto-20261103-0333.db.enc',
      'c/site-auto-20261103-0334.db.enc',
    ]);
    // Список — постранично (у учебного хранилища страница из двух объектов), новые первыми.
    expect((await app.upkeep.offsite.copies()).map((_) => _.name)).toEqual([
      'site-auto-20261103-0334.db.enc',
      'site-auto-20261103-0333.db.enc',
      'other-auto-20260101-0000.db.enc',
    ]);
    app.close();
  });

  it('сбой отправки — в статус и журнал сбоев, копия на сервере остаётся; удачная снимает', async () => {
    clear();
    const { app, tick } = siteWith();
    app.upkeep.offsite.configure(storage({ prefix: 'd' }));
    s3.fail('put');
    expect(await codeOf(app.upkeep.backups.run(true))).toBe(
      'upkeep.offsite_failed'
    );
    s3.fail(null);
    expect(app.upkeep.backups.status().last).not.toBeNull();
    expect(app.upkeep.offsite.status().failure?.message).toContain(
      'InternalError'
    );
    expect(
      app.notify.incidents
        .list()
        .some((_) => _.kind === 'upkeep.offsite_failed')
    ).toBe(true);
    expect(prefixed('d/')).toEqual([]);
    tick();
    await app.upkeep.backups.run(true);
    expect(app.upkeep.offsite.status().failure).toBeNull();
    expect(prefixed('d/')).toHaveLength(1);
    app.close();
  });

  it('проверка хранилища: ключ доступа, секрет, бакет и адрес — понятными кодами', async () => {
    const { app } = siteWith();
    app.upkeep.offsite.configure(storage({ enabled: false }));
    expect(await codeOf(app.upkeep.offsite.check())).toBe('resolved');
    expect(s3.objects.has('.eile-check')).toBe(false);
    expect(
      await codeOf(
        app.upkeep.offsite.check({ accessKey: 'nobody', secret: 'x' })
      )
    ).toBe('upkeep.offsite_denied');
    s3.rejectSecret(true);
    expect(await codeOf(app.upkeep.offsite.check())).toBe(
      'upkeep.offsite_denied'
    );
    s3.rejectSecret(false);
    expect(
      await codeOf(app.upkeep.offsite.check({ bucket: 'missing', secret: 'x' }))
    ).toBe('upkeep.offsite_no_bucket');
    expect(
      await codeOf(
        app.upkeep.offsite.check({
          endpoint: 'http://127.0.0.1:9',
          secret: 'x',
        })
      )
    ).toBe('upkeep.offsite_unreachable');
    expect(await codeOf(createApp().upkeep.offsite.check())).toBe(
      'upkeep.offsite_not_configured'
    );
    app.close();
  });

  it('копия другого ключа не открывается ключом сервера: отказ с отпечатком', async () => {
    clear();
    const { app } = siteWith();
    const { keyId } = app.upkeep.offsite.configure(storage({ prefix: 'e' }));
    const run = await app.upkeep.backups.run(true);
    const rotated = app.upkeep.offsite.rotate();
    expect(rotated.keyId).not.toBe(keyId);
    expect(rotated.recoveryKey).toBeTruthy();
    const error = await app.upkeep.offsite
      .fetch(`${basename(run.file)}.enc`, join(dir, 'other.db'))
      .then(
        () => null,
        (_) => _ as Error & { code: string }
      );
    expect(error?.code).toBe('upkeep.offsite_other_key');
    expect(error?.message).toContain(keyId!);
    app.close();
  });

  it('копия больше куска загрузки уходит частями и возвращается байт в байт', async () => {
    clear();
    const key = newBackupKey();
    const store = s3Remote({
      enabled: true,
      endpoint: s3.endpoint,
      region: '',
      bucket: s3.bucket,
      prefix: 'big/',
      accessKey: s3.accessKey,
      virtualHosted: false,
      keep: 3,
      secret: SECRET,
    });
    const source = join(dir, 'big.db');
    const bytes = crypto.getRandomValues(new Uint8Array(65536 * 100));
    writeFileSync(source, bytes);
    s3.log.length = 0;
    await store.upload(source, 'big-auto-20261103-0330.db.enc', key);
    expect(s3.log.filter((_) => _.includes('partNumber='))).toHaveLength(2);
    expect(await store.header('big-auto-20261103-0330.db.enc')).toEqual({
      keyId: keyIdOf(key),
    });
    const back = join(dir, 'big-back.db');
    await store.download('big-auto-20261103-0330.db.enc', back, key);
    expect(await Bun.file(back).bytes()).toEqual(bytes);
    expect(await Bun.file(`${back}.enc.part`).exists()).toBe(false);
    expect(await codeOf(store.download('../x.db.enc', back, key))).toBe(
      'upkeep.invalid_copy_name'
    );
  });

  it('ключи хранилища — настройки сервера: в копию сайта не попадают и восстановлением не меняются', async () => {
    clear();
    const { app, folder } = siteWith();
    app.upkeep.offsite.configure(storage({ prefix: 'f' }));
    const run = await app.upkeep.backups.run(true);
    const copy = new Database(run.file, { readonly: true });
    expect(
      copy
        .query<{ n: number }, []>('SELECT count(*) AS n FROM upkeep_offsite')
        .get()!.n
    ).toBe(0);
    copy.close();
    const before = app.upkeep.offsite.status();
    await app.restore(await Bun.file(run.file).bytes());
    expect(app.upkeep.offsite.status()).toEqual(before);
    expect(folder).toBeTruthy();
    app.close();
  });
});

describe('менеджер: хранилище, ключ и сжатие', () => {
  it('секрет и ключ не уходят в ответы; ключом API их не тронуть; восстановление и сжатие — маршрутами', async () => {
    clear();
    const { app } = siteWith();
    const call = (
      method: string,
      path: string,
      body?: unknown,
      auth: Record<string, string> = {}
    ) =>
      app.fetch(
        new Request(`http://localhost/manager/api${path}`, {
          method,
          headers: {
            ...auth,
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
    const setup = await call('POST', '/setup', {
      token: app.identity.setup.token(),
      email: 'admin@example.com',
      password: 'correct horse battery',
    });
    const cookie = {
      cookie: (setup.headers.get('set-cookie') ?? '').split(';')[0]!,
    };
    const saved = (await (
      await call('PUT', '/upkeep/offsite', storage({ prefix: 'm' }), cookie)
    ).json()) as { recoveryKey?: string; keyId: string };
    expect(saved.recoveryKey).toBeTruthy();
    const status = await (
      await call('GET', '/upkeep', undefined, cookie)
    ).text();
    expect(status).not.toContain(SECRET);
    expect(status).not.toContain('recoveryKey');
    expect(JSON.parse(status).offsite.keyId).toBe(saved.keyId);
    expect(JSON.parse(status).database.size).toBeGreaterThan(0);

    const token = app.identity.apiTokens.issue(1, 'Скрипт').token;
    const bearer = { authorization: `Bearer ${token}` };
    expect(
      (await call('PUT', '/upkeep/offsite', { keep: 2 }, bearer)).status
    ).toBe(403);
    expect(
      (await call('POST', '/upkeep/offsite/key', undefined, bearer)).status
    ).toBe(403);

    expect(
      (await call('POST', '/upkeep/offsite/check', {}, cookie)).status
    ).toBe(200);
    await call('POST', '/upkeep/backups/run', undefined, cookie);
    const { copies } = (await (
      await call('GET', '/upkeep/offsite/copies', undefined, cookie)
    ).json()) as { copies: { name: string }[] };
    expect(copies).toHaveLength(1);
    const restored = await call(
      'POST',
      '/upkeep/offsite/restore',
      { name: copies[0]!.name },
      cookie
    );
    expect(restored.status).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/upkeep/offsite/restore',
          { name: '../x.enc' },
          cookie
        )
      ).status
    ).toBe(422);
    const compacted = (await (
      await call('POST', '/upkeep/compact', undefined, cookie)
    ).json()) as { free: number; compacted: { before: number } | null };
    expect(compacted.free).toBe(0);
    expect(compacted.compacted?.before).toBeGreaterThan(0);
    app.close();
  });
});

describe('восстановление из хранилища', () => {
  const output: string[] = [];
  const context = (
    argv: readonly string[],
    env: Record<string, string> = {}
  ): Context =>
    ((parsed) => {
      if ('error' in parsed) throw new Error(parsed.error);
      return {
        args: parsed.args,
        options: parsed.options,
        paint: definePaint(false),
        language: 'ru',
        tty: false,
        out: (_) => void output.push(_),
      };
    })(parseInvocation(['restore', ...argv], env));

  const env = (): Record<string, string> => ({
    S3_ENDPOINT: s3.endpoint,
    S3_BUCKET: s3.bucket,
    S3_ACCESS_KEY_ID: s3.accessKey,
    S3_SECRET_ACCESS_KEY: SECRET,
    CMS_S3_PREFIX: 'g',
  });

  let recovery = '';
  let source: { app: App; folder: string };

  beforeAll(async () => {
    clear();
    source = siteWith();
    recovery = source.app.upkeep.offsite.configure(storage({ prefix: 'g' }))
      .recoveryKey!;
    await source.app.content.pages.create({
      title: 'Только в копии',
      template: 'Minimal',
      parentId: null,
      publish: true,
    });
    await source.app.upkeep.backups.run(true);
  });
  afterAll(() => source.app.close());

  it('без имени — список копий в хранилище', async () => {
    output.length = 0;
    await RUN.restore!(
      context(['--remote', '--db', join(dir, 'list.db')], env())
    );
    expect(output.join('\n')).toContain('site-auto-20261103-0330.db.enc');
    // Заглянуть в хранилище — не значит создать пустую базу.
    expect(await Bun.file(join(dir, 'list.db')).exists()).toBe(false);
  });

  it('на чистой машине: хранилище из окружения, ключ восстановления из CMS_RECOVERY_KEY', async () => {
    output.length = 0;
    const target = join(dir, 'fresh.db');
    await RUN.restore!(
      context(['--remote', 'latest', '--db', target], {
        ...env(),
        CMS_RECOVERY_KEY: recovery.toLowerCase(),
      })
    );
    expect(output.join('\n')).toContain('Сайт восстановлен из');
    const restored = createApp({ databasePath: target });
    expect(
      restored.content.drafts.tree().some((_) => _.title === 'Только в копии')
    ).toBe(true);
    restored.close();
  });

  it('без ключа восстановления и терминала — понятный отказ; чужой ключ — с обоими отпечатками', async () => {
    const target = join(dir, 'nokey.db');
    expect(
      RUN.restore!(context(['--remote', 'latest', '--db', target], env()))
    ).rejects.toThrow('ключ восстановления');
    const other = newBackupKey();
    const { recoveryKeyOf } = await import('../src/platform/seal.ts');
    expect(
      RUN.restore!(
        context(['--remote', 'latest', '--db', target], {
          ...env(),
          CMS_RECOVERY_KEY: recoveryKeyOf(other),
        })
      )
    ).rejects.toThrow(keyIdOf(other));
  });

  it('на той же машине ключ берётся из базы, ключ восстановления не нужен', async () => {
    output.length = 0;
    await RUN.restore!(
      context(
        [
          '--remote',
          'site-auto-20261103-0330.db.enc',
          '--db',
          join(source.folder, 'site.db'),
        ],
        {}
      )
    );
    expect(output.join('\n')).toContain('Прежнее состояние');
  });
});
