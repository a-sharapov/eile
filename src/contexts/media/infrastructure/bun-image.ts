import { fail } from '../../../shared/kernel/errors.ts';
import type { ImageSize } from '../domain/image-size.ts';
import type { ImageResizer } from '../domain/ports.ts';
import { VARIANT_QUALITY, type Variant } from '../domain/variants.ts';

// Поворот EXIF Bun.Image применяет сам (autoOrient), до уменьшения: размеры в плане — уже повёрнутые.
const _check = (data: Uint8Array, source: ImageSize): Promise<Uint8Array> =>
  new Bun.Image(data, { autoOrient: true })
    .metadata()
    .then((_) =>
      _.width === source.width && _.height === source.height
        ? data
        : fail(
            'media.variant_size_mismatch',
            `Decoder sees ${_.width}x${_.height}, the header says ${source.width}x${source.height}`
          )
    );

// Каждый вариант — из исходника, а не из предыдущего варианта: так делал и браузер. Высота задана явно, с
// тем же округлением, что в плане, — имя и размеры варианта в базе совпадают с файлом.
const _webp = (
  data: Uint8Array,
  variants: readonly Variant[]
): Promise<Uint8Array[]> =>
  variants.reduce<Promise<Uint8Array[]>>(
    (done, variant) =>
      done.then((made) =>
        new Bun.Image(data, { autoOrient: true })
          .resize(variant.width, variant.height, { fit: 'fill' })
          .webp({ quality: VARIANT_QUALITY })
          .bytes()
          .then((_) => [...made, _])
      ),
    Promise.resolve([])
  );

/**
 * Варианты через Bun.Image — по одной картинке на процесс: декодированный кадр 6000×4000 занимает около
 * 96 МБ. Один на процесс, как кэш медиатеки: пересборка контекстов не запускает второе декодирование.
 */
export var defineImageResizer = (): ImageResizer => {
  let tail: Promise<unknown> = Promise.resolve();
  return (data, source, variants) => {
    // Перед декодированием — полная сборка мусора (единицы мс): копии файла от загрузки и прошлого задания
    // не должны лежать в памяти рядом с кадром.
    const made = tail.then(() =>
      _check(data, source).then((_) => (Bun.gc(true), _webp(_, variants)))
    );
    tail = made.then(
      () => undefined,
      () => undefined
    );
    return made;
  };
};
