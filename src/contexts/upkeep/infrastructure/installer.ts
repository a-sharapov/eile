import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { unzipFile } from '../../../platform/zip.ts';
import { attempt, fail, rethrow } from '../../../shared/kernel/errors.ts';
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
  win32: 'windows',
};
const _ARCH: Readonly<Record<string, string>> = { x64: 'x64', arm64: 'arm64' };

/**
 * Цель сборки, как у install.sh, install.ps1 и scripts/release.ts: linux-x64, linux-arm64-musl,
 * darwin-arm64, windows-x64.
 */
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
      /** Второе имя (`eile`, на Windows `eile.exe`), если его не было и оно создано; null — было, чужое или нет прав. */
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

/**
 * Файлы установки, которые трогает замена бинарника. Тесты подменяют их, в том числе с правилами Windows:
 * работающий `.exe` там не удалить и не перезаписать, а переименовать можно (ADR 0049).
 */
export type InstallFiles = {
  readonly windows: boolean;
  readonly write: (path: string, bytes: Uint8Array) => Promise<unknown>;
  /** Права 755; у Windows их нет. */
  readonly executable: (path: string) => void;
  readonly copy: (from: string, to: string) => void;
  readonly rename: (from: string, to: string) => void;
  /** Удалить, если есть; занятый файл Windows — исключение. */
  readonly remove: (path: string) => void;
  /** Второе имя: ссылка `eile` → `cms`, на Windows — жёсткая ссылка `eile.exe` на `cms.exe`. */
  readonly alias: (binary: string, path: string) => void;
  /** По пути что-то лежит, хотя бы битая ссылка. */
  readonly exists: (path: string) => boolean;
  /** Два пути — один файл: жёсткие ссылки. */
  readonly same: (a: string, b: string) => boolean;
  readonly list: (dir: string) => readonly string[];
  /** Пробный запуск `version`: null — запустился, иначе первая строка ошибки. */
  readonly check: (path: string) => string | null;
};

/** Файлы этой машины. */
export var defineInstallFiles = (
  windows = process.platform === 'win32'
): InstallFiles => ({
  windows,
  write: (path, bytes) => Bun.write(path, bytes),
  executable: (path) => void (windows || chmodSync(path, 0o755)),
  copy: (from, to) => copyFileSync(from, to),
  rename: renameSync,
  remove: (path) => rmSync(path, { force: true }),
  // Жёсткой ссылке не нужны ни права администратора, ни режим разработчика, в отличие от символьной.
  alias: (binary, path) =>
    windows ? linkSync(binary, path) : symlinkSync(basename(binary), path),
  exists: (path) =>
    attempt(
      () => (lstatSync(path), true),
      () => false
    ),
  same: (a, b) =>
    attempt(
      () =>
        ((x, y) => x.ino === y.ino && x.dev === y.dev)(
          statSync(a, { bigint: true }),
          statSync(b, { bigint: true })
        ),
      () => false
    ),
  list: (dir) =>
    attempt(
      () => readdirSync(dir),
      () => []
    ),
  check: (path) =>
    ((result) =>
      result.exitCode === 0
        ? null
        : (result.stderr.toString().split('\n')[0] ?? ''))(
      Bun.spawnSync([path, 'version'], { stdout: 'pipe', stderr: 'pipe' })
    ),
});

const _EXE = /\.exe$/i;

// Имя рядом с бинарником с пометкой перед расширением: cms → cms.old, cms.exe → cms.old.exe. Расширение —
// последним: файл без .exe Windows не запустит.
const _tagged = (binary: string, tag: string): string =>
  ((ext) => `${binary.slice(0, binary.length - ext.length)}.${tag}${ext}`)(
    _EXE.exec(binary)?.[0] ?? ''
  );

/** Прежняя версия рядом с бинарником: `cms.old`, на Windows — `cms.old.exe`. */
export var previousOf = (binary: string): string => _tagged(binary, 'old');

// Временный файл в том же каталоге: `.cms.new.<pid>`, на Windows `.cms.new.<pid>.exe`.
const _temporary = (binary: string, tag: string): string =>
  join(
    dirname(binary),
    `.${basename(_tagged(binary, `${tag}.${process.pid}`))}`
  );

