import { Database } from 'bun:sqlite';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  jest,
  spyOn,
} from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, explain, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { VERSION } from '../src/cli/version.ts';
import { parseSchedule } from '../src/contexts/upkeep/domain/schedule.ts';
import { isPrerelease } from '../src/contexts/upkeep/domain/version.ts';
import { defineReleases, updateProgram } from '../src/contexts/upkeep/index.ts';
import { startUpkeep } from '../src/contexts/upkeep/infrastructure/background.ts';
import { isDomainError } from '../src/shared/kernel/errors.ts';
import { expectMode, removeTemp, WINDOWS } from './fixtures/platform.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-upkeep-'));
afterAll(() => removeTemp(dir));

// «Бинарники» в тестах обновления — скрипты sh, Windows их не запустит; замену там проверяет
// src/contexts/upkeep/infrastructure/installer.test.ts с правилами Windows.
const unixIt = it.skipIf(WINDOWS);

let site = 0;
// Своя база на тест и свои часы: `tick()` — минута вперёд, у следующей копии другое имя.
const siteWith = (options: Partial<Parameters<typeof createApp>[0]> = {}) => {
  const folder = join(dir, `site-${++site}`);
  mkdirSync(folder);
  let now = new Date(2026, 9, 31, 3, 30);
  const app = createApp({
    databasePath: join(folder, 'site.db'),
    clock: () => now,
    ...options,
  });
  return {
    app,
    folder,
    tick: () => void (now = new Date(now.getTime() + 60_000)),
  };
};

