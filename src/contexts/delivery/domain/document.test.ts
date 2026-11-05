import { describe, expect, it } from 'bun:test';
import { htmlDocument } from './document';

describe('htmlDocument', () => {
  it('ставит обычный viewport, если шаблон не задал свой', () => {
    const html = htmlDocument('ru', { head: '<title>x</title>', body: '' });
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">'
    );
  });

  it('свой viewport шаблона заменяет обычный', () => {
    const html = htmlDocument('ru', {
      head: '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      body: '',
    });
    expect(html.match(/name="viewport"/g)).toHaveLength(1);
    expect(html).toContain('viewport-fit=cover');
  });

  it('viewport в тексте страницы не считается', () => {
    const html = htmlDocument('ru', {
      head: '',
      body: '<p>name="viewport"</p>',
    });
    expect(html.match(/<meta name="viewport"/g)).toHaveLength(1);
  });
});
