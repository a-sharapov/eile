<!-- @component
Bild aus der Mediathek mit Bildunterschrift; die Größen für srcset macht der Server.
-->
<script lang="ts">
import { image } from '$core';

let {
  /** Bild aus der Mediathek */
  src = '',
  /** Bildunterschrift */
  caption = '',
}: {
  src?: string;
  caption?: string;
} = $props();

const picture = $derived(src ? image(src) : null);
</script>

{#if picture}
  <figure>
    <img
      src={picture.src}
      srcset={picture.srcset || undefined}
      sizes="(min-width: 48rem) 44rem, 100vw"
      width={picture.width}
      height={picture.height}
      alt={picture.alt}
      loading="lazy"
      decoding="async"
    />
    {#if caption}<figcaption>{caption}</figcaption>{/if}
  </figure>
{/if}

<style>
  figure {
    margin: 2rem 0;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 0.5rem;
  }
  figcaption {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #5c5c5c;
  }
</style>
