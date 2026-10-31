import type { PageId } from './page.ts';
import type { NewRevision, Revision } from './revision.ts';

/** Версия без снимка — строка списка в истории. */
export type RevisionSummary = Omit<Revision, 'snapshot'>;

/** История правок; со страницей её удаляет PageRepository.remove. */
export type RevisionRepository = {
  /** Последняя версия страницы: с ней сливается следующая правка. */
  readonly latest: (pageId: PageId) => Revision | null;
  /** Версии страницы без снимков, новые первыми. */
  readonly list: (pageId: PageId) => RevisionSummary[];
  readonly get: (id: number) => Revision | null;
  readonly add: (revision: NewRevision) => number;
  /** Слияние правок: меняются время и список изменений, снимок остаётся. */
  readonly update: (revision: Revision) => void;
  readonly remove: (id: number) => void;
  /** Оставляет у страницы только эти версии. */
  readonly keepOnly: (pageId: PageId, ids: readonly number[]) => void;
};
