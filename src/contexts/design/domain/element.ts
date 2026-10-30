import type { Brand } from '../../../shared/kernel/brand.ts';
import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import type { DesignEvent } from './events.ts';

/** Шаблон рендерит страницу целиком; компонент импортируют шаблоны и другие компоненты. */
export type ElementKind = 'template' | 'component';

/** PascalCase: Svelte считает компонентом только тег с заглавной буквы. */
export type ElementName = Brand<string, 'ElementName'>;

/** Шаблон или компонент; в Evo оба назывались элементами. */
export type Element = {
  readonly kind: ElementKind;
  readonly name: ElementName;
  /** Исходник Svelte 5 в режиме runes. */
  readonly source: string;
  readonly revision: number;
};

export type ElementChange = Changed<Element, DesignEvent>;

export var COMPONENT_IMPORT_PREFIX = '$components/';

const _NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;
// По `from '…'` или `import '…'`: без разбора того, что импортируется, — линейно на любом исходнике.
const _COMPONENT_IMPORT = /\b(?:from|import)\s*['"]\$components\/([^'"]+)['"]/g;
const _MAX_SOURCE_LENGTH = 256 * 1024;

export var parseElementName = (raw: string): ElementName =>
  _NAME.test(raw)
    ? (raw as ElementName)
    : fail(
        'design.invalid_name',
        `Name "${raw}" must be PascalCase latin letters and digits`
      );

export var dependenciesOf = (source: string): ElementName[] =>
  [...new Set([...source.matchAll(_COMPONENT_IMPORT)].map((_) => _[1]!))].map(
    parseElementName
  );

const _source = (source: string): string =>
  !source.trim()
    ? fail('design.empty_source', 'Source cannot be empty')
    : source.length > _MAX_SOURCE_LENGTH
      ? fail(
          'design.source_too_large',
          `Source is larger than ${_MAX_SOURCE_LENGTH} characters`
        )
      : source;

const _withChangedEvent = (element: Element): ElementChange =>
  changed<Element, DesignEvent>(element, {
    type: 'design.element_changed',
    kind: element.kind,
    name: element.name,
    revision: element.revision,
  });

export var createElement = (
  kind: ElementKind,
  name: ElementName,
  source: string
): ElementChange =>
  _withChangedEvent({ kind, name, source: _source(source), revision: 1 });

/** Удаление: событие несёт последнюю ревизию — по ней сбрасываются кэши. */
export var removeElement = (element: Element): ElementChange =>
  changed<Element, DesignEvent>(element, {
    type: 'design.element_removed',
    kind: element.kind,
    name: element.name,
    revision: element.revision,
  });

export var changeSource =
  (source: string) =>
  (element: Element): ElementChange =>
    source === element.source
      ? changed(element)
      : _withChangedEvent({
          ...element,
          source: _source(source),
          revision: element.revision + 1,
        });
