import { describe, expect, it } from 'bun:test';
import {
  parseBlocks,
  serializeBlocks,
  tagOf,
} from '../manager/src/lib/content-blocks.ts';
import { parseContent } from '../src/contexts/delivery/domain/content-tags.ts';

// Менеджер собирает контент из блоков, сайт разбирает теги: разборы должны совпадать.

const calls = (content: string) =>
  parseContent(content).filter((_) => !('html' in _));

const shape = (content: string) =>
  parseBlocks(content).map((_) =>
    _.kind === 'text'
      ? { html: _.html }
      : _.kind === 'module'
        ? { module: _.module, name: _.name }
        : { component: _.name, props: _.props }
  );

describe('блоки контента', () => {
  it('тег между абзацами и в отдельном абзаце — блок компонента', () => {
    expect(
      shape(
        '<p>До</p>\n[[Callout title="Привет" wide=false n=3 framed]]\n<p>[[Menu parent=5]]</p><h2>После</h2>'
      )
    ).toEqual([
      { html: '<p>До</p>' },
      {
        component: 'Callout',
        props: { title: 'Привет', wide: false, n: 3, framed: true },
      },
      { component: 'Menu', props: { parent: 5 } },
      { html: '<h2>После</h2>' },
    ]);
  });

  it('тег внутри текста остаётся текстом', () => {
    const content = '<p>Цена: [[Price id=3]] руб.</p><ul><li>[[A]]</li></ul>';
    expect(shape(content)).toEqual([{ html: content }]);
  });

  it('теги подряд и контент из одних тегов', () => {
    expect(shape('[[A]]\n[[B x="y"]]')).toEqual([
      { component: 'A', props: {} },
      { component: 'B', props: { x: 'y' } },
    ]);
  });

  it('сборка обратно даёт те же вызовы для сайта', () => {
    const content =
      '<p>До</p><p>[[Callout title="Привет" tone=warning]]</p>\n<p>Цена [[Price id=3]]</p>[[Menu]]';
    const rebuilt = serializeBlocks(parseBlocks(content));
    expect(calls(rebuilt)).toEqual(calls(content));
    expect(rebuilt).toBe(
      '<p>До</p>\n[[Callout title="Привет" tone="warning"]]\n<p>Цена [[Price id=3]]</p>\n[[Menu]]'
    );
  });

  it('значения записываются так, что сайт читает их тем же типом', () => {
    const props = {
      text: 'Скажи "да"',
      n: -1.5,
      on: true,
      off: false,
      id: '7',
    };
    expect(calls(tagOf('X', props))).toEqual([
      {
        component: 'X',
        props: { text: "Скажи 'да'", n: -1.5, on: true, off: false, id: '7' },
      },
    ]);
  });

  it('тег формы [#Form:имя] — свой блок; внутри текста — текст; сайт читает то же', () => {
    const content =
      '<p>Оставьте заявку</p>\n[#Form:callback]\n<p>Или [#Form:faq] прямо тут</p>[[Menu]]';
    expect(shape(content)).toEqual([
      { html: '<p>Оставьте заявку</p>' },
      { module: 'Form', name: 'callback' },
      { html: '<p>Или [#Form:faq] прямо тут</p>' },
      { component: 'Menu', props: {} },
    ]);
    const rebuilt = serializeBlocks(parseBlocks(content));
    expect(calls(rebuilt)).toEqual(calls(content));
    expect(rebuilt).toBe(
      '<p>Оставьте заявку</p>\n[#Form:callback]\n<p>Или [#Form:faq] прямо тут</p>\n[[Menu]]'
    );
  });
});
