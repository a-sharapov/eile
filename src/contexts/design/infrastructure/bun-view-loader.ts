import { type PluginBuilder, plugin } from 'bun';
import * as svelte from 'svelte';
import * as svelteServer from 'svelte/internal/server';
import { rewriteImports } from '../../../platform/module-imports.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  COMPONENT_IMPORT_PREFIX,
  type Element,
  type ElementKind,
  parseElementName,
} from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';
import {
  BUILTIN_PREFIX,
  type CompiledView,
  compileForServer,
  type ServerCompiler,
} from './svelte-compiler.ts';

// У Bun один реестр модулей на процесс. Виды — виртуальные модули рантайм-плагина:
// build.module() работает и после setup, и в бинарнике --compile (проверено на Bun 1.4.4),
// а рантайм-onResolve голые спецификаторы не видит.
let _builder: PluginBuilder | undefined;

const _current = (): PluginBuilder | undefined => _builder;

const _modules = (): PluginBuilder =>
  _current() ??
  (plugin({
    name: 'cms-views',
    setup: (build) => void (_builder = build),
  }),
  _current()!);

const _componentKeys = (imports: readonly string[]): string[] =>
  imports
    .filter((_) => _.startsWith(COMPONENT_IMPORT_PREFIX))
    .map((_) => `component/${_.slice(COMPONENT_IMPORT_PREFIX.length)}`);

let _instances = 0;

/** Вид и ключи всех элементов его графа импортов. */
export type LoadedView = {
  readonly view: unknown;
  readonly elements: readonly string[];
};

/** Компилирует элементы в серверные компоненты Svelte и грузит их как ES-модули. */
export var defineViewLoader = ({
  elements,
  runtime,
  builtins,
  compile = compileForServer,
}: {
  elements: ElementRepository;
  runtime: object;
  /** Исходники встроенных компонентов по пути импорта: `$core/Uncached`. */
  builtins: Readonly<Record<string, string>>;
  compile?: ServerCompiler;
}) => {
  // Своя область спецификаторов у каждого приложения: два сайта в одном процессе не делят виды.
  const scope = `@cms/views-${++_instances}`;
  const defined = new Set<string>();
  const resolved = new Map<string, string>();
  const closures = new Map<string, readonly string[]>();

  const host = (path: string): string => `${scope}/host/${path}`;

  const defineObject = (path: string, exports: object): void =>
    void _modules().module(host(path), () => ({
      exports: { ...exports },
      loader: 'object',
    }));

  const defineCode = (specifier: string, code: string): void =>
    void (
      defined.has(specifier) ||
      (_modules().module(specifier, () => ({ contents: code, loader: 'js' })),
      defined.add(specifier))
    );

  const load = (kind: ElementKind, name: string): Element =>
    elements.get(kind, parseElementName(name)) ??
    fail('design.element_not_found', `There is no ${kind} named "${name}"`);

  const target = (path: string, trail: readonly string[]): string =>
    path.startsWith(COMPONENT_IMPORT_PREFIX)
      ? specifier(
          'component',
          path.slice(COMPONENT_IMPORT_PREFIX.length),
          trail
        )
      : path.startsWith(BUILTIN_PREFIX) && !(path in builtins)
        ? fail('design.element_not_found', `There is no built-in "${path}"`)
        : host(path);

  const rewrite = (trail: readonly string[]) =>
    rewriteImports((path) => target(path, trail));

  // Хэш — от кода с переписанными импортами: правка зависимости меняет спецификаторы всех зависящих.
  const register =
    (key: string, compiled: CompiledView) =>
    (code: string): string =>
      pipe(
        (_: string) => `${scope}/${key}-${Bun.hash(_).toString(36)}`,
        (_: string) => (
          defineCode(_, code),
          resolved.set(key, _),
          closures.set(key, [
            ...new Set([
              key,
              ..._componentKeys(compiled.imports).flatMap(
                (dependency) => closures.get(dependency) ?? [dependency]
              ),
            ]),
          ]),
          _
        )
      )(code);

  const specifier = (
    kind: ElementKind,
    name: string,
    trail: readonly string[]
  ): string => {
    const key = `${kind}/${name}`;
    return (
      resolved.get(key) ??
      (trail.includes(key)
        ? fail(
            'design.import_cycle',
            `Import cycle: ${[...trail, key].join(' → ')}`
          )
        : pipe(
            () => load(kind, name),
            compile,
            (_: CompiledView) =>
              pipe(rewrite([...trail, key]), register(key, _))(_.code)
          )())
    );
  };

  const loadView =
    (kind: ElementKind) =>
    (name: string): Promise<LoadedView> =>
      Promise.resolve(name).then(
        pipe(
          (_) => specifier(kind, _, []),
          (_) => import(_),
          (_) => ({
            view: _.default,
            elements: closures.get(`${kind}/${name}`) ?? [`${kind}/${name}`],
          })
        )
      );

  defineObject('svelte', svelte);
  defineObject('svelte/internal/server', svelteServer);
  defineObject('$core', runtime);
  Object.entries(builtins).forEach(
    ({ 0: path, 1: source }) =>
      void defineCode(
        host(path),
        rewrite([])(
          compileForServer({
            name: parseElementName(path.slice(BUILTIN_PREFIX.length)),
            source,
          }).code
        )
      )
  );

  return {
    template: loadView('template'),
    component: loadView('component'),
    /** Забывает разрешённые спецификаторы; загруженные модули остаются в памяти. */
    invalidate: (): void => (resolved.clear(), closures.clear()),
  };
};
