import type { Field, FieldName } from './field.ts';

export type FieldRepository = {
  readonly all: () => readonly Field[];
  readonly get: (name: FieldName) => Field | null;
  readonly save: (field: Field) => void;
  /** Удаляет описание и значения поля на всех страницах. */
  readonly remove: (name: FieldName) => void;
  /** Сколько страниц хранят своё значение поля. */
  readonly usage: (name: FieldName) => number;
};
