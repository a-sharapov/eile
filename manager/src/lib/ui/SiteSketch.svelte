<script lang="ts">
let {
  kind,
}: {
  /** missing — на месте страницы пусто; forbidden — ветка под замком; broken — ствол оборван. */
  kind: 'missing' | 'forbidden' | 'broken';
} = $props();
</script>

<!-- Рисунок из того же языка, что дерево: ствол, ветки, узлы статусов. Только украшение. -->
<svg class="sketch {kind}" viewBox="0 0 180 104" aria-hidden="true" focusable="false">
  {#if kind === 'broken'}
    <path class="line" d="M18 24 V50 M18 64 V84" />
  {:else}
    <path class="line" d="M18 24 V84" />
  {/if}
  <path class="line" d="M18 46 H40 M18 84 H40" />
  <circle class="node root" cx="18" cy="16" r="8" />
  <circle class="node ok" cx="52" cy="46" r="6" />
  <rect class="bar" x="68" y="42" width="78" height="8" rx="4" />
  {#if kind === 'missing'}
    <circle class="node gone" cx="52" cy="84" r="7" />
    <rect class="bar gone" x="68" y="80" width="96" height="8" rx="4" />
  {:else if kind === 'forbidden'}
    <circle class="node lock-ring" cx="52" cy="84" r="9" />
    <path class="lock" d="M48.5 83 V80.5 a3.5 3.5 0 0 1 7 0 V83" />
    <rect class="lock-body" x="46.5" y="83" width="11" height="7.5" rx="1.5" />
    <rect class="bar soft" x="70" y="80" width="88" height="8" rx="4" />
  {:else}
    <circle class="node broken-ring" cx="52" cy="84" r="7" />
    <rect class="bar soft" x="68" y="80" width="88" height="8" rx="4" />
  {/if}
</svg>

<style>
  .sketch {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .line {
    fill: none;
    stroke: var(--field-line);
    stroke-linecap: round;
    stroke-width: 1.5;
  }

  .root {
    fill: var(--accent);
  }

  .ok {
    fill: var(--ok);
  }

  .bar {
    fill: var(--line);
  }

  .bar.soft {
    fill: color-mix(in oklab, var(--line) 70%, transparent);
  }

  /* Нет страницы: на её месте — пунктир, как у ещё не сохранённой. */
  .gone {
    fill: none;
    stroke: var(--muted);
    stroke-dasharray: 2.5 2.5;
    stroke-width: 1.5;
  }

  .bar.gone {
    fill: none;
    stroke: var(--field-line);
    stroke-dasharray: 3 3;
  }

  .lock-ring {
    fill: var(--accent-soft);
    stroke: color-mix(in oklab, var(--accent) 50%, var(--line));
    stroke-width: 1.5;
  }

  .lock {
    fill: none;
    stroke: var(--accent);
    stroke-linecap: round;
    stroke-width: 1.5;
  }

  .lock-body {
    fill: var(--accent);
  }

  .broken-ring {
    fill: var(--canvas);
    stroke: var(--danger);
    stroke-width: 1.5;
  }
</style>
