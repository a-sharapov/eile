import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { App } from '../app.ts';
import type { NewField } from '../contexts/content/index.ts';
import { posixPath } from '../platform/paths.ts';
import { attempt, fail, isDomainError } from '../shared/kernel/errors.ts';
import {
  byOrder,
  entryOf,
  FIELDS_FILE,
  type FileKind,
  type Files,
  type FormSettings,
  fieldInput,
  json,
  PATTERNS,
  pathOf,
  pointAt,
  settingsPathOf,
} from './layout.ts';

export type WorkspaceServices = Pick<
  App,
  'content' | 'design' | 'extensions' | 'forms' | 'site' | 'transaction'
>;

/** Что не так с файлом: печатается как `файл:строка:столбец код сообщение`. */
export type Problem = {
  readonly file: string;
  readonly code: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
};

/** Итог отправки или проверки: какие файлы легли в сайт и что помешало. */
export type PushReport = {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  /** Удалены из сайта: файлов нет в папке, и попросили `--prune`. */
  readonly removed: readonly string[];
  /** Есть в сайте, нет в папке — остаются, пока не попросят удалить. */
  readonly missing: readonly string[];
  readonly problems: readonly Problem[];
  /** Записано в сайт: нет проблем и это не проверка. */
  readonly saved: boolean;
};

export type PushOptions = {
  /** Удалить из сайта элементы и формы, которых нет в папке; поля не удаляются никогда. */
  readonly prune?: boolean;
  /** Только проверить: всё сохраняется в транзакции и откатывается. */
  readonly dryRun?: boolean;
};

const _SETTINGS = [
  'title',
  'submitLabel',
  'successText',
  'successPage',
  'subject',
  'channels',
  'retentionDays',
  'minSeconds',
  'allowLinks',
  'proof',
  'goal',
  'confirmation',
  'webhook',
] as const;

// Секрет вебхука в файлы не попадает: папку кладут в git и дают агентам. Адрес остаётся, секрет — на сайте.
const _settingsOf = (form: Readonly<Record<string, unknown>>): FormSettings =>
  Object.fromEntries(
    _SETTINGS.map((_) => [
      _,
      _ === 'webhook'
        ? { url: (form.webhook as { url?: string } | undefined)?.url ?? '' }
        : form[_],
    ])
  ) as FormSettings;

/** Сайт файлами: шаблоны, компоненты, скрипты, плагины, формы с настройками и поля. */
export var filesOf = (services: WorkspaceServices): Files =>
  new Map([
    ...services.design.elements
      .list()
      .map(
        (_) =>
          [
            pathOf(_.kind, _.name),
            services.design.elements.get(_.kind, _.name)!.source,
          ] as const
      ),
    ...services.extensions.plugins
      .list()
      .map((_) => [pathOf('plugin', _.name), _.source] as const),
    ...services.forms.forms
      .list()
      .map((_) => services.forms.forms.get(_.name)!)
      .flatMap(
        (form) =>
          [
            [pathOf('form', form.name), form.source],
            [settingsPathOf(form.name), json(_settingsOf(form))],
          ] as const
      ),
    [FIELDS_FILE, json(services.content.fields.list().map(fieldInput))],
  ]);

const _rethrow = (error: unknown): never => {
  throw error;
};

const _problem = (file: string, error: unknown): Problem =>
  isDomainError(error)
    ? {
        file,
        code: error.code,
        message: error.message,
        ...(error.at ? { line: error.at.line, column: error.at.column } : {}),
      }
    : {
        file,
        code: 'workspace.failed',
        message: error instanceof Error ? error.message : String(error),
      };

const _tryAt = (file: string, run: () => void): Problem | null =>
  attempt(
    () => (run(), null),
    (error) => _problem(file, error)
  );

const _parse = (file: string, text: string): unknown =>
  attempt(
    () => JSON.parse(text) as unknown,
    (error) =>
      fail('workspace.invalid_json', `${file}: ${(error as Error).message}`)
  );

