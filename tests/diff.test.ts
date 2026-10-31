import { describe, expect, it } from 'bun:test';
import { compact, diffLines, textLines } from '../manager/src/lib/diff.ts';

const plain = (line: ReturnType<typeof diffLines>[number]) =>
  line.kind === 'skip'
    ? `… ${line.count}`
    : `${line.kind}: ${line.pieces.map((_) => (_.changed ? `[${_.text}]` : _.text)).join('')}`;

describe('сравнение версий', () => {
  it('текст страницы — абзацы без разметки, пункты списка с точкой, сущности раскрыты', () => {
    expect(
      textLines(
        '<h2>Цены</h2><p>Кофе&nbsp;&mdash; <b>200</b>&#8381;</p><ul><li>Чай</li><li>Сок</li></ul>[[Callout title="x"]]'
      )
    ).toEqual([
      'Цены',
      'Кофе — 200₽',
      '• Чай',
      '• Сок',
      '[[Callout title="x"]]',
    ]);
  });

  it('изменённый абзац — пара строк с отмеченными словами, общие — как есть', () => {
    expect(
      diffLines(
        ['Цены', 'Кофе стоит 200', 'Адрес'],
        ['Цены', 'Кофе стоит 250', 'Адрес']
      ).map(plain)
    ).toEqual([
      'same: Цены',
      'old: Кофе стоит [200]',
      'new: Кофе стоит [250]',
      'same: Адрес',
    ]);
  });

  it('удалённые и добавленные абзацы — целиком', () => {
    expect(diffLines(['А', 'Б'], ['Б', 'В']).map(plain)).toEqual([
      'old: [А]',
      'same: Б',
      'new: [В]',
    ]);
  });

  it('длинные общие куски сворачиваются вокруг правок', () => {
    const before = Array.from({ length: 10 }, (_, i) => `Абзац ${i}`);
    const after = before.map((_, i) => (i === 5 ? 'Новый' : _));
    expect(compact(diffLines(before, after)).map(plain)).toEqual([
      '… 4',
      'same: Абзац 4',
      'old: [Абзац 5]',
      'new: [Новый]',
      'same: Абзац 6',
      '… 3',
    ]);
  });
});
