<!-- @component
Галерея из медиатеки: картинки плиткой, у каждой — уменьшенные копии для srcset. Файлов, которых в
медиатеке нет, галерея не показывает.
-->
<script lang="ts">
import { image } from '$core';

let {
  /** Картинки: пути в медиатеке через запятую */
  images,
  /** Колонок на широком экране, от 2 до 4 */
  columns = 3,
  /** Подпись под галереей */
  caption = '',
}: {
  images: string;
  columns?: number;
  caption?: string;
} = $props();

const pictures = $derived(
  images
    .split(',')
    .map((_) => _.trim())
    .filter(Boolean)
    .map((_) => image(_))
    .filter((_) => _ !== null)
);
const count = $derived(Math.min(4, Math.max(2, Math.round(columns))));
</script>

{#if pictures.length > 0}
  <figure class="gallery" style:--columns={count}>
    <div class="grid">
      {#each pictures as picture (picture.src)}
        <img
          src={picture.src}
          srcset={picture.srcset || undefined}
          sizes="(min-width: 48rem) {Math.round(45 / count)}rem, 50vw"
          width={picture.width}
          height={picture.height}
          alt={picture.alt}
          loading="lazy"
          decoding="async"
        />
      {/each}
    </div>
    {#if caption}<figcaption>{caption}</figcaption>{/if}
  </figure>
{/if}

<style>
  .gallery {
    margin: 1.5em 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  @media (min-width: 48rem) {
    .grid {
      grid-template-columns: repeat(var(--columns), 1fr);
    }
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 0.25rem;
  }

  figcaption {
    margin-top: 0.5em;
    color: var(--t-muted, #5b6472);
    font-size: 0.875em;
  }
</style>
