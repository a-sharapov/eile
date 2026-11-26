<script lang="ts">
import type { Snippet } from 'svelte';

// Отметка в строке: «тест», «в архиве», состояние человека. Смысл несёт слово, цвет только помогает.
let {
  tone = 'plain',
  title,
  children,
}: {
  tone?: 'plain' | 'ok' | 'warn' | 'accent' | 'danger';
  title?: string;
  children: Snippet;
} = $props();
</script>

<span class="mark {tone}" {title}>{@render children()}</span>

<style>
  .mark {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
    padding: 0.05rem 0.45rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-s);
    background: var(--sunken);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
  }

  /* Текст отметки — цвет тона, притемнённый к тексту: контраст не ниже 4.5:1 и в тёмной теме. */
  .ok {
    border-color: color-mix(in oklch, var(--ok) 35%, var(--line));
    background: var(--ok-soft);
    color: color-mix(in oklch, var(--ok) 65%, var(--text));
  }

  .warn {
    border-color: color-mix(in oklab, var(--warn) 40%, var(--line));
    background: var(--warn-soft);
    color: var(--warn-text);
  }

  .accent {
    border-color: color-mix(in oklch, var(--accent) 35%, var(--line));
    background: var(--accent-soft);
    color: color-mix(in oklch, var(--accent) 70%, var(--text));
  }

  .danger {
    border-color: color-mix(in oklch, var(--danger) 35%, var(--line));
    background: var(--danger-soft);
    color: color-mix(in oklch, var(--danger) 70%, var(--text));
  }
</style>
