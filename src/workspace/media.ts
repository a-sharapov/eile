import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { App } from '../app.ts';
import {
  checkSize,
  contentTypeOf,
  isResizable,
  type LinkReport,
  linkedSegment,
  type MediaFile,
  mediaHash,
  parseAlt,
  parseMediaPath,
  stemOf,
  stemOwner,
  type UnlinkReport,
  variantWidth,
} from '../contexts/media/index.ts';
import { type BodyBytes, openFile } from '../platform/body.ts';
import { isJunk } from '../platform/paths.ts';
import { attempt, fail, rethrow } from '../shared/kernel/errors.ts';
import { pathOf } from './layout.ts';
import { type Problem, problemOf } from './workspace.ts';

// Медиатека из папки (ADR 0058): путь в медиатеке — путь файла от корня папки, с приставкой `--into`.

export type MediaServices = Pick<App, 'media' | 'content' | 'design' | 'site'>;

/** Описания картинок в корне папки: путь от корня папки → `{ "alt": "…" }`, как `media` в манифесте пакета. */
export var MEDIA_JSON = 'media.json';

/** Файл папки: путь в медиатеке и где он лежит в папке. */
export type MediaEntry = {
  readonly path: string;
  /** От корня папки, через «/». */
  readonly file: string;
  readonly size: number;
};

/** Папка медиатеки: файлы, описания по путям в медиатеке и что не так — всё сразу. */
export type MediaFolder = {
  readonly dir: string;
  /** Приставка путей в медиатеке; пусто — корень. */
  readonly into: string;
  readonly entries: readonly MediaEntry[];
  readonly alts: ReadonlyMap<string, string>;
  readonly problems: readonly Problem[];
};

/** Файл медиатеки, которого нет в папке, но удалять его нельзя: где он стоит. */
export type KeptFile = {
  readonly path: string;
  /** Страницы, где он лежит: в тексте, в полях, картинкой для соцсетей. */
  readonly pages: readonly { readonly id: number; readonly title: string }[];
  /** Картинка сайта для соцсетей в настройках. */
  readonly site: boolean;
  /** Шаблоны, компоненты и скрипты, в исходнике которых есть его путь. */
  readonly elements: readonly string[];
};

export type MediaPushReport = {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  /** Содержимое то же, сменилось только описание из media.json. */
  readonly described: readonly string[];
  /** Удалены: файла нет в папке, и попросили `--prune`. */
  readonly removed: readonly string[];
  /** Нет в папке, но остались: на них ссылаются страницы, сайт или элементы. */
  readonly kept: readonly KeptFile[];
  /** Нет в папке, остались в медиатеке: без `--prune` ничего не удаляется. */
  readonly missing: readonly string[];
  /** Сколько файлов совпали с медиатекой. */
  readonly same: number;
  /** Сколько вариантов размеров картинок сервер сделал после отправки. */
  readonly variants: number;
  readonly problems: readonly Problem[];
  /** Записано в медиатеку: нет проблем и это не проверка. */
  readonly saved: boolean;
};

export type MediaPushOptions = {
  /** Удалить из медиатеки файлы, которых нет в папке (с `into` — только под приставкой). */
  readonly prune?: boolean;
  /** Только показать, что изменится. */
  readonly dryRun?: boolean;
};

/** Приставка `--into`: латиница в нижнем регистре по частям, как путь медиатеки; «/» по краям не в счёт. */
export var parseInto = (raw: string): string =>
  ((into) =>
    into === '' ||
    attempt(
      () => parseMediaPath(`${into}/x.x`) === `${into}/x.x`,
      () => false
    )
      ? into
      : fail(
          'media.invalid_path',
          `"${raw}" must be lowercase latin segments like fonts or images/summer`
        ))(raw.trim().replace(/^\/+|\/+$/g, ''));

type _Found = {
  readonly file: string;
  readonly size: number;
  readonly symlink: boolean;
};

