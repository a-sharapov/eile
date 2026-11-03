import type { MediaFile, MediaPath } from './media.ts';

/** Кусок содержимого и хэш файла из того же запроса: по хэшу называется файл кэша. */
export type MediaPiece = {
  readonly hash: string;
  readonly data: Uint8Array;
};

/**
 * Содержимое загрузки, которое читается кусками — из памяти или из временного файла, где его в памяти
 * нет. Прочитанный кусок годится до следующего чтения.
 */
export type UploadContent = {
  readonly size: number;
  readonly read: (start: number, end: number) => Uint8Array;
};

export type MediaRepository = {
  readonly meta: (path: MediaPath) => MediaFile | null;
  /** Кусок хранения `n` (с нуля); null — файла или такого куска нет. */
  readonly piece: (path: MediaPath, n: number) => MediaPiece | null;
  /** `length` байт с `start` (с нуля); у конца файла — меньше; null — файла нет или `start` за концом. */
  readonly chunk: (
    path: MediaPath,
    start: number,
    length: number
  ) => Uint8Array | null;
  readonly list: () => MediaFile[];
  /** Файлы изображения `stem`: оригинал и варианты размеров. */
  readonly family: (stem: string) => MediaFile[];
  readonly save: (file: MediaFile, content: UploadContent) => void;
  readonly remove: (path: MediaPath) => void;
  readonly describe: (path: MediaPath, alt: string) => void;
};

/**
 * Кэш медиатеки: файлы из базы на диске, чтобы отдавать их без копии в памяти. Источник — база;
 * кэш можно стереть целиком, он наберётся заново.
 */
export type MediaCache = {
  /**
   * Файл кэша этой версии; при промахе он сначала выносится из базы по куску `piece(0)`, `piece(1)`… — один
   * раз на все одновременные запросы. null — кэша нет или он не пишется: отдавать из базы.
   */
  readonly local: (
    file: MediaFile,
    piece: (n: number) => MediaPiece | null
  ) => Promise<Blob | null>;
  /** Файл заменили или удалили: остальные версии `path`, кроме `keep`, — с диска. */
  readonly forget: (path: MediaPath, keep: string | null) => void;
  /** Файлы кэша, которых нет среди `live`, — с диска; ответ — сколько удалено. */
  readonly sweep: (live: readonly MediaFile[]) => number;
  /** Путь для тела загрузки рядом с кэшем, на диске; null — кэша нет или он не пишется. */
  readonly spool: () => string | null;
};
