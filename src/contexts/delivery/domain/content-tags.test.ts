import { describe, expect, it } from 'bun:test';
import {
  contentComponents,
  parseContent,
  resolvePageLinks,
} from './content-tags.ts';

describe('теги в контенте', () => {
  it('режут контент на HTML и вызовы с типами props', () => {
    expect(
      parseContent(
        '<p>До</p>[[Gallery folder="лето 2026" columns=3 wide]]<p>После</p>'
      )
    ).toEqual([
      { html: '<p>До</p>' },
      {
        component: 'Gallery',
        props: { folder: 'лето 2026', columns: 3, wide: true },
      },
      { html: '<p>После</p>' },
    ]);
  });

  it('true и false без кавычек — логические значения', () => {
    expect(
      parseContent('[[Gallery wide=false framed=true caption="false"]]')
    ).toEqual([
      {
        component: 'Gallery',
        props: { wide: false, framed: true, caption: 'false' },
      },
    ]);
  });

  it('без тегов — один кусок HTML, пустых кусков нет', () => {
    expect(parseContent('<p>x</p>')).toEqual([{ html: '<p>x</p>' }]);
    expect(parseContent('[[A]][[B x=y]]')).toEqual([
      { component: 'A', props: {} },
      { component: 'B', props: { x: 'y' } },
    ]);
  });

  it('не трогает то, что не похоже на тег компонента', () => {
    expect(parseContent('[[lower]] [[ Space]] [x]')).toEqual([
      { html: '[[lower]] [[ Space]] [x]' },
    ]);
  });

  it('тег модуля [#Form:имя] — отдельная часть, между компонентами тоже', () => {
    expect(
      parseContent(
        '<p>Оставьте заявку</p>[#Form:callback][[Callout]]<p>x [#Form:faq-2] y</p>'
      )
    ).toEqual([
      { html: '<p>Оставьте заявку</p>' },
      { module: 'Form', name: 'callback' },
      { component: 'Callout', props: {} },
      { html: '<p>x ' },
      { module: 'Form', name: 'faq-2' },
      { html: ' y</p>' },
    ]);
  });

  it('не похожее на тег модуля остаётся текстом', () => {
    expect(parseContent('[#form:x] [#Form:Upper] [#Form:] [# Form:x]')).toEqual(
      [{ html: '[#form:x] [#Form:Upper] [#Form:] [# Form:x]' }]
    );
  });

  it('список компонентов без повторов', () => {
    expect(contentComponents('[[A]] [[B]] [[A x=1]]')).toEqual(['A', 'B']);
  });

  it('[~id~] становится адресом страницы, неизвестная — #', () => {
    const paths: Record<number, string> = { 3: '/kontakty', 7: '/a"b' };
    expect(
      resolvePageLinks(
        '<a href="[~3~]">Контакты</a> <a href="[~9~]">x</a> [~7~]',
        (id) => paths[id] ?? null
      )
    ).toBe('<a href="/kontakty">Контакты</a> <a href="#">x</a> /a&quot;b');
  });
});
