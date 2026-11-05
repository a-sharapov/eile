import { describe, expect, it, spyOn } from 'bun:test';
import * as moduleImports from '../../../platform/module-imports.ts';
import {
  attempt,
  type DomainError,
  isDomainError,
} from '../../../shared/kernel/errors.ts';
import type { ElementName } from '../domain/element.ts';
import {
  defineScriptModules,
  linkScript,
  scriptHash,
} from './script-module.ts';

const modules = defineScriptModules();

const script = (source: string) => ({
  name: 'stage' as ElementName,
  source,
});

const errorOf = (source: string): DomainError | null =>
  attempt(
    () => (modules.check(script(source)), null),
    (error) => (isDomainError(error) ? error : null)
  );

const referencesOf = (source: string) =>
  modules.references(script(source)).map((_) => ({
    name: _.name,
    text: source.slice(_.start, _.end),
  }));

describe('проверка скрипта сайта', () => {
  it('модуль с импортом по https:// проходит', () => {
    expect(
      errorOf(
        "import { gsap } from 'https://cdn.example.com/gsap.js';\nexport const run = () => import('https://cdn.example.com/x.js');\nconst stage = document.querySelector('[data-stage]');\nawait Promise.resolve(stage);\n"
      )
    ).toBeNull();
  });

  it('синтаксическая ошибка — с местом: строка и столбец с единицы', () => {
    const error = errorOf('const a = 1;\nexport const b = ;\n');
    expect(error?.code).toBe('design.script_syntax');
    expect(error?.message).toContain('stage:');
    expect(error?.at).toEqual({ line: 2, column: 18 });
  });

  it('несколько ошибок разбора — первая с местом', () => {
    const error = errorOf('const a = 1;\nfunction (\n');
    expect(error?.code).toBe('design.script_syntax');
    expect(error?.at?.line).toBe(2);
  });

  it('другие скрипты сайта — по ./имя.js в любом месте, где браузер грузит модуль', () => {
    expect(
      errorOf(
        [
          "import { mount } from './svelte-runtime.js';",
          "import './polyfills.js';",
          "export { scene } from './scene-core.js';",
          "export * from './scene-core.js';",
          "const viewer = () => import('./viewer.js');",
          'const pixels = () => import(`./pixels.js`);',
          "new Worker(new URL('./pixels-worker.js', import.meta.url), { type: 'module' });",
        ].join('\n')
      )
    ).toBeNull();
  });

  it.each([
    ["import * as THREE from 'three';", 'three'],
    ["import { scene } from './Scene.js';", './Scene.js'],
    ["import { scene } from './scene.mjs';", './scene.mjs'],
    ["import { scene } from '../scene.js';", '../scene.js'],
    ["import { scene } from './scene.js?v=2';", './scene.js?v=2'],
    ["import { scene } from './chunks/scene.js';", './chunks/scene.js'],
    [
      "import x from '/_cms/scripts/other.abc.js';",
      '/_cms/scripts/other.abc.js',
    ],
    [
      "export * from 'http://cdn.example.com/x.js';",
      'http://cdn.example.com/x.js',
    ],
    [
      "const m = await import('data:text/javascript,1');",
      'data:text/javascript,1',
    ],
    ['const m = await import(`three`);', 'three'],
  ])('импорт %p отклоняется с подсказкой и местом', (source, path) => {
    const error = errorOf(`// сцена\n${source}\n`);
    expect(error?.code).toBe('design.script_import');
    expect(error?.message).toContain(`"${path}"`);
    expect(error?.message).toContain('bundle your dependencies');
    expect(error?.message).toContain('./name.js');
    expect(error?.at?.line).toBe(2);
  });

  it('место отказа — сам путь, а не первое упоминание текста', () => {
    const error = errorOf("const note = 'three';\nimport 'three';\n");
    expect(error?.at).toEqual({ line: 2, column: 8 });
  });

  it('require в собранном файле — не загрузка модуля, не мешает', () => {
    expect(
      errorOf("const fs = typeof require === 'function' && require('fs');\n")
    ).toBeNull();
  });

  it('вычисляемый import() и new URL без import.meta.url не проверяются', () => {
    expect(
      errorOf(
        "const name = 'x';\nimport(name);\nnew URL('./model.glb', location.href);\nnew URL('./texture.png', import.meta.url);\n"
      )
    ).toBeNull();
  });

  it('хэш меняется вместе с исходником', () => {
    expect(scriptHash('a')).toBe(scriptHash('a'));
    expect(scriptHash('a')).not.toBe(scriptHash('b'));
    expect(scriptHash('a')).toMatch(/^[a-z0-9]+$/);
  });
});

