import type { Element, ElementKind, ElementName } from './element.ts';

export type ElementRepository = {
  readonly get: (kind: ElementKind, name: ElementName) => Element | null;
  readonly list: () => Pick<Element, 'kind' | 'name' | 'revision'>[];
  readonly save: (element: Element) => void;
  readonly remove: (kind: ElementKind, name: ElementName) => void;
};
