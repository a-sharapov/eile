import type { Alias } from './alias.ts';
import type { Moment, Page, PageId } from './page.ts';

export type PageRepository = {
  /** Id не переиспользуются: старая ссылка не укажет на чужую страницу. */
  readonly nextId: () => PageId;
  readonly get: (id: PageId) => Page | null;
  /** Только среди страниц вне корзины. */
  readonly findSibling: (parentId: PageId | null, alias: Alias) => Page | null;
  /** Предки от ближайшего к корню. */
  readonly ancestors: (id: PageId) => PageId[];
  /** Страницы, чья отложенная публикация или снятие наступили к `at`. */
  readonly due: (at: Moment) => PageId[];
  readonly nextScheduledAt: () => Moment | null;
  readonly trashed: () => PageId[];
  readonly count: () => number;
  /** Когда страница создана; null — её нет. */
  readonly createdAt: (id: PageId) => Moment | null;
  readonly save: (page: Page) => void;
  /** Удаляет страницу вместе с потомками, значениями полей и историей правок. */
  readonly remove: (id: PageId) => void;
  /** Страницы с этим шаблоном, включая корзину: без шаблона их не показать и не восстановить. */
  readonly withTemplate: (template: string) => PageId[];
  /** Страницы, в тексте которых есть подстрока: грубый отбор, точнее проверяет сценарий. */
  readonly mentioning: (text: string) => PageId[];
  /** Страницы, где встречается путь файла медиатеки: текст, значения полей, картинка для соцсетей. */
  readonly referencingMedia: (path: string) => PageId[];
  /** Переводы этой страницы: страницы, у которых она исходная, включая корзину. */
  readonly translationsOf: (id: PageId) => PageId[];
};
