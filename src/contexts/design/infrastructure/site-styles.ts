import { attempt } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  COMPONENT_IMPORT_PREFIX,
  type ElementKind,
  type ElementName,
} from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';
import { ASSETS_PREFIX } from './client-runtime.ts';
import type { CompiledView, ServerCompiler } from './svelte-compiler.ts';
import { isScoped, type ViewStyle } from './svelte-styles.ts';

/** Стили сайта: `/_cms/styles/<имя>.<хэш>.css`. */
export var STYLES_PREFIX = `${ASSETS_PREFIX}/styles/`;

/** Файл стилей: общий файл сайта или свой файл элемента; хэш — от содержимого. */
export type StyleFile = {
  readonly name: string;
  readonly hash: string;
  readonly source: string;
  /** Спросили прежний хэш: отдаём текущую версию, но не навсегда. */
  readonly stale?: boolean;
};

// Имя общего файла строчное: с элементом (у них PascalCase) не совпадёт.
const _SITE = 'site';

const _PATH = /^([A-Za-z0-9]+)\.([a-z0-9]+)\.css$/;

/** Стиль элемента в каталоге: file null — он в общем файле сайта. */
type Entry = { readonly code: string; readonly file: StyleFile | null };

type Catalog = {
  readonly site: StyleFile | null;
  /** По классу области; у шаблона и компонента с одним именем класс один — их различает код. */
  readonly entries: ReadonlyMap<string, readonly Entry[]>;
  /** Текущие файлы по `имя.хэш` и по имени — для адреса с прежним хэшем. */
  readonly exact: ReadonlyMap<string, StyleFile>;
  readonly latest: ReadonlyMap<string, StyleFile>;
};

type Compiled = {
  readonly name: string;
  readonly view: CompiledView;
};

type Styled = {
  readonly name: string;
  readonly style: ViewStyle;
};

type Placed = {
  readonly style: ViewStyle;
  readonly file: StyleFile | null;
};

const _fileOf = (name: string, source: string): StyleFile => ({
  name,
  hash: Bun.hash(source).toString(36),
  source,
});

const _urlOf = (file: StyleFile): string =>
  `${STYLES_PREFIX}${file.name}.${file.hash}.css`;

const _link = (file: StyleFile): string =>
  `<link rel="stylesheet" href="${_urlOf(file)}">`;

// Как выводит сам Svelte: этот стиль остаётся в странице.
const _inline = (style: ViewStyle): string =>
  `<style id="${style.hash}">${style.code}</style>`;

const _dependencies = (view: CompiledView): string[] =>
  view.imports
    .filter((_) => _.startsWith(COMPONENT_IMPORT_PREFIX))
    .map((_) => `component/${_.slice(COMPONENT_IMPORT_PREFIX.length)}`);

// Родитель раньше детей, как при рендере: шаблоны по имени и за каждым его импорты, затем остальные
// компоненты. На ничьей специфичности побеждает правило ниже — как в странице, где дети рисуются позже.
const _ordered = (views: ReadonlyMap<string, Compiled>): Compiled[] => {
  const visit = (order: readonly string[], key: string): readonly string[] =>
    order.includes(key) || !views.has(key)
      ? order
      : _dependencies(views.get(key)!.view).reduce(visit, [...order, key]);
  return [...views.keys()].reduce(visit, []).map((_) => views.get(_)!);
};

// `<svelte:options css="injected" />` — автор оставляет стиль в странице: в файлы его не кладём.
const _styled = (compiled: readonly Compiled[]): Styled[] =>
  compiled.flatMap(({ name, view }) =>
    view.style && !view.inline ? [{ name, style: view.style }] : []
  );

/**
 * Стили шаблонов и компонентов файлами с хэшем вместо `<style>` в каждой странице (ADR 0047). CSS, который
 * привязан к своему компоненту, лежит в одном файле сайта: его скачивают раз на весь визит. CSS с правилами
 * на весь документ — у каждого такого элемента свой файл, и подключают его только страницы, где элемент
 * нарисован.
 */
