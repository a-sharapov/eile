import type { Brand } from '../../../shared/kernel/brand.ts';
import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import type { DesignEvent } from './events.ts';

/**
 * Шаблон рендерит страницу целиком; компонент импортируют шаблоны и другие компоненты; скрипт — ES-модуль
 * для браузера, его подключают шаблоны и компоненты по адресу `script(name)`.
 */
export type ElementKind = 'template' | 'component' | 'script';

/**
 * У шаблона и компонента — PascalCase: Svelte считает компонентом только тег с заглавной буквы. У скрипта —
 * строчная латиница с дефисом: `kitchen-stage`.
 */
export type ElementName = Brand<string, 'ElementName'>;

/** Шаблон, компонент или скрипт сайта; в Evo шаблоны и чанки назывались элементами. */
export type Element = {
  readonly kind: ElementKind;
  readonly name: ElementName;
  /** Исходник Svelte 5 в режиме runes; у скрипта — ES-модуль на JavaScript. */
  readonly source: string;
  readonly revision: number;
};

export type ElementChange = Changed<Element, DesignEvent>;

export var COMPONENT_IMPORT_PREFIX = '$components/';

const _SVELTE_NAME = {
  pattern: /^[A-Z][A-Za-z0-9]{0,63}$/,
  code: 'design.invalid_name',
  rule: 'must be PascalCase latin letters and digits',
};

// Имя скрипта — часть адреса `/_cms/scripts/<имя>.<хэш>.js`: строчная латиница, цифры и дефис.
const _NAMES: Readonly<Record<ElementKind, typeof _SVELTE_NAME>> = {
  template: _SVELTE_NAME,
  component: _SVELTE_NAME,
  script: {
    pattern: /^[a-z0-9][a-z0-9-]{0,63}$/,
    code: 'design.invalid_script_name',
    rule: 'must be lowercase latin letters, digits and hyphens',
  },
};

// По `from '…'` или `import '…'`: без разбора того, что импортируется, — линейно на любом исходнике.
const _COMPONENT_IMPORT = /\b(?:from|import)\s*['"]\$components\/([^'"]+)['"]/g;
// Вызов `script('kitchen-stage')` с именем строкой: по нему видно, где скрипт подключён.
const _SCRIPT_CALL = /\bscript\(\s*['"]([a-z0-9][a-z0-9-]*)['"]\s*\)/g;

const _encoder = new TextEncoder();

const _SVELTE_LIMIT = {
  max: 256 * 1024,
  size: (source: string) => source.length,
  message: `Source is larger than ${256 * 1024} characters`,
};

// Исходник Svelte меряем знаками; скрипт — готовый файл для браузера, его байтами: столько и уйдёт по сети.
const _LIMITS: Readonly<Record<ElementKind, typeof _SVELTE_LIMIT>> = {
  template: _SVELTE_LIMIT,
  component: _SVELTE_LIMIT,
  script: {
    max: 2 * 1024 * 1024,
    size: (source) => _encoder.encode(source).byteLength,
    message: 'Script is larger than 2 MiB',
  },
};

export var parseElementName = (
  raw: string,
  kind: ElementKind = 'component'
): ElementName =>
  ((rule) =>
    rule.pattern.test(raw)
      ? (raw as ElementName)
      : fail(rule.code, `Name "${raw}" ${rule.rule}`))(_NAMES[kind]);

export var dependenciesOf = (source: string): ElementName[] =>
  [...new Set([...source.matchAll(_COMPONENT_IMPORT)].map((_) => _[1]!))].map(
    (_) => parseElementName(_)
  );

/** Скрипты, которые исходник подключает вызовом `script('имя')`, — каждый один раз. */
export var scriptsOf = (source: string): ElementName[] =>
  [...new Set([...source.matchAll(_SCRIPT_CALL)].map((_) => _[1]!))].map(
    (_) => _ as ElementName
  );

const _source = (kind: ElementKind, source: string): string =>
  ((limit) =>
    !source.trim()
      ? fail('design.empty_source', 'Source cannot be empty')
      : limit.size(source) > limit.max
        ? fail('design.source_too_large', limit.message)
        : source)(_LIMITS[kind]);

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
  _withChangedEvent({
    kind,
    name,
    source: _source(kind, source),
    revision: 1,
  });

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
          source: _source(element.kind, source),
          revision: element.revision + 1,
        });
