import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { Report } from '../../../shared/kernel/report.ts';
import { imageSize } from '../domain/image-size.ts';
import {
  checkSize,
  contentTypeOf,
  type MediaEvent,
  type MediaFile,
  type MediaPath,
  parseAlt,
  parseMediaPath,
  stemOf,
  variantWidth,
} from '../domain/media.ts';
import type {
  ImageResizer,
  MediaCache,
  MediaRepository,
  UploadContent,
  VariantQueue,
} from '../domain/ports.ts';
import { isResizable, takesVariants } from '../domain/variants.ts';
import { defineVariantJobs } from './variant-jobs.ts';

export type { UploadContent };

export type Upload = {
  readonly path: string;
  /** Байты в памяти или кусками — из временного файла загрузки. */
  readonly data: Uint8Array | UploadContent;
  readonly width?: number | null;
  readonly height?: number | null;
};

/** Изображение для `<img>`: исходник, варианты для srcset и размеры против сдвига вёрстки. */
export type ImageSet = {
  readonly src: string;
  readonly srcset: string;
  readonly width: number | null;
  readonly height: number | null;
  /** Описание из медиатеки — для `alt`, если компонент своего не передал. */
  readonly alt: string;
};

type Dimensions = {
  readonly width: number | null;
  readonly height: number | null;
};

// Не число, ноль и меньше — как будто размера не прислали: его прочтёт сервер.
const _dimension = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;

// Заголовок почти всегда в начале файла; JPEG с длинными EXIF, XMP и ICC перед кадром читается целиком.
const _HEAD = 256 * 1024;

const _sizeOf = (content: UploadContent): Dimensions | null =>
  imageSize(content.read(0, Math.min(_HEAD, content.size))) ??
  (content.size > _HEAD ? imageSize(content.read(0, content.size)) : null);

// Присланные размеры важнее; менеджер, агент и API их не шлют — тогда из заголовка файла.
const _measure = (
  upload: Upload,
  content: UploadContent,
  contentType: string
): Dimensions =>
  ((sent: Dimensions) =>
    (sent.width !== null && sent.height !== null) ||
    !contentType.startsWith('image/')
      ? sent
      : (_sizeOf(content) ?? sent))({
    width: _dimension(upload.width),
    height: _dimension(upload.height),
  });

const _contentOf = (data: Uint8Array | UploadContent): UploadContent =>
  data instanceof Uint8Array
    ? { size: data.byteLength, read: (start, end) => data.subarray(start, end) }
    : data;

// Хэш — по окну в 1 МиБ: файл загрузки с диска не поднимается в память целиком.
const _WINDOW = 1024 * 1024;

const _hashOf = (content: UploadContent): string =>
  Array.from({ length: Math.ceil(content.size / _WINDOW) })
    .reduce<Bun.CryptoHasher>(
      (hasher, _, n) =>
        hasher.update(content.read(n * _WINDOW, (n + 1) * _WINDOW)),
      new Bun.CryptoHasher('sha256')
    )
    .digest('hex')
    .slice(0, 16);

export var mediaUrl = (file: MediaFile): string =>
  `/media/${file.path}?v=${file.hash}`;

/** Запись файла, разобранная до транзакции: что сохранить, какие варианты устарели, нужна ли очередь. */
type Prepared = {
  readonly file: MediaFile;
  readonly content: UploadContent;
  readonly stale: readonly MediaPath[];
  readonly queued: boolean;
};

