import { api } from './api.ts';

// Скачать файл, собранный в браузере или отданный сервером: ссылка на Blob, щелчок, ссылка отзывается. Отдельно от
// `csv.ts`: его сверяет с сервером тест вне браузера, а здесь нужен документ.

const _save = (name: string, blob: Blob): void =>
  ((url, link) => (
    Object.assign(link, { href: url, download: name }),
    document.body.append(link),
    link.click(),
    link.remove(),
    void setTimeout(() => URL.revokeObjectURL(url), 1000)
  ))(URL.createObjectURL(blob), document.createElement('a'));

/** Скачать CSV: имя файла и текст с BOM. */
export var saveCsv = (name: string, text: string): void =>
  _save(name, new Blob([text], { type: 'text/csv;charset=utf-8' }));

const _NAME = /filename="([^"\\/]+)"/;

/** Имя файла из `Content-Disposition` сервера; без имени — запасное. */
export var fileNameOf = (
  disposition: string | null,
  fallback: string
): string => _NAME.exec(disposition ?? '')?.[1] ?? fallback;

/** Скачать файл, который отдаёт API менеджера (набор аналитики): имя — из ответа сервера. */
export var downloadFile = (path: string, fallback: string): Promise<void> =>
  api
    .file(path)
    .then((response) =>
      response
        .blob()
        .then(
          (blob) =>
            void _save(
              fileNameOf(response.headers.get('content-disposition'), fallback),
              blob
            )
        )
    );