const codeOf = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'resolved',
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('автокопии', () => {
  it('копия по кнопке: имя по часам сервера, права 600, без сеансов и настроек сервера', async () => {
    const { app, folder } = siteWith();
    app.upkeep.backups.configure({ enabled: true });
    const run = await app.upkeep.backups.run(true);
    expect(basename(run.file)).toBe('site-auto-20261031-0330.db');
    expect(run.file).toBe(join(folder, 'backups', basename(run.file)));
    expect(run.manual).toBe(true);
    expectMode(run.file, 0o600);
    const copy = new Database(run.file, { readonly: true });
    const count = (table: string) =>
      copy.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()!
        .n;
    expect(count('upkeep_settings')).toBe(0);
    expect(count('identity_sessions')).toBe(0);
    expect(count('_migrations')).toBeGreaterThan(0);
    copy.close();
    expect(app.upkeep.backups.status()).toMatchObject({
      last: { file: run.file },
      failure: null,
      folder: join(folder, 'backups'),
    });
    app.close();
  });

  it('хранит только последние `keep` автокопий, чужие файлы не трогает', async () => {
    const { app, folder, tick } = siteWith();
    app.upkeep.backups.configure({ enabled: true, keep: 2, folder: 'copies' });
    writeFileSync(join(folder, 'copies-note.txt'), 'x');
    mkdirSync(join(folder, 'copies'));
    writeFileSync(join(folder, 'copies', 'site.before-restore-1.db'), 'x');
    for (const _ of [1, 2, 3]) {
      tick();
      await app.upkeep.backups.run(false);
    }
    expect(readdirSync(join(folder, 'copies')).toSorted()).toEqual([
      'site-auto-20261031-0332.db',
      'site-auto-20261031-0333.db',
      'site.before-restore-1.db',
    ]);
    app.close();
  });

  it('два запуска разом: второй отказывает, первый доделывает', async () => {
    const { app } = siteWith();
    const first = app.upkeep.backups.run(true);
    expect(await codeOf(app.upkeep.backups.run(true))).toBe(
      'upkeep.backup_running'
    );
    expect(await codeOf(first)).toBe('resolved');
    app.close();
  });

  it('сбой — в статус и журнал сбоев; удачная копия его снимает', async () => {
    const { app, folder } = siteWith();
    writeFileSync(join(folder, 'occupied'), 'файл, а не каталог');
    app.upkeep.backups.configure({ enabled: true, folder: 'occupied' });
    expect(await codeOf(app.upkeep.backups.run(false))).toBe(
      'upkeep.backup_failed'
    );
    expect(app.upkeep.backups.status().failure?.message).toBeTruthy();
    expect(
      app.notify.incidents.list().some((_) => _.kind === 'upkeep.backup_failed')
    ).toBe(true);
    app.upkeep.backups.configure({ folder: '' });
    await app.upkeep.backups.run(false);
    expect(app.upkeep.backups.status().failure).toBeNull();
    app.close();
  });

  it('у базы в памяти копий нет — понятный отказ', async () => {
    const app = createApp();
    expect(await codeOf(app.upkeep.backups.run(true))).toBe(
      'upkeep.backup_failed'
    );
    app.close();
  });

  it('расписание: задача срабатывает в свою минуту и перестраивается при правке', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 31, 3, 29, 30));
    let runs = 0;
    const background = startUpkeep({
      schedule: parseSchedule({ enabled: true, every: 24, at: '03:30' }),
      backup: () => ((runs += 1), Promise.resolve()),
      check: () => Promise.resolve(),
      tidy: () => Promise.resolve(),
    });
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(runs).toBe(1);
    background.reschedule(parseSchedule({ enabled: false }));
    jest.advanceTimersByTime(48 * 3_600_000);
    await Promise.resolve();
    expect(runs).toBe(1);
    background.reschedule(
      parseSchedule({ enabled: true, every: 1, at: '00:15' })
    );
    jest.advanceTimersByTime(3 * 3_600_000);
    await Promise.resolve();
    expect(runs).toBe(4);
    background.stop();
    jest.useRealTimers();
  });

  it('уборка — раз в сутки в 04:15; её сбой только пишется в журнал', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 31, 4, 14, 30));
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    let runs = 0;
    const background = startUpkeep({
      schedule: parseSchedule({ enabled: false }),
      backup: () => Promise.resolve(),
      check: () => Promise.resolve(),
      tidy: () => ((runs += 1), Promise.reject(new Error('disk'))),
    });
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(1);
    expect(logged).toHaveBeenCalled();
    jest.advanceTimersByTime(23 * 3_600_000);
    await Promise.resolve();
    expect(runs).toBe(1);
    jest.advanceTimersByTime(3_600_000);
    await Promise.resolve();
    expect(runs).toBe(2);
    background.stop();
    logged.mockRestore();
    jest.useRealTimers();
  });

  it('менеджер: расписание и копия — только администратору', async () => {
    const { app } = siteWith();
    const call = (method: string, path: string, body?: unknown, cookie = '') =>
      app.fetch(
        new Request(`http://localhost/manager/api${path}`, {
          method,
          headers: {
            ...(cookie ? { cookie } : {}),
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
    expect((await call('GET', '/upkeep')).status).toBe(401);
    const setup = await call('POST', '/setup', {
      token: app.identity.setup.token(),
      email: 'admin@example.com',
      password: 'correct horse battery',
    });
    const cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
    const saved = await call(
      'PUT',
      '/upkeep/backups',
      { enabled: true, every: 6, at: '02:00', keep: 3 },
      cookie
    );
    expect(await saved.json()).toMatchObject({
      schedule: { enabled: true, every: 6, at: '02:00', keep: 3 },
    });
    expect(
      (await call('PUT', '/upkeep/backups', { every: 7 }, cookie)).status
    ).toBe(422);
    const ran = await call('POST', '/upkeep/backups/run', undefined, cookie);
    expect(((await ran.json()) as any).last.manual).toBe(true);
    app.close();
  });
});

// Страница релизов и файлы выпуска — на своём сервере, как у GitHub.
const _script = (version: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(`#!/bin/sh\necho "Eile ${version}"\n`);

describe('обновления', () => {
  let server: ReturnType<typeof Bun.serve>;
  let tamper = false;
  let listed = 0;
  const archive = Bun.gzipSync(_script('0.2.0'));
  const sums = `${new Bun.CryptoHasher('sha256').update(archive).digest('hex')}  cms-linux-x64.gz\n`;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch: (request) =>
        ((path) =>
          path.startsWith('/repos/') && path.endsWith('/releases')
            ? ((listed += 1),
              Response.json(
                ['0.3.0-alpha.1', '0.2.0', '0.1.0'].map((version) => ({
                  tag_name: `v${version}`,
                  html_url: `${server.url}notes/${version}`,
                  draft: false,
                  prerelease: version.includes('-'),
                  assets: ['cms-linux-x64.gz', 'SHA256SUMS'].map((name) => ({
                    name,
                    browser_download_url: `${server.url}download/v${version}/${name}`,
                  })),
                }))
              ))
            : path.endsWith('/cms-linux-x64.gz')
              ? new Response(tamper ? Bun.gzipSync(_script('evil')) : archive)
              : path.endsWith('/SHA256SUMS')
                ? new Response(sums)
                : new Response('Not Found', { status: 404 }))(
          new URL(request.url).pathname
        ),
    });
  });
  afterAll(() => server.stop(true));

  const releases = () =>
    defineReleases({
      base: server.url.href.replace(/\/$/, ''),
      repository: 'owner/eile',
      version: '0.1.0',
    });

  const installed = (content = 'old') => {
    const path = join(mkdtempSync(join(dir, 'bin-')), 'cms');
    writeFileSync(path, content);
    chmodSync(path, 0o755);
    return path;
  };

  unixIt(
    'cms update: сверяет сумму, пробует запуск, заменяет и оставляет прежний',
    async () => {
      const binary = installed();
      const result = await updateProgram({
        releases: releases(),
        current: '0.1.0',
        binary,
        standalone: true,
        target: 'linux-x64',
      });
      expect(result).toMatchObject({
        status: 'updated',
        release: { version: '0.2.0' },
        previous: `${binary}.old`,
        alias: join(binary, '..', 'eile'),
      });
      expect(readFileSync(binary, 'utf8')).toContain('Eile 0.2.0');
      expect(statSync(binary).mode & 0o777).toBe(0o755);
      expect(readFileSync(`${binary}.old`, 'utf8')).toBe('old');
      expect(readdirSync(join(binary, '..')).toSorted()).toEqual([
        'cms',
        'cms.old',
        'eile',
      ]);
      // Установка старше второго имени получила ссылку, она ведёт на новый файл.
      expect(readlinkSync(join(binary, '..', 'eile'))).toBe('cms');
    }
  );

  unixIt(
    'ссылка на месте cms.old удаляется, а не проходится насквозь',
    async () => {
      const binary = installed();
      const victim = join(binary, '..', 'victim');
      writeFileSync(victim, 'keep');
      symlinkSync(victim, `${binary}.old`);
      await updateProgram({
        releases: releases(),
        current: '0.1.0',
        binary,
        standalone: true,
        target: 'linux-x64',
      });
      expect(readFileSync(victim, 'utf8')).toBe('keep');
      expect(readFileSync(`${binary}.old`, 'utf8')).toBe('old');
    }
  );

  unixIt('свой файл eile рядом обновление не трогает', async () => {
    const binary = installed();
    writeFileSync(join(binary, '..', 'eile'), 'mine');
    const result = await updateProgram({
      releases: releases(),
      current: '0.1.0',
      binary,
      standalone: true,
      target: 'linux-x64',
    });
    expect(result).toMatchObject({ status: 'updated', alias: null });
    expect(readFileSync(join(binary, '..', 'eile'), 'utf8')).toBe('mine');
  });

  it('--check только сообщает: бинарник не меняется', async () => {
    const binary = installed();
    const result = await updateProgram({
      releases: releases(),
      current: '0.1.0',
      check: true,
      binary,
      standalone: true,
      target: 'linux-x64',
    });
    expect(result).toMatchObject({
      status: 'available',
      release: {
        version: '0.2.0',
        url: expect.stringContaining('/notes/0.2.0'),
      },
    });
    expect(readFileSync(binary, 'utf8')).toBe('old');
  });

  it('подменённый файл — отказ, установленный cms цел', async () => {
    const binary = installed();
    tamper = true;
    const code = await codeOf(
      updateProgram({
        releases: releases(),
        current: '0.1.0',
        binary,
        standalone: true,
        target: 'linux-x64',
      })
    );
    tamper = false;
    expect(code).toBe('upkeep.checksum_mismatch');
    expect(readdirSync(join(binary, '..'))).toEqual(['cms']);
    expect(readFileSync(binary, 'utf8')).toBe('old');
  });

  it('новее нет — так и говорит; из исходников не обновляет', async () => {
    expect(
      await updateProgram({ releases: releases(), current: '9.0.0' })
    ).toEqual({ status: 'current', current: '9.0.0' });
    expect(
      await codeOf(
        updateProgram({
          releases: releases(),
          current: '0.1.0',
          standalone: false,
        })
      )
    ).toBe('upkeep.not_binary');
  });

  it('новая версия — администратору в /session; выключенная проверка молчит', async () => {
    const app: App = createApp({
      releasesUrl: server.url.href.replace(/\/$/, ''),
      updateCheck: true,
    });
    const before = listed;
    const status = await app.upkeep.updates.check();
    expect(listed).toBe(before + 1);
    // Программа на пре-релизе видит и следующие альфы, на стабильной — только стабильные выпуски.
    const expected = isPrerelease(VERSION) ? '0.3.0-alpha.1' : '0.2.0';
    expect(status.current).toBe(VERSION);
    expect(status.latest?.latest).toBe(expected);
    const call = (path: string, init: RequestInit = {}) =>
      app.fetch(new Request(`http://localhost/manager/api${path}`, init));
    expect(((await (await call('/session')).json()) as any).update).toBeNull();
    const setup = await call('/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: app.identity.setup.token(),
        email: 'admin@example.com',
        password: 'correct horse battery',
      }),
    });
    const cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
    const session = (await (
      await call('/session', { headers: { cookie } })
    ).json()) as any;
    expect(session.update).toMatchObject({ latest: expected });
    app.upkeep.updates.configure(false);
    expect(app.upkeep.updates.latest()).toBeNull();
    app.close();

    const locked = createApp({ updateCheck: false });
    expect(locked.upkeep.updates.status()).toMatchObject({
      enabled: false,
      locked: true,
    });
    locked.close();
  });
});

