import type { FieldValue } from '../domain/field.ts';
import type { Moment, Page, PageKind } from '../domain/page.ts';

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
  /**
   * Адрес страницы: алиасы предков (кроме скрытых из адреса) и её алиас с окончанием по стилю адресов —
   * `/blog/first-post`, `/katalog/`, `/o-nas.html`. Главная всё равно отдаётся по `/`.
   */
  readonly path: string;
  /** Папка: при «папках со слэшем» адрес кончается на `/`. */
  readonly folder: boolean;
  /** Алиас входит в адреса потомков. */
  readonly aliasInPath: boolean;
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
  /** Исходная страница, если эта — её перевод. */
  readonly translationOf: number | null;
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
  /** Адрес по алиасам и стилю адресов — и у черновика, и у страницы в корзине. */
  readonly path: string;
  readonly folder: boolean;
  readonly aliasInPath: boolean;
  readonly template: string;
  readonly contentType: string;
  readonly published: boolean;
  readonly trashed: boolean;
  readonly menuIndex: number;
  readonly hiddenFromMenu: boolean;
  readonly publishAt: Moment | null;
  readonly unpublishAt: Moment | null;
  /** Язык с учётом ветки; пусто — язык сайта. */
  readonly language: string;
};

/** Страница из набора переводов — для менеджера, в том числе неопубликованная. */
export type TranslationNode = {
  readonly id: number;
  readonly title: string;
  /** Язык с учётом ветки; пусто — язык сайта. */
  readonly language: string;
  readonly published: boolean;
  readonly trashed: boolean;
  /** Исходная страница набора. */
  readonly original: boolean;
};

/** Модель чтения менеджера. */
export type DraftContent = {
  readonly tree: () => PageNode[];
  /** Страница как в шаблоне — для предпросмотра, даже неопубликованная. */
  readonly view: (id: number) => PageView | null;
  /**
   * Несохранённое состояние страницы как в шаблоне: предпросмотр предложенной правки. Путь и язык — от
   * родителя из дерева, поля без своего значения — наследованием и умолчанием.
   */
  readonly viewOf: (page: Page) => PageView;
  /** Набор переводов страницы: исходная первой; у страницы без переводов — пусто. */
  readonly translations: (id: number) => TranslationNode[];
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
  /** Свой отбор: остаются страницы, для которых он вернул true. Кандидаты — вся ветка с полями. */
  readonly filter?: (page: PageView) => boolean;
  /** Свой порядок вместо `sort`, как у `Array.sort`; при равенстве остаётся порядок `sort`. */
  readonly order?: (a: PageView, b: PageView) => number;
};

/** Порция списка и сколько страниц в нём всего. */
export type PageList = {
  readonly items: PageView[];
  readonly total: number;
};

/** Модель чтения: опубликованные страницы вне корзины, чьи предки тоже не в корзине. */
export type PublishedContent = {
  readonly page: (id: number) => PageView | null;
  /** Страница по её точному адресу. */
  readonly byPath: (path: string) => PageView | null;
  /**
   * Страница, к чьему адресу путь — точный или вариант: без окончания, с лишним `/` или суффиксом
   * (`/katalog` → `/katalog/`). Сравнить её адрес с путём и ответить 301 — дело отдачи.
   */
  readonly locate: (path: string) => PageView | null;
  /** Опубликованная страница, которая раньше жила по этому адресу или его варианту: для 301 со старых адресов. */
  readonly movedFrom: (path: string) => PageView | null;
  /** Предки страницы от ближайшего к корню. */
  readonly lineage: (id: number) => number[];
  /**
   * Опубликованные страницы её набора переводов, включая её саму: исходная первой, затем по id.
   * У страницы без переводов — только она.
   */
  readonly translations: (id: number) => PageView[];
  /** Исходная страница набора: по ней сбрасывается кэш всех переводов. */
  readonly translationHub: (id: number) => number | null;
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
