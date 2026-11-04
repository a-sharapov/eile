<!-- @component
Foto aus der Mediathek in festem Seitenverhältnis: das Bild füllt den Rahmen (object-fit: cover), der Ausschnitt folgt dem Feld „Bildausschnitt“. Ohne Foto eine ruhige Strichzeichnung der Küche — oder, mit collapse, gar nichts für Besucher und ein Hinweis für den Inhaber.
-->
<script lang="ts">
import Sketch from '$components/Sketch';
import { focus as focusOf } from '$components/Studio';
import { image } from '$core';

let {
  /** Foto: Pfad in der Mediathek */
  path = '',
  /** Zeichnung ohne Foto: zeile, grifflos, landhaus, insel, kompakt, laden, luecke */
  motif = 'zeile',
  /** Beschreibung des Fotos; leer — Beschreibung aus der Mediathek */
  alt = '',
  /** Seitenverhältnis: wide=16:9, photo=3:2, card=4:3, tall=4:5, portrait=3:4, fill=so groß wie der Platz */
  shape = 'photo',
  /** Bildausschnitt: oben, mitte, unten, links, rechts */
  focus = 'mitte',
  /** Breite auf der Seite für srcset */
  sizes = '100vw',
  /** Oben auf der Seite: sofort laden */
  first = false,
  /** Ohne Foto: für Besucher nichts zeigen, nur dem Inhaber den Platz */
  collapse = false,
  /** Grund der Zeichnung: light=hell, dark=Schiefergrau */
  tone = 'light',
}: {
  path?: unknown;
  motif?:
    | 'zeile'
    | 'grifflos'
    | 'landhaus'
    | 'insel'
    | 'kompakt'
    | 'laden'
    | 'luecke';
  alt?: string;
  shape?: 'wide' | 'photo' | 'card' | 'tall' | 'portrait' | 'fill';
  focus?: unknown;
  sizes?: string;
  first?: boolean;
  collapse?: boolean;
  tone?: 'light' | 'dark';
} = $props();

const picture = $derived(typeof path === 'string' && path ? image(path) : null);
</script>

{#if picture}
  <figure class="frame {shape}">
    <img
      src={picture.src}
      srcset={picture.srcset || undefined}
      {sizes}
      width={picture.width}
      height={picture.height}
      alt={alt || picture.alt}
      loading={first ? 'eager' : 'lazy'}
      fetchpriority={first ? 'high' : undefined}
      decoding="async"
      style:object-position={focusOf(focus)}
    />
  </figure>
{:else if collapse}
  <figure class="frame {shape} empty" hidden data-owner>
    <figcaption>Hier steht Ihr Foto. Laden Sie es im Feld „Foto“ dieser Seite hoch; bis dahin bleibt der Platz für Besucher leer.</figcaption>
  </figure>
{:else}
  <figure class="frame {shape} drawn {tone}">
    <div class="drawing"><Sketch {motif} plain /></div>
  </figure>
{/if}

<style>
  .frame {
    position: relative;
    margin: 0;
    overflow: hidden;
    border-radius: var(--radius, 0.375rem);
    background: var(--mist, #f4f4f2);
  }

  .wide {
    aspect-ratio: 16 / 9;
  }

  .photo {
    aspect-ratio: 3 / 2;
  }

  .card {
    aspect-ratio: 4 / 3;
  }

  .tall {
    aspect-ratio: 4 / 5;
  }

  .portrait {
    aspect-ratio: 3 / 4;
  }

  .fill {
    position: absolute;
    inset: 0;
    border-radius: 0;
  }

  /* Das Bild bestimmt nie die Höhe: es liegt im Rahmen und füllt ihn. */
  img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Ohne Foto: feine Linien einer Küchenansicht auf ruhigem Grund. */
  .drawn {
    color: rgb(38 43 49 / 0.34);
  }

  .drawn.dark {
    background: var(--slate, #3a4049);
    color: rgb(255 255 255 / 0.32);
  }

  .drawing {
    position: absolute;
    inset: 12% 10%;
    display: grid;
    place-items: center;
  }

  .drawing :global(.sketch) {
    max-height: 100%;
  }

  .empty {
    place-items: center;
    padding: 1.5rem;
    border: 0.125rem dashed #8a7a5c;
    background: #f3eee4;
    color: var(--ink, #262b31);
    font-size: 0.9375rem;
    text-align: center;
  }

  :global(body:has(> script[data-eile-bar])) .empty[hidden] {
    display: grid;
  }

  @media (max-width: 40rem) {
    .wide {
      aspect-ratio: 4 / 3;
    }
  }
</style>
