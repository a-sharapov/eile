import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { posixPath } from '../../platform/paths.ts';
import { listZip, readZipRecord } from '../../platform/zip.ts';
import { attempt, isDomainError } from '../../shared/kernel/errors.ts';
import { entryOf, type Problem } from '../../workspace/index.ts';
import { MANIFEST, PACKAGE_LIMITS, type PackageFiles } from './format.ts';

/** Что прочитано из пакета и что в нём не так; при проблемах файлов может не быть. */
export type PackageRead = {
  readonly files: PackageFiles;
  readonly problems: readonly Problem[];
};

/** Вид файла пакета: от него зависят предел размера и то, что с файлом будет. */
export type PackageFileKind =
  | 'manifest'
  | 'element'
  | 'page'
  | 'media'
  /** README, LICENSE, CREDITS: едут в пакете, на сайт не ставятся. */
  | 'doc'
  /** Следы архиваторов и систем (`__MACOSX/`, `.DS_Store`): не читаются вовсе. */
  | 'junk';

const _JUNK = /(?:^|\/)(?:__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/;
const _DOC = /^(?:[^/]+\.(?:md|txt)|LICENSE|NOTICE|COPYING)$/;

/** Вид файла по пути; null — такого файла в пакете быть не может. */
export var kindOf = (path: string): PackageFileKind | null =>
  _JUNK.test(path)
    ? 'junk'
    : path === MANIFEST
      ? 'manifest'
      : entryOf(path) !== null || /^forms\/[^/]+\.json$/.test(path)
        ? 'element'
        : /^pages\/.+\.html$/.test(path)
          ? 'page'
          : /^media\/.+/.test(path)
            ? 'media'
            : _DOC.test(path)
              ? 'doc'
              : null;

const _limitOf = (kind: PackageFileKind): number =>
  kind === 'media' ? PACKAGE_LIMITS.media : PACKAGE_LIMITS.text;

const _problem = (file: string, code: string, message: string): Problem => ({
  file,
  code,
  message,
});

// Имя внутри архива — путь от корня пакета: без «\», абсолютных путей, «..», «.» и пустых частей.
// Распаковки на диск нет, но имя потом становится путём медиатеки и элемента.
const _unsafe = (name: string): string | null =>
  name.includes('\\')
    ? 'uses \\ instead of /'
    : name.startsWith('/') || /^[A-Za-z]:/.test(name)
      ? 'is an absolute path'
      : /\p{Cc}/u.test(name)
        ? 'has control characters'
        : name
              .replace(/\/$/, '')
              .split('/')
              .some((_) => _ === '' || _ === '.' || _ === '..')
          ? 'has empty, . or .. parts'
          : null;

type _Entry = {
  readonly name: string;
  readonly size: number;
  readonly symlink: boolean;
  readonly encrypted: boolean;
};

// Архив, собранный «папкой целиком», кладёт всё в одну папку верхнего уровня: она снимается, если
// манифест лежит в ней, а не в корне.
const _prefix = (names: readonly string[]): string =>
  ((top) =>
    !names.includes(MANIFEST) &&
    top.size === 1 &&
    names.includes(`${[...top][0]}/${MANIFEST}`)
      ? `${[...top][0]}/`
      : '')(
    new Set(
      names.filter((_) => !_JUNK.test(_)).map((_) => _.split('/')[0] ?? '')
    )
  );

const _entryProblems = (entry: _Entry, path: string): Problem[] =>
  ((reason, kind) =>
    reason
      ? [_problem(entry.name, 'package.unsafe_path', `The path ${reason}`)]
      : entry.symlink
        ? [
            _problem(
              entry.name,
              'package.symlink',
              'Symbolic links are not allowed in a package'
            ),
          ]
        : entry.encrypted
          ? [
              _problem(
                entry.name,
                'package.encrypted',
                'Encrypted files are not supported'
              ),
            ]
          : kind === null
            ? [
                _problem(
                  path,
                  'package.unknown_file',
                  'A package holds manifest.json, templates/, components/, scripts/, plugins/, forms/, fields.json, pages/, media/ and README or LICENSE files'
                ),
              ]
            : entry.size > _limitOf(kind)
              ? [
                  _problem(
                    path,
                    'package.file_too_large',
                    `${entry.size} bytes; at most ${_limitOf(kind)}`
                  ),
                ]
              : [])(_unsafe(entry.name), kindOf(path));

// Имена, одинаковые без учёта регистра: на macOS и Windows это один файл, в медиатеке — тоже.
const _duplicates = (paths: readonly string[]): Problem[] =>
  paths
    .filter(
      (path, index) =>
        paths.findIndex((_) => _.toLowerCase() === path.toLowerCase()) !== index
    )
    .map((_) =>
      _problem(
        _,
        'package.duplicate',
        'Two files with this name in the package'
      )
    );

const _totals = (entries: readonly _Entry[]): Problem[] => [
  ...(entries.length > PACKAGE_LIMITS.files
    ? [
        _problem(
          MANIFEST,
          'package.too_many_files',
          `${entries.length} files; at most ${PACKAGE_LIMITS.files}`
        ),
      ]
    : []),
  ...((total) =>
    total > PACKAGE_LIMITS.total
      ? [
          _problem(
            MANIFEST,
            'package.too_large',
            `${total} bytes unpacked; at most ${PACKAGE_LIMITS.total}`
          ),
        ]
      : [])(entries.reduce((sum, _) => sum + _.size, 0)),
];

/** Записи, которые станут файлами пакета, и что с ними не так — до чтения содержимого. */
const _plan = (
  entries: readonly _Entry[]
): {
  readonly keep: readonly { readonly entry: _Entry; readonly path: string }[];
  readonly problems: readonly Problem[];
} =>
  ((prefix) =>
    ((kept) => ({
      keep: kept,
      problems: [
        ...entries.flatMap((entry) =>
          _unsafe(entry.name)
            ? _entryProblems(entry, entry.name)
            : entry.name.endsWith('/') || _JUNK.test(entry.name)
              ? []
              : _entryProblems(entry, entry.name.slice(prefix.length))
        ),
        ..._duplicates(kept.map((_) => _.path)),
        ..._totals(kept.map((_) => _.entry)),
      ],
    }))(
      entries
        .filter((_) => !_.name.endsWith('/') && !_JUNK.test(_.name))
        .map((entry) => ({ entry, path: entry.name.slice(prefix.length) }))
    ))(_prefix(entries.map((_) => _.name)));

// Текст пакета — с переводами строк LF и без BOM, как папка элементов (ADR 0049): архив из папки на
// Windows с core.autocrlf совпадает с архивом той же папки на Linux.
const _TEXT: ReadonlySet<PackageFileKind> = new Set([
  'manifest',
  'element',
  'page',
  'doc',
]);

export var normalizeText = (bytes: Uint8Array): Uint8Array =>
  new TextEncoder().encode(
    new TextDecoder().decode(bytes).replace(/^﻿/, '').replaceAll('\r\n', '\n')
  );

const _content = (path: string, bytes: Uint8Array): Uint8Array =>
  _TEXT.has(kindOf(path) ?? 'junk') ? normalizeText(bytes) : bytes;

const _bad = (file: string, error: unknown): Problem =>
  _problem(
    file,
    isDomainError(error) ? error.code : 'package.unreadable',
    error instanceof Error ? error.message : String(error)
  );

type _Unpacked =
  | { readonly path: string; readonly data: Uint8Array }
  | { readonly problem: Problem };

const _collect = (unpacked: readonly _Unpacked[]): PackageRead => ({
  files: new Map(
    unpacked.flatMap((_) => ('data' in _ ? [[_.path, _.data] as const] : []))
  ),
  problems: unpacked.flatMap((_) => ('problem' in _ ? [_.problem] : [])),
});

/**
 * Пакет из архива zip: сначала каталог — пути, ссылки, шифрование, размеры по заголовкам, — и только
 * если всё в порядке, распаковка, не длиннее заявленного.
 */
export var readPackageZip = (
  bytes: Uint8Array,
  label = 'package.zip'
): PackageRead =>
  bytes.byteLength > PACKAGE_LIMITS.archive
    ? {
        files: new Map(),
        problems: [
          _problem(
            label,
            'package.too_large',
            `${bytes.byteLength} bytes; at most ${PACKAGE_LIMITS.archive}`
          ),
        ],
      }
    : attempt<PackageRead>(
        () =>
          ((records) =>
            ((plan) =>
              plan.problems.length > 0
                ? { files: new Map(), problems: plan.problems }
                : _collect(
                    plan.keep.map(({ entry, path }) =>
                      attempt<_Unpacked>(
                        () => ({
                          path,
                          data: _content(
                            path,
                            readZipRecord(bytes, records.get(entry.name)!)
                          ),
                        }),
                        (error) => ({ problem: _bad(path, error) })
                      )
                    )
                  ))(_plan([...records.values()])))(
            new Map(listZip(bytes).map((_) => [_.name, _]))
          ),
        (error) => ({ files: new Map(), problems: [_bad(label, error)] })
      );

// Скрытое (`.git`, `.gitattributes`, `.DS_Store`) и собранный архив рядом (`cms scaffold pack .`) в папке
// автора — не пакет.
const _hidden = (path: string): boolean =>
  /^[^/]+\.zip$/.test(path) || path.split('/').some((_) => _.startsWith('.'));

/** Пакет из распакованной папки — для авторов: те же правила, символьные ссылки — отказ. */
export var readPackageFolder = (dir: string): PackageRead =>
  attempt<PackageRead>(
    () =>
      ((entries) =>
        ((plan) =>
          plan.problems.length > 0
            ? { files: new Map(), problems: plan.problems }
            : {
                files: new Map(
                  plan.keep.map(({ path }) => [
                    path,
                    _content(
                      path,
                      new Uint8Array(readFileSync(join(dir, path)))
                    ),
                  ])
                ),
                problems: [],
              })(_plan(entries)))(
        readdirSync(dir, { recursive: true, withFileTypes: true })
          .map((_) => ({
            dirent: _,
            name: posixPath(relative(dir, join(_.parentPath, _.name))),
          }))
          .filter((_) => !_hidden(_.name) && !_.dirent.isDirectory())
          .map(
            ({ dirent, name }): _Entry => ({
              name,
              size: dirent.isSymbolicLink()
                ? 0
                : lstatSync(join(dir, name)).size,
              symlink: dirent.isSymbolicLink(),
              encrypted: false,
            })
          )
          .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      ),
    (error) => ({ files: new Map(), problems: [_bad(dir, error)] })
  );
