import type { ImageSize } from './image-size.ts';
import type { MediaFile, MediaPath } from './media.ts';
import type { Variant } from './variants.ts';

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
  /** Всё или ничего: исключение внутри `run` откатывает каждую запись. */
  readonly transaction: <T>(run: () => T) => T;
};

/** Оригинал этой версии ждёт своих вариантов размеров. */
export type VariantJob = {
  readonly path: MediaPath;
  readonly hash: string;
  /** Сколько раз задание брали, вместе с этим. */
  readonly attempts: number;
};

/** Очередь вариантов в базе: задание переживает падение процесса и перезапуск. */
export type VariantQueue = {
  /** Поставить оригинал в очередь; новая версия файла заменяет задание прежней. */
  readonly add: (path: MediaPath, hash: string) => void;
  /** Самое старое задание; попытка засчитывается сразу, так что падение посреди задания — тоже попытка. */
  readonly take: () => VariantJob | null;
  /** Убрать задание этой версии; задание новой версии остаётся. */
  readonly done: (path: MediaPath, hash: string) => void;
  readonly size: () => number;
};

/**
 * Уменьшенные копии картинки в WebP — по варианту на элемент `variants`. `source` — размер, по которому
 * составлен план: картинка другого размера — отказ, а не искажённые копии.
 */
export type ImageResizer = (
  data: Uint8Array,
  source: ImageSize,
  variants: readonly Variant[]
) => Promise<readonly Uint8Array[]>;

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
