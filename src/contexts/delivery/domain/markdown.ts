// HTML страницы → Markdown для ИИ: /path.md и llms-full.txt.
// Разбор нестрогий: нужен текст и структура, а не точная копия разметки.

type Node =
  | { readonly text: string }
  | {
      readonly tag: string;
      readonly attrs: Readonly<Record<string, string>>;
      readonly children: Node[];
    };

type Element = Extract<Node, { tag: string }>;

const _VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

// Что не текст страницы: служебное, навигация, формы.
const _SKIP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'head',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'select',
  'textarea',
]);

// Линейный разбор: незакрытый комментарий тянется до конца текста одним совпадением, а внутри тега и
// кавычек не бывает `<` и `>` — `<a<a<a…` и `<!--<!--…` не заставят движок пересматривать хвост.
const _TOKEN =
  /<!--(?:[^-]|-(?!->))*(?:-->|$)|<\/?([a-zA-Z][\w-]*)((?:[^<>"']|"[^"<>]*"|'[^'<>]*')*)>|[^<]+|</g;
const _ATTR = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

const _ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  hellip: '…',
};

// Код за пределами Unicode — как есть: fromCodePoint бросил бы и уронил ответ.
const _codePoint = (code: number, match: string): string =>
  code <= 0x10ffff ? String.fromCodePoint(code) : match;

export var decodeEntities = (text: string): string =>
  text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, code: string) =>
    code.startsWith('#x') || code.startsWith('#X')
      ? _codePoint(Number.parseInt(code.slice(2), 16), match)
      : code.startsWith('#')
        ? _codePoint(Number(code.slice(1)), match)
        : (_ENTITIES[code.toLowerCase()] ?? match)
  );

const _attrs = (raw: string): Record<string, string> =>
  Object.fromEntries(
    [...raw.matchAll(_ATTR)].map(({ 1: name, 2: a, 3: b, 4: c }) => [
      name!.toLowerCase(),
      decodeEntities(a ?? b ?? c ?? ''),
    ])
  );

type Parse = { readonly root: Element; readonly stack: Element[] };

const _BREAKS_P = new Set([
  'p',
  'div',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'table',
  'section',
  'article',
  'figure',
  'hr',
]);

// Как в HTML: новый блок закрывает открытый <p>, новый <li> — предыдущий пункт.
const _implicit = (state: Parse, tag: string): Parse =>
  ((top) =>
    (top === 'p' && _BREAKS_P.has(tag)) || (top === 'li' && tag === 'li')
      ? { ...state, stack: state.stack.slice(0, -1) }
      : state)(state.stack.at(-1)!.tag);

// Глубже — теги не открываются, их текст остаётся в родителе: стек и рекурсия рендера ограничены.
const _MAX_DEPTH = 200;

const _open = (
  current: Parse,
  tag: string,
  raw: string,
  token: string
): Parse =>
  current.stack.length >= _MAX_DEPTH
    ? current
    : _opened(current, tag, raw, token);

const _opened = (
  current: Parse,
  tag: string,
  raw: string,
  token: string
): Parse => {
  const state = _implicit(current, tag);
  const element: Element = { tag, attrs: _attrs(raw), children: [] };
  state.stack.at(-1)!.children.push(element);
  return _VOID.has(tag) || token.endsWith('/>')
    ? state
    : { ...state, stack: [...state.stack, element] };
};

// Закрывающий тег снимает со стека всё до своего открывающего; лишний — пропускается.
const _close = (state: Parse, tag: string): Parse =>
  ((at) => (at > 0 ? { ...state, stack: state.stack.slice(0, at) } : state))(
    state.stack.findLastIndex((_) => _.tag === tag)
  );

const _text = (state: Parse, text: string): Parse => (
  state.stack.at(-1)!.children.push({ text: decodeEntities(text) }), state
);

/** Дерево из HTML: незакрытые теги закрываются родителем, лишние закрывающие игнорируются. */
export var parseHtml = (html: string): Element =>
  [...html.matchAll(_TOKEN)].reduce<Parse>(
    (state, { 0: token, 1: name, 2: raw }) =>
      token.startsWith('<!--')
        ? state
        : name === undefined
          ? _text(state, token)
          : token.startsWith('</')
            ? _close(state, name.toLowerCase())
            : _open(state, name.toLowerCase(), raw ?? '', token),
    ((root) => ({ root, stack: [root] }))({
      tag: '#root',
      attrs: {},
      children: [],
    })
  ).root;

const _find = (node: Element, tag: string): Element | null =>
  node.tag === tag
    ? node
    : node.children.reduce<Element | null>(
        (found, child) => found ?? ('tag' in child ? _find(child, tag) : null),
        null
      );

/** Основное содержимое страницы: <main>, иначе <article>, иначе <body>. */
export var mainOf = (root: Element): Element =>
  _find(root, 'main') ?? _find(root, 'article') ?? _find(root, 'body') ?? root;

type Context = { readonly absolute: (url: string) => string };

const _space = (text: string): string => text.replace(/\s+/g, ' ');

const _inline = (nodes: readonly Node[], context: Context): string =>
  nodes.map((_) => _inlineNode(_, context)).join('');

const _INLINE: Readonly<
  Record<string, (node: Element, context: Context) => string>
