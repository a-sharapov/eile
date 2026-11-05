import type { NewField } from '../../contexts/content/index.ts';
import type { FormInput } from '../../contexts/forms/index.ts';
import { entryOf } from '../../workspace/index.ts';
import type { Scaffold, ScaffoldPage, ScaffoldSetting } from '../scaffold.ts';
import {
  formatFor,
  type Localized,
  localized,
  MANIFEST,
  type Manifest,
  type ManifestPage,
  type ManifestRedirect,
  type ManifestSetting,
  type PackageFiles,
} from './format.ts';

// Пакет и `Scaffold` переводятся друг в друга без потерь: встроенный каркас выгружается пакетом, а пакет
// ставится тем же `applyScaffold`, что и встроенный (ADR 0056).

const _decoder = new TextDecoder();
const _encoder = new TextEncoder();

/** Текст файла пакета; нет файла — пусто. */
export var textOf = (files: PackageFiles, path: string): string =>
  _decoder.decode(files.get(path) ?? new Uint8Array());

const _byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Элементы одного вида по именам: `templates/Page.svelte` → `Page`.
const _elements = (
  files: PackageFiles,
  kind: 'template' | 'component' | 'script' | 'plugin'
): Record<string, string> =>
  Object.fromEntries(
    [...files.keys()]
      .filter((_) => entryOf(_)?.kind === kind)
      .sort(_byPath)
      .map((_) => [entryOf(_)!.name, textOf(files, _)])
  );

const _forms = (files: PackageFiles): Record<string, FormInput> =>
  Object.fromEntries(
    [...files.keys()]
      .filter((_) => entryOf(_)?.kind === 'form')
      .sort(_byPath)
      .map((path) =>
        ((name) => [
          name,
          {
            ...(files.has(`forms/${name}.json`)
              ? (JSON.parse(textOf(files, `forms/${name}.json`)) as FormInput)
              : {}),
            source: textOf(files, path),
          },
        ])(entryOf(path)!.name)
      )
  );

const _setting = (setting: ManifestSetting): string | ScaffoldSetting =>
  typeof setting === 'string'
    ? setting
    : { value: setting.value, note: setting.note ?? '' };

const _page =
  (files: PackageFiles) =>
  (page: ManifestPage): ScaffoldPage =>
    ((
      { contentFile, children, content, ...rest }: ManifestPage,
      text: string | undefined
    ) => ({
      ...rest,
      ...(text === undefined ? {} : { content: text }),
      ...(children ? { children: children.map(_page(files)) } : {}),
    }))(
      page,
      page.contentFile ? textOf(files, page.contentFile) : page.content
    );

/**
 * Пакет — каркас для `applyScaffold`. Заголовок и описание — на языке CLI; файлы и манифест уже
 * проверены (`checkPackage`).
 */
export var packageScaffold = (
  files: PackageFiles,
  manifest: Manifest,
  language: string
): Scaffold => ({
  name: manifest.name,
  title: localized(manifest.title, language, manifest.language),
  summary: localized(manifest.summary, language, manifest.language),
  siteName: manifest.siteName,
  language: manifest.language,
  ...(manifest.description ? { description: manifest.description } : {}),
  ...(manifest.kit ? { kit: manifest.kit } : {}),
  components: _elements(files, 'component'),
  templates: _elements(files, 'template'),
  scripts: _elements(files, 'script'),
  plugins: _elements(files, 'plugin'),
  fields: files.has('fields.json')
    ? (JSON.parse(textOf(files, 'fields.json')) as NewField[])
    : [],
  forms: _forms(files),
  settings: Object.fromEntries(
    Object.entries(manifest.settings ?? {}).map(({ 0: key, 1: _ }) => [
      key,
      _setting(_),
    ])
  ),
  translations: manifest.translations ?? {},
  redirects: manifest.redirects ?? [],
  media: [...files.keys()]
    .filter((_) => _.startsWith('media/'))
    .sort(_byPath)
    .map((path) =>
      ((name) => ({
        path: name,
        data: files.get(path)!,
        ...(manifest.media?.[name]?.alt
          ? { alt: manifest.media[name].alt }
          : {}),
      }))(path.slice('media/'.length))
    ),
  pages: manifest.pages.map(_page(files)),
  home: manifest.home,
  ...(manifest.notFound ? { notFound: manifest.notFound } : {}),
});

/** JSON для человека и агента — как в папке элементов: отступы и перевод строки в конце. */
const _json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

type _Exported = {
  readonly pages: readonly ManifestPage[];
  readonly files: readonly (readonly [string, string])[];
  readonly next: number;
};

