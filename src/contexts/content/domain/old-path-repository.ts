import type { Moment, PageId } from './page.ts';

/** Прежние адреса страниц: по ним сайт отвечает 301 на текущий адрес. */
export type OldPathRepository = {
  readonly pageFor: (path: string) => PageId | null;
  readonly of: (pageId: PageId) => string[];
  /** Все прежние адреса, новые первыми: список в менеджере. */
  readonly all: () => {
    readonly path: string;
    readonly pageId: PageId;
    readonly movedAt: Moment;
  }[];
  readonly save: (path: string, pageId: PageId, at: Moment) => void;
  readonly remove: (path: string) => void;
  readonly removeOf: (pageId: PageId) => void;
};
