import { ask } from './dialog.svelte.ts';
import { t } from './i18n.ts';
import { transliterate } from './translit.ts';
import type { MediaFile } from './types.ts';

const _slug = (name: string): string =>
  transliterate(name)
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Размеры картинки и её варианты 480, 960 и 1920 px делает сервер (ADR 0046): менеджер шлёт только файл.
const _send = (path: string, blob: Blob): Promise<MediaFile> => {
  const form = new FormData();
  form.set('file', blob);
  form.set('path', path);
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

/** Загружает файл в папку; варианты размеров картинки сервер сделает следом. */
export var upload = (folder: string, file: File): Promise<MediaFile> =>
  _send(uploadPath(folder, file), file);
