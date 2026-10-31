import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  changeSource,
  createElement,
  dependenciesOf,
  type Element,
  type ElementChange,
  type ElementKind,
  type ElementName,
  parseElementName,
  removeElement,
} from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';
import { findImportCycle } from '../domain/import-cycle.ts';
import type { ComponentSignature } from '../domain/signature.ts';
import type { SourceCompiler } from './source-compiler.ts';

const _changeOrCreate = (
  existing: Element | null,
  kind: ElementKind,
  name: ElementName,
  source: string
): ElementChange =>
  existing ? changeSource(source)(existing) : createElement(kind, name, source);

export var defineDesignService = ({
  elements,
  compiler,
  bus,
}: {
  elements: ElementRepository;
  compiler: SourceCompiler;
  bus: EventBus;
}) => {
  const storedDependencies = (name: ElementName): ElementName[] =>
    dependenciesOf(elements.get('component', name)?.source ?? '');

  const cycleOf = (element: Element): ElementName[] | null =>
    element.kind === 'component'
      ? findImportCycle(
          element.name,
          dependenciesOf(element.source),
          storedDependencies
        )
      : null;

  const assertAcyclic = (change: ElementChange): ElementChange =>
    pipe(cycleOf, (cycle: ElementName[] | null) =>
      cycle
        ? fail('design.import_cycle', `Import cycle: ${cycle.join(' → ')}`)
        : change
    )(change.state);

  const persist = pipe(
    assertAcyclic,
    (_: ElementChange) => (compiler.check(_.state), _),
    (_: ElementChange) => (elements.save(_.state), _),
    (_: ElementChange) => _.events.forEach(bus.publish)
  );

  // Разбор исходника — раз на ревизию: каталог открывают на каждой странице менеджера.
  const signatures = new Map<
    ElementName,
    { readonly revision: number; readonly signature: ComponentSignature }
  >();

  const describe = (name: ElementName, revision: number): ComponentSignature =>
    ((signature) => (signatures.set(name, { revision, signature }), signature))(
      compiler.describe(elements.get('component', name)!)
    );

  const signatureOf = ({
    name,
    revision,
  }: Pick<Element, 'name' | 'revision'>): ComponentSignature =>
    signatures.get(name)?.revision === revision
      ? signatures.get(name)!.signature
      : describe(name, revision);

  const save =
    (kind: ElementKind) =>
    (name: string, source: string): void =>
      pipe(
        parseElementName,
        (_: ElementName) =>
          _changeOrCreate(elements.get(kind, _), kind, _, source),
        (_: ElementChange) => void (_.events.length > 0 && persist(_))
      )(name);

  const load = (kind: ElementKind, name: string): Element =>
    elements.get(kind, parseElementName(name)) ??
    fail('design.element_not_found', `There is no ${kind} "${name}"`);

  /** Элементы, которые импортируют компонент: пока они есть, удалить его нельзя. */
  const importers = (name: string): ElementName[] =>
    elements
      .list()
      .filter(
        (_) =>
          dependenciesOf(elements.get(_.kind, _.name)?.source ?? '').includes(
            name as ElementName
          ) && !(_.kind === 'component' && _.name === name)
      )
      .map((_) => _.name);

  const remove = (kind: ElementKind, name: string): void =>
    pipe(
      (_: Element) =>
        kind === 'component' && importers(_.name).length > 0
          ? fail(
              'design.element_in_use',
              `${_.name} is imported by ${importers(_.name).join(', ')}`
            )
          : removeElement(_),
      (_: ElementChange) => (
        elements.remove(_.state.kind, _.state.name),
        _.events.forEach(bus.publish)
      )
    )(load(kind, name));

  return {
    elements: {
      list: elements.list,
      get: (kind: ElementKind, name: string): Element | null =>
        elements.get(kind, parseElementName(name)),
      importers,
      remove,
    },
    templates: { save: save('template') },
    components: {
      save: save('component'),
      /** Компоненты с параметрами: из них менеджер собирает контент страницы. */
      catalog: (): ComponentSignature[] =>
        elements
          .list()
          .filter((_) => _.kind === 'component')
          .map(signatureOf),
    },
  };
};
