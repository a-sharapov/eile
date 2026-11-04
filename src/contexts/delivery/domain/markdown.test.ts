import { describe, expect, it } from 'bun:test';
import { decodeEntities, htmlToMarkdown } from './markdown.ts';

describe('HTML → Markdown', () => {
  it('берёт <main>, выбрасывает навигацию и скрипты, ссылки делает абсолютными', () => {
    const html = `<!doctype html><html><head><title>x</title></head><body>
      <header><a href="/">Сайт</a></header><nav><a href="/a">A</a></nav>
      <main><h1>О проекте</h1><p>Текст с <strong>жирным</strong> и <a href="/kontakty">ссылкой</a>.</p>
      <script>alert(1)</script>
      <ul><li>Раз</li><li>Два<ul><li>Вложенный</li></ul></li></ul>
      <ol><li>Первый</li></ol>
      <blockquote><p>Цитата</p></blockquote>
      <p><img src="/media/a.jpg" alt="Схема"> &laquo;ёлки&raquo; &amp; палки</p>
      <table><tr><th>Имя</th><th>Цена</th></tr><tr><td>Чай</td><td>100</td></tr></table>
      <pre><code>let a = 1;</code></pre></main><footer>©</footer></body></html>`;
    expect(htmlToMarkdown(html, (_) => `https://site.ru${_}`)).toBe(
      [
        '# О проекте',
        'Текст с **жирным** и [ссылкой](https://site.ru/kontakty).',
        '- Раз\n- Два\n  - Вложенный',
        '1. Первый',
        '> Цитата',
        '![Схема](https://site.ru/media/a.jpg) «ёлки» & палки',
        '| Имя | Цена |\n| --- | --- |\n| Чай | 100 |',
        '```\nlet a = 1;\n```',
      ].join('\n\n')
    );
  });

  it('сноска на источник — [n] у слова, а не число, слипшееся с ним', () => {
    expect(
      htmlToMarkdown(
        '<p>с версии 6.6<sup><a href="#source-5" aria-label="Источник 5">5</a></sup>. Степень x<sup>2</sup></p>'
      )
    ).toBe('с версии 6.6[5]. Степень x2');
  });

  it('таблица на ролях ARIA — таблица Markdown, оформление aria-hidden пропускается', () => {
    const html = `<div role="table" aria-label="Сравнение">
      <div role="row"><span role="columnheader">Тема</span><span role="columnheader">Eile</span></div>
      <div role="rowgroup"><div role="row">
        <div role="rowheader"><h3>Сервер</h3></div>
        <div role="cell"><span aria-hidden="true">Eile</span><p>Один файл | база</p></div>
      </div></div></div>`;
    expect(htmlToMarkdown(html)).toBe(
      '| Тема | Eile |\n| --- | --- |\n| Сервер | Один файл \\| база |'
    );
  });

  it('врезка role="note" — цитата, окно в aria-hidden — не текст', () => {
    expect(
      htmlToMarkdown(
        '<div class="callout tip" role="note"><p>Совет</p><p>Держите копию.</p></div><div aria-hidden="true">Eile — Менеджер</div><p>Дальше</p>'
      )
    ).toBe('> Совет\n>\n> Держите копию.\n\nДальше');
  });

  it('незакрытые теги и голый текст не ломают разбор', () => {
    expect(htmlToMarkdown('Просто текст<p>абзац<p>ещё')).toBe(
      'Просто текст\n\nабзац\n\nещё'
    );
  });
});

describe('разбор HTML линейный', () => {
  it('незакрытые комментарии и теги не тормозят', () => {
    ['<!--', '<a', '<a "', "<a '", '<!-', '<p>', '<b>x', '<li>'].forEach(
      (piece) => {
        const started = performance.now();
        htmlToMarkdown(`<p>x</p>${piece.repeat(20000)}`, (_) => _);
        expect(performance.now() - started).toBeLessThan(200);
      }
    );
  });

  it('комментарии и теги разбираются как раньше', () => {
    expect(
      htmlToMarkdown(
        '<p>a<!-- c --->b <a href="/x" title="t">link</a></p><!-- open',
        (_) => _
      )
    ).toBe('ab [link](/x)');
    expect(decodeEntities('&#99999999; &#x41; &amp;')).toBe('&#99999999; A &');
  });
});
