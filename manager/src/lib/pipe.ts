/** Копия контракта src/shared/kernel/pipe.ts: шаг с Promise переводит цепочку на `.then`. */
export var pipe =
  <T, U = T>(...fns: Array<(arg: any) => any>) =>
  (payload?: T): U =>
    fns.reduce<unknown>(
      (arg, fn) => (arg instanceof Promise ? arg.then(fn) : fn(arg)),
      payload
    ) as U;
