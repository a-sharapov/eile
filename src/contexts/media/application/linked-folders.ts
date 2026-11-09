import { attempt, fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import {
  assignLinkedPaths,
  isDerived,
  linkedPath,
  type MediaLink,
  parseLinkPrefix,
  prefixesOverlap,
  takenBy,
} from '../domain/linked.ts';
import {
  contentTypeOf,
  type MediaEvent,
  type MediaFile,
  type MediaPath,
  stemOf,
} from '../domain/media.ts';
import type {
  FolderScan,
  LinkedDisk,
  LinkedRow,
  MediaCache,
  MediaRepository,
  OpenedFile,
  ScannedFile,
  VariantQueue,
} from '../domain/ports.ts';
import { staticType } from '../domain/static-site.ts';
import { takesVariants } from '../domain/variants.ts';

/** Что связать: папку на диске под приставкой медиатеки. */
export type LinkInput = {
  /** Папка: абсолютный путь или от текущего каталога. */
  readonly dir: string;
  readonly prefix: string;
  /** Исходные адреса `/<приставка>/<путь на диске>`; не задано — как было (у новой папки — нет). */
  readonly serveOriginal?: boolean;
  /**
   * Папка-сайт (ADR 0068): отдавать статическим сайтом по `/<приставка>/…`, без строк в медиатеке. Не задано —
   * как было (у новой папки — медиатека); сменить вид у связанной папки нельзя — только через unlink.
   */
  readonly staticSite?: boolean;
  /** Описания картинок из media.json: путь на диске от корня папки → описание. */
  readonly alts?: ReadonlyMap<string, string>;
  /** Только посчитать, что изменится. */
  readonly dryRun?: boolean;
};

/**
 * Почему файл папки не попал в медиатеку: тип не принимается, файл пустой, ссылка ведёт за пределы папки, файл
 * не читается (права).
 */
export type SkipReason = 'type' | 'empty' | 'outside' | 'unreadable';

export type SkippedFile = {
  readonly file: string;
  readonly reason: SkipReason;
};

/** Итог связывания или сверки папки. Пути — пути медиатеки. */
export type LinkReport = {
  readonly prefix: string;
  /** Где папка на диске. */
  readonly dir: string;
  /** Как записан путь к папке: от каталога базы или абсолютный. */
  readonly root: string;
  readonly serveOriginal: boolean;
  /** Папка-сайт: отдаётся статическим сайтом, в медиатеке её файлов нет. */
  readonly staticSite: boolean;
  /** Папку связали впервые. */
  readonly created: boolean;
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  /** Содержимое то же, сменилось описание из media.json. */
  readonly described: readonly string[];
  readonly same: number;
  readonly skipped: readonly SkippedFile[];
  /** Ключи media.json без файла в папке. */
  readonly unknownAlts: readonly string[];
  /** Файлов папки в медиатеке после сверки и их размер; у папки-сайта — файлов, которые она отдаёт. */
  readonly files: number;
  readonly bytes: number;
  /** Сколько файлов прочитано ради хэша: у совпавших по размеру и времени изменения хэш не считается. */
  readonly hashed: number;
  /** Картинок в очереди вариантов. */
  readonly queued: number;
  readonly saved: boolean;
};

/** Связанная папка для сводок: где лежит, есть ли она, сколько в ней файлов. */
export type LinkView = MediaLink & {
  readonly dir: string;
  readonly present: boolean;
  readonly files: number;
  readonly bytes: number;
};

export type UnlinkReport = {
  readonly prefix: string;
  /** Отвязана папка-сайт: из медиатеки ничего не ушло, её адреса больше не отвечают. */
  readonly staticSite: boolean;
  /** Файлы папки, которые ушли из медиатеки, без вариантов. */
  readonly removed: readonly string[];
  readonly variants: number;
  readonly saved: boolean;
};

/** Файлы папки, которых нет на диске: вся папка или отдельные файлы. */
export type LinkGap = {
  readonly prefix: string;
  readonly dir: string;
  readonly present: boolean;
  readonly missing: readonly string[];
};

// Пачка строк на транзакцию: сервер на той же базе ждёт блокировку миллисекунды, а не всю папку.
const _BATCH = 500;

const _batches = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / _BATCH) }, (_, n) =>
    items.slice(n * _BATCH, (n + 1) * _BATCH)
  );