// Скрытое (`.git`, `.DS_Store`) и следы архиваторов не читаются вовсе; скрытые папки не обходятся.
const _walk = (dir: string, at: string): _Found[] =>
  readdirSync(join(dir, at), { withFileTypes: true })
    .filter((_) => !_.name.startsWith('.'))
    .flatMap((dirent) =>
      ((file): _Found[] =>
        dirent.isDirectory()
          ? isJunk(`${file}/`)
            ? []
            : _walk(dir, file)
          : (dirent.isFile() || dirent.isSymbolicLink()) &&
              !isJunk(file) &&
              file !== MEDIA_JSON
            ? [
                {
                  file,
                  size: dirent.isSymbolicLink()
                    ? 0
                    : statSync(join(dir, file)).size,
                  symlink: dirent.isSymbolicLink(),
                },
              ]
            : [])(at === '' ? dirent.name : `${at}/${dirent.name}`)
    );

// Порядок кодов символов, а не localeCompare: одна папка — один порядок на любой машине.
const _byFile = (a: _Found, b: _Found): number =>
  a.file < b.file ? -1 : a.file > b.file ? 1 : 0;

const _problem = (file: string, code: string, message: string): Problem => ({
  file,
  code,
  message,
});

// Путь — как в медиатеке, без молчаливой правки: `Photo.JPG` в медиатеке стал бы другим именем, чем в git.
const _entryProblems = (found: _Found, path: string): Problem[] =>
  found.symlink
    ? [
        _problem(
          found.file,
          'workspace.symlink',
          'Symbolic links are not allowed: copy the file into the folder'
        ),
      ]
    : attempt(
        () =>
          parseMediaPath(path) === path
            ? (contentTypeOf(parseMediaPath(path)), checkSize(found.size), [])
            : [
                _problem(
                  found.file,
                  'media.invalid_path',
                  'Media paths are lowercase: rename the file'
                ),
              ],
        (error) => [problemOf(found.file, error)]
      );

// Путь картинки JPEG, PNG или WebP: у неё бывают варианты размеров. Путь уже проверен правилами папки.
const _resizable = (path: string): boolean =>
  attempt(
    () =>
      ((parsed) =>
        isResizable({ path: parsed, contentType: contentTypeOf(parsed) }))(
        parseMediaPath(path)
      ),
    () => false
  );

// Две картинки папки с одной основой (`photo.jpg` и `photo.png`) делили бы варианты размеров `photo@960.webp`.
const _stemProblems = (entries: readonly MediaEntry[]): Problem[] =>
  entries
    .filter((_) => _resizable(_.path))
    .reduce<{
      owners: Map<string, string>;
      problems: Problem[];
    }>(
      (acc, entry) =>
        ((owner) =>
          owner === undefined
            ? (acc.owners.set(stemOf(entry.path), entry.file), acc)
            : {
                ...acc,
                problems: [
                  ...acc.problems,
                  _problem(
                    entry.file,
                    'media.stem_taken',
                    `${entry.file} and ${owner} differ only in the extension, and image sizes are named without it: rename one of them`
                  ),
                ],
              })(acc.owners.get(stemOf(entry.path))),
      { owners: new Map(), problems: [] }
    ).problems;

const _isObject = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Схема media.json — та же, что у `media` в манифесте пакета: незнакомое поле — ошибка, ничего не теряется молча.
const _shapeProblems = (value: unknown): string[] =>
  _isObject(value)
    ? Object.entries(value).flatMap(({ 0: file, 1: entry }) =>
        _isObject(entry)
          ? Object.entries(entry).flatMap(({ 0: key, 1: _ }) =>
              key !== 'alt'
                ? [`${MEDIA_JSON}["${file}"].${key} is not part of the format`]
                : typeof _ === 'string'
                  ? []
                  : [`${MEDIA_JSON}["${file}"].alt must be a string`]
            )
          : [`${MEDIA_JSON}["${file}"] must be an object`]
      )
    : [`${MEDIA_JSON} must be an object of path → { "alt": "…" }`];

type _Alts = {
  readonly alts: ReadonlyMap<string, string>;
  readonly problems: readonly Problem[];
};

const _NO_ALTS: _Alts = { alts: new Map(), problems: [] };

