import { pipe } from './pipe.ts';

/** Результат перехода агрегата: новое состояние и события, которые он породил. */
export type Changed<S, E> = {
  readonly state: S;
  readonly events: readonly E[];
};

export var changed = <S, E>(state: S, ...events: E[]): Changed<S, E> => ({
  state,
  events,
});

/** Следующий переход над результатом предыдущего; события копятся. */
export var chain =
  <S, E>(next: (state: S) => Changed<S, E>) =>
  (previous: Changed<S, E>): Changed<S, E> =>
    pipe<S, Changed<S, E>>(next, (_: Changed<S, E>) =>
      changed(_.state, ...previous.events, ..._.events)
    )(previous.state);
