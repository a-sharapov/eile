import { describe, expect, it } from 'bun:test';
import {
  changeSource,
  createElement,
  dependenciesOf,
  type ElementName,
  parseElementName,
  scriptsOf,
} from './element.ts';
import { findImportCycle } from './import-cycle.ts';

const name = (raw: string) => parseElementName(raw);

describe('имена элементов', () => {
  it.each(['Menu', 'Header2', 'BlogPostCard'])('принимает %p', (raw) => {
    expect(name(raw) as string).toBe(raw);
  });

  it.each(['menu', 'Blog-Card', '2Col', '', 'Меню'])('отклоняет %p', (raw) => {
    expect(() => name(raw)).toThrow('PascalCase');
  });
});

describe('dependenciesOf', () => {
  it('находит каждый импорт $components один раз', () => {
    const source = `<script>
      import Menu from '$components/Menu';
      import { default as Card } from "$components/Card";
      import '$components/Menu';
      import { link } from '$core';
    </script>`;
    expect(dependenciesOf(source).map(String)).toEqual(['Menu', 'Card']);
  });
});

describe('Element', () => {
  it('новый исходник повышает ревизию, прежний — ничего не меняет', () => {
    const { state } = createElement('component', name('Menu'), '<nav />');
    expect(changeSource('<nav />')(state).events).toEqual([]);
    const next = changeSource('<nav></nav>')(state);
    expect(next.state.revision).toBe(2);
    expect(next.events).toEqual([
      {
        type: 'design.element_changed',
        kind: 'component',
        name: name('Menu'),
        revision: 2,
      },
    ]);
  });

  it('пустой исходник отклоняется', () => {
    expect(() => createElement('template', name('Base'), '  \n')).toThrow(
      'cannot be empty'
    );
  });
});

describe('findImportCycle', () => {
  const graph: Record<string, string[]> = {
    Card: ['Price'],
    Price: ['Badge'],
    Badge: [],
  };
  const deps = (_: ElementName) => (graph[_] ?? []).map(name);

  it('показывает цикл, который замкнёт компонент', () => {
    expect(
      findImportCycle(name('Badge'), [name('Card')], deps)?.map(String)
    ).toEqual(['Badge', 'Card', 'Price', 'Badge']);
  });

  it('импорт самого себя — цикл', () => {
    expect(
      findImportCycle(name('Card'), [name('Card')], deps)?.map(String)
    ).toEqual(['Card', 'Card']);
  });

  it('ациклический граф проходит', () => {
    expect(findImportCycle(name('Page'), [name('Card')], deps)).toBeNull();
  });
});

describe('импорты компонентов', () => {
  it('находятся по from и import, разбор линейный', () => {
    expect(
      dependenciesOf(
        "import Menu from '$components/Menu';\nimport '$components/Footer';\nexport { X } from \"$components/X\";"
      ).map(String)
    ).toEqual(['Menu', 'Footer', 'X']);
    const started = performance.now();
    dependenciesOf(`import ${' '.repeat(100_000)}`.repeat(3));
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('скрипты сайта', () => {
  it.each(['kitchen-stage', 'three', '3d-scene'])('имя %p подходит', (raw) => {
    expect(parseElementName(raw, 'script') as string).toBe(raw);
  });

  it.each(['KitchenStage', '-stage', 'kitchen_stage', 'kitchen.js', ''])(
    'имя %p отклоняется',
    (raw) => {
      expect(() => parseElementName(raw, 'script')).toThrow('lowercase');
    }
  );

  it('до 2 МиБ — по байтам, а не по знакам', () => {
    const name = parseElementName('stage', 'script');
    const fits = `export const a = '${'x'.repeat(2 * 1024 * 1024 - 64)}';`;
    expect(createElement('script', name, fits).state.revision).toBe(1);
    // Кириллица — два байта на знак: знаков меньше предела, байтов — больше.
    const wide = `export const a = '${'я'.repeat(1024 * 1024 + 16)}';`;
    expect(() => createElement('script', name, wide)).toThrow('2 MiB');
    // Шаблон остаётся при прежнем пределе в знаках.
    expect(() =>
      createElement('template', parseElementName('Base'), fits)
    ).toThrow('characters');
  });

  it('scriptsOf находит подключения script(имя) по одному разу', () => {
    expect(
      scriptsOf(
        `{script('kitchen-stage')} {script("kitchen-stage")} {script( 'menu' )} {script(name)} {myscript('x')}`
      ).map(String)
    ).toEqual(['kitchen-stage', 'menu']);
  });
});
