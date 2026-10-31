import { expect, it } from 'bun:test';
import { rewriteImports } from './module-imports.ts';

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
