<script lang="ts">
import { isHtml, typeLabel } from '#lib/content-types.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { placePage } from '#lib/page-actions.ts';
import {
  branchOpen,
  childrenOf,
  type DropZone,
  drag,
  isWithin,
  selection,
  statusOf,
  toggleBranch,
  tree,
} from '#lib/tree.svelte.ts';
import type { PageNode } from '#lib/types.ts';
import PageGlyph from '#lib/ui/PageGlyph.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import Self from './TreeNode.svelte';

let {
  node,
  focusId,
  plain = false,
  nested = 0,
  depth = 1,
  onmenu,
  onselect,
}: {
  node: PageNode;
  /** Узел с tabindex=0: остальные достижимы стрелками (roving tabindex). */
  focusId?: number | null;
  /** Корзина: простой список ссылок без вложенности. */
  plain?: boolean;
  /** Сколько вложенных страниц ушло в корзину вместе с этой (список корзины). */
  nested?: number;
  /** Уровень узла: с четвёртого отступ меньше, чтобы глубоким веткам оставалось место под заголовок. */
  depth?: number;
  /** Открыть меню действий страницы в точке экрана. */
  onmenu?: (node: PageNode, x: number, y: number) => void;
  /** Ctrl/⌘+щелчок — добавить к выбранным или убрать, Shift+щелчок — выбрать диапазон. */
  onselect?: (node: PageNode, range: boolean) => void;
} = $props();

const children = $derived(plain ? [] : childrenOf(node.id));
const open = $derived(branchOpen(node.id, Number(page.params.id) || null));
const current = $derived(page.params.id === String(node.id));
const selected = $derived(selection.ids.has(node.id));

const pick = (event: MouseEvent) =>
  void (
    onselect &&
    (event.ctrlKey || event.metaKey || event.shiftKey) &&
    (event.preventDefault(), onselect(node, event.shiftKey))
  );
const status = $derived(statusOf(node));
const file = $derived(node.kind === 'page' && !isHtml(node.contentType));
const href = $derived(resolve('/(app)/pages/[id]', { id: String(node.id) }));
const child = $derived(
  `${resolve('/(app)/pages/[id]', { id: 'new' })}?parent=${node.id}`
);

// Край строки — «рядом», середина — «внутрь»: так же, как в дереве Evo и файловых менеджерах.
const _zone = (event: DragEvent): DropZone => {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const at = (event.clientY - box.top) / box.height;
  return at < 0.25 ? 'before' : at > 0.75 ? 'after' : 'inside';
};

const start = (event: DragEvent) => (
  (drag.id = node.id),
  event.dataTransfer?.setData('text/plain', node.title),
  void (event.dataTransfer && (event.dataTransfer.effectAllowed = 'move'))
);

const reset = () => (
  (drag.id = null), (drag.target = null), (drag.zone = null)
);

// В свою ветку не бросить: такой цели нет, preventDefault не зовём — курсор покажет запрет.
const over = (event: DragEvent) =>
  void (
    drag.id !== null &&
    !isWithin(node.id, drag.id) &&
    (event.preventDefault(),
    (drag.target = node.id),
    (drag.zone = _zone(event)),
    event.dataTransfer && (event.dataTransfer.dropEffect = 'move'))
  );

const drop = (event: DragEvent) => {
  const dragged = tree.nodes.find((_) => _.id === drag.id);
  const zone = drag.zone;
  event.preventDefault();
  reset();
  const others = (parent: number | null) =>
    childrenOf(parent).filter((_) => _.id !== dragged?.id);
  const at = others(node.parentId).findIndex((_) => _.id === node.id);
  return dragged && zone
    ? zone === 'inside'
      ? (open || toggleBranch(node.id),
        placePage(dragged, node.id, others(node.id).length))
      : placePage(dragged, node.parentId, zone === 'before' ? at : at + 1)
    : undefined;
};

const menu = (event: MouseEvent) =>
  void (
    onmenu &&
    (event.preventDefault(), onmenu(node, event.clientX, event.clientY))
  );

const menuAt = (event: MouseEvent) => {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  onmenu?.(node, box.left, box.bottom + 4);
};

const _STATUS = {
  published: 'pages.published',
  draft: 'pages.draft',
  scheduled: 'pages.scheduled',
  trashed: 'pages.trashed',
} as const;
</script>

