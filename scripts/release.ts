import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { VERSION } from '../src/cli/version.ts';
import { HEALTH_PATH } from '../src/health.ts';
import { zip } from '../src/platform/zip.ts';
import type { WindowsInfo } from './binary.ts';

// Сборка релиза для GitHub (.github/workflows/release.yml):
//   bun scripts/release.ts build [цель…]          dist/release/cms-<цель>; без целей — все
//   bun scripts/release.ts pack --repo owner/name  сжатые копии, пакеты каркасов, SHA256SUMS, install.sh и install.ps1
//   bun scripts/release.ts packages [--out <папка>] только пакеты каркасов packages/*/ и их SHA256SUMS
//   bun scripts/release.ts smoke <бинарник>        пробный запуск: version и /_cms/health на временной базе
//   bun scripts/release.ts check-tag v0.1.0        тег совпадает с версией программы

/** Цели релиза: имя файла → платформа Bun. Сборки Windows — `cms-windows-*.exe` (ADR 0049). */
export var TARGETS: Readonly<Record<string, string>> = {
  'linux-x64': 'bun-linux-x64',
  'linux-arm64': 'bun-linux-arm64',
  'linux-x64-musl': 'bun-linux-x64-musl',
  'linux-arm64-musl': 'bun-linux-arm64-musl',
  'darwin-x64': 'bun-darwin-x64',
  'darwin-arm64': 'bun-darwin-arm64',
  'windows-x64': 'bun-windows-x64',
  'windows-arm64': 'bun-windows-arm64',
};

// Сборка (binary.ts тянет компилятор Svelte, icon.ts — resvg) грузится только для build, проверка пакетов
// каркасов — только для pack и packages: smoke и check-tag в CI идут без `bun install`.
const ROOT = resolve(import.meta.dir, '..');
const OUT = resolve(ROOT, 'dist/release');
const _REPO = /^[\w.-]+\/[\w.-]+$/;

const _fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const _sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

// Цели по очереди: каждая — около 110 МБ, вместе они не нужны в памяти.
const _sequence = <T>(
  items: readonly T[],
  step: (item: T) => Promise<unknown>
) =>
  items.reduce<Promise<unknown>>(
    (chain, item) => chain.then(() => step(item)),
    Promise.resolve()
  );

const _isWindows = (name: string): boolean => name.startsWith('windows-');

// Значок и сведения о файле Bun вписывает, только когда собирает на самой Windows. Кросс-сборка с Linux или
// macOS запускается и годится для проверки (под wine тоже), но релиз собирают раннеры Windows.
const _windowsFor = (
  names: readonly string[]
): Promise<WindowsInfo | undefined> =>
  names.some(_isWindows) && process.platform === 'win32'
    ? Promise.all([import('./binary.ts'), import('./icon.ts')]).then(
        ({ 0: { windowsInfo }, 1: { writeIcon } }) =>
          writeIcon().then((icon) => windowsInfo(icon, VERSION))
      )
    : Promise.resolve(undefined);

const _built = (name: string, windows: WindowsInfo | undefined): string =>
  _isWindows(name) && !windows
    ? `dist/release/cms-${name}.exe (no icon and file details: Bun adds them only when building on Windows; release builds come from the Windows runners)`
    : `dist/release/cms-${name}${_isWindows(name) ? '.exe' : ''}`;

const build = (names: readonly string[]): Promise<unknown> =>
  ((targets) =>
    ((unknown) =>
      unknown.length > 0
        ? _fail(
            `Unknown targets: ${unknown.join(', ')}. Known: ${Object.keys(TARGETS).join(', ')}`
          )
        : Promise.all([import('./binary.ts'), _windowsFor(targets)]).then(
            ({ 0: { compile, prepareEntry }, 1: windows }) =>
              prepareEntry().then(() =>
                _sequence(targets, (name) =>
                  compile(
                    resolve(
                      OUT,
                      `cms-${name}${_isWindows(name) ? '.exe' : ''}`
                    ),
                    TARGETS[name],
                    _isWindows(name) ? windows : undefined
                  ).then(() => console.log(_built(name, windows)))
                )
              )
          ))(targets.filter((_) => !(_ in TARGETS))))(
    names.length > 0 ? names : Object.keys(TARGETS)
  );

