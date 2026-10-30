import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import {
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules';
import {
  DOMParser as ContentParser,
  DOMSerializer,
  type MarkSpec,
  type MarkType,
  type Node,
  type NodeType,
  Schema,
} from 'prosemirror-model';
import { marks, nodes } from 'prosemirror-schema-basic';
import {
  addListNodes,
  liftListItem,
  wrapInList,
} from 'prosemirror-schema-list';
import type { Command, EditorState, Plugin } from 'prosemirror-state';

// Ссылка с target и rel: без них ссылки из импортированного контента не пережили бы правку.
const _link: MarkSpec = {
  attrs: {
    href: { validate: 'string' },
    title: { default: null },
    target: { default: null },
    rel: { default: null },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      // `javascript:` и прочие исполняемые адреса не попадают в текст: ссылка снимается, текст остаётся.
      getAttrs: (dom: HTMLElement) =>
        safeHref(dom.getAttribute('href') ?? '') && {
          href: dom.getAttribute('href'),
          title: dom.getAttribute('title'),
          target: dom.getAttribute('target'),
          rel: dom.getAttribute('rel'),
        },
    },
  ],
  toDOM: (mark) => ['a', mark.attrs, 0],
};

const _image = {
  ...nodes.image,
  attrs: {
    ...nodes.image.attrs,
    width: { default: null },
    height: { default: null },
  },
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs: (dom: HTMLElement) =>
        safeHref(dom.getAttribute('src') ?? '') &&
        Object.fromEntries(
          ['src', 'alt', 'title', 'width', 'height'].map((_) => [
            _,
            dom.getAttribute(_),
          ])
        ),
    },
  ],
  toDOM: (node: Node) => ['img', node.attrs] as const,
};

const _base = new Schema({
  nodes: { ...nodes, image: _image },
  marks: { ...marks, link: _link },
});

export var schema = new Schema({
  nodes: addListNodes(_base.spec.nodes, 'paragraph block*', 'block'),
  marks: _base.spec.marks,
});

const _inert = (html: string): HTMLElement =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

export var parseHtml = (html: string): Node =>
  ContentParser.fromSchema(schema).parse(_inert(html));

// Пункт списка из одного абзаца пишем без <p>: так его пишут люди и импорт из Evo.
const _unwrapItems = (root: HTMLElement): HTMLElement => (
  root
    .querySelectorAll('li')
    .forEach(
      (item) =>
        void (
          item.children.length === 1 &&
          item.firstElementChild?.tagName === 'P' &&
          item.childNodes.length === 1 &&
          item.replaceChildren(...item.firstElementChild.childNodes)
        )
    ),
  root
);

// Каждый блок и пункт списка — с новой строки: в режиме HTML разметка читается, а не тянется одной строкой.
const _lines = (root: HTMLElement): HTMLElement => (
  [...root.children]
    .slice(1)
    .forEach(
      (child) => void root.insertBefore(document.createTextNode('\n'), child)
    ),
  root
    .querySelectorAll('ul, ol, blockquote')
    .forEach(
      (list) =>
        void ([...list.children].forEach(
          (child) =>
            void list.insertBefore(document.createTextNode('\n'), child)
        ),
        list.append('\n'))
    ),
  root
);

