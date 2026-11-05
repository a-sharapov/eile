import { attempt } from '../../../shared/kernel/errors.ts';
import { type ElementName, parseElementName } from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';
import {
  reachableScripts,
  referencedNames,
  type ScriptReference,
  scriptComponent,
} from '../domain/script-graph.ts';
import { ASSETS_PREFIX } from './client-runtime.ts';
import { linkScript, type ScriptModules, scriptHash } from './script-module.ts';

/** Скрипты сайта: `/_cms/scripts/<имя>.<хэш>.js`. */
export var SCRIPTS_PREFIX = `${ASSETS_PREFIX}/scripts/`;

/** Текущая версия скрипта: имя, хэш адреса и тело для браузера — ссылки `./имя.js` уже с хэшами. */
export type ScriptFile = {
  readonly name: string;
  readonly hash: string;
  readonly source: string;
  /** Скрипты, от которых зависит адрес: сам и все, до кого доходят ссылки, в том числе пропавшие. */
  readonly closure: readonly string[];
};

type _Node = {
  readonly source: string;
  readonly references: readonly ScriptReference[];
  readonly names: readonly ElementName[];
};

// Имя проверяет домен: здесь только разрезать «имя.хэш.js».
const _PATH = /^([^/.]+)\.([a-z0-9]+)\.js$/;

const _pathOf = (name: string, hash: string | null): string =>
  hash === null ? `./${name}.js` : `./${name}.${hash}.js`;

// Хэш компоненты: исходники членов по имени и хэши компонент, на которые они ссылаются снаружи. Скрипт без
// ссылок сохраняет прежний хэш — хэш исходника.
const _componentHash = (
  members: readonly (readonly [string, _Node])[],
  outside: ReadonlyMap<string, string | null>
): string =>
  members.length === 1 && members[0]![1].names.length === 0
    ? scriptHash(members[0]![1].source)
    : scriptHash(
        [
          ...members.map(({ 0: name, 1: node }) => `${name}\n${node.source}`),
          ...[...outside]
            .map(({ 0: name, 1: hash }) => `${name}.${hash ?? ''}`)
            .toSorted(),
        ].join('\0')
      );

/**
 * Адреса скриптов с хэшем: прежний хэш — 404, страницы с ним перерисовывает событие правки. Скрипты, что
 * ссылаются друг на друга по кругу (вход ↔ ленивый кусок сборки), — одна компонента с одним хэшем: он
 * считается по исходникам всех её скриптов и хэшам компонент, до которых они доходят. Текущие версии
 * живут в памяти до любого события `design.*`: адрес спрашивает каждая страница.
 */
export var defineSiteScripts = (
  elements: ElementRepository,
  modules: Pick<ScriptModules, 'references'>
) => {
  // Только найденные: адрес с выдуманным именем не должен раздувать память сервера.
  const nodes = new Map<string, _Node>();
  const reaches = new Map<string, ReadonlySet<ElementName>>();
  const files = new Map<string, ScriptFile>();

  const read = (name: string): _Node | null =>
    ((element) =>
      element &&
      ((references) => ({
        source: element.source,
        references,
        names: referencedNames(references),
      }))(modules.references(element)))(
      attempt(
        () => elements.get('script', parseElementName(name, 'script')),
        () => null
      )
    );

  const nodeOf = (name: string): _Node | null =>
    nodes.get(name) ??
    ((node) => (void (node && nodes.set(name, node)), node))(read(name));

  const reach = (name: ElementName): ReadonlySet<ElementName> =>
    reaches.get(name) ??
    ((found) => (void (nodeOf(name) && reaches.set(name, found)), found))(
      reachableScripts(name, (_) => nodeOf(_)?.names ?? [])
    );

  // Компоненты ниже по ссылкам считаются раньше: граф компонент без циклов, рекурсия кончается.
  const component = (name: ElementName): ScriptFile[] =>
    ((members) =>
      ((outside) =>
        ((hash) =>
          members.map(({ 0: member, 1: node }) => ({
            name: member,
            hash,
            source: linkScript(node.source, node.references, (_) =>
              _pathOf(_, outside.has(_) ? (outside.get(_) ?? null) : hash)
            ),
            closure: [...reach(member)],
          })))(_componentHash(members, outside)))(
        new Map(
          [...new Set(members.flatMap(({ 1: node }) => node.names))]
            .filter((_) => !members.some(({ 0: member }) => member === _))
            .map((_) => [_, fileOf(_)?.hash ?? null] as const)
        )
      ))(scriptComponent(name, reach).map((_) => [_, nodeOf(_)!] as const));

  const fileOf = (name: string): ScriptFile | null =>
    files.get(name) ??
    (nodeOf(name)
      ? (component(name as ElementName).forEach(
          (_) => void files.set(_.name, _)
        ),
        files.get(name)!)
      : null);

  const urlOf = (file: ScriptFile): string =>
    `${SCRIPTS_PREFIX}${file.name}.${file.hash}.js`;

  return {
    /** Адрес текущей версии; null — такого скрипта нет. */
    url: (name: string): string | null =>
      ((file) => file && urlOf(file))(fileOf(name)),
    /** Скрипты, правка которых меняет адрес `name`: им страница с `script(name)` пишет теги кэша. */
    closure: (name: string): readonly string[] =>
      fileOf(name)?.closure ?? [name],
    /** Скрипт по пути `/_cms/scripts/…`; null — нет такого или хэш прежний. */
    file: (path: string): ScriptFile | null =>
      ((match) =>
        match
          ? ((file) => (file?.hash === match[2] ? file : null))(
              fileOf(match[1]!)
            )
          : null)(_PATH.exec(path.slice(SCRIPTS_PREFIX.length))),
    invalidate: (): void => (nodes.clear(), reaches.clear(), files.clear()),
  };
};
