<script lang="ts">
import { tick } from 'svelte';
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import {
  moveMany,
  publishMany,
  shiftPage,
  trashMany,
} from '#lib/page-actions.ts';
import { session } from '#lib/session.svelte.ts';
import {
  childrenOf,
  clearSelection,
  descendantsOf,
  loadTree,
  searchPages,
  selection,
  setAllBranches,
  setSelection,
  statusOf,
  toggleBranch,
  toggleSelected,
  trail,
  trashed,
  tree,
  treeFocus,
  treeLoad,
} from '#lib/tree.svelte.ts';
import type { PageNode } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageGlyph from '#lib/ui/PageGlyph.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import TreeMenu from './pages/TreeMenu.svelte';
import TreeNode from './pages/TreeNode.svelte';

const roots = $derived(childrenOf(null));
const bin = $derived(trashed());
const blank = resolve('/(app)/pages/[id]', { id: 'new' });

// Видимый узел с фокусом: последний, где была клавиатура, иначе открытая страница, иначе первая.
const focusId = $derived(
  [treeFocus.id, Number(page.params.id)].find((id) =>
    tree.nodes.some((_) => _.id === id && !_.trashed)
  ) ??
    roots[0]?.id ??
    null
);

$effect(() => void treeLoad.retry());

let query = $state('');
let search: HTMLInputElement;
let results: HTMLUListElement | undefined = $state();
const found = $derived(searchPages(query));
const searching = $derived(query.trim() !== '');

// Меню действий: у какой страницы, где на экране и куда вернуть фокус после закрытия.
let menu = $state<{
  node: PageNode;
  x: number;
  y: number;
  from: HTMLElement | null;
} | null>(null);

const openMenu = (node: PageNode, x: number, y: number) =>
  void (menu = {
    node,
    x,
    y,
    from: document.activeElement as HTMLElement | null,
  });

const closeMenu = (returnFocus: boolean) => {
  const from = menu?.from;
  menu = null;
  void (returnFocus && from?.focus());
};

const pageHref = (node: PageNode) =>
  resolve('/(app)/pages/[id]', { id: String(node.id) });

// «/» — к поиску по дереву, если человек не печатает в поле.
const onWindowKey = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  void (
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !target.closest('input, textarea, select, [contenteditable="true"]') &&
    (event.preventDefault(), search.focus())
  );
};

const resultLinks = (): HTMLAnchorElement[] => [
  ...(results?.querySelectorAll<HTMLAnchorElement>('a') ?? []),
];

const onSearchKey = (event: KeyboardEvent) =>
  void (event.key === 'ArrowDown'
    ? (event.preventDefault(), resultLinks()[0]?.focus())
    : event.key === 'Enter'
      ? (event.preventDefault(),
        found[0] && goto(pageHref(found[0]), { reset: false }))
      : event.key === 'Escape' && query !== ''
        ? (event.preventDefault(), (query = ''))
        : undefined);

const onResultKey = (event: KeyboardEvent) => {
  const links = resultLinks();
  const index = links.indexOf(event.target as HTMLAnchorElement);
  void (event.key === 'ArrowDown'
    ? (event.preventDefault(), links[index + 1]?.focus())
    : event.key === 'ArrowUp'
      ? (event.preventDefault(), (links[index - 1] ?? search).focus())
      : event.key === 'Escape'
        ? (event.preventDefault(),
          (query = ''),
          tick().then(() => search.focus()))
        : undefined);
};

const items = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter(
    (_) => _.offsetParent !== null
  );

const parentItem = (item: HTMLElement): HTMLElement | null =>
  item.parentElement?.closest<HTMLElement>('[role="treeitem"]') ?? null;

const idOf = (item: HTMLElement): number => Number(item.dataset.id);

// reset: false — фокус остаётся в дереве, как в Evo: можно идти дальше стрелками.
const open = (item: HTMLElement) =>
  void goto(resolve('/(app)/pages/[id]', { id: String(idOf(item)) }), {
    reset: false,
  });

