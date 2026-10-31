import type { SearchDocument } from './document.ts';

/** Строка выдачи из индекса: что показать и откуда взять отрывок. */
export type IndexRow = {
  readonly id: number;
  readonly title: string;
  readonly text: string;
};

export type IndexFilter = {
  readonly language: string;
  /** Искать только внутри раздела; null — по всему сайту. */
  readonly parent: number | null;
  readonly limit: number;
  readonly offset: number;
};

/** Индекс страниц: FTS5 с весом заголовка выше текста. */
export type SearchIndex = {
  readonly put: (document: SearchDocument) => void;
  /** Снять страницу и всю её ветку. */
  readonly removeBranch: (id: number) => void;
  readonly clear: () => void;
  readonly query: (
    match: string,
    filter: IndexFilter
  ) => { readonly rows: IndexRow[]; readonly total: number };
  /** Версия формата, которой построен индекс; null — индекс не строился. */
  readonly format: () => number | null;
  readonly setFormat: (format: number) => void;
  readonly transaction: (run: () => void) => void;
};
