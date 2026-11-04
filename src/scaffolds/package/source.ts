import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import {
  checksumOf,
  type Fetch,
  type Release,
  safeDownload,
} from '../../contexts/upkeep/index.ts';
import { attempt, fail } from '../../shared/kernel/errors.ts';
import { PACKAGE_LIMITS, PACKAGE_NAME } from './format.ts';
import { sha256 } from './pack.ts';
import { type PackageRead, readPackageFolder, readPackageZip } from './read.ts';

/** Откуда пакет: файл или папка, адрес https или официальный пакет выпуска по имени. */
export type PackageSource =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'official'; readonly name: string };

/** Чем подтверждено, что пакет тот самый. */
export type PackageOrigin = {
  /** Путь или адрес, как его показать. */
  readonly label: string;
  /** SHA-256 архива; у папки — null. */
  readonly sha256: string | null;
  /** `pinned` — совпал с `--sha256`, `release` — с SHA256SUMS выпуска, `none` — файл на этой машине. */
  readonly verified: 'pinned' | 'release' | 'none';
  /** Выпуск, из которого взят официальный пакет. */
  readonly release?: string;
};

export type LoadedPackage = PackageRead & { readonly origin: PackageOrigin };

export type SourceDeps = {
  readonly fetch: Fetch;
  /** Лента выпусков: GitHub или `CMS_RELEASES_URL`. */
  readonly releases: () => Promise<readonly Release[]>;
  /** Версия этой cms: официальные пакеты — из её выпуска. */
  readonly version: string;
  /** `CMS_RELEASES_INSECURE=1`: http не только на этой машине. */
  readonly insecure: boolean;
  /** `--sha256`: сумма архива, которую ждут. */
  readonly sha256?: string;
};

// Адрес — со схемой; имя — как у каркаса; всё остальное — путь на этой машине.
export var packageSource = (arg: string): PackageSource =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(arg)
    ? { kind: 'url', url: arg }
    : PACKAGE_NAME.test(arg)
      ? { kind: 'official', name: arg }
      : { kind: 'path', path: arg };

const _SHA256 = /^[0-9a-f]{64}$/;

const _pin = (raw: string | undefined): string | null =>
  raw === undefined
    ? null
    : _SHA256.test(raw.trim().toLowerCase())
      ? raw.trim().toLowerCase()
      : fail(
          'package.invalid_sha256',
          '--sha256 takes 64 hex digits, as sha256sum prints them'
        );

const _matches = (bytes: Uint8Array, expected: string, what: string): string =>
  ((actual) =>
    actual === expected
      ? actual
      : fail(
          'package.checksum_mismatch',
          `${what} does not match its SHA-256: the file is damaged or replaced`
        ))(sha256(bytes));

type _Reader = {
  readonly read: () => Promise<
    | { readonly done: true; readonly value?: undefined }
    | { readonly done: false; readonly value: Uint8Array }
  >;
  readonly cancel: () => Promise<void>;
};

// Тело ответа не длиннее предела: подделанный или чужой сервер не заполнит память.
const _drain = (
  reader: _Reader,
  max: number,
  parts: readonly Uint8Array[],
  size: number
): Promise<Uint8Array> =>
  reader
    .read()
    .then(({ done, value }) =>
      done
        ? new Uint8Array(Bun.concatArrayBuffers([...parts]))
        : size + value.byteLength > max
          ? (void reader.cancel(),
            fail('package.too_large', `The download is over ${max} bytes`))
          : _drain(reader, max, [...parts, value], size + value.byteLength)
    );

// Вызывается внутри `.then`: отказ `fail` становится отказом Promise.
const _capped = (response: Response, max: number): Promise<Uint8Array> =>
  Number(response.headers.get('content-length') ?? '0') > max
    ? (void response.body?.cancel(),
      fail('package.too_large', `The download is over ${max} bytes`))
    : response.body === null
      ? Promise.resolve(new Uint8Array())
      : _drain(response.body.getReader(), max, [], 0);

const _insecure = (url: string): never =>
  fail(
    'package.insecure_url',
    `Packages come over https (http only from this machine): ${url}`
  );

// Только https, и после переадресаций тоже: http подменит файл на пути.
const _download = (
  url: string,
  deps: SourceDeps,
  max: number
): Promise<Uint8Array> =>
  Promise.resolve(url)
    .then((_) =>
      safeDownload(_, deps.insecure)
        ? deps.fetch(_, {
            headers: { 'user-agent': `Eile/${deps.version}` },
            signal: AbortSignal.timeout(5 * 60_000),
          })
        : _insecure(_)
    )
    .then((response) =>
      !safeDownload(response.url || url, deps.insecure)
        ? _insecure(response.url || url)
        : response.ok
          ? _capped(response, max)
          : fail(
              'package.download_failed',
              `${basename(new URL(url).pathname)} did not download: ${response.status}`
            )
    );