const _text = (dir: string): string =>
  readFileSync(join(dir, MEDIA_JSON), 'utf8').replace(/^﻿/, '');

// Описания: ключ — файл папки, значение — `parseAlt`; ошибки — по ключу, все сразу. `pathOf` — под каким
// ключом описание пойдёт дальше; undefined — такого файла в папке нет.
const _altsOf = (
  raw: Readonly<Record<string, { readonly alt?: string }>>,
  pathOf: (file: string) => string | undefined
): _Alts =>
  Object.entries(raw).reduce<_Alts>(
    (acc, { 0: file, 1: entry }) =>
      pathOf(file) === undefined
        ? {
            ...acc,
            problems: [
              ...acc.problems,
              _problem(
                MEDIA_JSON,
                'workspace.unknown_media',
                `"${file}": there is no such file in the folder`
              ),
            ],
          }
        : entry.alt === undefined
          ? acc
          : attempt<_Alts>(
              () => ({
                ...acc,
                alts: new Map([
                  ...acc.alts,
                  [pathOf(file)!, parseAlt(entry.alt!)],
                ]),
              }),
              (error) => ({
                ...acc,
                problems: [...acc.problems, problemOf(MEDIA_JSON, error)],
              })
            ),
    _NO_ALTS
  );

const _readAlts = (
  dir: string,
  pathOf: (file: string) => string | undefined
): _Alts =>
  existsSync(join(dir, MEDIA_JSON))
    ? attempt<_Alts>(
        () =>
          ((raw: unknown) =>
            ((shape) =>
              shape.length > 0
                ? {
                    alts: new Map(),
                    problems: shape.map((_) =>
                      _problem(MEDIA_JSON, 'workspace.invalid_media_json', _)
                    ),
                  }
                : _altsOf(
                    raw as Readonly<Record<string, { alt?: string }>>,
                    pathOf
                  ))(_shapeProblems(raw)))(JSON.parse(_text(dir))),
        (error) => ({
          alts: new Map(),
          problems: [
            _problem(
              MEDIA_JSON,
              'workspace.invalid_json',
              error instanceof Error ? error.message : String(error)
            ),
          ],
        })
      )
    : _NO_ALTS;

/**
 * Папка медиатеки: файлы с путями в медиатеке, описания из media.json и все нарушения правил медиатеки — до
 * чтения содержимого. Нет папки — отказ.
 */
export var readMediaFolder = (dir: string, into = ''): Promise<MediaFolder> =>
  Promise.resolve(dir).then((root) =>
    ((found) =>
      ((entries) =>
        ((alts) => ({
          dir: root,
          into,
          entries: entries.map((_) => _.entry),
          alts: alts.alts,
          problems: ((own) => [
            ...own,
            // Основы — только у файлов с правильными путями: иначе одна ошибка дала бы две.
            ...(own.length > 0
              ? []
              : _stemProblems(entries.map((_) => _.entry))),
            ...alts.problems,
          ])(entries.flatMap((_) => _entryProblems(_.found, _.entry.path))),
        }))(
          ((files) => _readAlts(root, (file) => files.get(file)))(
            new Map(entries.map((_) => [_.entry.file, _.entry.path]))
          )
        ))(
        found.map((_) => ({
          found: _,
          entry: {
            path: into === '' ? _.file : `${into}/${_.file}`,
            file: _.file,
            size: _.size,
          },
        }))
      ))(_walk(root, '').toSorted(_byFile))
  );

// Файл с диска — окнами по 1 МиБ и закрывается при любом исходе: 25 МиБ видео в памяти целиком не лежат.
const _withFile = <T>(path: string, run: (content: BodyBytes) => T): T =>
  ((content) =>
    attempt(
      () => ((result) => (content.close(), result))(run(content)),
      (error) => (content.close(), rethrow(error))
    ))(openFile(path));

type _State = 'added' | 'changed' | 'same';

