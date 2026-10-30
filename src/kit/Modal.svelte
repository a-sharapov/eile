<!-- @component
Окно поверх страницы: текст или текст другой страницы. Открывается «Кнопкой окна» или ссылкой #адрес в
тексте, закрывается крестиком, Esc и щелчком мимо окна.
-->
<script lang="ts">
import { page } from '$core';
import Content from '$core/Content';
import Island from '$core/Island';

let {
  /** Адрес окна латиницей: его открывают кнопка и ссылка #адрес */
  id,
  /** Заголовок */
  title = '',
  /** Текст окна */
  text = '',
  /** Страница, чей текст показать в окне: id */
  source = null,
  /** Ширина: sm=Узкое, md=Среднее, lg=Широкое */
  size = 'md',
  /** Подпись крестика для читалок экрана */
  closeLabel = 'Закрыть',
}: {
  id: string;
  title?: string;
  text?: string;
  source?: number | null;
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
} = $props();

const from = $derived(source === null ? null : page(source));
</script>

<dialog
  {id}
  class="modal {size}"
  aria-labelledby={title ? `${id}-title` : undefined}
  aria-label={title ? undefined : closeLabel}
  closedby="any"
  data-modal
>
  <div class="head">
    {#if title}<h2 id="{id}-title">{title}</h2>{/if}
    <button type="button" class="close" commandfor={id} command="close" aria-label={closeLabel}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </div>
  <div class="body">
    {#if text}<p>{text}</p>{/if}
    {#if from}<Content of={from} />{/if}
  </div>
</dialog>
<Island name="ModalLinks" />

<style>
  .modal {
    width: min(100% - 2rem, var(--modal-width));
    max-height: min(100dvh - 2rem, 48rem);
    padding: 0;
    border: 0;
    border-radius: calc(var(--t-radius, 0.375rem) * 2);
    background: var(--t-surface, #fff);
    color: var(--t-text, #1d2430);
    box-shadow: 0 1.5rem 4rem rgb(16 24 40 / 0.24);
    overflow: auto;
  }

  .sm {
    --modal-width: 24rem;
  }

  .md {
    --modal-width: 36rem;
  }

  .lg {
    --modal-width: 56rem;
  }

  .modal::backdrop {
    background: rgb(16 24 40 / 0.5);
    backdrop-filter: blur(0.125rem);
  }

  /* Появление без JS: @starting-style задаёт, откуда окно выезжает. */
  .modal[open] {
    opacity: 1;
    translate: 0 0;
    transition:
      opacity 0.2s,
      translate 0.2s,
      overlay 0.2s allow-discrete,
      display 0.2s allow-discrete;
  }

  @starting-style {
    .modal[open] {
      opacity: 0;
      translate: 0 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal[open] {
      transition: none;
    }
  }

  /* Страница под окном не прокручивается; ширина полосы прокрутки сохраняется — без прыжка. */
  :global(html:has(dialog[data-modal]:modal)) {
    overflow: hidden;
    scrollbar-gutter: stable;
  }

  .head {
    display: flex;
    align-items: start;
    gap: 1rem;
    padding: 1.25rem 1.25rem 0;
  }

  h2 {
    flex: 1;
    margin: 0;
    font-size: 1.25em;
    line-height: 1.3;
  }

  .close {
    margin-inline-start: auto;
    padding: 0.375rem;
    border: 0;
    border-radius: var(--t-radius, 0.375rem);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .close:hover {
    background: var(--t-hover, #f1f4f8);
  }

  .close:focus-visible {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.125rem;
  }

  svg {
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .body {
    padding: 1rem 1.25rem 1.5rem;
  }

  .body > :global(:first-child) {
    margin-block-start: 0;
  }
</style>
