import type { Localized } from '../../../shared/kernel/manager-language.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { Report } from '../../../shared/kernel/report.ts';
import { imageSize, imageTraits } from '../domain/image-size.ts';
import type { MediaFile, MediaPath } from '../domain/media.ts';
import type {
  ImageResizer,
  MediaRepository,
  UploadContent,
  VariantJob,
  VariantQueue,
} from '../domain/ports.ts';
import {
  MAX_DECODED_PIXELS,
  planVariants,
  type SkipReason,
  type Variant,
  type VariantPlan,
} from '../domain/variants.ts';

type VariantUpload = {
  readonly path: string;
  readonly data: Uint8Array | UploadContent;
  readonly width: number;
  readonly height: number;
};

// Падение процесса посреди задания (OOM, kill) засчитывается попыткой: после трёх картинку оставляем без
// вариантов, иначе сервер падал бы на ней при каждом запуске.
const _MAX_ATTEMPTS = 3;

const _TITLE: Localized = {
  en: 'Size variants of an image were not made',
  de: 'Größenvarianten eines Bildes wurden nicht erstellt',
  ru: 'Варианты размеров картинки не сделаны',
};

const _megapixels = (pixels: number): string =>
  (Math.round(pixels / 100_000) / 10).toString();

// Почему картинка осталась без вариантов — владельцу сайта; маленькая и анимированная — не сбой.
const _SKIPPED: Readonly<
  Record<
    SkipReason,
    ((path: string, pixels: number, max: number) => Localized) | null
  >
> = {
  too_large: (path, pixels, max) => ({
    en: `${path}: ${_megapixels(pixels)} megapixels to decode, at most ${_megapixels(max)}. The site shows the original; upload a smaller copy under the same path to get variants.`,
    de: `${path}: ${_megapixels(pixels)} Megapixel zum Dekodieren, höchstens ${_megapixels(max)}. Die Website zeigt das Original; eine kleinere Kopie unter demselben Pfad bekommt Varianten.`,
    ru: `${path}: ${_megapixels(pixels)} Мп при декодировании, можно не больше ${_megapixels(max)}. Сайт показывает оригинал; уменьшенная копия под тем же путём получит варианты.`,
  }),
  unreadable: (path) => ({
    en: `${path}: the file is not a JPEG, PNG or WebP image that can be read.`,
    de: `${path}: Die Datei ist kein lesbares JPEG-, PNG- oder WebP-Bild.`,
    ru: `${path}: файл — не читаемая картинка JPEG, PNG или WebP.`,
  }),
  animated: null,
  small: null,
};

const _crashed = (path: string): Localized => ({
  en: `${path}: the server stopped ${_MAX_ATTEMPTS} times while making them.`,
  de: `${path}: Der Server wurde dabei ${_MAX_ATTEMPTS}-mal beendet.`,
  ru: `${path}: сервер ${_MAX_ATTEMPTS} раза останавливался, делая их.`,
});

/**
 * Очередь вариантов размеров: задания по одному, работа — вне потока JS (Bun.Image). Варианты пишутся,
 * только если оригинал той же версии на месте и своих вариантов к нему за это время никто не загрузил.
 */
export var defineVariantJobs = ({
  files,
  queue,
  resize,
  report,
  maxPixels = MAX_DECODED_PIXELS,
  variantsOf,
  store,
}: {
  files: MediaRepository;
  queue: VariantQueue;
  resize: ImageResizer;
  report: Report;
  maxPixels?: number;
  variantsOf: (path: MediaPath) => MediaFile[];
  /** Записать то, что вернёт `collect`, одной транзакцией с ним. */
  store: (collect: () => readonly VariantUpload[]) => MediaFile[];
}) => {
  const tell = (job: VariantJob, detail: Localized): void =>
    report({
      kind: 'media.variants_skipped',
      severity: 'warning',
      title: _TITLE,
      detail,
      key: `media.variants_skipped:${job.path}`,
    });

  // Задание в силе: оригинал той же версии на месте, вариантов у него нет.
  const current = (job: VariantJob): MediaFile | null =>
    ((file) =>
      file !== null &&
      file.hash === job.hash &&
      variantsOf(file.path).length === 0
        ? file
        : null)(files.meta(job.path));

  const finish = (job: VariantJob): void => queue.done(job.path, job.hash);

  // Остановленный разбор (пересборка контекстов, остановка сервера) ничего не пишет: задание остаётся в
  // очереди, его доделает новый, а события дойдут до нынешних кэшей страниц.
  let halted = false;

  const commit = (
    job: VariantJob,
    variants: readonly Variant[],
    made: readonly Uint8Array[]
  ): number =>
    halted
      ? 0
      : store(() => {
          const live = current(job) !== null;
          finish(job);
          return live
            ? variants.map((_, k) => ({
                path: _.path,
                data: made[k]!,
                width: _.width,
                height: _.height,
              }))
            : [];
        }).length;

  const skip = (job: VariantJob, reason: SkipReason, pixels = 0): number => (
    finish(job),
    void ((said) => said && tell(job, said(job.path, pixels, maxPixels)))(
      _SKIPPED[reason]
    ),
    0
  );

  const failed = (job: VariantJob, error: unknown): number => (
    finish(job),
    tell(
      job,
      ((message) => ({ en: message, de: message, ru: message }))(
        `${job.path}: ${error instanceof Error ? error.message : String(error)}`
      )
    ),
    0
  );

  const act = (
    job: VariantJob,
    data: Uint8Array,
    plan: VariantPlan
  ): number | Promise<number> =>
    plan.kind === 'skip'
      ? skip(job, plan.reason, plan.pixels)
      : resize(data, plan.source, plan.variants).then((made) =>
          commit(job, plan.variants, made)
        );

  // План — по заголовку из самих байтов, а не по размерам из базы: их мог прислать клиент.
  const make = (job: VariantJob, file: MediaFile): Promise<number> =>
    Promise.resolve(file)
      .then(
        pipe(
          (_: MediaFile) => files.chunk(_.path, 0, _.size) ?? new Uint8Array(0),
          (data) =>
            act(
              job,
              data,
              planVariants(
                file.path,
                imageSize(data),
                imageTraits(data),
                maxPixels
              )
            )
        )
      )
      .then(undefined, (error) => failed(job, error));

  const work = (job: VariantJob): Promise<number> =>
    ((file) =>
      file === null
        ? Promise.resolve((finish(job), 0))
        : job.attempts > _MAX_ATTEMPTS
          ? Promise.resolve((finish(job), tell(job, _crashed(job.path)), 0))
          : make(job, file))(current(job));

  const drain = (made: number): Promise<number> =>
    ((job) =>
      job === null
        ? Promise.resolve(made)
        : work(job).then((_) => drain(made + _)))(halted ? null : queue.take());

  // Один разбор за другим: вызов во время разбора встаёт в очередь за ним и подхватит новые задания.
  let tail: Promise<number> = Promise.resolve(0);

  return {
    /** Сделать варианты всех ждущих картинок, по одной; ответ — сколько вариантов записано. */
    run: (): Promise<number> =>
      (tail = tail.then(
        () => drain(0),
        () => drain(0)
      )),
    /** Сколько картинок ждут вариантов. */
    pending: (): number => queue.size(),
    /** Больше не брать заданий и не писать начатые. */
    halt: (): void => void (halted = true),
  };
};
