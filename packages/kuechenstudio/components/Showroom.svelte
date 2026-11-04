<!-- @component
Dunkles Band „Küchen aus unserer Ausstellung“: links kleine Zeile, Überschrift, Linie, Text und Knopf, rechts die Küchen als Karten mit Namen, im Hintergrund feine Linien einer Küchenansicht.
-->
<script lang="ts">
import KitchenGrid from '$components/KitchenGrid';
import Sketch from '$components/Sketch';
import { link } from '$core';

let {
  /** Bereich mit den Küchen: ID der Seite */
  parent = null,
  /** Wie viele Küchen; 0 — alle */
  count = 4,
  /** Kleine Zeile über der Überschrift */
  eyebrow = 'Ausstellung',
  /** Überschrift */
  title = 'Küchen aus unserer Ausstellung',
  /** Text */
  text = '',
  /** Text des Knopfs zur Seite mit allen Küchen */
  button = 'Alle Küchen ansehen',
}: {
  parent?: number | null;
  count?: number;
  eyebrow?: string;
  title?: string;
  text?: string;
  button?: string;
} = $props();

const url = $derived(parent ? link(parent) : null);
</script>

<section class="showroom dark" aria-labelledby="showroom-title">
  <div class="lines" aria-hidden="true"><Sketch motif="zeile" plain /></div>
  <div class="container grid">
    <div class="copy">
      {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
      <h2 id="showroom-title">{title}</h2>
      <span class="rule" aria-hidden="true"></span>
      {#if text}<p>{text}</p>{/if}
      {#if url}<a class="pill" href={url}>{button}</a>{/if}
    </div>
    <div class="kitchens"><KitchenGrid {parent} {count} layout="cards" /></div>
  </div>
</section>

<style>
  .showroom {
    position: relative;
    overflow: hidden;
    padding: var(--section) 0;
    isolation: isolate;
  }

  /* Linien einer Küchenansicht, kaum sichtbar und zum Text hin ausgeblendet. */
  .lines {
    position: absolute;
    inset: auto -4% -6% 18%;
    z-index: -1;
    color: rgb(255 255 255 / 0.12);
    -webkit-mask-image: linear-gradient(to right, transparent, #000 35%);
    mask-image: linear-gradient(to right, transparent, #000 35%);
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 2fr);
    align-items: center;
    gap: 3rem clamp(2.5rem, 1rem + 4vw, 5rem);
  }

  h2 {
    max-width: 14ch;
    margin: 0;
    font-size: clamp(2rem, 1.5rem + 1.6vw, 2.75rem);
  }

  p {
    max-width: 30rem;
    margin: 0 0 2rem;
    color: var(--on-slate-2);
  }

  @media (max-width: 64rem) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .lines {
      inset: auto -10% -4% -10%;
    }
  }
</style>
