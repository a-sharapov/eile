import type { MediaFile, MediaPath } from './media.ts';

export type MediaRepository = {
  readonly meta: (path: MediaPath) => MediaFile | null;
  readonly data: (path: MediaPath) => Uint8Array | null;
  readonly list: () => MediaFile[];
  /** Файлы изображения `stem`: оригинал и варианты размеров. */
  readonly family: (stem: string) => MediaFile[];
  readonly save: (file: MediaFile, data: Uint8Array) => void;
  readonly remove: (path: MediaPath) => void;
  readonly describe: (path: MediaPath, alt: string) => void;
};