type _Placed = {
  readonly file: MediaFile;
  readonly mtime: number;
  /** Прежние варианты размеров — показывали бы старую картинку. */
  readonly stale: readonly MediaFile[];
  readonly queued: boolean;
};

type _Planned = {
  readonly added: readonly _Placed[];
  readonly changed: readonly _Placed[];
  /** Тот же файл, другое время изменения: строка запоминает новое. */
  readonly touched: readonly _Placed[];
  readonly removed: readonly LinkedRow[];
  readonly described: readonly { path: MediaPath; alt: string }[];
  readonly same: number;
  readonly hashed: number;
  /** Не открылись или не дочитались. */
  readonly unreadable: readonly string[];
};

/**
 * Связанные папки: обход, сверка с медиатекой по размеру и времени изменения (хэш — только у изменённых),
 * строки без кусков, варианты картинок — в очередь. Описания файлов, что остались, не трогаются.
 */
export var defineLinkedFolders = ({
  files,
  queue,
  disk,
  cache,
  bus,
  kick,
  hash,
  measure,
  clock = () => new Date(),
}: {
  files: MediaRepository;
  queue: VariantQueue;
  disk: LinkedDisk;
  cache: MediaCache;
  bus: EventBus;
  kick: () => void;
  hash: (content: OpenedFile) => string;
  measure: (
    content: OpenedFile,
    contentType: string
  ) => { width: number | null; height: number | null };
  clock?: () => Date;
}) => {
  const event = (type: MediaEvent['type'], path: MediaPath): MediaEvent => ({
    type,
    path,
  });

  // Файл, который не открыть или не дочитать, — null: один такой файл не останавливает сверку всей папки.
  const withFile = <T>(path: string, run: (_: OpenedFile) => T): T | null =>
    attempt(
      () =>
        ((opened) =>
          attempt(
            () => ((result) => (opened.close(), result))(run(opened)),
            () => (opened.close(), null)
          ))(disk.open(path)),
      () => null
    );

  const derivedOf = (path: string): MediaFile[] =>
    files.family(stemOf(path)).filter(isDerived);

  // Варианты картинок папки живут только в кэше на диске: без него их нет.
  const resizes = (file: MediaFile): boolean =>
    takesVariants(file) && cache.writable();

  const read = (
    dir: string,
    found: ScannedFile,
    contentType: string
  ): { hash: string; width: number | null; height: number | null } | null =>
    withFile(`${dir}/${found.file}`, (content) => ({
      hash: hash(content),
      ...measure(content, contentType),
    }));

  const plan = (
    prefix: string,
    dir: string,
    accepted: readonly (ScannedFile & { contentType: string })[],
    alts: ReadonlyMap<string, string>,
    dryRun: boolean
  ): _Planned => {
    const rows = new Map(files.linked(prefix).map((_) => [_.linked!.file!, _]));
    const present = new Set(accepted.map((_) => _.file));
    const removed = [...rows.values()].filter(
      (_) => !present.has(_.linked!.file!)
    );
    const known = accepted.filter((_) => rows.has(_.file));
    const fresh = accepted.filter((_) => !rows.has(_.file));
    const moved = known.filter(
      (_) =>
        rows.get(_.file)!.size !== _.size || rows.get(_.file)!.mtime !== _.mtime
    );
    // Изменённый, но нечитаемый файл остаётся прежней строкой до следующей сверки.
    const rehashed = moved
      .map((found) => ({
        found,
        row: rows.get(found.file)!,
        read: read(dir, found, found.contentType),
      }))
      .filter(
        (_): _ is typeof _ & { read: NonNullable<typeof _.read> } =>
          _.read !== null
      );
    const changed = rehashed.filter((_) => _.read.hash !== _.row.hash);
    const touched = rehashed.filter((_) => _.read.hash === _.row.hash);
    const gone = new Set(removed.map((_) => _.path as string));
    const names = assignLinkedPaths(
      prefix,
      fresh.map((_) => _.file),
      takenBy(files.list().filter((_) => !gone.has(_.path)))
    );
    const measured = fresh.map((found) => ({
      found,
      read: dryRun
        ? { hash: '', width: null, height: null }
        : read(dir, found, found.contentType),
    }));
    const added = measured.flatMap(({ found, read }): _Placed[] =>
      read === null
        ? []
        : ((file: MediaFile) => [
            { file, mtime: found.mtime, stale: [], queued: resizes(file) },
          ])({
            path: names.get(found.file)!,
            contentType: found.contentType,
            size: found.size,
            ...read,
            alt: alts.get(found.file) ?? '',
            linked: { prefix, file: found.file },
          })
    );
    const changedPlaced = changed.map(({ found, row, read }): _Placed => {
      const file: MediaFile = {
        ...row,
        size: found.size,
        ...read,
        alt: alts.get(found.file) ?? row.alt,
      };
      return {
        file,
        mtime: found.mtime,
        stale: derivedOf(row.path),
        queued: resizes(file),
      };
    });
    const movedFiles = new Set(moved.map((_) => _.file));
    const unchanged = [
      ...known
        .filter((_) => !movedFiles.has(_.file))
        .map((_) => rows.get(_.file)!),
      ...touched.map((_) => _.row),
    ];
    return {
      added,
      changed: changedPlaced,
      touched: touched.map(({ found, row }) => ({
        file: row,
        mtime: found.mtime,
        stale: [],
        queued: false,
      })),
      removed,
      described: unchanged
        .filter(
          (_) =>
            alts.has(_.linked!.file!) && alts.get(_.linked!.file!) !== _.alt
        )
        .map((_) => ({ path: _.path, alt: alts.get(_.linked!.file!)! })),
      same: unchanged.length,
      hashed: moved.length + (dryRun ? 0 : fresh.length),
      unreadable: [
        ...measured.filter((_) => _.read === null).map((_) => _.found.file),
        ...moved
          .filter((_) => !rehashed.some((done) => done.found === _))
          .map((_) => _.file),
      ],
    };
  };

  // Пачками, каждая своей транзакцией; события — после неё, как у загрузки.
  const write = (planned: _Planned): number => {
    const removals = _batches(planned.removed).flatMap((batch) =>
      files.transaction(() =>
        batch.flatMap((row) =>
          ((variants) => (
            [...variants, row].forEach((_) => void files.remove(_.path)),
            [...variants.map((_) => _.path), row.path]
          ))(derivedOf(row.path))
        )
      )
    );
    removals.forEach((_) => void bus.publish(event('media.file_removed', _)));
    const placed = [...planned.changed, ...planned.added, ...planned.touched];
    const queued = _batches(placed).reduce(
      (count, batch) =>
        ((done) => (
          done.forEach(
            (_) =>
              void (_.stale.forEach(
                (stale) =>
                  void bus.publish(event('media.file_removed', stale.path))
              ),
              bus.publish(event('media.file_saved', _.file.path)))
          ),
          count + done.filter((_) => _.queued).length
        ))(
          files.transaction(() =>
            batch.map(
              (_) => (
                _.stale.forEach((stale) => void files.remove(stale.path)),
                files.place(_.file, _.mtime),
                void (_.queued && queue.add(_.file.path, _.file.hash)),
                _
              )
            )
          )
        ),
      0
    );
    files.transaction(() =>
      planned.described.forEach((_) => void files.describe(_.path, _.alt))
    );
    planned.described.forEach(
      (_) => void bus.publish(event('media.file_saved', _.path))
    );
    void (queued > 0 && kick());
    return queued;
  };

  const assertFree = (prefix: string): void =>
    ((other) =>
      void (
        other &&
        fail(
          'media.prefix_overlap',
          `"${prefix}" overlaps the linked folder "${other.prefix}"`
        )
      ))(
      files.links
        .list()
        .find((_) => _.prefix !== prefix && prefixesOverlap(_.prefix, prefix))
    );

  const accept = (
    prefix: string,
    found: ScannedFile
  ): (ScannedFile & { contentType: string }) | SkippedFile =>
    ((contentType) =>
      contentType === null
        ? { file: found.file, reason: 'type' as const }
        : found.size === 0
          ? { file: found.file, reason: 'empty' as const }
          : { ...found, contentType })(
      attempt(
        () => contentTypeOf(linkedPath(prefix, found.file) as MediaPath),
        () => null
      )
    );

  // Вид папки выбирается при первой связке: медиатека с описаниями и вариантами или сайт — смена потеряла бы
  // описания либо открыла бы HTML по адресам медиатеки, поэтому только через unlink.
  const kindOf = (
    prefix: string,
    input: LinkInput,
    previous: MediaLink | null
  ): boolean =>
    ((staticSite) =>
      previous !== null && staticSite !== previous.staticSite
        ? fail(
            'media.link_kind',
            previous.staticSite
              ? `"${prefix}" is linked as a static site: unlink it first to link it as a media folder`
              : `"${prefix}" is linked as a media folder: unlink it first to serve it as a static site`
          )
        : staticSite && input.serveOriginal === true
          ? fail(
              'media.static_original',
              `A static site is served at /${prefix}/ as it is: --serve-original is for media folders`
            )
          : staticSite)(input.staticSite ?? previous?.staticSite ?? false);

  // Файлы, которые папка-сайт отдаёт: известного типа, без скрытого (его обход и не видит).
  const servedBy = (scan: FolderScan): ScannedFile[] =>
    scan.files.filter((_) => staticType(_.file) !== null);

  // Папка-сайт: записывается только сама папка — файлы ищутся на диске на каждый запрос.
  const syncStatic = (
    input: LinkInput,
    prefix: string,
    previous: MediaLink | null,
    root: string,
    dir: string,
    scan: FolderScan
  ): LinkReport => {
    const served = servedBy(scan);
    const now = clock().toISOString();
    void (
      input.dryRun ||
      files.links.save({
        prefix,
        root,
        serveOriginal: false,
        staticSite: true,
        linkedAt: previous?.linkedAt ?? now,
        syncedAt: now,
      })
    );
    return {
      prefix,
      dir,
      root,
      serveOriginal: false,
      staticSite: true,
      created: previous === null,
      added: [],
      changed: [],
      removed: [],
      described: [],
      same: 0,
      skipped: [
        ...scan.files
          .filter((_) => staticType(_.file) === null)
          .map((_) => ({ file: _.file, reason: 'type' as const })),
        ...scan.escaped.map((file) => ({ file, reason: 'outside' as const })),
      ],
      unknownAlts: [],
      files: served.length,
      bytes: served.reduce((sum, _) => sum + _.size, 0),
      hashed: 0,
      queued: 0,
      saved: input.dryRun !== true,
    };
  };

  const sync = (input: LinkInput): LinkReport => {
    const prefix = parseLinkPrefix(input.prefix);
    assertFree(prefix);
    const previous = files.links.get(prefix);
    const staticSite = kindOf(prefix, input, previous);
    const root = disk.stored(input.dir);
    const dir = disk.absolute(root);
    const scan =
      disk.scan(dir) ?? fail('media.no_folder', `There is no folder ${dir}`);
    return staticSite
      ? syncStatic(input, prefix, previous, root, dir, scan)
      : syncMedia(input, prefix, previous, root, dir, scan);
  };

  const syncMedia = (
    input: LinkInput,
    prefix: string,
    previous: MediaLink | null,
    root: string,
    dir: string,
    scan: FolderScan
  ): LinkReport => {
    const sorted = scan.files.map((_) => accept(prefix, _));
    const accepted = sorted.filter(
      (_): _ is ScannedFile & { contentType: string } => 'contentType' in _
    );
    const alts = input.alts ?? new Map<string, string>();
    const planned = plan(prefix, dir, accepted, alts, input.dryRun === true);
    const serveOriginal =
      input.serveOriginal ?? previous?.serveOriginal ?? false;
    const now = clock().toISOString();
    void (
      input.dryRun ||
      files.links.save({
        prefix,
        root,
        serveOriginal,
        staticSite: false,
        linkedAt: previous?.linkedAt ?? now,
        syncedAt: now,
      })
    );
    const queued = input.dryRun ? 0 : write(planned);
    const totals = files.links.totals().get(prefix);
    return {
      prefix,
      dir,
      root,
      serveOriginal,
      staticSite: false,
      created: previous === null,
      added: planned.added.map((_) => _.file.path),
      changed: planned.changed.map((_) => _.file.path),
      removed: planned.removed.map((_) => _.path),
      described: planned.described.map((_) => _.path),
      same: planned.same,
      skipped: [
        ...sorted.filter((_): _ is SkippedFile => 'reason' in _),
        ...scan.escaped.map((file) => ({ file, reason: 'outside' as const })),
        ...planned.unreadable.map((file) => ({
          file,
          reason: 'unreadable' as const,
        })),
      ],
      unknownAlts: ((present) =>
        [...alts.keys()].filter((_) => !present.has(_)))(
        new Set(accepted.map((_) => _.file))
      ),
      files: input.dryRun ? accepted.length : (totals?.files ?? 0),
      bytes: input.dryRun
        ? accepted.reduce((sum, _) => sum + _.size, 0)
        : (totals?.bytes ?? 0),
      hashed: planned.hashed,
      queued,
      saved: input.dryRun !== true,
    };
  };

  const unlink = (raw: string, dryRun = false): UnlinkReport => {
    const prefix = parseLinkPrefix(raw);
    const link =
      files.links.get(prefix) ??
      fail('media.no_link', `No linked folder under "${prefix}"`);
    const originals = files.linked(prefix);
    const variants = files.derived().filter((_) => _.linked!.prefix === prefix);
    const paths = [...variants, ...originals].map((_) => _.path);
    void (
      dryRun ||
      (_batches(paths).forEach(
        (batch) =>
          void files.transaction(
            () => void batch.forEach((_) => void files.remove(_))
          )
      ),
      files.transaction(() => files.links.remove(prefix)),
      paths.forEach((_) => void bus.publish(event('media.file_removed', _))))
    );
    return {
      prefix,
      staticSite: link.staticSite,
      removed: originals.map((_) => _.path),
      variants: variants.length,
      saved: !dryRun,
    };
  };

  return {
    sync,
    unlink,
    // Файлы папки-сайта не в базе: их число и размер — обходом папки (обычно это сотни файлов сборки).
    list: (): LinkView[] =>
      ((totals) =>
        files.links.list().map((link) =>
          ((dir) => ({
            ...link,
            dir,
            present: disk.exists(dir),
            ...(link.staticSite
              ? ((served) => ({
                  files: served.length,
                  bytes: served.reduce((sum, _) => sum + _.size, 0),
                }))(servedBy(disk.scan(dir) ?? { files: [], escaped: [] }))
              : {
                  files: totals.get(link.prefix)?.files ?? 0,
                  bytes: totals.get(link.prefix)?.bytes ?? 0,
                }),
          }))(disk.absolute(link.root))
        ))(files.links.totals()),
    /** Чего нет на диске: папки целиком или файлов, что были при сверке. */
    gaps: (): LinkGap[] =>
      files.links
        .list()
        .map((link) =>
          ((dir) =>
            ((present) => ({
              prefix: link.prefix,
              dir,
              present,
              missing: present
                ? files
                    .linked(link.prefix)
                    .filter((_) => disk.locate(dir, _.linked!.file!) === null)
                    .map((_) => _.path as string)
                : [],
            }))(disk.exists(dir)))(disk.absolute(link.root))
        )
        .filter((_) => !_.present || _.missing.length > 0),
  };
};

export type LinkedFolders = ReturnType<typeof defineLinkedFolders>;