const _sameField =
  (services: WorkspaceServices) =>
  (field: NewField): boolean =>
    ((current) =>
      current !== undefined &&
      JSON.stringify(fieldInput(current)) === JSON.stringify(field))(
      services.content.fields.list().find((_) => _.name === field.name)
    );

/** Поля из fields.json, которые нужно сохранить: новые и изменённые. */
const _fieldsToSave = (
  services: WorkspaceServices,
  text: string
): readonly NewField[] =>
  ((wanted) =>
    Array.isArray(wanted)
      ? (wanted as NewField[]).filter((_) => !_sameField(services)(_))
      : fail('workspace.invalid_json', `${FIELDS_FILE} must be an array`))(
    _parse(FIELDS_FILE, text)
  );

const _settingsDiffer = (name: string, folder: Files, site: Files): boolean =>
  ((path) =>
    folder.has(path) &&
    JSON.stringify(_parse(path, folder.get(path)!)) !==
      JSON.stringify(JSON.parse(site.get(path) ?? '{}')))(settingsPathOf(name));

type _Check = (
  path: string,
  folder: Files,
  site: Files,
  services: WorkspaceServices
) => boolean;

const _sourceDiffers: _Check = (path, folder, site) =>
  folder.get(path) !== site.get(path);

// Изменилось ли: у формы — разметка или настройки рядом, у полей — хоть одно поле. Битый JSON —
// «изменился», чтобы сохранение показало ошибку.
const _CHANGED: Readonly<Record<FileKind, _Check>> = {
  template: _sourceDiffers,
  component: _sourceDiffers,
  script: _sourceDiffers,
  plugin: _sourceDiffers,
  form: (path, folder, site) =>
    _sourceDiffers(path, folder, site, null as never) ||
    attempt(
      () => _settingsDiffer(entryOf(path)!.name, folder, site),
      () => true
    ),
  fields: (path, folder, _site, services) =>
    attempt(
      () => _fieldsToSave(services, folder.get(path)!).length > 0,
      () => true
    ),
};

type _Save = (
  services: WorkspaceServices,
  name: string,
  text: string,
  folder: Files
) => void;

const _saveField =
  (services: WorkspaceServices) =>
  (field: NewField): void =>
    void attempt(
      () => services.content.fields.save(field),
      (error) =>
        isDomainError(error)
          ? fail(error.code, `${field.name}: ${error.message}`)
          : _rethrow(error)
    );

const _SAVE: Readonly<Record<FileKind, _Save>> = {
  template: (services, name, text) =>
    services.design.templates.save(name, text),
  component: (services, name, text) =>
    services.design.components.save(name, text),
  script: (services, name, text) => services.design.scripts.save(name, text),
  plugin: (services, name, text) =>
    void services.extensions.plugins.save(name, text),
  form: (services, name, text, folder) =>
    void services.forms.forms.save(name, {
      ...((folder.has(settingsPathOf(name))
        ? _parse(settingsPathOf(name), folder.get(settingsPathOf(name))!)
        : {}) as FormSettings),
      source: text,
    }),
  fields: (services, _name, text) =>
    _fieldsToSave(services, text).forEach(_saveField(services)),
};

const _inUse = (
  code: string,
  pages: readonly { id: number }[],
  what: string
) =>
  pages.length > 0
    ? fail(code, `Pages ${pages.map((_) => _.id).join(', ')} use ${what}`)
    : undefined;

const _REMOVE: Readonly<
  Record<
    Exclude<FileKind, 'fields'>,
    (services: WorkspaceServices, name: string) => void
  >
