import { basename, resolve } from 'node:path';

/** Файлы рантайма Svelte для браузера: в бинарнике их кладёт входной файл сборки. */
export var CLIENT_RUNTIME_KEY = '__cmsClientRuntime';

export var ASSETS_PREFIX = '/_cms';

const _ENTRIES = resolve(import.meta.dir, 'client-runtime');

export type ClientRuntime = {
  /** Версия — хэш файлов: URL рантайма меняется вместе с ним и кэшируется навсегда. */
  readonly version: string;
  readonly files: Readonly<Record<string, string>>;
  readonly url: (file: 'svelte.js' | 'internal-client.js') => string;
};

// splitting обязателен: svelte и svelte/internal/client делят одно состояние в общем чанке.
export var buildClientRuntime = (): Promise<Record<string, string>> =>
  Bun.build({
    entrypoints: [`${_ENTRIES}/internal-client.ts`, `${_ENTRIES}/svelte.ts`],
    target: 'browser',
    splitting: true,
    minify: true,
    naming: { entry: '[name].js', chunk: '[name]-[hash].js' },
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then((result) =>
    result.success
      ? Promise.all(
          result.outputs.map((_) =>
            _.text().then((text) => [basename(_.path), text] as const)
          )
        ).then(Object.fromEntries)
      : Promise.reject(
          new AggregateError(result.logs, 'Client runtime build failed')
        )
  );

const _embedded = (): Record<string, string> | undefined =>
  (globalThis as Record<string, unknown>)[CLIENT_RUNTIME_KEY] as
    | Record<string, string>
    | undefined;

const _runtime = (files: Record<string, string>): ClientRuntime => {
  const version = Bun.hash(JSON.stringify(files)).toString(36);
  return {
    version,
    files,
    url: (file) => `${ASSETS_PREFIX}/runtime/${version}/${file}`,
  };
};

/** Рантайм собирается один раз при первом острове; в бинарнике он уже собран. */
export var defineClientRuntime = () => {
  let pending: Promise<ClientRuntime> | null = null;
  return (): Promise<ClientRuntime> =>
    (pending ??= Promise.resolve(_embedded())
      .then((_) => _ ?? buildClientRuntime())
      .then(_runtime));
};
