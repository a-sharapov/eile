<script lang="ts">
import { onMount, tick } from 'svelte';
import { askValue } from '#lib/dialog.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import {
  duplicatePage,
  placePage,
  setPublished,
  shiftPage,
  trashPage,
} from '#lib/page-actions.ts';
import {
  branchOrder,
  childrenOf,
  selection,
  toggleSelected,
} from '#lib/tree.svelte.ts';
import type { PageNode } from '#lib/types.ts';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

let {
  node,
  x,
  y,
  onclose,
}: {
  node: PageNode;
  x: number;
  y: number;
  /** Закрыть меню; `returnFocus` — вернуть фокус туда, откуда меню открыли. */
  onclose: (returnFocus: boolean) => void;
} = $props();

let element: HTMLDivElement;
let left = $state(0);
let top = $state(0);

const siblings = $derived(childrenOf(node.parentId));
const position = $derived(siblings.findIndex((_) => _.id === node.id));

const _ROOT = 'root';

// Меню закрывается сразу после выбора пункта, а диалог ещё открыт: страницу запоминаем до него.
const moveTo = (target: PageNode) =>
  askValue({
    title: t('tree.moveTitle'),
    body: target.title,
    input: {
      label: t('tree.parent'),
      type: 'text',
      value: String(target.parentId ?? _ROOT),
      options: [
        { value: _ROOT, label: t('pages.root') },
        ...branchOrder(target.id).map(({ node: parent, depth }) => ({
          value: String(parent.id),
          label: `${' '.repeat(depth)}${parent.title} (${parent.id})`,
        })),
      ],
    },
    confirm: t('tree.moveConfirm'),
  }).then((value) =>
    ((parentId) =>
      value !== null && parentId !== target.parentId
        ? placePage(target, parentId, childrenOf(parentId).length)
        : undefined)(value === _ROOT ? null : Number(value))
  );

// Пункт меню после действия исчезает: фокус — на строку страницы, когда дерево перестроилось.
const focusRow = (id: number) =>
  tick().then(() =>
    document
      .querySelector<HTMLElement>(`[role=treeitem][data-id="${id}"]`)
      ?.focus()
  );

type Item = {
  readonly label: string;
  readonly icon: keyof typeof icons;
  /** Клавиши, которыми то же действие делается прямо в дереве. */
  readonly keys?: string;
  readonly run: () => unknown;
  /** Страница остаётся в дереве, перехода нет: после действия фокус возвращается на её строку. */
  readonly stay?: boolean;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly gap?: boolean;
};

const items = $derived<Item[]>([
  {
    label: t('tree.open'),
    icon: 'file',
    keys: 'Enter',
    run: () => goto(resolve('/(app)/pages/[id]', { id: String(node.id) })),
  },
  {
    label: t(selection.ids.has(node.id) ? 'bulk.deselect' : 'bulk.select'),
    icon: 'check',
    keys: t('keys.space'),
    run: () => toggleSelected(node.id),
    stay: true,
  },
  {
    label: t('tree.newChild'),
    icon: 'filePlus',
    run: () =>
      goto(`${resolve('/(app)/pages/[id]', { id: 'new' })}?parent=${node.id}`),
  },
  { label: t('tree.duplicate'), icon: 'copy', run: () => duplicatePage(node) },
  {
    label: t(node.published ? 'page.unpublish' : 'page.publish'),
    icon: node.published ? 'eyeOff' : 'eye',
    run: () => setPublished(node, !node.published),
    stay: true,
  },
  ...(node.published
    ? ([
        {
          label: t('tree.onSite'),
          icon: 'external',
          // Адрес считает сервер: окончание, папки и скрытые алиасы разделов (ADR 0063).
          run: () => open(node.path, '_blank', 'noopener'),
        },
      ] satisfies Item[])
    : []),
  {
    label: t('tree.up'),
    icon: 'arrowUp',
    keys: 'Alt+↑',
    run: () => shiftPage(node, -1),
    disabled: position <= 0,
    gap: true,
    stay: true,
  },
  {
    label: t('tree.down'),
    icon: 'arrowDown',
    keys: 'Alt+↓',
    run: () => shiftPage(node, 1),
    disabled: position === siblings.length - 1,
    stay: true,
  },
  {
    label: t('tree.moveTo'),
    icon: 'folderInput',
    run: () => moveTo(node),
    stay: true,
  },
  {
    label: t('page.toTrash'),
    icon: 'trash',
    run: () => trashPage(node),
    danger: true,
    gap: true,
  },
]);

const buttons = (): HTMLButtonElement[] => [
  ...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
];

// Меню целиком в окне: у правого и нижнего края оно открывается в другую сторону.
onMount(() => {
  const box = element.getBoundingClientRect();
  left = Math.max(8, Math.min(x, innerWidth - box.width - 8));
  top = Math.max(8, Math.min(y, innerHeight - box.height - 8));
  void tick().then(() => buttons()[0]?.focus());
});

// Действие запускается до закрытия: после закрытия props меню уже не указывают на страницу.
const choose = (item: Item) => {
  const id = node.id;
  const result = Promise.resolve(item.run());
  onclose(false);
  return item.stay ? result.finally(() => focusRow(id)) : result;
};

const _MOVES: Readonly<
  Record<string, (index: number, count: number) => number>
> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

const onKey = (event: KeyboardEvent) => {
  const all = buttons();
  const move = _MOVES[event.key];
  void (event.key === 'Escape' || event.key === 'Tab'
    ? (event.preventDefault(), onclose(true))
    : move &&
      (event.preventDefault(),
      all[
        move(
          all.indexOf(document.activeElement as HTMLButtonElement),
          all.length
        )
      ]?.focus()));
};

const onOutside = (event: PointerEvent) =>
  void (element.contains(event.target as Node) || onclose(false));
</script>

<svelte:window onpointerdown={onOutside} onresize={() => onclose(false)} />

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="menu" role="menu" tabindex="-1" aria-label={`${t('tree.menu')}: ${node.title}`} style:left="{left}px" style:top="{top}px" bind:this={element} onkeydown={onKey}>
  {#each items as item (item.label)}
    {#if item.gap}<div class="gap" role="separator"></div>{/if}
    <button type="button" role="menuitem" tabindex="-1" class:danger={item.danger} disabled={item.disabled} aria-keyshortcuts={item.keys?.replace('↑', 'ArrowUp').replace('↓', 'ArrowDown')} onclick={() => choose(item)}>
      {@html icons[item.icon]}<span class="label">{item.label}</span>{#if item.keys}<kbd aria-hidden="true">{item.keys}</kbd>{/if}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 30;
    display: grid;
    min-width: 13rem;
    padding: 0.3rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  button {
    justify-content: flex-start;
    min-height: 2rem;
    padding: 0 0.65rem;
    border: 0;
    background: none;
    text-align: left;
    box-shadow: none;
  }

  /* Пункт меню под мышью — та же подложка, что у пунктов меню учётной записи и строк дерева. */
  button:hover:not(:disabled),
  button:focus-visible {
    outline: none;
    background: var(--hover);
    color: var(--text);
  }

  button :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--muted);
  }

  .label {
    flex: 1;
  }

  kbd {
    color: var(--muted);
    font-family: var(--font);
    font-size: 0.75rem;
  }

  .danger :global(svg) {
    color: var(--danger);
  }

  .danger,
  .danger:hover:not(:disabled) {
    color: var(--danger);
  }

  .gap {
    height: 0.0625rem;
    margin: 0.3rem 0.25rem;
    background: var(--line);
  }
</style>