// Другой размер — другой файл, хэш не нужен; тот же размер — сверка по хэшу содержимого медиатеки.
const _stateOf =
  (dir: string, library: ReadonlyMap<string, MediaFile>) =>
  (entry: MediaEntry): _State =>
    ((current) =>
      current === undefined
        ? 'added'
        : current.size !== entry.size ||
            _withFile(join(dir, entry.file), mediaHash) !== current.hash
          ? 'changed'
          : 'same')(library.get(entry.path));

const _inScope =
  (into: string) =>
  (path: string): boolean =>
    into === '' || path.startsWith(`${into}/`);

const _isVariant = (file: MediaFile): boolean =>
  variantWidth(file.path) !== null;

// Кто держит файл: страницы (то же правило, что у менеджера), картинка сайта и исходники элементов.
const _holders = (services: MediaServices) => {
  const sources = services.design.elements.list().map((_) => ({
    file: pathOf(_.kind, _.name),
    source: services.design.elements.get(_.kind, _.name)?.source ?? '',
  }));
  const social = services.site.settings.get().socialImage;
  return (path: string): KeptFile => ({
    path,
    pages: services.content.usage
      .media(path)
      .map((_) => ({ id: _.id, title: _.title })),
    site: social === path,
    elements: sources.filter((_) => _.source.includes(path)).map((_) => _.file),
  });
};

const _held = (_: KeptFile): boolean =>
  _.pages.length > 0 || _.site || _.elements.length > 0;

type _Prune = {
  readonly remove: readonly string[];
  readonly kept: readonly KeptFile[];
  readonly missing: readonly string[];
};

/**
 * Что удалить с `--prune`: оригиналы без файла в папке, а их варианты размеров — только если не остался ни
 * один оригинал того же изображения. Файлы, на которые ссылаются, остаются со своей причиной.
 */
const _prunePlan = (
  services: MediaServices,
  folder: MediaFolder,
  library: readonly MediaFile[],
  prune: boolean
): _Prune => {
  const wanted = new Set(folder.entries.map((_) => _.path));
  const absent = library.filter(
    (_) => _inScope(folder.into)(_.path) && !wanted.has(_.path)
  );
  const originals = absent.filter((_) => !_isVariant(_));
  const holders = _holders(services);
  const checked = prune ? originals.map((_) => holders(_.path)) : [];
  const gone = new Set(checked.filter((_) => !_held(_)).map((_) => _.path));
  // Варианты держит только картинка, что остаётся по тому же пути. Новой картинке с той же основой (замена
  // формата `photo.jpg` → `photo.webp`) прежние варианты показывали бы старую — они уходят, сервер сделает свои.
  const stems = new Set(
    library
      .filter((_) => isResizable(_) && !gone.has(_.path))
      .map((_) => stemOf(_.path))
  );
  const variants = prune
    ? absent
        .filter((_) => _isVariant(_) && !stems.has(stemOf(_.path)))
        .map((_) => holders(_.path))
    : [];
  return prune
    ? {
        remove: [
          ...gone,
          ...variants.filter((_) => !_held(_)).map((_) => _.path),
        ].sort(),
        kept: [...checked, ...variants]
          .filter(_held)
          .toSorted((a, b) => (a.path < b.path ? -1 : 1)),
        missing: [],
      }
    : { remove: [], kept: [], missing: originals.map((_) => _.path) };
};

type _Plan = {
  readonly added: readonly MediaEntry[];
  readonly changed: readonly MediaEntry[];
  readonly described: readonly string[];
  readonly same: number;
  readonly prune: _Prune;
  /** Удалить до записи: картинки, чью основу занимает новая картинка папки, и их варианты. */
  readonly free: readonly string[];
  /** Новая картинка с основой картинки, которая остаётся: не пишется ничего. */
  readonly problems: readonly Problem[];
};

