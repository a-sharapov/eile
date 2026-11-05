import { sep } from 'node:path';

/**
 * Путь от корня каталога — через «/», как его ждут имена файлов папки элементов и встроенной SPA:
 * `Bun.Glob` на Windows отдаёт `components\Menu.svelte` (ADR 0049).
 */
export var posixPath = (path: string, separator: string = sep): string =>
  separator === '/' ? path : path.replaceAll(separator, '/');

/** Следы архиваторов и систем — `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`: не файлы автора. */
export var isJunk = (path: string): boolean =>
  /(?:^|\/)(?:__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/.test(path);
