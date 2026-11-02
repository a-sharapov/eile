import { attempt } from '../../../shared/kernel/errors.ts';
import type { MediaService } from '../application/media-service.ts';

export var MEDIA_PREFIX = '/media/';

const _YEAR = 'public, max-age=31536000, immutable';

// SVG может нести скрипт: в песочнице без источников он отрисуется, но не выполнится.
const _SVG = {
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

// Без кэша на диске файл идёт из базы кусками по 4 МиБ: в памяти на ответ один кусок, а не весь файл.
const _CHUNK = 4 * 1024 * 1024;

const _notFound = (): Response => new Response('Not Found', { status: 404 });

type _File = NonNullable<ReturnType<MediaService['files']['read']>>;

type _Span = {
  readonly start: number;
  readonly end: number;
  /** Кусок по Range — ответ 206; иначе весь файл. */
  readonly partial: boolean;
};

// Единица — без учёта регистра и с пробелами, как читает Range сам Bun.serve: ответ 200 с файлом с диска
// он иначе нарезал бы по-своему.
const _RANGE = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/i;

// Видео браузер читает кусками: Safari без ответа 206 его не проигрывает. Один диапазон — кусок,
// несколько — весь файл (так разрешает RFC 9110), за пределами файла — 416.
const _span = (header: string | null, size: number): _Span | 'none' =>
  ((match) =>
    match === null
      ? { start: 0, end: size - 1, partial: false }
      : ((start, end) =>
          start <= end && start < size && end >= 0
            ? { start, end: Math.min(end, size - 1), partial: true }
            : 'none')(
          match[1] === ''
            ? Math.max(0, size - Number(match[2]))
            : Number(match[1]),
          match[1] === '' || match[2] === '' ? size - 1 : Number(match[2])
        ))(header === null ? null : _RANGE.exec(header.trim()));

const _fromDatabase = (
  read: _File['chunk'],
  span: _Span
): ReadableStream<Uint8Array> => {
  let next = span.start;
  // highWaterMark 0: следующий кусок читается, когда предыдущий ушёл, а не заранее.
  return new ReadableStream(
    {
      pull: (controller) =>
        ((bytes) => (
          (next += bytes.byteLength),
          void (bytes.byteLength > 0 && controller.enqueue(bytes)),
          void (
            (next > span.end || bytes.byteLength === 0) &&
            controller.close()
          )
        ))(read(next, Math.min(_CHUNK, span.end + 1 - next))),
    },
    { highWaterMark: 0 }
  );
};

// Файл с диска Bun отдаёт через sendfile, кусок — тоже: slice не читает файл в память.
const _send = (
  local: Blob | null,
  file: _File,
  span: _Span,
  headers: Readonly<Record<string, string>>
): Response =>
  new Response(
    local === null
      ? _fromDatabase(file.chunk, span)
      : span.partial
        ? local.slice(span.start, span.end + 1)
        : local,
    {
      status: span.partial ? 206 : 200,
      headers: {
        ...headers,
        ...(span.partial
          ? {
              'content-range': `bytes ${span.start}-${span.end}/${file.meta.size}`,
            }
          : {}),
        // Длину потока из базы Bun не знает: без неё ответ ушёл бы частями без размера.
        ...(local === null
          ? { 'content-length': String(span.end - span.start + 1) }
          : {}),
      },
    }
  );

// У HEAD диапазона нет (RFC 9110): заголовки и длина всего файла, без выгрузки на диск.
const _answer = (
  request: Request,
  url: URL,
  file: _File
): Promise<Response> => {
  const etag = `"${file.meta.hash}"`;
  const headers = {
    'content-type': file.meta.contentType,
    etag,
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    'cache-control':
      url.searchParams.get('v') === file.meta.hash ? _YEAR : 'no-cache',
    ...(file.meta.contentType.startsWith('image/svg') ? _SVG : {}),
  };
  const head = request.method === 'HEAD';
  const span = _span(
    head ? null : request.headers.get('range'),
    file.meta.size
  );
  return request.headers.get('if-none-match') === etag
    ? Promise.resolve(new Response(null, { status: 304, headers }))
    : span === 'none'
      ? Promise.resolve(
          new Response(null, {
            status: 416,
            headers: {
              ...headers,
              'content-range': `bytes */${file.meta.size}`,
            },
          })
        )
      : head
        ? Promise.resolve(
            new Response(null, {
              headers: { ...headers, 'content-length': String(file.meta.size) },
            })
          )
        : file.local().then((local) => _send(local, file, span, headers));
};

/**
 * `/media/<путь>`: файл медиатеки с ETag; с `?v=<хэш>` — навсегда в кэше браузера. Тело — файл из кэша
 * на диске, без него — куски прямо из базы.
 */
export var defineMediaHandler =
  (media: MediaService) =>
  (request: Request): Promise<Response> =>
    ((url) =>
      ((file) =>
        file === null
          ? Promise.resolve(_notFound())
          : _answer(request, url, file))(
        attempt(
          () =>
            media.files.read(
              decodeURIComponent(url.pathname.slice(MEDIA_PREFIX.length))
            ),
          () => null
        )
      ))(new URL(request.url));
