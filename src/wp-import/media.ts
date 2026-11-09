import { statSync } from 'node:fs';
import { join } from 'node:path';
import {
  contentTypeOf,
  MAX_MEDIA_SIZE,
  type Media,
  parseMediaPath,
  stemOf,
} from '../contexts/media/index.ts';
import {
  type BodyBytes,
  bytesOf,
  readBody,
  spoolBody,
} from '../platform/body.ts';
import { attempt, isDomainError } from '../shared/kernel/errors.ts';
import { phpField, unserialize } from './php.ts';
import { metaOf, type WpSite } from './source.ts';

/** Откуда брать файлы вложений: папка `wp-content/uploads` или адрес старого сайта. */
export type MediaSource =
  | { readonly kind: 'dir'; readonly path: string }
  | { readonly kind: 'url'; readonly base: string };

/** Вложение WordPress и его путь в медиатеке Eile. */
export type Attachment = {
  readonly id: number;
  /** Путь в `uploads`, как в `_wp_attached_file`: `2024/05/Küche.jpg`. */
  readonly file: string;
  /** Путь в медиатеке: `uploads/2024/05/kueche.jpg`. */
  readonly path: string;
  readonly alt: string;
  readonly parent: number;
  readonly slug: string;
  readonly image: boolean;
  /** Размеры, которые нарезал WordPress (`photo-300x200.jpg`): по ним узнаются ссылки на копии. */
  readonly sizes: readonly string[];
};

export type MediaSkip = { readonly file: string; readonly reason: string };

export type MediaResult = {
  /** id вложения → путь в медиатеке: файл перенесён (или будет, при пробном прогоне). */
  readonly imported: ReadonlyMap<number, string>;
  readonly skipped: readonly MediaSkip[];
};

/** `--media https://old.example` или папка. */
export var parseMediaSource = (raw: string): MediaSource =>
  /^https?:\/\//i.test(raw)
    ? { kind: 'url', base: raw.replace(/\/+$/, '') }
    : { kind: 'dir', path: raw };

const _LATIN: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
};

// Сегмент медиатеки — строчная латиница, цифры, `.`, `_`, `-`; `@` занят под варианты размеров.
const _segment = (raw: string): string =>
  [...raw.toLowerCase()]
    .map((_) => _LATIN[_] ?? _)
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+(\.[a-z0-9]+)$/, '$1');

const _withSuffix = (path: string, n: number): string =>
  path.replace(/(\.[a-z0-9]+)?$/, (ext) => `-${n}${ext}`);

// JPEG, PNG и WebP с одной основой (`photo.jpg`, `photo.png`) делили бы варианты размеров: вторая — `-2`.
const _resizable = (path: string): boolean =>
  /\.(?:jpe?g|png|webp)$/.test(path);

const _free = (
  taken: ReadonlySet<string>,
  stems: ReadonlySet<string>,
  path: string
): boolean =>
  !taken.has(path) && !(_resizable(path) && stems.has(stemOf(path)));

// Путь файла из адреса вложения, если в метаполях его нет: всё после `/uploads/`.
const _fileFromUrl = (url: string): string =>
  ((at) => (at < 0 ? '' : decodeURIComponent(url.slice(at + 9))))(
    url.indexOf('/uploads/')
  );

/** Вложения сайта с путями в медиатеке: без повторов, только типы, которые медиатека принимает. */
export var attachmentsOf = (
  site: WpSite
): { readonly list: Attachment[]; readonly unsupported: MediaSkip[] } =>
  site.posts
    .filter((_) => _.type === 'attachment')
    .reduce<{
      list: Attachment[];
      unsupported: MediaSkip[];
      taken: Set<string>;
      stems: Set<string>;
    }>(
      (acc, post) => {
        const file =
          metaOf(post, '_wp_attached_file') ||
          _fileFromUrl(post.attachmentUrl ?? post.guid);
        const base = `uploads/${file.split('/').filter(Boolean).map(_segment).join('/')}`;
        const path = [
          base,
          ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => _withSuffix(base, n)),
        ].find((_) => _free(acc.taken, acc.stems, _))!;
        const supported =
          file !== '' &&
          attempt(
            () => (contentTypeOf(parseMediaPath(path)), true),
            () => false
          );
        const meta = unserialize(metaOf(post, '_wp_attachment_metadata'));
        const sizes = phpField(meta, 'sizes');
        return supported
          ? {
              ...acc,
              taken: acc.taken.add(path),
              stems: _resizable(path) ? acc.stems.add(stemOf(path)) : acc.stems,
              list: [
                ...acc.list,
                {
                  id: post.id,
                  file,
                  path,
                  alt: metaOf(post, '_wp_attachment_image_alt'),
                  parent: post.parent,
                  slug: post.slug,
                  image: /\.(?:jpe?g|png|gif|webp|avif|svg)$/i.test(file),
                  sizes:
                    sizes && typeof sizes === 'object'
                      ? Object.values(sizes).flatMap((_) =>
                          ((name) => (typeof name === 'string' ? [name] : []))(
                            phpField(_, 'file')
                          )
                        )
                      : [],
                },
              ],
            }
          : {
              ...acc,
              unsupported: [
                ...acc.unsupported,
                { file: file || `#${post.id}`, reason: 'type' },
              ],
            };
      },
      { list: [], unsupported: [], taken: new Set(), stems: new Set() }
    );

