type _IsAny<T> = 0 extends 1 & T ? true : false;

// Распределяется по объединению: шаг, который иногда возвращает Promise, тоже асинхронный.
type _IsAsync<T> =
  _IsAny<T> extends true
    ? false
    : T extends PromiseLike<unknown>
      ? true
      : false;

/** Ответ цепочки: Promise, если хоть один шаг вернул Promise, иначе ответ последнего шага. */
export type Piped<Steps extends readonly unknown[], Last> = true extends
  | { [K in keyof Steps]: _IsAsync<Steps[K]> }[number]
  | _IsAsync<Last>
  ? Promise<Awaited<Last>>
  : Last;

type _Step<In, Out> = (arg: Awaited<In>) => Out;

/**
 * Перегрузки по числу шагов: каждый шаг получает ответ предыдущего (после Promise — его значение), и tsc
 * проверяет каждый стык. Тип входа — из первого шага; шаг без параметра — вход `void`.
 */
type Pipe = {
  <A = void, B = unknown>(ab: (a: A) => B): (a: A) => B;
  <A = void, B = unknown, C = unknown>(
    ab: (a: A) => B,
    bc: _Step<B, C>
  ): (a: A) => Piped<[B], C>;
  <A = void, B = unknown, C = unknown, D = unknown>(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>
  ): (a: A) => Piped<[B, C], D>;
  <A = void, B = unknown, C = unknown, D = unknown, E = unknown>(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>
  ): (a: A) => Piped<[B, C, D], E>;
  <A = void, B = unknown, C = unknown, D = unknown, E = unknown, F = unknown>(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>,
    ef: _Step<E, F>
  ): (a: A) => Piped<[B, C, D, E], F>;
  <
    A = void,
    B = unknown,
    C = unknown,
    D = unknown,
    E = unknown,
    F = unknown,
    G = unknown,
  >(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>,
    ef: _Step<E, F>,
    fg: _Step<F, G>
  ): (a: A) => Piped<[B, C, D, E, F], G>;
  <
    A = void,
    B = unknown,
    C = unknown,
    D = unknown,
    E = unknown,
    F = unknown,
    G = unknown,
    H = unknown,
  >(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>,
    ef: _Step<E, F>,
    fg: _Step<F, G>,
    gh: _Step<G, H>
  ): (a: A) => Piped<[B, C, D, E, F, G], H>;
  <
    A = void,
    B = unknown,
    C = unknown,
    D = unknown,
    E = unknown,
    F = unknown,
    G = unknown,
    H = unknown,
    I = unknown,
  >(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>,
    ef: _Step<E, F>,
    fg: _Step<F, G>,
    gh: _Step<G, H>,
    hi: _Step<H, I>
  ): (a: A) => Piped<[B, C, D, E, F, G, H], I>;
  <
    A = void,
    B = unknown,
    C = unknown,
    D = unknown,
    E = unknown,
    F = unknown,
    G = unknown,
    H = unknown,
    I = unknown,
    J = unknown,
  >(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>,
    ef: _Step<E, F>,
    fg: _Step<F, G>,
    gh: _Step<G, H>,
    hi: _Step<H, I>,
    ij: _Step<I, J>
  ): (a: A) => Piped<[B, C, D, E, F, G, H, I], J>;
  <
    A = void,
    B = unknown,
    C = unknown,
    D = unknown,
    E = unknown,
    F = unknown,
    G = unknown,
    H = unknown,
    I = unknown,
    J = unknown,
    K = unknown,
  >(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>,
    ef: _Step<E, F>,
    fg: _Step<F, G>,
    gh: _Step<G, H>,
    hi: _Step<H, I>,
    ij: _Step<I, J>,
    jk: _Step<J, K>
  ): (a: A) => Piped<[B, C, D, E, F, G, H, I, J], K>;
  <
    A = void,
    B = unknown,
    C = unknown,
    D = unknown,
    E = unknown,
    F = unknown,
    G = unknown,
    H = unknown,
    I = unknown,
    J = unknown,
    K = unknown,
    L = unknown,
  >(
    ab: (a: A) => B,
    bc: _Step<B, C>,
    cd: _Step<C, D>,
    de: _Step<D, E>,
    ef: _Step<E, F>,
    fg: _Step<F, G>,
    gh: _Step<G, H>,
    hi: _Step<H, I>,
    ij: _Step<I, J>,
    jk: _Step<J, K>,
    kl: _Step<K, L>
  ): (a: A) => Piped<[B, C, D, E, F, G, H, I, J, K], L>;
};

/**
 * Композиция шагов слева направо. Шаг, вернувший Promise, переводит остаток
 * цепочки на `.then`; `null`, `0` и `''` передаются дальше как значения. Асинхронный сценарий —
 * `Promise.resolve(x).then(pipe(…))`: синхронная ошибка любого шага становится отказом.
 */
export var pipe: Pipe =
  (...fns: Array<(arg: any) => any>) =>
  (payload?: unknown): any =>
    fns.reduce<unknown>(
      (arg, fn) => (arg instanceof Promise ? arg.then(fn) : fn(arg)),
      payload
    );
