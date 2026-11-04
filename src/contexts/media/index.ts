import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import type { Report } from '../../shared/kernel/report.ts';
import { defineMediaService } from './application/media-service.ts';
import { type MediaEvent, stemOf } from './domain/media.ts';
import type { ImageResizer, MediaCache } from './domain/ports.ts';
import {
  defineMediaRepository,
  defineVariantQueue,
} from './infrastructure/sqlite-media.ts';
import { defineMediaHandler } from './interface/media-handler.ts';

export type {
  ImageSet,
  MediaService,
  Upload,
  UploadContent,
} from './application/media-service.ts';
export {
  contentTypeOf,
  MAX_MEDIA_SIZE,
  type MediaEvent,
  type MediaFile,
  parseMediaPath,
  stemOf,
} from './domain/media.ts';
export type { ImageResizer, MediaCache } from './domain/ports.ts';
export { defineImageResizer } from './infrastructure/bun-image.ts';
export {
  defineMediaCache,
  mediaCacheDir,
} from './infrastructure/disk-cache.ts';
export { mediaMigrations } from './infrastructure/sqlite-media.ts';
export { MEDIA_PREFIX } from './interface/media-handler.ts';

const _log = (error: unknown): void => console.error('media variants', error);

/**
 * Контекст media: файлы сайта в базе и их отдача. Кэш на диске и нарезку картинок создаёт корень
 * композиции: они общие на процесс и переживают пересборку контекстов.
 */
export var defineMedia = ({
  db,
  bus,
  cache,
  resize,
  report,
}: {
  db: Database;
  bus: EventBus;
  cache: MediaCache;
  resize: ImageResizer;
  report: Report;
}) => {
  let kick = (): void => undefined;
  const files = defineMediaRepository(db, stemOf);
  const service = defineMediaService({
    files,
    queue: defineVariantQueue(db),
    resize,
    cache,
    bus,
    report,
    kick: () => kick(),
  });
  // Замена и удаление убирают с диска прежние версии; новую вынесет из базы первый запрос.
  const forget = (event: MediaEvent): void =>
    cache.forget(event.path, files.meta(event.path)?.hash ?? null);
  bus.on<MediaEvent>('media.file_saved', forget);
  bus.on<MediaEvent>('media.file_removed', forget);
  return {
    ...service,
    handle: defineMediaHandler(service),
    /**
     * Фон у сервера: варианты — сразу после загрузки, то, что ждало, — при запуске, а раз в минуту — задания,
     * которые записал другой процесс (`cms mcp`). Команды CLI и тесты гоняют очередь сами.
     */
    start: (): (() => void) => {
      let stopped = false;
      // Ошибка внутри задания Bun.cron без перехвата завершила бы сервер.
      const drain = (): Promise<void> =>
        service.variants.run().then(
          () => undefined,
          (error) => void (stopped || _log(error))
        );
      const job = Bun.cron('* * * * *', drain);
      // После ответа на загрузку, а не внутри неё.
      kick = () => void setTimeout(drain, 0);
      void drain();
      return () => (
        (stopped = true),
        job.stop(),
        service.variants.halt(),
        (kick = () => undefined)
      );
    },
  };
};

export type Media = ReturnType<typeof defineMedia>;
