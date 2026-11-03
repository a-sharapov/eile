import { describe, expect, it } from 'bun:test';
import type { ElementName } from '../domain/element.ts';
import { compileForServer } from './svelte-compiler.ts';
import { isScoped, liftStyle } from './svelte-styles.ts';

const compiled = (
  style: string,
  markup = '<p class="a"><span class="b">x</span></p>'
) =>
  compileForServer({
    name: 'Card' as ElementName,
    source: `${markup}<style>${style}</style>`,
  });

const scoped = (style: string, markup?: string): boolean =>
  isScoped(compiled(style, markup).style!);

describe('стиль из серверного модуля Svelte', () => {
  it('берётся из константы модуля: класс области и CSS, как его выведет рендер', () => {
    const view = compiled('.a { color: red; }');
    expect(view.style).toEqual({
      hash: expect.stringMatching(/^svelte-[a-z0-9]+$/),
      code: `.a.${view.style!.hash} {color:red;}`,
    });
    expect(view.inline).toBe(false);
  });

  it('без <style> стиля нет; та же строка в тексте компонента за стиль не сходит', () => {
    expect(
      compileForServer({
        name: 'Card' as ElementName,
        source: `<p>{'const $$css = { hash: "x", code: "y" }'}</p>`,
      }).style
    ).toBeNull();
    expect(
      liftStyle("export default function A() { const s = 'const $$css = {}'; }")
    ).toBeNull();
    expect(compiled('').style).toBeNull();
  });

  it('<svelte:options css="injected" /> — автор оставляет стиль в странице', () => {
    const view = compiled(
      '.a { color: red; }',
      '<svelte:options css="injected" /><p class="a">x</p>'
    );
    expect(view.inline).toBe(true);
    expect(view.style).not.toBeNull();
  });
});

describe('стиль привязан к своему компоненту', () => {
  it('да: классы области, вложенные правила, @media и анимации с именем области', () => {
    expect(scoped('.a { color: red; } .a .b { color: blue; }')).toBe(true);
    expect(scoped('.a { color: red; & .b { color: blue; } }')).toBe(true);
    expect(scoped('@media (min-width: 40rem) { .a { color: red; } }')).toBe(
      true
    );
    expect(
      scoped(
        '@keyframes spin { to { opacity: 0; } } .a { animation: spin 1s; }'
      )
    ).toBe(true);
    expect(scoped('.a :global(.prose) { margin: 0; }')).toBe(true);
    expect(
      scoped('.a:is(.x, .y) { color: red; }', '<p class="a x">x</p>')
    ).toBe(true);
  });

  it('нет: правила на весь документ, @font-face, @import, глобальные анимации', () => {
    expect(scoped(':global(body) { margin: 0; } .a { color: red; }')).toBe(
      false
    );
    expect(scoped('.a { color: red; } :global(.a), .b { color: blue; }')).toBe(
      false
    );
    expect(
      scoped(
        '@media (min-width: 40rem) { :global(html) { font-size: 1.1rem; } }'
      )
    ).toBe(false);
    expect(
      scoped(
        '@font-face { font-family: X; src: url(x.woff2); } .a { font-family: X; }'
      )
    ).toBe(false);
    expect(scoped("@import url('x.css'); .a { color: red; }")).toBe(false);
    expect(
      scoped(
        '@keyframes -global-spin { to { opacity: 0; } } .a { color: red; }'
      )
    ).toBe(false);
  });

  it('класс чужой области за свой не считается', () => {
    const style = compiled('.a { color: red; }').style!;
    expect(isScoped({ ...style, code: `.a.${style.hash}x{color:red}` })).toBe(
      false
    );
  });
});
