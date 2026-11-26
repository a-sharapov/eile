<script lang="ts">
import type { Snippet } from 'svelte';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';

// Окно экранов аналитики: модальное, Esc и «Закрыть» закрывают, фокус возвращается туда, откуда окно
// открыли, — кнопка в строке таблицы остаётся под рукой.
let {
  open,
  title,
  wide = false,
  full = false,
  onclose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  /** Широкое окно: тело события, итог загрузки, ключ с примером. */
  wide?: boolean;
  /** На узком экране — во весь экран: окно дня проверки с таблицами и действиями. */
  full?: boolean;
  onclose: () => void;
  children: Snippet;
  /** Кнопки внизу; без них — одна «Закрыть». */
  footer?: Snippet;
} = $props();

let element: HTMLDialogElement;
let opener: HTMLElement | null = null;
const id = $props.id();

$effect(() => {
  void (open
    ? element.open ||
      ((opener = document.activeElement as HTMLElement | null),
      element.showModal())
    : element.open && element.close());
});

// Кнопка, с которой открыли окно, могла уйти вместе со строкой (удалили, перечитали список) — тогда фокус на холст.
const restore = () =>
  void (opener?.isConnected
    ? opener.focus()
    : document.querySelector<HTMLElement>('#main')?.focus());
</script>

<dialog bind:this={element} class:wide class:full aria-labelledby={`${id}-title`} oncancel={(e) => (e.preventDefault(), onclose())} onclose={restore}>
  {#if open}
    <div class="body">
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
        <button type="button" class="ghost icon" aria-label={t('common.close')} title={t('common.close')} onclick={onclose}>{@html icons.close}</button>
      </header>
      {@render children()}
      <div class="actions">
        {#if footer}{@render footer()}{:else}<button type="button" onclick={onclose}>{t('common.close')}</button>{/if}
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 34rem);
    max-height: min(100dvh - 2rem, 52rem);
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-xl);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-big);
  }

  dialog.wide {
    width: min(100% - 2rem, 52rem);
  }

  dialog::backdrop {
    background: oklch(15% 0.02 var(--hue) / 0.35);
  }

  .body {
    display: grid;
    gap: 1.1rem;
    min-width: 0;
    padding: 1.5rem;
  }

  header {
    display: flex;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
  }

  /* Длинные слова (немецкие названия проверок) — переносом по слогам; разрыв в любом месте — только запасной. */
  h2 {
    min-width: 0;
    font-size: 1.25rem;
    overflow-wrap: anywhere;
    hyphens: auto;
  }

  header button {
    flex: none;
    margin: -0.4rem -0.5rem 0 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  @media (max-width: 30rem) {
    .body {
      padding: 1.25rem 1rem;
    }
  }

  @media (max-width: 48rem) {
    dialog.full {
      width: 100%;
      max-width: none;
      height: 100dvh;
      max-height: none;
      margin: 0;
      border: 0;
      border-radius: 0;
    }
  }
</style>
