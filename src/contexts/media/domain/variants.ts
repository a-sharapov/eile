import type { ImageSize, ImageTraits } from './image-size.ts';
import { type MediaFile, type MediaPath, variantWidth } from './media.ts';

// Варианты размеров делает сервер (ADR 0046). Имена, ширины, формат и качество — те же, что давал браузер
// менеджера: `photo@960.webp`, только ширины меньше оригинала, WebP с качеством 0,82.

/** Ширины вариантов: телефон, ноутбук, большой экран. */
export var VARIANT_WIDTHS: readonly number[] = [480, 960, 1920];

export var VARIANT_QUALITY = 82;

/**
 * Пикселей в памяти при декодировании — не больше 24 Мп, это кадр 6000×4000: около 96 МБ RGBA, пик задания
 * около 170 МБ. Больше на VPS с 512 МБ не уместить рядом с сайтом.
 */
export var MAX_DECODED_PIXELS = 24_000_000;

const _RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type Variant = {
  readonly path: MediaPath;
  readonly width: number;
  readonly height: number;
};

export type SkipReason = 'unreadable' | 'animated' | 'small' | 'too_large';

export type VariantPlan =
  | {
      readonly kind: 'make';
      /** Размер, по которому составлен план. */
      readonly source: ImageSize;
      readonly variants: readonly Variant[];
    }
  | {
      readonly kind: 'skip';
      readonly reason: SkipReason;
      /** Пикселей при декодировании — у `too_large`. */
      readonly pixels?: number;
    };

/** `img/photo.jpg` → `img/photo@960.webp`. */
export var variantPath = (path: MediaPath, width: number): MediaPath =>
  `${path.slice(0, path.lastIndexOf('.'))}@${width}.webp` as MediaPath;

/** Оригинал JPEG, PNG или WebP: у него бывают варианты размеров. */
export var isResizable = (
  file: Pick<MediaFile, 'path' | 'contentType'>
): boolean =>
  _RESIZABLE.has(file.contentType) && variantWidth(file.path) === null;

/** Оригинал, которому положены варианты: шире самого маленького варианта. */
export var takesVariants = (
  file: Pick<MediaFile, 'path' | 'contentType' | 'width'>
): boolean => isResizable(file) && (file.width ?? 0) > VARIANT_WIDTHS[0]!;

/**
 * Другой оригинал JPEG, PNG или WebP с той же основой, что у `file`: варианты называются по основе
 * (`photo@960.webp`), и у двух таких картинок они были бы общими. null — основа свободна.
 */
export var stemOwner = (
  file: Pick<MediaFile, 'path' | 'contentType'>,
  family: readonly Pick<MediaFile, 'path' | 'contentType'>[]
): string | null =>
  (isResizable(file) &&
    family.find((_) => _.path !== file.path && isResizable(_))?.path) ||
  null;

// JPEG без прогрессии декодируется сразу уменьшенным в M/8, если вариант не больше половины кадра
// (libjpeg-turbo в Bun.Image). PNG и WebP — кадр целиком.
const _scale = (traits: ImageTraits, ratio: number): number =>
  traits.format === 'jpeg' && ratio <= 0.5 ? Math.ceil(ratio * 8) / 8 : 1;

/**
 * Сколько пикселей RGBA (4 байта) стоит декодирование под вариант ширины `width`. Прогрессивный JPEG держит
 * коэффициенты всего кадра — по 2 байта на отсчёт: при 4:4:4 это полтора кадра RGBA, при 4:2:0 — три четверти.
 */
export var decodedPixels = (
  size: ImageSize,
  traits: ImageTraits,
  width: number
): number =>
  traits.format === 'jpeg' && traits.progressive
    ? Math.ceil((size.width * size.height * traits.samples) / 2)
    : ((scale) =>
        Math.ceil(size.width * scale) * Math.ceil(size.height * scale))(
        _scale(traits, width / size.width)
      );

// Больше оригинала не растягиваем: ширины строго меньше, как делал браузер.
const _variants = (path: MediaPath, size: ImageSize): Variant[] =>
  VARIANT_WIDTHS.filter((_) => _ < size.width).map((width) => ({
    path: variantPath(path, width),
    width,
    height: Math.max(1, Math.round((size.height * width) / size.width)),
  }));

const _plan = (
  source: ImageSize,
  variants: readonly Variant[],
  pixels: number,
  maxPixels: number
): VariantPlan =>
  variants.length === 0
    ? { kind: 'skip', reason: 'small' }
    : pixels > maxPixels
      ? { kind: 'skip', reason: 'too_large', pixels }
      : { kind: 'make', source, variants };

/**
 * Какие варианты делать из картинки: размер — с учётом поворота EXIF, как её покажет браузер. Анимацию не
 * трогаем: вариант стал бы стоп-кадром.
 */
export var planVariants = (
  path: MediaPath,
  size: ImageSize | null,
  traits: ImageTraits,
  maxPixels: number = MAX_DECODED_PIXELS
): VariantPlan =>
  size === null || traits.format === null || traits.format === 'gif'
    ? { kind: 'skip', reason: 'unreadable' }
    : traits.animated
      ? { kind: 'skip', reason: 'animated' }
      : ((variants) =>
          _plan(
            size,
            variants,
            variants.length === 0
              ? 0
              : decodedPixels(size, traits, variants.at(-1)!.width),
            maxPixels
          ))(_variants(path, size));
