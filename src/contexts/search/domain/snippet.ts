import { hits, type SearchQuery, type Word, wordsOf } from './query.ts';

const _ESCAPE: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Текст для HTML: отрывок выводят через {@html}, поэтому экранируем всё, кроме своих <mark>. */
export var escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (_) => _ESCAPE[_]!);

/** Длина отрывка в символах и сколько текста оставить перед первым найденным словом. */
export var SNIPPET = { length: 180, before: 50 } as const;

// Окно по границам слов: не режем слово посередине; хвост, что влезает целиком, — до конца текста.
const _window = (
  text: string,
  words: readonly Word[],
  from: number
): { readonly start: number; readonly end: number } =>
  ((start) =>
    ((end) => ({ start, end }))(
      start + SNIPPET.length >= text.length
        ? text.length
        : (words.findLast(
            (_) => _.start >= start && _.end <= start + SNIPPET.length
          )?.end ?? start + SNIPPET.length)
    ))(
    from <= 0
      ? 0
      : (words.find((_) => _.start >= from)?.start ?? Math.max(0, from))
  );

/**
 * Отрывок вокруг первого найденного слова: HTML, найденные слова — в <mark>, обрезанные края — «…».
 * Нет совпадения в тексте (нашлось по заголовку) — начало текста.
 */
export var snippetOf = (text: string, query: SearchQuery): string => {
  const words = wordsOf(text);
  const first = words.find((_) => hits(_.word, query.clauses));
  const { start, end } = _window(
    text,
    words,
    first ? first.start - SNIPPET.before : 0
  );
  const inside = words.filter((_) => _.start >= start && _.end <= end);
  const { html, at } = inside.reduce(
    (acc, word) =>
      hits(word.word, query.clauses)
        ? {
            html: `${acc.html}${escapeHtml(text.slice(acc.at, word.start))}<mark>${escapeHtml(word.word)}</mark>`,
            at: word.end,
          }
        : acc,
    { html: '', at: start }
  );
  return `${start > 0 ? '…' : ''}${html}${escapeHtml(text.slice(at, end))}${end < text.length ? '…' : ''}`;
};
