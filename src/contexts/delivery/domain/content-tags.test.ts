import { describe, expect, it } from 'bun:test';
import {
  contentComponents,
  parseContent,
  resolvePageLinks,
  withoutHidden,
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

describe('скрытый блок', () => {
  it('скрытого компонента и скрытой формы нет среди частей', () => {
    expect(
      parseContent(
        '<p>До</p>\n[[Hero title="Акция" hidden]]\n[#Form:callback hidden]\n[#Form:faq]<p>После</p>'
      )
    ).toEqual([
      { html: '<p>До</p>\n\n\n' },
      { module: 'Form', name: 'faq' },
      { html: '<p>После</p>' },
    ]);
  });

  it('флаг стоит где угодно среди параметров; hidden=true — тоже скрыт', () => {
    expect(
      parseContent('[[A hidden x=1]][[B x=1 hidden=true]][[C hidden y="z"]]')
    ).toEqual([]);
  });

  it('видимому компоненту флаг не передаётся, даже hidden=false', () => {
    expect(
      parseContent('[[A hidden=false wide]][[B hidden="yes"]][[C data-hidden]]')
    ).toEqual([
      { component: 'A', props: { wide: true } },
      { component: 'B', props: {} },
      { component: 'C', props: { 'data-hidden': true } },
    ]);
  });

  it('тег один в абзаце уходит вместе с абзацем, в тексте — только сам тег', () => {
    expect(
      withoutHidden(
        '<p>[[A hidden]]</p><p> [#Form:x hidden] </p><p>Цена [[Price hidden]] руб.</p>'
      )
    ).toBe('<p>Цена  руб.</p>');
  });

  it('текст без скрытых тегов не меняется, слово hidden в тексте — не флаг', () => {
    const content =
      '<p>hidden</p>[[A wide]]<p>[#Form:x]</p>[#Form:hidden][[Hidden]]';
    expect(withoutHidden(content)).toBe(content);
  });

  it('скрытые компоненты не загружаются', () => {
    expect(contentComponents('[[A]] [[B hidden]] [[C hidden=false]]')).toEqual([
      'A',
      'C',
    ]);
  });
});
