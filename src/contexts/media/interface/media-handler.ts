import { attempt } from '../../../shared/kernel/errors.ts';
import type { MediaService } from '../application/media-service.ts';

export var MEDIA_PREFIX = '/media/';

const _YEAR = 'public, max-age=31536000, immutable';

// SVG может нести скрипт: в песочнице без источников он отрисуется, но не выполнится.
const _SVG = {
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

const _notFound = (): Response => new Response('Not Found', { status: 404 });

type _Span = { readonly start: number; readonly end: number };

// Видео браузер читает кусками: Safari без ответа 206 его не проигрывает. Один диапазон — кусок,
// несколько — весь файл (так разрешает RFC 9110), за пределами файла — 416.
const _span = (header: string, size: number): _Span | 'whole' | 'none' =>
  ((match) =>
    match === null
      ? 'whole'
      : ((start, end) =>
          start <= end && start < size && end >= 0
            ? { start, end: Math.min(end, size - 1) }
            : 'none')(
          match[1] === ''
            ? Math.max(0, size - Number(match[2]))
            : Number(match[1]),
          match[1] === '' || match[2] === '' ? size - 1 : Number(match[2])
        ))(/^bytes=(\d*)-(\d*)$/.exec(header.trim()));

/** `/media/<путь>`: файл медиатеки с ETag; с `?v=<хэш>` — навсегда в кэше браузера. */
export var defineMediaHandler =
  (media: MediaService) =>
  (request: Request): Response => {
    const url = new URL(request.url);
    const file = attempt(
      () =>
        media.files.read(
          decodeURIComponent(url.pathname.slice(MEDIA_PREFIX.length))
        ),
      () => null
    );
    const etag = file && `"${file.meta.hash}"`;
    const headers = file && {
      'content-type': file.meta.contentType,
      etag: etag!,
      'x-content-type-options': 'nosniff',
      'accept-ranges': 'bytes',
      'cache-control':
        url.searchParams.get('v') === file.meta.hash ? _YEAR : 'no-cache',
      ...(file.meta.contentType.startsWith('image/svg') ? _SVG : {}),
    };
    const range = request.headers.get('range');
    return file === null
      ? _notFound()
      : request.headers.get('if-none-match') === etag
        ? new Response(null, { status: 304, headers: headers! })
        : range === null
          ? new Response(request.method === 'HEAD' ? null : file.data(), {
              headers: headers!,
            })
          : _partial(file.data(), range, headers!, request.method === 'HEAD');
  };

const _partial = (
  data: Uint8Array,
  range: string,
  headers: Record<string, string>,
  head: boolean
): Response =>
  ((span) =>
    span === 'whole'
      ? new Response(head ? null : data, { headers })
      : span === 'none'
        ? new Response(null, {
            status: 416,
            headers: {
              ...headers,
              'content-range': `bytes */${data.byteLength}`,
            },
          })
        : new Response(head ? null : data.subarray(span.start, span.end + 1), {
            status: 206,
            headers: {
              ...headers,
              'content-range': `bytes ${span.start}-${span.end}/${data.byteLength}`,
            },
          }))(_span(range, data.byteLength));
