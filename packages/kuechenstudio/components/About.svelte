<!-- @component
Abschnitt „Unser Studio“: großes Foto auf der einen Seite, auf der anderen kleine Zeile, Überschrift, Linie, Einleitung, Text, die Angaben des Studios (seit, Handwerk, Bewertungen) und ein Knopf. Foto aus dem Parameter image oder dem Feld „Foto: Unser Studio“ der Seite.
-->
<script lang="ts">
import Picture from '$components/Picture';
import Studio, { filled, trust } from '$components/Studio';
import { current, link } from '$core';

let {
  /** Kleine Zeile über der Überschrift */
  eyebrow = 'Unser Studio',
  /** Überschrift */
  title = '',
  /** Einleitung, etwas größer */
  lead = '',
  /** Text */
  text = '',
  /** Seite für den Knopf: ID */
  link: target = null,
  /** Text des Knopfs */
  button = 'Mehr über uns',
  /** Foto: Pfad in der Mediathek; leer — Feld aboutImage der Seite */
  image = '',
}: {
  eyebrow?: string;
  title?: string;
  lead?: string;
  text?: string;
  link?: number | null;
  button?: string;
  image?: string;
} = $props();

const page = current();
const photo = $derived(
  image ||
    (typeof page?.fields.aboutImage === 'string' ? page.fields.aboutImage : '')
);
const photoFocus = $derived(page?.fields.aboutFocus);
const url = $derived(target ? link(target) : null);
const facts = trust();
// Angaben des Studios: öffentlich nur ausgefüllte, der Inhaber sieht die Platzhalter.
const items = [
  { label: 'Seit', value: facts.since },
  { label: '', value: facts.craft },
];
</script>

<section class="about" aria-labelledby="about-title">
  <div class="container grid">
    <div class="picture">
      <Picture path={photo} focus={photoFocus} motif="laden" shape="card" sizes="(min-width: 75rem) 38rem, (min-width: 56rem) 50vw, calc(100vw - 2.5rem)" />
    </div>
    <div class="copy">
      {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
      <h2 id="about-title">{title}</h2>
      <span class="rule" aria-hidden="true"></span>
      {#if lead}<p class="lead">{lead}</p>{/if}
      {#if text}<p class="text"><Studio value={text} quiet /></p>{/if}
      <ul class="facts">
        {#each items as item, index (index)}
          <li hidden={!filled(item.value)} data-owner={filled(item.value) ? undefined : ''}>
            {#if item.label}{item.label}{' '}{/if}<Studio value={item.value} />
          </li>
        {/each}
        {#if facts.reviews}
          <li><a href={facts.reviews} target="_blank" rel="noopener">Bewertungen lesen<span class="sr-only"> (öffnet in neuem Fenster)</span></a></li>
        {:else}
          <li hidden data-owner><Studio value="[Link zu Ihren Bewertungen: reviewsLink]" /></li>
        {/if}
      </ul>
      {#if url}<a class="pill" href={url}>{button}</a>{/if}
    </div>
  </div>
</section>

<style>
  .about {
    padding: var(--section) 0;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    align-items: center;
    gap: 3rem clamp(3rem, 1rem + 5vw, 6rem);
  }

  h2 {
    margin: 0;
    font-size: clamp(2rem, 1.5rem + 1.8vw, 3rem);
  }

  .lead {
    max-width: 30rem;
    margin: 0 0 1rem;
    font-family: var(--display);
    font-size: clamp(1.25rem, 1.1rem + 0.5vw, 1.5rem);
    line-height: 1.35;
  }

  .text {
    max-width: 34rem;
    margin: 0 0 1.5rem;
    color: var(--ink-2);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.75rem;
    margin: 0 0 2rem;
    padding: 0;
    list-style: none;
    font-weight: 600;
  }

  .facts:not(:has(li:not([hidden]))) {
    display: none;
  }

  :global(body:has(> script[data-eile-bar])) .facts,
  :global(body:has(> script[data-eile-bar])) .facts li[hidden] {
    display: flex;
  }

  .facts li:not([hidden]) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .facts li::before {
    content: '';
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--accent);
  }

  @media (max-width: 56rem) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