> = {
  strong: (node, c) => _wrap('**', _inline(node.children, c)),
  b: (node, c) => _wrap('**', _inline(node.children, c)),
  em: (node, c) => _wrap('*', _inline(node.children, c)),
  i: (node, c) => _wrap('*', _inline(node.children, c)),
  code: (node) => `\`${_plain(node)}\``,
  br: () => '  \n',
  a: (node, c) =>
    ((text, href) =>
      href && !href.startsWith('#') ? `[${text}](${c.absolute(href)})` : text)(
      _inline(node.children, c).trim(),
      node.attrs.href ?? ''
    ),
  img: (node, c) =>
    node.attrs.src
      ? `![${node.attrs.alt ?? ''}](${c.absolute(node.attrs.src)})`
      : '',
};

const _wrap = (mark: string, text: string): string =>
  text.trim() === '' ? text : `${mark}${text.trim()}${mark}`;

const _plain = (node: Node): string =>
  'text' in node ? node.text : node.children.map(_plain).join('');

const _inlineNode = (node: Node, context: Context): string =>
  'text' in node
    ? _space(node.text)
    : _SKIP.has(node.tag)
      ? ''
      : (_INLINE[node.tag]?.(node, context) ?? _inline(node.children, context));

const _BLOCK = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'hr',
  'table',
  'div',
  'section',
  'article',
  'main',
  'figure',
  'figcaption',
  'dl',
  'li',
  'body',
  '#root',
]);

const _isBlock = (node: Node): boolean => 'tag' in node && _BLOCK.has(node.tag);

const _list = (node: Element, context: Context, depth: number): string =>
  node.children
    .filter((_): _ is Element => 'tag' in _ && _.tag === 'li')
    .map((item, index) => {
      const marker = node.tag === 'ol' ? `${index + 1}.` : '-';
      const pad = '  '.repeat(depth);
      const own = _inline(
        item.children.filter(
          (_) => !('tag' in _ && (_.tag === 'ul' || _.tag === 'ol'))
        ),
        context
      ).trim();
      const nested = item.children
        .filter(
          (_): _ is Element => 'tag' in _ && (_.tag === 'ul' || _.tag === 'ol')
        )
        .map((_) => _list(_, context, depth + 1))
        .join('\n');
      return `${pad}${marker} ${own}${nested ? `\n${nested}` : ''}`;
    })
    .join('\n');

const _cells = (row: Element, context: Context): string[] =>
  row.children
    .filter(
      (_): _ is Element => 'tag' in _ && (_.tag === 'td' || _.tag === 'th')
    )
    .map((_) => _inline(_.children, context).trim().replaceAll('|', '\\|'));

const _rows = (node: Element): Element[] =>
  node.children.flatMap((_) =>
    'tag' in _ ? (_.tag === 'tr' ? [_] : _rows(_)) : []
  );

const _table = (node: Element, context: Context): string => {
  const rows = _rows(node).map((_) => _cells(_, context));
  const width = Math.max(0, ...rows.map((_) => _.length));
  const line = (cells: string[]) =>
    `| ${[...cells, ...Array(width - cells.length).fill('')].join(' | ')} |`;
  return rows.length === 0
    ? ''
    : [
        line(rows[0]!),
        line(Array(width).fill('---')),
        ...rows.slice(1).map(line),
      ].join('\n');
};

const _BLOCKS: Readonly<
  Record<string, (node: Element, context: Context) => string>
> = {
  h1: (n, c) => `# ${_inline(n.children, c).trim()}`,
  h2: (n, c) => `## ${_inline(n.children, c).trim()}`,
  h3: (n, c) => `### ${_inline(n.children, c).trim()}`,
  h4: (n, c) => `#### ${_inline(n.children, c).trim()}`,
  h5: (n, c) => `##### ${_inline(n.children, c).trim()}`,
  h6: (n, c) => `###### ${_inline(n.children, c).trim()}`,
  p: (n, c) => _inline(n.children, c).trim(),
  ul: (n, c) => _list(n, c, 0),
  ol: (n, c) => _list(n, c, 0),
  hr: () => '---',
  pre: (n) => `\`\`\`\n${_plain(n).replace(/\n$/, '')}\n\`\`\``,
  blockquote: (n, c) =>
    _blocks(n.children, c)
      .split('\n')
      .map((_) => (_ ? `> ${_}` : '>'))
      .join('\n'),
  table: _table,
};

const _standalone = (node: Node): node is Element =>
  _isBlock(node) || ('tag' in node && _SKIP.has(node.tag));

// Соседние строчные узлы — один абзац, блочные — каждый свой. Границы — по блочным узлам, за один проход:
// тысячи соседей не копируются на каждом шаге.
const _groups = (nodes: readonly Node[]): (readonly Node[])[] =>
  ((cuts) =>
    cuts
      .slice(1)
      .flatMap((cut, k) =>
        cut < nodes.length
          ? [nodes.slice(cuts[k]! + 1, cut), [nodes[cut]!]]
          : [nodes.slice(cuts[k]! + 1, cut)]
      ))([
    -1,
    ...nodes.flatMap((node, index) => (_standalone(node) ? [index] : [])),
    nodes.length,
  ]);

const _blocks = (nodes: readonly Node[], context: Context): string =>
  _groups(nodes)
    .map((group) =>
      group.length === 1 && _standalone(group[0]!)
        ? _block(group[0], context)
        : _inline(group, context).trim()
    )
    .filter(Boolean)
    .join('\n\n');

const _block = (node: Element, context: Context): string =>
  _SKIP.has(node.tag)
    ? ''
    : (_BLOCKS[node.tag]?.(node, context) ?? _blocks(node.children, context));

/** Markdown из HTML: заголовки, абзацы, списки, ссылки (абсолютными), картинки, цитаты, код, таблицы. */
export var htmlToMarkdown = (
  html: string,
  absolute: (url: string) => string = (_) => _
): string =>
  _block(mainOf(parseHtml(html)), { absolute })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