> = {
  template: (services, name) => (
    _inUse(
      'design.element_in_use',
      services.content.usage.template(name),
      `the template ${name}`
    ),
    services.design.elements.remove('template', name)
  ),
  component: (services, name) => (
    _inUse(
      'design.element_in_use',
      services.content.usage.component(name),
      `[[${name}]] in their text`
    ),
    services.design.elements.remove('component', name)
  ),
  // Скрипт, который подключает шаблон или компонент, сайт удалить не даст: ошибка скажет, кто держит.
  script: (services, name) => services.design.elements.remove('script', name),
  plugin: (services, name) => services.extensions.plugins.remove(name),
  form: (services, name) => (
    _inUse(
      'forms.form_in_use',
      services.content.usage.module('Form', name),
      `[#Form:${name}] in their text`
    ),
    services.forms.forms.remove(name)
  ),
};

type _Done = { readonly path: string; readonly problem: Problem | null };

const _removeOne =
  (services: WorkspaceServices) =>
  (path: string): _Done => ({
    path,
    problem: _tryAt(path, () =>
      _REMOVE[entryOf(path)!.kind as Exclude<FileKind, 'fields'>](
        services,
        entryOf(path)!.name
      )
    ),
  });

// Компонент, который импортирует другой удаляемый, уходит первым: повторяем, пока что-то удаляется.
const _removeAll = (
  services: WorkspaceServices,
  paths: readonly string[]
): _Done[] =>
  ((tried) =>
    ((failed) =>
      failed.length === 0 || failed.length === paths.length
        ? tried
        : [
            ...tried.filter((_) => _.problem === null),
            ..._removeAll(
              services,
              failed.map((_) => _.path)
            ),
          ])(tried.filter((_) => _.problem !== null)))(
    paths.map(_removeOne(services))
  );

const _COMPONENT_IMPORT = /\b(?:from|import)\s*['"]\$components\/([^'"]+)['"]/g;

/** Импорт компонента, которого после отправки в сайте не будет: ошибка с местом импорта. */
const _unknownImports = (
  folder: Files,
  components: ReadonlySet<string>
): Problem[] =>
  [...folder.entries()]
    .filter(({ 0: path }) =>
      ['template', 'component'].includes(entryOf(path)?.kind ?? '')
    )
    .flatMap(({ 0: file, 1: source }) =>
      [...source.matchAll(_COMPONENT_IMPORT)]
        .filter((_) => !components.has(_[1]!))
        .map((_) => ({
          file,
          code: 'workspace.unknown_component',
          message: `There is no component "${_[1]}": add components/${_[1]}.svelte`,
          ...pointAt(source, _.index),
        }))
    );

const _orphanSettings = (folder: Files): Problem[] =>
  [...folder.keys()]
    .filter(
      (_) =>
        /^forms\/[^/]+\.json$/.test(_) &&
        !folder.has(_.replace(/\.json$/, '.html'))
    )
    .map((file) => ({
      file,
      code: 'workspace.orphan_settings',
      message: `Form settings without markup: add ${file.replace(/\.json$/, '.html')}`,
    }));

const _primary = (files: Files): string[] =>
  [...files.keys()].filter((_) => entryOf(_) !== null).sort(byOrder);

const _components = (services: WorkspaceServices): ReadonlySet<string> =>
  new Set(
    services.design.elements
      .list()
      .filter((_) => _.kind === 'component')
      .map((_) => _.name as string)
  );

// Внутри транзакции: сохранить изменённое, удалить лишнее, собрать проблемы со всех файлов.
const _apply = (
  services: WorkspaceServices,
  folder: Files,
  options: PushOptions
): PushReport =>
  ((site) =>
    ((saved, absent) =>
      ((removals) =>
        ((problems, ok) => ({
          added: ok.filter((_) => !site.has(_)),
          changed: ok.filter((_) => site.has(_)),
          removed: removals
            .filter((_) => _.problem === null)
            .map((_) => _.path),
          missing: options.prune ? [] : absent,
          problems,
          saved: problems.length === 0 && !options.dryRun,
        }))(
          [
            ..._orphanSettings(folder),
            ...[...saved, ...removals].flatMap((_) =>
              _.problem ? [_.problem] : []
            ),
            ..._unknownImports(folder, _components(services)),
          ],
          saved.filter((_) => _.problem === null).map((_) => _.path)
        ))(options.prune ? _removeAll(services, absent) : []))(
      _primary(folder)
        .filter((path) =>
          _CHANGED[entryOf(path)!.kind](path, folder, site, services)
        )
        .map(
          (path): _Done => ({
            path,
            problem: _tryAt(path, () =>
              _SAVE[entryOf(path)!.kind](
                services,
                entryOf(path)!.name,
                folder.get(path)!,
                folder
              )
            ),
          })
        ),
      _primary(site).filter((_) => _ !== FIELDS_FILE && !folder.has(_))
    ))(filesOf(services));

