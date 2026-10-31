import { termsOf } from './query.ts';

/** Страница в индексе: её текст для отрывков и основы слов для поиска. */
export type SearchDocument = {
  readonly id: number;
  /** Язык страницы с учётом ветки; пусто у страницы — язык сайта. */
  readonly language: string;
  /** Предки и сама страница: `/1/5/9/` — для поиска внутри раздела и снятия ветки. */
  readonly lineage: string;
  readonly title: string;
  readonly text: string;
  readonly titleTerms: string;
  readonly textTerms: string;
};

/** Что индекс берёт со страницы; текст и поля — уже без разметки. */
export type DocumentSource = {
  readonly id: number;
  readonly language: string;
  readonly ancestors: readonly number[];
  readonly title: string;
  readonly longTitle: string;
  readonly menuTitle: string;
  readonly description: string;
  readonly introText: string;
  readonly content: string;
  readonly fields: readonly string[];
};

/** Сколько текста страницы держит индекс: дальше — уже не про поиск, а про объём базы. */
export var TEXT_LIMIT = 200_000;

/** Ветка страницы для `lineage`: от корня к самой странице. */
export var lineageOf = (ancestors: readonly number[], id: number): string =>
  `/${[...ancestors, id].join('/')}/`;

export var documentOf = (page: DocumentSource): SearchDocument =>
  ((title, text) => ({
    id: page.id,
    language: page.language,
    lineage: lineageOf(page.ancestors, page.id),
    title,
    text,
    titleTerms: termsOf(
      [page.title, page.longTitle, page.menuTitle].filter(Boolean).join(' ')
    ),
    textTerms: termsOf(text),
  }))(
    page.longTitle || page.title,
    // Анонс часто повторяет описание — одинаковые куски берём один раз.
    [
      ...new Set(
        [page.description, page.introText, page.content, ...page.fields]
          .map((_) => _.trim())
          .filter(Boolean)
      ),
    ]
      .join('\n')
      .slice(0, TEXT_LIMIT)
  );
