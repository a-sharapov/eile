import {
  BLOCK_TAGS,
  classesOf,
  decodeEntities,
  findAll,
  type HtmlElement,
  type HtmlNode,
  parseHtml,
  textOf,
} from './html.ts';
import {
  type ContentNotes,
  type ConvertContext,
  tag,
  tagValue,
  video,
} from './notes.ts';

/** Строчный кусок текста и то, что из него вынесено отдельными блоками (картинки, видео). */
type Inline = { readonly html: string; readonly hoisted: readonly string[] };

const _NONE: Inline = { html: '', hoisted: [] };

const _join = (a: Inline, b: Inline): Inline => ({
  html: a.html + b.html,
  hoisted: [...a.hoisted, ...b.hoisted],
});

// Абзац из одних пробелов и &nbsp; — распорка из редактора, а не текст.
const _meaningful = (html: string): boolean =>
  decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/[\s\u00a0\u200b]+/g, '')
    .trim() !== '';

const _GALLERY =
  /^(?:wp-block-gallery|gallery|tiled-gallery|blocks-gallery-grid|wp-block-jetpack-tiled-gallery)$/;

const _SMALL = /^(?:size-thumbnail|size-medium|alignleft|alignright)$/;
const _WIDE = /^(?:alignwide|alignfull)$/;

const _columns = (element: HtmlElement): number | null =>
  ((found) => (found ? Math.min(4, Number(found[1])) : null))(
    /(?:^|\s)(?:gallery-)?columns-(\d)(?:\s|$)/.exec(element.attrs.class ?? '')
  );

