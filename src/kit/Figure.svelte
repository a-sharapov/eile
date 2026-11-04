<!-- @component
Картинка из медиатеки в тексте страницы, с подписью и ссылкой. Уменьшенные копии для srcset сервер делает
сам; файла в медиатеке нет — блок пуст.
-->
<script lang="ts">
import { image, link } from '$core';

let {
  /** Картинка: путь в медиатеке, например uploads/2024/05/kitchen.jpg */
  src,
  /** Описание для читалок; пусто — описание из медиатеки */
  alt = '',
  /** Подпись под картинкой */
  caption = '',
  /** Ссылка: id страницы или адрес */
  href = '',
  /** Ширина: text=По колонке текста, small=Небольшая, wide=Шире текста */
  size = 'text',
}: {
  src: string;
  alt?: string;
  caption?: string;
  href?: number | string;
  size?: 'text' | 'small' | 'wide';
} = $props();

const picture = $derived(src ? image(src) : null);
// id страницы — её текущий адрес, куда бы её ни перенесли.
const target = $derived(
  typeof href === 'number' ? link(href) : href === '' ? null : href
);
const sizes = $derived(
  size === 'small'
    ? '(min-width: 40rem) 20rem, 100vw'
    : size === 'wide'
      ? '100vw'
      : '(min-width: 48rem) 45rem, 100vw'
);
</script>

{#snippet photo(set: { src: string; srcset: string; width: number | null; height: number | null; alt: string })}
  <img
    src={set.src}
    srcset={set.srcset || undefined}
    {sizes}
    width={set.width}
    height={set.height}
    alt={alt || set.alt}
    loading="lazy"
    decoding="async"
  />
{/snippet}

{#if picture}
  <figure class="figure {size}">
    {#if target}
      <a href={target}>{@render photo(picture)}</a>
    {:else}
      {@render photo(picture)}
    {/if}
    {#if caption}<figcaption>{caption}</figcaption>{/if}
  </figure>
{/if}

<style>
  .figure {
    margin: 1.5em 0;
  }

  .small {
    max-width: 20rem;
  }

  .wide {
    margin-inline: clamp(-6rem, -8vw, 0rem);
  }

  img {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 0.25rem;
  }

  figcaption {
    margin-top: 0.5em;
    color: var(--t-muted, #5b6472);
    font-size: 0.875em;
  }
</style>
