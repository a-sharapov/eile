import type {
  DomainEvent,
  EventBus,
  EventHandler,
} from '../shared/kernel/events.ts';

export var defineEventBus = (): EventBus => {
  let byType: Readonly<Record<string, readonly EventHandler[]>> = {};
  let any: readonly EventHandler[] = [];

  return {
    publish: (event: DomainEvent) =>
      [...(byType[event.type] ?? []), ...any].forEach(
        (handler) => void handler(event)
      ),
    on: (type, handler) =>
      void (byType = {
        ...byType,
        [type]: [...(byType[type] ?? []), handler as EventHandler],
      }),
    onAny: (handler) => void (any = [...any, handler]),
  };
};
