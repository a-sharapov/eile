<script lang="ts">
import type { SourcePoint } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';

let {
  error,
  onreveal,
}: {
  error: { readonly text: string; readonly at?: SourcePoint };
  /** Перейти к месту ошибки в редакторе кода. */
  onreveal?: () => void;
} = $props();

// Ссылка на объяснение ошибки (svelte.dev/e/…) — настоящая ссылка, а не текст.
const _parts = (text: string) =>
  text
    .split(/(https:\/\/\S+)/)
    .filter((_) => _ !== '')
    .map((_) => ({ text: _, href: _.startsWith('https://') ? _ : null }));
</script>

<!-- Ошибка в коде: где она (кнопка ведёт к строке) и что сказал компилятор. -->
<div class="source-error" role="alert">
  {#if error.at}
    <button type="button" class="where" onclick={onreveal}>
      {t('elements.errorLine')} {error.at.line}, {t('elements.errorColumn')} {error.at.column}
    </button>
  {/if}
  <pre>{#each _parts(error.text) as part, index (index)}{#if part.href}<a href={part.href} target="_blank" rel="noopener">{part.text}</a>{:else}{part.text}{/if}{/each}</pre>
</div>

<style>
  .source-error {
    display: grid;
    gap: 0.375rem;
    justify-items: start;
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border: 0.0625rem solid color-mix(in oklab, var(--danger) 45%, var(--line));
    border-radius: var(--radius);
    background: var(--danger-soft);
  }

  .where {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--danger);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  pre {
    margin: 0;
    font-family: var(--mono);
    font-size: 0.8125rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  pre a {
    color: inherit;
  }
</style>
