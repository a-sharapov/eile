import type { PageView } from '../../content/index.ts';
import { documentOf } from '../domain/document.ts';
import type { SearchIndex } from '../domain/ports.ts';
import { matchOf, parseQuery } from '../domain/query.ts';
import { snippetOf } from '../domain/snippet.ts';

/** Опубликованные страницы, из которых строится индекс. */
export type SearchPages = {
  readonly page: (id: number) => PageView | null;
  /** Сама страница, если опубликована, и её опубликованные потомки всех уровней. */
  readonly branch: (id: number) => PageView[];
  readonly all: () => PageView[];
  /** Предки от корня к родителю. */
  readonly ancestors: (id: number) => readonly number[];
  /** Язык сайта и страница 404: её в выдаче не бывает. */
  readonly site: () => {
    readonly language: string;
    readonly notFoundPageId: number | null;
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
    void (stale = false)
  );

  const fresh = (): void => void (stale && rebuild());

  return {
    search: (raw: string, options: SearchOptions): SearchResult =>
      ((query) =>
        query === null
          ? { query: raw.trim(), hits: [], total: 0 }
          : (fresh(),
            ((found) => ({
              query: query.text,
              hits: found.rows.map((_) => ({
                id: _.id,
                title: _.title,
                snippet: snippetOf(_.text, query),
              })),
              total: found.total,
            }))(
              index.query(matchOf(query), {
                language: options.language,
                parent: options.parent ?? null,
                limit: Math.min(
                  MAX_LIMIT,
                  Math.max(1, Math.trunc(options.limit ?? 10) || 10)
                ),
                offset: Math.max(0, Math.trunc(options.offset ?? 0) || 0),
              })
            )))(parseQuery(raw)),
    /** Страница или ветка изменилась: снять её из индекса и положить заново то, что опубликовано. */
    reindex: (id: number): void =>
      void (
        stale ||
        index.transaction(
          () => (index.removeBranch(id), pages.branch(id).forEach(put))
        )
      ),
    /** Поменялись поля или язык сайта: индекс перестроится к следующему поиску. */
    invalidate: (): void => void (stale = true),
    rebuild,
    /** Построить индекс заранее, если нужно: сервер делает это после запуска, а не на первом поиске. */
    warm: fresh,
  };
};

export type SearchService = ReturnType<typeof defineSearchService>;
