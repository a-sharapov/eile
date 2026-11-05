import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Glob } from 'bun';
import {
  compressStored,
  type Encoding,
  negotiate,
} from '../../../platform/compression.ts';
import { posixPath } from '../../../platform/paths.ts';

export type ManagerAssets = {
  /** Файл SPA по пути внутри `/manager`; неизвестный путь — index.html, маршрутизирует сама SPA. */
  readonly serve: (
    path: string,
    acceptEncoding?: string | null,
    /** Страница для окна полосы правки: фрейм разрешён, но только своему сайту. */
    framed?: boolean
  ) => Response | Promise<Response>;
};

/** Таблица «путь SPA → файл»: в бинарнике её кладёт входной файл сборки (scripts/build.ts). */
export var EMBEDDED_KEY = '__cmsManagerFiles';

const _BUILD_DIR = resolve(import.meta.dir, '../../../../manager/build');

const _IMMUTABLE = 'public, max-age=31536000, immutable';

const _notBuilt = (): Response =>
  new Response('Manager UI is not built: run `bun run build:manager`', {
    status: 503,
  });

// Файлы с хэшем в имени (`_app/immutable/`) не меняются никогда; остальное — сверяется.
const _headers = (path: string) => ({
  'cache-control': path.includes('/immutable/') ? _IMMUTABLE : 'no-cache',
  'x-content-type-options': 'nosniff',
});

// Встроенный скрипт SvelteKit (запуск SPA) разрешён по хэшу: другой встроенный скрипт не выполнится.
const _scriptHashes = (html: string): string[] =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ({ 1: body }) =>
      `'sha256-${new Bun.CryptoHasher('sha256').update(body!).digest('base64')}'`
  );

/**
 * Заголовки страницы менеджера: CSP без чужих скриптов, без встраивания во фрейм, без утечки адреса.
 * `framed` — для окна полосы правки: встраивать можно, но только своему же сайту.
 */
export var pageSecurity = (
  html: string,
  framed = false
): Record<string, string> => ({
  'content-security-policy': [
    "default-src 'self'",
    `script-src 'self' ${_scriptHashes(html).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${framed ? "'self'" : "'none'"}`,
  ].join('; '),
  'x-frame-options': framed ? 'SAMEORIGIN' : 'DENY',
  'referrer-policy': 'same-origin',
});

// Текст сжимается (JS менеджера — около мегабайта), картинки и шрифты уже сжаты сами.
const _COMPRESSIBLE = /\.(?:js|css|html|svg|json|txt)$/;

export var defineManagerAssets = (
  table: Readonly<Record<string, string>>
): ManagerAssets => {
  // Файлы SPA не меняются, пока работает бинарник: каждый сжимается один раз на кодировку, заголовки
  // страницы считаются один раз.
  const compressed = new Map<string, Promise<Uint8Array>>();
  const policies = new Map<string, Promise<Record<string, string>>>();

  const security = (path: string, source: string, framed: boolean) =>
    path.endsWith('.html')
      ? (policies.get(`${framed}:${source}`) ??
        ((policy) => (policies.set(`${framed}:${source}`, policy), policy))(
          Bun.file(source)
            .text()
            .then((_) => pageSecurity(_, framed))
        ))
      : Promise.resolve({});

  const packed = (source: string, encoding: Encoding): Promise<Uint8Array> =>
    compressed.get(`${encoding}:${source}`) ??
    ((body) => (compressed.set(`${encoding}:${source}`, body), body))(
      Bun.file(source)
        .text()
        .then((_) => compressStored(encoding, _))
    );

  return {
    serve: (path, acceptEncoding = null, framed = false) => {
      const known = table[path] === undefined ? '/index.html' : path;
      const source = table[known];
      const encoding = _COMPRESSIBLE.test(known)
        ? negotiate(acceptEncoding)
        : null;
      return source === undefined
        ? _notBuilt()
        : security(known, source, framed).then((policy) =>
            encoding === null
              ? new Response(Bun.file(source), {
                  headers: { ..._headers(known), ...policy },
                })
              : packed(source, encoding).then(
                  (body) =>
                    new Response(body, {
                      headers: {
                        ..._headers(known),
                        ...policy,
                        'content-type': Bun.file(source).type,
                        'content-encoding': encoding,
                        vary: 'accept-encoding',
                      },
                    })
                )
          );
    },
  };
};

export var directoryTable = (directory: string): Record<string, string> =>
  existsSync(directory)
    ? Object.fromEntries(
        Array.from(new Glob('**/*').scanSync(directory)).map((_) => [
          `/${posixPath(_)}`,
          join(directory, _),
        ])
      )
    : {};

const _embedded = (): Record<string, string> | undefined =>
  (globalThis as Record<string, unknown>)[EMBEDDED_KEY] as
    | Record<string, string>
    | undefined;

/** SPA менеджера: своя таблица файлов, иначе встроенная в бинарник, иначе `manager/build`. */
export var managerAssets = (
  table: Readonly<Record<string, string>> = _embedded() ??
    directoryTable(_BUILD_DIR)
): ManagerAssets => defineManagerAssets(table);
