import { describe, expect, it } from 'bun:test';
import { autop, convertContent } from '../src/wp-import/convert.ts';
import { plainText } from '../src/wp-import/emit.ts';
import { parseHtml, textOf } from '../src/wp-import/html.ts';
import {
  type ContentNotes,
  type ConvertContext,
  emptyNotes,
} from '../src/wp-import/notes.ts';
import { unserialize } from '../src/wp-import/php.ts';

// Сайт для конвертера: вложение 12 перенесено, 13 — нет; /about — страница 7, old.example — свой хост.
const ctx: ConvertContext = {
  mediaById: (id) =>
    id === 12
      ? 'uploads/2024/05/kitchen.jpg'
      : id === 14
        ? 'uploads/2024/05/b.jpg'
        : null,
  attachmentByUrl: (url) => (url.includes('kitchen') ? 12 : null),
  link: (href) =>
    href.includes('/about')
      ? { kind: 'page', id: 7, hash: href.includes('#') ? '#team' : '' }
      : href.includes('kitchen.jpg')
        ? {
            kind: 'file',
            href: '/media/uploads/2024/05/kitchen.jpg',
            image: true,
          }
        : href.startsWith('mailto:')
          ? { kind: 'url', href, internal: false }
          : href.startsWith('http')
            ? { kind: 'url', href, internal: href.includes('old.example') }
            : { kind: 'none' },
  reusable: (id) =>
    id === 99
      ? '<!-- wp:paragraph --><p>Повтор</p><!-- /wp:paragraph -->'
      : null,
  latestPosts: (n) => `[[RecentPosts parent=5 count=${n}]]`,
};

const convert = (content: string): { html: string; notes: ContentNotes } =>
  ((notes) => ({ html: convertContent(content, ctx, notes), notes }))(
    emptyNotes()
  );

// Только то, что разрешают правила текста страницы, и теги компонентов.
const _ALLOWED =
  /^<\/?(?:p|h2|h3|h4|ul|ol|li|blockquote|strong|em|a)(?:\s+href="[^"]*")?>$/;
const disallowed = (html: string): string[] =>
  [...html.matchAll(/<[^>]+>/g)]
    .map((_) => _[0])
    .filter((_) => !_ALLOWED.test(_));

