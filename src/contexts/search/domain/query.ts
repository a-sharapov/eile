import { stem } from './stem.ts';

/** Слово текста и где оно стоит: по позициям строится отрывок с подсветкой. */
export type Word = {
  readonly word: string;
  readonly start: number;
  readonly end: number;
};

/** Термин запроса: основа слова; `prefix` — искать и слова, которые с неё начинаются. */
export type Term = { readonly stem: string; readonly prefix: boolean };

export type SearchQuery = {
  /** Запрос как его ввели, после обрезки. */
  readonly text: string;
  readonly terms: readonly Term[];
};

/** Длина запроса и число слов в нём: дальше не читаем, длинный запрос — не поиск, а нагрузка. */
export var QUERY_LIMITS = { length: 200, terms: 8 } as const;

const _WORD = /[\p{L}\p{N}]+/gu;

/** Слова — подряд идущие буквы и цифры; знаки, кавычки и операторы FTS сюда не попадают. */
export var wordsOf = (text: string): Word[] =>
  [...text.matchAll(_WORD)].map((_) => ({
    word: _[0],
    start: _.index,
    end: _.index + _[0].length,
  }));

/** Нижний регистр и ё как е: «Ёлка» и «елка» — одно слово. */
export var normalize = (word: string): string =>
  word.toLowerCase().replaceAll('ё', 'е');

/** Основы всех слов текста через пробел — то, что ложится в индекс. */
export var termsOf = (text: string): string =>
  wordsOf(text)
    .map((_) => stem(normalize(_.word)))
    .join(' ');

// Короткие основы с префиксом находят что попало («ча*» — и «чашка»): префикс — у основ от трёх букв,
// если слово длиннее трёх или это последнее слово, которое, возможно, ещё дописывают.
const _term = (word: string, last: boolean): Term =>
  ((normal, base) => ({
    stem: base,
    prefix: base.length >= 3 && (normal.length >= 4 || last),
  }))(normalize(word), stem(normalize(word)));

/** Запрос посетителя → основы слов; null — искать нечего. Однобуквенные слова при других не нужны. */
export var parseQuery = (raw: string): SearchQuery | null =>
  ((text) =>
    ((words) =>
      words.length === 0
        ? null
        : {
            text,
            terms: words.map((_, index) =>
              _term(_.word, index === words.length - 1)
            ),
          })(
      ((all) => (all.length > 1 ? all.filter((_) => _.word.length > 1) : all))(
        wordsOf(text).slice(0, QUERY_LIMITS.terms)
      )
    ))(raw.trim().slice(0, QUERY_LIMITS.length));

/** Выражение для MATCH: каждая основа — строка в кавычках, синтаксис FTS5 из запроса не проходит. */
export var matchOf = (query: SearchQuery): string =>
  query.terms.map((_) => `"${_.stem}"${_.prefix ? '*' : ''}`).join(' ');

/** Совпадает ли слово текста с термином запроса — так же, как его нашёл индекс. */
export var hits = (word: string, terms: readonly Term[]): boolean =>
  ((base) =>
    terms.some((_) => (_.prefix ? base.startsWith(_.stem) : base === _.stem)))(
    stem(normalize(word))
  );
