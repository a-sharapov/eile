import type { PageView } from '../../content/index.ts';
import { documentOf } from '../domain/document.ts';
import type { IndexRow, SearchIndex } from '../domain/ports.ts';
import {
  type Clause,
  matchOf,
  normalize,
  parseQuery,
  parseSynonyms,
  type SearchQuery,
  type Synonyms,
  wordsOf,
} from '../domain/query.ts';
import { snippetOf } from '../domain/snippet.ts';
import { stem } from '../domain/stem.ts';
import {
  MAX_CORRECTIONS,
  nearestTerm,
  type VocabularyTerm,
} from '../domain/typos.ts';

/** Опубликованные страницы, из которых строится индекс. */
export type SearchPages = {
  readonly page: (id: number) => PageView | null;
  /** Сама страница, если опубликована, и её опубликованные потомки всех уровней. */
  readonly branch: (id: number) => PageView[];
  readonly all: () => PageView[];
  /** Предки от корня к родителю. */
  readonly ancestors: (id: number) => readonly number[];
  /** Язык сайта, страница 404 (её в выдаче не бывает) и синонимы — группа на строку. */
  readonly site: () => {
    readonly language: string;
    readonly notFoundPageId: number | null;
    readonly synonyms: string;
  };
};

/** HTML → текст без разметки, тегов компонентов и модулей. */
export type PlainText = (html: string) => string;

export type SearchOptions = {
  readonly language: string;
  readonly parent?: number | null;
  readonly limit?: number;
  readonly offset?: number;
};

/** Найденная страница: заголовок и отрывок HTML, где найденные слова — в <mark>. */
export type SearchHit = {
  readonly id: number;
  readonly title: string;
  readonly snippet: string;
};

export type SearchResult = {
  readonly query: string;
  readonly hits: SearchHit[];
  readonly total: number;
  /** По запросу ничего не нашлось, и выдача — по исправленному: его текст; иначе null. */
  readonly corrected: string | null;
};

/** Версия формата индекса: меняются основы слов или состав документа — индекс строится заново. */
export var INDEX_FORMAT = 1;

/** Больше страниц за раз выдача не отдаёт. */
export var MAX_LIMIT = 50;

// Значения полей: строки, кроме путей файлов медиатеки и адресов — их слова поиску не нужны.
const _FILE = /\.(?:jpe?g|png|webp|gif|svg|avif|pdf|mp4|webm|mp3)$/i;
const _URL = /^(?:https?:\/\/|\/)\S*$/;

const _textFields = (fields: PageView['fields']): string[] =>
  Object.values(fields).filter(
    (_): _ is string =>
      typeof _ === 'string' &&
      _.trim() !== '' &&
      !_FILE.test(_) &&
      !_URL.test(_)
  );

