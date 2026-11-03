// BLOB в одну строку SQLite при записи копирует дважды (привязка и сборка записи), при чтении поднимает
// целиком; кусками по 1 МиБ — копии в размер куска (ADR 0043).

/** Кусок хранения большого BLOB — 1 МиБ. */
export var BLOB_CHUNK = 1024 * 1024;

/** Номера кусков содержимого размера `size`. */
export var chunkNumbers = (size: number): number[] =>
  Array.from({ length: Math.ceil(size / BLOB_CHUNK) }, (_, n) => n);

/** Содержимое кусками — окна без копий. */
export var chunksOf = (bytes: Uint8Array): Uint8Array[] =>
  chunkNumbers(bytes.byteLength).map((n) =>
    bytes.subarray(n * BLOB_CHUNK, (n + 1) * BLOB_CHUNK)
  );

/** Номера первого и последнего куска, где лежат `length` байт с `start`. */
export var chunkSpan = (
  start: number,
  length: number
): readonly [number, number] => [
  Math.floor(start / BLOB_CHUNK),
  Math.floor((start + Math.max(1, length) - 1) / BLOB_CHUNK),
];

/** `length` байт с `start` из кусков `rows`, начиная с куска `chunkSpan(start)[0]`; один кусок — без копии. */
export var joinChunks = (
  rows: readonly Uint8Array[],
  start: number,
  length: number
): Uint8Array =>
  (rows.length === 1
    ? rows[0]!
    : Bun.concatArrayBuffers([...rows], Infinity, true)
  ).subarray(start % BLOB_CHUNK, (start % BLOB_CHUNK) + length);
