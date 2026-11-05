<!-- @component
Окно в духе KDE Plasma (Breeze) вокруг вида интерфейса: слева значок программы и булавка, по центру
заголовок, справа «свернуть», «развернуть» и «закрыть» кружком. Рамка — оформление: строка заголовка
скрыта от читалки, описание остаётся у картинки внутри. Узкое окно (кадр для телефона) получает
компактную строку, чтобы она не съедала экран. `tone="code"` — всегда тёмное окно кода.
-->
<script lang="ts">
import type { Snippet } from 'svelte';

let {
  /** Заголовок окна: «Eile — Менеджер», имя страницы или файла */
  title = '',
  /** page — по теме сайта; code — тёмное окно кода в обеих темах */
  tone = 'page',
  children,
}: { title?: string; tone?: 'page' | 'code'; children?: Snippet } = $props();
</script>

<div class="window" class:code={tone === 'code'}>
  <div class="bar" aria-hidden="true">
    <span class="lead">
      <svg class="app" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" />
        <path
          fill-rule="evenodd"
          d="M14.446 9.234C16.73 10.458 18.33 12.657 18.791 15.207C19.223 14.066 20.259 13.263 21.473 13.131C22.686 12.999 23.871 13.559 24.539 14.581C25.206 15.603 25.244 16.913 24.636 17.971C26.027 18.694 27.192 19.787 28 21.131C27.153 20.603 26.297 20.087 25.433 19.586C24.936 19.297 24.41 19.059 23.864 18.876C23.246 19.376 22.467 19.632 21.674 19.595C20.842 21.833 19.107 23.618 16.893 24.512C14.679 25.406 12.19 25.327 10.038 24.293C8.05 24.843 6.035 25.288 4 25.625C7.013 22.704 10.218 19.988 13.594 17.495C12.094 15.911 10.741 14.194 9.553 12.365C8.382 10.563 7.651 8.511 7.417 6.375C9.854 7.078 12.21 8.036 14.446 9.234L14.446 9.234ZM23.162 15.662C23.415 15.729 23.565 15.989 23.497 16.241C23.429 16.494 23.17 16.644 22.917 16.576C22.665 16.508 22.515 16.249 22.583 15.996C22.65 15.744 22.91 15.594 23.162 15.662L23.162 15.662Z"
        />
      </svg>
      <svg class="glyph pin" viewBox="0 0 24 24">
        <g transform="rotate(45 12 12)">
          <path d="M9 4h6l-1 6 3 3v1H7v-1l3-3z" />
          <path d="M12 14v6" />
        </g>
      </svg>
    </span>
    <span class="title">{title}</span>
    <span class="controls">
      <svg class="glyph" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg>
      <svg class="glyph" viewBox="0 0 24 24"><path d="m7 14 5-5 5 5" /></svg>
      <span class="close">
        <svg class="glyph" viewBox="0 0 24 24"><path d="m9 9 6 6m0-6-6 6" /></svg>
      </span>
    </span>
  </div>
  <div class="body">{@render children?.()}</div>
</div>

<style>
  .window {
    --win-bar: var(--bg);
    --win-line: var(--line-strong);
    --win-ink: var(--muted);
    --win-title: var(--text);
    --win-app: var(--fill);
    --win-app-ink: var(--on-fill);
    container: window / inline-size;
    overflow: hidden;
    border: 1px solid var(--win-line);
    border-radius: var(--radius-window);
    background: var(--raised);
    box-shadow: var(--shadow-shot);
  }

  /* Окно кода тёмное в обеих темах, как и сам код; тени у него нет — плывёт только снимок продукта. */
  .code {
    --win-bar: #171b21;
    --win-line: #262d36;
    --win-ink: #8d97a4;
    --win-title: #d8dee6;
    --win-app: #6a9be0;
    --win-app-ink: #0b1320;
    background: var(--code-bg);
    box-shadow: none;
  }

  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    height: 2.125rem;
    padding: 0 0.5rem;
    border-bottom: 1px solid var(--win-line);
    background: var(--win-bar);
    color: var(--win-ink);
  }

  .lead,
  .controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .controls {
    justify-content: end;
  }

  svg {
    display: block;
    flex: none;
  }

  .app {
    width: 1.125rem;
    height: 1.125rem;
  }

  .app rect {
    fill: var(--win-app);
  }

  .app path {
    fill: var(--win-app-ink);
  }

  .glyph {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Breeze рисует «закрыть» кружком. */
  .close {
    display: grid;
    place-items: center;
    width: 1.125rem;
    height: 1.125rem;
    border: 1px solid currentColor;
    border-radius: 50%;
  }

  .close .glyph {
    width: 0.875rem;
    height: 0.875rem;
  }

  .title {
    overflow: hidden;
    color: var(--win-title);
    font: 500 0.8125rem/1 var(--sans);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .body {
    position: relative;
  }

  .body > :global(*) {
    display: block;
  }

  /* Кадр для телефона: строка тоньше, булавки нет. */
  @container window (max-width: 34rem) {
    .bar {
      gap: 0.5rem;
      height: 1.5rem;
      padding: 0 0.4rem;
    }

    .lead,
    .controls {
      gap: 0.4rem;
    }

    .pin {
      display: none;
    }

    .app,
    .close {
      width: 0.8125rem;
      height: 0.8125rem;
    }

    .glyph {
      width: 0.75rem;
      height: 0.75rem;
    }

    .close .glyph {
      width: 0.625rem;
      height: 0.625rem;
    }

    .title {
      font-size: 0.6875rem;
    }
  }
</style>
