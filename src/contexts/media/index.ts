import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import type { Report } from '../../shared/kernel/report.ts';
import { defineMediaService } from './application/media-service.ts';
import { type MediaEvent, stemOf } from './domain/media.ts';
import type { ImageResizer, MediaCache } from './domain/ports.ts';
import { defineLinkedDisk } from './infrastructure/linked-disk.ts';
import {
  defineMediaRepository,
  defineVariantQueue,
} from './infrastructure/sqlite-media.ts';
import {
  defineMediaHandler,
  defineOriginalHandler,
  defineStaticHandler,
} from './interface/media-handler.ts';

export type {
  LinkGap,
  LinkInput,
  LinkReport,
  LinkView,
  SkippedFile,
  SkipReason,
  UnlinkReport,
} from './application/linked-folders.ts';
export {
  type ImageSet,
  type MediaRead,
  type MediaService,
  mediaHash,
  type StaticAnswer,
  type StaticFile,
  type Upload,
  type UploadContent,
} from './application/media-service.ts';
export {
  linkedPath,
  linkedSegment,
  type MediaLink,
  parseLinkPrefix,
  RESERVED_PREFIXES,
} from './domain/linked.ts';
export {
  checkSize,
  contentTypeOf,
  MAX_MEDIA_SIZE,
  type MediaEvent,
  type MediaFile,
  parseAlt,
  parseMediaPath,
  stemOf,
  variantWidth,
} from './domain/media.ts';
export type { ImageResizer, MediaCache } from './domain/ports.ts';
export { isResizable, stemOwner } from './domain/variants.ts';
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
  base = null,
  notFound,
}: {
  db: Database;
  bus: EventBus;
  cache: MediaCache;
  resize: ImageResizer;
  report: Report;
  /** Каталог файла базы: путь к связанной папке внутри него записывается от него; у базы в памяти — null. */
  base?: string | null;
  /** Страница 404 сайта — адресу папки-сайта без файла и без её `404.html`; по умолчанию голый 404. */
  notFound?: (request: Request) => Promise<Response>;
}) => {
  let kick = (): void => undefined;
  const files = defineMediaRepository(db, stemOf);
  const service = defineMediaService({
    files,
    queue: defineVariantQueue(db),
    resize,
    cache,
    disk: defineLinkedDisk(base),
    bus,
    report,
    kick: () => kick(),
  });
  // Замена и удаление убирают с диска прежние версии; новую вынесет из базы первый запрос.
  const forget = (event: MediaEvent): void =>
    cache.forget(event.path, files.meta(event.path)?.hash ?? null);
  const originals = defineOriginalHandler(service);
  const statics = defineStaticHandler(service, notFound);
  bus.on<MediaEvent>('media.file_saved', forget);
  bus.on<MediaEvent>('media.file_removed', forget);
  return {
    ...service,
    handle: defineMediaHandler(service),
    /**
     * Исходный адрес файла связанной папки или адрес папки-сайта (ADR 0065, 0068); null — адрес не их, дальше
     * страницы и правила. Приставки папок не вкладываются, поэтому порядок двух обработчиков не важен.
     */
    original: (request: Request): Promise<Response> | null =>
      statics(request) ?? originals(request),
    /**
     * Фон у сервера: варианты — сразу после загрузки, то, что ждало, — при запуске, а раз в минуту — задания,
     * которые записал другой процесс (`cms mcp`). Команды CLI и тесты гоняют очередь сами. При запуске —
     * строка в журнал о связанных папках, которых нет на диске, и варианты их картинок, пропавшие из кэша.
     */
    start: (): (() => void) => {
      service.links
        .gaps()
        .forEach(
          (_) =>
            void console.error(
              _.present
                ? `Linked folder ${_.dir} (${_.prefix}): ${_.missing.length} file(s) are missing on disk and answer 404; run cms media link to resync`
                : `Linked folder ${_.dir} (${_.prefix}) is missing: its files answer 404`
            )
        );
      service.links.heal();
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
