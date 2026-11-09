import { attempt, fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { Report } from '../../../shared/kernel/report.ts';
import { imageSize } from '../domain/image-size.ts';
import {
  CACHE_ONLY,
  escapesFolder,
  inLinkedFolder,
  isDerived,
  isLinkedOriginal,
  type MediaLink,
} from '../domain/linked.ts';
import {
  checkSize,
  contentTypeOf,
  type MediaEvent,
  type MediaFile,
  type MediaPath,
  parseAlt,
  parseMediaPath,
  stemOf,
  variantWidth,
} from '../domain/media.ts';
import type {
  DiskFile,
  ImageResizer,
  LinkedDisk,
  MediaCache,
  MediaRepository,
  UploadContent,
  VariantQueue,
} from '../domain/ports.ts';
import {
  hiddenPart,
  immutable,
  indexOf,
  NOT_FOUND_FILE,
  staticType,
} from '../domain/static-site.ts';
import {
  isResizable,
  stemOwner,
  takesVariants,
  VARIANT_WIDTHS,
} from '../domain/variants.ts';
import { defineLinkedFolders } from './linked-folders.ts';
import { defineVariantJobs } from './variant-jobs.ts';

export type { UploadContent };

/** Файл медиатеки для отдачи: описание, байты из базы, с диска или из кэша. */
export type MediaRead = {
  readonly meta: MediaFile;
  /**
   * ETag и `?v=` годятся: байты те, что описаны в строке. Файл связанной папки, который изменили на диске после
   * сверки, отдаётся с настоящим размером, но без ETag и вечного кэша.
   */
  readonly fresh: boolean;
  readonly data: () => Uint8Array;
  /** Файл на диске для ответа; null — кэша нет, читать кусками из базы. */
  readonly local: () => Promise<Blob | null>;
  /** `length` байт с `start`, без всего файла в памяти. */
  readonly chunk: (start: number, length: number) => Uint8Array;
};

export type Upload = {
  readonly path: string;
  /** Байты в памяти или кусками — из временного файла загрузки. */
  readonly data: Uint8Array | UploadContent;
  readonly width?: number | null;
  readonly height?: number | null;
};

/** Изображение для `<img>`: исходник, варианты для srcset и размеры против сдвига вёрстки. */
export type ImageSet = {
  readonly src: string;
  readonly srcset: string;
  readonly width: number | null;
  readonly height: number | null;
  /** Описание из медиатеки — для `alt`, если компонент своего не передал. */
  readonly alt: string;
};

/** Файл папки-сайта для ответа: 200 — сам файл, 404 — её `404.html`. */
export type StaticFile = DiskFile & {
  readonly kind: 'file';
  readonly status: 200 | 404;
  readonly contentType: string;
  /** Файл сборки с хэшем в имени (`_astro/…`): кэш браузера навсегда. */
  readonly immutable: boolean;
  /** Байты для ответа: Bun отдаёт файл через sendfile. */
  readonly blob: () => Blob;
};

/**
 * Что отдать по адресу папки-сайта (ADR 0068): файл; `slash` — каталог без `/` в конце, 301 на адрес со
 * слэшем; `refused` — попытка выйти из папки, 404 сразу; `missing` — файла и своей 404 нет, дальше страницы.
 */
export type StaticAnswer =
  | StaticFile
  | { readonly kind: 'slash' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'missing' };

type Dimensions = {
  readonly width: number | null;
  readonly height: number | null;
};

// Не число, ноль и меньше — как будто размера не прислали: его прочтёт сервер.
const _dimension = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;

// Заголовок почти всегда в начале файла; JPEG с длинными EXIF, XMP и ICC перед кадром читается целиком.
const _HEAD = 256 * 1024;

const _sizeOf = (content: UploadContent): Dimensions | null =>
  imageSize(content.read(0, Math.min(_HEAD, content.size))) ??
  (content.size > _HEAD ? imageSize(content.read(0, content.size)) : null);

// Присланные размеры важнее; менеджер, агент и API их не шлют — тогда из заголовка файла.
const _measure = (
  upload: Upload,
  content: UploadContent,
  contentType: string
): Dimensions =>
  ((sent: Dimensions) =>
    (sent.width !== null && sent.height !== null) ||
    !contentType.startsWith('image/')
      ? sent
      : (_sizeOf(content) ?? sent))({
    width: _dimension(upload.width),
    height: _dimension(upload.height),
  });

/** Ширина и высота картинки по её байтам; не картинка — без размеров. */
export var measureImage = (
  content: UploadContent,
  contentType: string
): Dimensions =>
  contentType.startsWith('image/')
    ? (_sizeOf(content) ?? { width: null, height: null })
    : { width: null, height: null };

const _contentOf = (data: Uint8Array | UploadContent): UploadContent =>
  data instanceof Uint8Array
    ? { size: data.byteLength, read: (start, end) => data.subarray(start, end) }
    : data;

// Хэш — по окну в 1 МиБ: файл загрузки с диска не поднимается в память целиком.
const _WINDOW = 1024 * 1024;

/** Хэш содержимого, как у файла медиатеки: ETag, `?v=` и имя в кэше на диске. */
export var mediaHash = (content: UploadContent): string =>
  Array.from({ length: Math.ceil(content.size / _WINDOW) })
    .reduce<Bun.CryptoHasher>(
      (hasher, _, n) =>
        hasher.update(content.read(n * _WINDOW, (n + 1) * _WINDOW)),
      new Bun.CryptoHasher('sha256')
    )
    .digest('hex')
    .slice(0, 16);

export var mediaUrl = (file: MediaFile): string =>
  `/media/${file.path}?v=${file.hash}`;

/** Запись файла, разобранная до транзакции: что сохранить, какие варианты устарели, нужна ли очередь. */
type Prepared = {
  readonly file: MediaFile;
  readonly content: UploadContent;
  readonly stale: readonly MediaPath[];
  readonly queued: boolean;
};

const _stemTaken = (path: string, owner: string): never =>
  fail(
    'media.stem_taken',
    `${owner} already has the name of ${path} without the extension, and image sizes are named after it: give the new image another name or replace ${owner}`
  );

const _linkedFile = (path: string): never =>
  fail(
    'media.linked_file',
    `${path} lives in a linked folder on the server: change it there and run cms media link again`
  );

export var defineMediaService = ({
  files,
  queue,
  resize,
  cache,
  disk,
  bus,
  report,
  kick,
  maxPixels,
}: {
  files: MediaRepository;
  queue: VariantQueue;
  resize: ImageResizer;
  cache: MediaCache;
  disk: LinkedDisk;
  bus: EventBus;
  report: Report;
  /** В очереди вариантов новое задание: фон сервера разберёт её сразу, а не по расписанию. */
  kick: () => void;
  maxPixels?: number;
}) => {
  const event = (type: MediaEvent['type'], path: MediaPath): MediaEvent => ({
    type,
    path,
  });

  const variantsOf = (path: MediaPath): MediaFile[] =>
    files.family(stemOf(path)).filter((_) => variantWidth(_.path) !== null);

  // `link` — у варианта картинки связанной папки: строка без кусков, байты — в кэш медиатеки.
  const prepare = (upload: Upload, link?: string): Prepared => {
    const path = parseMediaPath(upload.path);
    const contentType = contentTypeOf(path);
    const content = _contentOf(upload.data);
    const previous = files.meta(path);
    void (
      previous &&
      inLinkedFolder(previous) &&
      link === undefined &&
      _linkedFile(path)
    );
    const file: MediaFile = {
      path,
      contentType,
      // Вариант связанной папки — из файла без предела размера, сам он маленький.
      size: link === undefined ? checkSize(content.size) : content.size,
      hash: mediaHash(content),
      ..._measure(upload, content, contentType),
      // Замена файла не стирает описание: картинка та же по смыслу, сменилось только содержимое.
      alt: previous?.alt ?? '',
      ...(link === undefined ? {} : { linked: { prefix: link, file: null } }),
    };
    // Новая картинка с основой другой картинки получила бы её варианты размеров — и показывала бы чужое.
    void (
      previous === null &&
      ((owner) => owner && _stemTaken(path, owner))(
        stemOwner(file, files.family(stemOf(path)))
      )
    );
    // Оригинал сменился: прежние варианты показывали бы старую картинку. Варианты, загруженные до первого
    // оригинала, остаются — их сделал тот, кто загружает.
    const stale =
      previous !== null && previous.hash !== file.hash && isResizable(file)
        ? variantsOf(path).map((_) => _.path)
        : [];
    return {
      file,
      content,
      stale,
      queued: takesVariants(file) && variantsOf(path).length === stale.length,
    };
  };

  // Внутри транзакции: файл, его устаревшие варианты и задание очереди меняются вместе. Байты варианта
  // связанной папки ложатся в кэш раньше строки: строка не укажет на файл, которого нет.
  const write = (_: Prepared): Prepared => (
    void (
      _.file.linked &&
      (cache.put(_.file, _.content) ||
        fail(
          'media.cache_unavailable',
          'The media cache on disk is not writable: variants of linked images live only there'
        ))
    ),
    _.stale.forEach(files.remove),
    files.save(_.file, _.content),
    void (_.queued && queue.add(_.file.path, _.file.hash)),
    _
  );

  const announce = (_: Prepared): MediaFile => (
    _.stale.forEach(
      (path) => void bus.publish(event('media.file_removed', path))
    ),
    bus.publish(event('media.file_saved', _.file.path)),
    void (_.queued && kick()),
    _.file
  );

  const save = (upload: Upload): MediaFile =>
    pipe(prepare, (_) => files.transaction(() => write(_)), announce)(upload);

  const linkOf = (file: MediaFile) =>
    file.linked ? files.links.get(file.linked.prefix) : null;

  // Файл связанной папки на диске; null — папки или файла нет, раз в процесс об этом пишет журнал.
  const missing = new Set<string>();
  const located = (file: MediaFile) =>
    ((link) =>
      ((found) => (
        void (
          found === null &&
          !missing.has(file.path) &&
          (missing.add(file.path),
          console.error(
            `Linked file ${file.path} is missing on disk (${link ? disk.absolute(link.root) : file.linked?.prefix}/${file.linked?.file}): it answers 404`
          ))
        ),
        found
      ))(
        link && file.linked?.file
          ? disk.locate(disk.absolute(link.root), file.linked.file)
          : null
      ))(linkOf(file));

  // Файл пропал между поиском и чтением — пустые байты, как у файла без кусков в базе.
  const fromDisk = (path: string, start: number, end: number): Uint8Array =>
    attempt(
      () =>
        ((opened) =>
          attempt(
            () => ((bytes) => (opened.close(), bytes))(opened.read(start, end)),
            () => (opened.close(), new Uint8Array(0))
          ))(disk.open(path)),
      () => new Uint8Array(0)
    );

  const stored = (meta: MediaFile): MediaRead => ({
    meta,
    fresh: true,
    data: () => files.chunk(meta.path, 0, meta.size) ?? new Uint8Array(0),
    local: () => cache.local(meta, (n) => files.piece(meta.path, n)),
    chunk: (start, length) =>
      files.chunk(meta.path, start, length) ?? new Uint8Array(0),
  });

  const onDisk = (
    meta: MediaFile,
    path: string,
    fresh: boolean,
    size: number
  ) =>
    ({
      meta: { ...meta, size },
      fresh,
      data: () => fromDisk(path, 0, size),
      local: () => Promise.resolve(disk.blob(path)),
      chunk: (start, length) => fromDisk(path, start, start + length),
    }) satisfies MediaRead;

  // Файл в базе; файл папки — с диска; вариант картинки папки — из кэша, пропал — null.
  const open = (meta: MediaFile): MediaRead | null =>
    isLinkedOriginal(meta)
      ? ((found) =>
          found &&
          onDisk(
            meta,
            found.path,
            found.size === meta.size && found.mtime === files.mtime(meta.path),
            found.size
          ))(located(meta))
      : isDerived(meta)
        ? ((path) =>
            path === null ? null : onDisk(meta, path, true, meta.size))(
            cache.stored(meta)
          )
        : stored(meta);

  const originalOf = (raw: string): MediaFile | null =>
    ((path) =>
      files.links
        .list()
        .filter((_) => path.startsWith(`${_.prefix}/`))
        .map((_) => files.original(_.prefix, path.slice(_.prefix.length + 1)))
        .find((_) => _ !== null) ?? null)(raw.replace(/^\/+/, ''));

  /**
   * Файл по пути медиатеки или по исходному пути файла связанной папки `<приставка>/<путь на диске>` — так
   * перенесённый текст и поля со старыми путями работают как есть. Путь под приставкой папки сначала ищется
   * как исходный: у `Photo.jpg` и `photo.jpg` одно имя медиатеки, а путь на диске точный.
   */
  const find = (raw: string): MediaFile | null =>
    originalOf(raw) ??
    (raw.includes('%')
      ? attempt(
          () => originalOf(decodeURIComponent(raw)),
          () => null
        )
      : null) ??
    attempt(
      () => files.meta(parseMediaPath(raw)),
      () => null
    );

  const servedMeta = (path: string): MediaFile | null =>
    files.links
      .list()
      .filter((_) => _.serveOriginal && path.startsWith(`${_.prefix}/`))
      .map((_) => files.original(_.prefix, path.slice(_.prefix.length + 1)))
      .find((_) => _ !== null) ?? null;

  // Папка-сайт: файл ищется на диске на каждый запрос, тем же поиском, что у связанной папки, — настоящий путь
  // должен лежать внутри её настоящего пути.
  const staticFile = (
    link: MediaLink,
    file: string,
    status: 200 | 404
  ): StaticFile | null =>
    ((entry, contentType) =>
      entry?.kind === 'file' && contentType !== null
        ? {
            ...entry,
            status,
            contentType,
            immutable: immutable(file),
            blob: () => disk.blob(entry.path),
          }
        : null)(disk.entry(disk.absolute(link.root), file), staticType(file));

  const staticMissing = (link: MediaLink): StaticAnswer =>
    staticFile(link, NOT_FOUND_FILE, 404) ?? { kind: 'missing' };

  const staticAt = (link: MediaLink, rest: string): StaticAnswer =>
    ((target) =>
      hiddenPart(rest)
        ? staticMissing(link)
        : (staticFile(link, target, 200) ??
          (target === rest &&
          disk.entry(disk.absolute(link.root), rest)?.kind === 'folder'
            ? { kind: 'slash' }
            : staticMissing(link))))(indexOf(rest));

  /** Адрес папки-сайта — после расшифровки, с ведущим `/`; null — адрес не папки-сайта. */
  const staticAnswer = (path: string): StaticAnswer | null =>
    ((link) =>
      link === undefined
        ? null
        : path === `/${link.prefix}`
          ? { kind: 'slash' }
          : escapesFolder(path.endsWith('/') ? path.slice(0, -1) : path)
            ? { kind: 'refused' }
            : staticAt(link, path.slice(link.prefix.length + 2)))(
      files.links
        .list()
        .find(
          (_) =>
            _.staticSite &&
            (path === `/${_.prefix}` || path.startsWith(`/${_.prefix}/`))
        )
    );

  const readOf = (_: MediaFile): Uint8Array =>
    open(_)?.data() ?? new Uint8Array(0);

  const jobs = defineVariantJobs({
    files,
    queue,
    resize,
    report,
    maxPixels,
    variantsOf,
    read: readOf,
    // Картинка папки — только в кэш (нет кэша — без вариантов); картинка из базы — в кэш, а без него — в
    // базу, как раньше: база и копии не растут от того, что сервер сделает заново.
    placeOf: (_) =>
      cache.writable()
        ? (_.linked?.prefix ?? CACHE_ONLY)
        : _.linked
          ? null
          : undefined,
    // Варианты и отметка о задании — одной транзакцией, события — после неё.
    store: (collect) =>
      files
        .transaction(() =>
          collect()
            .map((_) => prepare(_, _.link))
            .map(write)
        )
        .map(announce),
  });

  /**
   * Варианты картинок связанных папок, чьих файлов нет в кэше (кэш стёрли, другой каталог кэша): строки
   * вариантов уходят, оригиналы — снова в очередь. Ответ — сколько картинок поставлено.
   */
  const heal = (originals: readonly MediaFile[]): number =>
    ((removed) => (
      removed.forEach((_) => void bus.publish(event('media.file_removed', _))),
      void (originals.length > 0 && kick()),
      originals.length
    ))(
      files.transaction(() =>
        originals.flatMap(
          (original) => (
            void (cache.writable() && queue.add(original.path, original.hash)),
            files
              .family(stemOf(original.path))
              .filter(isDerived)
              .map((_) => (files.remove(_.path), _.path))
          )
        )
      )
    );

  // Варианта нет вовсе: сервер ещё режет (после загрузки, после переезда, когда записи вариантов сняты при
  // старте), или картинке они не положены. Адрес из страницы в кэше или из браузера — на оригинал, а не 404.
  const pendingOriginal = (raw: string): MediaFile | null =>
    attempt(
      () =>
        ((path) =>
          variantWidth(path) === null
            ? null
            : (files.family(stemOf(path)).find(isResizable) ?? null))(
          parseMediaPath(raw)
        ),
      () => null
    );

  const originalOfVariant = (variant: MediaFile): MediaFile | null =>
    files.family(stemOf(variant.path)).find(isResizable) ?? null;

  const folders = defineLinkedFolders({
    files,
    queue,
    disk,
    cache,
    bus,
    kick,
    hash: mediaHash,
    measure: measureImage,
  });

  const image = (raw: string): ImageSet | null => {
    const file = find(raw);
    // Варианты — только у JPEG, PNG и WebP: SVG или GIF с той же основой чужих не берёт.
    const variants =
      file && isResizable(file)
        ? files
            .family(stemOf(file.path))
            .filter((_) => variantWidth(_.path) !== null)
            .toSorted((a, b) => variantWidth(a.path)! - variantWidth(b.path)!)
        : [];
    // Оригинал шире самого крупного варианта, но не шире 1920, — тоже кандидат: иначе снимок в 800 px
    // браузер растягивал бы из варианта 480. Оригинал крупнее 1920 в набор не идёт: на экране высокой
    // плотности браузер скачал бы его целиком, а вариант 1920 уже есть.
    const largest = variantWidth(variants.at(-1)?.path ?? '') ?? 0;
    const original =
      file &&
      variants.length > 0 &&
      (file.width ?? 0) > largest &&
      (file.width ?? 0) <= VARIANT_WIDTHS.at(-1)!
        ? [`${mediaUrl(file)} ${file.width}w`]
        : [];
    return (
      file && {
        src: mediaUrl(file),
        srcset: [
          ...variants.map((_) => `${mediaUrl(_)} ${variantWidth(_.path)}w`),
          ...original,
        ].join(', '),
        width: file.width,
        height: file.height,
        alt: file.alt,
      }
    );
  };

  return {
    files: {
      list: (): MediaFile[] => files.list(),
      save,
      /**
       * Удалить файл. У картинки — и её варианты размеров, если других картинок с той же основой нет: иначе
       * они достались бы следующей картинке с этим именем.
       */
      remove: (raw: string): void => {
        const path = parseMediaPath(raw);
        const file =
          files.meta(path) ?? fail('media.file_not_found', `No file ${path}`);
        void (inLinkedFolder(file) && _linkedFile(path));
        const gone = [
          ...(isResizable(file) &&
          !files
            .family(stemOf(path))
            .some((_) => _.path !== path && isResizable(_))
            ? variantsOf(path).map((_) => _.path)
            : []),
          path,
        ];
        files.transaction(() => gone.forEach((_) => void files.remove(_)));
        gone.forEach((_) => void bus.publish(event('media.file_removed', _)));
      },
      /** Описание картинки; сайт перерисует страницы, где она стоит. */
      describe: (raw: string, alt: string): MediaFile => {
        const path = parseMediaPath(raw);
        const file =
          files.meta(path) ?? fail('media.file_not_found', `No file ${path}`);
        const next = { ...file, alt: parseAlt(alt) };
        files.describe(path, next.alt);
        bus.publish(event('media.file_saved', path));
        return next;
      },
      /**
       * Файл для отдачи — по пути медиатеки или исходному пути файла связанной папки; null — нет такого или
       * его байтов нет на диске.
       */
      read: (raw: string): MediaRead | null =>
        ((meta) => meta && open(meta))(find(raw)),
      /** Файл связанной папки по исходному адресу `/<приставка>/<путь>` — только у папок с этим правом. */
      served: (path: string): MediaRead | null =>
        ((meta) => meta && open(meta))(servedMeta(path)),
      /**
       * Вариант картинки связанной папки, чьего файла нет в кэше: картинка — снова в очередь, ответ — адрес
       * оригинала, пока вариант делается; null — это не такой вариант.
       */
      revive: (raw: string): string | null =>
        ((meta) =>
          meta
            ? ((original) =>
                original && (heal([original]), mediaUrl(original)))(
                isDerived(meta) && cache.stored(meta) === null
                  ? originalOfVariant(meta)
                  : null
              )
            : ((original) => original && mediaUrl(original))(
                pendingOriginal(raw)
              ))(find(raw)),
      /** Путь медиатеки по пути или исходному пути файла связанной папки; null — файла нет. */
      resolve: (raw: string): string | null => find(raw)?.path ?? null,
      /** Исходный путь файла связанной папки `<приставка>/<путь на диске>`; null — файл в базе. */
      original: (raw: string): string | null =>
        ((meta) =>
          meta?.linked?.file
            ? `${meta.linked.prefix}/${meta.linked.file}`
            : null)(find(raw)),
    },
    /** Связанные папки: файлы на диске сервера, в базе — только строки медиатеки (ADR 0065). */
    links: {
      ...folders,
      /** Есть файл связанной папки с правом исходных адресов по пути `<приставка>/<путь на диске>`. */
      serves: (path: string): boolean => servedMeta(path) !== null,
      /** Приставки папок, чьи файлы отдаются и по исходным адресам; дёшево — на каждый запрос страницы. */
      serving: (): string[] =>
        files.links
          .list()
          .filter((_) => _.serveOriginal)
          .map((_) => _.prefix),
      /** Варианты картинок папок, которых нет в кэше, — снова в очередь; ответ — сколько картинок. */
      heal: (): number =>
        heal([
          ...new Map(
            files
              .derived()
              .filter((_) => cache.stored(_) === null)
              .map(originalOfVariant)
              .filter((_): _ is MediaFile => _ !== null)
              .map((_) => [_.path, _])
          ).values(),
        ]),
    },
    /** Папки-сайты: статический сайт из связанной папки по `/<приставка>/…` (ADR 0068). */
    statics: {
      resolve: staticAnswer,
    },
    uploads: {
      /** Куда положить тело загрузки, пока оно разбирается; null — кэша на диске нет: тело — в память. */
      spool: (): string | null => cache.spool(),
    },
    cache: {
      /** Уборка: с диска — файлы кэша, которых больше нет в базе. */
      sweep: (): number => cache.sweep(files.list()),
      /** Весь кэш — с диска: база сменилась целиком (восстановление копии). */
      clear: (): number => cache.sweep([]),
    },
    url: (raw: string): string | null =>
      ((file) => file && mediaUrl(file))(find(raw)),
    resolve: (raw: string): string | null => find(raw)?.path ?? null,
    image,
    /** Очередь вариантов размеров: их делает сервер, а не тот, кто загрузил картинку (ADR 0046). */
    variants: {
      ...jobs,
      /**
       * Варианты картинок из базы, которые лежат в самой базе (сделаны до кэша или загружены своими), — прочь, а
       * картинки — в очередь: сервер сделает их заново в кэш, база и копии похудеют. Без кэша на диске — ничего.
       * Ответ — сколько картинок поставлено.
       */
      rebuild: (): number =>
        cache.writable()
          ? ((queued) => (
              queued
                .flatMap((_) => _.removed)
                .forEach(
                  (path) => void bus.publish(event('media.file_removed', path))
                ),
              void (queued.length > 0 && kick()),
              queued.length
            ))(
              files.transaction(() =>
                files
                  .list()
                  .filter((_) => _.linked === undefined && takesVariants(_))
                  .map((original) => ({
                    original,
                    stored: variantsOf(original.path).filter(
                      (_) => _.linked === undefined
                    ),
                  }))
                  .filter((_) => _.stored.length > 0)
                  .map(
                    ({ original, stored }) => (
                      queue.add(original.path, original.hash),
                      {
                        removed: stored.map(
                          (_) => (files.remove(_.path), _.path as MediaPath)
                        ),
                      }
                    )
                  )
              )
            )
          : 0,
    },
  };
};

export type MediaService = ReturnType<typeof defineMediaService>;
