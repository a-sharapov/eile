import { expect, it } from 'bun:test';
import { dirname, relative, resolve } from 'node:path';
import { Glob } from 'bun';

// Правила зависимостей из docs/architecture.md.

const SRC = resolve(import.meta.dir, '../src');

// Инструкция начинается с первой колонки: исходники в строках и комментариях не считаются импортами.
const IMPORT =
  /^(?:import|export)\s+[\w$*{},\s]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm;

type Layer =
  | 'domain'
  | 'application'
  | 'infrastructure'
  | 'interface'
  | 'index';

type Location =
  | {
      readonly area: 'context';
      readonly context: string;
      readonly layer: Layer;
    }
  | { readonly area: 'kernel' | 'platform' | 'root' };

const _AREAS: Record<string, Location> = {
  shared: { area: 'kernel' },
  platform: { area: 'platform' },
  _: { area: 'root' },
};

const locate = (path: string): Location => {
  const { 0: top, 1: context, 2: layer } = relative(SRC, path).split('/');
  return top === 'contexts' && context && layer
    ? {
        area: 'context',
        context,
        layer: layer === 'index.ts' ? 'index' : (layer as Layer),
      }
    : (_AREAS[top ?? '_'] ?? _AREAS._!);
};

const _isLayer = (location: Location, layers: readonly Layer[]): boolean =>
  location.area === 'context' && layers.includes(location.layer);

const _PURE: readonly Layer[] = ['domain', 'application'];

const _contextViolation = (
  from: Extract<Location, { area: 'context' }>,
  target: Location
): string | null =>
  target.area === 'context' && target.context !== from.context
    ? target.layer === 'index'
      ? null
      : `other contexts are reached only through contexts/${target.context}/index.ts`
    : target.area === 'root'
      ? 'contexts cannot import the composition root'
      : from.layer === 'domain'
        ? target.area === 'kernel' || _isLayer(target, ['domain'])
          ? null
          : 'domain imports only its own domain and the kernel'
        : from.layer === 'application'
          ? target.area === 'kernel' || _isLayer(target, _PURE)
            ? null
            : 'application imports only domain, application and the kernel'
          : null;

const _packageViolation = (from: Location): string | null =>
  from.area === 'kernel' || _isLayer(from, _PURE)
    ? 'domain, application and kernel code cannot import packages'
    : null;

const _RULES: {
  readonly [A in Location['area']]: (
    from: Extract<Location, { area: A }>,
    target: Location
  ) => string | null;
} = {
  kernel: (_from, target) =>
    target.area === 'kernel' ? null : 'the kernel imports only the kernel',
  platform: (_from, target) =>
    target.area === 'context' || target.area === 'root'
      ? 'platform knows no contexts'
      : null,
  context: _contextViolation,
  root: () => null,
};

/** Почему `from` не может импортировать `target`; null — может. */
const violation = (
  from: Location,
  specifier: string,
  target: Location | null
): string | null =>
  specifier === 'bun:test'
    ? null
    : target === null
      ? _packageViolation(from)
      : (
          _RULES[from.area] as (
            from: Location,
            target: Location
          ) => string | null
        )(from, target);

const problemsOf = (file: string): Promise<string[]> =>
  Bun.file(resolve(SRC, file))
    .text()
    .then((code) =>
      [...code.matchAll(IMPORT)]
        .map((_) => (_[1] ?? _[2])!)
        .map((specifier) => ({
          specifier,
          reason: violation(
            locate(resolve(SRC, file)),
            specifier,
            specifier.startsWith('.')
              ? locate(resolve(dirname(resolve(SRC, file)), specifier))
              : null
          ),
        }))
        .filter((_) => _.reason !== null)
        .map((_) => `src/${file} → ${_.specifier}: ${_.reason}`)
    );

it('исходники соблюдают правила зависимостей', async () => {
  const problems = await Promise.all(
    Array.from(new Glob('**/*.ts').scanSync(SRC)).map(problemsOf)
  );
  expect(problems.flat()).toEqual([]);
});

it('проверка ловит нарушения', () => {
  const domain = locate(resolve(SRC, 'contexts/content/domain/page.ts'));
  const otherInfra = locate(
    resolve(SRC, 'contexts/design/infrastructure/bun-view-loader.ts')
  );
  const ownInfra = locate(
    resolve(SRC, 'contexts/content/infrastructure/migrations.ts')
  );
  const kernel = locate(resolve(SRC, 'shared/kernel/pipe.ts'));
  expect(violation(domain, 'bun:sqlite', null)).toContain(
    'cannot import packages'
  );
  expect(
    violation(domain, '../infrastructure/migrations.ts', ownInfra)
  ).toContain('own domain');
  expect(
    violation(domain, '../../design/infrastructure/x.ts', otherInfra)
  ).toContain('only through');
  expect(
    violation(kernel, '../../platform/x.ts', { area: 'platform' })
  ).toContain('only the kernel');
});