// Новая картинка папки и картинка медиатеки с той же основой: с `--prune` прежняя уходит до записи новой,
// иначе — отказ с причиной.
const _stemPlan = (
  added: readonly MediaEntry[],
  library: readonly MediaFile[],
  prune: _Prune,
  pruning: boolean
): Pick<_Plan, 'free' | 'problems'> =>
  ((clashes) =>
    ((freed) => ({
      free: prune.remove.filter((_) => freed.has(stemOf(_))),
      problems: clashes
        .filter((_) => !prune.remove.includes(_.owner))
        .map(({ entry, owner }) =>
          _problem(
            entry.file,
            'media.stem_taken',
            pruning
              ? `${entry.path} differs from ${owner} only in the extension, and ${owner} stays because it is in use: image sizes are named without the extension — rename the new file`
              : `${entry.path} differs from ${owner} only in the extension, and image sizes are named without it: push with --prune to replace ${owner}, or rename the new file`
          )
        ),
    }))(
      new Set(
        clashes
          .filter((_) => prune.remove.includes(_.owner))
          .map((_) => stemOf(_.entry.path))
      )
    ))(
    added.flatMap((entry) =>
      ((owner) => (owner === null ? [] : [{ entry, owner }]))(
        ((path) =>
          stemOwner(
            { path, contentType: contentTypeOf(path) },
            library.filter((_) => stemOf(_.path) === stemOf(path))
          ))(parseMediaPath(entry.path))
      )
    )
  );

const _plan = (
  services: MediaServices,
  folder: MediaFolder,
  prune: boolean
): _Plan =>
  ((library) =>
    ((byPath) =>
      ((states) =>
        ((added, pruned) => ({
          added,
          changed: states
            .filter((_) => _.state === 'changed')
            .map((_) => _.entry),
          described: states
            .filter(
              (_) =>
                _.state === 'same' &&
                folder.alts.has(_.entry.path) &&
                folder.alts.get(_.entry.path) !== byPath.get(_.entry.path)!.alt
            )
            .map((_) => _.entry.path),
          same: states.filter((_) => _.state === 'same').length,
          prune: pruned,
          ..._stemPlan(added, library, pruned, prune),
        }))(
          states.filter((_) => _.state === 'added').map((_) => _.entry),
          _prunePlan(services, folder, library, prune)
        ))(
        folder.entries.map((entry) => ({
          entry,
          state: _stateOf(folder.dir, byPath)(entry),
        }))
      ))(new Map(library.map((_) => [_.path as string, _]))))(
    // Файлы связанных папок — не этой команды: их меняет cms media link (ADR 0065).
    services.media.files.list().filter((_) => _.linked === undefined)
  );

const _tryAt = (file: string, run: () => void): Problem | null =>
  attempt(
    () => (run(), null),
    (error) => problemOf(file, error)
  );

// Файл — обычной записью медиатеки, как загрузка из менеджера: события, `?v=`, кэш страниц, очередь вариантов.
const _save =
  (services: MediaServices, folder: MediaFolder) =>
  (entry: MediaEntry): Problem | null =>
    _tryAt(entry.file, () =>
      ((saved) =>
        void (
          folder.alts.has(entry.path) &&
          folder.alts.get(entry.path) !== saved.alt &&
          services.media.files.describe(
            entry.path,
            folder.alts.get(entry.path)!
          )
        ))(
        _withFile(join(folder.dir, entry.file), (content) =>
          services.media.files.save({ path: entry.path, data: content })
        )
      )
    );

const _describe =
  (services: MediaServices, folder: MediaFolder) =>
  (path: string): Problem | null =>
    _tryAt(
      MEDIA_JSON,
      () => void services.media.files.describe(path, folder.alts.get(path)!)
    );

const _remove =
  (services: MediaServices) =>
  (path: string): Problem | null =>
    _tryAt(path, () => services.media.files.remove(path));

const _problems = (done: readonly (Problem | null)[]): Problem[] =>
  done.filter((_): _ is Problem => _ !== null);

type _Written = {
  readonly problems: readonly Problem[];
  readonly removed: readonly string[];
};

type _Removal = { readonly path: string; readonly problem: Problem | null };

const _removeAll = (
  services: MediaServices,
  paths: readonly string[]
): _Removal[] =>
  paths.map((path) => ({ path, problem: _remove(services)(path) }));

const _done = (removals: readonly _Removal[]): string[] =>
  removals.filter((_) => _.problem === null).map((_) => _.path);

