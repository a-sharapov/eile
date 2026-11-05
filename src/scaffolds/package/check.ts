import { createApp } from '../../app.ts';
import type { NewField } from '../../contexts/content/index.ts';
import { contentTypeOf, parseMediaPath } from '../../contexts/media/index.ts';
import { KIT, kitClosure } from '../../kit/index.ts';
import { attempt, isDomainError } from '../../shared/kernel/errors.ts';
import {
  entryOf,
  type Files,
  type Problem,
  push,
} from '../../workspace/index.ts';
import {
  applyScaffold,
  type Scaffold,
  type ScaffoldReport,
  translationTexts,
} from '../scaffold.ts';
import { packageScaffold, textOf } from './convert.ts';
import {
  MANIFEST,
  type Manifest,
  type ManifestPage,
  type PackageFiles,
  parseManifest,
} from './format.ts';
import { kindOf } from './read.ts';

/** Итог проверки пакета: каркас, готовый к установке, или всё, что ей мешает. */
export type PackageCheck = {
  readonly manifest: Manifest | null;
  readonly scaffold: Scaffold | null;
  /** Что ляжет на сайт — по пробной установке; null — до неё не дошло. */
  readonly report: ScaffoldReport | null;
  readonly problems: readonly Problem[];
};

export type CheckOptions = {
  /** Язык CLI: на нём заголовок и описание пакета. */
  readonly language: string;
  /** Плагины — код сервера: без разрешения пакет с ними не ставится. */
  readonly allowPlugins: boolean;
};

type _Placed = { readonly page: ManifestPage; readonly at: string };

const _flatten = (pages: readonly ManifestPage[], at = 'pages'): _Placed[] =>
  pages.flatMap((page, index) => [
    { page, at: `${at}[${index}]${page.key ? ` (${page.key})` : ''}` },
    ..._flatten(page.children ?? [], `${at}[${index}].children`),
  ]);

