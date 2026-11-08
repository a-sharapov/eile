import type { AddressNode } from './address.ts';
import type { Alias } from './alias.ts';
import type { Moment, Page, PageId } from './page.ts';

export type PageRepository = {
  /** Id не переиспользуются: старая ссылка не укажет на чужую страницу. */
  readonly nextId: () => PageId;
  /** Занимает id впрок: следующая страница получит другой, а этот ждёт `create` с ним (ADR 0054). */
  readonly reserve: () => PageId;
  /** Последний выданный или занятый id; 0 — страниц ещё не было. */
  readonly lastId: () => number;
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
  /** Страницы с файлом медиатеки; `original` — ещё и исходный путь файла связанной папки. */
  readonly referencingMedia: (path: string, original?: string) => PageId[];
  /** Переводы этой страницы: страницы, у которых она исходная, включая корзину. */
  readonly translationsOf: (id: PageId) => PageId[];
  /** Начало адреса детей страницы: видимые алиасы её и предков; null — ветка в корзине. */
  readonly trail: (id: PageId) => string | null;
  /** Потомки вне корзины — для адресов ветки. */
  readonly descendants: (id: PageId) => AddressNode[];
  /** Страницы вне корзины (и вне веток в корзине) с этими алиасами и ключи их адресов. */
  readonly withAliases: (aliases: readonly string[]) => {
    readonly node: AddressNode;
    readonly key: string;
  }[];
};
