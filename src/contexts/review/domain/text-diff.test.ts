import { describe, expect, it } from 'bun:test';
import { codeLines, type DiffLine, htmlLines, textDiff } from './text-diff.ts';

const plain = (line: DiffLine) =>
  line.kind === 'skip'
    ? `… ${line.count}`
    : `${line.kind}: ${line.pieces.map((_) => (_.changed ? `[${_.text}]` : _.text)).join('')}`;

describe('сравнение правок', () => {
  it('HTML текста — строками по блокам и тегам компонентов, разметка видна', () => {
    expect(
      htmlLines(
        '<h2>Цены</h2><p>Кофе</p>[[Callout title="x"]]<ul><li>Чай</li></ul>'
      )
    ).toEqual([
      '<h2>Цены</h2>',
      '<p>Кофе</p>',
      '[[Callout title="x"]]',
      '<ul>',
      '<li>Чай</li></ul>',
    ]);
  });

  it('изменённая строка — пара с отмеченной фразой; новый тег компонента виден целиком', () => {
    expect(
      textDiff(
        '<p>Кофе стоит 200 рублей</p>',
        '<p>Кофе стоит 250 рублей</p>[[Promo]]',
        true
      ).map(plain)
    ).toEqual([
      'old: <p>Кофе стоит [200] рублей</p>',
      'new: <p>Кофе стоит [250] рублей</p>',
      'new: [[[Promo]]]',
    ]);
  });

  it('код: общие начало и конец сворачиваются вокруг правки', () => {
    const before = Array.from({ length: 20 }, (_, n) => `line ${n}`);
    const after = before.map((_, n) => (n === 10 ? 'changed line' : _));
    expect(textDiff(before.join('\n'), after.join('\n')).map(plain)).toEqual([
      '… 8',
      'same: line 8',
      'same: line 9',
      'old: [line 10]',
      'new: [changed line]',
      'same: line 11',
      'same: line 12',
      '… 7',
    ]);
  });

  it('пустое → текст: все строки новые; CRLF не мешает', () => {
    expect(codeLines('a\r\nb')).toEqual(['a', 'b']);
    expect(textDiff('', 'a\nb').map(plain)).toEqual(['new: [a]', 'new: [b]']);
    expect(textDiff('same', 'same')).toEqual([{ kind: 'skip', count: 1 }]);
  });

  it('длинный исходник с правкой в середине — быстро', () => {
    const before = Array.from(
      { length: 20_000 },
      (_, n) => `const a${n} = ${n};`
    );
    const after = [
      ...before.slice(0, 9000),
      'inserted();',
      ...before.slice(9000),
    ];
    const started = performance.now();
    const lines = textDiff(before.join('\n'), after.join('\n'));
    // Здесь 0,25–0,35 с, на раннере CI — около 0,6 с; квадратичное сравнение 20 000 строк шло бы секунды.
    expect(performance.now() - started).toBeLessThan(3000);
    expect(lines.filter((_) => _.kind === 'new').map(plain)).toEqual([
      'new: [inserted();]',
    ]);
  });
});
