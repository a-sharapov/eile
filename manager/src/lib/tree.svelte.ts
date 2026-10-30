import { api } from './api.ts';
import { defineLoad } from './loading.svelte.ts';
import type { PageNode } from './types.ts';

// Узлы не проксируются ($state.raw): дерево большого сайта — тысячи объектов, их только заменяют целиком.
let _nodes = $state.raw<readonly PageNode[]>([]);

// Дети по родителю — один проход вместо фильтра всего дерева на каждый узел.
const _index = $derived(
  Map.groupBy(
    _nodes.filter((_) => !_.trashed),
    (_) => _.parentId
  )
);

const _parents = $derived(new Map(_nodes.map((_) => [_.id, _.parentId])));

export var tree = {
  get nodes(): readonly PageNode[] {
    return _nodes;
  },
};

// Выбранные страницы для действий разом: Ctrl+щелчок, Shift+щелчок, Пробел.
let _selected = $state.raw<ReadonlySet<number>>(new Set());

export var selection = {
  get ids(): ReadonlySet<number> {
    return _selected;
  },
};

export var setSelection = (ids: Iterable<number>): void =>
  void (_selected = new Set(ids));

export var toggleSelected = (id: number): void =>
  setSelection(
    _selected.has(id)
      ? [..._selected].filter((_) => _ !== id)
      : [..._selected, id]
  );

export var clearSelection = (): void => setSelection([]);

/** Узел дерева, на котором стоит фокус клавиатуры: на него вернётся Tab. */
export var treeFocus = $state<{ id: number | null }>({ id: null });

// Большое дерево по умолчанию свёрнуто до открытой страницы, маленькое — раскрыто целиком.
const _OPEN_ALL_UP_TO = 300;

// Ветки, которые человек переключил вручную: состояние живёт дольше узла, который его показывает.
let _toggled = $state.raw<ReadonlySet<number>>(new Set());

// Предки по цепочке родителей; глубина ограничена числом узлов — на случай битых данных.
const _chain = (id: number | null, depth = 0): number[] =>
  id === null || depth > _nodes.length
    ? []
    : [id, ..._chain(_parents.get(id) ?? null, depth + 1)];

const _ancestorsOf = (id: number | null): ReadonlySet<number> =>
  new Set(_chain(id === null ? null : (_parents.get(id) ?? null)));

/** Открыта ли ветка: вручную переключённые — наоборот от умолчания. */
export var branchOpen = (id: number, current: number | null): boolean =>
  (_nodes.length <= _OPEN_ALL_UP_TO || _ancestorsOf(current).has(id)) !==
  _toggled.has(id);

export var toggleBranch = (id: number): void =>
  void (_toggled = _toggled.has(id)
    ? new Set([..._toggled].filter((_) => _ !== id))
    : new Set([..._toggled, id]));

/** Развернуть или свернуть всё дерево разом — кнопки строки инструментов. */
export var setAllBranches = (open: boolean, current: number | null): void =>
  void (_toggled = new Set(
    [..._index.keys()]
      .filter((_) => _ !== null)
      .map((_) => _ as number)
      .filter(
        (id) =>
          (_nodes.length <= _OPEN_ALL_UP_TO ||
            _ancestorsOf(current).has(id)) !== open
      )
  ));

export var loadTree = (): Promise<readonly PageNode[]> =>
  api.get<PageNode[]>('/pages').then((_) => ((_nodes = _), _));

/** Первая загрузка дерева: панель и обзор говорят «не загрузилось», а не показывают пустой сайт. */
export var treeLoad = defineLoad(loadTree);

/** Ветки корзины показываются отдельно, внизу дерева. */
export var childrenOf = (parentId: number | null): readonly PageNode[] =>
  _index.get(parentId) ?? [];

export var trashed = (): readonly PageNode[] => _nodes.filter((_) => _.trashed);

/** Страницы ветки под `id`, без неё самой: в корзину и обратно они идут вместе с разделом. */
export var descendantsOf = (id: number): PageNode[] =>
  _nodes.filter((_) => _.id !== id && _ancestorsOf(_.id).has(id));

/** В корзине сама страница или её раздел: на сайте её нет, в сводке её не считаем. */
export var inTrash = (node: PageNode): boolean =>
  node.trashed ||
  [..._ancestorsOf(node.id)].some(
    (id) => _nodes.find((_) => _.id === id)?.trashed === true
  );

/** Заголовки предков от корня: «О проекте › Команда» — чтобы отличать одноимённые страницы в поиске. */
export var trail = (id: number): string[] =>
  _chain(_parents.get(id) ?? null)
    .toReversed()
    .map((_) => _nodes.find((node) => node.id === _)?.title ?? String(_));

/** Предки от корня — для хлебных крошек. */
export var lineage = (id: number | null): PageNode[] =>
  (id === null ? [] : [id, ..._chain(_parents.get(id) ?? null)])
    .toReversed()
    .map((_) => _nodes.find((node) => node.id === _))
    .filter((_): _ is PageNode => _ !== undefined);

/** Предок ли `ancestor` для `id`: в свою ветку страницу не перетащить. */
export var isWithin = (id: number, ancestor: number): boolean =>
  id === ancestor || _ancestorsOf(id).has(ancestor);

const _SEARCH_LIMIT = 50;

/** Поиск по заголовку, заголовку в меню, алиасу и id — для дерева большого сайта. */
export var searchPages = (query: string): readonly PageNode[] =>
  ((needle) =>
    needle === ''
      ? []
      : _nodes
          .filter(
            (_) =>
              !_.trashed &&
              (String(_.id) === needle ||
                _.title.toLowerCase().includes(needle) ||
                _.menuTitle.toLowerCase().includes(needle) ||
                _.alias.includes(needle))
          )
          .slice(0, _SEARCH_LIMIT))(query.trim().toLowerCase());

/** Ветка в порядке дерева с глубиной; `without` и её потомки пропускаются — туда страницу не переместить. */
export var branchOrder = (
  without: number | null,
  parent: number | null = null,
  depth = 0
): { node: PageNode; depth: number }[] =>
  childrenOf(parent)
    .filter((_) => _.id !== without)
    .flatMap((node) => [
      { node, depth },
      ...branchOrder(without, node.id, depth + 1),
    ]);

/** Путь на сайте из алиасов: главная по нему отдаст редирект на `/`. */
export var sitePath = (id: number): string =>
  `/${[..._chain(_parents.get(id) ?? null).toReversed(), id]
    .map((_) => _nodes.find((node) => node.id === _)?.alias ?? '')
    .join('/')}`;

/** Страница изменилась не в редакторе (дерево, меню): открытый редактор перечитает её. */
export var pageChanged = $state<{ id: number; at: number }>({ id: 0, at: 0 });

export var markChanged = (id: number): void =>
  void ((pageChanged.id = id), (pageChanged.at = Date.now()));

/** Перетаскивание в дереве: что тащим и куда упадёт. */
export type DropZone = 'before' | 'inside' | 'after';

export var drag = $state<{
  id: number | null;
  target: number | null;
  zone: DropZone | null;
}>({ id: null, target: null, zone: null });

/** Статус для точки в дереве: из нескольких признаков побеждает самый важный. */
export var statusOf = (
  node: PageNode
): 'trashed' | 'scheduled' | 'published' | 'draft' =>
  // Раздел в корзине — и страница в корзине, хоть её флаг и не стоит: на сайте её нет.
  inTrash(node)
    ? 'trashed'
    : !node.published && node.publishAt
      ? 'scheduled'
      : node.published
        ? 'published'
        : 'draft';