const _fromPath = (path: string, pin: string | null): LoadedPackage =>
  ((stat) =>
    stat === null
      ? fail('package.not_found', `There is no file or folder ${path}`)
      : stat.isDirectory()
        ? pin !== null
          ? fail(
              'package.sha256_folder',
              'A folder has no SHA-256: pack it (cms scaffold pack) or drop --sha256'
            )
          : {
              ...readPackageFolder(path),
              origin: { label: path, sha256: null, verified: 'none' },
            }
        : stat.size > PACKAGE_LIMITS.archive
          ? fail(
              'package.too_large',
              `${path} is ${stat.size} bytes; at most ${PACKAGE_LIMITS.archive}`
            )
          : ((bytes) => ({
              ...readPackageZip(bytes, basename(path)),
              origin: {
                label: path,
                sha256:
                  pin === null ? sha256(bytes) : _matches(bytes, pin, path),
                verified: pin === null ? 'none' : 'pinned',
              },
            }))(new Uint8Array(readFileSync(path))))(
    attempt(
      () => statSync(path),
      () => null
    )
  );

// Без `--sha256` — отказ до скачивания: по адресу может лежать что угодно, и завтра — другое.
const _fromUrl = (
  url: string,
  deps: SourceDeps,
  pin: string | null
): Promise<LoadedPackage> =>
  !safeDownload(url, deps.insecure)
    ? _insecure(url)
    : pin === null
      ? fail(
          'package.sha256_required',
          'A package from an address needs --sha256 <hash> from its author'
        )
      : _download(url, deps, PACKAGE_LIMITS.archive).then((bytes) => ({
          ...readPackageZip(bytes, basename(new URL(url).pathname)),
          origin: {
            label: url,
            sha256: _matches(bytes, pin, url),
            verified: 'pinned' as const,
          },
        }));

const _asset = (release: Release, name: string): string | null =>
  release.assets.find((_) => _.name === name)?.url ?? null;

/** Официальные пакеты выпуска: архивы, кроме сборок cms. */
export var publishedPackages = (release: Release): string[] =>
  release.assets
    .map((_) => _.name)
    .filter((_) => _.endsWith('.zip') && !_.startsWith('cms-'))
    .map((_) => _.slice(0, -'.zip'.length))
    .sort();

const _official = (
  name: string,
  deps: SourceDeps,
  pin: string | null
): Promise<LoadedPackage> =>
  deps
    .releases()
    .then(
      (list) =>
        list.find((_) => !_.draft && _.version === deps.version) ??
        fail(
          'package.no_release',
          `The releases feed has no v${deps.version}: official packages come with the release of this cms`
        )
    )
    .then((release) =>
      ((archive, sums) =>
        archive === null
          ? fail(
              'package.not_published',
              `Release v${release.version} has no package ${name}; there are: ${publishedPackages(release).join(', ') || 'none'}`
            )
          : sums === null
            ? fail(
                'package.no_checksums',
                `Release v${release.version} has no SHA256SUMS`
              )
            : Promise.all([
                _download(archive, deps, PACKAGE_LIMITS.archive),
                _download(sums, deps, 1024 * 1024).then((_) =>
                  new TextDecoder().decode(_)
                ),
              ]).then(({ 0: bytes, 1: text }) =>
                ((expected) => ({
                  ...readPackageZip(bytes, `${name}.zip`),
                  origin: {
                    label: archive,
                    sha256:
                      pin === null
                        ? expected
                        : _matches(bytes, pin, `${name}.zip`),
                    verified: 'release' as const,
                    release: release.version,
                  },
                }))(
                  _matches(
                    bytes,
                    checksumOf(text, `${name}.zip`) ??
                      fail(
                        'package.no_checksums',
                        `SHA256SUMS of v${release.version} has no ${name}.zip`
                      ),
                    `${name}.zip`
                  )
                )
              ))(_asset(release, `${name}.zip`), _asset(release, 'SHA256SUMS'))
    );

type _Loader<K extends PackageSource['kind']> = (
  source: Extract<PackageSource, { kind: K }>,
  deps: SourceDeps,
  pin: string | null
) => LoadedPackage | Promise<LoadedPackage>;

const _LOAD: { readonly [K in PackageSource['kind']]: _Loader<K> } = {
  path: (source, _deps, pin) => _fromPath(source.path, pin),
  url: (source, deps, pin) => _fromUrl(source.url, deps, pin),
  official: (source, deps, pin) => _official(source.name, deps, pin),
};

/**
 * Пакет из источника — с проверкой, что он тот самый: адрес — только с `--sha256`, официальный — по
 * SHA256SUMS своего выпуска, файл на диске — как есть или по `--sha256`. Содержимое ещё не проверено:
 * это `checkPackage`.
 */
export var loadPackage = (
  source: PackageSource,
  deps: SourceDeps
): Promise<LoadedPackage> =>
  Promise.resolve(deps.sha256).then((raw) =>
    (_LOAD[source.kind] as _Loader<PackageSource['kind']>)(
      source as never,
      deps,
      _pin(raw)
    )
  );
