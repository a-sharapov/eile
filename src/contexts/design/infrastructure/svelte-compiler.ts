import { compile } from 'svelte/compiler';
import {
  attempt,
  fail,
  type SourcePoint,
} from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { SourceCompiler } from '../application/source-compiler.ts';
import { COMPONENT_IMPORT_PREFIX, type Element } from '../domain/element.ts';
import { hasKeyTags } from '../domain/placeholders.ts';
import { describeComponent } from './svelte-signature.ts';

/** Голые модули, доступные виду кроме `$components/*`: другого внутри бинарника нет. */
export var HOST_MODULES: readonly string[] = [
  'svelte',
  'svelte/internal/server',
  '$core',
];

export type CompiledView = {
  readonly code: string;
  readonly imports: readonly string[];
};

type Source = Pick<Element, 'name' | 'source'>;

const _transpiler = new Bun.Transpiler({ loader: 'js' });

const _OPTIONS = { generate: 'server', css: 'injected', runes: true } as const;

/** Встроенные компоненты: `$core/Uncached`; какие есть, знает загрузчик видов. */
export var BUILTIN_PREFIX = '$core/';

const _allowed = (path: string): boolean =>
  path.startsWith(COMPONENT_IMPORT_PREFIX) ||
  path.startsWith(BUILTIN_PREFIX) ||
  HOST_MODULES.includes(path);

/** Где ошибка компилятора Svelte: у него строка с единицы, столбец — с нуля. */
export var sveltePoint = (error: unknown): SourcePoint | undefined =>
  ((start) =>
    start ? { line: start.line, column: start.column + 1 } : undefined)(
    (error as { start?: { line: number; column: number } }).start
  );

const _compile = (element: Source): string =>
  hasKeyTags(element.source)
    ? fail(
        'design.key_tags',
        `${element.name}: in a template write {site.i18n.key} and {site.custom.key}, not {i18n.key} and [@key]`
      )
    : attempt(
        () =>
          compile(element.source, {
            ..._OPTIONS,
            filename: `${element.name}.svelte`,
          }).js.code,
        (error) =>
          fail(
            'design.compile_failed',
            `${element.name}: ${(error as Error).message}`,
            sveltePoint(error)
          )
      );

const _withImports = (code: string): CompiledView => ({
  code,
  imports: _transpiler.scanImports(code).map((_) => _.path),
});

const _checkImports =
  (name: string) =>
  (view: CompiledView): CompiledView => {
    const forbidden = view.imports.find((_) => !_allowed(_));
    return forbidden === undefined
      ? view
      : fail(
          'design.forbidden_import',
          `${name}: cannot import "${forbidden}"`
        );
  };

export var compileForServer = (element: Source): CompiledView =>
  pipe<Source, CompiledView>(
    _compile,
    _withImports,
    _checkImports(element.name)
  )(element);

export var svelteSourceCompiler: SourceCompiler = {
  check: (element) => void compileForServer(element),
  describe: describeComponent,
};