describe('блоки Gutenberg', () => {
  const page = `<!-- wp:heading {"level":1} --><h1>Заголовок</h1><!-- /wp:heading -->
<!-- wp:paragraph --><p>Текст <b>жирно</b>, <i>курсив</i> и <a href="https://old.example/about/" target="_blank" rel="noopener">о нас</a>.<br>Вторая строка</p><!-- /wp:paragraph -->
<!-- wp:image {"id":12} --><figure class="wp-block-image size-large"><a href="https://old.example/wp-content/uploads/2024/05/kitchen.jpg"><img src="https://old.example/wp-content/uploads/2024/05/kitchen-1024x768.jpg" alt="Кухня &quot;Лофт&quot;" class="wp-image-12"/></a><figcaption>Наша кухня</figcaption></figure><!-- /wp:image -->
<!-- wp:gallery {"columns":2} --><figure class="wp-block-gallery has-nested-images columns-2"><!-- wp:image {"id":12} --><figure class="wp-block-image"><img src="a.jpg" class="wp-image-12"/></figure><!-- /wp:image --><!-- wp:image {"id":14} --><figure class="wp-block-image"><img src="b.jpg" class="wp-image-14"/></figure><!-- /wp:image --><figcaption class="blocks-gallery-caption">Две</figcaption></figure><!-- /wp:gallery -->
<!-- wp:embed {"url":"https://youtu.be/dQw4w9WgXcQ","providerNameSlug":"youtube"} --><figure class="wp-block-embed"><div class="wp-block-embed__wrapper">https://youtu.be/dQw4w9WgXcQ</div></figure><!-- /wp:embed -->
<!-- wp:embed {"url":"https://twitter.com/x/status/1","providerNameSlug":"twitter"} --><figure class="wp-block-embed"><div class="wp-block-embed__wrapper">https://twitter.com/x/status/1</div></figure><!-- /wp:embed -->
<!-- wp:list --><ul><li>Один</li><li>Два<ul><li>Вложенный</li></ul></li></ul><!-- /wp:list -->
<!-- wp:latest-posts {"postsToShow":3} /-->
<!-- wp:search /-->
<!-- wp:block {"ref":99} /-->
<!-- wp:kadence/rowlayout --><div class="kb-row"><p>Текст плагина</p></div><!-- /wp:kadence/rowlayout -->
<!-- wp:heading {"level":5} --><h5>Глубоко</h5><!-- /wp:heading -->`;

  it('только разрешённые теги: h1 становится h2, h5 — h4, <br> делит абзац, ссылка — [~id~]', () => {
    const { html, notes } = convert(page);
    expect(disallowed(html.replace(/\[\[[^\]]*\]\]/g, ''))).toEqual([]);
    expect(html).toContain('<h2>Заголовок</h2>');
    expect(html).toContain('<h4>Глубоко</h4>');
    expect(html).not.toContain('<h1');
    expect(html).toContain(
      '<p>Текст <strong>жирно</strong>, <em>курсив</em> и <a href="[~7~]">о нас</a>.</p>\n<p>Вторая строка</p>'
    );
    expect(notes).toMatchObject({ shifted: true, links: 1 });
  });

  it('картинка, галерея и видео — теги Figure, Gallery и Video; ссылка картинки на свой файл не нужна', () => {
    const { html, notes } = convert(page);
    expect(html).toContain(
      '[[Figure src="uploads/2024/05/kitchen.jpg" alt="Кухня ”Лофт”" caption="Наша кухня"]]'
    );
    expect(html).toContain(
      '[[Gallery images="uploads/2024/05/kitchen.jpg,uploads/2024/05/b.jpg" columns=2 caption="Две"]]'
    );
    expect(html).toContain('[[Video url="https://youtu.be/dQw4w9WgXcQ"]]');
    expect(html).not.toContain('<img');
    expect(notes).toMatchObject({ figures: 1, galleries: 1, videos: 1 });
  });

  it('другое встраивание — ссылка; лента новых записей, повторный блок; динамический и чужой блок — в отчёт', () => {
    const { html, notes } = convert(page);
    expect(html).toContain(
      '<p><a href="https://twitter.com/x/status/1">https://twitter.com/x/status/1</a></p>'
    );
    expect(notes.embeds).toEqual([
      'core/embed: https://twitter.com/x/status/1',
    ]);
    expect(html).toContain('[[RecentPosts parent=5 count=3]]');
    expect(html).toContain('<p>Повтор</p>');
    expect(html).toContain('<p>Текст плагина</p>');
    expect(notes.blocks).toEqual({ 'core/search': 1, 'kadence/rowlayout': 1 });
    expect(html).toContain(
      '<ul>\n<li>Один</li>\n<li>Два<ul>\n<li>Вложенный</li>\n</ul></li>\n</ul>'
    );
  });
});

