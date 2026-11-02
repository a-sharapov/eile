import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineMediaService } from './application/media-service.ts';
import { type MediaEvent, stemOf } from './domain/media.ts';
import type { MediaCache } from './domain/ports.ts';
import { defineMediaRepository } from './infrastructure/sqlite-media.ts';
import { defineMediaHandler } from './interface/media-handler.ts';

export type {
  ImageSet,
  MediaService,
  Upload,
} from './application/media-service.ts';
export {
  MAX_MEDIA_SIZE,
  type MediaEvent,
  type MediaFile,
  stemOf,
} from './domain/media.ts';
export type { MediaCache } from './domain/ports.ts';
export {
  defineMediaCache,
  mediaCacheDir,
} from './infrastructure/disk-cache.ts';
export { mediaMigrations } from './infrastructure/sqlite-media.ts';
export { MEDIA_PREFIX } from './interface/media-handler.ts';

/**
 * Контекст media: файлы сайта в базе и их отдача. Кэш на диске создаёт корень композиции: он
 * переживает пересборку контекстов.
 */
export var defineMedia = ({
  db,
  bus,
  cache,
}: {
  db: Database;
  bus: EventBus;
  cache: MediaCache;
}) => {
  const files = defineMediaRepository(db, stemOf);
  const service = defineMediaService({ files, cache, bus });
  // Замена и удаление убирают с диска прежние версии; новую вынесет из базы первый запрос.
  const forget = (event: MediaEvent): void =>
    cache.forget(event.path, files.meta(event.path)?.hash ?? null);
  bus.on<MediaEvent>('media.file_saved', forget);
  bus.on<MediaEvent>('media.file_removed', forget);
  return { ...service, handle: defineMediaHandler(service) };
};

export type Media = ReturnType<typeof defineMedia>;
