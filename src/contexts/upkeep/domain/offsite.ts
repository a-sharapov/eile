import { fail } from '../../../shared/kernel/errors.ts';
import {
  isLinkLocalHost,
  isLoopbackHost,
} from '../../../shared/kernel/outbound.ts';
import type { BackupFailure } from './schedule.ts';

/**
 * Хранилище S3 для копий вне сервера: DigitalOcean Spaces, Backblaze B2, Hetzner, MinIO, AWS. Секрет
 * доступа и ключ копий лежат отдельно (`OffsiteState`) и наружу не отдаются.
 */
export type OffsiteSettings = {
  /** Отправлять копию в хранилище после каждой автокопии и копии кнопкой. */
  readonly enabled: boolean;
  /** `https://fra1.digitaloceanspaces.com`; пусто — AWS S3 по региону. */
  readonly endpoint: string;
  /** Регион подписи запросов; пусто — us-east-1. */
  readonly region: string;
  readonly bucket: string;
  /** Начало имён объектов, `my-site/`; пусто — корень бакета. */
  readonly prefix: string;
  readonly accessKey: string;
  /** Бакет в имени хоста (`bucket.host`), а не в пути (`host/bucket`). */
  readonly virtualHosted: boolean;
  /** Сколько последних копий хранить в хранилище; старые удаляются. */
  readonly keep: number;
};

/** Последняя копия, которая дошла до хранилища. */
export type OffsiteRun = {
  readonly at: string;
  readonly name: string;
  readonly size: number;
};

/** Всё про хранилище на этом сервере: настройки, секрет доступа, ключ копий и итог последней отправки. */
export type OffsiteState = {
  readonly settings: OffsiteSettings;
  readonly secret: string;
  /** Ключ копий в base64; null — ещё не создан. */
  readonly key: string | null;
  readonly keyCreatedAt: string | null;
  readonly last: OffsiteRun | null;
  readonly failure: BackupFailure | null;
};

/** Объект в хранилище: имя без префикса, размер и когда записан. */
export type RemoteCopy = {
  readonly name: string;
  readonly size: number;
  readonly at: string | null;
};

export var DEFAULT_OFFSITE: OffsiteSettings = {
  enabled: false,
  endpoint: '',
  region: '',
  bucket: '',
  prefix: '',
  accessKey: '',
  virtualHosted: false,
  keep: 14,
};

export var EMPTY_OFFSITE: OffsiteState = {
  settings: DEFAULT_OFFSITE,
  secret: '',
  key: null,
  keyCreatedAt: null,
  last: null,
  failure: null,
};

/** Запечатанная копия в хранилище — имя файла копии и `.enc`. */
export var SEALED_EXTENSION = '.enc';

const _MAX_KEEP = 365;
const _REGION = /^[A-Za-z0-9-]{2,40}$/;
const _BUCKET = /^[A-Za-z0-9][A-Za-z0-9._-]{1,61}[A-Za-z0-9]$/;
const _PREFIX = /^[A-Za-z0-9._\-/]*$/;
const _ACCESS = /^[\x21-\x7e]{1,256}$/;

// Адрес — http(s), без логина, запроса и якоря; путь можно (Supabase: /storage/v1/s3).
const _endpoint = (raw: string): string =>
  raw === ''
    ? ''
    : ((url) =>
        url &&
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === '' &&
        // Link-local/метадата — никогда; http — только на этой машине (своё MinIO), иначе ключ уйдёт открытым.
        !isLinkLocalHost(url.hostname) &&
        (url.protocol === 'https:' || isLoopbackHost(url.hostname))
          ? `${url.origin}${url.pathname.replace(/\/+$/, '')}`
          : fail(
              'upkeep.invalid_endpoint',
              'The storage address is https://host, for example https://fra1.digitaloceanspaces.com'
            ))(URL.parse(raw));

