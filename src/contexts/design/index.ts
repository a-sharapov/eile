import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineDesignService } from './application/design-service.ts';
import { defineViewLoader } from './infrastructure/bun-view-loader.ts';
import { defineClientRuntime } from './infrastructure/client-runtime.ts';
import { defineClientViews } from './infrastructure/client-views.ts';
import { defineElementRepository } from './infrastructure/sqlite-element-repository.ts';
import { svelteSourceCompiler } from './infrastructure/svelte-compiler.ts';
import { defineAssetsHandler } from './interface/assets-handler.ts';

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

/** Контекст design: шаблоны и компоненты, хранятся исходником Svelte и компилируются во время работы. */
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
  bus.onAny(
    (event) =>
      void (
        event.type.startsWith('design.') &&
        (loader.invalidate(), islands.invalidate())
      )
  );
  return {
    ...defineDesignService({ elements, compiler: svelteSourceCompiler, bus }),
    views: {
      template: loader.template,
      component: loader.component,
      island: islands.url,
      hydrator: islands.hydrator,
    },
    assets: defineAssetsHandler(islands),
  };
};

export type DesignService = ReturnType<typeof defineDesign>;

export type Views = DesignService['views'];
