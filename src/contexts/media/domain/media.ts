import type { Brand } from '../../../shared/kernel/brand.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';

/** Путь файла в медиатеке: `images/summer/photo.jpg`, вариант размера — `photo@960.webp`. */
export type MediaPath = Brand<string, 'MediaPath'>;

export type MediaFile = {
  readonly path: MediaPath;
  readonly contentType: string;
  readonly size: number;
  /** Хэш содержимого: ETag и версия в URL. */
  readonly hash: string;
  readonly width: number | null;
  readonly height: number | null;
  /** Описание картинки (alt): его читает читалка экрана; пусто — не описана. */
  readonly alt: string;
};

export type MediaEvent = {
  readonly type: 'media.file_saved' | 'media.file_removed';
  readonly path: MediaPath;
};

// Только известные типы: HTML и скрипты с того же адреса, что и сайт, открыли бы дорогу XSS.
const _TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  woff2: 'font/woff2',
  woff: 'font/woff',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
};

const _SEGMENT = /^[a-z0-9][a-z0-9._@-]*$/;
const _MAX_PATH = 255;

const _MAX_ALT = 500;

/** Описание картинки: без лишних пробелов и не длиннее 500 знаков — это подпись, не статья. */
export var parseAlt = (raw: string): string =>
  ((alt) =>
    alt.length <= _MAX_ALT
      ? alt
      : fail('media.invalid_alt', `Alt text is longer than ${_MAX_ALT}`))(
    raw.trim().replace(/\s+/g, ' ')
  );

/** 25 МиБ: больше — уже не медиатека сайта, а файловый склад. */
export var MAX_MEDIA_SIZE = 25 * 1024 * 1024;

const _extension = (path: string): string =>
  path.slice(path.lastIndexOf('.') + 1);

export var parseMediaPath = (raw: string): MediaPath =>
  pipe<string, MediaPath>(
    (_: string) => _.trim().toLowerCase().replace(/^\/+/, ''),
    (_: string) =>
      _.length > 0 &&
      _.length <= _MAX_PATH &&
      _.includes('.') &&
      _.split('/').every(
        (segment) => _SEGMENT.test(segment) && !/^\.+$/.test(segment)
      )
        ? (_ as MediaPath)
        : fail(
            'media.invalid_path',
            `"${raw}" must be lowercase latin segments like images/photo.jpg`
          )
  )(raw);

export var contentTypeOf = (path: MediaPath): string =>
  (Object.hasOwn(_TYPES, _extension(path)) ? _TYPES[_extension(path)] : null) ??
  fail(
    'media.unsupported_type',
    `Files ".${_extension(path)}" are not allowed`
  );

export var checkSize = (size: number): number =>
  size > 0 && size <= MAX_MEDIA_SIZE
    ? size
    : fail(
        'media.invalid_size',
        `File must be 1 byte to ${MAX_MEDIA_SIZE / 1024 / 1024} MiB`
      );

/** `img/photo@960.webp` и `img/photo.jpg` — одно изображение `img/photo`. */
export var stemOf = (path: string): string =>
  path.slice(0, path.lastIndexOf('.')).replace(/@\d+$/, '');

/** Ширина варианта из имени `photo@960.webp`; null — это не вариант. */
export var variantWidth = (path: string): number | null => {
  const match = /@(\d+)\.[a-z0-9]+$/.exec(path);
  return match ? Number(match[1]) : null;
};
