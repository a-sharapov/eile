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
      'cache-control':
        url.searchParams.get('v') === file.meta.hash ? _YEAR : 'no-cache',
      ...(file.meta.contentType.startsWith('image/svg') ? _SVG : {}),
    };
    return file === null
      ? _notFound()
      : request.headers.get('if-none-match') === etag
        ? new Response(null, { status: 304, headers: headers! })
        : new Response(request.method === 'HEAD' ? null : file.data(), {
            headers: headers!,
          });
  };
