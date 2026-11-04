import type { FieldValue } from '../../contexts/content/index.ts';
import { MAX_MEDIA_SIZE } from '../../contexts/media/index.ts';
import { attempt } from '../../shared/kernel/errors.ts';
import type { Problem } from '../../workspace/index.ts';

// Пакет каркаса (ADR 0056): zip с manifest.json и файлами в раскладке папки элементов. Ничего из пакета
// не исполняется при установке: манифест — данные, элементы только компилируются.

/** Версия формата: поле `format` манифеста. Пакет новее этой версии просит более новую cms. */
export var PACKAGE_FORMAT = 1;

export var MANIFEST = 'manifest.json';

const _MIB = 1024 * 1024;

/** Пределы пакета: проверяются по каталогу архива, до распаковки. */
export var PACKAGE_LIMITS = {
  /** Файлов в пакете. */
  files: 1000,
  /** Всех файлов вместе, распакованных. */
  total: 64 * _MIB,
  /** Файла медиатеки — как у самой медиатеки. */
  media: MAX_MEDIA_SIZE,
  /** Любого другого файла: столько же, сколько у скрипта сайта. */
  text: 2 * _MIB,
  /** Самого архива: файлы и заголовки zip. */
  archive: 65 * _MIB,
} as const;

/** Файлы пакета по путям от его корня: `templates/Page.svelte` → байты. */
export type PackageFiles = ReadonlyMap<string, Uint8Array>;

/** Текст одной строкой или по языкам: `{ "de": "…", "en": "…" }`. */
export type Localized = string | Readonly<Record<string, string>>;

/** Своя настройка: значение строкой или с пояснением для менеджера. */
export type ManifestSetting =
  | string
  | { readonly value: string; readonly note?: string };

/** Страница манифеста: поля `NewPage`, текст — строкой или файлом из `pages/`. */
export type ManifestPage = {
  readonly key?: string;
  readonly title: string;
  readonly template: string;
  readonly kind?: 'page' | 'link';
  readonly alias?: string;
  readonly longTitle?: string;
  readonly menuTitle?: string;
  readonly description?: string;
  readonly introText?: string;
  readonly contentType?: string;
  readonly linkTo?: string;
  readonly hiddenFromMenu?: boolean;
  readonly cacheable?: boolean;
  readonly searchable?: boolean;
  readonly socialImage?: string;
  readonly language?: string;
  readonly content?: string;
  /** Текст страницы файлом: `pages/home.html`. */
  readonly contentFile?: string;
  readonly fields?: Readonly<Record<string, FieldValue | null>>;
  readonly children?: readonly ManifestPage[];
};

export type Manifest = {
  readonly format: number;
  readonly name: string;
  readonly title: Localized;
  readonly summary: Localized;
  /** Язык сайта. */
  readonly language: string;
  readonly siteName: string;
  readonly description?: string;
  /** Компоненты набора; их зависимости ставятся сами. */
  readonly kit?: readonly string[];
  readonly settings?: Readonly<Record<string, ManifestSetting>>;
  /** Описания картинок: путь в медиатеке → `{ alt }`. Файлы — в `media/`. */
  readonly media?: Readonly<Record<string, { readonly alt?: string }>>;
  readonly pages: readonly ManifestPage[];
  readonly home: string;
  readonly notFound?: string;
};

/** Имя пакета: как имя каркаса в `cms new`; `cms-…` занято файлами выпуска. */
export var PACKAGE_NAME = /^(?!cms-)[a-z][a-z0-9-]{1,39}$/;

/** Ключ страницы для ссылок `@{key}` — тот же, что у встроенных каркасов. */
export var PAGE_KEY = /^[a-z][a-z0-9-]*$/;

const _LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const _SETTING_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Текст на языке: свой, иначе язык пакета, иначе первый. */
export var localized = (
  text: Localized,
  language: string,
  fallback: string
): string =>
  typeof text === 'string'
    ? text
    : (text[language] ?? text[fallback] ?? Object.values(text)[0] ?? '');

// Схема манифеста: проверка — список сообщений «где: что не так», пустой — всё верно.
type _Check = (value: unknown, at: string) => readonly string[];

const _isObject = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const _at = (base: string, key: string): string =>
  base === '' ? key : `${base}.${key}`;

const _is =
  (what: string, test: (value: unknown) => boolean): _Check =>
  (value, at) =>
    test(value) ? [] : [`${at} must be ${what}`];

const _string = _is('a string', (_) => typeof _ === 'string');
const _boolean = _is('true or false', (_) => typeof _ === 'boolean');

const _matches = (pattern: RegExp, what: string): _Check =>
  _is(what, (_) => typeof _ === 'string' && pattern.test(_));