// Клавиши дерева по WAI-ARIA: стрелки ходят и раскрывают, Home/End — края, Enter открывает.
const _KEYS: Readonly<
  Record<
    string,
    (item: HTMLElement, all: HTMLElement[]) => HTMLElement | null | undefined
  >
> = {
  ArrowDown: (item, all) => all[all.indexOf(item) + 1],
  ArrowUp: (item, all) => all[all.indexOf(item) - 1],
  Home: (_, all) => all[0],
  End: (_, all) => all.at(-1),
  ArrowRight: (item, all) =>
    item.getAttribute('aria-expanded') === 'false'
      ? (toggleBranch(idOf(item)), null)
      : item.getAttribute('aria-expanded') === 'true'
        ? all[all.indexOf(item) + 1]
        : null,
  ArrowLeft: (item) =>
    item.getAttribute('aria-expanded') === 'true'
      ? (toggleBranch(idOf(item)), null)
      : parentItem(item),
  Enter: (item) => (open(item), null),
  // Пробел — выбрать страницу для действий разом (WAI-ARIA для дерева с выбором нескольких).
  ' ': (item) => (pickId(idOf(item), false), null),
};

// Выбор нескольких: якорь — последняя выбранная; диапазон — по видимому порядку строк дерева.
let anchor: number | null = null;

const visibleIds = (): number[] =>
  items(document.querySelector<HTMLElement>('.nodes[role=tree]')!).map(idOf);

const pickId = (id: number, range: boolean) =>
  void (range && anchor !== null
    ? ((order) =>
        ((from, to) =>
          setSelection([
            ...selection.ids,
            ...order.slice(Math.min(from, to), Math.max(from, to) + 1),
          ]))(order.indexOf(anchor!), order.indexOf(id)))(visibleIds())
    : (toggleSelected(id), (anchor = id)));

const chosen = $derived(
  tree.nodes.filter((_) => selection.ids.has(_.id) && !_.trashed)
);