// По файлу, а не одной транзакцией: каждая запись коротка, сервер на той же базе не ждёт всю папку, а
// прерванную отправку доделает повтор — совпавшие файлы он пропустит. Удаление — только после удачной записи;
// раньше — лишь картинки, чью основу занимает новая картинка папки: иначе её не записать.
const _write = (
  services: MediaServices,
  folder: MediaFolder,
  plan: _Plan
): _Written =>
  ((freed) =>
    ((written) =>
      written.length > 0
        ? { problems: written, removed: _done(freed) }
        : ((removals) => ({
            problems: _problems(removals.map((_) => _.problem)),
            removed: [..._done(freed), ..._done(removals)].sort(),
          }))(
            _removeAll(
              services,
              plan.prune.remove.filter((_) => !plan.free.includes(_))
            )
          ))(
      _problems([
        ...freed.map((_) => _.problem),
        ...[...plan.added, ...plan.changed].map(_save(services, folder)),
        ...plan.described.map(_describe(services, folder)),
      ])
    ))(_removeAll(services, plan.free));

const _report = (
  plan: _Plan,
  written: _Written,
  variants: number,
  dryRun: boolean
): MediaPushReport => ({
  added: plan.added.map((_) => _.path),
  changed: plan.changed.map((_) => _.path),
  described: plan.described,
  removed: dryRun ? plan.prune.remove : written.removed,
  kept: plan.prune.kept,
  missing: plan.prune.missing,
  same: plan.same,
  variants,
  problems: written.problems,
  saved: !dryRun && written.problems.length === 0,
});

const _NOTHING: _Written = { problems: [], removed: [] };

const _EMPTY: _Plan = {
  added: [],
  changed: [],
  described: [],
  same: 0,
  prune: { remove: [], kept: [], missing: [] },
  free: [],
  problems: [],
};

/**
 * Папка — в медиатеку: новые и изменённые файлы сохраняются, совпавшие пропускаются, описания из media.json
 * ставятся, с `prune` — лишнее удаляется. Нарушения правил в папке — все сразу, и тогда не читается и не
 * пишется ничего. Варианты размеров картинок сервер делает сразу после записи.
 */
export var pushMedia = (
  services: MediaServices,
  folder: MediaFolder,
  options: MediaPushOptions = {}
): Promise<MediaPushReport> =>
  Promise.resolve(folder).then((_) =>
    _.problems.length > 0
      ? _report(_EMPTY, { problems: _.problems, removed: [] }, 0, true)
      : ((plan) =>
          plan.problems.length > 0
            ? _report(_EMPTY, { problems: plan.problems, removed: [] }, 0, true)
            : options.dryRun
              ? _report(plan, _NOTHING, 0, true)
              : ((written) =>
                  services.media.variants
                    .run()
                    .then((variants) =>
                      _report(plan, written, variants, false)
                    ))(_write(services, _, plan)))(
          _plan(services, _, options.prune === true)
        )
  );

// --- связанная папка (ADR 0065) ---------------------------------------------

export type MediaLinkOptions = {
  /** Приставка путей медиатеки; не задана — имя папки по правилу имён связанной папки. */
  readonly into?: string;
  /** Отдавать файлы и по исходным адресам; не задано — как было (у новой папки — нет). */
  readonly serveOriginal?: boolean;
  /** Папка-сайт (ADR 0068): статический сайт по `/<приставка>/…`, без строк в медиатеке. */
  readonly staticSite?: boolean;
  readonly dryRun?: boolean;
};

/** Итог `cms media link` по одной папке: сверка, варианты картинок и проблемы media.json. */
export type MediaLinkReport = LinkReport & {
  /** Сколько вариантов размеров картинок сделано после сверки. */
  readonly variants: number;
  readonly problems: readonly Problem[];
};

/** Приставка по умолчанию — имя папки: `old_assets` → `old_assets`, `Фото` → `foto`. */
export var defaultPrefix = (dir: string): string =>
  linkedSegment(basename(resolve(dir)));

const _unknown = (files: readonly string[]): Problem[] =>
  files.map((file) =>
    _problem(
      MEDIA_JSON,
      'workspace.unknown_media',
      `"${file}": there is no such file in the folder`
    )
  );

