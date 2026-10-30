declare const brand: unique symbol;

/** Номинальный тип: значение получают только через его `parse*`. */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