type _Rollback = Error & { readonly report: PushReport };

const _isRollback = (error: unknown): error is _Rollback =>
  error instanceof Error && 'report' in error;

/**
 * Папка — в сайт одной транзакцией: всё или ничего. Ошибки собираются по всем файлам, а не до
 * первой; `dryRun` — та же работа с откатом в конце.
 */
export var push = (
  services: WorkspaceServices,
  folder: Files,
  options: PushOptions = {}
): PushReport =>
  attempt(
    () =>
      services.transaction(() =>
        ((report) =>
          report.saved
            ? report
            : _rethrow(Object.assign(new Error('rollback'), { report })))(
          _apply(services, folder, options)
        )
      ),
    (error) => (_isRollback(error) ? error.report : _rethrow(error))
  );

/** Итог выгрузки: какие файлы записаны заново, сколько уже совпадали и чего в сайте нет. */
export type PullReport = {
  readonly written: readonly string[];
  readonly same: number;
  /** Файлы папки, которых нет в сайте: не трогаются. */
  readonly extra: readonly string[];
};

/**
 * Текст файла папки — с переводами строк LF и без BOM: git с `core.autocrlf` на Windows выдаёт CRLF, а
 * редакторы Windows бывает что пишут BOM. Без этого каждый файл казался бы изменённым, а в сайт ушёл бы
 * CRLF (ADR 0049).
 */
const _lf = (text: string): string =>
  text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');

// node:fs, а не Bun.file: на Windows отказ Bun.file(…).text() по несуществующему файлу не держит цикл
// событий, и первый `cms elements pull` в пустую папку выходил с кодом 0, ничего не записав (ADR 0049).
const _readText = (dir: string, path: string): Promise<string> =>
  readFile(join(dir, path), 'utf8').then(_lf);

/** Файлы папки, которые понимает отправка; `AGENTS.md`, `.git` и прочее не читаются. */
export var readFolder = (dir: string): Promise<Files> =>
  Promise.all(
    PATTERNS.map((pattern) =>
      Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: dir }))
    )
  )
    .then((_) => [...new Set(_.flat().map((path) => posixPath(path)))])
    .then((paths) =>
      Promise.all(
        paths.map((path) =>
          _readText(dir, path).then((text) => [path, text] as const)
        )
      )
    )
    .then((_) => new Map(_));

/**
 * Сайт — в папку: отличающиеся файлы переписываются, лишние в папке остаются. `extra` — файлы не из
 * сайта, например AGENTS.md.
 */
export var pull = (
  services: WorkspaceServices,
  dir: string,
  extra: Files = new Map()
): Promise<PullReport> =>
  ((site) =>
    Promise.all([
      readFolder(dir).then(undefined, (): Files => new Map()),
      Promise.all(
        [...site, ...extra].map(({ 0: path, 1: text }) =>
          _readText(dir, path)
            .then(undefined, () => null)
            .then((current) =>
              // Файл с CRLF и тем же текстом не переписывается: перевод строк — дело git на этой машине.
              current === text
                ? null
                : Bun.write(join(dir, path), text).then(() => path)
            )
        )
      ),
    ]).then(({ 0: folder, 1: written }) => ({
      written: written.filter((_): _ is string => _ !== null).sort(),
      same: written.filter((_) => _ === null).length,
      extra: [...folder.keys()].filter((_) => !site.has(_)).sort(),
    })))(filesOf(services));