describe('CMS_RELEASES_URL', () => {
  // Лента и файлы выпуска — без сети: подставленный fetch отвечает как зеркало GitHub.
  const archive = Bun.gzipSync(_script('0.2.0'));
  const sums = `${new Bun.CryptoHasher('sha256').update(archive).digest('hex')}  cms-linux-x64.gz\n`;
  const mirror = (files: string, notes = 'https://mirror.example/notes') => {
    const asked: { url: string; agent: string | null }[] = [];
    const fetch = (url: string, init: RequestInit) => (
      asked.push({
        url,
        agent: new Headers(init.headers).get('user-agent'),
      }),
      Promise.resolve(
        url.endsWith('/releases?per_page=30')
          ? Response.json([
              {
                tag_name: 'v0.2.0',
                html_url: notes,
                draft: false,
                assets: ['cms-linux-x64.gz', 'SHA256SUMS'].map((name) => ({
                  name,
                  browser_download_url: `${files}/${name}`,
                })),
              },
            ])
          : url.endsWith('/cms-linux-x64.gz')
            ? new Response(archive)
            : url.endsWith('/SHA256SUMS')
              ? new Response(sums)
              : new Response('Not Found', { status: 404 })
      )
    );
    return { asked, fetch };
  };

  const installed = () => {
    const path = join(mkdtempSync(join(dir, 'mirror-')), 'cms');
    writeFileSync(path, 'old');
    chmodSync(path, 0o755);
    return path;
  };

  it('лента — со своего адреса: путь зеркала, репозиторий и User-Agent', async () => {
    const { asked, fetch } = mirror('https://mirror.example/files');
    const list = await defineReleases({
      base: 'https://mirror.example/api',
      repository: 'owner/eile',
      version: '0.1.0',
      fetch,
    })();
    expect(asked).toEqual([
      {
        url: 'https://mirror.example/api/repos/owner/eile/releases?per_page=30',
        agent: 'Eile/0.1.0',
      },
    ]);
    expect(list[0]).toMatchObject({
      version: '0.2.0',
      url: 'https://mirror.example/notes',
    });
  });

  it('ссылка на заметки — только http(s): менеджер ставит её в href', async () => {
    const list = await defineReleases({
      base: 'https://mirror.example',
      repository: 'owner/eile',
      version: '0.1.0',
      fetch: mirror('https://mirror.example', 'javascript:alert(1)').fetch,
    })();
    expect(list[0]?.url).toBe('');
  });

  unixIt(
    'обновление с зеркала по https: файлы оттуда же, сумма сверена',
    async () => {
      const { asked, fetch } = mirror('https://mirror.example/files');
      const binary = installed();
      const result = await updateProgram({
        releases: defineReleases({
          base: 'https://mirror.example/api',
          repository: 'owner/eile',
          version: '0.1.0',
          fetch,
        }),
        current: '0.1.0',
        binary,
        standalone: true,
        target: 'linux-x64',
        fetch,
      });
      expect(result.status).toBe('updated');
      expect(readFileSync(binary, 'utf8')).toContain('Eile 0.2.0');
      expect(asked.map((_) => _.url)).toContain(
        'https://mirror.example/files/cms-linux-x64.gz'
      );
    }
  );

  unixIt(
    'файл выпуска по http с чужой машины — отказ до скачивания; с CMS_RELEASES_INSECURE — можно',
    async () => {
      const { asked, fetch } = mirror('http://mirror.lan/files');
      const releases = defineReleases({
        base: 'https://mirror.example/api',
        repository: 'owner/eile',
        version: '0.1.0',
        fetch,
      });
      const binary = installed();
      expect(
        await codeOf(
          updateProgram({
            releases,
            current: '0.1.0',
            binary,
            standalone: true,
            target: 'linux-x64',
            fetch,
          })
        )
      ).toBe('upkeep.insecure_download');
      expect(asked.some((_) => _.url.startsWith('http://mirror.lan'))).toBe(
        false
      );
      expect(readFileSync(binary, 'utf8')).toBe('old');
      const allowed = await updateProgram({
        releases,
        current: '0.1.0',
        binary,
        standalone: true,
        target: 'linux-x64',
        fetch,
        insecure: true,
      });
      expect(allowed.status).toBe('updated');
    }
  );
});

