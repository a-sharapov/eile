import type { FieldName } from './field.ts';
import type { PageId } from './page.ts';

export type PageEvent = {
  readonly type:
    | 'content.page_created'
    | 'content.page_edited'
    | 'content.page_published'
    | 'content.page_unpublished'
    | 'content.page_moved'
    | 'content.page_fields_changed'
    | 'content.page_trashed'
    | 'content.page_restored'
    | 'content.page_removed';
  readonly pageId: PageId;
  readonly parentId: PageId | null;
  /** Прежний родитель при перемещении. */
  readonly previousParentId?: PageId | null;
  /** Исходная страница набора переводов, если эта — перевод. */
  readonly translationOf?: PageId | null;
  /** Прежняя исходная страница, если связь сменилась. */
  readonly previousTranslationOf?: PageId | null;
};

export type FieldEvent = {
  readonly type: 'content.field_saved' | 'content.field_removed';
  readonly field: FieldName;
};

export type ContentEvent = PageEvent | FieldEvent;