/** Текст после блоков и шорткодов → текст страницы Eile: разрешённые теги, картинки — тегами. */
export var emitText = (
  html: string,
  ctx: ConvertContext,
  notes: ContentNotes
): string => {
  const tree = parseHtml(html);
  // h1 печатает шаблон: если он есть в тексте, все заголовки опускаются на уровень.
  const shift = findAll(tree, ['h1']).length > 0 ? 1 : 0;
  notes.shifted = notes.shifted || shift > 0;

  const target = (raw: string): string | null =>
    ((href) =>
      href.kind === 'page'
        ? (notes.links++, `[~${href.id}~]${href.hash}`)
        : href.kind === 'file'
          ? href.href
          : href.kind === 'url'
            ? (void (href.internal && notes.unresolved.push(href.href)),
              href.href)
            : null)(ctx.link(decodeEntities(raw)));

  const pathOf = (img: HtmlElement): string | null =>
    ((id) =>
      (id > 0 ? ctx.mediaById(id) : null) ??
      ((found) => (found === null ? null : ctx.mediaById(found)))(
        ctx.attachmentByUrl(decodeEntities(img.attrs.src ?? ''))
      ))(
      Number(
        /(?:^|\s)wp-image-(\d+)/.exec(img.attrs.class ?? '')?.[1] ??
          img.attrs['data-id'] ??
          img.attrs['data-attachment-id'] ??
          0
      )
    );

  // Ссылка у картинки: на страницу — её id, на внешний адрес — он сам; на себя и на страницу вложения — нет.
  const pictureHref = (raw: string | undefined): string | number | null =>
    raw === undefined
      ? null
      : ((href) =>
          href.kind === 'page'
            ? href.id
            : href.kind === 'file'
              ? href.image
                ? null
                : href.href
              : href.kind === 'url' && !href.internal
                ? href.href
                : null)(ctx.link(decodeEntities(raw)));

  const figure = (
    img: HtmlElement,
    caption: string,
    href: string | undefined,
    classes: readonly string[]
  ): string =>
    ((path) =>
      path === null
        ? (notes.images.push(
            decodeEntities(img.attrs.src ?? '') ||
              `#${/wp-image-(\d+)/.exec(img.attrs.class ?? '')?.[1] ?? '?'}`
          ),
          '')
        : (notes.figures++,
          tag('Figure', [
            ['src', path],
            ['alt', tagValue(img.attrs.alt ?? '')],
            ['caption', tagValue(caption)],
            [
              'href',
              ((value) =>
                typeof value === 'string'
                  ? value.replaceAll('"', '%22')
                  : value)(pictureHref(href)),
            ],
            [
              'size',
              classes.some((_) => _SMALL.test(_))
                ? 'small'
                : classes.some((_) => _WIDE.test(_))
                  ? 'wide'
                  : null,
            ],
          ])))(pathOf(img));

  const gallery = (element: HtmlElement): string[] =>
    ((images) =>
      ((paths) =>
        paths.length < 2
          ? images.flatMap((_) => figure(_, '', undefined, []) || [])
          : (notes.galleries++,
            [
              tag('Gallery', [
                ['images', paths.join(',')],
                ['columns', _columns(element)],
                [
                  'caption',
                  tagValue(
                    textOf(
                      findAll(element.children, ['figcaption']).filter((_) =>
                        classesOf(_).includes('blocks-gallery-caption')
                      )
                    )
                  ),
                ],
              ]),
            ]))([
        ...new Set(images.map(pathOf).filter((_): _ is string => _ !== null)),
      ]))(
      ((images) => (
        images
          .filter((_) => pathOf(_) === null && _.attrs.src)
          .forEach((_) => void notes.images.push(decodeEntities(_.attrs.src!))),
        images
      ))(findAll(element.children, ['img']))
    );

  const frame = (element: HtmlElement): string[] =>
    ((src) =>
      src ? [video(src, element.attrs.title ?? '', notes, element.tag)] : [])(
      decodeEntities(
        element.attrs.src ??
          findAll(element.children, ['source'])[0]?.attrs.src ??
          ''
      )
    );

  // --- строчное -------------------------------------------------------------------------------

  const inline = (nodes: readonly HtmlNode[]): Inline =>
    nodes.reduce<Inline>((acc, node) => _join(acc, inlineNode(node)), _NONE);

  const wrap =
    (name: string) =>
    (element: HtmlElement): Inline =>
      ((inner) =>
        _meaningful(inner.html)
          ? { ...inner, html: `<${name}>${inner.html}</${name}>` }
          : inner)(inline(element.children));

  const INLINE: Readonly<Record<string, (element: HtmlElement) => Inline>> = {
    strong: wrap('strong'),
    b: wrap('strong'),
    em: wrap('em'),
    i: wrap('em'),
    cite: wrap('em'),
    dfn: wrap('em'),
    a: (element) =>
      ((inner, href) =>
        href && _meaningful(inner.html)
          ? {
              ...inner,
              html: `<a href="${Bun.escapeHTML(href)}">${inner.html}</a>`,
            }
          : inner)(
        inline(element.children),
        element.attrs.href === undefined ? null : target(element.attrs.href)
      ),
    br: () => ({ html: ' ', hoisted: [] }),
    img: (element) => ({
      html: '',
      hoisted: [figure(element, '', undefined, [])],
    }),
    'x-eile': (element) => ({
      html: '',
      hoisted: [decodeURIComponent(element.attrs['data-tag'] ?? '')],
    }),
    iframe: (element) => ({ html: '', hoisted: frame(element) }),
    video: (element) => ({ html: '', hoisted: frame(element) }),
    audio: (element) => ({ html: '', hoisted: frame(element) }),
  };

  const inlineNode = (node: HtmlNode): Inline =>
    typeof node === 'string'
      ? { html: node.replace(/\s+/g, ' '), hoisted: [] }
      : (INLINE[node.tag]?.(node) ??
        ((inner) =>
          BLOCK_TAGS.has(node.tag)
            ? { ...inner, html: ` ${inner.html} ` }
            : inner)(inline(node.children)));

  // --- абзацы ---------------------------------------------------------------------------------

  const flush = (nodes: readonly HtmlNode[]): string[] =>
    ((inner) => [
      ...(_meaningful(inner.html) ? [`<p>${inner.html.trim()}</p>`] : []),
      ...inner.hoisted,
    ])(inline(nodes));

  // Картинка сама по себе или в ссылке — отдельный блок Figure, абзац вокруг неё делится.
  const picture = (node: HtmlNode): string | null =>
    typeof node === 'string'
      ? null
      : node.tag === 'img'
        ? figure(node, '', undefined, classesOf(node))
        : node.tag === 'a' &&
            findAll(node.children, ['img']).length === 1 &&
            !_meaningful(inline(node.children).html)
          ? ((img) => figure(img, '', node.attrs.href, classesOf(img)))(
              findAll(node.children, ['img'])[0]!
            )
          : null;

  const paragraphs = (run: readonly HtmlNode[]): string[] =>
    ((done) => [...done.out, ...flush(done.current)])(
      run.reduce<{ current: HtmlNode[]; out: string[] }>(
        (acc, node) =>
          typeof node !== 'string' && node.tag === 'br'
            ? { current: [], out: [...acc.out, ...flush(acc.current)] }
            : ((image) =>
                image === null
                  ? { current: [...acc.current, node], out: acc.out }
                  : {
                      current: [],
                      out: [...acc.out, ...flush(acc.current), image],
                    })(picture(node)),
        { current: [], out: [] }
      )
    );

  // --- блоки ----------------------------------------------------------------------------------

  const heading = (element: HtmlElement): string[] =>
    ((level, inner) => [
      ...(_meaningful(inner.html)
        ? [`<h${level}>${inner.html.trim()}</h${level}>`]
        : []),
      ...inner.hoisted,
    ])(
      Math.min(4, Math.max(2, Number(element.tag[1]) + shift)),
      inline(element.children)
    );

  const item = (li: HtmlElement): Inline =>
    li.children.reduce<Inline>(
      (acc, node) =>
        typeof node !== 'string' && (node.tag === 'ul' || node.tag === 'ol')
          ? ((nested) => ({
              html: acc.html + nested.html,
              hoisted: [...acc.hoisted, ...nested.hoisted],
            }))(list(node))
          : _join(acc, inlineNode(node)),
      _NONE
    );

  const list = (element: HtmlElement): Inline =>
    ((items) =>
      ((name) => ({
        html:
          items.filter((_) => _meaningful(_.html)).length === 0
            ? ''
            : `<${name}>\n${items
                .filter((_) => _meaningful(_.html))
                .map((_) => `<li>${_.html.trim()}</li>`)
                .join('\n')}\n</${name}>`,
        hoisted: items.flatMap((_) => _.hoisted),
      }))(element.tag === 'ol' ? 'ol' : 'ul'))(
      element.children
        .filter((_): _ is HtmlElement => typeof _ !== 'string')
        .map((_) => (_.tag === 'li' ? item(_) : inline([_])))
    );

  const quote = (element: HtmlElement): string[] =>
    ((inside) =>
      ((kept, rest) => [
        ...(kept.length > 0
          ? [`<blockquote>${kept.join('')}</blockquote>`]
          : []),
        ...rest,
      ])(
        inside.filter((_) => /^<(?:p|ul|ol)>/.test(_)),
        inside.filter((_) => !/^<(?:p|ul|ol)>/.test(_))
      ))(blocks(element.children));

  const figureBlock = (element: HtmlElement): string[] =>
    classesOf(element).some((_) => _GALLERY.test(_))
      ? gallery(element)
      : ((images) =>
          images.length === 0
            ? blocks(element.children)
            : images.length > 1
              ? gallery(element)
              : [
                  figure(
                    images[0]!,
                    textOf(findAll(element.children, ['figcaption'])),
                    findAll(element.children, ['a']).find(
                      (_) => findAll(_.children, ['img']).length > 0
                    )?.attrs.href,
                    [...classesOf(element), ...classesOf(images[0]!)]
                  ),
                ].filter(Boolean))(findAll(element.children, ['img']));

  // Таблицу правила текста не разрешают: строка — абзац, ячейки через тире, заголовок строки — жирным.
  const table = (element: HtmlElement): string[] =>
    ((rows) => (
      void (rows.length > 0 && notes.tables++),
      [
        ...findAll(element.children, ['caption']).flatMap((_) =>
          flush(_.children)
        ),
        ...rows.flatMap((row) =>
          ((cells) =>
            ((text) =>
              text === ''
                ? cells.flatMap((_) => _.inner.hoisted)
                : [
                    cells.every((_) => _.head)
                      ? `<p><strong>${text}</strong></p>`
                      : `<p>${text}</p>`,
                    ...cells.flatMap((_) => _.inner.hoisted),
                  ])(
              cells
                .map((_) => _.inner.html.trim())
                .filter((_) => _meaningful(_))
                .join(' – ')
            ))(
            row.children
              .filter(
                (_): _ is HtmlElement =>
                  typeof _ !== 'string' && (_.tag === 'td' || _.tag === 'th')
              )
              .map((_) => ({ head: _.tag === 'th', inner: inline(_.children) }))
          )
        ),
      ]
    ))(findAll(element.children, ['tr']));

  const raw = (nodes: readonly HtmlNode[]): string =>
    nodes.map((_) => (typeof _ === 'string' ? _ : raw(_.children))).join('');

  // Код и предформатированный текст — строками-абзацами: моноширинного блока в правилах текста нет.
  const pre = (element: HtmlElement): string[] => (
    notes.code++,
    raw(element.children)
      .split('\n')
      .map((_) => _.trim())
      .filter(Boolean)
      .map((_) => `<p>${_}</p>`)
  );

  const definitions = (element: HtmlElement): string[] =>
    element.children
      .filter((_): _ is HtmlElement => typeof _ !== 'string')
      .flatMap((_) =>
        _.tag === 'dt'
          ? ((inner) =>
              _meaningful(inner.html)
                ? [
                    `<p><strong>${inner.html.trim()}</strong></p>`,
                    ...inner.hoisted,
                  ]
                : [...inner.hoisted])(inline(_.children))
          : paragraphs(_.children)
      );

  const BLOCK: Readonly<Record<string, (element: HtmlElement) => string[]>> = {
    p: (_) => paragraphs(_.children),
    h1: heading,
    h2: heading,
    h3: heading,
    h4: heading,
    h5: heading,
    h6: heading,
    ul: (_) => ((l) => [...(l.html ? [l.html] : []), ...l.hoisted])(list(_)),
    ol: (_) => ((l) => [...(l.html ? [l.html] : []), ...l.hoisted])(list(_)),
    menu: (_) => ((l) => [...(l.html ? [l.html] : []), ...l.hoisted])(list(_)),
    blockquote: quote,
    figure: figureBlock,
    table,
    pre,
    dl: definitions,
    hr: () => [],
    iframe: frame,
    video: frame,
    audio: frame,
    'x-eile': (_) => [decodeURIComponent(_.attrs['data-tag'] ?? '')],
    form: () => (notes.forms.push('<form>'), []),
    li: (_) => paragraphs(_.children),
    figcaption: (_) => paragraphs(_.children),
  };

  const blockOf = (element: HtmlElement): string[] =>
    BLOCK[element.tag]?.(element) ??
    (classesOf(element).some((_) => _GALLERY.test(_))
      ? gallery(element)
      : blocks(element.children));

  const blocks = (nodes: readonly HtmlNode[]): string[] =>
    nodes
      .reduce<(HtmlNode[] | HtmlElement)[]>(
        (groups, node) =>
          typeof node === 'string' || !BLOCK_TAGS.has(node.tag)
            ? Array.isArray(groups.at(-1))
              ? [
                  ...groups.slice(0, -1),
                  [...(groups.at(-1) as HtmlNode[]), node],
                ]
              : [...groups, [node]]
            : [...groups, node],
        []
      )
      .flatMap((_) => (Array.isArray(_) ? paragraphs(_) : blockOf(_)))
      .filter((_) => _ !== '');

  return blocks(tree).join('\n');
};

/** Простой текст из текста страницы: без разметки и тегов компонентов — для анонса. */
export var plainText = (text: string): string =>
  textOf(parseHtml(text.replace(/\[\[[^\]]*\]\]/g, ' ')));
