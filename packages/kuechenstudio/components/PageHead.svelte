<!-- @component
Kopf einer inneren Seite auf hellgrauem Grund: kleine Zeile darüber (optional), Überschrift, kurze Linie in der Akzentfarbe, Einleitung.
-->
<script lang="ts">
import type { Snippet } from 'svelte';

let {
  /** Überschrift */
  title,
  /** Einleitung unter der Überschrift */
  lead = '',
  /** Kleine Zeile über der Überschrift, z. B. der Bereich */
  eyebrow = '',
  children,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
  children?: Snippet;
} = $props();
</script>

<div class="head">
  <div class="container">
    {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
    <h1>{title}</h1>
    <span class="rule" aria-hidden="true"></span>
    {#if lead}<p class="lead">{lead}</p>{/if}
    {#if children}{@render children()}{/if}
  </div>
</div>

<style>
  .head {
    padding: clamp(3rem, 2rem + 3.5vw, 5.5rem) 0 clamp(2.75rem, 2rem + 2.5vw, 4.5rem);
    background: var(--mist);
  }

  h1 {
    max-width: 22ch;
    margin: 0;
    font-size: clamp(2.25rem, 1.6rem + 2.6vw, 3.75rem);
    line-height: 1.06;
  }

  .lead {
    max-width: 40rem;
    margin: 0;
    color: var(--ink-2);
    font-size: clamp(1.125rem, 1.05rem + 0.3vw, 1.3125rem);
    line-height: 1.55;
  }
</style>
