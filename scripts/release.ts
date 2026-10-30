import { resolve } from 'node:path';
import { VERSION } from '../src/cli/version.ts';

// Сборка релиза для GitHub (.github/workflows/release.yml):
//   bun scripts/release.ts build [цель…]          dist/release/cms-<цель>; без целей — все
//   bun scripts/release.ts pack --repo owner/name  cms-<цель>.gz, SHA256SUMS и install.sh с адресом репозитория
//   bun scripts/release.ts check-tag v0.1.0        тег совпадает с версией программы

/** Цели релиза: имя файла → платформа Bun. Windows нет: установщик — на bash. */
export var TARGETS: Readonly<Record<string, string>> = {
  'linux-x64': 'bun-linux-x64',
  'linux-arm64': 'bun-linux-arm64',
  'linux-x64-musl': 'bun-linux-x64-musl',
  'linux-arm64-musl': 'bun-linux-arm64-musl',
  'darwin-x64': 'bun-darwin-x64',
  'darwin-arm64': 'bun-darwin-arm64',
};

// Сборка (binary.ts тянет компилятор Svelte) грузится только для build: pack и check-tag в CI идут без
// `bun install`.
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

const build = (names: readonly string[]): Promise<unknown> =>
  ((targets) =>
    ((unknown) =>
      unknown.length > 0
        ? _fail(
            `Unknown targets: ${unknown.join(', ')}. Known: ${Object.keys(TARGETS).join(', ')}`
          )
        : import('./binary.ts').then(({ compile, prepareEntry }) =>
            prepareEntry().then(() =>
              _sequence(targets, (name) =>
                compile(resolve(OUT, `cms-${name}`), TARGETS[name]).then(() =>
                  console.log(`dist/release/cms-${name}`)
                )
              )
            )
          ))(targets.filter((_) => !(_ in TARGETS))))(
    names.length > 0 ? names : Object.keys(TARGETS)
  );

// Сжатая копия и строка SHA256SUMS для неё; сам бинарник в релиз не идёт.
const _packOne = (name: string): Promise<string> =>
  Bun.file(resolve(OUT, name))
    .bytes()
    .then((bytes) => Bun.gzipSync(bytes, { level: 6 }))
    .then((gz) =>
      Bun.write(resolve(OUT, `${name}.gz`), gz).then(
        () => `${_sha256(gz)}  ${name}.gz`
      )
    );

const pack = (repo: string): Promise<unknown> =>
  _REPO.test(repo)
    ? Array.fromAsync(new Bun.Glob('cms-*').scan(OUT))
        .then((files) => files.filter((_) => !_.endsWith('.gz')).sort())
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
          Bun.write(resolve(OUT, 'SHA256SUMS'), `${lines.join('\n')}\n`).then(
            () => lines
          )
        )
        .then((lines) =>
          Bun.file(resolve(ROOT, 'install.sh'))
            .text()
            .then((script) =>
              Bun.write(
                resolve(OUT, 'install.sh'),
                script.replaceAll('__REPO__', repo)
              )
            )
            .then(() =>
              console.log([...lines, `install.sh for ${repo}`].join('\n'))
            )
        )
    : _fail(`--repo must be owner/name, not "${repo}"`);

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
  'check-tag': (args) => checkTag(args[0] ?? ''),
};

const args = process.argv.slice(2);
await (
  _COMMANDS[args[0] ?? ''] ??
  (() =>
    _fail(
      'Usage: bun scripts/release.ts build [target…] | pack --repo owner/name | check-tag vX.Y.Z'
    ))
)(args.slice(1));