describe('ссылки скрипта на другие скрипты', () => {
  it('находятся по дереву разбора: импорт, реэкспорт, import(), new URL', () => {
    expect(
      referencesOf(
        [
          "import { a } from './shared.js';",
          "export * from './shared.js';",
          'const lazy = () => import(`./lazy.js`);',
          "const w = new Worker(new URL('./w.js', import.meta.url));",
          "import x from 'https://cdn.example.com/x.js';",
        ].join('\n')
      )
    ).toEqual([
      { name: 'shared' as ElementName, text: "'./shared.js'" },
      { name: 'shared' as ElementName, text: "'./shared.js'" },
      { name: 'lazy' as ElementName, text: '`./lazy.js`' },
      { name: 'w' as ElementName, text: "'./w.js'" },
    ]);
  });

  it('экранированный путь — тоже ссылка: значение строки, а не её запись', () => {
    expect(referencesOf("import { a } from '.\\/shared.js';")).toEqual([
      { name: 'shared' as ElementName, text: "'.\\/shared.js'" },
    ]);
  });

  // Дерево acorn собранной сцены в мегабайт — 0,2 с и больше 100 МБ на пике (ADR 0057).
  it('дерево строится, только когда путям есть где быть', () => {
    const tree = spyOn(moduleImports, 'modulePaths');
    const fresh = defineScriptModules();
    const scene = [
      'function blob(e){try{return new URL(e).protocol==="blob:"}catch(t){return!1}}',
      'const fs = typeof require === "function" ? require("fs") : null;',
      "import x from 'https://cdn.example.com/x.js';",
      'export const stage = () => blob("x");',
    ].join('\n');
    expect(fresh.references(script(scene))).toEqual([]);
    fresh.check(script(scene));
    expect(tree).not.toHaveBeenCalled();
    expect(
      fresh.references(
        script(`${scene}\nconst lazy = () => import('./lazy.js');`)
      )
    ).toHaveLength(1);
    expect(tree).toHaveBeenCalledTimes(1);
    fresh.references(
      script(`${scene}\nconst w = new URL(name, import.meta.url);`)
    );
    expect(tree).toHaveBeenCalledTimes(2);
    expect(errorOf(`${scene}\nimport three from 'three';`)?.code).toBe(
      'design.script_import'
    );
    tree.mockRestore();
  });

  it('строка, где только написано «./x.js», — не ссылка', () => {
    expect(
      referencesOf(
        [
          "const path = './x.js';",
          'const code = "import(\'./x.js\')";',
          'const html = `<script type="module" src="./x.js"></script>`;',
          "// import { a } from './x.js';",
          "const relative = new URL('./x.js', location.href);",
        ].join('\n')
      )
    ).toEqual([]);
  });

  it('исходник, который не разбирается, — без ссылок', () => {
    expect(referencesOf('import { from')).toEqual([]);
  });

  it('linkScript меняет только пути ссылок, кавычки — свои', () => {
    const source =
      "import { a } from './shared.js';\nconst note = './shared.js';\nconst lazy = () => import(`./lazy.js`);\n";
    expect(
      linkScript(
        source,
        modules.references(script(source)),
        (_) => `./${_}.h1.js`
      )
    ).toBe(
      "import { a } from './shared.h1.js';\nconst note = './shared.js';\nconst lazy = () => import(`./lazy.h1.js`);\n"
    );
  });
});
