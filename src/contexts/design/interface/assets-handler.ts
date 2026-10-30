type Assets = { readonly asset: (path: string) => Promise<string | null> };

// Пути с хэшем (модуль острова, версия рантайма) не меняются никогда.
const _HEADERS = {
  'content-type': 'text/javascript; charset=utf-8',
  'cache-control': 'public, max-age=31536000, immutable',
};

const _notFound = (): Response => new Response('Not Found', { status: 404 });

/** `/_cms/*`: модули островов и рантайм Svelte для браузера. */
export var defineAssetsHandler =
  (assets: Assets) =>
  (request: Request): Promise<Response> =>
    assets
      .asset(new URL(request.url).pathname)
      .then((code) =>
        code === null ? _notFound() : new Response(code, { headers: _HEADERS })
      );

export type { Assets };
