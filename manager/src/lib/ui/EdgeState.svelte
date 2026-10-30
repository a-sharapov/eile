<script lang="ts">
import type { Snippet } from 'svelte';
import SiteSketch from './SiteSketch.svelte';

let {
  kind,
  title,
  text,
  actions,
  heading = 'h1',
}: {
  kind: 'missing' | 'forbidden' | 'broken';
  title: string;
  text: string;
  actions?: Snippet;
  /** h1 — экран сам по себе (ошибка, нет доступа); h2 — внутри страницы со своим h1. */
  heading?: 'h1' | 'h2';
} = $props();
</script>

<!-- Крайние состояния говорят тем же языком, что дерево: чего нет и что с этим сделать. -->
<section class="edge" aria-labelledby="edge-title">
  <div class="art"><SiteSketch {kind} /></div>
  <svelte:element this={heading} id="edge-title">{title}</svelte:element>
  <p>{text}</p>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</section>

<style>
  .edge {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    max-width: 30rem;
    margin: clamp(2rem, 10vh, 6rem) 0 3rem;
  }

  .art {
    width: 11rem;
    margin-bottom: 0.75rem;
  }

  :is(h1, h2) {
    font-size: 1.625rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: -0.025em;
  }

  p {
    margin: 0;
    color: var(--muted);
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
</style>
