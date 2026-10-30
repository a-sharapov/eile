import { pipe } from '../../../shared/kernel/pipe.ts';

const _unsafe = (segment: string): boolean =>
  segment === '.' || segment === '..' || segment.includes('\0');

/** Единственный адрес страницы: без пустых сегментов и завершающего `/`. null — путь не может вести на страницу. */
export var canonicalPath = (path: string): string | null =>
  pipe<string, string | null>(
    (_: string) => _.split('/').filter(Boolean),
    (segments: string[]) =>
      segments.some(_unsafe) ? null : `/${segments.join('/')}`
  )(path);

/** Главная живёт на `/`, какой бы ни был её алиас. */
export var pageUrl = (
  page: { readonly id: number; readonly path: string },
  homePageId: number | null
): string => (page.id === homePageId ? '/' : page.path);
