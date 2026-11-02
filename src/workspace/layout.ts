import type { Field, NewField } from '../contexts/content/index.ts';
import type { FormInput } from '../contexts/forms/index.ts';

/** Вид файла папки элементов: элемент сайта, форма или список полей. */
export type FileKind =
  | 'template'
  | 'component'
  | 'script'
  | 'plugin'
  | 'form'
  | 'fields';

/** Файлы папки по путям от её корня: `components/Menu.svelte` → исходник. */
export type Files = ReadonlyMap<string, string>;

/** Настройки формы рядом с её разметкой: всё, кроме имени, исходника и служебных отметок. */
export type FormSettings = Omit<FormInput, 'source'>;

const _DIR: Readonly<Record<Exclude<FileKind, 'fields'>, string>> = {
  template: 'templates',
  component: 'components',
  script: 'scripts',
  plugin: 'plugins',
  form: 'forms',
};

const _EXT: Readonly<Record<Exclude<FileKind, 'fields'>, string>> = {
  template: '.svelte',
  component: '.svelte',
  script: '.js',
  plugin: '.ts',
  form: '.html',
};

export var FIELDS_FILE = 'fields.json';

/** Что читается из папки: всё остальное (AGENTS.md, .git, заметки) — не наше. */
export var PATTERNS: readonly string[] = [
  'templates/*.svelte',
  'components/*.svelte',
  'scripts/*.js',
  'plugins/*.ts',
  'forms/*.html',
  'forms/*.json',
  FIELDS_FILE,
];

export var pathOf = (kind: Exclude<FileKind, 'fields'>, name: string): string =>
  `${_DIR[kind]}/${name}${_EXT[kind]}`;

/** Настройки формы — файл рядом: `forms/callback.json`. */
export var settingsPathOf = (name: string): string => `forms/${name}.json`;

/** Файл элемента: вид и имя по пути; настройки формы и чужие файлы — null. */
export var entryOf = (
  path: string
): { readonly kind: FileKind; readonly name: string } | null =>
  path === FIELDS_FILE
    ? { kind: 'fields', name: '' }
    : ((match) =>
        match
          ? {
              kind: (
                {
                  templates: 'template',
                  components: 'component',
                  scripts: 'script',
                  plugins: 'plugin',
                  forms: 'form',
                } as const
              )[match[1] as 'templates'],
              name: match[2]!,
            }
          : null)(
        /^(templates|components|scripts|plugins|forms)\/([^/]+)\.(?:svelte|js|ts|html)$/.exec(
          path
        )
      );

// Порядок отправки: поля нужны шаблонам, компоненты и скрипты — шаблонам, формы ссылаются на страницы.
const _ORDER: Readonly<Record<FileKind, number>> = {
  fields: 0,
  script: 1,
  component: 2,
  template: 3,
  plugin: 4,
  form: 5,
};

export var byOrder = (a: string, b: string): number =>
  _ORDER[entryOf(a)!.kind] - _ORDER[entryOf(b)!.kind] || a.localeCompare(b);

/** JSON для человека и агента: отступы, перевод строки в конце. */
export var json = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

export var fieldInput = (field: Field): NewField => ({
  name: field.name,
  label: field.label,
  type: field.type,
  options: field.options,
  defaultValue: field.defaultValue,
  inherit: field.inherit,
  templates: field.templates,
});

/** Строка и столбец места в исходнике: по нему ошибка печатается как `файл:строка:столбец`. */
export var pointAt = (
  source: string,
  index: number
): { readonly line: number; readonly column: number } =>
  ((before) => ({
    line: before.split('\n').length,
    column: index - before.lastIndexOf('\n'),
  }))(source.slice(0, index));
