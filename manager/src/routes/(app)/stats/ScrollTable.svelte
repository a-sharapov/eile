<script lang="ts">
import type { Snippet } from 'svelte';

// Таблица шире рамки прокручивается в ней вбок: у правого края — тень «есть ещё столбцы», прокрутили — тень у
// закреплённых колонок (таблица берёт её из `--pinned-shadow` у своей крайней закреплённой ячейки). Рамка —
// область с именем и в порядке Tab: таблицу можно прокрутить стрелками.
let { label, children }: { label: string; children: Snippet } = $props();

let scroller = $state<HTMLElement>();
let edges = $state({ left: false, right: false });

const measure = () =>
  void (
    scroller &&
    (edges = {
      left: scroller.scrollLeft > 1,
      right:
        scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
    })
  );

$effect(() => {
  const observer = new ResizeObserver(measure);
  void (
    scroller &&
    (observer.observe(scroller),
    scroller.firstElementChild && observer.observe(scroller.firstElementChild))
  );
  measure();
  return () => observer.disconnect();
});
</script>

<div class="wrap" class:more={edges.right} class:scrolled={edges.left}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="scroll frame" bind:this={scroller} onscroll={measure} role="region" aria-label={label} tabindex="0">
    {@render children()}
  </div>
</div>

<style>
  .wrap {
    position: relative;
    min-width: 0;
  }

  .scroll {
    position: relative;
    overflow-x: auto;
  }

  .scroll:focus-visible {
    outline-offset: 0.125rem;
  }

  .wrap.more::after {
    content: '';
    position: absolute;
    top: 0.0625rem;
    right: 0.0625rem;
    bottom: 0.0625rem;
    width: 2rem;
    border-radius: 0 var(--radius-l) var(--radius-l) 0;
    background: linear-gradient(
      to right,
      transparent,
      color-mix(in oklch, var(--text) 9%, transparent)
    );
    pointer-events: none;
  }

  .wrap.scrolled {
    --pinned-shadow: 0.5rem 0 0.5rem -0.5rem
      color-mix(in oklch, var(--text) 30%, transparent);
  }
</style>
