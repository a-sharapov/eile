import type { Element } from '../domain/element.ts';
import type { ComponentSignature } from '../domain/signature.ts';

/** Проверка до сохранения: опечатка в менеджере не должна ронять сайт. */
export type SourceCompiler = {
  /** Бросает DomainError с первой найденной проблемой. */
  readonly check: (element: Element) => void;
  /** Сигнатура по исходнику; исходник с ошибкой даёт пустую сигнатуру. */
  readonly describe: (
    element: Pick<Element, 'name' | 'source'>
  ) => ComponentSignature;
};