const _list =
  (item: _Check): _Check =>
  (value, at) =>
    Array.isArray(value)
      ? value.flatMap((_, index) => item(_, `${at}[${index}]`))
      : [`${at} must be a list`];

const _map =
  (key: _Check, item: _Check): _Check =>
  (value, at) =>
    _isObject(value)
      ? Object.entries(value).flatMap(({ 0: name, 1: _ }) => [
          ...key(name, `${at} key "${name}"`),
          ...item(_, `${at}["${name}"]`),
        ])
      : [`${at} must be an object`];

// Первая подошедшая проверка — ответ; не подошла ни одна — сообщение о том, чего ждали.
const _either =
  (what: string, ...checks: readonly _Check[]): _Check =>
  (value, at) =>
    checks.some((_) => _(value, at).length === 0)
      ? []
      : [`${at} must be ${what}`];

const _shape =
  (
    required: Readonly<Record<string, _Check>>,
    optional: Readonly<Record<string, _Check>>
  ): _Check =>
  (value, at) =>
    _isObject(value)
      ? [
          ...Object.keys(required)
            .filter((_) => !(_ in value))
            .map((_) => `${_at(at, _)} is required`),
          ...Object.entries(value).flatMap(({ 0: key, 1: _ }) =>
            ((check) =>
              check
                ? check(_, _at(at, key))
                : [`${_at(at, key)} is not part of the package format`])(
              required[key] ?? optional[key]
            )
          ),
        ]
      : [`${at || 'manifest.json'} must be an object`];

const _localized = _either(
  'a string or an object of language → text',
  _string,
  _map(_matches(_LANGUAGE, 'a language code like de or en'), _string)
);

const _fieldValue = _is(
  'a string, a number, true, false or null',
  (_) =>
    _ === null ||
    typeof _ === 'string' ||
    typeof _ === 'boolean' ||
    (typeof _ === 'number' && Number.isFinite(_))
);

const _page: _Check = (value, at) =>
  _shape(
    { title: _string, template: _string },
    {
      key: _matches(PAGE_KEY, 'latin lowercase letters, digits and -'),
      kind: _matches(/^(?:page|link)$/, '"page" or "link"'),
      alias: _string,
      longTitle: _string,
      menuTitle: _string,
      description: _string,
      introText: _string,
      contentType: _string,
      linkTo: _string,
      hiddenFromMenu: _boolean,
      cacheable: _boolean,
      searchable: _boolean,
      socialImage: _string,
      language: _matches(_LANGUAGE, 'a language code like de or en'),
      content: _string,
      contentFile: _matches(/^pages\/.+\.html$/, 'a file pages/….html'),
      fields: _map(_string, _fieldValue),
      children: _list(_page),
    }
  )(value, at);

const _manifest = _shape(
  {
    format: _is(String(PACKAGE_FORMAT), (_) => _ === PACKAGE_FORMAT),
    name: _matches(
      PACKAGE_NAME,
      '2–40 latin lowercase letters, digits and -, not starting with cms-'
    ),
    title: _localized,
    summary: _localized,
    language: _matches(_LANGUAGE, 'a language code like de or en'),
    siteName: _string,
    pages: _list(_page),
    home: _matches(PAGE_KEY, 'a page key'),
  },
  {
    description: _string,
    kit: _list(_string),
    settings: _map(
      _matches(_SETTING_KEY, 'latin letters, digits and _'),
      _either(
        'a string or { "value": "…", "note": "…" }',
        _string,
        _shape({ value: _string }, { note: _string })
      )
    ),
    media: _map(_string, _shape({}, { alt: _string })),
    notFound: _matches(PAGE_KEY, 'a page key'),
  }
);

const _problem = (message: string): Problem => ({
  file: MANIFEST,
  code: 'package.invalid_manifest',
  message,
});

/**
 * Манифест из текста: формат этой версии и схема целиком. Ошибки — все сразу, с местом
 * (`pages[1].template is required`); `manifest` — null, если хоть одна есть.
 */
export var parseManifest = (
  text: string
): { readonly manifest: Manifest | null; readonly problems: Problem[] } =>
  ((raw) =>
    raw === undefined
      ? {
          manifest: null,
          problems: [_problem('manifest.json is not valid JSON')],
        }
      : _isObject(raw) &&
          typeof raw.format === 'number' &&
          raw.format > PACKAGE_FORMAT
        ? {
            manifest: null,
            problems: [
              {
                file: MANIFEST,
                code: 'package.newer_format',
                message: `The package is format ${raw.format}; this cms reads format ${PACKAGE_FORMAT}: update cms`,
              },
            ],
          }
        : ((problems) =>
            problems.length > 0
              ? { manifest: null, problems }
              : { manifest: raw as Manifest, problems: [] })(
            _manifest(raw, '').map(_problem)
          ))(
    attempt(
      () => JSON.parse(text) as unknown,
      () => undefined
    )
  );
