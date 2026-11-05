import { describe, expect, it } from 'bun:test';
import { sanitizeHtml } from './html-sanitizer.ts';

describe('HTML от редактора', () => {
  it('оставляет то, что пишет визуальный редактор, и вызовы компонентов', () => {
    const html =
      '<h2>Заголовок</h2><p>Текст <strong>жирно</strong>, <em>курсив</em> и <a href="[~5~]">ссылка</a>.</p>' +
      '<ul><li>раз</li></ul><blockquote><p>цитата</p></blockquote>' +
      '<p><img src="/media/a.jpg" alt="Фото" width="10" height="5"></p>[[Gallery folder="leto" columns=3]]' +
      '<table><tr><td colspan="2">ячейка</td></tr></table><!--noindex-->скрыто<!--/noindex-->';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('скрытые блоки остаются скрытыми: флаг hidden в тегах не трогается', () => {
    const html =
      '<p>Текст</p>\n[[Hero title="Акция" hidden]]\n<p>[#Form:callback hidden]</p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('вырезает скрипты, обработчики, фреймы, SVG и стили вместе с содержимым', () => {
    expect(
      sanitizeHtml(
        '<p onclick="a()" style="color:red">x</p><script>alert(1)</script><img src=x onerror=alert(1)>' +
          '<svg><script>1</script></svg><math><mi>x</mi></math><iframe src="//e"></iframe><style>p{}</style>' +
          '<object data="x"></object><template><img src=x onerror=1></template>'
      )
    ).toBe('<p>x</p><img src=x>');
  });

  it('ссылки и картинки — только http(s), mailto, tel и относительные адреса', () => {
    const links = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'jav&#x61;script:alert(1)',
      'jav&#97script:alert(1)',
      'javascript&colon;alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ];
    links.forEach(
      (href) =>
        void expect(sanitizeHtml(`<a href="${href}">x</a>`)).toBe('<a>x</a>')
    );
    [
      'https://example.com/?a=1&amp;b=2',
      '/kontakty',
      'kontakty',
      '#top',
      'mailto:a@b.c',
      'tel:+7000',
      '[~3~]',
    ].forEach(
      (href) =>
        void expect(sanitizeHtml(`<a href="${href}">x</a>`)).toBe(
          `<a href="${href}">x</a>`
        )
    );
    expect(
      sanitizeHtml('<img srcset="/a.jpg 1x, javascript:alert(1) 2x" alt="">')
    ).toBe('<img alt="">');
  });

  it('ссылка с target получает rel=noopener noreferrer; свой rel сохраняется', () => {
    expect(sanitizeHtml('<a href="/x" target="_blank">x</a>')).toBe(
      '<a href="/x" target="_blank" rel="noopener noreferrer">x</a>'
    );
    expect(
      sanitizeHtml('<a href="/x" target="_blank" rel="nofollow">x</a>')
    ).toBe(
      '<a href="/x" target="_blank" rel="nofollow noopener noreferrer">x</a>'
    );
    // Без target rel не навязывается; уже заданный noopener не дублируется.
    expect(sanitizeHtml('<a href="/x">x</a>')).toBe('<a href="/x">x</a>');
    expect(
      sanitizeHtml('<a href="/x" target="_blank" rel="noopener">x</a>')
    ).toBe('<a href="/x" target="_blank" rel="noopener noreferrer">x</a>');
  });

  it('убирает служебные метки CMS: регионы и острова', () => {
    expect(
      sanitizeHtml(
        '<!--cms:region:0--><cms-island data-module="//evil/x.js">остров</cms-island><div data-x="1">d</div>'
      )
    ).toBe('остров<div>d</div>');
  });

  it('неизвестные теги снимаются, текст остаётся', () => {
    expect(
      sanitizeHtml('<custom-tag>a</custom-tag><form><input>b</form>')
    ).toBe('ab');
  });
});