// Shift+стрелка расширяет выбор, Ctrl+A — все видимые, Escape — снять выбор.
const selectKey = (event: KeyboardEvent, item: HTMLElement | null) =>
  void (event.shiftKey &&
  (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
  item
    ? (anchor === null && (anchor = idOf(item)),
      tick().then(() =>
        ((next) => next && pickId(idOf(next), true))(
          document.activeElement?.closest<HTMLElement>('[role="treeitem"]') ??
            null
        )
      ))
    : (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a'
      ? (event.preventDefault(), setSelection(visibleIds()))
      : event.key === 'Escape' &&
        selection.ids.size > 0 &&
        (event.preventDefault(), clearSelection()));

// Shift+F10 и клавиша меню — меню действий страницы, как правый щелчок.
const _menuKey = (event: KeyboardEvent): boolean =>
  event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

// Alt+стрелка — переставить страницу среди соседей, как «Выше/Ниже» в меню; фокус остаётся на ней.
const _SHIFT: Readonly<Record<string, -1 | 1>> = { ArrowUp: -1, ArrowDown: 1 };

const shiftByKey = (node: PageNode, by: -1 | 1) =>
  ((siblings) =>
    ((index) =>
      index + by >= 0 &&
      index + by < siblings.length &&
      shiftPage(node, by)
        .then(() => tick())
        .then(() =>
          document
            .querySelector<HTMLElement>(`[role=treeitem][data-id="${node.id}"]`)
            ?.focus()
        ))(siblings.findIndex((_) => _.id === node.id)))(
    childrenOf(node.parentId)
  );

const onKey = (event: KeyboardEvent) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>(
    '[role="treeitem"]'
  );
  selectKey(event, item);
  const node = item ? tree.nodes.find((_) => _.id === idOf(item)) : undefined;
  const shift = event.altKey ? _SHIFT[event.key] : undefined;
  void (
    item &&
    node &&
    shift &&
    event.target === item &&
    (event.preventDefault(), shiftByKey(node, shift))
  );
  void (
    item &&
    node &&
    event.target === item &&
    _menuKey(event) &&
    ((box) => (
      event.preventDefault(), openMenu(node, box.left + 24, box.bottom)
    ))(item.querySelector('.row')!.getBoundingClientRect())
  );
  const handle = _menuKey(event) || shift ? undefined : _KEYS[event.key];
  const next =
    item && handle && event.target === item
      ? (event.preventDefault(),
        handle(item, items(event.currentTarget as HTMLElement)))
      : null;
  next?.focus();
};

const onFocus = (event: FocusEvent) =>
  ((item) => void (item && (treeFocus.id = idOf(item))))(
    (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]')
  );

// Щелчок мышью фокусирует ссылку внутри строки, а стрелки дерева слушают сам узел: после щелчка и
// правого щелчка фокус переходит на узел. Не при нажатии — смена фокуса в mousedown отменяет перетаскивание.
const focusItem = (event: MouseEvent) =>
  ((item, active) =>
    void (
      item &&
      active &&
      active !== item &&
      item.contains(active) &&
      active.tabIndex === -1 &&
      item.focus()
    ))(
    (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]'),
    document.activeElement as HTMLElement | null
  );

const current = $derived(Number(page.params.id) || null);
const link = `${resolve('/(app)/pages/[id]', { id: 'new' })}?kind=link`;

const emptyTrash = () =>
  ask({
    title: t('pages.emptyTrashTitle'),
    body: t('pages.emptyTrashBody'),
    items: bin.map((_) => `${_.title} (${_.id})`),
    confirm: t('pages.emptyTrashConfirm'),
    tone: 'danger',
  })
    .then((confirmed) =>
      confirmed
        ? api
            .send('DELETE', '/trash')
            .then(loadTree)
            .then(() => notify(t('pages.trashEmptied')))
        : undefined
    )
    .then(undefined, failed);
</script>

<div class="pages-panel">
  <div class="panel-head">
    <h2 class="sr-only">{t('pages.siteTree')}</h2>
    {#if chosen.length > 0}
      <!-- Выбрано несколько страниц: вместо инструментов дерева — действия с ними. -->
      <div class="bulk" role="toolbar" aria-label={t('bulk.title')}>
        <span class="chosen" aria-live="polite">{t('bulk.selected')} <strong>{chosen.length}</strong></span>
        <button type="button" class="ghost icon" aria-label={t('bulk.publish')} title={t('bulk.publish')} onclick={() => publishMany(chosen, true)}>{@html icons.eye}</button>
        <button type="button" class="ghost icon" aria-label={t('bulk.unpublish')} title={t('bulk.unpublish')} onclick={() => publishMany(chosen, false)}>{@html icons.eyeOff}</button>
        <button type="button" class="ghost icon" aria-label={t('bulk.move')} title={t('bulk.move')} onclick={() => moveMany(chosen)}>{@html icons.folderInput}</button>
        <button type="button" class="ghost icon danger" aria-label={t('bulk.trash')} title={t('bulk.trash')} onclick={() => trashMany(chosen)}>{@html icons.trash}</button>
        <button type="button" class="ghost icon" aria-label={t('bulk.clear')} title={t('bulk.clear')} onclick={clearSelection}>{@html icons.close}</button>
      </div>
    {:else}
    <div class="toolbar" role="toolbar" aria-label={t('tree.toolbar')}>
      <a class="button ghost icon" href={blank} aria-label={t('pages.new')} title={t('pages.new')}>{@html icons.filePlus}</a>
      <a class="button ghost icon" href={link} aria-label={t('tree.newLink')} title={t('tree.newLink')}>{@html icons.link}<span class="plus" aria-hidden="true">+</span></a>
      <button type="button" class="ghost icon" aria-label={t('tree.expandAll')} title={t('tree.expandAll')} onclick={() => setAllBranches(true, current)}>{@html icons.expand}</button>
      <button type="button" class="ghost icon" aria-label={t('tree.collapseAll')} title={t('tree.collapseAll')} onclick={() => setAllBranches(false, current)}>{@html icons.collapse}</button>
      <button type="button" class="ghost icon" aria-label={t('tree.refresh')} title={t('tree.refresh')} onclick={() => void loadTree().then(undefined, failed)}>{@html icons.refresh}</button>
    </div>
    {/if}
  </div>
  <a class="skip-editor" href="#main">{t('pages.toEditor')}</a>
  <label class="search">
    <span class="sr-only">{t('tree.search')}</span>
    {@html icons.search}
    <input type="search" placeholder={t('tree.search')} aria-describedby="search-hint" aria-controls="search-results" bind:value={query} bind:this={search} onkeydown={onSearchKey} />
    <kbd aria-hidden="true">/</kbd>
    <!-- aria-hidden: подсказка — описание поля (aria-describedby), а не часть его имени. -->
    <span id="search-hint" class="sr-only" aria-hidden="true">{t('tree.searchHint')}</span>
  </label>
  <div class="scroll">
    {#if searching}
      {#if found.length === 0}
        <p class="muted nothing" role="status">{t('tree.nothing')}</p>
      {/if}
      <ul class="results" id="search-results" aria-label={t('tree.results')} bind:this={results}>
        {#each found as node (node.id)}
          <li>
            <a href={pageHref(node)} data-sveltekit-reset="false" aria-current={page.params.id === String(node.id) ? 'page' : undefined} onkeydown={onResultKey}>
              <span class="title" data-status={statusOf(node)}><PageGlyph kind={node.kind} contentType={node.contentType} status={statusOf(node)} />{node.title}</span>
              {#if trail(node.id).length > 0}<span class="trail">{trail(node.id).join(' › ')}</span>{/if}
              <span class="id">{node.id}</span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <LoadState load={treeLoad} compact>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <ul class="nodes" role="tree" aria-multiselectable="true" aria-label={t('nav.pages')} aria-describedby="drag-hint" onkeydown={onKey} onfocusin={onFocus} onclick={focusItem} oncontextmenucapture={focusItem}>
        {#each roots as node (node.id)}
          <TreeNode {node} {focusId} onmenu={openMenu} onselect={(_, range) => pickId(_.id, range)} />
        {/each}
      </ul>
      <span id="drag-hint" class="sr-only">{t('tree.dragHint')}</span>
      </LoadState>
    {/if}
  </div>
  <div class="foot">
    <details class="bin">
      <summary>{@html icons.trash}{t('pages.trash')} {#if treeLoad.state.ready}<span class="count">{bin.length}</span>{/if}</summary>
      {#if !treeLoad.state.ready}
        <p class="muted">{t('common.loading')}</p>
      {:else if bin.length === 0}
        <p class="muted">{t('pages.trashEmpty')}</p>
      {:else}
        <ul class="nodes">
          {#each bin as node (node.id)}
            <TreeNode {node} plain nested={descendantsOf(node.id).length} />
          {/each}
        </ul>
        <!-- Навсегда удаляет только администратор: остальные кладут в корзину и возвращают. -->
        {#if session.user?.role === 'admin'}<button type="button" class="danger" onclick={emptyTrash}>{t('pages.emptyTrash')}</button>{/if}
      {/if}
    </details>
  </div>
</div>

<svelte:window onkeydown={onWindowKey} />

{#if menu}
  {#key menu}
    <TreeMenu node={menu.node} x={menu.x} y={menu.y} onclose={closeMenu} />
  {/key}
{/if}

<style>
  .pages-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  .panel-head {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    padding: 0 0 0.5rem 0.25rem;
  }

  h2 {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  /* Инструменты дерева — тихие значки справа от заголовка: создать, развернуть, свернуть, обновить. */
  .toolbar {
    display: flex;
    gap: 0;
    align-items: center;
  }

  .toolbar :is(.button, button) {
    position: relative;
    width: 1.75rem;
    min-height: 1.75rem;
    border-radius: var(--radius-s);
  }

  .bulk {
    display: flex;
    flex: 1;
    gap: 0.125rem;
    align-items: center;
    min-height: 2rem;
    padding: 0 0.25rem 0 0.6rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
  }

  .chosen {
    margin-right: auto;
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .bulk .danger {
    color: var(--danger);
  }

  /* Палец больше курсора: инструменты дерева — не меньше 44 px. */
  @media (pointer: coarse) {
    .toolbar :is(.button, button) {
      width: 2.75rem;
      min-height: 2.75rem;
    }
  }

  .toolbar :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .plus {
    position: absolute;
    right: 0.05rem;
    bottom: -0.05rem;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1;
  }

  .skip-editor {
    position: absolute;
    left: -100vw;
  }

  .skip-editor:focus {
    position: static;
    margin: 0 0 0.5rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-text);
  }

  .search {
    position: relative;
    display: block;
    margin: 0 0 0.5rem;
  }

  .search :global(svg) {
    position: absolute;
    top: 50%;
    left: 0.65rem;
    width: 1rem;
    height: 1rem;
    color: var(--muted);
    transform: translateY(-50%);
  }

  .search input {
    min-height: 2.25rem;
    padding-left: 2.1rem;
    border-color: var(--line);
    background: var(--canvas);
    box-shadow: var(--shadow-s);
    font-size: 0.875rem;
  }

  /* Свой фон и тень поля перебивали общий фокус: возвращаем рамку и кольцо акцента. */
  .search input:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 0 0 0.1875rem color-mix(in oklch, var(--accent) 22%, transparent);
  }

  /* Клавиша поиска видна, пока поле пустое и не в фокусе: так её узнают, не читая справку. */
  .search kbd {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    min-width: 1.25rem;
    padding: 0 0.3rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-s);
    background: var(--sunken);
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.15rem;
    text-align: center;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .search:focus-within kbd,
  .search input:not(:placeholder-shown) ~ kbd {
    display: none;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    margin: 0 -0.25rem;
    padding: 0.125rem 0.25rem 0.75rem;
    overflow-y: auto;
  }

  .nodes {
    margin: 0;
    padding: 0;
  }

  .nothing {
    margin: 0;
    padding: 0 0.5rem;
  }

  .results {
    display: grid;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .results a {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .results a:hover {
    background: var(--hover);
  }

  .results a[aria-current='page'] {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
  }

  .results .title {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .results .trail {
    grid-row: 2;
    overflow: hidden;
    color: var(--muted);
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .results .id {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.6875rem;
  }

  .foot {
    display: grid;
    gap: 0.5rem;
    padding: 0.4rem 0 0.25rem;
  }

  summary {
    display: flex;
    gap: 0.65rem;
    align-items: center;
    min-height: 2.25rem;
    padding: 0 0.65rem;
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: var(--hover);
    color: var(--text);
  }

  summary :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .count {
    margin-left: auto;
    min-width: 1.5rem;
    padding: 0 0.4rem;
    border-radius: 1rem;
    background: var(--hover);
    color: var(--text);
    font-size: 0.75rem;
    text-align: center;
  }

  /* minmax(0, 1fr): длинный заголовок в корзине обрезается многоточием, а не растягивает список. */
  .bin[open] {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
    max-height: 40dvh;
    overflow-y: auto;
  }

  .bin p {
    margin: 0 0.65rem;
    font-size: 0.8125rem;
  }

  /* Необратимое действие — отступив от списка: не нажать вместо последней страницы. */
  .bin .danger {
    justify-self: start;
    min-height: 2rem;
    margin: 0.75rem 0 0.25rem 0.65rem;
  }
</style>
