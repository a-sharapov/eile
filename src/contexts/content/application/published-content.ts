import type { FieldValue } from '../domain/field.ts';
import type { Moment, PageKind } from '../domain/page.ts';

/** Страница глазами посетителя. */
export type PageView = {
  readonly id: number;
  readonly parentId: number | null;
  readonly kind: PageKind;
  readonly title: string;
  readonly longTitle: string;
  readonly menuTitle: string;
  readonly description: string;
  readonly introText: string;
  readonly alias: string;
  /** Алиасы предков и страницы: `/blog/first-post`. Главная всё равно отдаётся по `/`. */
  readonly path: string;
  readonly template: string;
  /** MIME-тип ответа; не `text/html` — страница-файл без шаблона. */
  readonly contentType: string;
  readonly content: string;
  /** Цель ссылки (`kind: 'link'`), иначе пустая строка. */
  readonly linkTo: string;
  readonly menuIndex: number;
  readonly hiddenFromMenu: boolean;
  readonly cacheable: boolean;
  /** Показывать поисковикам и ИИ: false — `noindex`, нет в sitemap.xml и llms.txt. */
  readonly searchable: boolean;
  /** Путь файла медиатеки для соцсетей; пусто — картинка сайта из настроек. */
  readonly socialImage: string;
  /** Язык страницы с учётом ветки: свой, иначе ближайшего предка; пусто — язык сайта. */
  readonly language: string;
  readonly createdAt: Moment;
  readonly updatedAt: Moment;
  readonly publishedAt: Moment | null;
  /** Все поля шаблона: своё значение, иначе унаследованное, иначе умолчание, иначе null. */
  readonly fields: Readonly<Record<string, FieldValue | null>>;
};

/** Узел дерева в менеджере: все страницы, включая неопубликованные и корзину. */
export type PageNode = {
  readonly id: number;
  readonly parentId: number | null;
  readonly kind: PageKind;
  readonly title: string;
  readonly menuTitle: string;
  readonly alias: string;
  readonly template: string;
  readonly contentType: string;
  readonly published: boolean;
  readonly trashed: boolean;
  readonly menuIndex: number;
  readonly hiddenFromMenu: boolean;
  readonly publishAt: Moment | null;
  readonly unpublishAt: Moment | null;
};

/** Модель чтения менеджера. */
export type DraftContent = {
  readonly tree: () => PageNode[];
  /** Страница как в шаблоне — для предпросмотра, даже неопубликованная. */
  readonly view: (id: number) => PageView | null;
};

export type ChildrenOptions = {
  /** И скрытые из меню, и страницы-файлы. */
  readonly includeHidden?: boolean;
};

/** published — новые публикации первыми, created — новые первыми, title — по алфавиту, menu — порядок в меню. */
export type ListSort = 'published' | 'created' | 'title' | 'menu';

export type ListOptions = {
  readonly sort?: ListSort;
  /** Уровней вниз: 1 — только дети. */
  readonly depth?: number;
  /** И скрытые из меню: посты блога обычно скрыты. */
  readonly includeHidden?: boolean;
  readonly offset?: number;
  readonly limit?: number;
};

/** Порция списка и сколько страниц в нём всего. */
export type PageList = {
  readonly items: PageView[];
  readonly total: number;
};

/** Модель чтения: опубликованные страницы вне корзины, чьи предки тоже не в корзине. */
export type PublishedContent = {
  readonly page: (id: number) => PageView | null;
  readonly byPath: (path: string) => PageView | null;
  /** Опубликованная страница, которая раньше жила по этому адресу: для 301 со старых адресов. */
  readonly movedFrom: (path: string) => PageView | null;
  /** Предки страницы от ближайшего к корню. */
  readonly lineage: (id: number) => number[];
  /** По порядку в меню; `null` — верхний уровень дерева. Страницы-файлы в меню не попадают. */
  readonly children: (
    parentId: number | null,
    options?: ChildrenOptions
  ) => PageView[];
  /** HTML-страницы ветки до глубины `depth`; страниц-файлов в списке не бывает. */
  readonly list: (parentId: number | null, options?: ListOptions) => PageList;
  /** Родитель и потомки до глубины `depth - 1`: от их детей зависит список. */
  readonly containers: (
    parentId: number | null,
    depth: number
  ) => (number | null)[];
};
