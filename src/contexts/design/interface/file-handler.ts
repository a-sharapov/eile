import {
  compressStored,
  type Encoding,
  negotiate,
} from '../../../platform/compression.ts';

/** Файл по адресу с хэшем: скрипт или стили сайта. */
export type HashedFile = {
  readonly name: string;
  readonly hash: string;
  readonly source: string;
  /** Спросили прежний хэш, а отдана текущая версия: такой ответ браузер навсегда не кэширует. */
  readonly stale?: boolean;
};

// Адрес с хэшем не меняется никогда. nosniff: браузер не примет файл ни за что, кроме объявленного типа,
// — и не нарисует его как HTML с адреса сайта.
const _HEADERS = {
  'x-content-type-options': 'nosniff',
  vary: 'accept-encoding',
};

const _FOREVER = 'public, max-age=31536000, immutable';

const _METHODS = new Set(['GET', 'HEAD']);

const _encoder = new TextEncoder();

const _notFound = (): Response => new Response('Not Found', { status: 404 });

const _methodNotAllowed = (): Response =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: 'GET, HEAD' },
  });

/**
 * `/_cms/scripts/<имя>.<хэш>.js`, `/_cms/styles/<имя>.<хэш>.css`: файл с ETag, сжатый br или gzip, если
 * браузер умеет.
 */
export var defineFileHandler = (
  contentType: string,
  lookup: (path: string) => HashedFile | null
) => {
  // Сжатая копия — только текущей версии: по одной на файл и способ сжатия, прежняя вытесняется.
  const packed = new Map<
    string,
    { readonly hash: string; readonly body: Uint8Array }
  >();

  const bodyOf = (file: HashedFile, encoding: Encoding | null): Uint8Array =>
    encoding === null
      ? _encoder.encode(file.source)
      : ((key) =>
          packed.get(key)?.hash === file.hash
            ? packed.get(key)!.body
            : ((body) => (packed.set(key, { hash: file.hash, body }), body))(
                compressStored(encoding, file.source)
              ))(`${encoding} ${file.name}`);

  const answer = (request: Request, file: HashedFile): Response => {
    const encoding = negotiate(request.headers.get('accept-encoding'));
    // У сжатой копии свой ETag: это другие байты того же файла.
    const etag = `"${file.hash}${encoding ? `-${encoding}` : ''}"`;
    const headers = {
      'content-type': contentType,
      ..._HEADERS,
      'cache-control': file.stale ? 'no-cache' : _FOREVER,
      etag,
      ...(encoding ? { 'content-encoding': encoding } : {}),
    };
    return request.headers.get('if-none-match') === etag
      ? new Response(null, { status: 304, headers })
      : ((body) =>
          new Response(request.method === 'HEAD' ? null : body, {
            headers: { ...headers, 'content-length': String(body.byteLength) },
          }))(bodyOf(file, encoding));
  };

  return (request: Request): Response =>
    _METHODS.has(request.method)
      ? ((file) => (file ? answer(request, file) : _notFound()))(
          lookup(new URL(request.url).pathname)
        )
      : _methodNotAllowed();
};