// Текст страницы — файлом: `pages/<ключ>.html`, у страницы без ключа — `pages/<номер>.html` по порядку
// обхода дерева. Номер начинается с цифры, ключ — с буквы: имена не совпадут.
const _exportPages = (
  pages: readonly ScaffoldPage[],
  start: number
): _Exported =>
  pages.reduce<_Exported>(
    (acc, page) =>
      ((
        { children, content, ...rest }: ScaffoldPage,
        file: string,
        nested: _Exported
      ) => ({
        pages: [
          ...acc.pages,
          {
            ...rest,
            ...(content ? { contentFile: file } : {}),
            ...(children ? { children: nested.pages } : {}),
          } as ManifestPage,
        ],
        files: [
          ...acc.files,
          ...(content ? [[file, content] as const] : []),
          ...nested.files,
        ],
        next: nested.next,
      }))(
        page,
        `pages/${page.key ?? acc.next}.html`,
        _exportPages(page.children ?? [], acc.next + 1)
      ),
    { pages: [], files: [], next: start }
  );

const _settingOut = (setting: string | ScaffoldSetting): ManifestSetting =>
  typeof setting === 'string' || setting.note === ''
    ? typeof setting === 'string'
      ? setting
      : setting.value
    : setting;

// Правило — как в манифесте: поля без значения не пишутся.
const _redirectOut = ({
  from,
  to,
  status,
  note,
}: NonNullable<Scaffold['redirects']>[number]): ManifestRedirect => ({
  from,
  to,
  ...(status === undefined ? {} : { status: status as 301 | 302 }),
  ...(note ? { note } : {}),
});

// Версия формата — наименьшая, в которую ложится манифест: её прочтёт и cms старше этой.
const _versioned = (manifest: Omit<Manifest, 'format'>): Manifest => ({
  format: formatFor(manifest),
  ...manifest,
});

/**
 * Каркас — файлами пакета: манифест, элементы в раскладке папки элементов, тексты страниц и медиатека.
 * `title` и `summary` — по языкам, если каркас есть на нескольких.
 */
export var scaffoldPackage = (
  scaffold: Scaffold,
  text: { readonly title?: Localized; readonly summary?: Localized } = {}
): PackageFiles =>
  ((exported) =>
    new Map<string, Uint8Array>(
      [
        [
          MANIFEST,
          _json(
            _versioned({
              name: scaffold.name,
              title: text.title ?? scaffold.title,
              summary: text.summary ?? scaffold.summary,
              language: scaffold.language ?? 'ru',
              siteName: scaffold.siteName,
              ...(scaffold.description
                ? { description: scaffold.description }
                : {}),
              ...(scaffold.kit?.length ? { kit: scaffold.kit } : {}),
              ...(Object.keys(scaffold.settings ?? {}).length > 0
                ? {
                    settings: Object.fromEntries(
                      Object.entries(scaffold.settings ?? {}).map(
                        ({ 0: key, 1: _ }) => [key, _settingOut(_)]
                      )
                    ),
                  }
                : {}),
              ...(Object.keys(scaffold.translations ?? {}).length > 0
                ? { translations: scaffold.translations }
                : {}),
              ...(scaffold.redirects?.length
                ? { redirects: scaffold.redirects.map(_redirectOut) }
                : {}),
              ...(scaffold.media?.some((_) => _.alt)
                ? {
                    media: Object.fromEntries(
                      scaffold.media
                        .filter((_) => _.alt)
                        .map((_) => [_.path, { alt: _.alt }])
                    ),
                  }
                : {}),
              pages: exported.pages,
              home: scaffold.home,
              ...(scaffold.notFound ? { notFound: scaffold.notFound } : {}),
            })
          ),
        ] as const,
        ...Object.entries(scaffold.templates).map(
          ({ 0: name, 1: source }) =>
            [`templates/${name}.svelte`, source] as const
        ),
        ...Object.entries(scaffold.components ?? {}).map(
          ({ 0: name, 1: source }) =>
            [`components/${name}.svelte`, source] as const
        ),
        ...Object.entries(scaffold.scripts ?? {}).map(
          ({ 0: name, 1: source }) => [`scripts/${name}.js`, source] as const
        ),
        ...Object.entries(scaffold.plugins ?? {}).map(
          ({ 0: name, 1: source }) => [`plugins/${name}.ts`, source] as const
        ),
        ...Object.entries(scaffold.forms ?? {}).flatMap(
          ({ 0: name, 1: { source, ...settings } }) => [
            [`forms/${name}.html`, source ?? ''] as const,
            ...(Object.keys(settings).length > 0
              ? [[`forms/${name}.json`, _json(settings)] as const]
              : []),
          ]
        ),
        ...(scaffold.fields?.length
          ? [['fields.json', _json(scaffold.fields)] as const]
          : []),
        ...exported.files,
      ]
        .map(({ 0: path, 1: _ }): readonly [string, Uint8Array] => [
          path,
          _encoder.encode(_),
        ])
        .concat(
          (scaffold.media ?? []).map((_): readonly [string, Uint8Array] => [
            `media/${_.path}`,
            _.data,
          ])
        )
    ))(_exportPages(scaffold.pages, 1));
