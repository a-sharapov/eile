import type { PropValue } from './types.ts';

// Грамматика тега — как у сервера (src/contexts/delivery/domain/content-tags.ts);
// совпадение разборов проверяет tests/content-blocks.test.ts.
const _TAG =
  /\[\[([A-Z][A-Za-z0-9]*)((?:\s+[a-zA-Z_][\w-]*(?:=(?:"[^"]*"|[^\s\]"]+))?)*)\s*\]\]/g;
const _PROP = /([a-zA-Z_][\w-]*)(?:=(?:"([^"]*)"|([^\s\]"]+)))?/g;
// Тег модуля [#Form:callback]: форма из раздела «Формы», а не компонент.
const _MODULE = /\[#([A-Z][A-Za-z0-9]*):([a-z0-9][a-z0-9-]{0,63})\]/g;
const _ANY = new RegExp(`${_TAG.source}|${_MODULE.source}`, 'g');
const _NUMBER = /^-?\d+(?:\.\d+)?$/;
const _BARE: Readonly<Record<string, boolean>> = { true: true, false: false };

// Тег — отдельный блок, если стоит между блочными элементами (или один в абзаце); иначе это часть текста.
const _BLOCKS =
  'p|h[1-6]|ul|ol|div|blockquote|table|figure|pre|section|header|footer|aside|nav';
const _BEFORE = new RegExp(
  `(?:^|</(?:${_BLOCKS})>|<hr\\s*/?>)\\s*(<p>\\s*)?$`,
  'i'
);
const _AFTER = new RegExp(
  `^\\s*(</p>)?\\s*(?=$|<(?:${_BLOCKS}|hr)\\b|\\[\\[|\\[#)`,
  'i'
);

export type Block =
  | { readonly id: number; readonly kind: 'text'; html: string }
  | {
      readonly id: number;
      readonly kind: 'component';
      name: string;
      props: Record<string, PropValue>;
    }
  | {
      readonly id: number;
      readonly kind: 'module';
      module: string;
      name: string;
    };

let _next = 0;

export var blockId = (): number => ++_next;

const _value = (quoted?: string, bare?: string): PropValue =>
  quoted !== undefined
    ? quoted
    : bare === undefined
      ? true
      : (_BARE[bare] ?? (_NUMBER.test(bare) ? Number(bare) : bare));

export var parseProps = (raw: string): Record<string, PropValue> =>
  Object.fromEntries(
    [...raw.matchAll(_PROP)].map(({ 1: name, 2: quoted, 3: bare }) => [
      name!,
      _value(quoted, bare),
    ])
  );

const _text = (html: string): Block[] =>
  html.trim() === ''
    ? []
    : [{ id: blockId(), kind: 'text', html: html.trim() }];

type Cut = { readonly blocks: Block[]; readonly at: number };

// Совпадение тега — блок компонента или модуля.
const _blockOf = (match: RegExpMatchArray): Block =>
  match[1] !== undefined
    ? {
        id: blockId(),
        kind: 'component',
        name: match[1],
        props: parseProps(match[2] ?? ''),
      }
    : { id: blockId(), kind: 'module', module: match[3]!, name: match[4]! };

/** Контент страницы → блоки: текст и отдельно стоящие вызовы компонентов и модулей. */
export var parseBlocks = (content: string): Block[] => {
  const cut = [...content.matchAll(_ANY)].reduce<Cut>(
    (acc, match) => {
      const before = content.slice(acc.at, match.index);
      const end = match.index + match[0].length;
      const opened = _BEFORE.exec(before);
      const closed = _AFTER.exec(content.slice(end));
      return opened && closed && Boolean(opened[1]) === Boolean(closed[1])
        ? {
            blocks: [
              ...acc.blocks,
              ..._text(
                before.slice(0, before.length - (opened[1]?.length ?? 0))
              ),
              _blockOf(match),
            ],
            at: end + closed[0].length,
          }
        : acc;
    },
    { blocks: [], at: 0 }
  );
  return [...cut.blocks, ..._text(content.slice(cut.at))];
};

// В кавычках тега не бывает `"`: заменяем на апостроф, а не ломаем тег.
const _prop = ({ 0: name, 1: value }: [string, PropValue]): string =>
  value === true
    ? ` ${name}`
    : typeof value === 'string'
      ? ` ${name}="${value.replaceAll('"', "'")}"`
      : ` ${name}=${value}`;

export var tagOf = (name: string, props: Record<string, PropValue>): string =>
  `[[${name}${Object.entries(props).map(_prop).join('')}]]`;

/** Тег модуля: `[#Form:callback]`. */
export var moduleTag = (module: string, name: string): string =>
  `[#${module}:${name}]`;

const _SERIALIZE: {
  readonly [K in Block['kind']]: (block: Extract<Block, { kind: K }>) => string;
} = {
  text: (_) => _.html.trim(),
  component: (_) => tagOf(_.name, _.props),
  module: (_) => moduleTag(_.module, _.name),
};

/** Блоки → контент: каждый блок с новой строки, теги — между блочными элементами. */
export var serializeBlocks = (blocks: readonly Block[]): string =>
  blocks
    .map((_) => (_SERIALIZE[_.kind] as (block: Block) => string)(_))
    .filter(Boolean)
    .join('\n');
