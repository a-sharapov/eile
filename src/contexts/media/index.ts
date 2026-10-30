import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineMediaService } from './application/media-service.ts';
import { stemOf } from './domain/media.ts';
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
export { mediaMigrations } from './infrastructure/sqlite-media.ts';
export { MEDIA_PREFIX } from './interface/media-handler.ts';

/** Контекст media: файлы сайта в базе и их отдача. */
export var defineMedia = ({ db, bus }: { db: Database; bus: EventBus }) => {
  const service = defineMediaService({
    files: defineMediaRepository(db, stemOf),
    bus,
  });
  return { ...service, handle: defineMediaHandler(service) };
};

export type Media = ReturnType<typeof defineMedia>;
