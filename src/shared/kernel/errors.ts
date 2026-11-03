/** Место в исходнике: строка и столбец, оба с единицы. */
export type SourcePoint = { readonly line: number; readonly column: number };

/**
 * Нарушенное бизнес-правило. `code` — стабильная строка `context.reason`; `at` — где в исходнике
 * ошибка, если она в коде шаблона, компонента или плагина.
 */
export type DomainError = Error & {
  readonly code: string;
  readonly at?: SourcePoint;
};

export var domainError = (
  code: string,
  message: string,
  at?: SourcePoint
): DomainError =>
  Object.assign(new Error(message), {
    name: 'DomainError',
    code,
    ...(at ? { at } : {}),
  });

/** Отказ внутри выражения: `valid ? value : fail(…)`. */
export var fail = (code: string, message: string, at?: SourcePoint): never => {
  throw domainError(code, message, at);
};

export var isDomainError = (error: unknown): error is DomainError =>
  error instanceof Error && error.name === 'DomainError';

/** Та же ошибка дальше — из выражения: `attempt(run, (error) => (cleanup(), rethrow(error)))`. */
export var rethrow = (error: unknown): never => {
  throw error;
};

/** Синхронный вызов API, которое сообщает об ошибке исключением. */
export var attempt = <T>(run: () => T, recover: (error: unknown) => T): T => {
  try {
    return run();
  } catch (error) {
    return recover(error);
  }
};
