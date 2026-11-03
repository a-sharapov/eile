import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
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
  MediaCache,
  MediaRepository,
  UploadContent,
} from '../domain/ports.ts';

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

// Размеры клиента (менеджер мерит картинку в браузере) важнее; агент и API их не шлют — тогда из файла.
// Только картинке без размеров нужен весь файл в памяти: заголовок JPEG бывает где угодно.
const _measure = (
  upload: Upload,
  content: UploadContent,
  contentType: string
): Dimensions =>
  ((sent: Dimensions) =>
    (sent.width !== null && sent.height !== null) ||
    !contentType.startsWith('image/')
      ? sent
      : (imageSize(content.read(0, content.size)) ?? sent))({
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

export var defineMediaService = ({
  files,
  cache,
  bus,
}: {
  files: MediaRepository;
  cache: MediaCache;
  bus: EventBus;
}) => {
  const event = (type: MediaEvent['type'], path: MediaPath): MediaEvent => ({
    type,
    path,
  });

  const save = (upload: Upload): MediaFile => {
    const path = parseMediaPath(upload.path);
    const contentType = contentTypeOf(path);
    const content = _contentOf(upload.data);
    const file: MediaFile = {
      path,
      contentType,
      size: checkSize(content.size),
      hash: _hashOf(content),
      ..._measure(upload, content, contentType),
      // Замена файла не стирает описание: картинка та же по смыслу, сменилось только содержимое.
      alt: files.meta(path)?.alt ?? '',
    };
    files.save(file, content);
    bus.publish(event('media.file_saved', path));
    return file;
  };

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
  };
};

export type MediaService = ReturnType<typeof defineMediaService>;
