<script lang="ts">
import { type Snippet, tick } from 'svelte';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { Load } from '#lib/loading.svelte.ts';

let {
  load,
  children,
  compact = false,
}: {
  load: Load;
  children?: Snippet;
  /** Узкое место (панель дерева): та же ошибка, но мельче. */
  compact?: boolean;
} = $props();

// Кнопка исчезает вместе с ошибкой: фокус — на холст (или куда ушёл сам), а не в никуда.
const retry = () =>
  load
    .retry()
    .then(() => tick())
    .then(
      () =>
        void (
          document.activeElement === document.body &&
          document.querySelector<HTMLElement>('#main')?.focus()
        )
    );
</script>

<!-- Не загрузилось — так и говорим, с «Повторить»; данные, загруженные раньше, остаются на месте. -->
{#if load.state.error}
  <div class="load-error" class:compact role={compact ? 'status' : 'alert'}>
    <span class="tone" aria-hidden="true">{@html icons.alert}</span>
    <p>{load.state.error}</p>
    <button type="button" onclick={retry}>{@html icons.refresh}{t('common.retry')}</button>
  </div>
{/if}
{#if load.state.ready}
  {@render children?.()}
{:else if !load.state.error}
  <p class="muted waiting">{t('common.loading')}</p>
{/if}

<style>
  .load-error {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border: 0.0625rem solid color-mix(in oklab, var(--danger) 35%, var(--line));
    border-radius: var(--radius-l);
    background: var(--danger-soft);
  }

  .load-error p {
    flex: 1 1 14rem;
    margin: 0;
    font-size: 0.875rem;
  }

  .tone {
    display: inline-flex;
    color: var(--danger);
  }

  .tone :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .compact {
    margin: 0.5rem;
    padding: 0.625rem 0.75rem;
  }

  .compact p {
    font-size: 0.8125rem;
  }

  /* «Загрузка…» появляется, только если ждать заметно: быстрый ответ не мигает текстом. */
  .waiting {
    margin: 0;
    animation: waiting-in 1ms 300ms backwards;
    font-size: 0.875rem;
  }

  @keyframes waiting-in {
    from {
      visibility: hidden;
    }
  }
</style>
