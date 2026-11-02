<script lang="ts">
import { tick } from 'svelte';
import { catalog, loadCatalog } from '#lib/components.svelte.ts';
import {
  type Block,
  blockId,
  parseBlocks,
  serializeBlocks,
} from '#lib/content-blocks.ts';
import { forms, loadForms } from '#lib/forms.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type { ComponentSignature } from '#lib/types.ts';
import ComponentBlock from './ComponentBlock.svelte';
import FormBlock from './FormBlock.svelte';
import TextBlock from './TextBlock.svelte';

let { value = $bindable('') }: { value: string } = $props();

// Блоки — рабочее представление; в контент пишем, только когда человек что-то поменял.
// Пустой контент начинается с пустого текстового блока: писать можно сразу.
const _initial = (content: string): Block[] =>
  ((parsed) =>
    parsed.length > 0 ? parsed : [{ id: blockId(), kind: 'text', html: '' }])(
    parseBlocks(content)
  );

let blocks = $state<Block[]>(_initial(value));
// После какого блока открыта вставка; null — только в конце.
let inserting = $state<number | null>(null);
let root: HTMLDivElement;

$effect(() => void loadCatalog().then(undefined, failed));
$effect(
  () => void (forms.items === null && loadForms().then(undefined, failed))
);

const signatureOf = (name: string): ComponentSignature | null =>
  catalog.items?.find((_) => _.name === name) ?? null;

// Описанные через `<!-- @component -->` — для контента; остальные — служебные части шаблонов.
const offered = $derived(
  (catalog.items ?? []).filter((_) => _.description !== '')
);
const others = $derived(
  (catalog.items ?? []).filter((_) => _.description === '')
);

const commit = (next: Block[]) => (
  (blocks = next), (value = serializeBlocks(next))
);

const update = () => void (value = serializeBlocks(blocks));

// root?: «Вернуть» из уведомления может прийти, когда редактор уже закрыт.
const blockNode = (id: number): HTMLElement | null =>
  root?.querySelector(`li[data-block="${id}"]`) ?? null;

// Фокус после перестановки остаётся на той же кнопке в том же блоке, а если она погасла — на соседней.
const focusIn = (id: number, selectors: readonly string[]) =>
  tick().then(() =>
    selectors
      .map((_) => blockNode(id)?.querySelector<HTMLElement>(_))
      .find((_) => _ && !(_ as HTMLButtonElement).disabled)
      ?.focus()
  );

const move = (index: number, by: -1 | 1) => {
  const id = blocks[index]!.id;
  commit(
    blocks.map((block, i) =>
      i === index
        ? blocks[index + by]!
        : i === index + by
          ? blocks[index]!
          : block
    )
  );
  return focusIn(id, [
    `[data-control="${by < 0 ? 'up' : 'down'}"]`,
    `[data-control="${by < 0 ? 'down' : 'up'}"]`,
  ]);
};

// Новый текстовый блок — сразу в поле ввода; компонент — в первое поле формы.
const _ENTRY = ['.ProseMirror', 'input, textarea, select'];

const insert = (block: Block) => {
  const at = inserting === null ? blocks.length : inserting + 1;
  closeMenus();
  inserting = null;
  commit([...blocks.slice(0, at), block, ...blocks.slice(at)]);
  return focusIn(block.id, _ENTRY);
};

const addText = () => insert({ id: blockId(), kind: 'text', html: '' });

// Форма — тег модуля [#Form:имя]; сразу первая из списка, другую выбирают в блоке.
const addForm = () =>
  insert({
    id: blockId(),
    kind: 'module',
    module: 'Form',
    name: forms.items?.[0]?.name ?? '',
    hidden: false,
  });

const addComponent = (signature: ComponentSignature) =>
  insert({
    id: blockId(),
    kind: 'component',
    name: signature.name,
    props: {},
    hidden: false,
  });

const openInsert = (index: number) => (
  (inserting = inserting === index ? null : index),
  tick().then(() =>
    root.querySelector<HTMLElement>('.add.inline button')?.focus()
  )
);

