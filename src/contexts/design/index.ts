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
import { defineElementRepository } from './infrastructure/sqlite-element-repository.ts';
import { svelteSourceCompiler } from './infrastructure/svelte-compiler.ts';
import { defineAssetsHandler } from './interface/assets-handler.ts';
import { defineScriptsHandler } from './interface/scripts-handler.ts';

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
const _CHECKS: Readonly<Record<ElementKind, (element: Element) => void>> = {
  template: svelteSourceCompiler.check,
  component: svelteSourceCompiler.check,
  script: checkScript,
};

const _compiler: SourceCompiler = {
  ...svelteSourceCompiler,
  check: (element) => _CHECKS[element.kind](element),
};

/**
 * Контекст design: шаблоны и компоненты хранятся исходником Svelte и компилируются во время работы;
 * скрипты сайта — ES-модули для браузера по адресам с хэшем.
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
  const loader = defineViewLoader({ elements, runtime, builtins });
  const islands = defineClientViews({
    elements,
    runtime: defineClientRuntime(),
  });
  const scripts = defineSiteScripts(elements);
  bus.onAny(
    (event) =>
      void (
        event.type.startsWith('design.') &&
        (loader.invalidate(), islands.invalidate(), scripts.invalidate())
      )
  );
  const service = defineDesignService({ elements, compiler: _compiler, bus });
  const islandAssets = defineAssetsHandler(islands);
  const scriptAssets = defineScriptsHandler(scripts);
  return {
    ...service,
    scripts: { ...service.scripts, url: scripts.url },
    views: {
      template: loader.template,
      component: loader.component,
      island: islands.url,
      hydrator: islands.hydrator,
    },
    /** `/_cms/*`: скрипты сайта, модули островов и рантайм Svelte для браузера. */
    assets: (request: Request): Promise<Response> =>
      new URL(request.url).pathname.startsWith(SCRIPTS_PREFIX)
        ? Promise.resolve(scriptAssets(request))
        : islandAssets(request),
  };
};

export type DesignService = ReturnType<typeof defineDesign>;

export type Views = DesignService['views'];
