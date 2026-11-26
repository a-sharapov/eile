<script lang="ts">
import { icons } from '#lib/icons.ts';
import { type CellState, STATE_MARKS } from './quality.ts';

// Значок состояния: ✓ ! ✕ – знаком, снятое вручную — галочка в круге (SVG): в мелкой ячейке она узнаётся и в
// тёмной теме, а форма отличает её от «в порядке» и «сбоя» без цвета. Для читалки скрыт — смысл несёт подпись.
let { state }: { state: CellState } = $props();
</script>

<span class="glyph" class:icon={state === 'resolved'} aria-hidden="true">{#if state === 'resolved'}{@html icons.resolved}{:else}{STATE_MARKS[state].symbol}{/if}</span>

<style>
  .glyph.icon {
    display: inline-grid;
    place-items: center;
  }

  .glyph :global(svg) {
    width: 1.15em;
    height: 1.15em;
    stroke-width: 2.25;
  }
</style>