// Удалённый блок можно вернуть из уведомления; фокус — в соседний блок, а не на его «×»:
// два Enter подряд не должны удалить два блока.
const remove = (index: number) => {
  const removed = blocks[index]!;
  const next = blocks[index + 1] ?? blocks[index - 1];
  commit(blocks.filter((_, i) => i !== index));
  inserting = null;
  notify(t('blocks.removed'), 'ok', {
    label: t('common.undo'),
    run: () => (
      commit([...blocks.slice(0, index), removed, ...blocks.slice(index)]),
      focusIn(removed.id, _ENTRY)
    ),
  });
  return next
    ? focusIn(next.id, _ENTRY)
    : tick().then(() =>
        root.querySelector<HTMLElement>('.add:not(.inline) button')?.focus()
      );
};

const closeMenus = (except?: Node) =>
  root
    .querySelectorAll<HTMLDetailsElement>('details.menu[open]')
    .forEach((_) => void (_.contains(except ?? null) || (_.open = false)));

// Меню компонентов закрывается щелчком мимо и клавишей Escape; фокус возвращается на кнопку меню.
const onWindow = (event: Event) =>
  void (event.type === 'keydown'
    ? (event as KeyboardEvent).key === 'Escape' &&
      ((open) =>
        open &&
        ((open.open = false),
        open.querySelector<HTMLElement>('summary')?.focus()))(
        root.querySelector<HTMLDetailsElement>('details.menu[open]')
      )
    : closeMenus(event.target as Node));

const kindLabel = (block: Block): string =>
  block.kind === 'text'
    ? t('blocks.text')
    : block.kind === 'module'
      ? t('formsBlock.title')
      : block.name;

const position = (index: number): string =>
  t('blocks.position', { n: index + 1, total: blocks.length });
</script>

<svelte:window onclick={onWindow} onkeydown={onWindow} />