export var defineSearchService = ({
  index,
  pages,
  text,
}: {
  index: SearchIndex;
  pages: SearchPages;
  text: PlainText;
}) => {
  // Индекс не строился, построен старым форматом или сброшен после восстановления — строится к первому поиску.
  let stale = index.format() !== INDEX_FORMAT;
  // Словарь индекса для опечаток — до первой правки индекса; синонимы — пока не сменился их текст.
  let words: VocabularyTerm[] | null = null;
  let guesses: Map<string, string | null> | null = null;
  let synonyms: { readonly text: string; readonly map: Synonyms } | null = null;

  const vocabulary = (): VocabularyTerm[] => (words ??= index.vocabulary());

  const synonymsOf = (text: string): Synonyms =>
    (synonyms?.text === text
      ? synonyms
      : (synonyms = { text, map: parseSynonyms(text) })
    ).map;

  const indexable = (page: PageView): boolean =>
    page.kind === 'page' &&
    page.contentType === 'text/html' &&
    page.searchable &&
    page.id !== pages.site().notFoundPageId;

  const put = (page: PageView): void =>
    void (
      indexable(page) &&
      index.put(
        documentOf({
          id: page.id,
          language: page.language || pages.site().language,
          ancestors: pages.ancestors(page.id),
          title: page.title,
          longTitle: page.longTitle,
          menuTitle: page.menuTitle,
          description: page.description,
          introText: page.introText,
          content: text(page.content),
          fields: _textFields(page.fields).map(text),
        })
      )
    );

  const rebuild = (): void => (
    index.transaction(
      () => (
        index.clear(), pages.all().forEach(put), index.setFormat(INDEX_FORMAT)
      )
    ),
    void ((stale = false), (words = null), (guesses = null))
  );

  const fresh = (): void => void (stale && rebuild());

  const found = (query: SearchQuery, options: SearchOptions) =>
    index.query(matchOf(query), {
      language: options.language,
      parent: options.parent ?? null,
      limit: Math.min(
        MAX_LIMIT,
        Math.max(1, Math.trunc(options.limit ?? 10) || 10)
      ),
      offset: Math.max(0, Math.trunc(options.offset ?? 0) || 0),
    });

  // Ближайшее слово — по основе один раз до следующей правки индекса: повтор того же запроса бесплатен.
  const nearest = (stem: string): string | null =>
    ((cache) =>
      cache.has(stem)
        ? cache.get(stem)!
        : ((term) => (cache.set(stem, term), term))(
            nearestTerm(stem, vocabulary())
          ))((guesses ??= new Map()));

  // Слово без синонимов, которого нет в индексе даже началом, — опечатка.
  const typo = (clause: Clause): boolean =>
    clause.length === 1 &&
    clause[0]!.stems.length === 1 &&
    !index.known(clause[0]!.stems[0]!, clause[0]!.prefix);

  /** Исправления по условиям запроса: не больше MAX_CORRECTIONS слов, остальные — как есть (null). */
  const fixesOf = (query: SearchQuery): (string | null)[] =>
    query.clauses.reduce<{ fixes: (string | null)[]; tried: number }>(
      (acc, clause) =>
        acc.tried < MAX_CORRECTIONS && typo(clause)
          ? {
              fixes: [...acc.fixes, nearest(clause[0]!.stems[0]!)],
              tried: acc.tried + 1,
            }
          : { ...acc, fixes: [...acc.fixes, null] },
      { fixes: [], tried: 0 }
    ).fixes;

  /** Запрос с исправленными словами и сами исправления; null — исправлять нечего. */
  const corrected = (
    query: SearchQuery
  ): { query: SearchQuery; fixes: (string | null)[] } | null =>
    ((fixes) =>
      fixes.every((_) => _ === null)
        ? null
        : {
            fixes,
            query: {
              ...query,
              clauses: query.clauses.map((clause, index) =>
                fixes[index]
                  ? [{ stems: [fixes[index]], prefix: false }]
                  : clause
              ),
            },
          })(fixesOf(query));

  // В показанном запросе меняются только исправленные слова — как они написаны на найденной странице.
  const spelled = (
    query: SearchQuery,
    fixes: readonly (string | null)[],
    row: IndexRow | undefined
  ): string =>
    query.sources
      .map((source, index) =>
        fixes[index] && row
          ? (wordsOf(`${row.title} ${row.text}`)
              .find((_) => stem(normalize(_.word)) === fixes[index])
              ?.word.toLowerCase() ?? source)
          : source
      )
      .join(' ');

  const result = (
    query: SearchQuery,
    rows: { readonly rows: IndexRow[]; readonly total: number },
    correction: string | null
  ): SearchResult => ({
    query: query.text,
    hits: rows.rows.map((_) => ({
      id: _.id,
      title: _.title,
      snippet: snippetOf(_.text, query),
    })),
    total: rows.total,
    corrected: correction,
  });

  // Ничего не нашлось — второй проход с исправленными опечатками; нашлось и там — выдача по нему.
  const withCorrection = (
    query: SearchQuery,
    options: SearchOptions
  ): SearchResult =>
    ((first) =>
      first.total > 0
        ? result(query, first, null)
        : ((retry) =>
            retry === null
              ? result(query, first, null)
              : ((second) =>
                  second.total > 0
                    ? result(
                        retry.query,
                        second,
                        spelled(query, retry.fixes, second.rows[0])
                      )
                    : result(query, first, null))(found(retry.query, options)))(
            corrected(query)
          ))(found(query, options));

  return {
    search: (raw: string, options: SearchOptions): SearchResult =>
      ((query) =>
        query === null
          ? { query: raw.trim(), hits: [], total: 0, corrected: null }
          : (fresh(), withCorrection(query, options)))(
        parseQuery(raw, synonymsOf(pages.site().synonyms))
      ),
    /** Страница или ветка изменилась: снять её из индекса и положить заново то, что опубликовано. */
    reindex: (id: number): void =>
      void (
        stale ||
        (index.transaction(
          () => (index.removeBranch(id), pages.branch(id).forEach(put))
        ),
        (words = null),
        (guesses = null))
      ),
    /** Поменялись поля или язык сайта: индекс перестроится к следующему поиску. */
    invalidate: (): void => void (stale = true),
    rebuild,
    /** Построить индекс заранее, если нужно: сервер делает это после запуска, а не на первом поиске. */
    warm: fresh,
  };
};

export type SearchService = ReturnType<typeof defineSearchService>;
