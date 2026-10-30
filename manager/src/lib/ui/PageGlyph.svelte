<script lang="ts">
import { typeIcon } from '#lib/content-types.ts';
import { icons } from '#lib/icons.ts';

// Значок типа страницы (ссылка, HTML, CSS, лента, SVG…), на его углу — точка статуса.
let {
  kind,
  contentType,
  status,
  title,
}: {
  kind: 'page' | 'link';
  contentType: string;
  status: string;
  title?: string;
} = $props();

const glyph = $derived(kind === 'link' ? icons.link : typeIcon(contentType));
</script>

<span class="page-glyph" data-status={status} aria-hidden="true" {title}>
  <span class="glyph">{@html glyph}</span>
  {#key status}<i class="status-node"></i>{/key}
</span>

<style>
  /* Точка на правом нижнем углу: опубликована — закрашенная, черновик — кольцо, по расписанию —
     наполовину. Под ней в значке вырезан круг — точка читается на любом фоне строки. */
  .page-glyph {
    position: relative;
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 1rem;
    height: 1rem;
  }

  .glyph {
    display: inline-grid;
    color: var(--muted);
  }

  .glyph :global(svg) {
    width: 1rem;
    height: 1rem;
    mask: radial-gradient(
      circle at calc(100% - 0.125rem) calc(100% - 0.125rem),
      transparent 0.3rem,
      #000 calc(0.3rem + 0.5px)
    );
  }

  :global([data-current]) .glyph,
  :global([aria-current='page']) .glyph {
    color: var(--text);
  }

  /* Новый статус оседает в узле: точка коротко вырастает — видно, что публикация или снятие произошли. */
  .status-node {
    position: absolute;
    right: -0.125rem;
    bottom: -0.125rem;
    width: 0.5rem;
    height: 0.5rem;
    border-width: 0.09375rem;
    animation: glyph-settle 360ms var(--ease);
  }

  @keyframes glyph-settle {
    from {
      transform: scale(1.8);
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-node {
      animation: none;
    }
  }
</style>