{#snippet label()}
  <!-- Значок типа страницы, на его углу — точка статуса: опубликована, черновик, по расписанию. -->
  <PageGlyph kind={node.kind} contentType={node.contentType} {status} title={file ? `${typeLabel(node.contentType)} · ${t(_STATUS[status])}` : t(_STATUS[status])} />
  <span class="sr-only" id={plain ? undefined : `node-${node.id}-status`}>{t(_STATUS[status])}:</span>
  {#if node.kind === 'link'}<span class="sr-only" id={plain ? undefined : `node-${node.id}-link`}>{t('page.kindLink')}</span>{/if}
  {#if file}<span class="sr-only" id={plain ? undefined : `node-${node.id}-type`}>{typeLabel(node.contentType)}</span>{/if}
  <span class="title" id={plain ? undefined : `node-${node.id}`}>{node.title}</span>
  {#if node.hiddenFromMenu}
    <span class="kind" title={t('pages.hidden')}>{@html icons.eyeOff}<span class="sr-only" id={plain ? undefined : `node-${node.id}-hidden`}>({t('pages.hidden').toLowerCase()})</span></span>
  {/if}
  <span class="id">{node.id}</span>
{/snippet}

{#if plain}
  <li>
    <div class="row" data-current={current || undefined}>
      <a {href} data-status={status} aria-current={current ? 'page' : undefined}>{@render label()}</a>
      {#if nested > 0}<span class="nested" title={t('pages.nestedInTrash')}>+{nested}<span class="sr-only"> {t('pages.nestedInTrash')}</span></span>{/if}
    </div>
  </li>
{:else}
  <li
    role="treeitem"
    data-id={node.id}
    aria-labelledby={[
      `node-${node.id}-status`,
      node.kind === 'link' ? `node-${node.id}-link` : '',
      file ? `node-${node.id}-type` : '',
      `node-${node.id}`,
      node.hiddenFromMenu ? `node-${node.id}-hidden` : '',
    ]
      .filter(Boolean)
      .join(' ')}
    aria-expanded={children.length > 0 ? open : undefined}
    aria-selected={selected}
    aria-current={current ? 'page' : undefined}
    tabindex={focusId === node.id ? 0 : -1}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="row"
      data-current={current || undefined}
      data-selected={selected || undefined}
      data-drop={drag.target === node.id ? drag.zone : undefined}
      data-dragging={drag.id === node.id || undefined}
      draggable="true"
      ondragstart={start}
      ondragend={reset}
      ondragover={over}
      ondragleave={() => void (drag.target === node.id && (drag.target = null))}
      ondrop={drop}
      oncontextmenu={menu}
    >
      {#if children.length > 0}
        <!-- Мышью; с клавиатуры ветку открывают стрелки дерева. -->
        <button type="button" class="toggle" tabindex="-1" aria-hidden="true" title={t(open ? 'pages.collapse' : 'pages.expand')} data-open={open} onclick={() => toggleBranch(node.id)}>
          {@html icons.chevron}
        </button>
      {:else}
        <span class="toggle"></span>
      {/if}
      <a {href} tabindex="-1" data-status={status} data-sveltekit-reset="false" title={node.title} onclick={pick}>{@render label()}</a>
      <a class="add" href={child} tabindex="-1" aria-hidden="true" title={t('pages.newChild')}>{@html icons.plus}</a>
      <!-- С клавиатуры меню открывает Shift+F10 на узле дерева. -->
      <button type="button" class="more" tabindex="-1" aria-hidden="true" title={t('tree.more')} onclick={menuAt}>{@html icons.more}</button>
    </div>
    {#if open && children.length > 0}
      <ul role="group" data-deep={depth >= 3 || undefined}>
        {#each children as next (next.id)}
          <Self node={next} {focusId} {onmenu} {onselect} depth={depth + 1} />
        {/each}
      </ul>
    {/if}
  </li>
{/if}

<style>
  li {
    list-style: none;
  }

  li:focus-visible {
    outline: none;
  }

  li:focus-visible > .row {
    outline: 0.125rem solid var(--accent);
    outline-offset: -0.125rem;
  }

  /* Схема сайта: вложенные ветки висят на вертикальной линии от стрелки родителя. */
  ul {
    margin: 0 0 0 0.8rem;
    padding: 0 0 0 0.45rem;
    border-left: 0.0625rem solid var(--line);
  }

  ul[data-deep] {
    margin-left: 0.4rem;
    padding-left: 0.25rem;
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--radius);
    transition: background-color 120ms var(--ease);
  }

  .row:hover {
    background: var(--hover);
  }

  /* Выбранные для действий разом — акцентной подложкой; текущая остаётся таблеткой поверх. */
  .row[data-selected] {
    background: var(--accent-soft);
    box-shadow: 0 0 0 0.0625rem color-mix(in oklab, var(--accent) 35%, transparent);
  }

  /* Текущая страница — белой «таблеткой», как текущий раздел в навигации. */
  .row[data-current] {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
  }

  .toggle {
    flex: none;
    width: 1.5rem;
    min-height: 2rem;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--muted);
  }

  .toggle:hover:not(:disabled) {
    border: 0;
    background: none;
    color: var(--text);
    box-shadow: none;
  }

  .toggle :global(svg) {
    width: 0.95rem;
    height: 0.95rem;
    transition: transform 160ms var(--ease);
  }

  .toggle[data-open='true'] :global(svg) {
    transform: rotate(90deg);
  }

  a {
    display: flex;
    flex: 1;
    gap: 0.55rem;
    color: var(--text);
    align-items: center;
    min-width: 0;
    min-height: 2rem;
    padding: 0.25rem 0.5rem 0.25rem 0.15rem;
    font-size: 0.875rem;
    text-decoration: none;
  }

  [data-current] a {
    font-weight: 600;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .id {
    margin-left: auto;
    flex: none;
    padding-left: 0.5rem;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.6875rem;
  }

  /* Кнопки строки лежат поверх колонки id, а не рядом: заголовку не приходится уступать им место. */
  .add,
  .more {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
  }

  /* id видно всегда и не сдвигается: колонка постоянной ширины, кнопки строки встают левее неё
     поверх конца заголовка, с подложкой строки — текст под ними не просвечивает. */
  .id {
    min-width: 2.25rem;
    text-align: right;
  }

  .add,
  .more {
    background: var(--hover);
  }

  .row[data-current] :is(.add, .more) {
    background: var(--selected);
  }

  /* «Создать вложенную» появляется под мышью; с клавиатуры — кнопкой в редакторе страницы. */
  .add {
    right: 4.25rem;
    display: inline-flex;
    justify-content: center;
    width: 1.625rem;
    min-height: 1.625rem;
    padding: 0;
    border-radius: var(--radius-s);
    color: var(--muted);
    opacity: 0;
  }

  .more {
    right: 2.6rem;
    width: 1.625rem;
    min-height: 1.625rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-s);
    background: none;
    box-shadow: none;
    color: var(--muted);
    opacity: 0;
  }

  .add :global(svg),
  .more :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .row:hover :is(.add, .more),
  .row[data-current] .more {
    opacity: 1;
  }

  /* Значок на строке под мышью — подложкой и цветом, как тихая кнопка; нажатый — плотнее. */
  .row .more:hover,
  .add:hover {
    border-color: transparent;
    background: var(--press);
    color: var(--text);
  }

  .row .more:active,
  .add:active {
    background: color-mix(in oklch, var(--text) 24%, transparent);
  }

  .nested {
    flex: none;
    padding: 0 0.5rem;
    color: var(--muted);
    font-size: 0.75rem;
  }

  [data-dragging] {
    opacity: 0.45;
  }

  /* Куда упадёт страница: линия над строкой или под ней, рамка — внутрь. */
  [data-drop='before'] {
    box-shadow: inset 0 0.125rem 0 var(--accent);
  }

  [data-drop='after'] {
    box-shadow: inset 0 -0.125rem 0 var(--accent);
  }

  [data-drop='inside'] {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 0.125rem var(--accent);
  }

  @media (hover: none) {
    .add {
      display: none;
    }

    .more {
      opacity: 1;
    }
  }

  /* Палец больше курсора: строки и стрелки — не меньше 44 px. */
  @media (pointer: coarse) {
    a,
    .toggle {
      min-height: 2.75rem;
    }

    .toggle {
      width: 2.75rem;
    }
  }

  /* Состояние — ещё и начертанием, как в Evo: черновик — курсивом, корзина — зачёркнута. */
  [data-status='draft'] .title {
    color: var(--muted);
    font-style: italic;
  }

  [data-status='scheduled'] .title {
    color: var(--warn);
    font-style: italic;
  }

  [data-status='trashed'] .title {
    color: var(--muted);
    text-decoration: line-through;
  }

  .kind {
    display: inline-flex;
    flex: none;
    color: var(--muted);
  }

  .kind :global(svg) {
    width: 0.875rem;
    height: 0.875rem;
  }
</style>