// Префикс — путь внутри бакета: без ведущей косой, без «..», с косой на конце.
const _prefix = (raw: string): string =>
  ((prefix) =>
    _PREFIX.test(prefix) &&
    prefix.length <= 200 &&
    !prefix.split('/').some((_) => _ === '..' || _ === '.')
      ? prefix === ''
        ? ''
        : `${prefix}/`
      : fail(
          'upkeep.invalid_prefix',
          'The prefix is a folder name: letters, digits, . _ - and /'
        ))(raw.replace(/^\/+|\/+$/g, ''));

type Rule = readonly [(_: OffsiteSettings) => boolean, string, string];

const _RULES: readonly Rule[] = [
  [
    (_) => _.region === '' || _REGION.test(_.region),
    'upkeep.invalid_region',
    'The region is a name like fra1 or eu-central-1',
  ],
  [
    (_) => _.bucket === '' || _BUCKET.test(_.bucket),
    'upkeep.invalid_bucket',
    'The bucket name is 3 to 63 letters, digits, dots and hyphens',
  ],
  [
    (_) => _.accessKey === '' || _ACCESS.test(_.accessKey),
    'upkeep.invalid_access_key',
    'The access key is one word without spaces',
  ],
  [
    (_) => Number.isInteger(_.keep) && _.keep >= 1 && _.keep <= _MAX_KEEP,
    'upkeep.invalid_keep',
    `Keep from 1 to ${_MAX_KEEP} copies`,
  ],
  [
    (_) => !_.enabled || (_.bucket !== '' && _.accessKey !== ''),
    'upkeep.offsite_incomplete',
    'The bucket and the access key are required',
  ],
];

/** Правка настроек хранилища: незаданное берётся из `base`, итог проверяется целиком. */
export var parseOffsite = (
  patch: Readonly<Partial<Record<keyof OffsiteSettings, unknown>>>,
  base: OffsiteSettings = DEFAULT_OFFSITE
): OffsiteSettings =>
  _RULES.reduce<OffsiteSettings>(
    (settings, { 0: valid, 1: code, 2: message }) =>
      valid(settings) ? settings : fail(code, message),
    {
      enabled:
        patch.enabled === undefined ? base.enabled : patch.enabled === true,
      endpoint: _endpoint(String(patch.endpoint ?? base.endpoint).trim()),
      region: String(patch.region ?? base.region).trim(),
      bucket: String(patch.bucket ?? base.bucket).trim(),
      prefix: _prefix(String(patch.prefix ?? base.prefix).trim()),
      accessKey: String(patch.accessKey ?? base.accessKey).trim(),
      virtualHosted:
        patch.virtualHosted === undefined
          ? base.virtualHosted
          : patch.virtualHosted === true,
      keep: Number(patch.keep ?? base.keep),
    }
  );

/**
 * Секрет доступа: новый из формы, иначе прежний — но только для того же хранилища и ключа доступа: на
 * чужой адрес он не уходит (как пароль SMTP).
 */
export var offsiteSecret = (
  raw: unknown,
  next: OffsiteSettings,
  previous: OffsiteState
): string =>
  (typeof raw === 'string' ? raw.trim() : '') ||
  (previous.settings.endpoint === next.endpoint &&
  previous.settings.accessKey === next.accessKey &&
  previous.settings.bucket === next.bucket
    ? previous.secret
    : '');

/** Имя копии в хранилище: имя файла автокопии и `.enc`. */
export var remoteName = (file: string): string =>
  `${file.split(/[\\/]/).at(-1) ?? file}${SEALED_EXTENSION}`;

/** Копии этой базы в хранилище сверх `keep` последних — их удалить; чужие имена не трогаются. */
export var outdatedCopies = (
  names: readonly string[],
  database: string,
  keep: number
): string[] =>
  names
    .filter(
      (_) =>
        _.startsWith(`${database}-auto-`) &&
        _.endsWith(`.db${SEALED_EXTENSION}`)
    )
    .toSorted()
    .slice(0, -keep);

/** Последняя копия в списке: по времени записи, при равном — по имени (в нём дата). */
export var latestCopy = (copies: readonly RemoteCopy[]): RemoteCopy | null =>
  copies.toSorted(
    (a, b) =>
      (b.at ?? '').localeCompare(a.at ?? '') || b.name.localeCompare(a.name)
  )[0] ?? null;
