import { plugin as bunPlugin, type PluginBuilder } from 'bun';
import { attempt, fail } from '../../../shared/kernel/errors.ts';
import type { Plugin } from '../domain/plugin.ts';
import type { PluginHooks, PluginLoader } from '../domain/ports.ts';

// Как и виды, плагины — виртуальные модули рантайм-плагина Bun (см. design/infrastructure/bun-view-loader.ts).
let _builder: PluginBuilder | undefined;

const _current = (): PluginBuilder | undefined => _builder;

const _modules = (): PluginBuilder =>
  _current() ??
  (bunPlugin({
    name: 'cms-extensions',
    setup: (build) => void (_builder = build),
  }),
  _current()!);

const _transpiler = new Bun.Transpiler({ loader: 'ts' });

const _IMPORT_SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\2/g;

/** Плагину доступен только `$core`: остального внутри бинарника нет. */
export var PLUGIN_IMPORTS: readonly string[] = ['$core'];

type _BunMessage = {
  readonly message: string;
  readonly position?: { readonly line: number; readonly column: number };
};

// Bun сообщает «Parse error», а суть и место — в первой из errors; строка и столбец у него с единицы.
const _transpile = (plugin: Plugin): string =>
  attempt(
    () => _transpiler.transformSync(plugin.source),
    (error) =>
      ((first) =>
        fail(
          'extensions.compile_failed',
          `${plugin.name}: ${first?.message ?? (error as Error).message}`,
          first?.position && {
            line: first.position.line,
            column: first.position.column,
          }
        ))((error as { errors?: readonly _BunMessage[] }).errors?.[0])
  );

const _checkImports =
  (name: string) =>
  (code: string): string => {
    const forbidden = _transpiler
      .scanImports(code)
      .map((_) => _.path)
      .find((_) => !PLUGIN_IMPORTS.includes(_));
    return forbidden === undefined
      ? code
      : fail(
          'extensions.forbidden_import',
          `${name}: cannot import "${forbidden}"`
        );
  };

const _hooks =
  (name: string) =>
  (module: { default?: unknown }): PluginHooks =>
    typeof module.default === 'object' && module.default !== null
      ? (module.default as PluginHooks)
      : fail(
          'extensions.invalid_plugin',
          `${name}: the module must export default { render?, notFound?, on? }`
        );

let _instances = 0;

export var defineBunPluginLoader = (runtime: object): PluginLoader => {
  const scope = `@cms/plugins-${++_instances}`;
  const loaded = new Map<string, Promise<PluginHooks>>();

  _modules().module(`${scope}/$core`, () => ({
    exports: { ...runtime },
    loader: 'object',
  }));

  const code = (plugin: Plugin): string =>
    _checkImports(plugin.name)(_transpile(plugin)).replace(
      _IMPORT_SPECIFIER,
      (_match, keyword: string, quote: string, path: string) =>
        `${keyword}${quote}${scope}/${path}${quote}`
    );

  const load = (plugin: Plugin): Promise<PluginHooks> => {
    // Ревизия после удаления и создания заново снова 1: без хэша исходника из кэша пришёл бы старый код.
    const specifier = `${scope}/plugin/${plugin.name}-${plugin.revision}-${Bun.hash(plugin.source).toString(36)}`;
    return (
      loaded.get(specifier) ??
      (_modules().module(specifier, () => ({
        contents: code(plugin),
        loader: 'js',
      })),
      loaded.set(
        specifier,
        Promise.resolve(specifier)
          .then((_) => import(_))
          .then(_hooks(plugin.name))
      ),
      loaded.get(specifier)!)
    );
  };

  return { check: (plugin) => void code(plugin), load };
};