const _stem = (binary: string): string =>
  basename(binary).replace(_EXE, '').toLowerCase();

/** Второе имя команды — как ставит install.sh. */
export var ALIAS = 'eile';

const _aliasOf = (binary: string): string =>
  join(dirname(binary), `${ALIAS}${_EXE.exec(binary)?.[0] ?? ''}`);

// Файл, который Windows не дала удалить (он запущен), уходит в сторону под именем `.<имя>.<uuid>.trash`;
// удаляет его следующее обновление.
const _trash = (path: string): string =>
  join(dirname(path), `.${basename(path)}.${Bun.randomUUIDv7()}.trash`);

const _isTrash = (binary: string, name: string): boolean =>
  name.endsWith('.trash') &&
  [_stem(binary), ALIAS].some((_) => name.toLowerCase().startsWith(`.${_}.`));

const _discard = (files: InstallFiles, path: string): void =>
  void (
    files.exists(path) &&
    attempt(
      () => files.remove(path),
      () => files.rename(path, _trash(path))
    )
  );

// Остатки прошлых обновлений: что ещё запущено, не удалится и подождёт следующего раза.
const _sweep = (files: InstallFiles, binary: string): void =>
  files
    .list(dirname(binary))
    .filter((_) => _isTrash(binary, _))
    .forEach(
      (_) =>
        void attempt(
          () => files.remove(join(dirname(binary), _)),
          () => undefined
        )
    );

/** Что стало с файлами после замены. */
type _Placed = {
  readonly previous: string;
  /** Второе имя, если его не было и оно создано. */
  readonly alias: string | null;
};

// Установка старше второго имени получает ссылку при обновлении. Что-то с этим именем уже есть — не
// трогаем; нет прав — обновление всё равно удалось.
const _linkAlias = (files: InstallFiles, binary: string): string | null =>
  _stem(binary) === 'cms'
    ? ((link) =>
        files.exists(link)
          ? null
          : attempt(
              () => (files.alias(binary, link), link),
              () => null
            ))(_aliasOf(binary))
    : null;

// Linux и macOS: прежний файл копируется в .old, новый встаёт на место одним переименованием — `cms` есть
// всегда, а работающий сервер доживает на старом файле до перезапуска.
const _swapUnix = (
  files: InstallFiles,
  binary: string,
  fresh: string
): _Placed =>
  ((previous) =>
    (
      // Что лежит на месте .old — удаляется, а не перезаписывается: ссылку туда copyFile прошёл бы насквозь.
      files.remove(previous),
      files.copy(binary, previous),
      files.executable(previous),
      files.rename(fresh, binary),
      { previous, alias: _linkAlias(files, binary) }
    ))(previousOf(binary));

// Жёсткая ссылка eile.exe держит прежний файл: после замены она ставится заново, на новый cms.exe.
const _relink = (
  files: InstallFiles,
  binary: string,
  ours: boolean
): string | null =>
  ours
    ? attempt(
        () => (
          _discard(files, _aliasOf(binary)),
          files.alias(binary, _aliasOf(binary)),
          null
        ),
        () => null
      )
    : _linkAlias(files, binary);

// Windows: работающий cms.exe не перезаписать, но переименовать можно — он сам становится cms.old.exe, новый
// встаёт на его место. Не встал — прежний возвращается. Окно между двумя переименованиями — доли секунды.
const _swapWindows = (
  files: InstallFiles,
  binary: string,
  fresh: string
): _Placed =>
  ((previous, ours) => (
    _sweep(files, binary),
    _discard(files, previous),
    files.rename(binary, previous),
    attempt(
      () => files.rename(fresh, binary),
      (error) => (files.rename(previous, binary), rethrow(error))
    ),
    { previous, alias: _relink(files, binary, ours) }
  ))(
    previousOf(binary),
    _stem(binary) === 'cms' && files.same(_aliasOf(binary), binary)
  );

