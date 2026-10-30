import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineSiteService } from './application/site-service.ts';
import { defineDictionaryRepository } from './infrastructure/sqlite-dictionary-repository.ts';
import { defineSettingsRepository } from './infrastructure/sqlite-settings-repository.ts';

export type { SiteService } from './application/site-service.ts';
export type { CustomSetting, Translation } from './domain/dictionary.ts';
export type { SiteEvent } from './domain/events.ts';
export type {
  PagingCanonical,
  SiteSettings,
} from './domain/site-settings.ts';
export { siteMigrations } from './infrastructure/migrations.ts';

/** Контекст site: настройки, языки и переводы, свои настройки. */
export var defineSite = ({ db, bus }: { db: Database; bus: EventBus }) =>
  defineSiteService({
    settings: defineSettingsRepository(db),
    dictionary: defineDictionaryRepository(db),
    bus,
  });
