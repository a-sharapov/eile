import { attempt } from '../../../shared/kernel/errors.ts';
import { parseElementName } from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';
import { ASSETS_PREFIX } from './client-runtime.ts';
import { scriptHash } from './script-module.ts';

/** Скрипты сайта: `/_cms/scripts/<имя>.<хэш>.js`. */
export var SCRIPTS_PREFIX = `${ASSETS_PREFIX}/scripts/`;

/** Текущая версия скрипта: адрес, хэш и исходник. */
export type ScriptFile = {
  readonly name: string;
  readonly hash: string;
  readonly source: string;
};

// Имя проверяет домен: здесь только разрезать «имя.хэш.js».
const _PATH = /^([^/.]+)\.([a-z0-9]+)\.js$/;

/**
 * Адреса скриптов с хэшем исходника: прежний хэш — 404, страницы с ним перерисовывает событие правки.
 * Текущая версия живёт в памяти до любого события `design.*`: адрес спрашивает каждая страница.
 */
export var defineSiteScripts = (elements: ElementRepository) => {
  // Только найденные: адрес с выдуманным именем не должен раздувать память сервера.
  const current = new Map<string, ScriptFile>();

  const read = (name: string): ScriptFile | null =>
    ((element) =>
      element && {
        name,
        hash: scriptHash(element.source),
        source: element.source,
      })(
      attempt(
        () => elements.get('script', parseElementName(name, 'script')),
        () => null
      )
    );

  const fileOf = (name: string): ScriptFile | null =>
    current.get(name) ??
    ((file) => (void (file && current.set(name, file)), file))(read(name));

  const urlOf = (file: ScriptFile): string =>
    `${SCRIPTS_PREFIX}${file.name}.${file.hash}.js`;

  return {
    /** Адрес текущей версии; null — такого скрипта нет. */
    url: (name: string): string | null =>
      ((file) => file && urlOf(file))(fileOf(name)),
    /** Скрипт по пути `/_cms/scripts/…`; null — нет такого или хэш прежний. */
    file: (path: string): ScriptFile | null =>
      ((match) =>
        match
          ? ((file) => (file?.hash === match[2] ? file : null))(
              fileOf(match[1]!)
            )
          : null)(_PATH.exec(path.slice(SCRIPTS_PREFIX.length))),
    invalidate: (): void => current.clear(),
  };
};
