import {
  attempt,
  fail,
  type SourcePoint,
} from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { Element } from '../domain/element.ts';

type Script = Pick<Element, 'name' | 'source'>;

type _Import = { readonly path: string; readonly kind: string };

type _Message = {
  readonly message?: string;
  readonly position?: { readonly line: number; readonly column: number };
};

const _transpiler = new Bun.Transpiler({ loader: 'js' });

// Браузер грузит модуль по адресу: голое имя пакета и путь от страницы он не разрешит, а `data:`
// и чужой протокол — дорога мимо проверки. Зависимости собираются в один файл заранее.
const _ALLOWED_IMPORT = /^https:\/\/[^/\s]+\//;

// Только то, что браузер разрешает как модуль: `require()` в сборке — мёртвая ветка, не загрузка.
const _MODULE_IMPORTS: ReadonlySet<string> = new Set([
  'import-statement',
  'dynamic-import',
]);

// Ошибка разбора Bun — BuildMessage с position; несколько ошибок — AggregateError с errors.
const _first = (error: unknown): _Message =>
  ((errors) => (Array.isArray(errors) && errors[0]) || (error as _Message))(
    (error as { errors?: unknown }).errors
  );

// Строка у Bun — с единицы, столбец — тоже: offset 17 даёт столбец 18.
const _pointOf = (message: _Message): SourcePoint | undefined =>
  message.position
    ? { line: message.position.line, column: message.position.column }
    : undefined;

const _parse = (script: Script): readonly _Import[] =>
  attempt(
    () => _transpiler.scanImports(script.source),
    (error) =>
      ((message) =>
        fail(
          'design.script_syntax',
          `${script.name}: ${message.message ?? String(error)}`,
          _pointOf(message)
        ))(_first(error))
  );

/** Место первого упоминания пути в кавычках: по нему ошибка печатается как `файл:строка:столбец`. */
const _pointAt = (source: string, path: string): SourcePoint | undefined =>
  ((index) =>
    Number.isFinite(index)
      ? ((before) => ({
          line: before.split('\n').length,
          column: index - before.lastIndexOf('\n'),
        }))(source.slice(0, index))
      : undefined)(
    Math.min(
      ...['"', "'", '`']
        .map((quote) => source.indexOf(`${quote}${path}${quote}`))
        .filter((_) => _ >= 0)
    )
  );

const _checkImports =
  (script: Script) =>
  (imports: readonly _Import[]): void =>
    void ((forbidden) =>
      forbidden &&
      fail(
        'design.script_import',
        `${script.name}: cannot import "${forbidden.path}": bundle your dependencies into one script; only https:// URLs can be imported`,
        _pointAt(script.source, forbidden.path)
      ))(
      imports.find(
        (_) => _MODULE_IMPORTS.has(_.kind) && !_ALLOWED_IMPORT.test(_.path)
      )
    );

/** Скрипт сайта до сохранения: разбирается как ES-модуль, импорты — только адреса https://. */
export var checkScript = (script: Script): void =>
  pipe(_parse, _checkImports(script))(script);

/** Версия скрипта в его адресе: меняется вместе с исходником. */
export var scriptHash = (source: string): string =>
  Bun.hash(source).toString(36);
