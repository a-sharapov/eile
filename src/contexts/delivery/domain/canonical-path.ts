import { pipe } from '../../../shared/kernel/pipe.ts';

const _unsafe = (segment: string): boolean =>
  segment === '.' || segment === '..' || segment.includes('\0');

const _segments = (path: string): string[] | null =>
  ((segments) => (segments.some(_unsafe) ? null : segments))(
    path.split('/').filter(Boolean)
  );

/** Путь без пустых сегментов и завершающего `/`: так записаны правила переадресации. null — путь не может вести на страницу. */
export var canonicalPath = (path: string): string | null =>
  pipe(_segments, (segments: string[] | null) =>
    segments === null ? null : `/${segments.join('/')}`
  )(path);

/**
 * Путь запроса без пустых сегментов (`//a//b` → `/a/b`), но с завершающим `/`: у папки он — часть
 * адреса (`/katalog/`, ADR 0063). null — путь не может вести на страницу.
 */
export var cleanPath = (path: string): string | null =>
  ((canonical) =>
    canonical === null || canonical === '/' || !path.endsWith('/')
      ? canonical
      : `${canonical}/`)(canonicalPath(path));

/** Главная живёт на `/`, какой бы ни был её алиас. */
export var pageUrl = (
  page: { readonly id: number; readonly path: string },
  homePageId: number | null
): string => (page.id === homePageId ? '/' : page.path);

/**
 * Окончание адреса страницы — то, что идёт после алиаса: `/` у папки, суффикс у документа, иначе пусто.
 * К нему приписываются адреса порций и Markdown-версии.
 */
export var endingOf = (page: {
  readonly path: string;
  readonly alias: string;
}): string =>
  page.path.endsWith('/')
    ? '/'
    : page.path.slice(page.path.lastIndexOf('/') + 1 + page.alias.length);

/** Адрес Markdown-версии: путь без окончания и `.md` (`/katalog/` → `/katalog.md`); главная — `/index.md`. */
export var markdownPath = (url: string, ending: string): string =>
  url === '/' ? '/index.md' : `${url.slice(0, url.length - ending.length)}.md`;