// Сжатая копия и строка SHA256SUMS для неё; сам бинарник в релиз не идёт. Для Windows — .zip с cms.exe
// внутри: его открывает Проводник любой Windows, а .gz распаковался бы в файл без .exe (ADR 0049).
const _ARCHIVE: Readonly<
  Record<
    'gz' | 'zip',
    {
      readonly name: (file: string) => string;
      readonly pack: (bytes: Uint8Array) => Uint8Array;
    }
  >
> = {
  gz: {
    name: (file) => `${file}.gz`,
    pack: (bytes) => Bun.gzipSync(new Uint8Array(bytes), { level: 6 }),
  },
  zip: {
    name: (file) => file.replace(/\.exe$/, '.zip'),
    pack: (bytes) => zip([{ name: 'cms.exe', data: bytes }]),
  },
};

const _packOne = (name: string): Promise<string> =>
  ((format) =>
    Bun.file(resolve(OUT, name))
      .bytes()
      .then(format.pack)
      .then((packed) =>
        Bun.write(resolve(OUT, format.name(name)), packed).then(
          () => `${_sha256(packed)}  ${format.name(name)}`
        )
      ))(_ARCHIVE[name.endsWith('.exe') ? 'zip' : 'gz']);

// Официальные пакеты каркасов (ADR 0056): packages/<имя>/ → <имя>.zip рядом с бинарниками и строка в SHA256SUMS.
// Пакет проверяется так же, как перед установкой, и без плагинов; проверке нужен компилятор Svelte, поэтому
// pack идёт после `bun install`. Архив один и тот же на любой машине: его сумму повторит `cms scaffold pack`.
const PACKAGES = resolve(ROOT, 'packages');

const _packPackages = (out: string): Promise<string[]> =>
  Promise.all([
    import('../src/scaffolds/package/index.ts'),
    Array.fromAsync(new Bun.Glob('*/manifest.json').scan(PACKAGES)),
  ]).then(({ 0: { buildPackage }, 1: manifests }) =>
    manifests
      .map((_) => basename(dirname(resolve(PACKAGES, _))))
      .sort()
      .reduce<Promise<string[]>>(
        (chain, name) =>
          chain.then((lines) =>
            ((built) =>
              'problems' in built
                ? _fail(
                    `packages/${name}: ${built.problems.map((_) => `${_.file} ${_.message}`).join('; ')}`
                  )
                : built.manifest.name !== name
                  ? _fail(
                      `packages/${name}: manifest.json names it "${built.manifest.name}"`
                    )
                  : Bun.write(resolve(out, `${name}.zip`), built.bytes).then(
                      () => [...lines, `${built.sha256}  ${name}.zip`]
                    ))(
              buildPackage(resolve(PACKAGES, name), {
                language: 'en',
                plugins: false,
              })
            )
          ),
        Promise.resolve([])
      )
  );

const packages = (out: string): Promise<unknown> =>
  _packPackages(out).then((lines) =>
    Bun.write(resolve(out, 'SHA256SUMS'), `${lines.join('\n')}\n`).then(() =>
      console.log(lines.join('\n'))
    )
  );

// Установщики — с адресом этого репозитория вместо метки: install.sh для Linux и macOS, install.ps1 для Windows.
const _INSTALLERS = ['install.sh', 'install.ps1'];

const pack = (repo: string): Promise<unknown> =>
  _REPO.test(repo)
    ? Array.fromAsync(new Bun.Glob('cms-*').scan(OUT))
        .then((files) =>
          files.filter((_) => !_.endsWith('.gz') && !_.endsWith('.zip')).sort()
        )
        .then((raw) =>
          raw.length === 0
            ? _fail('Nothing to pack: run `bun scripts/release.ts build` first')
            : raw.reduce<Promise<string[]>>(
                (chain, name) =>
                  chain.then((lines) =>
                    _packOne(name).then((line) => [...lines, line])
                  ),
                Promise.resolve([])
              )
        )
        .then((lines) =>
          _packPackages(OUT).then((packed) => [...lines, ...packed])
        )
        .then((lines) =>
          Bun.write(resolve(OUT, 'SHA256SUMS'), `${lines.join('\n')}\n`).then(
            () => lines
          )
        )
        .then((lines) =>
          Promise.all(
            _INSTALLERS.map((name) =>
              Bun.file(resolve(ROOT, name))
                .text()
                .then((script) =>
                  Bun.write(
                    resolve(OUT, name),
                    script.replaceAll('__REPO__', repo)
                  )
                )
            )
          ).then(() =>
            console.log(
              [...lines, `${_INSTALLERS.join(' and ')} for ${repo}`].join('\n')
            )
          )
        )
    : _fail(`--repo must be owner/name, not "${repo}"`);

