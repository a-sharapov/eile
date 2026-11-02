import {
  compressStored,
  type Encoding,
  negotiate,
} from '../../../platform/compression.ts';
import type { ScriptFile } from '../infrastructure/site-scripts.ts';

type Scripts = { readonly file: (path: string) => ScriptFile | null };

// Адрес с хэшем не меняется никогда. nosniff: браузер не примет файл ни за что, кроме скрипта, — и не
// нарисует его как HTML с адреса сайта.
const _HEADERS = {
  'content-type': 'text/javascript; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'public, max-age=31536000, immutable',
  vary: 'accept-encoding',
};

const _METHODS = new Set(['GET', 'HEAD']);

const _encoder = new TextEncoder();

const _notFound = (): Response => new Response('Not Found', { status: 404 });

const _methodNotAllowed = (): Response =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: 'GET, HEAD' },
  });

/** `/_cms/scripts/<имя>.<хэш>.js`: скрипт сайта с ETag, сжатый br или gzip, если браузер умеет. */
export var defineScriptsHandler = (scripts: Scripts) => {
  // Сжатая копия — только текущей версии: по одной на скрипт и способ сжатия, прежняя вытесняется.
  const packed = new Map<
    string,
    { readonly hash: string; readonly body: Uint8Array }
  >();

  const bodyOf = (file: ScriptFile, encoding: Encoding | null): Uint8Array =>
    encoding === null
      ? _encoder.encode(file.source)
      : ((key) =>
          packed.get(key)?.hash === file.hash
            ? packed.get(key)!.body
            : ((body) => (packed.set(key, { hash: file.hash, body }), body))(
                compressStored(encoding, file.source)
              ))(`${encoding} ${file.name}`);

  const answer = (request: Request, file: ScriptFile): Response => {
    const encoding = negotiate(request.headers.get('accept-encoding'));
    // У сжатой копии свой ETag: это другие байты того же скрипта.
    const etag = `"${file.hash}${encoding ? `-${encoding}` : ''}"`;
    const headers = {
      ..._HEADERS,
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
          scripts.file(new URL(request.url).pathname)
        )
      : _methodNotAllowed();
};