describe('классический редактор и шорткоды', () => {
  const classic = `Первый абзац [caption id="attachment_12" align="alignleft" width="300"]<a href="https://old.example/?attachment_id=12"><img class="size-medium wp-image-12" src="https://old.example/wp-content/uploads/2024/05/kitchen-300x200.jpg" alt="К" /></a> Подпись[/caption]
и строка.

Второй [Примечание] абзац и [[gallery]] как текст

[gallery ids=&#8221;12,14&#8243; columns="2"]

[contact-form-7 id="5" title="Контакты"]

[vc_row][vc_column][vc_column_text]Текст конструктора[/vc_column_text][/vc_column][/vc_row]

[unknown_widget foo="bar"]Внутри[/unknown_widget]

https://vimeo.com/123456

<table><tr><th>Модель</th><th>Цена</th></tr><tr><td>Classic</td><td>9000 €</td></tr></table>
<pre>line 1
line 2</pre>
<p>&nbsp;</p>
<img src="https://cdn.other/x.png">
<a href="#top">наверх</a> <a href="javascript:alert(1)">клик</a> <a href="mailto:a@b.c">почта</a>`;

  it('абзацы по пустым строкам, [caption] — Figure с подписью, [gallery] с типографскими кавычками', () => {
    const { html } = convert(classic);
    expect(html).toContain('<p>Первый абзац</p>');
    expect(html).toContain(
      '[[Figure src="uploads/2024/05/kitchen.jpg" alt="К" caption="Подпись" size="small"]]'
    );
    expect(html).toContain('<p>и строка.</p>');
    expect(html).toContain(
      '[[Gallery images="uploads/2024/05/kitchen.jpg,uploads/2024/05/b.jpg" columns=2]]'
    );
    expect(html).toContain('[[Video url="https://vimeo.com/123456"]]');
  });

  it('[Примечание] и [[gallery]] — текст; формы, конструкторы и чужие шорткоды — в отчёт, текст внутри остаётся', () => {
    const { html, notes } = convert(classic);
    expect(html).toContain(
      '<p>Второй [Примечание] абзац и [gallery] как текст</p>'
    );
    expect(html).toContain('<p>Текст конструктора</p>');
    expect(html).toContain('Внутри');
    expect(notes.forms).toEqual(['contact-form-7']);
    expect(notes.builders).toEqual(['WPBakery']);
    expect(notes.shortcodes).toEqual({ unknown_widget: 1 });
  });

  it('таблица и код — абзацами; распорки, чужие картинки, якоря и javascript: — убраны', () => {
    const { html, notes } = convert(classic);
    expect(html).toContain(
      '<p><strong>Модель – Цена</strong></p>\n<p>Classic – 9000 €</p>'
    );
    expect(html).toContain('<p>line 1</p>\n<p>line 2</p>');
    expect(html).toContain(
      '<p>наверх клик <a href="mailto:a@b.c">почта</a></p>'
    );
    expect(html).not.toContain('&nbsp;');
    expect(notes.images).toEqual(['https://cdn.other/x.png']);
    expect(notes).toMatchObject({ tables: 1, code: 1 });
    expect(disallowed(html.replace(/\[\[[^\]]*\]\]/g, ''))).toEqual([]);
  });

  it('autop: блочные теги отдельно, перевод строки — <br>', () => {
    expect(autop('a\nb\n\n<h2>X</h2>\nc')).toBe(
      '<p>a<br>b</p>\n<h2>X</h2>\n<p>c</p>'
    );
  });
});

describe('текст WordPress не становится кодом', () => {
  it('заглушка тега из текста не выводит HTML как есть', () => {
    const { html } = convert(
      '<p>a</p><x-eile data-tag="%3Cscript%3Ealert(1)%3C%2Fscript%3E"></x-eile><script>alert(2)</script><p onclick="x()">b</p>'
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(disallowed(html)).toEqual([]);
  });
});

describe('разбор HTML', () => {
  it('терпит ошибки, как браузер: абзац закрывается перед блоком, пункт — перед пунктом, скрипт — целиком', () => {
    expect(
      textOf(
        parseHtml(
          '<p>a<div>b</div><ul><li>c<li>d</ul><script>alert(1)</script></b>e'
        )
      )
    ).toBe('a b c d e');
    expect(plainText('<p>Анонс &amp; текст</p>[[Figure src="x.jpg"]]')).toBe(
      'Анонс & текст'
    );
  });
});

describe('serialize() PHP', () => {
  it('длина строк — в байтах UTF-8, массивы и объекты — словари, не PHP — null', () => {
    expect(
      unserialize(
        'a:2:{s:4:"file";s:16:"2024/05/küc.jpg";s:5:"sizes";a:1:{s:6:"medium";a:1:{s:4:"file";s:9:"k-300.jpg";}}}'
      )
    ).toEqual({
      file: '2024/05/küc.jpg',
      sizes: { medium: { file: 'k-300.jpg' } },
    });
    expect(unserialize('O:8:"stdClass":1:{s:1:"a";b:1;}')).toEqual({ a: true });
    expect(unserialize('a:1:{i:0;s:7:"noindex";}')).toEqual({ 0: 'noindex' });
    expect(unserialize('hello')).toBeNull();
    expect(unserialize('a:1:{s:3:"bad";')).toBeNull();
  });
});
