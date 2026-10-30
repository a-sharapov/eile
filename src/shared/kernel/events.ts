/** Факт, который уже произошёл. `type` — `context.event_name`. */
export type DomainEvent = { readonly type: string };

export type EventHandler<E extends DomainEvent = DomainEvent> = (
  event: E
) => void;

/** Синхронная шина в процессе: к возврату из `publish` все обработчики отработали. */
export type EventBus = {
  readonly publish: (event: DomainEvent) => void;
  readonly on: <E extends DomainEvent>(
    type: E['type'],
    handler: EventHandler<E>
  ) => void;
  readonly onAny: (handler: EventHandler) => void;
};