// Пробный запуск сборки на её раннере: `version`, затем сервер на временной базе и свободном порту должен
// ответить 200 на /_cms/health, а первый скрипт менеджера — прийти скриптом: не нашедшийся файл SPA отдаётся как
// index.html, и так видно, что SPA вшита под своими путями (на Windows Glob пишет их через «\»).
const _SMOKE_SECONDS = 60;

const _freePort = (): number =>
  ((server) => ((port) => (server.stop(true), port))(server.port ?? 0))(
    Bun.serve({ port: 0, fetch: () => new Response() })
  );

const _health = (url: string, until: number): Promise<number> =>
  fetch(url, { signal: AbortSignal.timeout(2000) })
    .then(
      (response) => (void response.body?.cancel(), response.status),
      () => 0
    )
    .then((status) =>
      status === 200 || Date.now() > until
        ? status
        : Bun.sleep(500).then(() => _health(url, until))
    );

// Ответ — что не так, или null.
const _managerScript = (origin: string): Promise<string | null> =>
  fetch(`${origin}/manager`)
    .then((_) => _.text())
    .then((html) => /\/manager\/_app\/[^"']+\.js/.exec(html)?.[0] ?? null)
    .then((script) =>
      script === null
        ? 'the manager page has no _app script'
        : fetch(`${origin}${script}`).then((_) =>
            (_.headers.get('content-type') ?? '').includes('javascript')
              ? null
              : `${script} came as ${_.headers.get('content-type')}: the manager is not embedded under its paths`
          )
    );

const _probe = (origin: string): Promise<string | null> =>
  _health(`${origin}${HEALTH_PATH}`, Date.now() + _SMOKE_SECONDS * 1000).then(
    (status) =>
      status === 200
        ? _managerScript(origin)
        : `${HEALTH_PATH} answered ${status || 'nothing'} in ${_SMOKE_SECONDS} s`
  );

const smoke = (binary: string): Promise<unknown> =>
  ((version) =>
    version.exitCode !== 0
      ? _fail(`${binary} version failed: ${version.stderr.toString().trim()}`)
      : ((dir, port) => {
          console.log(version.stdout.toString().trim());
          const server = Bun.spawn(
            [binary, '--port', String(port), '--db', join(dir, 'site.db')],
            { stdout: 'inherit', stderr: 'inherit', cwd: dir }
          );
          return _probe(`http://127.0.0.1:${port}`)
            .then(
              (problem) => (server.kill(), server.exited.then(() => problem))
            )
            .then(
              (problem) => (
                rmSync(dir, { recursive: true, force: true }),
                problem === null
                  ? console.log(
                      `${basename(binary)}: ${HEALTH_PATH} 200, the manager is served`
                    )
                  : _fail(`${basename(binary)}: ${problem}`)
              )
            );
        })(mkdtempSync(join(tmpdir(), 'cms-smoke-')), _freePort()))(
    Bun.spawnSync([binary, 'version'], { stdout: 'pipe', stderr: 'pipe' })
  );

const checkTag = (tag: string): void =>
  void (tag === `v${VERSION}`
    ? console.log(`Tag ${tag} matches version ${VERSION}`)
    : _fail(
        `Tag "${tag}" does not match version v${VERSION} (src/cli/version.ts, package.json)`
      ));

const _option = (args: readonly string[], name: string): string =>
  ((index) => (index < 0 ? '' : (args[index + 1] ?? '')))(args.indexOf(name));

const _COMMANDS: Readonly<
  Record<string, (args: readonly string[]) => unknown>
> = {
  build: (args) => build(args),
  pack: (args) => pack(_option(args, '--repo')),
  packages: (args) =>
    ((out) => packages(out))(resolve(_option(args, '--out') || OUT)),
  smoke: (args) => smoke(resolve(args[0] ?? '')),
  'check-tag': (args) => checkTag(args[0] ?? ''),
};

const args = process.argv.slice(2);
await (
  _COMMANDS[args[0] ?? ''] ??
  (() =>
    _fail(
      'Usage: bun scripts/release.ts build [target…] | pack --repo owner/name | packages [--out dir] | smoke <binary> | check-tag vX.Y.Z'
    ))
)(args.slice(1));
