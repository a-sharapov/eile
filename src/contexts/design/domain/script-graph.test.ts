import { describe, expect, it } from 'bun:test';
import {
  attempt,
  type DomainError,
  isDomainError,
} from '../../../shared/kernel/errors.ts';
import type { ElementName } from './element.ts';
import {
  assertReferencesExist,
  reachableScripts,
  referencedScript,
  scriptComponent,
} from './script-graph.ts';

const n = (raw: string) => raw as ElementName;

// shell → import('./viewer.js'), viewer → import … from './shell.js' и new URL('./pixels.js'); shell → runtime.
const GRAPH: Readonly<Record<string, readonly string[]>> = {
  shell: ['runtime', 'viewer'],
  viewer: ['shell', 'runtime', 'pixels'],
  runtime: [],
  pixels: ['missing'],
};

const referencesOf = (name: ElementName): ElementName[] =>
  (GRAPH[name] ?? []).map(n);

const reach = (name: ElementName) => reachableScripts(name, referencesOf);

describe('ссылки ./имя.js', () => {
  it.each([
    ['./shared.js', 'shared'],
    ['./svelte-runtime-2.js', 'svelte-runtime-2'],
  ])('%p — скрипт %p', (path, name) => {
    expect(referencedScript(path) as string | null).toBe(name);
  });

  it.each([
    'shared.js',
    './Shared.js',
    './shared.mjs',
    '../shared.js',
    './a/shared.js',
    './shared.js?v=1',
    './-x.js',
    `./${'a'.repeat(65)}.js`,
  ])('%p — не ссылка на скрипт сайта', (path) => {
    expect(referencedScript(path)).toBeNull();
  });
});

describe('граф скриптов', () => {
  it('достижимые — сам скрипт и всё по ссылкам, включая пропавшие', () => {
    expect([...reach(n('shell'))].toSorted()).toEqual([
      n('missing'),
      n('pixels'),
      n('runtime'),
      n('shell'),
      n('viewer'),
    ]);
    expect([...reach(n('runtime'))]).toEqual([n('runtime')]);
  });

  it('компонента — скрипты по кругу, по имени; без круга — сам скрипт', () => {
    expect(scriptComponent(n('viewer'), reach)).toEqual([
      n('shell'),
      n('viewer'),
    ]);
    expect(scriptComponent(n('shell'), reach)).toEqual([
      n('shell'),
      n('viewer'),
    ]);
    expect(scriptComponent(n('pixels'), reach)).toEqual([n('pixels')]);
  });
});

describe('ссылки при сохранении', () => {
  const errorOf = (source: string, existing: readonly string[]) =>
    attempt(
      () => (
        assertReferencesExist(
          { name: n('shell'), source },
          [
            { name: n('shell'), start: 0, end: 10 },
            {
              name: n('viewer'),
              start: source.indexOf("'"),
              end: source.lastIndexOf("'") + 1,
            },
          ],
          (_) => existing.includes(_)
        ),
        null
      ),
      (error): DomainError | null => (isDomainError(error) ? error : null)
    );

  it('пропавший скрипт — ошибка с местом ссылки; ссылка на себя — нет', () => {
    const source = "// вход\nconst v = () => import('./viewer.js');\n";
    const error = errorOf(source, []);
    expect(error?.code).toBe('design.unknown_script');
    expect(error?.message).toContain('"viewer"');
    expect(error?.at).toEqual({ line: 2, column: 24 });
    expect(errorOf(source, ['viewer'])).toBeNull();
  });
});
