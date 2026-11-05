import { resolve } from 'node:path';

/** SPA менеджера без сборки: страница со встроенным скриптом запуска, как у SvelteKit. */
export var MANAGER_FILES = {
  '/index.html': resolve(import.meta.dir, 'manager/index.html'),
};
