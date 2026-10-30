/**
 * Композиция шагов слева направо. Шаг, вернувший Promise, переводит остаток
 * цепочки на `.then`; `null`, `0` и `''` передаются дальше как значения.
 */
export var pipe =
  <T, U = T>(...fns: Array<(arg: any) => any>) =>
  (payload?: T): U =>
    fns.reduce<unknown>(
      (arg, fn) => (arg instanceof Promise ? arg.then(fn) : fn(arg)),
      payload
    ) as U;
