import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineDesignService } from './application/design-service.ts';
import type { SourceCompiler } from './application/source-compiler.ts';
import type { Element, ElementKind } from './domain/element.ts';
import { defineViewLoader } from './infrastructure/bun-view-loader.ts';
import { defineClientRuntime } from './infrastructure/client-runtime.ts';
import { defineClientViews } from './infrastructure/client-views.ts';
import { checkScript } from './infrastructure/script-module.ts';
import {
  defineSiteScripts,
  SCRIPTS_PREFIX,
} from './infrastructure/site-scripts.ts';
import {
  defineSiteStyles,
  STYLES_PREFIX,
} from './infrastructure/site-styles.ts';
import { defineElementRepository } from './infrastructure/sqlite-element-repository.ts';
import {
  defineServerCompiler,
  type ServerCompiler,
  svelteSourceCompiler,
} from './infrastructure/svelte-compiler.ts';
import { defineAssetsHandler } from './interface/assets-handler.ts';
import { defineFileHandler } from './interface/file-handler.ts';

export type { ElementKind } from './domain/element.ts';
export type { DesignEvent } from './domain/events.ts';
export type {
  ComponentSignature,
  PropOption,
  PropSignature,
} from './domain/signature.ts';
export {
  ASSETS_PREFIX,
  buildClientRuntime,
  CLIENT_RUNTIME_KEY,
} from './infrastructure/client-runtime.ts';
export { designMigrations } from './infrastructure/migrations.ts';

// Шаблон и компонент компилирует Svelte; скрипт — готовый ES-модуль, его только разбирают.
const _checks = (
  compile: ServerCompiler
): Readonly<Record<ElementKind, (element: Element) => void>> => ({
  template: (element) => void compile(element),
  component: (element) => void compile(element),
  script: checkScript,
});

/**
 * Контекст design: шаблоны и компоненты хранятся исходником Svelte и компилируются во время работы;
 * скрипты и стили сайта — файлы для браузера по адресам с хэшем.
 */
export var defineDesign = ({
  db,
  bus,
  runtime,
  builtins,
}: {
  db: Database;
  bus: EventBus;
  runtime: object;
  builtins: Readonly<Record<string, string>>;
}) => {
  const elements = defineElementRepository(db);
  // Одна компиляция на версию элемента: проверка при сохранении, виды и стили сайта.
  const compile = defineServerCompiler();
  const checks = _checks(compile);
  const compiler: SourceCompiler = {
    ...svelteSourceCompiler,
    check: (element) => checks[element.kind](element),
  };
  const loader = defineViewLoader({ elements, runtime, builtins, compile });
  const islands = defineClientViews({
    elements,
    runtime: defineClientRuntime(),
  });
  const scripts = defineSiteScripts(elements);
  const styles = defineSiteStyles({ elements, compile });
  bus.onAny(
    (event) =>
      void (
        event.type.startsWith('design.') &&
        (loader.invalidate(),
        islands.invalidate(),
        scripts.invalidate(),
        styles.invalidate())
      )
  );
  const service = defineDesignService({ elements, compiler, bus });
  const islandAssets = defineAssetsHandler(islands);
  const scriptAssets = defineFileHandler(
    'text/javascript; charset=utf-8',
    scripts.file
  );
  const styleAssets = defineFileHandler('text/css; charset=utf-8', styles.file);
  return {
    ...service,
    scripts: { ...service.scripts, url: scripts.url },
    views: {
      template: loader.template,
      component: loader.component,
      island: islands.url,
      hydrator: islands.hydrator,
      styles: styles.tags,
    },
    /** `/_cms/*`: скрипты и стили сайта, модули островов и рантайм Svelte для браузера. */
    assets: (request: Request): Promise<Response> =>
      ((path) =>
        path.startsWith(SCRIPTS_PREFIX)
          ? Promise.resolve(scriptAssets(request))
          : path.startsWith(STYLES_PREFIX)
            ? Promise.resolve(styleAssets(request))
            : islandAssets(request))(new URL(request.url).pathname),
  };
};

export type DesignService = ReturnType<typeof defineDesign>;

export type Views = DesignService['views'];
