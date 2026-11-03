import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { attempt, fail } from '../../../shared/kernel/errors.ts';
import type { ReleaseSource } from '../domain/ports.ts';
import { safeDownload } from '../domain/releases-url.ts';
import { newerRelease, type Release } from '../domain/version.ts';
import type { Fetch } from './releases.ts';

type Probe = {
  readonly platform: string;
  readonly arch: string;
  readonly musl: boolean;
  readonly rosetta: boolean;
};

const _run = (command: readonly string[]): string =>
  attempt(
    () =>
      ((result) => `${result.stdout.toString()}${result.stderr.toString()}`)(
        Bun.spawnSync([...command], { stdout: 'pipe', stderr: 'pipe' })
      ),
    () => ''
  );

// Как install.sh: musl — Alpine и всё, у чего ldd про musl; x64-терминал под Rosetta — родной arm64.
const _probe = (): Probe => ({
  platform: process.platform,
  arch: process.arch,
  musl:
    process.platform === 'linux' &&
    (existsSync('/etc/alpine-release') ||
      _run(['ldd', '--version']).includes('musl')),
  rosetta:
    process.platform === 'darwin' &&
    process.arch === 'x64' &&
    _run(['sysctl', '-n', 'sysctl.proc_translated']).trim() === '1',
});

const _OS: Readonly<Record<string, string>> = {
  linux: 'linux',
  darwin: 'darwin',
};
const _ARCH: Readonly<Record<string, string>> = { x64: 'x64', arm64: 'arm64' };

/** Цель сборки, как у install.sh и scripts/release.ts: linux-x64, linux-arm64-musl, darwin-arm64. */
export var buildTarget = (probe: Probe = _probe()): string | null =>
  ((os, arch) =>
    os && arch
      ? `${os}-${probe.rosetta ? 'arm64' : arch}${os === 'linux' && probe.musl ? '-musl' : ''}`
      : null)(_OS[probe.platform], _ARCH[probe.arch]);

export type UpdateResult =
  | { readonly status: 'current'; readonly current: string }
  | {
      readonly status: 'available';
      readonly current: string;
      readonly release: Release;
    }
  | {
      readonly status: 'updated';
      readonly current: string;
      readonly release: Release;
      readonly binary: string;
      readonly previous: string;
      /** Ссылка `eile`, если её не было и она создана; null — была, чужая или нет прав. */
      readonly alias: string | null;
    };

type _Source = {
  readonly fetch: Fetch;
  /** http разрешён не только на этой машине: `CMS_RELEASES_INSECURE=1`. */
  readonly insecure: boolean;
};

// Бинарник и его сумма — только по https (http — на этой машине): по http их обе подменит кто угодно.
const _download = (
  url: string,
  version: string,
  source: _Source
): Promise<Uint8Array> =>
  Promise.resolve(url)
    .then((_) =>
      safeDownload(_, source.insecure)
        ? source.fetch(_, {
            headers: { 'user-agent': `Eile/${version}` },
            signal: AbortSignal.timeout(10 * 60_000),
          })
        : fail(
            'upkeep.insecure_download',
            `The release offers its file over plain http: ${_}`
          )
    )
    .then((response) =>
      response.ok
        ? response.bytes()
        : fail(
            'upkeep.download_failed',
            `${basename(new URL(url).pathname)} did not download: ${response.status}`
          )
    );

/** Сумма файла из SHA256SUMS: строки `<hex>  <имя>` или `<hex> *<имя>`. */
export var checksumOf = (sums: string, name: string): string | null =>
  sums
    .split('\n')
    .map((_) => _.trim().split(/\s+/))
    .find((_) => _[1] === name || _[1] === `*${name}`)?.[0]
    ?.toLowerCase() ?? null;

const _asset = (release: Release, name: string): string =>
  release.assets.find((_) => _.name === name)?.url ??
  fail('upkeep.asset_missing', `Release ${release.version} has no ${name}`);

