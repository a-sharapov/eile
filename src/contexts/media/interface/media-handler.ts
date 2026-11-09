import { BLOB_CHUNK } from '../../../platform/chunks.ts';
import {
  type CompressionCache,
  defineCompressionCache,
  negotiate,
} from '../../../platform/compression.ts';
import { attempt } from '../../../shared/kernel/errors.ts';
import type {
  MediaRead,
  MediaService,
  StaticFile,
} from '../application/media-service.ts';
import { escapesFolder } from '../domain/linked.ts';
import { compressible } from '../domain/static-site.ts';

export var MEDIA_PREFIX = '/media/';

const _YEAR = 'public, max-age=31536000, immutable';

// SVG может нести скрипт: в песочнице без источников он отрисуется, но не выполнится.
const _SVG = {
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

const _notFound = (): Response => new Response('Not Found', { status: 404 });

type _File = MediaRead;

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

// Без кэша на диске файл идёт из базы по куску хранения: в памяти на ответ одна строка базы, а не весь файл.
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
        ))(
          read(
            next,
            Math.min(BLOB_CHUNK - (next % BLOB_CHUNK), span.end + 1 - next)
          )
        ),
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

// У HEAD диапазона нет (RFC 9110): заголовки и длина всего файла, без выгрузки на диск. Файл связанной
// папки, изменённый на диске после сверки, — без ETag и вечного кэша: хэш в строке уже не его.
const _answer = (
  request: Request,
  url: URL,
  file: _File
): Promise<Response> => {
  const etag = file.fresh ? `"${file.meta.hash}"` : null;
  const headers = {
    'content-type': file.meta.contentType,
    ...(etag ? { etag } : {}),
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    'cache-control':
      file.fresh && url.searchParams.get('v') === file.meta.hash
        ? _YEAR
        : 'no-cache',
    ...(file.meta.contentType.startsWith('image/svg') ? _SVG : {}),
    // Шрифт браузер берёт по CORS: без этого его не получит страница без своего origin — предпросмотр
    // предложенных правок в песочнице (ADR 0054). Шрифт и так публичен по адресу.
    ...(file.meta.contentType.startsWith('font/')
      ? { 'access-control-allow-origin': '*' }
      : {}),
  };
  const head = request.method === 'HEAD';
  const span = _span(
    head ? null : request.headers.get('range'),
    file.meta.size
  );
  return etag !== null && request.headers.get('if-none-match') === etag
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

// Вариант картинки связанной папки, которого нет в кэше, делается заново; пока — оригинал, без кэша ответа.
const _moved = (location: string): Response =>
  new Response(null, {
    status: 307,
    headers: { location, 'cache-control': 'no-store' },
  });

/**
 * `/media/<путь>`: файл медиатеки с ETag; с `?v=<хэш>` — навсегда в кэше браузера. Тело — файл из кэша
 * на диске, без него — куски прямо из базы; файл связанной папки — с её диска.
 */
export var defineMediaHandler =
  (media: MediaService) =>
  (request: Request): Promise<Response> =>
    ((url) =>
      ((path) =>
        ((file) =>
          file === null
            ? Promise.resolve(
                ((location) =>
                  location === null ? _notFound() : _moved(location))(
                  path === null
                    ? null
                    : attempt(
                        () => media.files.revive(path),
                        () => null
                      )
                )
              )
            : _answer(request, url, file))(
          path === null
            ? null
            : attempt(
                () => media.files.read(path),
                () => null
              )
        ))(
        attempt(
          () => decodeURIComponent(url.pathname.slice(MEDIA_PREFIX.length)),
          () => null
        )
      ))(new URL(request.url));

/**
 * Исходные адреса файлов связанных папок с правом `serveOriginal`: `/assets/images/4a_(5).jpg` — тот же
 * файл, что `/media/assets/images/4a-5.jpg`, без переадресации. null — адрес не наш: дальше страницы и
 * правила. Попытка выйти из папки — 404 сразу.
 */
export var defineOriginalHandler =
  (media: MediaService) =>
  (request: Request): Promise<Response> | null =>
    request.method !== 'GET' && request.method !== 'HEAD'
      ? null
      : ((url) =>
          ((path) =>
            path === null
              ? null
              : ((claimed) =>
                  claimed.length === 0
                    ? null
                    : escapesFolder(path)
                      ? Promise.resolve(_notFound())
                      : ((file) => (file ? _answer(request, url, file) : null))(
                          attempt(
                            () => media.files.served(path.slice(1)),
                            () => null
                          )
                        ))(
                  media.links.serving().filter((_) => path.startsWith(`/${_}/`))
                ))(
            attempt(
              () => decodeURIComponent(url.pathname),
              () => null
            )
          ))(new URL(request.url));

// HTML папки-сайта — от администратора, как шаблоны (ADR 0068), и защищена так же, как страницы сайта: адрес
// уходит чужим сайтам только доменом, во фрейм страницу встраивает только сам сайт.
const _PAGE_POLICY = {
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "frame-ancestors 'self'",
};

// Сжимается текст до 1 МиБ: сжатое запоминается по ETag, крупное — отдаётся с диска как есть.
const _COMPRESSED_LIMIT = 1024 * 1024;

const _slash = (url: URL): Response =>
  new Response(null, {
    status: 301,
    headers: { location: `${url.pathname}/${url.search}` },
  });

// Ответ файлом папки-сайта: ETag — размер и время изменения (хэш не считаем: файл ищется на каждый запрос);
// файл сборки с хэшем — навсегда, остальное — со сверкой; текст — br/gzip, остальное — с Range.
const _staticFile = (
  request: Request,
  file: StaticFile,
  compression: CompressionCache
): Promise<Response> => {
  const etag = `"${file.size.toString(36)}-${file.mtime.toString(36)}"`;
  const text = compressible(file.contentType);
  const encoding =
    text && file.size > 0 && file.size <= _COMPRESSED_LIMIT
      ? negotiate(request.headers.get('accept-encoding'))
      : null;
  const headers = {
    'content-type': file.contentType,
    'x-content-type-options': 'nosniff',
    'cache-control': file.status === 200 && file.immutable ? _YEAR : 'no-cache',
    ...(file.status === 200 ? { etag } : {}),
    ...(text ? { vary: 'accept-encoding' } : { 'accept-ranges': 'bytes' }),
    ...(file.contentType.startsWith('text/html') ? _PAGE_POLICY : {}),
    ...(file.contentType.startsWith('font/')
      ? { 'access-control-allow-origin': '*' }
      : {}),
  };
  const span =
    text || file.status !== 200 || request.method === 'HEAD'
      ? { start: 0, end: file.size - 1, partial: false }
      : _span(request.headers.get('range'), file.size);
  return file.status === 200 && request.headers.get('if-none-match') === etag
    ? Promise.resolve(new Response(null, { status: 304, headers }))
    : request.method === 'HEAD'
      ? Promise.resolve(
          new Response(null, {
            status: file.status,
            headers: { ...headers, 'content-length': String(file.size) },
          })
        )
      : span === 'none'
        ? Promise.resolve(
            new Response(null, {
              status: 416,
              headers: { ...headers, 'content-range': `bytes */${file.size}` },
            })
          )
        : encoding
          ? file
              .blob()
              .bytes()
              .then(
                (bytes) =>
                  new Response(
                    compression.compress(
                      `${etag}${file.path}`,
                      encoding,
                      bytes
                    ),
                    {
                      status: file.status,
                      headers: { ...headers, 'content-encoding': encoding },
                    }
                  )
              )
          : Promise.resolve(
              new Response(
                span.partial
                  ? file.blob().slice(span.start, span.end + 1)
                  : file.blob(),
                {
                  status: span.partial ? 206 : file.status,
                  headers: {
                    ...headers,
                    ...(span.partial
                      ? {
                          'content-range': `bytes ${span.start}-${span.end}/${file.size}`,
                        }
                      : {}),
                  },
                }
              )
            );
};

const _bareNotFound = (): Promise<Response> => Promise.resolve(_notFound());

/**
 * Папки-сайты (ADR 0068): `/<приставка>/…` — файл папки, адрес каталога — его `index.html`, каталог без `/` —
 * 301 на адрес со слэшем. Адреса под приставкой принадлежат папке: нет файла — её `404.html`, без неё —
 * страница 404 сайта (`notFound`), без страниц, правил и плагинов. Выход из папки — 404 сразу. Только GET и
 * HEAD; null — адрес не папки-сайта.
 */
export var defineStaticHandler = (
  media: MediaService,
  notFound: (request: Request) => Promise<Response> = _bareNotFound
) => {
  const compression = defineCompressionCache(16 * 1024 * 1024);
  return (request: Request): Promise<Response> | null =>
    request.method !== 'GET' && request.method !== 'HEAD'
      ? null
      : ((url) =>
          ((answer) =>
            answer === null
              ? null
              : answer.kind === 'missing'
                ? notFound(request)
                : answer.kind === 'slash'
                  ? Promise.resolve(_slash(url))
                  : answer.kind === 'refused'
                    ? Promise.resolve(_notFound())
                    : _staticFile(request, answer, compression))(
            attempt(
              () => media.statics.resolve(decodeURIComponent(url.pathname)),
              () => null
            )
          ))(new URL(request.url));
};