type Loaded =
  | {
      readonly ok: true;
      readonly data: Uint8Array | BodyBytes;
      readonly close: () => void;
    }
  | { readonly ok: false; readonly reason: string };

const _tooLarge = (): Error =>
  Object.assign(new Error('too large'), { reason: 'too-large' });

// Папка — это `uploads` или корень сайта WordPress, где она лежит в `wp-content/uploads`.
const _uploadsDir = (dir: string): string =>
  attempt(
    () =>
      statSync(join(dir, 'wp-content', 'uploads')).isDirectory()
        ? join(dir, 'wp-content', 'uploads')
        : dir,
    () => dir
  );

const _fromDir = (
  dir: string,
  file: string,
  dryRun: boolean
): Promise<Loaded> =>
  ((path) =>
    ((size) =>
      size === null
        ? Promise.resolve<Loaded>({ ok: false, reason: 'missing' })
        : size > MAX_MEDIA_SIZE
          ? Promise.resolve<Loaded>({ ok: false, reason: 'too-large' })
          : dryRun
            ? Promise.resolve<Loaded>({
                ok: true,
                data: new Uint8Array(0),
                close: () => undefined,
              })
            : Bun.file(path)
                .bytes()
                .then(
                  (data): Loaded => ({ ok: true, data, close: () => undefined })
                ))(
      attempt(
        () => ((stat) => (stat.isFile() ? stat.size : null))(statSync(path)),
        () => null
      )
    ))(join(dir, ...file.split('/')));

const _urlOf = (base: string, file: string): string =>
  `${/\/(?:wp-content\/)?uploads$/i.test(base) ? base : `${base}/wp-content/uploads`}/${file
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

// Скачивание кусками во временный файл рядом с кэшем медиатеки; больше 25 МиБ — отказ, не дочитывая.
const _fromUrl = (
  url: string,
  spool: () => string | null,
  net: typeof fetch
): Promise<Loaded> =>
  net(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) }).then(
    (response): Promise<Loaded> =>
      !response.ok
        ? (void response.body?.cancel(),
          Promise.resolve({ ok: false, reason: `http-${response.status}` }))
        : ((path) =>
            (path === null
              ? readBody(response, MAX_MEDIA_SIZE, _tooLarge).then(bytesOf)
              : spoolBody(response, MAX_MEDIA_SIZE, _tooLarge, path)
            ).then(
              (body): Loaded => ({ ok: true, data: body, close: body.close }),
              (error): Loaded => ({
                ok: false,
                reason:
                  (error as { reason?: string })?.reason ?? 'download-failed',
              })
            ))(spool()),
    (): Loaded => ({ ok: false, reason: 'download-failed' })
  );

const _BATCH = 4;

/**
 * Файлы вложений — в медиатеку: из папки или со старого сайта, по четыре сразу. Файл, который в медиатеке уже
 * есть, не перезаписывается. Варианты размеров сделает сервер (ADR 0046). При пробном прогоне файлы только
 * проверяются: в папке — есть ли и какого размера, с сайта — не скачиваются.
 */
export var importMedia = (
  attachments: readonly Attachment[],
  source: MediaSource,
  media: Media,
  options: { readonly dryRun: boolean; readonly fetch?: typeof fetch }
): Promise<MediaResult> => {
  const dir = source.kind === 'dir' ? _uploadsDir(source.path) : '';
  const load = (attachment: Attachment): Promise<Loaded> =>
    source.kind === 'dir'
      ? _fromDir(dir, attachment.file, options.dryRun)
      : options.dryRun
        ? Promise.resolve({
            ok: true,
            data: new Uint8Array(0),
            close: () => undefined,
          })
        : _fromUrl(
            _urlOf(source.base, attachment.file),
            media.uploads.spool,
            options.fetch ?? fetch
          );
  const save = (attachment: Attachment, loaded: Loaded): MediaSkip | null =>
    !loaded.ok
      ? { file: attachment.file, reason: loaded.reason }
      : options.dryRun
        ? null
        : attempt(
            () => (
              media.files.save({ path: attachment.path, data: loaded.data }),
              void (
                attachment.alt.trim() &&
                media.files.describe(
                  attachment.path,
                  attachment.alt.slice(0, 500)
                )
              ),
              null
            ),
            (error) => ({
              file: attachment.file,
              reason: isDomainError(error) ? error.code : 'save-failed',
            })
          );
  const one = (attachment: Attachment): Promise<MediaSkip | null> =>
    media.files.read(attachment.path)
      ? Promise.resolve({ file: attachment.file, reason: 'exists' })
      : load(attachment).then(
          (loaded) => {
            const skip = save(attachment, loaded);
            void (loaded.ok && loaded.close());
            return skip;
          },
          () => ({ file: attachment.file, reason: 'read-failed' })
        );
  const batches = Array.from(
    { length: Math.ceil(attachments.length / _BATCH) },
    (_, n) => attachments.slice(n * _BATCH, (n + 1) * _BATCH)
  );
  return batches
    .reduce<Promise<(MediaSkip | null)[]>>(
      (done, batch) =>
        done.then((results) =>
          Promise.all(batch.map(one)).then((next) => [...results, ...next])
        ),
      Promise.resolve([])
    )
    .then((results) => ({
      imported: new Map(
        attachments
          .filter((_, i) => results[i] === null)
          .map((_) => [_.id, _.path] as const)
      ),
      skipped: results.filter((_): _ is MediaSkip => _ !== null),
    }));
};
