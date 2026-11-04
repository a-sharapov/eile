import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, it } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createApp } from '../src/app.ts';
import { type Options, parseInvocation } from '../src/cli/args.ts';
import { explain } from '../src/cli/commands.ts';
import type { Context } from '../src/cli/context.ts';
import { definePaint } from '../src/cli/paint.ts';
import {
  appliedMigrations,
  expectsHealth,
  type Host,
  placeDatabase,
  putBackDatabase,
  type Ran,
  restartReport,
  restartServices,
  runService,
  snapshotDatabase,
  stateDir,
} from '../src/cli/service.ts';
import {
  assess,
  blocking,
  type HostFacts,
  holderOf,
  installCommand,
  LOW_MEMORY,
  localUrl,
  parseMeminfo,
  parseShow,
  planService,
  readUnit,
  renderUnit,
  SWAP_COMMANDS,
  sameUnit,
  siteUrl,
  unitOptions,
} from '../src/cli/systemd.ts';
import { attempt, fail, isDomainError } from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';
import { WINDOWS } from './fixtures/platform.ts';

const plain = definePaint(false);
const BINARY = '/usr/local/bin/cms';

const dir = mkdtempSync(join(tmpdir(), 'cms-service-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const options = (argv: readonly string[], env = {}): Options =>
  ((_) => ('options' in _ ? _.options : fail('test.args', _.error)))(
    parseInvocation(argv, env)
  );

const plan = (argv: readonly string[]) => planService(options(argv), BINARY);

const codeOf = (run: () => unknown): string =>
  attempt(
    () => (run(), 'ok'),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const lines = (text: string): string[] => text.split('\n');

describe('юнит службы', () => {
  it('с доменом: свой HTTPS, порты ниже 1024 через одно право, база и кэш в каталогах systemd', async () => {
    const unit = renderUnit(
      plan(['--domain', 'a.de,www.a.de', '--email', 'you@a.de']),
      'ru'
    );
    expect(lines(unit)).toEqual(
      expect.arrayContaining([
        '[Service]',
        'Type=exec',
        `ExecStart=${BINARY} serve --domain a.de,www.a.de --email you@a.de`,
        'Environment=CMS_DB=/var/lib/cms/site.db',
        'Environment=CMS_MEDIA_CACHE=/var/cache/cms',
        'DynamicUser=yes',
        'StateDirectory=cms',
        'CacheDirectory=cms',
        'Restart=always',
        'RestartSec=1',
        'StartLimitIntervalSec=0',
        'AmbientCapabilities=CAP_NET_BIND_SERVICE',
        'CapabilityBoundingSet=CAP_NET_BIND_SERVICE',
        'ProtectSystem=strict',
        'ProtectHome=yes',
        'PrivateTmp=yes',
        'NoNewPrivileges=yes',
        'SystemCallFilter=@system-service',
        'SystemCallErrorNumber=EPERM',
        'WantedBy=multi-user.target',
      ])
    );
    // JIT JavaScriptCore пишет исполняемый код: этот запрет уронил бы сервер.
    expect(unit).not.toMatch(/^MemoryDenyWriteExecute=/m);
    expect(unit).not.toMatch(/^PrivateUsers=/m);
  });

  it('тестовый центр и свои порты попадают в ExecStart', async () => {
    expect(
      renderUnit(
        plan([
          '--domain',
          'a.de',
          '--acme-staging',
          '--port',
          '8081',
          '--https-port',
          '8443',
        ]),
        'en'
      )
    ).toContain(
      `ExecStart=${BINARY} serve --domain a.de --port 8081 --https-port 8443 --acme-staging`
    );
    // Оба порта от 1024: особые права не нужны.
    expect(
      lines(
        renderUnit(
          plan(['--domain', 'a.de', '--port', '8081', '--https-port', '8443']),
          'en'
        )
      )
    ).toContain('CapabilityBoundingSet=');
  });

  it('за прокси: только 127.0.0.1, без прав на порты; своё имя — свои каталоги', async () => {
    const unit = renderUnit(
      plan(['--trust-proxy', '--name', 'shop', '--port', '9000']),
      'en'
    );
    expect(lines(unit)).toEqual(
      expect.arrayContaining([
        `ExecStart=${BINARY} serve --trust-proxy --host 127.0.0.1 --port 9000`,
        'Environment=CMS_DB=/var/lib/shop/site.db',
        'Environment=CMS_MEDIA_CACHE=/var/cache/shop',
        'StateDirectory=shop',
        'CacheDirectory=shop',
        'CapabilityBoundingSet=',
        'Description=Eile CMS (shop)',
      ])
    );
    expect(unit).not.toContain('AmbientCapabilities');
    expect(unit).not.toMatch(/[А-Яа-яЁё]/);
    // Порт 80 за прокси — снова нужно право на него.
    expect(renderUnit(plan(['--trust-proxy', '--port', '80']), 'en')).toContain(
      'AmbientCapabilities=CAP_NET_BIND_SERVICE'
    );
  });

  it('юниты на разных языках — один и тот же юнит; другой порт — другой', async () => {
    const ru = renderUnit(plan(['--domain', 'a.de']), 'ru');
    const en = renderUnit(plan(['--domain', 'a.de']), 'en');
    expect(ru).not.toBe(en);
    expect(sameUnit(ru, en)).toBe(true);
    expect(sameUnit(ru, `${ru}\n# своя заметка\n`)).toBe(true);
    expect(
      sameUnit(ru, renderUnit(plan(['--domain', 'a.de', '--port', '81']), 'ru'))
    ).toBe(false);
  });

  it('разбор юнита: бинарник и параметры сервера — как их разберёт сам cms', async () => {
    const unit = readUnit(
      renderUnit(plan(['--trust-proxy', '--port', '9000']), 'ru')
    );
    expect(unit.binary).toBe(BINARY);
    const server = unitOptions(unit)!;
    expect(server).toMatchObject({
      port: '9000',
      host: '127.0.0.1',
      trustProxy: true,
      db: '/var/lib/cms/site.db',
      mediaCache: '/var/cache/cms',
    });
    expect(localUrl(server)).toBe('http://127.0.0.1:9000/');
    expect(siteUrl(server)).toBe('http://127.0.0.1:9000/');
  });

  it('юнит, написанный руками по старому README, тоже разбирается', async () => {
    const unit = readUnit(`[Service]
ExecStart=-/usr/local/bin/cms --domain example.com,www.example.com --email you@example.com
Environment="CMS_DB=/var/lib/cms/site.db" PORT=80
DynamicUser=yes`);
    expect(unit.binary).toBe('/usr/local/bin/cms');
    const server = unitOptions(unit)!;
    expect(server.port).toBe('80');
    expect(server.db).toBe('/var/lib/cms/site.db');
    expect(localUrl(server)).toBe('http://127.0.0.1:80/');
    expect(siteUrl(server)).toBe('https://example.com/');
  });

  it('вывод systemctl show — словарь', async () => {
    expect(
      parseShow('ActiveState=active\nMainPID=42\nExecStart={ path=/x ; }\n')
    ).toEqual({
      ActiveState: 'active',
      MainPID: '42',
      ExecStart: '{ path=/x ; }',
    });
  });
});

describe('параметры установки', () => {
  const refuse = (argv: readonly string[], binary = BINARY) =>
    codeOf(() => planService(options(argv), binary));

  it('режим нужен ровно один', async () => {
    expect(refuse([])).toBe('service.no_mode');
    expect(refuse(['--domain', 'a.de', '--trust-proxy'])).toBe(
      'service.both_modes'
    );
    expect(refuse(['--trust-proxy'])).toBe('ok');
    expect(refuse(['--domain', 'a.de'])).toBe('ok');
  });

  it('порты, имя, почта, адрес и домены проверяются', async () => {
    expect(refuse(['--trust-proxy', '--port', '0'])).toBe(
      'service.invalid_port'
    );
    expect(refuse(['--trust-proxy', '--port', '70000'])).toBe(
      'service.invalid_port'
    );
    expect(refuse(['--trust-proxy', '--port', '80a'])).toBe(
      'service.invalid_port'
    );
    expect(refuse(['--trust-proxy', '--name', 'My Site'])).toBe(
      'service.invalid_name'
    );
    expect(refuse(['--trust-proxy', '--name', 'cms@1'])).toBe(
      'service.invalid_name'
    );
    expect(refuse(['--domain', 'a.de', '--email', 'nope'])).toBe(
      'service.invalid_email'
    );
    expect(refuse(['--trust-proxy', '--host', 'example.com'])).toBe(
      'service.invalid_host'
    );
    expect(refuse(['--domain', 'localhost'])).toBe(
      'certificates.invalid_domain'
    );
  });

  it('параметры одного режима в другом — отказ', async () => {
    expect(refuse(['--trust-proxy', '--email', 'a@b.de'])).toBe(
      'service.domain_only'
    );
    expect(refuse(['--trust-proxy', '--acme-staging'])).toBe(
      'service.domain_only'
    );
    expect(refuse(['--domain', 'a.de', '--host', '127.0.0.1'])).toBe(
      'service.proxy_only'
    );
  });

  it('путь бинарника годится для ExecStart', async () => {
    expect(refuse(['--trust-proxy'], '/opt/my apps/cms')).toBe(
      'service.invalid_binary'
    );
    expect(refuse(['--trust-proxy'], '/opt/100%/cms')).toBe(
      'service.invalid_binary'
    );
  });

  it('строка для sudo — та же установка', async () => {
    expect(
      installCommand(
        plan(['--domain', 'a.de,www.a.de', '--email', 'you@a.de']),
        false
      )
    ).toBe(
      `sudo ${BINARY} service install --domain a.de,www.a.de --email you@a.de`
    );
    expect(
      installCommand(
        plan([
          '--trust-proxy',
          '--port',
          '9000',
          '--name',
          'shop',
          '--from',
          'my site.db',
        ]),
        true
      )
    ).toBe(
      `sudo ${BINARY} service install --trust-proxy --port 9000 --from 'my site.db' --name shop --force`
    );
  });

  it('новые параметры командной строки', async () => {
    expect(options(['service', 'logs', '-f'])).toMatchObject({ follow: true });
    expect(options(['update', '--no-restart'])).toMatchObject({
      noRestart: true,
    });
    expect(
      options(['service', 'install', '--from', 'x.db', '--print', '--force'])
    ).toMatchObject({ from: 'x.db', print: true, force: true });
    expect(options([], { CMS_HOST: '127.0.0.1' }).host).toBe('127.0.0.1');
    expect(options(['--host', '::1'], { CMS_HOST: '0.0.0.0' }).host).toBe(
      '::1'
    );
  });
});

describe('проверка машины', () => {
  const facts = (overrides: Partial<HostFacts> = {}): HostFacts => ({
    memory: { total: 4 * LOW_MEMORY, swap: 0 },
    local: ['127.0.0.1', '::1', '203.0.113.10', 'fe80::1%eth0'],
    ports: [
      { port: 80, holder: null },
      { port: 443, holder: null },
    ],
    domains: [{ domain: 'a.de', addresses: ['203.0.113.10'] }],
    ...overrides,
  });

  it('всё в порядке — замечаний нет', async () => {
    expect(assess(facts())).toEqual([]);
  });

  it('порт занят веб-сервером — отказ с подсказкой про прокси; чужим процессом — просто отказ', async () => {
    const concerns = assess(
      facts({
        ports: [
          { port: 80, holder: 'nginx' },
          { port: 443, holder: 'node' },
        ],
      })
    );
    expect(concerns).toEqual([
      { kind: 'port_busy', port: 80, holder: 'nginx', proxy: true },
      { kind: 'port_busy', port: 443, holder: 'node', proxy: false },
    ]);
    expect(concerns.every(blocking)).toBe(true);
  });

  it('домен не находится или указывает не сюда — только предупреждение', async () => {
    const concerns = assess(
      facts({
        domains: [
          { domain: 'a.de', addresses: [] },
          { domain: 'www.a.de', addresses: ['198.51.100.7'] },
          { domain: 'b.de', addresses: ['::ffff:203.0.113.10'] },
          { domain: 'local.de', addresses: ['127.0.0.1'] },
        ],
      })
    );
    expect(concerns).toEqual([
      { kind: 'dns_missing', domain: 'a.de' },
      {
        kind: 'dns_elsewhere',
        domain: 'www.a.de',
        addresses: ['198.51.100.7'],
      },
      // Петля — адрес этой машины, но снаружи по нему сертификат не выпустить.
      { kind: 'dns_elsewhere', domain: 'local.de', addresses: ['127.0.0.1'] },
    ]);
    expect(concerns.some(blocking)).toBe(false);
  });

  it('меньше 1 ГиБ без подкачки — предупреждение; с подкачкой — нет', async () => {
    const small = 512 * 1024 ** 2;
    expect(assess(facts({ memory: { total: small, swap: 0 } }))).toEqual([
      { kind: 'low_memory', total: small },
    ]);
    expect(
      assess(facts({ memory: { total: small, swap: 1024 ** 3 } }))
    ).toEqual([]);
    expect(SWAP_COMMANDS.join('\n')).toContain('mkswap /swapfile');
  });

  it('память — из /proc/meminfo, держатель порта — из ss', async () => {
    expect(
      parseMeminfo(
        'MemTotal:         480940 kB\nMemFree: 1 kB\nSwapTotal:             0 kB\n'
      )
    ).toEqual({ total: 480940 * 1024, swap: 0 });
    expect(
      holderOf(
        'LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=812,fd=6),("nginx",pid=811,fd=6))'
      )
    ).toBe('nginx');
    expect(holderOf('LISTEN 0 4096 0.0.0.0:80 0.0.0.0:*')).toBe('');
  });
});

// Машина для сценариев: юниты в памяти, systemctl отвечает по состоянию служб, сайт отвечает,
// когда служба работает и `up` не против. У каждой базы — свои миграции; `migrates` — новая версия
// при запуске переводит базы на свою схему.
type Fake = {
  readonly host: Host;
  readonly calls: string[][];
  readonly files: Map<string, string>;
  readonly out: string[];
  readonly state: {
    active: Set<string>;
    version: string;
    up: (version: string) => boolean;
    /** Что поднявшаяся служба отвечает на /_cms/health. */
    health: (version: string) => number;
    migrates: boolean;
    dbs: Map<string, readonly string[]>;
  };
};

const BASE_MIGRATIONS = ['site/001_settings', 'media/004_image_size'];
const NEW_MIGRATION = 'media/998_from_the_future';

const fake = (overrides: Partial<Host> = {}): Fake => {
  const calls: string[][] = [];
  const files = new Map<string, string>();
  const out: string[] = [];
  const state = {
    active: new Set<string>(),
    version: '0.2.0',
    up: (_: string) => true,
    health: (_: string) => 200,
    migrates: false,
    dbs: new Map<string, readonly string[]>(),
  };
  const live = new Set<string>();
  const ids = (path: string) => state.dbs.get(path) ?? BASE_MIGRATIONS;
  let clock = 0;
  const ran = (out = '', code = 0): Ran => ({ code, out, err: '' });
  const systemctl = (args: readonly string[]): Ran =>
    ((verb, unit) =>
      verb === 'is-active'
        ? ran(state.active.has(unit!) ? 'active\n' : 'inactive\n', 3)
        : verb === 'restart'
          ? (state.active.add(unit!),
            void (
              state.migrates &&
              state.version === '0.2.0' &&
              live.forEach(
                (db) =>
                  void state.dbs.set(db, [
                    ...new Set([...ids(db), NEW_MIGRATION]),
                  ])
              )
            ),
            ran())
          : verb === 'stop'
            ? (state.active.delete(unit!), ran())
            : verb === 'disable'
              ? (state.active.delete(args.at(-1)!), ran())
              : verb === 'show'
                ? ran(
                    [
                      `LoadState=${files.has(`/etc/systemd/system/${unit}`) ? 'loaded' : 'not-found'}`,
                      `FragmentPath=/etc/systemd/system/${unit}`,
                      `ActiveState=${state.active.has(unit!) ? 'active' : 'inactive'}`,
                      'SubState=running',
                      'ActiveEnterTimestamp=Tue 2026-11-03 10:00:00 UTC',
                      `MainPID=${state.active.has(unit!) ? 42 : 0}`,
                      'MemoryCurrent=88080384',
                      'NRestarts=0',
                      'InvocationID=abc',
                    ].join('\n')
                  )
                : ran())(args[0], args[1]);
  const host: Host = {
    platform: 'linux',
    root: true,
    systemd: () => true,
    binary: BINARY,
    standalone: true,
    real: (path) => path,
    mode: () => 0o100755,
    read: (path) => files.get(path) ?? null,
    write: (path, text) =>
      void (calls.push(['write', path]), files.set(path, text)),
    remove: (path) => void (calls.push(['rm', path]), files.delete(path)),
    list: (folder) => [...files.keys()].filter((_) => dirname(_) === folder),
    run: (command) => (
      calls.push([...command]),
      Promise.resolve(
        command[0] === 'systemctl'
          ? systemctl(command.slice(1))
          : command[0] === '/proc/42/exe'
            ? ran(`Eile ${state.version}\n`)
            : command[0] === 'journalctl' && command[1]?.startsWith('_SYSTEMD')
              ? ran(
                  '  Создать администратора: http://a.de/manager/setup?token=tok-123\n'
                )
              : command[0] === 'journalctl'
                ? ran('error: something broke\n')
                : ran(`Eile ${state.version}\n`)
      )
    ),
    attach: (command) => (calls.push([...command]), Promise.resolve(0)),
    probe: (url) => (
      calls.push(['probe', url]),
      Promise.resolve(
        state.active.size > 0 && state.up(state.version)
          ? state.health(state.version)
          : null
      )
    ),
    wait: (ms) => ((clock += ms), Promise.resolve()),
    now: () => clock,
    memory: () => ({ total: 4 * LOW_MEMORY, swap: 0 }),
    addresses: () => ['203.0.113.10'],
    resolve: () => Promise.resolve(['203.0.113.10']),
    mail: () => Promise.resolve(null),
    holder: () => Promise.resolve(null),
    restore: (binary, previous) =>
      void (calls.push(['restore', binary, previous]),
      (state.version = '0.1.0')),
    place: (from, name) => (
      calls.push(['place', from, name]),
      Promise.resolve(`/var/lib/private/${name}/site.db`)
    ),
    snapshot: (db, target) =>
      void (calls.push(['snapshot', db, target]),
      live.add(db),
      state.dbs.set(target, ids(db))),
    migrations: (db) => ids(db),
    putBack: (snapshot, db, aside) =>
      void (calls.push(['putBack', snapshot, db, aside]),
      state.dbs.set(aside, ids(db)),
      state.dbs.set(db, ids(snapshot))),
    ...overrides,
  };
  return { host, calls, files, out, state };
};

const contextOf = (
  machine: Fake,
  argv: readonly string[],
  language: 'ru' | 'en' = 'ru'
): Context =>
  ((parsed) => ({
    args: parsed.args,
    options: parsed.options,
    paint: plain,
    language,
    tty: false,
    out: (_) => void machine.out.push(_),
  }))(
    ((_) => ('options' in _ ? _ : fail('test.args', _.error)))(
      parseInvocation(argv, {})
    )
  );

const run = (machine: Fake, argv: readonly string[], language?: 'ru' | 'en') =>
  runService(contextOf(machine, ['service', ...argv], language), machine.host);

const systemctlCalls = (machine: Fake): string[] =>
  machine.calls
    .filter(
      (_) => _[0] === 'systemctl' && !['show', 'is-active'].includes(_[1]!)
    )
    .map((_) => _.slice(1).join(' '));

describe('cms service install', () => {
  it('ставит юнит, включает, перезапускает, ждёт ответа и печатает адреса и ссылку администратора', async () => {
    const machine = fake();
    await run(machine, ['install', '--domain', 'a.de,www.a.de']);
    expect(machine.files.get('/etc/systemd/system/cms.service')).toContain(
      `ExecStart=${BINARY} serve --domain a.de,www.a.de`
    );
    expect(systemctlCalls(machine)).toEqual([
      'daemon-reload',
      'enable cms.service',
      'reset-failed cms.service',
      'restart cms.service',
    ]);
    const text = machine.out.join('\n');
    expect(text).toContain('Служба cms работает: Eile 0.2.0');
    expect(text).toContain('https://a.de/manager');
    expect(text).toContain('/var/lib/cms/site.db');
    expect(text).toContain('http://a.de/manager/setup?token=tok-123');
  });

  it('администратор уже есть: ни ссылки, ни подсказки про журнал; журнал не читается — подсказка', async () => {
    const withJournal = (journal: { code: number; out: string }): Fake =>
      ((machine) =>
        ((base) => (
          ((machine.host as { run: Host['run'] }).run = (command) =>
            command[0] === 'journalctl' && command[1]?.startsWith('_SYSTEMD')
              ? Promise.resolve({ ...journal, err: '' })
              : base(command)),
          machine
        ))(machine.host.run))(fake());
    const admin = withJournal({ code: 0, out: '  Site  http://a.de/\n' });
    await run(admin, ['install', '--trust-proxy']);
    expect(admin.out.join('\n')).not.toContain('manager/setup');
    expect(admin.out.join('\n')).not.toContain('Администратора ещё нет');
    const unread = withJournal({ code: 1, out: '' });
    await run(unread, ['install', '--trust-proxy']);
    expect(unread.out.join('\n')).toContain('Администратора ещё нет');
  });

  it('повтор с тем же юнитом ничего не меняет и не перезапускает', async () => {
    const machine = fake();
    await run(machine, ['install', '--trust-proxy']);
    machine.calls.length = 0;
    machine.out.length = 0;
    // Язык другой — комментарии другие, юнит тот же.
    await run(machine, ['install', '--trust-proxy'], 'en');
    expect(machine.calls.some((_) => _[0] === 'write')).toBe(false);
    expect(systemctlCalls(machine)).toEqual(['enable cms.service']);
    expect(machine.out.join('\n')).toContain('already installed and running');
  });

  it('другой юнит с тем же именем — только с --force', async () => {
    const machine = fake();
    machine.files.set(
      '/etc/systemd/system/cms.service',
      '[Service]\nExecStart=/usr/local/bin/cms --domain old.de\n'
    );
    await expect(run(machine, ['install', '--domain', 'a.de'])).rejects.toThrow(
      'уже другой юнит'
    );
    expect(machine.calls.some((_) => _[0] === 'write')).toBe(false);
    await run(machine, ['install', '--domain', 'a.de', '--force']);
    expect(machine.files.get('/etc/systemd/system/cms.service')).toContain(
      '--domain a.de'
    );
    expect(systemctlCalls(machine)).toContain('restart cms.service');
  });

  it('не root — точная строка для sudo, система не тронута', async () => {
    const machine = fake({ root: false });
    await expect(
      run(machine, ['install', '--domain', 'a.de', '--email', 'me@a.de'])
    ).rejects.toThrow(
      `sudo ${BINARY} service install --domain a.de --email me@a.de`
    );
    expect(machine.calls).toEqual([]);
  });

  it('без systemd — не поддерживается, ссылка на README', async () => {
    await expect(
      run(fake({ platform: 'darwin' }), ['install', '--trust-proxy'])
    ).rejects.toThrow('README');
    await expect(
      run(fake({ systemd: () => false }), ['install', '--trust-proxy'], 'en')
    ).rejects.toThrow('no systemd here');
  });

  it('на Windows — любая подкоманда, даже --print: «не на Windows», ссылка на README', async () => {
    const machine = fake({ platform: 'win32', systemd: () => false });
    await expect(
      run(machine, ['install', '--trust-proxy', '--print'])
    ).rejects.toThrow('а это Windows');
    await expect(run(machine, ['status'], 'en')).rejects.toThrow(
      'README, “On Windows”'
    );
    expect(machine.calls).toEqual([]);
  });

  it('бинарник, которого службе не видно или не запустить, — отказ с командой', async () => {
    await expect(
      run(fake({ binary: '/home/anna/.local/bin/cms' }), [
        'install',
        '--trust-proxy',
      ])
    ).rejects.toThrow('sudo install -m 755 /home/anna/.local/bin/cms');
    await expect(
      run(fake({ mode: () => 0o100700 }), ['install', '--trust-proxy'])
    ).rejects.toThrow('chmod 755');
  });

  it('--print печатает юнит и ничего не трогает — и без root, и из исходников', async () => {
    const machine = fake({
      root: false,
      standalone: false,
      platform: 'darwin',
    });
    await run(machine, ['install', '--trust-proxy', '--print']);
    expect(machine.calls).toEqual([]);
    expect(machine.out.join('\n')).toContain(
      'ExecStart=/usr/local/bin/cms serve --trust-proxy'
    );
    await expect(
      run(fake({ standalone: false }), ['install', '--trust-proxy'])
    ).rejects.toThrow('из исходников');
  });

  it('порт занят nginx — отказ с подсказкой --trust-proxy', async () => {
    const machine = fake({
      holder: (port) => Promise.resolve(port === 80 ? 'nginx' : null),
    });
    await expect(run(machine, ['install', '--domain', 'a.de'])).rejects.toThrow(
      'Служба не установлена'
    );
    expect(machine.out.join('\n')).toContain('Порт 80 занят: nginx');
    expect(machine.out.join('\n')).toContain('--trust-proxy');
    expect(machine.calls.some((_) => _[0] === 'write')).toBe(false);
  });

  it('домен не сюда и мало памяти — предупреждения, установка идёт', async () => {
    const machine = fake({
      resolve: () => Promise.resolve(['198.51.100.7']),
      memory: () => ({ total: 480 * 1024 ** 2, swap: 0 }),
    });
    await run(machine, ['install', '--domain', 'a.de']);
    const text = machine.out.join('\n');
    expect(text).toContain('a.de указывает на 198.51.100.7');
    expect(text).toContain('Памяти 480 МБ');
    expect(text).toContain('sudo fallocate -l 1G /swapfile');
    expect(text).toContain('Служба cms работает');
  });

  it('почта домена уедет вслед за сайтом — предупреждение со ссылкой на cms diagnose domain, установка идёт', async () => {
    const asked: string[] = [];
    const machine = fake({
      mail: (domain) => (
        asked.push(domain),
        Promise.resolve(
          domain === 'a.de'
            ? { domain, mx: true, spf: true, already: false }
            : { domain, mx: false, spf: false, already: false }
        )
      ),
    });
    await run(machine, ['install', '--domain', 'a.de,www.a.de']);
    const text = machine.out.join('\n');
    expect(asked).toEqual(['a.de', 'www.a.de']);
    expect(text).toContain(
      'Почта a.de уйдёт вслед за сайтом: MX указывает на сам домен, и письма для @a.de придут сюда, где почтового сервера нет; SPF через a и mx перестанет пропускать старый почтовый сервер. Что поправить в DNS — cms diagnose domain a.de'
    );
    expect(text).not.toContain('Почта www.a.de');
    expect(text).toContain('Служба cms работает');
  });

  it('работающая служба держит свои порты сама — их не проверяем', async () => {
    const machine = fake({ holder: () => Promise.resolve('cms') });
    machine.state.active.add('cms.service');
    machine.files.set(
      '/etc/systemd/system/cms.service',
      '[Service]\nExecStart=/usr/local/bin/cms --domain old.de\n'
    );
    await run(machine, ['install', '--domain', 'a.de', '--force']);
    expect(machine.out.join('\n')).not.toContain('занят');
  });

  it('--from кладёт базу до запуска службы', async () => {
    const machine = fake();
    await run(machine, ['install', '--trust-proxy', '--from', 'site.db']);
    const order = machine.calls.map((_) => _.join(' '));
    expect(order.indexOf('place site.db cms')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('place site.db cms')).toBeLessThan(
      order.indexOf('systemctl restart cms.service')
    );
    expect(machine.out.join('\n')).toContain(
      'site.db → /var/lib/private/cms/site.db'
    );
  });

  it('ждёт 200 от /_cms/health на HTTP-порту службы', async () => {
    const machine = fake();
    await run(machine, ['install', '--domain', 'a.de']);
    expect(machine.calls).toContainEqual([
      'probe',
      'http://127.0.0.1:80/_cms/health',
    ]);
    const proxied = fake();
    await run(proxied, ['install', '--trust-proxy', '--port', '9000']);
    expect(proxied.calls).toContainEqual([
      'probe',
      'http://127.0.0.1:9000/_cms/health',
    ]);
  });

  it('служба отвечает, но не читает базу (503) — журнал и отказ', async () => {
    const machine = fake();
    machine.state.health = () => 503;
    await expect(run(machine, ['install', '--trust-proxy'])).rejects.toThrow(
      'не может прочитать базу: /_cms/health — 503'
    );
    expect(machine.out.join('\n')).toContain('error: something broke');
  });

  it('404 вместо проверки у этого же бинарника — отказ: на порту не он', async () => {
    const machine = fake();
    machine.state.health = () => 404;
    await expect(
      run(machine, ['install', '--trust-proxy'], 'en')
    ).rejects.toThrow('answers /_cms/health with 404, not 200');
  });

  it('сайт не ответил — строки журнала и отказ', async () => {
    const machine = fake();
    machine.state.up = () => false;
    await expect(run(machine, ['install', '--trust-proxy'])).rejects.toThrow(
      'не ответила за 30 с'
    );
    expect(machine.out.join('\n')).toContain('error: something broke');
  });
});

describe('cms service status, restart, logs, uninstall', () => {
  const installed = async () => {
    const machine = fake();
    await run(machine, ['install', '--domain', 'a.de']);
    machine.calls.length = 0;
    machine.out.length = 0;
    return machine;
  };

  it('status: состояние, с какого времени, версия, адрес, память', async () => {
    const machine = await installed();
    await run(machine, ['status']);
    const text = machine.out.join('\n');
    expect(text).toContain('cms  active (running)');
    expect(text).toContain('Tue 2026-11-03 10:00:00 UTC');
    expect(text).toContain('Eile 0.2.0');
    expect(text).toContain('https://a.de/');
    expect(text).toContain('84 МБ');
  });

  it('status: файл новее работающей версии — подсказка перезапустить', async () => {
    const machine = await installed();
    const host: Host = {
      ...machine.host,
      run: (command) =>
        command[0] === BINARY
          ? Promise.resolve({ code: 0, out: 'Eile 0.3.0\n', err: '' })
          : machine.host.run(command),
    };
    await runService(contextOf(machine, ['service', 'status']), host);
    expect(machine.out.join('\n')).toContain(
      'Eile 0.2.0 · файл уже Eile 0.3.0'
    );
  });

  it('status: службы нет или она стоит — код выхода 1', async () => {
    await expect(run(fake(), ['status'])).rejects.toThrow('Службы cms нет');
    const machine = await installed();
    machine.state.active.clear();
    await expect(run(machine, ['status'])).rejects.toThrow(
      'не работает: inactive'
    );
  });

  it('restart: перезапуск с проверкой ответа', async () => {
    const machine = await installed();
    await run(machine, ['restart']);
    expect(systemctlCalls(machine)).toEqual([
      'reset-failed cms.service',
      'restart cms.service',
    ]);
    expect(machine.out.join('\n')).toContain(
      'Служба cms перезапущена: Eile 0.2.0'
    );
    await expect(run(fake({ root: false }), ['restart'])).rejects.toThrow(
      `sudo ${BINARY} service restart`
    );
  });

  it('restart: юнит запускает другой файл старше /_cms/health — ему хватает любого ответа, кроме 503', async () => {
    const machine = fake();
    machine.files.set(
      '/etc/systemd/system/cms.service',
      renderUnit(planService(options(['--trust-proxy']), '/opt/old/cms'), 'ru')
    );
    machine.state.health = () => 404;
    const older = (version: string): Host => ({
      ...machine.host,
      run: (command) =>
        command[0] === '/opt/old/cms'
          ? Promise.resolve({ code: 0, out: `Eile ${version}\n`, err: '' })
          : machine.host.run(command),
    });
    await runService(
      contextOf(machine, ['service', 'restart']),
      older('0.1.0-alpha.8')
    );
    expect(machine.out.join('\n')).toContain('Служба cms перезапущена');
    await expect(
      runService(contextOf(machine, ['service', 'restart']), older('0.2.0'))
    ).rejects.toThrow('кодом 404');
    machine.state.health = () => 503;
    await expect(
      runService(
        contextOf(machine, ['service', 'restart']),
        older('0.1.0-alpha.8')
      )
    ).rejects.toThrow('не может прочитать базу');
  });

  it('logs: journalctl по юниту, -f — следить', async () => {
    const machine = fake();
    await run(machine, ['logs', '-f', '--name', 'shop']);
    expect(machine.calls).toEqual([
      ['journalctl', '-u', 'shop.service', '-f', '-n', '50'],
    ]);
  });

  it('uninstall: останавливает и удаляет юнит, данные остаются', async () => {
    const machine = await installed();
    await run(machine, ['uninstall']);
    expect(machine.files.has('/etc/systemd/system/cms.service')).toBe(false);
    expect(systemctlCalls(machine)).toEqual([
      'disable --now cms.service',
      'daemon-reload',
      'reset-failed cms.service',
    ]);
    const text = machine.out.join('\n');
    expect(text).toContain('/var/lib/cms');
    expect(text).toContain('/var/cache/cms');
    expect(text).toContain('sudo rm -rf /var/lib/cms /var/cache/cms');
  });

  it('uninstall: чужой юнит с тем же именем не трогает; нет юнита — нечего удалять', async () => {
    const machine = fake();
    machine.files.set(
      '/etc/systemd/system/cms.service',
      '[Service]\nExecStart=/usr/bin/other-cms\n'
    );
    await expect(run(machine, ['uninstall'])).rejects.toThrow('не этот cms');
    expect(machine.files.has('/etc/systemd/system/cms.service')).toBe(true);
    const empty = fake();
    await run(empty, ['uninstall']);
    expect(empty.out.join('\n')).toContain('удалять нечего');
  });

  it('неизвестная подкоманда — список', async () => {
    await expect(run(fake(), ['start'])).rejects.toThrow(
      'install, status, logs, restart, uninstall'
    );
  });
});

describe('cms update и служба', () => {
  // Две службы на этом бинарнике и одна на другом; работают все.
  const machine = () =>
    ((_) => (
      _.files.set(
        '/etc/systemd/system/cms.service',
        renderUnit(plan(['--domain', 'a.de']), 'ru')
      ),
      _.files.set(
        '/etc/systemd/system/shop.service',
        renderUnit(plan(['--trust-proxy', '--name', 'shop']), 'ru')
      ),
      _.files.set(
        '/etc/systemd/system/other.service',
        renderUnit(
          planService(
            options(['--trust-proxy', '--name', 'other']),
            '/opt/cms'
          ),
          'ru'
        )
      ),
      ['cms.service', 'shop.service', 'other.service'].forEach(
        (unit) => void _.state.active.add(unit)
      ),
      _
    ))(fake());

  const update = (machine: Fake) =>
    restartServices({
      host: machine.host,
      binary: BINARY,
      previous: `${BINARY}.old`,
      version: '0.2.0',
      current: '0.1.0',
    });

  const at = (box: Fake, call: string) =>
    box.calls.map((_) => _.join(' ')).indexOf(call);

  it('снимает копию каждой базы, перезапускает службы этого бинарника и проверяет новую версию', async () => {
    const box = machine();
    const result = await update(box);
    expect(result).toEqual({
      status: 'restarted',
      services: ['cms', 'shop'],
      snapshots: [
        '/var/lib/cms/site.db.before-0.1.0',
        '/var/lib/shop/site.db.before-0.1.0',
      ],
    });
    // Копии — до первого перезапуска, обе.
    const restart = at(box, 'systemctl restart cms.service');
    expect(
      at(box, 'snapshot /var/lib/cms/site.db /var/lib/cms/site.db.before-0.1.0')
    ).toBeLessThan(restart);
    expect(
      at(
        box,
        'snapshot /var/lib/shop/site.db /var/lib/shop/site.db.before-0.1.0'
      )
    ).toBeLessThan(restart);
    expect(systemctlCalls(box)).not.toContain('restart other.service');
    expect(box.calls.some((_) => _[0] === 'restore')).toBe(false);
    expect(
      restartReport(plain, 'ru', result, {
        version: '0.2.0',
        current: '0.1.0',
      }).lines.join('\n')
    ).toContain('копия базы до обновления — /var/lib/cms/site.db.before-0.1.0');
  });

  it('копия не снялась — ни одна служба не перезапущена, прежний бинарник на месте', async () => {
    const box = machine();
    const host: Host = {
      ...box.host,
      snapshot: (db, target) =>
        db.includes('/shop/')
          ? fail('test.disk', 'database or disk is full')
          : box.host.snapshot(db, target),
    };
    const result = await restartServices({
      host,
      binary: BINARY,
      previous: `${BINARY}.old`,
      version: '0.2.0',
      current: '0.1.0',
    });
    expect(result).toEqual({
      status: 'unsafe',
      name: 'shop',
      error: 'database or disk is full',
    });
    expect(systemctlCalls(box)).toEqual([]);
    expect(box.calls).toContainEqual(['restore', BINARY, `${BINARY}.old`]);
    const report = restartReport(plain, 'ru', result, {
      version: '0.2.0',
      current: '0.1.0',
    });
    expect(report.lines.join('\n')).toContain(
      'Копия базы службы shop перед обновлением не снялась: database or disk is full'
    );
    expect(report.lines.join('\n')).toContain('сайт работает на 0.1.0');
    expect(report.error).toContain('Обновление не применено');
  });

  it('база без пути в юните — тоже не перезапускает', async () => {
    const box = fake();
    box.files.set(
      '/etc/systemd/system/cms.service',
      `[Service]\nExecStart=${BINARY} --domain a.de\n`
    );
    box.state.active.add('cms.service');
    expect(await update(box)).toMatchObject({
      status: 'unsafe',
      name: 'cms',
      error: expect.stringContaining('CMS_DB'),
    });
    expect(systemctlCalls(box)).toEqual([]);
  });

  it('новая версия перевела базы на свою схему и не поднялась — базы снова копии, затем прежний бинарник', async () => {
    const box = machine();
    box.state.migrates = true;
    box.state.up = (version) => version !== '0.2.0';
    const result = await update(box);
    expect(result).toMatchObject({
      status: 'rolled_back',
      services: ['cms', 'shop'],
      failed: [
        { name: 'cms', running: null },
        { name: 'shop', running: null },
      ],
      restored: [
        {
          name: 'cms',
          snapshot: '/var/lib/cms/site.db.before-0.1.0',
          aside: '/var/lib/cms/site.db.failed-0.2.0',
          error: null,
        },
        {
          name: 'shop',
          snapshot: '/var/lib/shop/site.db.before-0.1.0',
          aside: '/var/lib/shop/site.db.failed-0.2.0',
          error: null,
        },
      ],
    });
    // Порядок: служба стоит → база возвращена → прежний бинарник → запуск.
    const putBack = at(
      box,
      'putBack /var/lib/cms/site.db.before-0.1.0 /var/lib/cms/site.db /var/lib/cms/site.db.failed-0.2.0'
    );
    expect(at(box, 'systemctl stop cms.service')).toBeLessThan(putBack);
    expect(putBack).toBeLessThan(at(box, `restore ${BINARY} ${BINARY}.old`));
    expect(box.state.dbs.get('/var/lib/cms/site.db')).toEqual(BASE_MIGRATIONS);
    expect(box.state.dbs.get('/var/lib/cms/site.db.failed-0.2.0')).toContain(
      NEW_MIGRATION
    );
    const text = restartReport(plain, 'ru', result, {
      version: '0.2.0',
      current: '0.1.0',
    }).lines.join('\n');
    expect(text).toContain(
      'база cms — снова копия, снятая перед обновлением в'
    );
    expect(text).toContain('лежит в /var/lib/cms/site.db.failed-0.2.0');
  });

  it('база не менялась — откат её не трогает', async () => {
    const box = machine();
    box.state.up = (version) => version !== '0.2.0';
    const result = await update(box);
    expect(result).toMatchObject({ status: 'rolled_back', restored: [] });
    expect(box.calls.some((_) => _[0] === 'putBack')).toBe(false);
    expect(box.calls).toContainEqual(['restore', BINARY, `${BINARY}.old`]);
  });

  it('ответила, но не той версией — тоже откат', async () => {
    const box = machine();
    const host: Host = {
      ...box.host,
      run: (command) =>
        command[0] === '/proc/42/exe' && box.state.version === '0.2.0'
          ? Promise.resolve({ code: 0, out: 'Eile 0.1.0\n', err: '' })
          : box.host.run(command),
    };
    const result = await restartServices({
      host,
      binary: BINARY,
      previous: `${BINARY}.old`,
      version: '0.2.0',
      current: '0.1.0',
    });
    expect(result).toMatchObject({
      status: 'rolled_back',
      failed: [
        { name: 'cms', running: 'Eile 0.1.0' },
        { name: 'shop', running: 'Eile 0.1.0' },
      ],
    });
  });

  it('новая версия отвечает 503 — базу не читает: откат, и в итоге сказано почему', async () => {
    const box = machine();
    box.state.health = (version) => (version === '0.2.0' ? 503 : 200);
    const result = await update(box);
    expect(result).toMatchObject({
      status: 'rolled_back',
      failed: [
        { name: 'cms', running: null, status: 503 },
        { name: 'shop', running: null, status: 503 },
      ],
    });
    expect(
      restartReport(plain, 'ru', result, {
        version: '0.2.0',
        current: '0.1.0',
      }).lines.join('\n')
    ).toContain('cms: отвечает, но не может прочитать базу');
  });

  it('откат на версию до /_cms/health: ей хватает любого ответа, как раньше', async () => {
    const box = machine();
    box.state.up = (version) => version !== '0.2.0';
    box.state.health = () => 404;
    const host: Host = {
      ...box.host,
      restore: (binary, previous) =>
        void (box.calls.push(['restore', binary, previous]),
        (box.state.version = '0.1.0-alpha.8')),
    };
    const result = await restartServices({
      host,
      binary: BINARY,
      previous: `${BINARY}.old`,
      version: '0.2.0',
      current: '0.1.0-alpha.8',
    });
    expect(result.status).toBe('rolled_back');
  });

  it('с какой версии ждём /_cms/health', () => {
    expect(expectsHealth('0.1.0-alpha.8')).toBe(false);
    expect(expectsHealth('0.1.0-alpha.9')).toBe(true);
    expect(expectsHealth('Eile 0.2.0\n')).toBe(true);
    expect(expectsHealth(null)).toBe(false);
    expect(expectsHealth('garbage')).toBe(false);
  });

  it('и прежняя не поднялась — так и говорит', async () => {
    const box = machine();
    box.state.up = () => false;
    const result = await update(box);
    expect(result.status).toBe('broken');
    expect(
      restartReport(plain, 'en', result, {
        version: '0.2.0',
        current: '0.1.0',
      }).lines.join('\n')
    ).toContain('the services are silent too');
  });

  it('не root, остановленная служба или без systemd — службы не трогает', async () => {
    const box = machine();
    box.state.active.clear();
    expect(await update(box)).toEqual({ status: 'none' });
    expect(systemctlCalls(box)).toEqual([]);
    expect(box.calls.some((_) => _[0] === 'snapshot')).toBe(false);
    const user = fake({ root: false });
    expect(
      await restartServices({
        host: user.host,
        binary: BINARY,
        previous: `${BINARY}.old`,
        version: '0.2.0',
        current: '0.1.0',
      })
    ).toEqual({ status: 'none' });
    expect(user.calls).toEqual([]);
    expect(
      restartReport(
        plain,
        'ru',
        { status: 'none' },
        {
          version: '0.2.0',
          current: '0.1.0',
        }
      ).lines.join('\n')
    ).toContain('Перезапустите сервер');
  });
});

// Каталоги, права и владелец базы службы — Linux; на Windows cms service нет.
describe.skipIf(WINDOWS)('перенос базы в службу', () => {
  let n = 0;
  const fresh = () => join(dir, `case-${++n}`);

  it('каталог службы: нет — private/<имя> с правами 700; есть ссылка systemd — по ней', async () => {
    const root = fresh();
    const created = stateDir(root, 'cms');
    expect(created).toBe(join(root, 'private', 'cms'));
    expect(statSync(created).mode & 0o777).toBe(0o700);
    expect(statSync(join(root, 'private')).mode & 0o777).toBe(0o700);
    const other = fresh();
    mkdirSync(join(other, 'private', 'shop'), { recursive: true });
    symlinkSync('private/shop', join(other, 'shop'));
    expect(stateDir(other, 'shop')).toBe(join(other, 'private', 'shop'));
  });

  it('снимок работающей базы со всем из WAL; схема проверена, права 600', async () => {
    const root = fresh();
    mkdirSync(root, { recursive: true });
    const source = join(root, 'home.db');
    const app = createApp({ databasePath: source, scaffold: DEMO });
    const pages = app.content.drafts.tree().length;
    // Сервер ещё работает: свежие записи — в WAL рядом с базой.
    const target = await placeDatabase(source, stateDir(root, 'cms'));
    app.close();
    expect(target).toBe(join(root, 'private', 'cms', 'site.db'));
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(statSync(target).uid).toBe(statSync(dirname(target)).uid);
    const copy = createApp({ databasePath: target });
    expect(copy.content.drafts.tree()).toHaveLength(pages);
    copy.close();
  });

  it('своя база службы не заменяется; не база и чужая база — отказ', async () => {
    const root = fresh();
    mkdirSync(root, { recursive: true });
    const source = join(root, 'home.db');
    createApp({ databasePath: source }).close();
    const target = stateDir(root, 'cms');
    await placeDatabase(source, target);
    const code = (promise: Promise<unknown>) =>
      promise.then(
        () => 'ok',
        (error) => (isDomainError(error) ? error.code : String(error))
      );
    expect(await code(placeDatabase(source, target))).toBe(
      'service.has_database'
    );
    expect(
      await code(placeDatabase(join(root, 'missing.db'), stateDir(root, 'x')))
    ).toBe('service.no_source');
    writeFileSync(join(root, 'notes.txt'), 'not a database at all');
    expect(
      await code(placeDatabase(join(root, 'notes.txt'), stateDir(root, 'y')))
    ).toBe('service.not_database');
    const foreign = join(root, 'foreign.db');
    const db = new Database(foreign);
    db.run('CREATE TABLE t (x)');
    db.close();
    const z = stateDir(root, 'z');
    expect(await code(placeDatabase(foreign, z))).toBe('backup.foreign');
    expect(await Bun.file(join(z, 'site.db')).exists()).toBe(false);
  });
});

describe.skipIf(WINDOWS)('база службы при обновлении', () => {
  const folder = () => mkdtempSync(join(dir, 'update-'));

  it('снимок работающей базы — рядом с ней, права 600, владелец базы; прежний снимок уходит', () => {
    const db = join(folder(), 'site.db');
    const app = createApp({ databasePath: db, scaffold: DEMO });
    writeFileSync(`${db}.before-0.0.9`, 'older');
    snapshotDatabase(db, `${db}.before-0.1.0`);
    expect(existsSync(`${db}.before-0.0.9`)).toBe(false);
    expect(statSync(`${db}.before-0.1.0`).mode & 0o777).toBe(0o600);
    expect(statSync(`${db}.before-0.1.0`).uid).toBe(statSync(db).uid);
    expect(appliedMigrations(`${db}.before-0.1.0`)).toEqual(
      appliedMigrations(db)
    );
    expect(appliedMigrations(join(dirname(db), 'missing.db'))).toBeNull();
    app.close();
  });

  it('возврат: снимок встаёт на место с правами базы, прежняя база со своим WAL — рядом', () => {
    const db = join(folder(), 'site.db');
    createApp({ databasePath: db, scaffold: DEMO }).close();
    snapshotDatabase(db, `${db}.before-0.1.0`);
    const before = appliedMigrations(db)!;
    // Новая версия перевела базу на свою схему и упала, оставив WAL.
    const sqlite = new Database(db);
    sqlite.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [
      NEW_MIGRATION,
      new Date().toISOString(),
    ]);
    sqlite.close();
    writeFileSync(`${db}-wal`, '');
    writeFileSync(`${db}-shm`, '');
    chmodSync(db, 0o640);
    putBackDatabase(`${db}.before-0.1.0`, db, `${db}.failed-0.2.0`);
    expect(appliedMigrations(db)).toEqual(before);
    expect(statSync(db).mode & 0o777).toBe(0o640);
    expect(existsSync(`${db}-wal`)).toBe(false);
    expect(existsSync(`${db}-shm`)).toBe(false);
    expect(existsSync(`${db}.failed-0.2.0-wal`)).toBe(true);
    expect(appliedMigrations(`${db}.failed-0.2.0`)).toContain(NEW_MIGRATION);
    // Снимок остаётся: им можно вернуться ещё раз.
    expect(existsSync(`${db}.before-0.1.0`)).toBe(true);
    const back = createApp({ databasePath: db });
    expect(back.content.drafts.tree().length).toBeGreaterThan(0);
    back.close();
  });

  it('базу из более новой версии программа не открывает: ясный отказ вместо полуживого сайта', () => {
    const db = join(folder(), 'site.db');
    createApp({ databasePath: db }).close();
    const sqlite = new Database(db);
    sqlite.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [
      'media/999_future',
      new Date().toISOString(),
    ]);
    sqlite.close();
    const error = attempt(
      () => (createApp({ databasePath: db }).close(), null),
      (_) => _
    );
    expect(isDomainError(error) && error.code).toBe('database.newer');
    expect(isDomainError(error) && error.message).toContain('media/999_future');
    expect(explain(error, 'ru')).toContain('более новая версия');
    expect(explain(error, 'en')).toContain('newer version');
    // Отказ не оставил базу открытой и ничего в ней не тронул.
    expect(appliedMigrations(db)).toContain('media/999_future');
  });
});
