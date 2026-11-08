import type { ImageSize } from './image-size.ts';
import type { MediaLink } from './linked.ts';
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
  /** Файл в базе — кусками; у файла связанной папки и его варианта кусков нет, только строка. */
  readonly save: (file: MediaFile, content: UploadContent) => void;
  readonly remove: (path: MediaPath) => void;
  readonly describe: (path: MediaPath, alt: string) => void;
  /** Всё или ничего: исключение внутри `run` откатывает каждую запись. */
  readonly transaction: <T>(run: () => T) => T;
  /** Файл связанной папки по пути на диске от её корня. */
  readonly original: (prefix: string, file: string) => MediaFile | null;
  /** Файлы связанной папки со временем изменения на диске, каким его видела прошлая сверка. */
  readonly linked: (prefix: string) => LinkedRow[];
  /** Время изменения файла связанной папки при сверке, целые мс; null — не файл папки. */
  readonly mtime: (path: MediaPath) => number | null;
  /** Строка файла связанной папки — без кусков; описание остаётся то, что в строке. */
  readonly place: (file: MediaFile, mtime: number) => void;
  /** Варианты размеров картинок связанных папок: их байты — в кэше медиатеки. */
  readonly derived: () => MediaFile[];
  readonly links: {
    readonly list: () => MediaLink[];
    readonly get: (prefix: string) => MediaLink | null;
    readonly save: (link: MediaLink) => void;
    readonly remove: (prefix: string) => void;
    /** Сколько файлов и байтов у каждой папки — без вариантов. */
    readonly totals: () => ReadonlyMap<string, LinkTotals>;
  };
};

/** Строка файла связанной папки для сверки: размер и время изменения файла при прошлой сверке. */
export type LinkedRow = MediaFile & { readonly mtime: number | null };

export type LinkTotals = { readonly files: number; readonly bytes: number };

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
  /** Кэш на диске есть и сейчас пишется: только в нём живут варианты картинок связанных папок. */
  readonly writable: () => boolean;
  /** Готовый файл кэша этой версии — путь, без выгрузки; null — его нет. */
  readonly stored: (file: MediaFile) => string | null;
  /** Положить байты версии в кэш (вариант картинки связанной папки); false — кэша нет или он не пишется. */
  readonly put: (file: MediaFile, content: UploadContent) => boolean;
};

/** Файл связанной папки, найденный на диске: настоящий путь (внутри папки), размер и время изменения. */
export type DiskFile = {
  readonly path: string;
  readonly size: number;
  /** Время изменения, целые миллисекунды. */
  readonly mtime: number;
};

/** Что лежит по пути внутри папки: файл (настоящий путь внутри неё) или каталог. */
export type DiskEntry =
  | (DiskFile & { readonly kind: 'file' })
  | { readonly kind: 'folder' };

/** Файл папки при обходе: путь от корня через «/», размер и время изменения. */
export type ScannedFile = {
  readonly file: string;
  readonly size: number;
  readonly mtime: number;
};

/** Обход связанной папки: файлы и символьные ссылки, которые ведут за её пределы (их нет в `files`). */
export type FolderScan = {
  readonly files: readonly ScannedFile[];
  readonly escaped: readonly string[];
};

/** Содержимое файла с диска окнами; закрыть после чтения. */
export type OpenedFile = UploadContent & { readonly close: () => void };

/** Диск связанных папок: путь к папке от каталога базы, обход, файл по пути — не выходя за пределы папки. */
export type LinkedDisk = {
  /** Абсолютный путь к папке по записанному: относительный — от каталога базы. */
  readonly absolute: (root: string) => string;
  /** Как записать путь к папке: от каталога базы, если папка внутри него, иначе абсолютный. */
  readonly stored: (dir: string) => string;
  /** Обход без скрытого и следов архиваторов; null — папки нет. */
  readonly scan: (dir: string) => FolderScan | null;
  /** Файл папки по пути от корня; null — нет, не файл или настоящий путь выходит за пределы папки. */
  readonly locate: (dir: string, file: string) => DiskFile | null;
  /** Файл или каталог по пути от корня (`''` — сам корень); null — нет или настоящий путь вне папки. */
  readonly entry: (dir: string, file: string) => DiskEntry | null;
  readonly exists: (dir: string) => boolean;
  readonly open: (path: string) => OpenedFile;
  /** Файл для ответа: Bun отдаёт его через sendfile, не читая в память. */
  readonly blob: (path: string) => Blob;
};