// Новый файл — рядом со старым: так замена — одно переименование, а работающий сервер доживает на
// старом файле до перезапуска. Прежняя версия остаётся `<бинарник>.old`.
const _replace = (binary: string, bytes: Uint8Array): Promise<string> => {
  const fresh = join(
    dirname(binary),
    `.${basename(binary)}.new.${process.pid}`
  );
  const previous = `${binary}.old`;
  return Bun.write(fresh, bytes)
    .then(
      () => chmodSync(fresh, 0o755),
      () =>
        fail(
          'upkeep.no_write',
          `No write access to ${dirname(binary)}: run cms update with sudo`
        )
    )
    .then(() =>
      ((check) =>
        check.exitCode === 0
          ? // Что лежит на месте .old — удаляется, а не перезаписывается: ссылку туда copyFile прошёл бы насквозь.
            (rmSync(previous, { force: true }),
            copyFileSync(binary, previous),
            chmodSync(previous, 0o755),
            renameSync(fresh, binary),
            previous)
          : (rmSync(fresh, { force: true }),
            fail(
              'upkeep.binary_broken',
              `The new version does not start here: ${check.stderr.toString().split('\n')[0]}`
            )))(
        Bun.spawnSync([fresh, 'version'], { stdout: 'pipe', stderr: 'pipe' })
      )
    );
};

/**
 * Откат обновления: прежний бинарник (`<бинарник>.old`) — снова на месте, той же заменой одним
 * переименованием. `.old` остаётся.
 */
export var restorePrevious = (
  binary: string,
  previous = `${binary}.old`
): void =>
  ((back) => (
    rmSync(back, { force: true }),
    copyFileSync(previous, back),
    chmodSync(back, 0o755),
    renameSync(back, binary)
  ))(join(dirname(binary), `.${basename(binary)}.back.${process.pid}`));

/** Второе имя команды — как ставит install.sh. */
export var ALIAS = 'eile';

// Установка старше второго имени получает ссылку при обновлении. Что-то с этим именем уже есть — не
// трогаем; нет прав — обновление всё равно удалось.
const _linkAlias = (binary: string): string | null =>
  basename(binary) === 'cms'
    ? ((link) =>
        attempt(
          () => (lstatSync(link), null),
          () =>
            attempt(
              () => (symlinkSync(basename(binary), link), link),
              () => null
            )
        ))(join(dirname(binary), ALIAS))
    : null;

const _install = (
  release: Release,
  target: string,
  binary: string,
  version: string,
  source: _Source
): Promise<string> =>
  ((archive) =>
    Promise.all([
      _download(_asset(release, archive), version, source),
      _download(_asset(release, 'SHA256SUMS'), version, source).then((_) =>
        new TextDecoder().decode(_)
      ),
    ]).then(({ 0: bytes, 1: sums }) =>
      ((expected) =>
        expected === null
          ? fail('upkeep.asset_missing', `SHA256SUMS has no ${archive}`)
          : expected !==
              new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
            ? fail(
                'upkeep.checksum_mismatch',
                `${archive} does not match SHA256SUMS: the file is damaged or replaced`
              )
            : _replace(binary, Bun.gunzipSync(new Uint8Array(bytes))))(
        checksumOf(sums, archive)
      )
    ))(`cms-${target}.gz`);

/**
 * `cms update`: новый выпуск со страницы релизов — под эту платформу, со сверкой SHA256SUMS, пробным
 * запуском и атомарной заменой бинарника. `check` — только сказать, есть ли новее.
 */
export var updateProgram = ({
  releases,
  current,
  check = false,
  binary = process.execPath,
  standalone = Bun.isStandaloneExecutable,
  target = buildTarget(),
  fetch: get = fetch,
  insecure = false,
}: {
  releases: ReleaseSource;
  current: string;
  check?: boolean;
  binary?: string;
  standalone?: boolean;
  target?: string | null;
  fetch?: Fetch;
  insecure?: boolean;
}): Promise<UpdateResult> =>
  releases()
    .then((list) => newerRelease(current, list))
    .then((release): UpdateResult | Promise<UpdateResult> =>
      release === null
        ? { status: 'current', current }
        : check
          ? { status: 'available', current, release }
          : !standalone
            ? fail(
                'upkeep.not_binary',
                'cms update replaces the installed binary; this one runs from sources'
              )
            : target === null
              ? fail(
                  'upkeep.unsupported_platform',
                  `No builds for ${process.platform}-${process.arch}`
                )
              : _install(release, target, binary, current, {
                  fetch: get,
                  insecure,
                }).then((previous) => ({
                  status: 'updated',
                  current,
                  release,
                  binary,
                  previous,
                  alias: _linkAlias(binary),
                }))
    );
