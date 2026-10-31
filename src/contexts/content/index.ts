import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import {
  type Clock,
  defineContentService,
} from './application/content-service.ts';
import { defineFieldRepository } from './infrastructure/sqlite-field-repository.ts';
import { defineOldPathRepository } from './infrastructure/sqlite-old-path-repository.ts';
import { definePageRepository } from './infrastructure/sqlite-page-repository.ts';
import { definePublishedContent } from './infrastructure/sqlite-published-content.ts';
import { defineRevisionRepository } from './infrastructure/sqlite-revision-repository.ts';

export type {
  Clock,
  ContentService,
  CreatePageInput,
  PageRef,
  RestoreInput,
} from './application/content-service.ts';
export type {
  ChildrenOptions,
  DraftContent,
  ListOptions,
  ListSort,
  PageList,
  PageNode,
  PageView,
  PublishedContent,
} from './application/published-content.ts';
export type { ContentEvent } from './domain/events.ts';
export type { Field, FieldType, FieldValue, NewField } from './domain/field.ts';
export type {
  FieldValues,
  Moment,
  Page,
  PageChanges,
  PageKind,
} from './domain/page.ts';
export type {
  Author,
  Revision,
  RevisionAction,
  Snapshot,
} from './domain/revision.ts';
export type { RevisionSummary } from './domain/revision-repository.ts';
export { contentMigrations } from './infrastructure/migrations.ts';

/** Контекст content: дерево страниц, их поля и публикация. */
export var defineContent = ({
  db,
  bus,
  clock,
}: {
  db: Database;
  bus: EventBus;
  clock: Clock;
}) => {
  const published = definePublishedContent(db);
  bus.onAny(
    (event) =>
      void (event.type.startsWith('content.') && published.invalidate())
  );
  return defineContentService({
    pages: definePageRepository(db),
    fields: defineFieldRepository(db),
    oldPaths: defineOldPathRepository(db),
    revisions: defineRevisionRepository(db),
    published,
    drafts: published.drafts,
    bus,
    clock,
  });
};
