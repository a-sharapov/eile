import { compile } from 'svelte/compiler';
import { attempt, fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  COMPONENT_IMPORT_PREFIX,
  type Element,
  parseElementName,
} from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';
import { hasKeyTags } from '../domain/placeholders.ts';
import { ASSETS_PREFIX, type ClientRuntime } from './client-runtime.ts';
import { sveltePoint } from './svelte-compiler.ts';

// Стили острова уже пришли с серверным HTML: хэш классов совпадает, потому что совпадает имя файла.
const _OPTIONS = {
  generate: 'client',
  css: 'external',
  runes: true,
  discloseVersion: false,
} as const;

const _IMPORT_SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\2/g;

const _transpiler = new Bun.Transpiler({ loader: 'js' });

const _RUNTIME_FILES = {
  'svelte/internal/client': 'internal-client.js',
  svelte: 'svelte.js',
} as const;

// В браузере нет словарей и своих настроек: остров получает тексты через props.
const _compile = (element: Element): string =>
  hasKeyTags(element.source)
    ? fail(
        'design.island_placeholders',
        `${element.name}: an island has no dictionaries in the browser — pass texts as props`
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

// Остров работает в браузере: данные сервера (`$core`) он получает только через props.
const _checkImports =
  (name: string) =>
  (code: string): string => {
    const forbidden = _transpiler
      .scanImports(code)
      .map((_) => _.path)
      .find(
        (_) => !(_ in _RUNTIME_FILES) && !_.startsWith(COMPONENT_IMPORT_PREFIX)
      );
    return forbidden === undefined
      ? code
      : fail(
          'design.island_import',
          `${name}: an island runs in the browser and cannot import "${forbidden}"`
        );
  };

/** Компоненты-острова как ES-модули для браузера: `/_cms/islands/Name.hash.js`. */
export var defineClientViews = ({
  elements,
  runtime,
}: {
  elements: ElementRepository;
  runtime: () => Promise<ClientRuntime>;
}) => {
  const modules = new Map<string, string>();
  const resolved = new Map<string, string>();

  const load = (name: string): Element =>
    elements.get('component', parseElementName(name)) ??
    fail('design.element_not_found', `There is no component named "${name}"`);

  const register =
    (name: string) =>
    (code: string): string => {
      const url = `${ASSETS_PREFIX}/islands/${name}.${Bun.hash(code).toString(36)}.js`;
      modules.set(url, code);
      resolved.set(name, url);
      return url;
    };

  const rewrite =
    (live: ClientRuntime, trail: readonly string[]) =>
    (code: string): string =>
      code.replace(
        _IMPORT_SPECIFIER,
        (_match, keyword: string, quote: string, path: string) =>
          `${keyword}${quote}${
            path.startsWith(COMPONENT_IMPORT_PREFIX)
              ? urlOf(live, path.slice(COMPONENT_IMPORT_PREFIX.length), trail)
              : live.url(_RUNTIME_FILES[path as keyof typeof _RUNTIME_FILES])
          }${quote}`
      );

  const urlOf = (
    live: ClientRuntime,
    name: string,
    trail: readonly string[]
  ): string =>
    resolved.get(name) ??
    (trail.includes(name)
      ? fail(
          'design.import_cycle',
          `Import cycle: ${[...trail, name].join(' → ')}`
        )
      : pipe<void, string>(
          () => load(name),
          _compile,
          _checkImports(name),
          rewrite(live, [...trail, name]),
          register(name)
        )());

  return {
    url: (name: string): Promise<string> =>
      runtime().then((live) => urlOf(live, name, [])),
    hydrator: (): Promise<string> => runtime().then((_) => _.url('svelte.js')),
    /** Модуль острова или файл рантайма по пути `/_cms/...`; null — такого нет. */
    asset: (path: string): Promise<string | null> =>
      runtime().then(
        (live) =>
          modules.get(path) ??
          (path.startsWith(`${ASSETS_PREFIX}/runtime/${live.version}/`)
            ? ((file) =>
                Object.hasOwn(live.files, file) ? live.files[file]! : null)(
                path.slice(path.lastIndexOf('/') + 1)
              )
            : null)
      ),
    invalidate: (): void => resolved.clear(),
  };
};
