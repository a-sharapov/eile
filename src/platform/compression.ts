import { brotliCompressSync, constants } from 'node:zlib';

export type Encoding = 'br' | 'gzip';

// Качество brotli 9 сжимает почти как 11, но в разы быстрее; результат всё равно запоминается.
const _STORED_QUALITY = 9;

// Тело — строка (страница) или байты (файл с диска: кодировку его текста не угадываем).
const _COMPRESS: Readonly<
  Record<
    Encoding,
    (body: string | Uint8Array<ArrayBuffer>, quality: number) => Uint8Array
  >
> = {
  br: (body, quality) =>
    brotliCompressSync(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: quality },
    }),
  gzip: (body) => Bun.gzipSync(body),
};

/** Разовое сжатие ответа, который не запоминается: brotli 4 быстрее gzip и сжимает лучше. */
export var compressBody = (encoding: Encoding, body: string): Uint8Array =>
  _COMPRESS[encoding](body, 4);

/** Сжатие того, что запоминается навсегда (статика, кэш страниц): дольше, но плотнее. */
export var compressStored = (encoding: Encoding, body: string): Uint8Array =>
  _COMPRESS[encoding](body, _STORED_QUALITY);

const _PREFERENCE: readonly Encoding[] = ['br', 'gzip'];

// Accept-Encoding: `br;q=1.0, gzip;q=0.8, *;q=0`; без веса — 1, вес 0 — запрет.
const _weights = (header: string): ReadonlyMap<string, number> =>
  new Map(
    header
      .split(',')
      .map((_) => _.split(';'))
      .map(({ 0: name = '', 1: weight }) => [
        name.trim(),
        weight === undefined ? 1 : Number(weight.trim().replace(/^q=/, '')),
      ])
  );

const _choose = (acceptEncoding: string): Encoding | null => {
  const weights = _weights(acceptEncoding);
  return (
    _PREFERENCE.find((_) => (weights.get(_) ?? weights.get('*') ?? 0) > 0) ??
    null
  );
};

// Браузеры шлют всего несколько вариантов заголовка: разбираем каждый один раз.
const _chosen = new Map<string, Encoding | null>();
const _CHOSEN_LIMIT = 64;

export var negotiate = (acceptEncoding: string | null): Encoding | null =>
  ((header) =>
    _chosen.has(header)
      ? _chosen.get(header)!
      : ((encoding) => (
          _chosen.size < _CHOSEN_LIMIT && _chosen.set(header, encoding),
          encoding
        ))(_choose(header)))(acceptEncoding ?? '');

/** Сжатые варианты по ETag: одна и та же страница сжимается один раз. Бюджет — в байтах. */
export var defineCompressionCache = (budget = 32 * 1024 * 1024) => {
  const entries = new Map<string, Uint8Array>();
  let used = 0;

  const evict = (): void => {
    const oldest = entries.entries().next();
    void (
      used > budget &&
      !oldest.done &&
      ((used -= oldest.value[1].byteLength),
      entries.delete(oldest.value[0]),
      evict())
    );
  };

  const store = (key: string, body: Uint8Array): Uint8Array => (
    entries.set(key, body), (used += body.byteLength), evict(), body
  );

  return {
    compress: (
      etag: string,
      encoding: Encoding,
      body: string | Uint8Array<ArrayBuffer>
    ): Uint8Array =>
      entries.get(`${encoding}${etag}`) ??
      store(`${encoding}${etag}`, _COMPRESS[encoding](body, _STORED_QUALITY)),
  };
};

export type CompressionCache = ReturnType<typeof defineCompressionCache>;