describe('CMS_RELEASES_URL в cms update', () => {
  const run = (env: Record<string, string>, argv: readonly string[]) => {
    const out: string[] = [];
    const parsed = parseInvocation(['update', ...argv], env);
    const ctx: Context = {
      args: 'options' in parsed ? parsed.args : [],
      options: 'options' in parsed ? parsed.options : (undefined as never),
      paint: definePaint(false),
      language: 'ru',
      tty: false,
      out: (_) => void out.push(_),
    };
    return RUN.update!(ctx).then(
      () => out.join('\n'),
      (error) => Promise.reject(new Error(explain(error, 'ru')))
    );
  };

  it('переменные окружения попадают в параметры как есть', () => {
    const parsed = parseInvocation(['update'], {
      CMS_RELEASES_URL: 'https://mirror.example/api',
      CMS_RELEASES_INSECURE: '1',
    });
    expect('options' in parsed && parsed.options).toMatchObject({
      releasesUrl: 'https://mirror.example/api',
      releasesInsecure: true,
    });
  });

  it('негодный адрес — понятный отказ до любого запроса', async () => {
    await expect(
      run({ CMS_RELEASES_URL: 'http://mirror.lan' }, ['--check'])
    ).rejects.toThrow('CMS_RELEASES_INSECURE=1');
    await expect(
      run({ CMS_RELEASES_URL: 'ftp://mirror.example' }, ['--check'])
    ).rejects.toThrow('https://mirror.example/api');
  });

  it('проверка на своей ленте на этой машине — без пересборки бинарника', async () => {
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) =>
        new URL(request.url).pathname.endsWith('/releases')
          ? Response.json([
              {
                tag_name: 'v99.0.0',
                html_url: 'http://127.0.0.1/notes',
                draft: false,
                assets: [],
              },
            ])
          : new Response('Not Found', { status: 404 }),
    });
    const base = `http://127.0.0.1:${server.port}`;
    const text = await run({ CMS_RELEASES_URL: `${base}/` }, ['--check']);
    server.stop(true);
    expect(text).toContain(`Релизы: ${base}`);
    expect(text).toContain('Доступна Eile 99.0.0');
  });
});
