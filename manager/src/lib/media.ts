import { currentLanguage, number, t } from './i18n.ts';
import type { MediaFile } from './types.ts';

// Варианты размеров (`photo@960.webp`) — служебные копии оригинала, в списках их не показываем.
const _VARIANT = /@\d+\.[a-z0-9]+$/;

export var originals = (files: readonly MediaFile[]): MediaFile[] =>
  files.filter((_) => !_VARIANT.test(_.path));

export var isImage = (file: Pick<MediaFile, 'contentType'>): boolean =>
  file.contentType.startsWith('image/');

/** Адрес для менеджера: с хэшем, чтобы превью обновлялось после замены файла. */
export var previewUrl = (file: Pick<MediaFile, 'path' | 'hash'>): string =>
  `/media/${file.path}?v=${file.hash}`;

/** Адрес для контента: без хэша, замена файла не оставит в тексте старую ссылку. */
export var mediaUrl = (path: string): string => `/media/${path}`;

export var folderOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/** «12 Б», «512 КБ», «1,5 МБ» — числа и единицы по языку менеджера. */
export var fileSize = (bytes: number): string =>
  bytes < 1024
    ? t('units.bytes', { n: number(bytes) })
    : bytes < 1024 ** 2
      ? t('units.kilobytes', { n: number(Math.round(bytes / 1024)) })
      : t('units.megabytes', {
          n: (bytes / 1024 ** 2).toLocaleString(currentLanguage(), {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        });
