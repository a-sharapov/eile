import { expect, it } from 'bun:test';
import { modulePaths, replacePaths, rewriteImports } from './module-imports.ts';

const _mark = rewriteImports((_) => `@x/${_}`);

it('переписывает статические, побочные и динамические импорты и реэкспорты', () => {
  expect(
    _mark(
      [
        "import * as $ from 'svelte/internal/server';",
        'import Menu from "$components/Menu";',
        "import '$core';",
        "export { a } from '$core';",
        "export * from 'svelte';",
        "const later = () => import('$components/Card');",
      ].join('\n')
    )
  ).toBe(
    [
      "import * as $ from '@x/svelte/internal/server';",
      'import Menu from "@x/$components/Menu";',
      "import '@x/$core';",
      "export { a } from '@x/$core';",
      "export * from '@x/svelte';",
      "const later = () => import('@x/$components/Card');",
    ].join('\n')
  );
});

it('не трогает слова import и from в строках, шаблонах и комментариях', () => {
  const code = [
    "import { site } from '$core';",
    "const word = 'import';",
    "const from = 'x', other = 'y';",
    "const html = `<pre>import Menu from '$components/Menu';</pre>`;",
    "// import Card from '$components/Card'",
    "const pair = ['from', 'import'];",
  ].join('\n');
  expect(_mark(code)).toBe(code.replace("from '$core'", "from '@x/$core'"));
});

it('ошибку разбора не прячет', () => {
  expect(() => _mark("import from from 'x")).toThrow();
});

it('modulePaths: импорты, import() строкой и шаблоном без подстановок, new URL от import.meta.url', () => {
  const code = [
    "import { a } from './a.js';",
    'const b = () => import(`./b.js`);',
    "const w = new Worker(new URL('./w.js', import.meta.url));",
    'const c = (x) => import(`./${x}.js`);',
    "const d = new URL('./d.js', location.href);",
    "const e = new URL('./e.js');",
  ].join('\n');
  expect(
    modulePaths(code).map((_) => ({
      kind: _.kind,
      value: _.value,
      text: code.slice(_.start, _.end),
    }))
  ).toEqual([
    { kind: 'module', value: './a.js', text: "'./a.js'" },
    { kind: 'module', value: './b.js', text: '`./b.js`' },
    { kind: 'url', value: './w.js', text: "'./w.js'" },
  ]);
});

it('rewriteImports не трогает new URL; replacePaths оставляет кавычки свои', () => {
  const code =
    "import a from './a.js';\nconst w = new URL('./w.js', import.meta.url);\nconst b = import(`./b.js`);";
  expect(_mark(code)).toBe(
    "import a from '@x/./a.js';\nconst w = new URL('./w.js', import.meta.url);\nconst b = import(`@x/./b.js`);"
  );
  expect(
    replacePaths(code, modulePaths(code), (_) => _.value.toUpperCase())
  ).toBe(
    "import a from './A.JS';\nconst w = new URL('./W.JS', import.meta.url);\nconst b = import(`./B.JS`);"
  );
});
