import {
  compressStored,
  type Encoding,
  negotiate,
} from '../../../platform/compression.ts';

type Assets = { readonly asset: (path: string) => Promise<string | null> };

// Пути с хэшем (модуль острова, версия рантайма) не меняются никогда.
const _HEADERS = {
  'content-type': 'text/javascript; charset=utf-8',
  'cache-control': 'public, max-age=31536000, immutable',
  vary: 'accept-encoding',
};

// Рантайм Svelte — больше 100 КБ: без сжатия он тяжелее всей страницы.
const _PACKED_LIMIT = 512;

const _notFound = (): Response => new Response('Not Found', { status: 404 });

/** `/_cms/*`: модули островов и рантайм Svelte для браузера, сжатые br или gzip. */
export var defineAssetsHandler = (assets: Assets) => {
  // Содержимое пути не меняется, поэтому сжатая копия считается один раз.
  const packed = new Map<string, Uint8Array>();
  const pack = (path: string, encoding: Encoding, code: string): Uint8Array =>
    ((key) =>
      packed.get(key) ??
      ((body) => (packed.size < _PACKED_LIMIT && packed.set(key, body), body))(
        compressStored(encoding, code)
      ))(`${encoding} ${path}`);

  return (request: Request): Promise<Response> =>
    ((path, encoding) =>
      assets.asset(path).then((code) =>
        code === null
          ? _notFound()
          : encoding
            ? new Response(pack(path, encoding, code), {
                headers: { ..._HEADERS, 'content-encoding': encoding },
              })
            : new Response(code, { headers: _HEADERS })
      ))(
      new URL(request.url).pathname,
      negotiate(request.headers.get('accept-encoding'))
    );
};

export type { Assets };