{#snippet controls(block: Block, index: number)}
  <div class="controls">
    <button type="button" class="icon" data-control="insert" aria-expanded={inserting === index} aria-label={`${t('blocks.insertBelow')}: ${kindLabel(block)}, ${position(index)}`} title={t('blocks.insertBelow')} onclick={() => openInsert(index)}>{@html icons.plus}</button>
    <button type="button" class="icon" data-control="up" disabled={index === 0} aria-label={`${t('blocks.up')}: ${kindLabel(block)}, ${position(index)}`} title={t('blocks.up')} onclick={() => move(index, -1)}>{@html icons.arrowUp}</button>
    <button type="button" class="icon" data-control="down" disabled={index === blocks.length - 1} aria-label={`${t('blocks.down')}: ${kindLabel(block)}, ${position(index)}`} title={t('blocks.down')} onclick={() => move(index, 1)}>{@html icons.arrowDown}</button>
    <button type="button" class="icon danger" data-control="remove" aria-label={`${t('blocks.remove')}: ${kindLabel(block)}, ${position(index)}`} title={t('blocks.remove')} onclick={() => remove(index)}>{@html icons.close}</button>
  </div>
{/snippet}

{#snippet adder(inline: boolean)}
  <div class="add" class:inline>
    <span class="muted">{t(inline ? 'blocks.insertHere' : 'blocks.add')}</span>
    <button type="button" onclick={addText}>{@html icons.text}{t('blocks.text')}</button>
    <button type="button" onclick={addForm}>{@html icons.forms}{t('formsBlock.title')}</button>
    <details class="menu">
      <summary>{@html icons.blocks}{t('blocks.component')}</summary>
      <div class="popover">
        {#if catalog.items === null}
          <p class="muted">{t('common.loading')}</p>
        {:else if catalog.items.length === 0}
          <p class="muted">{t('blocks.noComponents')}</p>
        {:else}
          {#if offered.length === 0}<p class="muted">{t('blocks.describeHint')}</p>{/if}
          <ul>
            {#each offered as signature (signature.name)}
              <li>
                <button type="button" onclick={() => addComponent(signature)}>
                  <code>{signature.name}</code>
                  <span class="muted">{signature.description.split('\n')[0]}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if others.length > 0}
            <p class="group muted">{t('blocks.others')}</p>
            <ul>
              {#each others as signature (signature.name)}
                <li><button type="button" onclick={() => addComponent(signature)}><code>{signature.name}</code></button></li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    </details>
    {#if inline}
      <button type="button" class="icon" aria-label={t('common.cancel')} title={t('common.cancel')} onclick={() => (inserting = null)}>{@html icons.close}</button>
    {/if}
  </div>
{/snippet}

<div class="content-editor" bind:this={root}>
  {#if blocks.length === 0}
    <p class="muted empty">{t('blocks.empty')}</p>
  {/if}
  <ol>
    {#each blocks as block, index (block.id)}
      <li data-kind={block.kind} data-block={block.id}>
        {#if block.kind === 'text'}
          <TextBlock bind:value={() => block.html, (_) => ((block.html = _), update())} label={t('blocks.text')} placeholder={t('blocks.textHint')}>
            {#snippet actions()}{@render controls(block, index)}{/snippet}
          </TextBlock>
        {:else if block.kind === 'module'}
          <FormBlock bind:name={() => block.name, (_) => ((block.name = _), update())} bind:hidden={() => block.hidden, (_) => ((block.hidden = _), update())}>
            {#snippet actions()}{@render controls(block, index)}{/snippet}
          </FormBlock>
        {:else}
          <ComponentBlock name={block.name} signature={catalog.items === null ? null : signatureOf(block.name)} bind:props={() => block.props, (_) => ((block.props = _), update())} bind:hidden={() => block.hidden, (_) => ((block.hidden = _), update())}>
            {#snippet actions()}{@render controls(block, index)}{/snippet}
          </ComponentBlock>
        {/if}
      </li>
      {#if inserting === index}<li class="slot">{@render adder(true)}</li>{/if}
    {/each}
  </ol>
  {@render adder(false)}
</div>

<style>
  .content-editor {
    display: grid;
    gap: 0.75rem;
  }

  ol {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  ol:empty {
    display: none;
  }

  li[data-kind='component'] {
    padding: 0.75rem 1rem 1rem;
    border: 0.0625rem dashed var(--field-line);
    border-radius: var(--radius-l);
    background: var(--sunken);
  }

  /* Кнопки блока приглушены, пока блок не под мышью и не в фокусе: страница читается как текст.
     Но различимы: контраст значков и в покое не ниже 3:1. */
  .controls {
    display: flex;
    gap: 0.125rem;
    opacity: 0.75;
    transition: opacity 150ms ease-out;
  }

  li:hover .controls,
  li:focus-within .controls {
    opacity: 1;
  }

  .slot {
    padding: 0.5rem 0.75rem;
    border: 0.0625rem dashed var(--accent);
    border-radius: var(--radius);
  }

  .group {
    margin: 0.5rem 0 0;
    padding: 0.25rem 0.65rem;
    font-size: 0.75rem;
  }

  .controls .icon {
    width: 2rem;
    min-height: 2rem;
    border-color: transparent;
    background: transparent;
    color: var(--muted);
    box-shadow: none;
  }

  .controls .icon:hover:not(:disabled) {
    border-color: transparent;
    background: var(--hover);
    color: var(--text);
  }

  .controls .danger:hover:not(:disabled) {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .controls .danger:active:not(:disabled) {
    background: color-mix(in oklch, var(--danger) 20%, transparent);
  }

  .empty {
    margin: 0;
  }

  /* Меню компонентов привязано к строке, а не к кнопке: в узкой колонке оно не вылезает за край. */
  .add {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .add > .muted {
    font-size: 0.8125rem;
  }

  summary {
    display: inline-flex;
    gap: 0.4em;
    align-items: center;
    min-height: 2.25rem;
    padding: 0 0.9rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    cursor: pointer;
    list-style: none;
  }

  /* «Компонент» стоит в ряду с кнопками — и откликается так же. */
  summary:hover,
  .menu[open] summary {
    border-color: color-mix(in oklch, var(--field-line) 60%, var(--line));
    background: var(--control-hover);
  }

  summary:active {
    background: var(--control-press);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary :global(svg) {
    width: 1.15em;
    height: 1.15em;
  }

  .popover {
    position: absolute;
    z-index: 2;
    bottom: calc(100% + 0.375rem);
    left: 0;
    width: min(22rem, 100%);
    max-height: 18rem;
    padding: 0.375rem;
    overflow-y: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .popover ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .popover button {
    display: grid;
    gap: 0.1rem;
    justify-content: stretch;
    justify-items: start;
    width: 100%;
    min-height: 0;
    padding: 0.5rem 0.65rem;
    border: 0;
    text-align: left;
  }

  .popover button:hover,
  .popover button:focus-visible {
    border-color: transparent;
    background: var(--accent-soft);
    color: var(--text);
  }

  .popover .muted {
    font-size: 0.8125rem;
  }

  .popover p {
    margin: 0;
    padding: 0.5rem;
  }
</style>
