import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
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
import type { MediaCache, MediaRepository } from '../domain/ports.ts';

export type Upload = {
  readonly path: string;
  readonly data: Uint8Array;
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

const _dimension = (value: number | null | undefined): number | null =>
  value === null || value === undefined
    ? null
    : Number.isSafeInteger(value) && value > 0
      ? value
      : fail('media.invalid_size', `Invalid dimension ${value}`);

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
    const file: MediaFile = {
      path,
      contentType: contentTypeOf(path),
      size: checkSize(upload.data.byteLength),
      hash: new Bun.CryptoHasher('sha256')
        .update(upload.data)
        .digest('hex')
        .slice(0, 16),
      width: _dimension(upload.width),
      height: _dimension(upload.height),
      // Замена файла не стирает описание: картинка та же по смыслу, сменилось только содержимое.
      alt: files.meta(path)?.alt ?? '',
    };
    files.save(file, upload.data);
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
            data: () => files.content(path)!.data,
            /** Файл из кэша медиатеки; null — кэша нет, читать кусками из базы. */
            local: () => cache.local(meta, () => files.content(path)),
            /** `length` байт с `start` прямо из базы, без всего файла в памяти. */
            chunk: (start: number, length: number): Uint8Array =>
              files.chunk(path, start, length) ?? new Uint8Array(0),
          }
        );
      },
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