export var serializeHtml = (doc: Node): string => {
  const root = document.createElement('div');
  root.append(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
  const html = _lines(_unwrapItems(root)).innerHTML;
  return html === '<p></p>' ? '' : html;
};

const _ALIASES: Readonly<Record<string, string>> = { b: 'strong', i: 'em' };
const _BLOCK_EDGE =
  /\s*(<\/?(?:p|h[1-6]|li|ul|ol|blockquote|pre|hr|br)(?:\s[^>]*)?>)\s*/g;

const _normal = (node: ChildNode): string =>
  node.nodeType === 3
    ? (node.textContent ?? '').replace(/\s+/g, ' ')
    : node.nodeType === 8
      ? `<!--${node.textContent}-->`
      : node instanceof Element
        ? ((tag) =>
            `<${tag}${[...node.attributes]
              .map((_) => ` ${_.name}="${_.value}"`)
              .sort()
              .join(
                ''
              )}>${[...node.childNodes].map(_normal).join('')}</${tag}>`)(
            _ALIASES[node.localName] ?? node.localName
          )
        : '';

const _normalized = (html: string): string =>
  [..._inert(html).childNodes]
    .map(_normal)
    .join('')
    .replace(_BLOCK_EDGE, '$1')
    .trim();

/** Визуальный редактор сохранит разметку без потерь: иначе блок правится как HTML. */
export var fitsVisual = (html: string): boolean =>
  html.trim() === '' ||
  _normalized(html) === _normalized(serializeHtml(parseHtml(html)));

const _isActive = (state: EditorState, type: MarkType): boolean =>
  state.selection.empty
    ? Boolean(type.isInSet(state.storedMarks ?? state.selection.$from.marks()))
    : state.doc.rangeHasMark(state.selection.from, state.selection.to, type);

const _parentOf = (state: EditorState, type: NodeType): boolean => {
  const { $from } = state.selection;
  return Array.from({ length: $from.depth + 1 }, (_, depth) =>
    $from.node(depth)
  ).some((_) => _.type === type);
};

export type Format = {
  readonly block: 'paragraph' | 'h2' | 'h3' | 'h4' | 'other';
  readonly strong: boolean;
  readonly em: boolean;
  readonly link: boolean;
  readonly bullets: boolean;
  readonly numbers: boolean;
  readonly quote: boolean;
};

const _block = (state: EditorState): Format['block'] => {
  const parent = state.selection.$from.parent;
  return parent.type === schema.nodes.paragraph
    ? 'paragraph'
    : parent.type === schema.nodes.heading &&
        [2, 3, 4].includes(parent.attrs.level)
      ? (`h${parent.attrs.level}` as Format['block'])
      : 'other';
};

/** Что включено под курсором: для кнопок панели. */
export var formatAt = (state: EditorState): Format => ({
  block: _block(state),
  strong: _isActive(state, schema.marks.strong!),
  em: _isActive(state, schema.marks.em!),
  link: _isActive(state, schema.marks.link!),
  bullets: _parentOf(state, schema.nodes.bullet_list!),
  numbers: _parentOf(state, schema.nodes.ordered_list!),
  quote: _parentOf(state, schema.nodes.blockquote!),
});

// Ссылка под курсором — целиком, со всеми соседними кусками текста с той же меткой.
const _linkRange = (
  state: EditorState
): {
  readonly from: number;
  readonly to: number;
  readonly href: string;
} | null => {
  const { $from, from, to, empty } = state.selection;
  const link = schema.marks.link!;
  const parent = $from.parent;
  const start = $from.start();
  const pieces = Array.from({ length: parent.childCount }, (_, i) =>
    parent.child(i)
  ).reduce<
    { from: number; to: number; mark: ReturnType<MarkType['isInSet']> }[]
  >(
    (acc, child) => [
      ...acc,
      {
        from: acc.at(-1)?.to ?? start,
        to: (acc.at(-1)?.to ?? start) + child.nodeSize,
        mark: link.isInSet(child.marks),
      },
    ],
    []
  );
  const at = pieces.findIndex(
    (_) =>
      _.mark && _.from <= from && from <= _.to && (_.from < from || from === to)
  );
  const mark = at === -1 ? undefined : pieces[at]!.mark!;
  const same = (piece: (typeof pieces)[number]) =>
    Boolean(piece.mark && mark && piece.mark.eq(mark));
  const first = pieces.slice(0, at + 1).findLastIndex((_) => !same(_)) + 1;
  const after = pieces.slice(at).findIndex((_) => !same(_));
  const last = after === -1 ? pieces.length - 1 : at + after - 1;
  return !empty
    ? { from, to, href: mark?.attrs.href ?? '' }
    : mark
      ? {
          from: pieces[first]!.from,
          to: pieces[last]!.to,
          href: mark.attrs.href,
        }
      : null;
};

/** Адрес ссылки под курсором — чтобы править его, а не вводить заново. */
export var linkAt = (state: EditorState): string =>
  _linkRange(state)?.href ?? '';

// javascript: и data: в ссылке — исполняемый код у посетителя; разрешены веб, почта, телефон и пути.
const _SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

// Браузер выбрасывает из адреса пробелы и управляющие символы: `java\tscript:` для него — `javascript:`.
// biome-ignore lint/suspicious/noControlCharactersInRegex: адрес чистится от управляющих символов
const _CONTROL = /[\u0000-\u0020\u007f-\u009f]/g;

export var safeHref = (href: string): boolean =>
  ((scheme) => !scheme || _SCHEMES.has(scheme[1]!.toLowerCase()))(
    /^([a-z][a-z0-9+.-]*):/i.exec(href.replace(_CONTROL, ''))
  );

const _LEVELS = { h2: 2, h3: 3, h4: 4 } as const;

export var commands = {
  strong: toggleMark(schema.marks.strong!),
  em: toggleMark(schema.marks.em!),
  block: (block: 'paragraph' | keyof typeof _LEVELS): Command =>
    block === 'paragraph'
      ? setBlockType(schema.nodes.paragraph!)
      : setBlockType(schema.nodes.heading!, { level: _LEVELS[block] }),
  list:
    (type: 'bullet_list' | 'ordered_list', active: boolean): Command =>
    (state, dispatch) =>
      active
        ? liftListItem(schema.nodes.list_item!)(state, dispatch)
        : wrapInList(schema.nodes[type]!)(state, dispatch),
  quote: (active: boolean): Command =>
    active ? lift : wrapIn(schema.nodes.blockquote!),
  /** Ставит, меняет или (пустой адрес) убирает ссылку на выделении или на ссылке под курсором. */
  // Без выделения вставляется текст ссылки: название страницы, а не `[~3~]`.
  link:
    (href: string, text = href): Command =>
    (state, dispatch) => {
      const range = _linkRange(state);
      const link = schema.marks.link!;
      const tr = range
        ? state.tr.removeMark(range.from, range.to, link)
        : state.tr;
      return (
        dispatch?.(
          href === ''
            ? tr
            : range
              ? tr.addMark(range.from, range.to, link.create({ href }))
              : tr.replaceSelectionWith(
                  schema.text(text, [link.create({ href })]),
                  false
                )
        ),
        true
      );
    },
  image:
    (src: string, alt: string): Command =>
    (state, dispatch) => (
      dispatch?.(
        state.tr.replaceSelectionWith(schema.nodes.image!.create({ src, alt }))
      ),
      true
    ),
};

/** Привычные сокращения: «## » — заголовок, «- » — список, «1. » — нумерация, «> » — цитата. */
export var formatRules = (): Plugin =>
  inputRules({
    rules: [
      textblockTypeInputRule(
        /^(#{2,4})\s$/,
        schema.nodes.heading!,
        (match) => ({
          level: match[1]!.length,
        })
      ),
      wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list!),
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list!,
        (match) => ({ order: Number(match[1]) }),
        (match, node) => node.childCount + node.attrs.order === Number(match[1])
      ),
      wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote!),
    ],
  });