const _REF = /@\{([a-z][a-z0-9-]*)\}/g;
const _COMPONENT = /\[\[([A-Z][A-Za-z0-9]*)/g;
const _MODULE = /\[#([A-Z][A-Za-z0-9]*):([a-z0-9][a-z0-9-]{0,63})/g;
const _NUMERIC_LINK = /\[~\d+~\]/;
const _MEDIA_URL = /\/media\/([a-z0-9][a-z0-9._@/-]*\.[a-z0-9]+)/g;

const _problem = (file: string, code: string, message: string): Problem => ({
  file,
  code,
  message,
});

const _json = (files: PackageFiles, path: string): unknown =>
  attempt(
    () => JSON.parse(textOf(files, path)) as unknown,
    () => undefined
  );

// Битый JSON — проблема здесь: из него не собрать каркас для пробной установки.
const _jsonProblems = (files: PackageFiles): Problem[] =>
  [...files.keys()]
    .filter((_) => _ === 'fields.json' || /^forms\/[^/]+\.json$/.test(_))
    .flatMap((path) =>
      ((value) =>
        value === undefined
          ? [
              _problem(
                path,
                'workspace.invalid_json',
                `${path} is not valid JSON`
              ),
            ]
          : path === 'fields.json' && !Array.isArray(value)
            ? [
                _problem(
                  path,
                  'workspace.invalid_json',
                  'fields.json must be a list'
                ),
              ]
            : path !== 'fields.json' &&
                (typeof value !== 'object' ||
                  value === null ||
                  Array.isArray(value))
              ? [
                  _problem(
                    path,
                    'workspace.invalid_json',
                    `${path} must be an object`
                  ),
                ]
              : [])(_json(files, path))
    );

type _Known = {
  readonly keys: ReadonlySet<string>;
  readonly templates: ReadonlySet<string>;
  readonly components: ReadonlySet<string>;
  readonly forms: ReadonlySet<string>;
  readonly media: ReadonlySet<string>;
  readonly images: ReadonlySet<string>;
};

const _names = (files: PackageFiles, kind: string): Set<string> =>
  new Set(
    [...files.keys()]
      .filter((_) => entryOf(_)?.kind === kind)
      .map((_) => entryOf(_)!.name)
  );

// Ссылки в тексте: `@{key}` — на страницу пакета, `[[Name]]` — на компонент, `[#Form:name]` — на форму,
// `/media/…` — на файл пакета. Голый id (`[~12~]`) на новом сайте указал бы на чужую страницу.
const _refProblems = (
  file: string,
  where: string,
  text: string,
  keys: ReadonlySet<string>
): Problem[] =>
  [...text.matchAll(_REF)]
    .filter((_) => !keys.has(_[1]!))
    .map((_) =>
      _problem(
        file,
        'package.unknown_page',
        `${where}: no page with key "${_[1]}"`
      )
    );

const _textProblems = (
  file: string,
  where: string,
  text: string,
  known: _Known
): Problem[] => [
  ..._refProblems(file, where, text, known.keys),
  ...(_NUMERIC_LINK.test(text)
    ? [
        _problem(
          file,
          'package.numeric_link',
          `${where}: links by id do not survive install; write [~@{key}~]`
        ),
      ]
    : []),
  ...[...text.matchAll(_COMPONENT)]
    .filter((_) => !known.components.has(_[1]!))
    .map((_) =>
      _problem(
        file,
        'package.unknown_component',
        `${where}: [[${_[1]}]] — no components/${_[1]}.svelte and no kit component of that name`
      )
    ),
  ...[...text.matchAll(_MODULE)]
    .filter((_) => _[1] !== 'Form' || !known.forms.has(_[2]!))
    .map((_) =>
      _problem(
        file,
        'package.unknown_form',
        _[1] === 'Form'
          ? `${where}: [#Form:${_[2]}] — no forms/${_[2]}.html`
          : `${where}: there is no module ${_[1]}; only [#Form:name]`
      )
    ),
  ...[...text.matchAll(_MEDIA_URL)]
    .filter((_) => !/@\d+\.[a-z0-9]+$/.test(_[1]!) && !known.media.has(_[1]!))
    .map((_) =>
      _problem(file, 'package.unknown_media', `${where}: no media/${_[1]}`)
    ),
];

const _pageProblems = (
  { page, at }: _Placed,
  files: PackageFiles,
  known: _Known
): Problem[] => [
  ...(known.templates.has(page.template)
    ? []
    : [
        _problem(
          MANIFEST,
          'package.unknown_template',
          `${at}: no templates/${page.template}.svelte`
        ),
      ]),
  ...(page.content !== undefined && page.contentFile !== undefined
    ? [
        _problem(
          MANIFEST,
          'package.invalid_manifest',
          `${at}: content or contentFile, not both`
        ),
      ]
    : []),
  ...(page.contentFile !== undefined && !files.has(page.contentFile)
    ? [
        _problem(
          MANIFEST,
          'package.missing_file',
          `${at}: no ${page.contentFile}`
        ),
      ]
    : []),
  ..._textProblems(
    page.contentFile ?? MANIFEST,
    at,
    page.contentFile ? textOf(files, page.contentFile) : (page.content ?? ''),
    known
  ),
  ...Object.entries(page.fields ?? {})
    .filter(
      ({ 0: name, 1: value }) =>
        known.images.has(name) &&
        typeof value === 'string' &&
        value !== '' &&
        !/^https?:\/\//.test(value) &&
        !known.media.has(value)
    )
    .map(({ 0: name, 1: value }) =>
      _problem(
        MANIFEST,
        'package.unknown_media',
        `${at}: field ${name} — no media/${value}`
      )
    ),
];

const _mediaProblems = (path: string): Problem[] =>
  attempt(
    () =>
      ((name) =>
        parseMediaPath(name) === name
          ? (contentTypeOf(parseMediaPath(name)), [])
          : [
              _problem(
                path,
                'media.invalid_path',
                'Media paths are lowercase: rename the file'
              ),
            ])(path.slice('media/'.length)),
    (error) => [
      _problem(
        path,
        isDomainError(error) ? error.code : 'media.invalid_path',
        error instanceof Error ? error.message : String(error)
      ),
    ]
  );

// Текст перевода — на языке пакета или ветки пакета: на другом его не покажут ни сайт (`t()` берёт язык
// страницы, затем язык сайта), ни менеджер — колонки там по языкам сайта.
const _translationProblems = (
  manifest: Manifest,
  pages: readonly _Placed[],
  known: _Known
): Problem[] =>
  ((languages) =>
    Object.entries(manifest.translations ?? {}).flatMap(({ 0: key, 1: _ }) =>
      Object.entries(translationTexts(_, manifest.language)).flatMap(
        ({ 0: language, 1: text }) => [
          ...(languages.includes(language)
            ? []
            : [
                _problem(
                  MANIFEST,
                  'package.unknown_language',
                  `translations.${key}: ${language} is neither the package language (${manifest.language}) nor the language of a page${languages.length > 1 ? ` (${languages.slice(1).join(', ')})` : ''}`
                ),
              ]),
          ..._refProblems(
            MANIFEST,
            `translations.${key}.${language}`,
            text,
            known.keys
          ),
        ]
      )
    ))([
    ...new Set([
      manifest.language,
      ...pages.flatMap((_) => (_.page.language ? [_.page.language] : [])),
    ]),
  ]);

const _KIT_NAMES = new Set(KIT.map((_) => _.name));
const _PLUGIN_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;

const _known = (
  files: PackageFiles,
  manifest: Manifest,
  pages: readonly _Placed[]
): _Known => ({
  keys: new Set(pages.flatMap((_) => (_.page.key ? [_.page.key] : []))),
  templates: _names(files, 'template'),
  components: new Set([
    ..._names(files, 'component'),
    ...(manifest.kit ?? []).flatMap((_) =>
      kitClosure(_, manifest.language).map((entry) => entry.name)
    ),
  ]),
  forms: _names(files, 'form'),
  media: new Set(
    [...files.keys()]
      .filter((_) => _.startsWith('media/'))
      .map((_) => _.slice('media/'.length))
  ),
  images: new Set(
    ((fields) =>
      Array.isArray(fields)
        ? (fields as NewField[])
            .filter((_) => _.type === 'image')
            .map((_) => _.name)
        : [])(files.has('fields.json') ? _json(files, 'fields.json') : [])
  ),
});

/** Всё, что видно без сайта: ссылки, ключи, шаблоны, формы, набор, медиатека, плагины. */
const _staticProblems = (
  files: PackageFiles,
  manifest: Manifest,
  options: CheckOptions
): Problem[] =>
  ((pages) =>
    ((known) => [
      ..._jsonProblems(files),
      ...pages
        .flatMap((_) => (_.page.key ? [_.page.key] : []))
        .filter((key, index, keys) => keys.indexOf(key) !== index)
        .map((_) =>
          _problem(
            MANIFEST,
            'package.duplicate_key',
            `Two pages with key "${_}"`
          )
        ),
      ...[
        ['home', manifest.home],
        ['notFound', manifest.notFound],
      ]
        .filter(
          (_): _ is [string, string] =>
            _[1] !== undefined && !known.keys.has(_[1])
        )
        .map(({ 0: field, 1: key }) =>
          _problem(
            MANIFEST,
            'package.unknown_page',
            `${field}: no page with key "${key}"`
          )
        ),
      ...(manifest.kit ?? [])
        .filter((_) => !_KIT_NAMES.has(_))
        .map((_) =>
          _problem(
            MANIFEST,
            'package.unknown_kit',
            `kit: there is no kit component ${_}; there are ${[..._KIT_NAMES].join(', ')}`
          )
        ),
      ...pages.flatMap((_) => _pageProblems(_, files, known)),
      ...[...files.keys()]
        .filter(
          (_) =>
            kindOf(_) === 'page' &&
            !pages.some((placed) => placed.page.contentFile === _)
        )
        .map((_) =>
          _problem(
            _,
            'package.unused_file',
            'No page in manifest.json uses this file'
          )
        ),
      ...[...files.keys()]
        .filter((_) => entryOf(_)?.kind === 'form')
        .flatMap((_) => _refProblems(_, 'form', textOf(files, _), known.keys)),
      ...Object.entries(manifest.settings ?? {}).flatMap(({ 0: key, 1: _ }) =>
        _refProblems(
          MANIFEST,
          `settings.${key}`,
          typeof _ === 'string' ? _ : _.value,
          known.keys
        )
      ),
      ..._translationProblems(manifest, pages, known),
      ...(manifest.redirects ?? []).flatMap((_, index) => [
        ..._refProblems(MANIFEST, `redirects[${index}]`, _.to, known.keys),
        ...(_NUMERIC_LINK.test(_.to)
          ? [
              _problem(
                MANIFEST,
                'package.numeric_link',
                `redirects[${index}]: links by id do not survive install; write [~@{key}~]`
              ),
            ]
          : []),
      ]),
      ...[...files.keys()]
        .filter((_) => _.startsWith('media/'))
        .flatMap(_mediaProblems),
      ...Object.keys(manifest.media ?? {})
        .filter((_) => !known.media.has(_))
        .map((_) =>
          _problem(
            MANIFEST,
            'package.missing_file',
            `media["${_}"]: no media/${_}`
          )
        ),
      // Имя плагина — как требует extensions: проверка здесь, потому что плагин в пробной установке не
      // сохраняется.
      ...[...files.keys()]
        .filter(
          (_) =>
            entryOf(_)?.kind === 'plugin' &&
            !_PLUGIN_NAME.test(entryOf(_)!.name)
        )
        .map((_) =>
          _problem(
            _,
            'extensions.invalid_name',
            'Plugin names are PascalCase latin letters and digits'
          )
        ),
      ...(options.allowPlugins
        ? []
        : [...files.keys()]
            .filter((_) => entryOf(_)?.kind === 'plugin')
            .map((_) =>
              _problem(
                _,
                'package.plugins_refused',
                'Plugins are server code: the package is not installed without --allow-plugins'
              )
            )),
    ])(_known(files, manifest, pages)))(_flatten(manifest.pages));

// Элементы пакета — той же проверкой, что `cms elements check`: компиляция, имена, импорты, формы и
// поля, с файлом и строкой. Плагины не сохраняются и тут: сохранённый плагин сервер загрузил бы.
const _elementFiles = (files: PackageFiles): Files =>
  new Map(
    [...files.keys()]
      .filter((_) => kindOf(_) === 'element' && entryOf(_)?.kind !== 'plugin')
      .map((_) => [_, textOf(files, _)])
  );

const _withoutPlugins = (scaffold: Scaffold): Scaffold => ({
  ...scaffold,
  plugins: {},
});

/** Пробная установка на сайте в памяти: всё, что проверяет сам `applyScaffold`. */
const _trial = (
  files: PackageFiles,
  manifest: Manifest,
  options: CheckOptions
): PackageCheck =>
  ((scaffold, site) =>
    ((result) => (site.close(), result))(
      attempt(
        () =>
          ((kit) => {
            kit.forEach(
              (_) => void site.design.components.save(_.name, _.source)
            );
            const pushed = push(site, _elementFiles(files), { dryRun: true });
            return pushed.problems.length > 0
              ? { manifest, scaffold, report: null, problems: pushed.problems }
              : ((report) => ({
                  manifest,
                  scaffold,
                  report: {
                    ...report,
                    plugins: Object.keys(scaffold.plugins ?? {}).length,
                  },
                  problems: [],
                }))(applyScaffold(_withoutPlugins(scaffold), site));
          })(
            (manifest.kit ?? []).flatMap((_) =>
              kitClosure(_, manifest.language)
            )
          ),
        (error): PackageCheck => ({
          manifest,
          scaffold,
          report: null,
          problems: [
            _problem(
              MANIFEST,
              isDomainError(error) ? error.code : 'package.install_failed',
              error instanceof Error ? error.message : String(error)
            ),
          ],
        })
      )
    ))(packageScaffold(files, manifest, options.language), createApp());

/**
 * Проверка пакета до записи на сайт: манифест и формат, ссылки и ключи, медиатека, плагины, затем
 * элементы проверкой `cms elements check` и пробная установка на сайте в памяти. Ничего из пакета не
 * исполняется.
 */
export var checkPackage = (
  files: PackageFiles,
  options: CheckOptions
): PackageCheck =>
  ((parsed) =>
    parsed.manifest === null
      ? {
          manifest: null,
          scaffold: null,
          report: null,
          problems: parsed.problems,
        }
      : ((problems) =>
          problems.length > 0
            ? {
                manifest: parsed.manifest,
                scaffold: null,
                report: null,
                problems,
              }
            : _trial(files, parsed.manifest, options))(
          _staticProblems(files, parsed.manifest, options)
        ))(
    files.has(MANIFEST)
      ? parseManifest(textOf(files, MANIFEST))
      : {
          manifest: null,
          problems: [
            _problem(
              MANIFEST,
              'package.no_manifest',
              'The package has no manifest.json'
            ),
          ],
        }
  );