export var defineMediaService = ({
  files,
  queue,
  resize,
  cache,
  bus,
  report,
  kick,
  maxPixels,
}: {
  files: MediaRepository;
  queue: VariantQueue;
  resize: ImageResizer;
  cache: MediaCache;
  bus: EventBus;
  report: Report;
  /** В очереди вариантов новое задание: фон сервера разберёт её сразу, а не по расписанию. */
  kick: () => void;
  maxPixels?: number;
}) => {
  const event = (type: MediaEvent['type'], path: MediaPath): MediaEvent => ({
    type,
    path,
  });

  const variantsOf = (path: MediaPath): MediaFile[] =>
    files.family(stemOf(path)).filter((_) => variantWidth(_.path) !== null);

  const prepare = (upload: Upload): Prepared => {
    const path = parseMediaPath(upload.path);
    const contentType = contentTypeOf(path);
    const content = _contentOf(upload.data);
    const previous = files.meta(path);
    const file: MediaFile = {
      path,
      contentType,
      size: checkSize(content.size),
      hash: _hashOf(content),
      ..._measure(upload, content, contentType),
      // Замена файла не стирает описание: картинка та же по смыслу, сменилось только содержимое.
      alt: previous?.alt ?? '',
    };
    // Оригинал сменился: прежние варианты показывали бы старую картинку. Варианты, загруженные до первого
    // оригинала, остаются — их сделал тот, кто загружает.
    const stale =
      previous !== null && previous.hash !== file.hash && isResizable(file)
        ? variantsOf(path).map((_) => _.path)
        : [];
    return {
      file,
      content,
      stale,
      queued: takesVariants(file) && variantsOf(path).length === stale.length,
    };
  };

  // Внутри транзакции: файл, его устаревшие варианты и задание очереди меняются вместе.
  const write = (_: Prepared): Prepared => (
    _.stale.forEach(files.remove),
    files.save(_.file, _.content),
    void (_.queued && queue.add(_.file.path, _.file.hash)),
    _
  );

  const announce = (_: Prepared): MediaFile => (
    _.stale.forEach(
      (path) => void bus.publish(event('media.file_removed', path))
    ),
    bus.publish(event('media.file_saved', _.file.path)),
    void (_.queued && kick()),
    _.file
  );

  const save = (upload: Upload): MediaFile =>
    pipe(prepare, (_) => files.transaction(() => write(_)), announce)(upload);

  const jobs = defineVariantJobs({
    files,
    queue,
    resize,
    report,
    maxPixels,
    variantsOf,
    // Варианты и отметка о задании — одной транзакцией, события — после неё.
    store: (collect) =>
      files.transaction(() => collect().map(prepare).map(write)).map(announce),
  });

  const image = (raw: string): ImageSet | null => {
    const file = files.meta(parseMediaPath(raw));
    const variants = file
      ? files
          .family(stemOf(file.path))
          .filter((_) => variantWidth(_.path) !== null)
          .toSorted((a, b) => variantWidth(a.path)! - variantWidth(b.path)!)
      : [];
    return (
      file && {
        src: mediaUrl(file),
        srcset: variants
          .map((_) => `${mediaUrl(_)} ${variantWidth(_.path)}w`)
          .join(', '),
        width: file.width,
        height: file.height,
        alt: file.alt,
      }
    );
  };

  return {
    files: {
      list: (): MediaFile[] => files.list(),
      save,
      remove: (raw: string): void => {
        const path = parseMediaPath(raw);
        void (
          files.meta(path) ?? fail('media.file_not_found', `No file ${path}`)
        );
        files.remove(path);
        bus.publish(event('media.file_removed', path));
      },
      /** Описание картинки; сайт перерисует страницы, где она стоит. */
      describe: (raw: string, alt: string): MediaFile => {
        const path = parseMediaPath(raw);
        const file =
          files.meta(path) ?? fail('media.file_not_found', `No file ${path}`);
        const next = { ...file, alt: parseAlt(alt) };
        files.describe(path, next.alt);
        bus.publish(event('media.file_saved', path));
        return next;
      },
      read: (raw: string) => {
        const path = parseMediaPath(raw);
        const meta = files.meta(path);
        return (
          meta && {
            meta,
            data: (): Uint8Array =>
              files.chunk(path, 0, meta.size) ?? new Uint8Array(0),
            /** Файл из кэша медиатеки; null — кэша нет, читать кусками из базы. */
            local: () => cache.local(meta, (n) => files.piece(path, n)),
            /** `length` байт с `start` прямо из базы, без всего файла в памяти. */
            chunk: (start: number, length: number): Uint8Array =>
              files.chunk(path, start, length) ?? new Uint8Array(0),
          }
        );
      },
    },
    uploads: {
      /** Куда положить тело загрузки, пока оно разбирается; null — кэша на диске нет: тело — в память. */
      spool: (): string | null => cache.spool(),
    },
    cache: {
      /** Уборка: с диска — файлы кэша, которых больше нет в базе. */
      sweep: (): number => cache.sweep(files.list()),
      /** Весь кэш — с диска: база сменилась целиком (восстановление копии). */
      clear: (): number => cache.sweep([]),
    },
    url: (raw: string): string | null => {
      const file = files.meta(parseMediaPath(raw));
      return file && mediaUrl(file);
    },
    image,
    /** Очередь вариантов размеров: их делает сервер, а не тот, кто загрузил картинку (ADR 0046). */
    variants: jobs,
  };
};

export type MediaService = ReturnType<typeof defineMediaService>;
