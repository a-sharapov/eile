import { attempt, fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { transliterate } from '../../../shared/kernel/translit.ts';
import {
  contentTypeOf,
  type MediaFile,
  type MediaPath,
  parseMediaPath,
  stemOf,
} from './media.ts';

// Связанная папка (ADR 0065): файлы лежат на диске сервера, в базе — только строки медиатеки.

/** Связанная папка: где лежит и под какой приставкой её файлы видны в медиатеке. */
export type MediaLink = {
  /** Приставка путей в медиатеке и в исходных адресах: `assets`. */
  readonly prefix: string;
  /** Путь к папке, как записан: от каталога базы, если папка внутри него, иначе абсолютный. */
  readonly root: string;
  /** Отдавать файлы и по исходным адресам `/<приставка>/<путь на диске>`. */
  readonly serveOriginal: boolean;
  /**
   * Папка-сайт (ADR 0068): отдаётся статическим сайтом по `/<приставка>/…`, файлов в медиатеке у неё нет.
   * Выбирается при первой связке и не меняется: другое — через unlink.
   */
  readonly staticSite: boolean;
  readonly linkedAt: string;
  readonly syncedAt: string;
};

/** Первые части адресов, занятые сервером: связанная папка под ними перекрыла бы менеджер и медиатеку. */
export var RESERVED_PREFIXES: readonly string[] = ['manager', 'media', '_cms'];

/** Приставка связанной папки: путь медиатеки без файла (`assets`, `old/images`), не служебный адрес. */
export var parseLinkPrefix = (raw: string): string =>
  ((prefix) =>
    prefix === '' ||
    !attempt(
      () => parseMediaPath(`${prefix}/x.x`) === `${prefix}/x.x`,
      () => false
    )
      ? fail(
          'media.invalid_prefix',
          `"${raw}" must be lowercase latin segments like assets or old/images`
        )
      : RESERVED_PREFIXES.includes(prefix.split('/')[0]!)
        ? fail(
            'media.reserved_prefix',
            `"${prefix}" is taken by the server: choose another prefix`
          )
        : prefix)(raw.trim().replace(/^\/+|\/+$/g, ''));

/**
 * Части исходного адреса, которыми выходят из папки: пустая, `.`, `..`, обратный слэш и нулевой байт. Путь —
 * адрес после расшифровки, с ведущим `/`.
 */
export var escapesFolder = (path: string): boolean =>
  path
    .split('/')
    .slice(1)
    .some((_) => _ === '' || _ === '.' || _ === '..' || /[\\\0]/.test(_));

/** Приставки не вкладываются друг в друга: путь `a/b/x.jpg` иначе принадлежал бы двум папкам. */
export var prefixesOverlap = (a: string, b: string): boolean =>
  a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

// FNV-1a: имя части, от которой транслитерация ничего не оставила (`!!!`, иероглифы), — по её байтам.
const _fnv = (text: string): string =>
  [...new TextEncoder().encode(text)]
    .reduce(
      (hash, byte) => Math.imul(hash ^ byte, 0x01000193) >>> 0,
      0x811c9dc5
    )
    .toString(16)
    .padStart(8, '0');

/**
 * Часть пути на диске → часть пути медиатеки: латиница (кириллица по таблице, без диакритики), всё вне
 * `a-z 0-9 . _ -` — дефис (`@` тоже: им помечены варианты размеров), разделители вокруг точки и по краям
 * снимаются. `4a_(5).jpg` → `4a-5.jpg`, `Притыцкого 89.JPG` → `pritytskogo-89.jpg`.
 */
export var linkedSegment = (raw: string): string =>
  pipe(
    (_: string) => transliterate(_.normalize('NFC')),
    (_: string) => _.replace(/[^a-z0-9._-]+/g, '-'),
    // `_-`, `-_`, `--` — один дефис; одиночное подчёркивание остаётся.
    (_: string) => _.replace(/[-_]*-[-_]*/g, '-'),
    (_: string) => _.replace(/[-_]+\./g, '.').replace(/\.[-_]+/g, '.'),
    (_: string) => _.replace(/^[-_.]+|[-_.]+$/g, ''),
    (_: string) => _ || `x-${_fnv(raw)}`
  )(raw);

const _MAX_PATH = 255;

const _split = (path: string): { stem: string; extension: string } =>
  ((dot) =>
    dot > path.lastIndexOf('/')
      ? { stem: path.slice(0, dot), extension: path.slice(dot) }
      : { stem: path, extension: '' })(path.lastIndexOf('.'));

// Длинный путь укорачивается с конца имени, хвост — хэш исходного пути: два длинных имени не сольются.
const _fit = (path: string, file: string): string =>
  path.length <= _MAX_PATH
    ? path
    : (({ stem, extension }) =>
        `${stem.slice(0, _MAX_PATH - extension.length - 9)}-${_fnv(file)}${extension}`)(
        _split(path)
      );

/** Путь медиатеки для файла связанной папки — без учёта столкновений: `<приставка>/<части по правилу>`. */
export var linkedPath = (prefix: string, file: string): string =>
  _fit(`${prefix}/${file.split('/').map(linkedSegment).join('/')}`, file);

/** Занятые имена медиатеки: пути и основы картинок — у картинок с одной основой были бы общие варианты. */
export type TakenNames = {
  readonly paths: Set<string>;
  readonly stems: Set<string>;
};

const _isImage = (path: string): boolean =>
  attempt(
    () => contentTypeOf(path as MediaPath).startsWith('image/'),
    () => false
  );

/** Имена, которые уже заняты файлами медиатеки. */
export var takenBy = (files: readonly Pick<MediaFile, 'path'>[]): TakenNames =>
  files.reduce<TakenNames>(
    (taken, _) => (
      taken.paths.add(_.path),
      void (_isImage(_.path) && taken.stems.add(stemOf(_.path))),
      taken
    ),
    { paths: new Set(), stems: new Set() }
  );

const _numbered = (path: string, n: number): string =>
  n === 1
    ? path
    : (({ stem, extension }) => `${stem}-${n}${extension}`)(_split(path));

const _free = (taken: TakenNames, path: string, image: boolean): boolean =>
  !taken.paths.has(path) && !(image && taken.stems.has(stemOf(path)));

const _first = (
  taken: TakenNames,
  base: string,
  image: boolean,
  n = 1
): string =>
  ((path) =>
    _free(taken, path, image) ? path : _first(taken, base, image, n + 1))(
    _numbered(base, n)
  );

/**
 * Пути медиатеки новым файлам связанной папки. Файлы — по порядку кодов символов пути на диске: первый
 * получает имя по правилу, следующий с тем же именем — `-2`, `-3`… перед расширением. Занятое раньше (другие
 * файлы медиатеки, уже связанные файлы) не отдаётся: имя файла, который уже в медиатеке, не меняется.
 */
export var assignLinkedPaths = (
  prefix: string,
  files: readonly string[],
  taken: TakenNames
): ReadonlyMap<string, MediaPath> =>
  files
    .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .reduce<Map<string, MediaPath>>(
      (names, file) =>
        ((base) =>
          ((image) =>
            ((path) => (
              taken.paths.add(path),
              void (image && taken.stems.add(stemOf(path))),
              names.set(file, path as MediaPath)
            ))(_first(taken, base, image)))(_isImage(base)))(
          linkedPath(prefix, file)
        ),
      new Map()
    );

/**
 * Приставка варианта картинки из базы, сделанного сервером: он, как варианты картинок папки, лежит в кэше
 * медиатеки, а в базе — только строка. Пропал из кэша — делается заново.
 */
export var CACHE_ONLY = '';

/** Файл связанной папки или вариант её картинки: меняется только сверкой папки. */
export var inLinkedFolder = (file: Pick<MediaFile, 'linked'>): boolean =>
  file.linked !== undefined && file.linked.prefix !== CACHE_ONLY;

/** Файл связанной папки: лежит в ней на диске. */
export var isLinkedOriginal = (file: Pick<MediaFile, 'linked'>): boolean =>
  file.linked !== undefined && file.linked.file !== null;

/** Вариант размера, сделанный сервером: лежит в кэше медиатеки, при пропаже делается заново. */
export var isDerived = (file: Pick<MediaFile, 'linked'>): boolean =>
  file.linked !== undefined && file.linked.file === null;
