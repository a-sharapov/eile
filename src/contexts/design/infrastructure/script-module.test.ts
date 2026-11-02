import { describe, expect, it } from 'bun:test';
import {
  attempt,
  type DomainError,
  isDomainError,
} from '../../../shared/kernel/errors.ts';
import type { ElementName } from '../domain/element.ts';
import { checkScript, scriptHash } from './script-module.ts';

const errorOf = (source: string): DomainError | null =>
  attempt(
    () => (checkScript({ name: 'stage' as ElementName, source }), null),
    (error) => (isDomainError(error) ? error : null)
  );

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

  it.each([
    ["import * as THREE from 'three';", 'three'],
    ["import { scene } from './scene.js';", './scene.js'],
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
  ])('импорт %p отклоняется с подсказкой и местом', (source, path) => {
    const error = errorOf(`// сцена\n${source}\n`);
    expect(error?.code).toBe('design.script_import');
    expect(error?.message).toContain(`"${path}"`);
    expect(error?.message).toContain(
      'bundle your dependencies into one script'
    );
    expect(error?.at?.line).toBe(2);
  });

  it('require в собранном файле — не загрузка модуля, не мешает', () => {
    expect(
      errorOf("const fs = typeof require === 'function' && require('fs');\n")
    ).toBeNull();
  });

  it('хэш меняется вместе с исходником', () => {
    expect(scriptHash('a')).toBe(scriptHash('a'));
    expect(scriptHash('a')).not.toBe(scriptHash('b'));
    expect(scriptHash('a')).toMatch(/^[a-z0-9]+$/);
  });
});