export var defineSiteStyles = ({
  elements,
  compile,
}: {
  elements: ElementRepository;
  compile: ServerCompiler;
}) => {
  let built: Catalog | null = null;
  // Разбор CSS — раз на версию вида: компилятор отдаёт тот же объект, пока исходник не менялся.
  const scoped = new WeakMap<ViewStyle, boolean>();

  const scopedStyle = (style: ViewStyle): boolean =>
    scoped.get(style) ?? ((_) => (scoped.set(style, _), _))(isScoped(style));

  // Элемент, который не компилируется, в стили не попадает: его страницы и так не рисуются.
  const compiled = (
    kind: ElementKind,
    name: ElementName
  ): (readonly [string, Compiled])[] => {
    const element = elements.get(kind, name);
    const view =
      element &&
      attempt(
        () => compile(element),
        () => null
      );
    return view ? [[`${kind}/${name}`, { name, view }]] : [];
  };

  const views = (): ReadonlyMap<string, Compiled> =>
    new Map(
      elements
        .list()
        .filter((_) => _.kind !== 'script')
        .flatMap((_) => compiled(_.kind, _.name))
    );

  const place = (styled: readonly Styled[]): Placed[] =>
    styled.map((_) => ({
      style: _.style,
      file: scopedStyle(_.style) ? null : _fileOf(_.name, _.style.code),
    }));

  const catalogOf = (placed: readonly Placed[]): Catalog => {
    const shared = placed.filter((_) => _.file === null);
    const site =
      shared.length > 0
        ? _fileOf(_SITE, shared.map((_) => _.style.code).join('\n'))
        : null;
    const files = [
      ...(site ? [site] : []),
      ...placed.flatMap((_) => (_.file ? [_.file] : [])),
    ];
    return {
      site,
      entries: new Map(
        [...Map.groupBy(placed, (_) => _.style.hash)].map(
          ({ 0: hash, 1: group }) => [
            hash,
            group.map((_) => ({ code: _.style.code, file: _.file })),
          ]
        )
      ),
      exact: new Map(files.map((_) => [`${_.name}.${_.hash}`, _])),
      latest: new Map(files.map((_) => [_.name, _])),
    };
  };

  const build = (): Catalog =>
    pipe(views, _ordered, _styled, place, catalogOf)();

  const current = (): Catalog => (built ??= build());

  // null — стиль в общем файле сайта; иначе тег: свой файл элемента или `<style>`, если стиля нет в
  // каталоге (`css="injected"`, вид старше каталога).
  const tagOf =
    (catalog: Catalog) =>
    (style: ViewStyle): string | null =>
      ((entry) =>
        entry === undefined ? _inline(style) : entry.file && _link(entry.file))(
        catalog.entries.get(style.hash)?.find((_) => _.code === style.code)
      );

  return {
    /**
     * Теги `<head>` для стилей, которые нарисовал рендер, по порядку: свои файлы и `<style>` — как шли,
     * общий файл сайта — последним, если он нужен. Ничего не нарисовано — пусто.
     */
    tags: (styles: readonly ViewStyle[]): string[] => {
      const catalog = current();
      const tags = styles.filter((_) => _.code !== '').map(tagOf(catalog));
      const site =
        catalog.site && tags.includes(null) ? [_link(catalog.site)] : [];
      return [...new Set([...tags.filter((_) => _ !== null), ...site])];
    },
    /** Файл по пути `/_cms/styles/…`; прежний хэш — текущая версия с пометкой stale; null — нет такого. */
    file: (path: string): StyleFile | null => {
      const match = _PATH.exec(path.slice(STYLES_PREFIX.length));
      const catalog = match && current();
      const latest = match && catalog?.latest.get(match[1]!);
      return match && catalog
        ? (catalog.exact.get(`${match[1]}.${match[2]}`) ??
            (latest ? { ...latest, stale: true } : null))
        : null;
    },
    invalidate: (): void => void (built = null),
  };
};
