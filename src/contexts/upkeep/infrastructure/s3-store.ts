import { rmSync } from 'node:fs';
import {
  fileSource,
  keyIdOf,
  newBackupKey,
  recoveryKeyOf,
  seal,
  sealInfo,
  unseal,
} from '../../../platform/seal.ts';
import {
  domainError,
  fail,
  isDomainError,
  rethrow,
} from '../../../shared/kernel/errors.ts';
import { SEALED_EXTENSION } from '../domain/offsite.ts';
import type { BackupKeys, Remote, RemoteTarget } from '../domain/ports.ts';

export var backupKeys: BackupKeys = {
  generate: newBackupKey,
  id: keyIdOf,
  recovery: recoveryKeyOf,
};

// У Bun.S3Client нет своего срока: зависший ответ держал бы автокопию «в работе» до перезапуска.
const _DEADLINE_MS = 120_000;

// Кусок загрузки — наименьший, что разрешает S3 (5 МиБ), и два в полёте: память не растёт с размером копии.
const _PART = 5 * 1024 * 1024;
const _QUEUE = 2;

const _CHECK = '.eile-check';

// Ответы хранилища — словами владельца сайта; код S3 остаётся в скобках для поиска.
const _REASONS: Readonly<Record<string, readonly [string, string]>> = {
  InvalidAccessKeyId: [
    'upkeep.offsite_denied',
    'Storage does not know this access key',
  ],
  SignatureDoesNotMatch: [
    'upkeep.offsite_denied',
    'Storage did not accept the secret key',
  ],
  AccessDenied: [
    'upkeep.offsite_denied',
    'Storage denied access to the bucket',
  ],
  NoSuchBucket: ['upkeep.offsite_no_bucket', 'There is no such bucket'],
  NoSuchKey: ['upkeep.offsite_not_found', 'There is no such copy in storage'],
  ConnectionRefused: ['upkeep.offsite_unreachable', 'Storage does not answer'],
  InvalidURL: [
    'upkeep.offsite_unreachable',
    'The storage address is not valid',
  ],
};

const _explain = (error: unknown): never =>
  ((code) =>
    ((known) =>
      rethrow(
        isDomainError(error)
          ? error
          : known
            ? domainError(known[0], `${known[1]} (${code})`)
            : domainError(
                'upkeep.offsite_failed',
                `Storage error${code ? ` (${code})` : ''}: ${error instanceof Error ? error.message : String(error)}`
              )
      ))(code ? _REASONS[code] : undefined))(
    ((_) => (typeof _ === 'string' ? _ : ''))(
      (error as { code?: unknown } | null)?.code
    )
  );

const _deadline = <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            domainError(
              'upkeep.offsite_timeout',
              `Storage did not answer in ${_DEADLINE_MS / 1000} s`
            )
          ),
        _DEADLINE_MS
      );
    }),
  ]).finally(() => clearTimeout(timer));
};

// Бакет в имени хоста: https://fra1.digitaloceanspaces.com → https://bucket.fra1.digitaloceanspaces.com.
const _hosted = (target: RemoteTarget): string =>
  ((url) =>
    url.hostname.startsWith(`${target.bucket}.`)
      ? target.endpoint
      : `${url.protocol}//${target.bucket}.${url.host}${url.pathname.replace(/\/$/, '')}`)(
    new URL(target.endpoint)
  );

const _client = (target: RemoteTarget): Bun.S3Client =>
  new Bun.S3Client({
    accessKeyId: target.accessKey,
    secretAccessKey: target.secret,
    bucket: target.bucket,
    ...(target.region ? { region: target.region } : {}),
    ...(target.endpoint
      ? { endpoint: target.virtualHosted ? _hosted(target) : target.endpoint }
      : {}),
    ...(target.virtualHosted ? { virtualHostedStyle: true } : {}),
  });

const _NAME = /^[A-Za-z0-9._-]+$/;

// Имя приходит из менеджера и командной строки: только файл в префиксе, без путей наверх.
const _named = (name: string): string =>
  _NAME.test(name) && name.endsWith(SEALED_EXTENSION)
    ? name
    : fail('upkeep.invalid_copy_name', `"${name}" is not a copy name`);

/** Хранилище S3 на `Bun.S3Client`: копия запечатывается кусками по дороге и не лежит в памяти целиком. */
export var s3Remote: Remote = (target) => {
  const client = _client(target);
  const object = (name: string) => client.file(`${target.prefix}${name}`);
  // Имя проверяется внутри цепочки: плохое имя — отказ Promise, а не исключение у вызывающего.
  const named = (name: string): Promise<Bun.S3File> =>
    Promise.resolve(name).then(_named).then(object);
  const list = (token?: string): Promise<Bun.S3ListObjectsResponse[]> =>
    _deadline(
      client.list({
        prefix: target.prefix,
        ...(token ? { continuationToken: token } : {}),
      })
    ).then((page) =>
      page.isTruncated && page.nextContinuationToken
        ? list(page.nextContinuationToken).then((rest) => [page, ...rest])
        : [page]
    );
  return {
    check: () =>
      _deadline(client.list({ prefix: target.prefix, maxKeys: 1 }))
        .then(() => _deadline(object(_CHECK).write('eile')))
        .then(() => _deadline(object(_CHECK).delete()))
        .then(() => undefined, _explain),
    upload: (file, name, key) =>
      named(name)
        .then((remote) =>
          ((writer) =>
            seal(
              fileSource(file),
              'site',
              { key },
              {
                write: (chunk) => writer.write(chunk),
                flush: () => _deadline(Promise.resolve(writer.flush())),
                end: () => _deadline(Promise.resolve(writer.end())),
              }
            ).then((size) =>
              _deadline(remote.stat()).then((stat) =>
                stat.size === size
                  ? size
                  : fail(
                      'upkeep.offsite_failed',
                      `Storage kept ${stat.size} bytes of ${size}`
                    )
              )
            ))(
            remote.writer({
              partSize: _PART,
              queueSize: _QUEUE,
              retry: 3,
              type: 'application/octet-stream',
            })
          )
        )
        .then(undefined, _explain),
    list: () =>
      list()
        .then((pages) =>
          pages
            .flatMap((_) => _.contents ?? [])
            .map((_) => ({
              name: _.key.slice(target.prefix.length),
              size: _.size ?? 0,
              at: _.lastModified ?? null,
            }))
            .filter(
              (_) => _NAME.test(_.name) && _.name.endsWith(SEALED_EXTENSION)
            )
        )
        .then(undefined, _explain),
    remove: (name) =>
      named(name)
        .then((_) => _deadline(_.delete()))
        .then(undefined, _explain),
    header: (name) =>
      named(name)
        .then((_) => _deadline(_.slice(0, 72).bytes()))
        .then((bytes) => ({ keyId: sealInfo(bytes).keyId }))
        .then(undefined, _explain),
    // Сначала на диск (поток Bun пишет сам, без копии в памяти), потом распечатка кусками в `target`.
    download: (name, target, key) =>
      ((sealed) =>
        named(name)
          .then((_) => Bun.write(sealed, _))
          .then(() =>
            unseal(
              fileSource(sealed),
              'site',
              { key },
              Bun.file(target).writer()
            )
          )
          .then(() => undefined, _explain)
          .finally(() => rmSync(sealed, { force: true })))(
        `${target}${SEALED_EXTENSION}.part`
      ),
  };
};
