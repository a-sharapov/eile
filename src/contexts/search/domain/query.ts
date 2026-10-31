import { stem } from './stem.ts';

/** Слово текста и где оно стоит: по позициям строится отрывок с подсветкой. */
export type Word = {
  readonly word: string;
  readonly start: number;
  readonly end: number;
};

/** Термин запроса: основы подряд — слово или фраза; `prefix` — последняя основа может продолжаться. */
export type Term = {
  readonly stems: readonly string[];
  readonly prefix: boolean;
};

/** Условие запроса: термин и его синонимы — подойдёт любой. */
export type Clause = readonly Term[];

export type SearchQuery = {
  /** Запрос как его ввели, после обрезки. */
  readonly text: string;
  readonly clauses: readonly Clause[];
  /** Откуда условие: слово или фраза, как их ввели, — по ним собирается исправленный запрос. */
  readonly sources: readonly string[];
};

/** Синонимы: основа слова → все варианты его группы, включая само слово. */
export type Synonyms = ReadonlyMap<string, readonly Term[]>;

/** Длина запроса и число слов в нём: дальше не читаем, длинный запрос — не поиск, а нагрузка. */
export var QUERY_LIMITS = { length: 200, terms: 8 } as const;

/** Групп синонимов и вариантов в группе — не больше. */
export var SYNONYM_LIMITS = { groups: 500, entries: 20 } as const;

const _WORD = /[\p{L}\p{N}]+/gu;
// Фраза — в любых кавычках; незакрытая кавычка тянется до конца запроса: его ещё дописывают.
const _UNIT = /["«„“]([^"«»„“”]*)["»“”]?|[\p{L}\p{N}]+/gu;

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
const _prefix = (word: string, last: boolean): boolean =>
  stem(normalize(word)).length >= 3 && (normalize(word).length >= 4 || last);

const _term = (words: readonly string[], last: boolean): Term => ({
  stems: words.map((_) => stem(normalize(_))),
  prefix: _prefix(words.at(-1)!, last),
});

/**
 * Синонимы из настроек: строка — группа, варианты через запятую или точку с запятой, вариант — слово
 * или фраза. Слово запроса раскрывается в свою группу; фраза запускает группу только как вариант.
 */
export var parseSynonyms = (text: string): Synonyms =>
  new Map(
    text
      .split('\n')
      .slice(0, SYNONYM_LIMITS.groups)
      .map((line) =>
        line
          .split(/[,;]/)
          .slice(0, SYNONYM_LIMITS.entries)
          .map((_) => wordsOf(_).map((word) => word.word))
          .filter((_) => _.length > 0)
          .map((_) => _term(_, true))
      )
      .filter((group) => group.length > 1)
      .flatMap((group) =>
        group
          .filter((_) => _.stems.length === 1)
          .map((_) => [_.stems[0]!, group] as const)
      )
  );

type _Unit = { readonly words: readonly string[]; readonly phrase: boolean };

// Слова и фразы по порядку; слов всего — не больше предела, однобуквенные при других словах не нужны.
const _units = (text: string): _Unit[] =>
  ((units) =>
    ((total) =>
      units
        .map((_) =>
          _.phrase || total <= 1
            ? _
            : { ..._, words: _.words.filter((word) => word.length > 1) }
        )
        .filter((_) => _.words.length > 0))(
      units.reduce((sum, _) => sum + _.words.length, 0)
    ))(
    [...text.matchAll(_UNIT)]
      .map(
        (_): _Unit =>
          _[1] === undefined
            ? { words: [_[0]], phrase: false }
            : {
                words: wordsOf(_[1]).map((word) => word.word),
                phrase: true,
              }
      )
      .reduce<{ units: _Unit[]; left: number }>(
        (acc, unit) =>
          acc.left <= 0
            ? acc
            : {
                units: [
                  ...acc.units,
                  { ...unit, words: unit.words.slice(0, acc.left) },
                ],
                left: acc.left - unit.words.length,
              },
        { units: [], left: QUERY_LIMITS.terms }
      ).units
  );

// Слово с синонимами — само слово (со своим префиксом) или любой вариант группы.
const _clause = (term: Term, phrase: boolean, synonyms: Synonyms): Clause =>
  ((group) =>
    group === undefined || phrase || term.stems.length > 1
      ? [term]
      : [
          term,
          ...group.filter(
            (_) => !(_.stems.length === 1 && _.stems[0] === term.stems[0])
          ),
        ])(synonyms.get(term.stems[0]!));

/** Запрос посетителя → условия поиска; null — искать нечего. Фразы — в кавычках. */
export var parseQuery = (
  raw: string,
  synonyms: Synonyms = new Map()
): SearchQuery | null =>
  ((text) =>
    ((units) =>
      units.length === 0
        ? null
        : {
            text,
            clauses: units.map((_, index) =>
              _clause(
                _term(_.words, index === units.length - 1),
                _.phrase,
                synonyms
              )
            ),
            sources: units.map((_) =>
              _.phrase ? `"${_.words.join(' ')}"` : _.words[0]!
            ),
          })(_units(text)))(raw.trim().slice(0, QUERY_LIMITS.length));

const _match = (term: Term): string =>
  `"${term.stems.join(' ')}"${term.prefix ? '*' : ''}`;

/**
 * Выражение для MATCH: каждая основа — в кавычках, синтаксис FTS5 из запроса не проходит; фраза —
 * основы подряд, синонимы — через OR, условия — через AND.
 */
export var matchOf = (query: SearchQuery): string =>
  query.clauses
    .map((clause) =>
      clause.length === 1
        ? _match(clause[0]!)
        : `(${clause.map(_match).join(' OR ')})`
    )
    .join(' AND ');

/** Совпадает ли слово текста с запросом — так же, как его нашёл индекс; у фразы — любое её слово. */
export var hits = (word: string, clauses: readonly Clause[]): boolean =>
  ((base) =>
    clauses.some((clause) =>
      clause.some((term) =>
        term.stems.some((_, index) =>
          term.prefix && index === term.stems.length - 1
            ? base.startsWith(_)
            : base === _
        )
      )
    ))(stem(normalize(word)));
