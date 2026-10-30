<script lang="ts">
import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import {
  liftListItem,
  sinkListItem,
  splitListItem,
} from 'prosemirror-schema-list';
import { type Command, EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { aiReady, askAi } from '#lib/ai.svelte.ts';
import { askValue } from '#lib/dialog.svelte.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { mediaUrl } from '#lib/media.ts';
import { pickMedia } from '#lib/media-picker.svelte.ts';
import {
  commands,
  type Format,
  formatAt,
  formatRules,
  linkAt,
  parseHtml,
  safeHref,
  schema,
  serializeHtml,
} from '#lib/rich-text.ts';
import { tree } from '#lib/tree.svelte.ts';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-gapcursor/style/gapcursor.css';
import { onMount } from 'svelte';

let {
  value = $bindable(''),
  label,
  placeholder = '',
}: { value: string; label: string; placeholder?: string } = $props();

let host: HTMLDivElement;
let view = $state.raw<EditorView | undefined>();
let format = $state<Format | null>(null);

const _BLOCKS = {
  paragraph: 'editor.paragraph',
  h2: 'editor.h2',
  h3: 'editor.h3',
  h4: 'editor.h4',
} as const satisfies Record<string, MessageKey>;

type BlockType = keyof typeof _BLOCKS;

const _hardBreak: Command = chainCommands(
  exitCode,
  (state, dispatch) => (
    dispatch?.(
      state.tr
        .replaceSelectionWith(schema.nodes.hard_break!.create())
        .scrollIntoView()
    ),
    true
  )
);

// Пустой документ показывает подсказку: CSS сам не знает, что абзац единственный.
const _placeholder = (text: string) =>
  new Plugin({
    props: {
      decorations: (state) =>
        state.doc.childCount === 1 &&
        state.doc.firstChild!.isTextblock &&
        state.doc.firstChild!.content.size === 0
          ? DecorationSet.create(state.doc, [
              Decoration.node(0, state.doc.firstChild!.nodeSize, {
                class: 'placeholder',
                'data-placeholder': text,
              }),
            ])
          : null,
    },
  });

let toolbar: HTMLDivElement;
let tool = $state(0);

// Панель — одна остановка Tab: внутри ходят стрелки (WAI-ARIA toolbar).
const _MOVES: Readonly<
  Record<string, (index: number, count: number) => number>
> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

const tools = (): HTMLElement[] => [
  ...toolbar.querySelectorAll<HTMLElement>('[data-tool]'),
];

const onToolKey = (event: KeyboardEvent) => {
  const move = _MOVES[event.key];
  const all = tools();
  const index = all.indexOf(event.target as HTMLElement);
  void (
    move &&
    index !== -1 &&
    (event.preventDefault(),
    (tool = move(index, all.length)),
    all[tool]?.focus())
  );
};

const onToolFocus = (event: FocusEvent) =>
  void ((index) => index !== -1 && (tool = index))(
    tools().indexOf(event.target as HTMLElement)
  );

const run = (command: Command) =>
  void (view && (command(view.state, view.dispatch), view.focus()));

// Что станет ссылкой: `[~id~]` и адреса — как есть; точное название страницы — ссылка на неё;
// «example.com» — https://example.com; остальное — null: такой href на сайте ведёт в никуда.
const _ADDRESS = /^(https?:\/\/|\/|#|\?|mailto:|tel:|\[~\d+~\]$)/i;

const _pageTitled = (text: string) =>
  tree.nodes.find(
    (_) => !_.trashed && _.title.trim().toLowerCase() === text.toLowerCase()
  );

const resolveLink = (input: string): string | null =>
  ((text) =>
    text === '' || _ADDRESS.test(text)
      ? text
      : ((node) =>
          node
            ? `[~${node.id}~]`
            : /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(text)
              ? `https://${text}`
              : null)(_pageTitled(text)))(input.trim());

// Текст новой ссылки без выделения: для страницы — её название, иначе — сам адрес.
const _linkText = (href: string): string =>
  ((match) =>
    (match && tree.nodes.find((_) => _.id === Number(match[1]))?.title) ||
    href)(/^\[~(\d+)~\]$/.exec(href));

const explainLink = (input: string): string =>
  ((href) =>
    href === null
      ? t('editor.linkUnknown')
      : ((match) =>
          match
            ? ((node) =>
                node
                  ? `${t('editor.linkToPage')} «${node.title}»`
                  : t('editor.linkNoPage'))(
                tree.nodes.find((_) => _.id === Number(match[1]))
              )
            : href !== input.trim()
              ? `${t('editor.linkBecomes')} ${href}`
              : '')(/^\[~(\d+)~\]$/.exec(href)))(resolveLink(input));

const link = () =>
  view &&
  askValue({
    title: t('editor.linkTitle'),
    input: {
      label: t('editor.linkAddress'),
      type: 'text',
      value: linkAt(view.state),
      optional: true,
      hint: t('editor.linkHint'),
      // Ссылка на страницу — `[~id~]`: сайт подставит её текущий адрес, переименование не сломает.
      suggestions: tree.nodes
        .filter((_) => !_.trashed)
        .map((_) => ({ value: `[~${_.id}~]`, label: `${_.title} (${_.id})` })),
      explain: explainLink,
      validate: (input) =>
        ((href) =>
          href === null
            ? t('editor.linkUnknown')
            : safeHref(href)
              ? null
              : t('editor.linkUnsafe'))(resolveLink(input)),
    },
    confirm: t('editor.linkConfirm'),
  }).then((input) =>
    ((href) =>
      href === null
        ? view?.focus()
        : run(commands.link(href, _linkText(href))))(
      input === null ? null : resolveLink(input)
    )
  );

const image = () =>
  pickMedia({ images: true, describe: true }).then(
    (_) => void (_ && run(commands.image(mediaUrl(_.file.path), _.alt)))
  );

// Текст блока — с ИИ: ответ встаёт вместо текста одной правкой, её отменяет Ctrl+Z.
let aiButton = $state<HTMLButtonElement>();

const writeWithAi = () =>
  void (
    view &&
    askAi({
      target: {
        kind: 'richtext',
        label,
        value: serializeHtml(view.state.doc),
      },
      anchor: aiButton ?? host,
      apply: (html) =>
        void view?.dispatch(
          view.state.tr.replaceWith(
            0,
            view.state.doc.content.size,
            parseHtml(html).content
          )
        ),
    })
  );

onMount(() => {
  view = new EditorView(host, {
    state: EditorState.create({
      doc: parseHtml(value),
      plugins: [
        formatRules(),
        keymap({
          'Mod-z': undo,
          'Mod-Shift-z': redo,
          'Mod-y': redo,
          'Mod-b': commands.strong,
          'Mod-k': () => (link(), true),
          'Alt-i': () => (aiReady() && writeWithAi(), aiReady()),
          'Mod-i': commands.em,
          'Shift-Enter': _hardBreak,
          Enter: splitListItem(schema.nodes.list_item!),
          'Mod-]': sinkListItem(schema.nodes.list_item!),
          'Mod-[': liftListItem(schema.nodes.list_item!),
        }),
        keymap(baseKeymap),
        history(),
        dropCursor(),
        gapCursor(),
        _placeholder(placeholder),
      ],
    }),
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': label,
    },
    dispatchTransaction(transaction) {
      const next = view!.state.apply(transaction);
      view!.updateState(next);
      format = formatAt(next);
      void (transaction.docChanged && (value = serializeHtml(next.doc)));
    },
  });
  format = formatAt(view.state);
  return () => view?.destroy();
});
</script>

<div class="rich">
  <div class="toolbar" role="toolbar" tabindex="-1" aria-label={t('editor.toolbar')} bind:this={toolbar} onkeydown={onToolKey} onfocusin={onToolFocus}>
    <select
      data-tool
      tabindex={tool === 0 ? 0 : -1}
      aria-label={t('editor.blockType')}
      value={format?.block === 'other' ? '' : format?.block}
      onchange={(e) => run(commands.block(e.currentTarget.value as BlockType))}
    >
      {#if format?.block === 'other'}<option value="">—</option>{/if}
      {#each Object.entries(_BLOCKS) as entry (entry[0])}<option value={entry[0]}>{t(entry[1])}</option>{/each}
    </select>
    <span class="sep"></span>
    <button type="button" data-tool tabindex={tool === 1 ? 0 : -1} class="icon" aria-pressed={format?.strong ?? false} aria-label={t('editor.strong')} title={`${t('editor.strong')} · Ctrl+B`} onclick={() => run(commands.strong)}>{@html icons.bold}</button>
    <button type="button" data-tool tabindex={tool === 2 ? 0 : -1} class="icon" aria-pressed={format?.em ?? false} aria-label={t('editor.em')} title={`${t('editor.em')} · Ctrl+I`} onclick={() => run(commands.em)}>{@html icons.italic}</button>
    <button type="button" data-tool tabindex={tool === 3 ? 0 : -1} class="icon" aria-pressed={format?.link ?? false} aria-label={t('editor.link')} title={t('editor.link')} onclick={link}>{@html icons.link}</button>
    <span class="sep"></span>
    <button type="button" data-tool tabindex={tool === 4 ? 0 : -1} class="icon" aria-pressed={format?.bullets ?? false} aria-label={t('editor.bullets')} title={t('editor.bullets')} onclick={() => run(commands.list('bullet_list', format?.bullets ?? false))}>{@html icons.list}</button>
    <button type="button" data-tool tabindex={tool === 5 ? 0 : -1} class="icon" aria-pressed={format?.numbers ?? false} aria-label={t('editor.numbers')} title={t('editor.numbers')} onclick={() => run(commands.list('ordered_list', format?.numbers ?? false))}>{@html icons.listOrdered}</button>
    <button type="button" data-tool tabindex={tool === 6 ? 0 : -1} class="icon" aria-pressed={format?.quote ?? false} aria-label={t('editor.quote')} title={t('editor.quote')} onclick={() => run(commands.quote(format?.quote ?? false))}>{@html icons.quote}</button>
    <button type="button" data-tool tabindex={tool === 7 ? 0 : -1} class="icon" aria-label={t('editor.image')} title={t('editor.image')} onclick={image}>{@html icons.image}</button>
    {#if aiReady()}
      <span class="sep"></span>
      <button type="button" data-tool tabindex={tool === 8 ? 0 : -1} class="icon ai" bind:this={aiButton} aria-label={t('ai.title')} title={`${t('ai.title')} · Alt+I`} onclick={() => writeWithAi()}>{@html icons.wand}</button>
    {/if}
  </div>
  <div class="surface" bind:this={host}></div>
</div>

<style>
  .rich {
    border: 0.0625rem solid var(--field-line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .rich:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 0.0625rem var(--accent);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
    padding: 0.35rem;
    border-bottom: 0.0625rem solid var(--line);
    background: var(--sunken);
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .toolbar select {
    width: auto;
    min-height: 2rem;
    padding-block: 0;
    font-size: 0.875rem;
  }

  .toolbar .icon {
    min-width: 2rem;
    min-height: 2rem;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .toolbar .icon:hover {
    background: color-mix(in oklch, var(--text) 6%, transparent);
  }

  .toolbar [aria-pressed='true'] {
    border-color: var(--line);
    background: var(--surface);
    color: var(--accent);
  }


  .sep {
    width: 0.0625rem;
    height: 1.25rem;
    margin: 0 0.25rem;
    background: var(--line);
  }

  .surface :global(.ProseMirror) {
    min-height: 8rem;
    padding: 0.75rem 1rem;
    outline: none;
    line-height: 1.6;
  }

  .surface :global(.ProseMirror > :first-child) {
    margin-top: 0;
  }

  .surface :global(.ProseMirror > :last-child) {
    margin-bottom: 0;
  }

  .surface :global(.ProseMirror p) {
    margin: 0 0 0.75em;
  }

  .surface :global(.ProseMirror :is(h2, h3, h4)) {
    margin: 1.2em 0 0.5em;
    line-height: 1.3;
  }

  .surface :global(.ProseMirror h2) {
    font-size: 1.375rem;
  }

  .surface :global(.ProseMirror h3) {
    font-size: 1.1875rem;
  }

  .surface :global(.ProseMirror h4) {
    font-size: 1rem;
  }

  .surface :global(.ProseMirror blockquote) {
    margin: 0 0 0.75em;
    padding-left: 1rem;
    border-left: 0.1875rem solid var(--line);
    color: var(--muted);
  }

  .surface :global(.ProseMirror img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.25rem;
  }

  .surface :global(.ProseMirror img.ProseMirror-selectednode) {
    outline: 0.125rem solid var(--accent);
  }

  .surface :global(.ProseMirror a) {
    color: var(--accent);
  }

  .surface :global(.placeholder::before) {
    float: left;
    height: 0;
    color: var(--muted);
    content: attr(data-placeholder);
    pointer-events: none;
  }
</style>