const _refused = (
  report: LinkReport,
  problems: readonly Problem[]
): MediaLinkReport => ({
  ...report,
  added: [],
  changed: [],
  removed: [],
  described: [],
  queued: 0,
  saved: false,
  variants: 0,
  problems,
});

/**
 * Папка на диске — в медиатеку без байтов в базе: связать впервые или сверить. Описания — из media.json в
 * корне папки, ключи — пути на диске от корня; ошибка в нём — ничего не записано. Варианты картинок сервер
 * делает сразу после сверки: `image()` отдаёт srcset, как только команда закончилась. Папка-сайт
 * (`staticSite`, ADR 0068) записывается только сама: её файлы не медиатека.
 */
export var linkMedia = (
  services: Pick<App, 'media'>,
  dir: string,
  options: MediaLinkOptions = {}
): Promise<MediaLinkReport> =>
  Promise.resolve(dir).then((root) =>
    (options.staticSite ??
    services.media.links
      .list()
      .find((_) => _.prefix === (options.into ?? defaultPrefix(root)))
      ?.staticSite)
      ? _linkStatic(services, root, options)
      : _linkFolder(services, root, options)
  );

// Папка-сайт: ни media.json, ни вариантов — только сама папка (ADR 0068).
const _linkStatic = (
  services: Pick<App, 'media'>,
  root: string,
  options: MediaLinkOptions
): MediaLinkReport => ({
  ...services.media.links.sync({
    dir: root,
    prefix: options.into ?? defaultPrefix(root),
    staticSite: true,
    ...(options.serveOriginal === undefined
      ? {}
      : { serveOriginal: options.serveOriginal }),
    ...(options.dryRun ? { dryRun: true } : {}),
  }),
  variants: 0,
  problems: [],
});

const _linkFolder = (
  services: Pick<App, 'media'>,
  root: string,
  options: MediaLinkOptions
): MediaLinkReport | Promise<MediaLinkReport> => {
  const alts = _readAlts(root, (file) => file);
  const input = {
    dir: root,
    prefix: options.into ?? defaultPrefix(root),
    ...(options.serveOriginal === undefined
      ? {}
      : { serveOriginal: options.serveOriginal }),
    ...(options.staticSite === false ? { staticSite: false } : {}),
    alts: alts.alts,
  };
  // Пробный проход — без записи и без хэшей новых файлов: ключи media.json сверяются до записи.
  const check =
    alts.problems.length > 0 || alts.alts.size > 0 || options.dryRun
      ? services.media.links.sync({ ...input, dryRun: true })
      : null;
  const problems =
    alts.problems.length > 0
      ? alts.problems
      : _unknown(check?.unknownAlts ?? []);
  return check !== null && problems.length > 0
    ? _refused(check, problems)
    : check !== null && options.dryRun
      ? { ...check, variants: 0, problems: [] }
      : ((report) =>
          services.media.variants
            .run()
            .then((variants) => ({ ...report, variants, problems: [] })))(
          services.media.links.sync(input)
        );
};

/** Сверить все связанные папки (или одну, `into`) с их местом на диске, как оно записано. */
export var relinkMedia = (
  services: Pick<App, 'media'>,
  options: MediaLinkOptions = {}
): Promise<MediaLinkReport[]> =>
  services.media.links
    .list()
    .filter((_) => options.into === undefined || _.prefix === options.into)
    .reduce<Promise<MediaLinkReport[]>>(
      (done, link) =>
        done.then((reports) =>
          linkMedia(services, link.dir, { ...options, into: link.prefix }).then(
            (_) => [...reports, _]
          )
        ),
      Promise.resolve([])
    );

/** Отвязать папку: её файлы и варианты уходят из медиатеки вместе с описаниями; сами файлы на диске остаются. */
export var unlinkMedia = (
  services: Pick<App, 'media'>,
  prefix: string,
  options: { readonly dryRun?: boolean } = {}
): Promise<UnlinkReport> =>
  Promise.resolve(prefix).then((_) =>
    services.media.links.unlink(_, options.dryRun === true)
  );
