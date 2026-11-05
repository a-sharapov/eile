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
  scriptsOf,
} from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';
import { findImportCycle } from '../domain/import-cycle.ts';
import { assertReferencesExist } from '../domain/script-graph.ts';
import type { ComponentSignature } from '../domain/signature.ts';
import type { SourceCompiler } from './source-compiler.ts';

const _changeOrCreate = (
  existing: Element | null,
  kind: ElementKind,
  name: ElementName,
  source: string
): ElementChange =>
  existing ? changeSource(source)(existing) : createElement(kind, name, source);

// Кто держит элемент в шаблоне или компоненте: компонент — импортом `$components/Name`, скрипт — вызовом
// `script('name')`. Скрипт держат и другие скрипты — ссылкой `./name.js`, её видит разбор (`references`).
const _HOLDS: Readonly<
  Record<ElementKind, (source: string, name: string) => boolean>
> = {
  template: () => false,
  component: (source, name) =>
    dependenciesOf(source).includes(name as ElementName),
  script: (source, name) => scriptsOf(source).includes(name as ElementName),
};

/** Скрипты того же сохранения, всё или ничего (`cms elements push`, набор правок): имя → исходник. */
export type ScriptBatch = ReadonlyMap<string, string>;

const _ALONE: ScriptBatch = new Map();

const _NOTHING: ReadonlySet<string> = new Set();

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

  // Скрипт ссылается только на те, что есть: в сайте или в том же сохранении. Круг ссылок — не ошибка:
  // вход и ленивый кусок сборки ссылаются друг на друга, у них общий хэш адреса (`site-scripts.ts`).
  const assertLinked =
    (batch: ScriptBatch) =>
    (change: ElementChange): ElementChange =>
      change.state.kind === 'script'
        ? (assertReferencesExist(
            change.state,
            compiler.references(change.state),
            (name) => batch.has(name) || elements.get('script', name) !== null
          ),
          change)
        : change;

  const persist = (batch: ScriptBatch) =>
    pipe(
      assertAcyclic,
      (_: ElementChange) => (compiler.check(_.state), _),
      assertLinked(batch),
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

  /**
   * Сохранение без записи: имя, циклы импортов, компиляция и ссылки скрипта — для предложения агента.
   * `batch` — скрипты, что придут вместе с этим.
   */
  const check = (
    kind: ElementKind,
    name: string,
    source: string,
    batch: ScriptBatch = _ALONE
  ): void =>
    pipe(
      (_: string) => parseElementName(_, kind),
      (_: ElementName) =>
        _changeOrCreate(elements.get(kind, _), kind, _, source),
      assertAcyclic,
      (_: ElementChange) => (compiler.check(_.state), _),
      assertLinked(batch),
      () => undefined
    )(name);

  /** `batch` — скрипты того же сохранения: на них можно ссылаться, даже если в сайте их ещё нет. */
  const save =
    (kind: ElementKind) =>
    (name: string, source: string, batch: ScriptBatch = _ALONE): void =>
      pipe(
        (_: string) => parseElementName(_, kind),
        (_: ElementName) =>
          _changeOrCreate(elements.get(kind, _), kind, _, source),
        (_: ElementChange) => void (_.events.length > 0 && persist(batch)(_))
      )(name);

  const load = (kind: ElementKind, name: string): Element =>
    elements.get(kind, parseElementName(name, kind)) ??
    fail('design.element_not_found', `There is no ${kind} "${name}"`);

  // Скрипт держит только скрипты; исходник скрипта (до 2 МиБ) для чужих видов и не читается.
  const holds = (
    holder: Element | null,
    kind: ElementKind,
    name: string
  ): boolean =>
    holder !== null &&
    (holder.kind === 'script'
      ? compiler.references(holder).some((_) => _.name === name)
      : _HOLDS[kind](holder.source, name));

  /**
   * Элементы, которые используют этот: шаблоны и компоненты, а скрипт — ещё и скрипты, что на него
   * ссылаются. Пока они есть, удалить его нельзя. `together` — `вид/имя` тех, что удаляются вместе с ним.
   */
  const importers = (
    name: string,
    kind: ElementKind = 'component',
    together: ReadonlySet<string> = _NOTHING
  ): ElementName[] =>
    elements
      .list()
      .filter(
        (_) =>
          (_.kind !== 'script' || kind === 'script') &&
          !(_.kind === kind && _.name === name) &&
          !together.has(`${_.kind}/${_.name}`) &&
          holds(elements.get(_.kind, _.name), kind, name)
      )
      .map((_) => _.name);

  /** `together` — `вид/имя` элементов, которые удаляются в той же транзакции: скрипты по кругу уходят разом. */
  const remove = (
    kind: ElementKind,
    name: string,
    together: ReadonlySet<string> = _NOTHING
  ): void =>
    pipe(
      (_: Element) =>
        ((holders) =>
          holders.length > 0
            ? fail(
                'design.element_in_use',
                `${_.name} is used by ${holders.join(', ')}`
              )
            : removeElement(_))(importers(_.name, kind, together)),
      (_: ElementChange) => (
        elements.remove(_.state.kind, _.state.name),
        _.events.forEach(bus.publish)
      )
    )(load(kind, name));

  return {
    elements: {
      list: elements.list,
      get: (kind: ElementKind, name: string): Element | null =>
        elements.get(kind, parseElementName(name, kind)),
      importers,
      remove,
      check,
    },
    templates: { save: save('template') },
    /** Скрипты сайта: ES-модули для браузера; адрес с хэшем добавляет `defineDesign`. */
    scripts: { save: save('script') },
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
