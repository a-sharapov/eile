import type { ElementKind, ElementName } from './element.ts';

export type DesignEvent = {
  readonly type: 'design.element_changed' | 'design.element_removed';
  readonly kind: ElementKind;
  readonly name: ElementName;
  readonly revision: number;
};
