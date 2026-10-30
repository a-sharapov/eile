import { describe, expect, it } from 'bun:test';
import {
  changeSource,
  createElement,
  dependenciesOf,
  type ElementName,
  parseElementName,
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