// Новый файл пишется рядом со старым и до замены пробно запускается: несовместимая система не оставит
// без работающего cms.
const _replace = (
  files: InstallFiles,
  binary: string,
  bytes: Uint8Array
): Promise<_Placed> =>
  ((fresh) =>
    files
      .write(fresh, bytes)
      .then(
        () => files.executable(fresh),
        () =>
          fail(
            'upkeep.no_write',
            `No write access to ${dirname(binary)}: run cms update with sudo`
          )
      )
      .then(() =>
        ((problem) =>
          problem === null
            ? attempt(
                () =>
                  (files.windows ? _swapWindows : _swapUnix)(
                    files,
                    binary,
                    fresh
                  ),
                (error) => (
                  attempt(
                    () => files.remove(fresh),
                    () => undefined
                  ),
                  rethrow(error)
                )
              )
            : (files.remove(fresh),
              fail(
                'upkeep.binary_broken',
                `The new version does not start here: ${problem}`
              )))(files.check(fresh))
      ))(_temporary(binary, 'new'));

/**
 * Откат обновления: прежний бинарник (`cms.old`, на Windows `cms.old.exe`) — снова на месте, той же
 * заменой одним переименованием. `.old` остаётся. На Windows заменяемый файл может быть запущен — он
 * уходит в сторону, а не удаляется.
 */
export var restorePrevious = (
  binary: string,
  previous = previousOf(binary),
  files: InstallFiles = defineInstallFiles()
): void =>
  ((back, ours) => (
    files.remove(back),
    files.copy(previous, back),
    files.executable(back),
    void (files.windows && _discard(files, binary)),
    files.rename(back, binary),
    void (files.windows && _relink(files, binary, ours))
  ))(
    _temporary(binary, 'back'),
    files.windows &&
      _stem(binary) === 'cms' &&
      files.same(_aliasOf(binary), binary)
  );

/**
 * Запуск через второе имя: заменяется `cms` рядом, если это тот же файл. На Windows `eile.exe` — жёсткая
 * ссылка, и `process.execPath` у неё свой; символьную ссылку Linux и macOS разворачивают сами.
 */
export var installedBinary = (
  path: string,
  files: InstallFiles = defineInstallFiles()
): string =>
  ((ext) =>
    _stem(path) === ALIAS
      ? ((cms) => (files.same(path, cms) ? cms : path))(
          join(dirname(path), `cms${ext}`)
        )
      : path)(_EXE.exec(path)?.[0] ?? '');

// Архив выпуска: .gz с бинарником; для Windows — .zip с cms.exe, его открывает Проводник (ADR 0049).
const _ARCHIVE: Readonly<
  Record<
    'gz' | 'zip',
    {
      readonly name: (target: string) => string;
      readonly unpack: (bytes: Uint8Array) => Uint8Array;
    }
  >
> = {
  gz: {
    name: (target) => `cms-${target}.gz`,
    unpack: (bytes) => Bun.gunzipSync(new Uint8Array(bytes)),
  },
  zip: {
    name: (target) => `cms-${target}.zip`,
    unpack: (bytes) => unzipFile(bytes, 'cms.exe'),
  },
};

const _format = (target: string) =>
  _ARCHIVE[target.startsWith('windows-') ? 'zip' : 'gz'];

const _install = (
  release: Release,
  target: string,
  binary: string,
  version: string,
  source: _Source,
  files: InstallFiles
): Promise<_Placed> =>
  ((format) =>
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
              : _replace(files, binary, format.unpack(bytes)))(
          checksumOf(sums, archive)
        )
      ))(format.name(target)))(_format(target));

/**
 * `cms update`: новый выпуск со страницы релизов — под эту платформу, со сверкой SHA256SUMS, пробным
 * запуском и заменой бинарника (на Linux и macOS — атомарной). `check` — только сказать, есть ли новее.
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
  files = defineInstallFiles(),
}: {
  releases: ReleaseSource;
  current: string;
  check?: boolean;
  binary?: string;
  standalone?: boolean;
  target?: string | null;
  fetch?: Fetch;
  insecure?: boolean;
  files?: InstallFiles;
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
              : ((installed) =>
                  _install(
                    release,
                    target,
                    installed,
                    current,
                    { fetch: get, insecure },
                    files
                  ).then((placed) => ({
                    status: 'updated',
                    current,
                    release,
                    binary: installed,
                    ...placed,
                  })))(installedBinary(binary, files))
    );
