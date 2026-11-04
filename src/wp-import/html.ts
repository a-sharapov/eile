/** Узел дерева HTML: элемент или текст как есть, с сущностями. */
export type HtmlNode = HtmlElement | string;

export type HtmlElement = {
  readonly tag: string;
  /** Значения атрибутов как в исходнике: сущности не раскодированы. */
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: HtmlNode[];
};

const _VOID: ReadonlySet<string> = new Set(
  'area base br col embed hr img input link meta param source track wbr x-eile'.split(
    ' '
  )
);

// Содержимое этих элементов — не HTML страницы: код, стили, графика, плеер.
const _RAW: ReadonlySet<string> = new Set(
  'script style textarea title noscript template svg math object iframe'.split(
    ' '
  )
);

/** Блочные элементы: перед ними абзац закрывается, как в браузере. */
export var BLOCK_TAGS: ReadonlySet<string> = new Set(
  (
    'address article aside blockquote details dialog dd div dl dt fieldset figcaption figure footer form ' +
    'h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section table tbody thead tfoot tr td th ' +
    'caption ul menu summary center iframe video audio x-eile'
  ).split(' ')
);

// Пункт закрывает предыдущий такой же, пока между ними нет своего списка или таблицы.
const _IMPLIED: Readonly<Record<string, readonly string[]>> = {
  li: ['ul', 'ol', 'menu'],
  dt: ['dl'],
  dd: ['dl'],
  tr: ['table', 'tbody', 'thead', 'tfoot'],
  td: ['tr'],
  th: ['tr'],
  option: ['select'],
};

const _SIBLINGS: Readonly<Record<string, readonly string[]>> = {
  li: ['li'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  tr: ['tr'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  option: ['option'],
};

const _TAG =
  /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const _ATTR =
  /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const _attrs = (raw: string): Record<string, string> =>
  Object.fromEntries(
    [...raw.matchAll(_ATTR)].map(
      ({ 1: name, 2: double, 3: single, 4: bare }) => [
        name!.toLowerCase(),
        double ?? single ?? bare ?? '',
      ]
    )
  );

/**
 * Разбор HTML в дерево, терпимый к ошибкам, как браузер: абзац закрывается перед блоком, пункт — перед
 * следующим, лишние закрывающие теги пропускаются. Скрипты, стили и SVG — вместе с содержимым.
 */
export var parseHtml = (html: string): HtmlNode[] => {
  const root: HtmlElement = { tag: '#root', attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const top = (): HtmlElement => stack[stack.length - 1]!;
  const popTo = (index: number): void => void stack.splice(index);
  // Открытый элемент из `tags`, но не дальше ближайшего контейнера из `within`; -1 — такого нет.
  const indexOf = (tags: readonly string[], within: readonly string[]) =>
    ((index) => (index > 0 && tags.includes(stack[index]!.tag) ? index : -1))(
      stack.findLastIndex((_) => tags.includes(_.tag) || within.includes(_.tag))
    );
  let at = 0;
  let text = '';
  const pushText = (): void =>
    void (text !== '' && (top().children.push(text), (text = '')));
  // Автомат по символам: так проще всего не ошибиться в комментариях и тегах без закрытия.
  while (at < html.length) {
    const lt = html.indexOf('<', at);
    if (lt < 0) {
      text += html.slice(at);
      break;
    }
    text += html.slice(at, lt);
    at = lt;
    if (html.startsWith('<!--', at)) {
      const end = html.indexOf('-->', at + 4);
      at = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[at + 1] === '!' || html[at + 1] === '?') {
      const end = html.indexOf('>', at);
      at = end < 0 ? html.length : end + 1;
      continue;
    }
    _TAG.lastIndex = at;
    const match = _TAG.exec(html);
    if (!match) {
      text += '&lt;';
      at++;
      continue;
    }
    at = _TAG.lastIndex;
    pushText();
    const closing = match[1] === '/';
    const tag = match[2]!.toLowerCase();
    if (closing) {
      const index = stack.findLastIndex((_) => _.tag === tag);
      void (index > 0 && popTo(index));
      continue;
    }
    void (BLOCK_TAGS.has(tag) && top().tag === 'p' && popTo(stack.length - 1));
    void (tag === 'p' && top().tag === 'p' && popTo(stack.length - 1));
    const sibling = _SIBLINGS[tag]
      ? indexOf(_SIBLINGS[tag]!, _IMPLIED[tag]!)
      : -1;
    void (sibling > 0 && popTo(sibling));
    const element: HtmlElement = {
      tag,
      attrs: _attrs(match[3] ?? ''),
      children: [],
    };
    top().children.push(element);
    if (_RAW.has(tag) && match[4] !== '/') {
      const end = html.toLowerCase().indexOf(`</${tag}`, at);
      at = end < 0 ? html.length : html.indexOf('>', end) + 1 || html.length;
      continue;
    }
    void (!_VOID.has(tag) && match[4] !== '/' && stack.push(element));
  }
  pushText();
  return root.children;
};

const _NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  shy: '',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  bull: '•',
  middot: '·',
  euro: '€',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  aacute: 'á',
  ccedil: 'ç',
  oacute: 'ó',
  iacute: 'í',
  uacute: 'ú',
  ntilde: 'ñ',
  thinsp: '\u2009',
  ensp: '\u2002',
  emsp: '\u2003',
  zwnj: '\u200c',
  zwj: '\u200d',
};

/** Сущности HTML → символы: числовые все, именованные — самые частые в текстах WordPress. */
export var decodeEntities = (text: string): string =>
  text.replace(
    /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,7}));/gi,
    (match, dec: string, hex: string, name: string) =>
      dec !== undefined || hex !== undefined
        ? ((code) =>
            code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match)(
            dec !== undefined ? Number(dec) : Number.parseInt(hex, 16)
          )
        : Object.hasOwn(_NAMED, name)
          ? _NAMED[name]!
          : match
  );

/** Текст узлов без разметки, сущности раскодированы, пробелы схлопнуты. */
export var textOf = (nodes: readonly HtmlNode[]): string =>
  decodeEntities(
    nodes
      .map((_) =>
        typeof _ === 'string'
          ? _
          : BLOCK_TAGS.has(_.tag) || _.tag === 'br'
            ? ` ${textOf(_.children)} `
            : textOf(_.children)
      )
      .join('')
  )
    .replace(/\s+/g, ' ')
    .trim();

/** Все элементы ветки с тегом из списка, сверху вниз. */
export var findAll = (
  nodes: readonly HtmlNode[],
  tags: readonly string[]
): HtmlElement[] =>
  nodes.flatMap((_) =>
    typeof _ === 'string'
      ? []
      : [...(tags.includes(_.tag) ? [_] : []), ...findAll(_.children, tags)]
  );

/** Классы элемента. */
export var classesOf = (element: HtmlElement): string[] =>
  (element.attrs.class ?? '').split(/\s+/).filter(Boolean);
