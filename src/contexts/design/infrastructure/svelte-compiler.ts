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
import { liftStyle, type ViewStyle } from './svelte-styles.ts';

/** Голые модули, доступные виду кроме `$components/*`: другого внутри бинарника нет. */
export var HOST_MODULES: readonly string[] = [
  'svelte',
  'svelte/internal/server',
  '$core',
];

export type CompiledView = {
  readonly code: string;
  readonly imports: readonly string[];
  /** CSS вида, как его выведет рендер; null — `<style>` нет. */
  readonly style: ViewStyle | null;
  /** `<svelte:options css="injected" />`: автор оставляет стиль в странице, `<style>` в head. */
  readonly inline: boolean;
};

type Source = Pick<Element, 'name' | 'source'>;

type _Compiled = { readonly code: string; readonly inline: boolean };

const _transpiler = new Bun.Transpiler({ loader: 'js' });

// modernAst — чтобы прочитать `<svelte:options css>`; старое дерево Svelte к тому же дороже строить.
const _OPTIONS = {
  generate: 'server',
  css: 'injected',
  runes: true,
  modernAst: true,
} as const;

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

const _compile = (element: Source): _Compiled =>
  hasKeyTags(element.source)
    ? fail(
        'design.key_tags',
        `${element.name}: in a template write {site.i18n.key} and {site.custom.key}, not {i18n.key} and [@key]`
      )
    : attempt(
        () =>
          ((result) => ({
            code: result.js.code,
            inline: result.ast?.options?.css === 'injected',
          }))(
            compile(element.source, {
              ..._OPTIONS,
              filename: `${element.name}.svelte`,
            })
          ),
        (error) =>
          fail(
            'design.compile_failed',
            `${element.name}: ${(error as Error).message}`,
            sveltePoint(error)
          )
      );

const _view = ({ code, inline }: _Compiled): CompiledView => ({
  code,
  imports: _transpiler.scanImports(code).map((_) => _.path),
  style: liftStyle(code),
  inline,
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
  pipe(_compile, _view, _checkImports(element.name))(element);

export type ServerCompiler = (
  element: Pick<Element, 'kind' | 'name' | 'source'>
) => CompiledView;

/**
 * Компиляция с памятью по исходнику: проверку при сохранении, загрузчик видов и стили сайта обслуживает
 * одна компиляция. Хранится последняя версия каждого элемента.
 */
export var defineServerCompiler = (): ServerCompiler => {
  const compiled = new Map<
    string,
    { readonly source: string; readonly view: CompiledView }
  >();
  return (element) =>
    ((key) =>
      compiled.get(key)?.source === element.source
        ? compiled.get(key)!.view
        : ((view) => (
            compiled.set(key, { source: element.source, view }), view
          ))(compileForServer(element)))(`${element.kind}/${element.name}`);
};

export var svelteSourceCompiler: Omit<SourceCompiler, 'references'> = {
  check: (element) => void compileForServer(element),
  describe: describeComponent,
};
