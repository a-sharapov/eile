<script lang="ts">
import type { Snippet } from 'svelte';
import { t } from '#lib/i18n.ts';
import { fitsVisual } from '#lib/rich-text.ts';
import RichText from './RichText.svelte';

let {
  value = $bindable(''),
  label,
  placeholder = '',
  actions,
}: {
  value: string;
  label: string;
  placeholder?: string;
  /** Кнопки блока справа в заголовке: порядок, удаление. */
  actions?: Snippet;
} = $props();

// CodeMirror — сотни килобайт: грузим, только когда блок открыли как HTML.
const codeEditor = () => import('./CodeEditor.svelte').then((_) => _.default);

// Разметку, которую визуальный редактор упростил бы (классы, таблицы, комментарии), правим как HTML.
let visual = $state(fitsVisual(value));
const switchable = $derived(visual || fitsVisual(value));
</script>

<div class="text-block">
  <div class="head">
    <span class="title">{label}</span>
    <div class="mode" role="group" aria-label={`${t('editor.mode')}: ${label}`}>
      <button type="button" aria-pressed={visual} disabled={!switchable} title={switchable ? undefined : t('editor.tooComplex')} onclick={() => (visual = true)}>{t('editor.visual')}</button>
      <button type="button" aria-pressed={!visual} onclick={() => (visual = false)}>HTML</button>
    </div>
    {@render actions?.()}
  </div>
  {#if visual}
    <RichText bind:value {label} {placeholder} />
  {:else}
    {#if !switchable}<p class="muted note">{t('editor.tooComplex')}</p>{/if}
    {#await codeEditor()}
      <p class="muted note">{t('common.loading')}</p>
    {:then CodeEditor}
      <CodeEditor bind:value {label} compact />
    {/await}
  {/if}
</div>

<style>
  .text-block {
    display: grid;
    gap: 0.4rem;
  }

  .head {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2rem;
  }

  .title {
    margin-right: auto;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .mode {
    display: flex;
  }

  .mode button {
    min-height: 1.75rem;
    padding: 0 0.6rem;
    border-radius: 0;
    font-size: 0.8125rem;
  }

  .mode button:first-child {
    border-radius: var(--radius) 0 0 var(--radius);
  }

  .mode button:last-child {
    margin-left: -0.0625rem;
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  /* Переключатель режима — служебный: нейтральный и приглушённый, пока блок не в работе. */
  .mode {
    opacity: 0.75;
    transition: opacity 150ms ease-out;
  }

  .text-block:hover .mode,
  .text-block:focus-within .mode {
    opacity: 1;
  }

  .mode button {
    color: var(--muted);
  }

  .mode [aria-pressed='true'] {
    position: relative;
    border-color: var(--field-line);
    background: var(--sunken);
    color: var(--text);
    font-weight: 600;
  }

  .note {
    margin: 0;
    font-size: 0.8125rem;
  }
</style>
