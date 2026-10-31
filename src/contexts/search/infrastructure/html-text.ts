import type { PlainText } from '../application/search-service.ts';

// Сущности, которые встречаются в текстах страниц; остальное — числовые ссылки или как есть.
const _ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  copy: '©',
};

// Номер вне Unicode — пробел: fromCodePoint на нём бросает.
const _char = (code: number): string =>
  code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';

const _entity = (match: string, name: string): string =>
  name.startsWith('#x') || name.startsWith('#X')
    ? _char(Number.parseInt(name.slice(2), 16))
    : name.startsWith('#')
      ? _char(Number.parseInt(name.slice(1), 10))
      : (_ENTITIES[name] ?? match);

// Теги CMS в тексте: компоненты [[…]], модули [#…], ссылки [~id~], ключи {i18n.…} и [@…].
// Длина внутри ограничена — разбор остаётся линейным и на испорченном тексте.
const _TAGS =
  /\[\[[^\]]{0,2000}\]\]|\[#[^\]]{0,200}\]|\[~[^\]]{0,40}~\]|\{i18n\.[^}]{0,100}\}|\[@[^\]]{0,100}\]/g;

/**
 * Текст страницы без разметки: HTMLRewriter читает HTML потоком (линейно, без DOM), скрипты и стили
 * пропускает. Соседние блоки разделены пробелом, чтобы слова не склеивались.
 */
export var htmlText: PlainText = (html) => {
  const parts: string[] = [];
  let skipped = 0;
  new HTMLRewriter()
    .on('script, style, template, noscript, svg', {
      element: (el) => {
        skipped += 1;
        el.onEndTag(() => void (skipped -= 1));
      },
    })
    .onDocument({
      text: (chunk) =>
        void (
          skipped === 0 &&
          parts.push(chunk.lastInTextNode ? `${chunk.text} ` : chunk.text)
        ),
    })
    .transform(html);
  return parts
    .join('')
    .replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, _entity)
    .replace(_TAGS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};
