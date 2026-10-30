import { ask } from './dialog.svelte.ts';
import { t } from './i18n.ts';
import { transliterate } from './translit.ts';
import type { MediaFile } from './types.ts';

// Ширины вариантов: телефон, ноутбук, большой экран; больше оригинала не растягиваем.
const _WIDTHS = [480, 960, 1920];
const _RESIZABLE = ['image/jpeg', 'image/png', 'image/webp'];
const _QUALITY = 0.82;

const _slug = (name: string): string =>
  transliterate(name)
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const _send = (
  path: string,
  blob: Blob,
  width?: number,
  height?: number
): Promise<MediaFile> => {
  const form = new FormData();
  form.set('file', blob);
  form.set('path', path);
  void (width && form.set('width', String(width)));
  void (height && form.set('height', String(height)));
  return fetch('/manager/api/media', { method: 'POST', body: form }).then(
    (response) =>
      response
        .json()
        .catch(() => null)
        .then((body) =>
          response.ok
            ? body
            : Promise.reject(
                // Как ApiError из api.ts: по коду describe() найдёт понятный текст.
                Object.assign(
                  new Error(body?.error?.message ?? `HTTP ${response.status}`),
                  {
                    code: body?.error?.code ?? 'server',
                    status: response.status,
                  }
                )
              )
        )
  );
};

const _variant = (bitmap: ImageBitmap, width: number): Promise<Blob> => {
  const height = Math.round((bitmap.height * width) / bitmap.width);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/webp', quality: _QUALITY });
};

const _image = (path: string, file: File): Promise<MediaFile[]> =>
  createImageBitmap(file).then((bitmap) => {
    const stem = path.slice(0, path.lastIndexOf('.'));
    const widths = _WIDTHS.filter((_) => _ < bitmap.width);
    return _send(path, file, bitmap.width, bitmap.height).then((original) =>
      widths
        .reduce<Promise<MediaFile[]>>(
          (done, width) =>
            done.then((files) =>
              _variant(bitmap, width).then((blob) =>
                _send(
                  `${stem}@${width}.webp`,
                  blob,
                  width,
                  Math.round((bitmap.height * width) / bitmap.width)
                ).then((_) => [...files, _])
              )
            ),
          Promise.resolve([original])
        )
        .finally(() => bitmap.close())
    );
  });

/** Папка как её примет сервер: строчная латиница, цифры, дефисы, сегменты через «/». */
export var folderSlug = (raw: string): string =>
  raw.split('/').map(_slug).filter(Boolean).join('/');

const _FOLDER_KEY = 'cms.uploadFolder';

/** Папка последней загрузки: медиатека и окно выбора картинки грузят туда же. Живёт в браузере. */
export var uploadFolder = (): string => {
  try {
    return localStorage.getItem(_FOLDER_KEY) || 'images';
  } catch {
    return 'images';
  }
};

export var rememberUploadFolder = (folder: string): void => {
  try {
    localStorage.setItem(_FOLDER_KEY, folderSlug(folder) || 'images');
  } catch {}
};

/** Путь, под которым файл ляжет в медиатеку. */
export var uploadPath = (folder: string, file: File): string =>
  [folderSlug(folder), _slug(file.name)].filter(Boolean).join('/');

/** Загрузка заменит уже лежащие файлы с теми же путями: спрашиваем, если такие есть. */
export var confirmReplace = (
  folder: string,
  list: readonly File[],
  existing: readonly MediaFile[]
): Promise<boolean> =>
  ((clashes) =>
    clashes.length === 0
      ? Promise.resolve(true)
      : ask({
          title: t('media.replaceTitle'),
          body: t('media.replaceBody'),
          items: clashes,
          confirm: t('media.replace'),
        }))(
    list
      .map((_) => uploadPath(folder, _))
      .filter((path) => existing.some((_) => _.path === path))
  );

/** Загружает файл в папку; для изображений — ещё и варианты размеров. */
export var upload = (folder: string, file: File): Promise<MediaFile[]> => {
  const path = uploadPath(folder, file);
  return _RESIZABLE.includes(file.type)
    ? _image(path, file)
    : _send(path, file).then((_) => [_]);
};
