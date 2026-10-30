<script lang="ts">
import type { Snippet } from 'svelte';
import { t } from '#lib/i18n.ts';

export type Tab = {
  readonly id: string;
  readonly label: string;
  /** Отметка у вкладки: несохранённое или ошибка внутри. */
  readonly flag?: boolean;
  readonly content: Snippet;
};

let {
  tabs,
  current = $bindable(tabs[0]?.id ?? ''),
  label,
}: { tabs: readonly Tab[]; current?: string; label: string } = $props();

let strip: HTMLDivElement;

// На телефоне полоса вкладок прокручивается: выбранная вкладка всегда в поле зрения.
$effect(() => {
  const tab = strip?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
  void (
    tab &&
    strip.scrollWidth > strip.clientWidth &&
    strip.scrollTo({
      left: tab.offsetLeft - 16,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  );
});

// Стрелки переключают вкладки (WAI-ARIA tabs); панели не размонтируются — правки на них живут.
const _MOVES: Readonly<
  Record<string, (index: number, count: number) => number>
> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

const onKey = (event: KeyboardEvent) => {
  const move = _MOVES[event.key];
  const index = tabs.findIndex((_) => _.id === current);
  void (
    move &&
    (event.preventDefault(),
    (current = tabs[move(index, tabs.length)]!.id),
    strip.querySelector<HTMLElement>(`[data-tab="${current}"]`)?.focus())
  );
};
</script>

<div class="tabs">
  <div class="strip" role="tablist" aria-label={label} tabindex="-1" bind:this={strip} onkeydown={onKey}>
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        role="tab"
        id={`tab-${tab.id}`}
        data-tab={tab.id}
        aria-selected={current === tab.id}
        aria-controls={`panel-${tab.id}`}
        tabindex={current === tab.id ? 0 : -1}
        onclick={() => (current = tab.id)}
      >
        {tab.label}{#if tab.flag}<span class="flag" aria-hidden="true"></span><span class="sr-only"> ({t('common.unsaved')})</span>{/if}
      </button>
    {/each}
  </div>
  {#each tabs as tab (tab.id)}
    <div class="panel" role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={current !== tab.id}>
      {@render tab.content()}
    </div>
  {/each}
</div>

<style>
  /* minmax(0, 1fr): полоса вкладок прокручивается сама и не распирает страницу на телефоне. */
  .tabs {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
  }

  /* Вкладки над формой: строка с линией снизу, текущая — подчёркнута акцентом. */
  .strip {
    display: flex;
    gap: 0.25rem;
    border-bottom: 0.0625rem solid var(--line);
  }

  button {
    position: relative;
    min-height: 2.75rem;
    padding: 0 0.85rem;
    border: 0;
    border-radius: var(--radius) var(--radius) 0 0;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 550;
  }

  button::after {
    position: absolute;
    right: 0.6rem;
    bottom: -0.0625rem;
    left: 0.6rem;
    height: 0.125rem;
    border-radius: 0.125rem 0.125rem 0 0;
    background: transparent;
    content: '';
    transition: background-color 140ms var(--ease);
  }

  button:hover:not([aria-selected='true']) {
    border-color: transparent;
    background: var(--hover);
    color: var(--text);
  }

  button[aria-selected='true'] {
    color: var(--text);
    cursor: default;
  }

  button[aria-selected='true']::after {
    background: var(--accent);
  }

  button[aria-selected='true']:hover {
    background: transparent;
    color: var(--text);
  }

  .flag {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--mark);
  }

  /* Панель — часть холстины, не карточка; контейнер: раскладка внутри следует её ширине. */
  .panel {
    display: grid;
    min-width: 0;
    container-type: inline-size;
    gap: 1.5rem;
    padding: 1.75rem 0 0;
  }

  @property --fade {
    syntax: '<length>';
    inherits: false;
    initial-value: 0rem;
  }

  @keyframes strip-fade {
    from {
      --fade: 2.5rem;
    }

    to {
      --fade: 0rem;
    }
  }

  .panel[hidden] {
    display: none;
  }

  /* Телефон: вкладки в одну строку с прокруткой — без одинокой вкладки на второй строке. */
  @media (width < 48rem) {
    .strip {
      position: relative;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }

    /* Затухание у правого края, пока справа есть вкладки: видно, что полоса прокручивается. */
    @supports (animation-timeline: scroll()) {
      .strip {
        mask-image: linear-gradient(
          90deg,
          #000 calc(100% - var(--fade)),
          transparent
        );
        animation: strip-fade linear both;
        animation-timeline: scroll(self inline);
      }
    }

    button {
      flex: none;
      padding: 0 0.7rem;
    }

    .panel {
      padding-top: 1.25rem;
    }
  }
</style>
