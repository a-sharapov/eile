<script lang="ts">
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { Notice } from '#lib/notices.svelte.ts';
import { dismiss, hold, notices, release } from '#lib/notices.svelte.ts';
</script>

<!-- Живые области существуют всегда: читалка объявляет только то, что появилось внутри уже знакомой области. -->
<div class="notices">
  <div class="live" role="status" aria-live="polite">
    {#each notices.items.filter((_) => _.tone !== 'error') as notice (notice.id)}{@render item(notice)}{/each}
  </div>
  <div class="live" role="alert" aria-live="assertive">
    {#each notices.items.filter((_) => _.tone === 'error') as notice (notice.id)}{@render item(notice)}{/each}
  </div>
</div>

{#snippet item(notice: Notice)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="notice" data-tone={notice.tone} onmouseenter={() => hold(notice.id)} onmouseleave={() => release(notice.id)} onfocusin={() => hold(notice.id)} onfocusout={() => release(notice.id)}>
      <span class="tone" aria-hidden="true">{@html notice.tone === 'error' ? icons.alert : icons.saved}</span>
      <span class="text">{notice.text}</span>
      {#if notice.action}
        <button type="button" class="action" onclick={() => (notice.action!.run(), dismiss(notice.id))}>{notice.action.label}</button>
      {/if}
      <button type="button" class="icon" aria-label={t('common.close')} title={t('common.close')} onclick={() => dismiss(notice.id)}>
        {@html icons.close}
      </button>
    </div>
{/snippet}

<style>
  /* Сверху по центру, над шапкой: результат действия — там, куда смотрят первым. Полоса во всю ширину
     щелчков не ловит — их получают только сами уведомления. */
  .notices {
    position: fixed;
    top: calc(0.75rem + env(safe-area-inset-top));
    inset-inline: 1rem;
    z-index: 50;
    display: flex;
    /* Ошибки — над успехами, свежие — сверху. */
    flex-direction: column-reverse;
    gap: 0.5rem;
    align-items: center;
    pointer-events: none;
  }

  .live {
    display: flex;
    flex-direction: column-reverse;
    gap: 0.5rem;
    align-items: center;
    width: 100%;
  }

  /* Пустая область не исчезает из дерева доступности (display: none сорвал бы первое объявление),
     а только не занимает места. */
  .live:empty {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* Тёмная плашка на светлом интерфейсе (в тёмной теме — светлая): заметна поверх любой страницы.
     Ошибка — красная. */
  .notice {
    --tone: light-dark(oklch(80% 0.16 150), oklch(46% 0.13 150));
    display: flex;
    gap: 0.75rem;
    align-items: center;
    width: max-content;
    min-width: min(22rem, 100%);
    max-width: min(40rem, 100%);
    padding: 0.625rem 0.5rem 0.625rem 1rem;
    border-radius: var(--radius-l);
    background: var(--text);
    color: var(--surface);
    box-shadow: var(--shadow-big);
    font-weight: 550;
    line-height: 1.35;
    pointer-events: auto;
    animation: notice-in 260ms var(--ease);
  }

  .notice[data-tone='error'] {
    --tone: currentColor;
    background: var(--danger);
  }

  @keyframes notice-in {
    from {
      opacity: 0;
      transform: translateY(-0.75rem) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .notice {
      animation: none;
    }
  }

  .tone {
    display: inline-flex;
    flex: none;
    color: var(--tone);
  }

  .tone :global(svg) {
    width: 1.25rem;
    height: 1.25rem;
  }

  .text {
    flex: 1;
    overflow-wrap: anywhere;
  }

  .notice button {
    border: 0;
    background: transparent;
    box-shadow: none;
    color: inherit;
  }

  .notice button:hover {
    background: color-mix(in oklch, currentColor 16%, transparent);
  }

  .notice button:focus-visible {
    outline-color: currentColor;
  }

  .notice .action {
    min-height: 2rem;
    padding-inline: 0.75rem;
    border: 0.0625rem solid color-mix(in oklch, currentColor 55%, transparent);
    font-weight: 650;
  }

  @media (width < 48rem) {
    .notices {
      inset-inline: 0.75rem;
    }

    .notice {
      width: 100%;
    }
  }
</style>
