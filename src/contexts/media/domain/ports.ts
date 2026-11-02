import type { MediaFile, MediaPath } from './media.ts';

/** Содержимое файла и хэш из той же строки базы: по хэшу называется файл кэша. */
export type MediaContent = {
  readonly hash: string;
  readonly data: Uint8Array;
};

export type MediaRepository = {
  readonly meta: (path: MediaPath) => MediaFile | null;
  readonly content: (path: MediaPath) => MediaContent | null;
  /** `length` байт с `start` (с нуля); у конца файла — меньше; null — файла нет. */
  readonly chunk: (
    path: MediaPath,
    start: number,
    length: number
  ) => Uint8Array | null;
  readonly list: () => MediaFile[];
  /** Файлы изображения `stem`: оригинал и варианты размеров. */
  readonly family: (stem: string) => MediaFile[];
  readonly save: (file: MediaFile, data: Uint8Array) => void;
  readonly remove: (path: MediaPath) => void;
  readonly describe: (path: MediaPath, alt: string) => void;
};

/**
 * Кэш медиатеки: файлы из базы на диске, чтобы отдавать их без копии в памяти. Источник — база;
 * кэш можно стереть целиком, он наберётся заново.
 */
export type MediaCache = {
  /**
   * Файл кэша этой версии; при промахе он сначала выносится из базы — один раз на все
   * одновременные запросы. null — кэша нет или он не пишется: отдавать из базы.
   */
  readonly local: (
    file: MediaFile,
    content: () => MediaContent | null
  ) => Promise<Blob | null>;
  /** Файл заменили или удалили: остальные версии `path`, кроме `keep`, — с диска. */
  readonly forget: (path: MediaPath, keep: string | null) => void;
  /** Файлы кэша, которых нет среди `live`, — с диска; ответ — сколько удалено. */
  readonly sweep: (live: readonly MediaFile[]) => number;
};
