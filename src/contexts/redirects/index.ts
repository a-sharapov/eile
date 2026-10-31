import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import {
  type Clock,
  defineRedirectsService,
} from './application/redirects-service.ts';
import type { SitePages } from './domain/ports.ts';
import { defineRuleRepository } from './infrastructure/sqlite-rules.ts';

export type {
  ImportReport,
  RedirectsService,
  RuleWarning,
  SavedRule,
} from './application/redirects-service.ts';
export type { SitePages } from './domain/ports.ts';
export type {
  RedirectRule,
  RedirectStatus,
  RedirectsEvent,
  RuleInput,
  RuleMatch,
} from './domain/redirect.ts';
export { pageTarget } from './domain/redirect.ts';
export { redirectsMigrations } from './infrastructure/migrations.ts';

/** Контекст redirects: правила переадресации, которые владелец сайта ведёт в менеджере. */
export var defineRedirects = ({
  db,
  bus,
  clock,
  pages,
}: {
  db: Database;
  bus: EventBus;
  clock: Clock;
  pages: SitePages;
}) =>
  defineRedirectsService({
    rules: defineRuleRepository(db),
    pages,
    bus,
    clock,
  });
