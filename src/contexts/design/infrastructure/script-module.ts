import {
  type ModulePath,
  modulePaths,
  replacePaths,
} from '../../../platform/module-imports.ts';
import {
  attempt,
  fail,
  pointAt,
  type SourcePoint,
} from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { Element, ElementName } from '../domain/element.ts';
import {
  referencedScript,
  type ScriptReference,
} from '../domain/script-graph.ts';

type Script = Pick<Element, 'name' | 'source'>;

type _Message = {
  readonly message?: string;
  readonly position?: { readonly line: number; readonly column: number };
  readonly loc?: { readonly line: number; readonly column: number };
};

const _transpiler = new Bun.Transpiler({ loader: 'js' });

// Браузер грузит модуль по адресу: голое имя пакета и путь от страницы он не разрешит, а `data:`
// и чужой протокол — дорога мимо проверки. Свои куски сборки — скрипты сайта по `./имя.js`.
const _ALLOWED_IMPORT = /^https:\/\/[^/\s]+\//;

// Ошибка разбора Bun — BuildMessage с position; несколько ошибок — AggregateError с errors.
const _first = (error: unknown): _Message =>
  ((errors) => (Array.isArray(errors) && errors[0]) || (error as _Message))(
    (error as { errors?: unknown }).errors
  );

// Строка у Bun — с единицы, столбец — тоже: offset 17 даёт столбец 18. У acorn столбец — с нуля.
const _pointOf = (message: _Message): SourcePoint | undefined =>
  message.position
    ? { line: message.position.line, column: message.position.column }
    : message.loc
      ? { line: message.loc.line, column: message.loc.column + 1 }
      : undefined;

const _syntaxError =
  (script: Script) =>
  (error: unknown): never =>
    ((message) =>
      fail(
        'design.script_syntax',
        `${script.name}: ${message.message ?? String(error)}`,
        _pointOf(message)
      ))(_first(error));

// Сообщения и места ошибок — Bun, как были (ADR 0039); пути — по дереву acorn.
const _scan = (script: Script): Script =>
  attempt(
    () => (_transpiler.scanImports(script.source), script),
    _syntaxError(script)
  );

// Дерево acorn собранной сцены в мегабайт — 0,2 с и больше 100 МБ памяти на пике, а сервер бывает на 512 МБ.
// Нужно оно, только чтобы найти места путей. Ссылки `./имя.js` и запрещённые импорты видит и нативный
// scanImports (пути — уже значения строк, экранирование раскрыто); `new URL(…, import.meta.url)` без
// `import.meta` в тексте не бывает. Нет ни того, ни другого — путей для проверки и адресов нет, дерево не
// строится. `require(…)` из чужих сборок модулю не путь.
const _IMPORT_META = /\bimport\s*\.\s*meta\b/;
const _REQUIRE = new Set(['require-call', 'require-resolve']);

const _needsTree = (source: string): boolean =>
  _IMPORT_META.test(source) ||
  _transpiler
    .scanImports(source)
    .some((_) => !_REQUIRE.has(_.kind) && !_ALLOWED_IMPORT.test(_.path));

const _parse = (script: Script): readonly ModulePath[] =>
  attempt(
    () => (_needsTree(script.source) ? modulePaths(script.source) : []),
    _syntaxError(script)
  );

const _checkImports =
  (script: Script) =>
  (paths: readonly ModulePath[]): void =>
    void ((forbidden) =>
      forbidden &&
      fail(
        'design.script_import',
        `${script.name}: cannot import "${forbidden.value}": bundle your dependencies; a site script imports only other site scripts as ./name.js and https:// URLs`,
        pointAt(script.source, forbidden.start)
      ))(
      paths.find(
        (_) =>
          _.kind === 'module' &&
          !_ALLOWED_IMPORT.test(_.value) &&
          referencedScript(_.value) === null
      )
    );

const _references = (paths: readonly ModulePath[]): ScriptReference[] =>
  paths.flatMap((path) =>
    ((name) => (name ? [{ name, start: path.start, end: path.end }] : []))(
      referencedScript(path.value)
    )
  );

/** Версия исходника скрипта: у скрипта без ссылок она же — хэш в его адресе. */
export var scriptHash = (source: string): string =>
  Bun.hash(source).toString(36);

/**
 * Разбор скриптов сайта. Пути запоминаются по имени и хэшу исходника: проверка при сохранении, адреса и
 * отдача разбирают каждую версию один раз, а дерево строится, только когда путям есть где быть (`_needsTree`).
 */
export var defineScriptModules = () => {
  const parsed = new Map<
    string,
    { readonly hash: string; readonly paths: readonly ModulePath[] }
  >();

  const pathsOf = (script: Script): readonly ModulePath[] =>
    ((hash) =>
      parsed.get(script.name)?.hash === hash
        ? parsed.get(script.name)!.paths
        : ((paths) => (parsed.set(script.name, { hash, paths }), paths))(
            _parse(script)
          ))(scriptHash(script.source));

  return {
    /** Скрипт до сохранения: ES-модуль; импорты — другие скрипты сайта `./имя.js` и адреса https://. */
    check: (script: Script): void =>
      pipe(_scan, pathsOf, _checkImports(script))(script),
    /** Ссылки на другие скрипты сайта; исходник, который не разбирается, — без ссылок. */
    references: (script: Script): readonly ScriptReference[] =>
      attempt(
        () => _references(pathsOf(script)),
        () => []
      ),
  };
};

export type ScriptModules = ReturnType<typeof defineScriptModules>;

/** Исходник для браузера: каждая ссылка `./имя.js` — путь, который даёт `to`, например `./имя.хэш.js`. */
export var linkScript = (
  source: string,
  references: readonly ScriptReference[],
  to: (name: ElementName) => string
): string =>
  references.length === 0
    ? source
    : replacePaths(source, references, (_) => to(_.name));
