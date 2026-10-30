<script lang="ts">
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import {
  EditorState,
  type Extension,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { Decoration, type DecorationSet, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup, EditorView } from 'codemirror';
import { onMount } from 'svelte';
import { aiReady, askAi } from '#lib/ai.svelte.ts';
import type { SourcePoint } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';

let {
  value = $bindable(''),
  onsave,
  language = 'html',
  label,
  compact = false,
  problem = null,
  ai = null,
  readonly = false,
}: {
  value: string;
  onsave?: () => void;
  /** Задаётся при создании: другой язык — новый редактор (`{#key}`). */
  language?: 'html' | 'typescript' | 'css' | 'javascript' | 'xml' | 'text';
  label?: string;
  /** Высота по содержимому — для HTML-блока внутри формы. */
  compact?: boolean;
  /** Где ошибка компиляции: строка подсвечивается, курсор встаёт на место (прокрутка — по «Строка N»). */
  problem?: SourcePoint | null;
  /** Код можно написать с ИИ: что это за файл. */
  /** Только смотреть: текст правит тот, у кого есть права. */
  readonly?: boolean;
  ai?: {
    readonly kind: 'template' | 'component' | 'plugin';
    readonly label: string;
  } | null;
} = $props();

// Код — с ИИ: ответ встаёт вместо файла одной правкой, её отменяет Ctrl+Z.
let aiButton = $state<HTMLButtonElement>();

const writeWithAi = (): boolean =>
  Boolean(
    ai &&
      view &&
      aiReady() &&
      (askAi({
        target: {
          kind: ai.kind,
          label: ai.label,
          value: view.state.doc.toString(),
        },
        anchor: aiButton ?? host,
        apply: (code) =>
          void view?.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: code },
          }),
      }),
      true)
  );

const _setProblem = StateEffect.define<number | null>();
const _problemLine = Decoration.line({ class: 'cm-problem-line' });

const _problemField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (marks, transaction) =>
    transaction.effects.reduce(
      (current, effect) =>
        effect.is(_setProblem)
          ? effect.value === null
            ? Decoration.none
            : Decoration.set([
                _problemLine.range(
                  transaction.state.doc.line(effect.value).from
                ),
              ])
          : current,
      marks.map(transaction.changes)
    ),
  provide: (field) => EditorView.decorations.from(field),
});

// Строка и столбец с единицы → позиция в документе, не дальше его конца.
const _position = (view: EditorView, point: SourcePoint) =>
  ((line) => ({
    line: line.number,
    at: Math.min(line.from + point.column - 1, line.to),
  }))(
    view.state.doc.line(Math.min(Math.max(point.line, 1), view.state.doc.lines))
  );

// XML и SVG — разбором HTML: теги, атрибуты и строки он подсвечивает так же.
const _LANGUAGES: Readonly<
  Record<NonNullable<typeof language>, () => Extension>
> = {
  html: () => html({ autoCloseTags: true }),
  typescript: () => javascript({ typescript: true }),
  css: () => css(),
  javascript: () => javascript(),
  xml: () => html({ autoCloseTags: true, matchClosingTags: true }),
  text: () => [],
};

// Цвета берутся из токенов темы: светлая и тёмная схема переключаются сами, без второй темы CodeMirror.
const _highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword],
    color: 'var(--code-keyword)',
  },
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--code-tag)' },
  { tag: tags.attributeName, color: 'var(--code-attribute)' },
  { tag: [tags.string, tags.attributeValue], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: 'var(--code-comment)',
    fontStyle: 'italic',
  },
  {
    tag: [
      tags.variableName,
      tags.propertyName,
      tags.definition(tags.variableName),
    ],
    color: 'var(--code-variable)',
  },
  { tag: [tags.typeName, tags.className], color: 'var(--code-tag)' },
]);

const _theme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--surface)' },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--sunken)',
    color: 'var(--muted)',
    borderRight: '1px solid var(--line)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklch, var(--accent) 6%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklch, var(--accent) 10%, transparent)',
    color: 'var(--text)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'color-mix(in oklch, var(--accent) 24%, transparent)',
    },
  '.cm-problem-line': {
    backgroundColor: 'color-mix(in oklch, var(--danger) 12%, transparent)',
    boxShadow: 'inset 0.1875rem 0 var(--danger)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in oklch, var(--accent) 18%, transparent)',
    outline: 'none',
  },
});

let host: HTMLDivElement;
// $state.raw: эффект ниже должен заметить появление редактора, а сам EditorView проксировать нельзя.
let view = $state.raw<EditorView | undefined>();

// Внешняя замена значения (другой элемент) переписывает документ; ввод пользователя — нет.
$effect(() => {
  const next = value;
  const current = view?.state.doc.toString();
  void (
    view &&
    current !== next &&
    view.dispatch({ changes: { from: 0, to: current!.length, insert: next } })
  );
});

const _showProblem = (editor: EditorView, point: SourcePoint | null) =>
  editor.dispatch(
    point
      ? ((place) => ({
          effects: _setProblem.of(place.line),
          selection: { anchor: place.at },
        }))(_position(editor, point))
      : { effects: _setProblem.of(null) }
  );

$effect(() => {
  const point = problem;
  void (view && _showProblem(view, point));
});

onMount(() => {
  view = new EditorView({
    parent: host,
    doc: value,
    extensions: [
      basicSetup,
      _theme,
      _problemField,
      syntaxHighlighting(_highlight),
      _LANGUAGES[language](),
      EditorState.readOnly.of(readonly),
      EditorView.editable.of(!readonly),
      keymap.of(
        onsave
          ? [
              { key: 'Alt-i', run: () => writeWithAi() },
              {
                key: 'Mod-s',
                preventDefault: true,
                run: () => (onsave(), true),
              },
            ]
          : []
      ),
      compact ? EditorView.lineWrapping : [],
      EditorView.contentAttributes.of(label ? { 'aria-label': label } : {}),
      EditorView.updateListener.of(
        (update) =>
          void (update.docChanged && (value = update.state.doc.toString()))
      ),
    ],
  });
  return () => view?.destroy();
});
</script>

<div class="editor-frame">
  <div class="editor" class:compact bind:this={host}></div>
  {#if ai && aiReady()}
    <button type="button" class="ai" bind:this={aiButton} aria-label={`${t('ai.title')}: ${ai.label}`} title={`${t('ai.title')} · Alt+I`} onclick={writeWithAi}>{@html icons.wand}{t('ai.short')}</button>
  {/if}
</div>

<style>
  .editor-frame {
    position: relative;
    height: 100%;
  }

  /* Палочка — в углу редактора, над кодом: не занимает строку и видна сразу. */
  .ai {
    position: absolute;
    top: 0.5rem;
    right: 0.75rem;
    z-index: 2;
    min-height: 2rem;
    padding: 0 0.75rem;
    font-size: 0.8125rem;
  }

  .ai :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--accent);
  }

  .editor {
    height: 100%;
    min-height: 20rem;
    overflow: hidden;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    font-size: 0.875rem;
  }

  .compact {
    height: auto;
    min-height: 0;
    border-color: var(--field-line);
  }

  .compact :global(.cm-content) {
    min-height: 6rem;
  }

  /* Разметку CodeMirror создаёт библиотека: scoped-атрибута на ней нет. */
  .editor :global(.cm-editor) {
    height: 100%;
  }

  .editor :global(.cm-scroller) {
    font-family: var(--mono);
    font-variant-ligatures: none;
  }
</style>
