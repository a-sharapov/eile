<!-- @component
Обложка работы: картинка из поля, а пока её нет — цветная плашка с названием. Цвет плашки постоянный у
каждой работы.
-->
<script lang="ts">
import { image } from '$core';

let {
  /** Работа: страница с полем cover */
  work,
  /** Пропорции: wide=Широкая 16:9, card=Карточка 4:3 */
  shape = 'card',
  /** Ширина картинки на странице для srcset */
  sizes = '(min-width: 48rem) 50vw, 100vw',
}: {
  work: { id: number; title: string; fields: Record<string, unknown> };
  shape?: 'wide' | 'card';
  sizes?: string;
} = $props();

// Тона плашек: тёплые и приглушённые, текст на каждом — свой, контрастный.
const _TINTS = [
  { bg: '#d8cab6', fg: '#33281c' },
  { bg: '#b7c3ad', fg: '#202b1b' },
  { bg: '#b6c0ce', fg: '#1b2534' },
  { bg: '#d6b5a4', fg: '#3a1d12' },
  { bg: '#c7bdd2', fg: '#271e33' },
  { bg: '#262624', fg: '#ecebe7' },
];

const picture = $derived(
  typeof work.fields.cover === 'string' && work.fields.cover
    ? image(work.fields.cover)
    : null
);
const tint = $derived(_TINTS[work.id % _TINTS.length] ?? _TINTS[0]);
</script>

{#if picture}
  <img
    class="cover {shape}"
    src={picture.src}
    srcset={picture.srcset || undefined}
    {sizes}
    width={picture.width}
    height={picture.height}
    alt={picture.alt}
    loading="lazy"
    decoding="async"
  />
{:else}
  <div class="cover plate {shape}" style:--bg={tint.bg} style:--fg={tint.fg} aria-hidden="true">
    <span>{work.title}</span>
  </div>
{/if}

<style>
  .cover {
    display: block;
    width: 100%;
    height: auto;
    object-fit: cover;
  }

  .card {
    aspect-ratio: 4 / 3;
  }

  .wide {
    aspect-ratio: 16 / 9;
  }

  .plate {
    container-type: inline-size;
    display: flex;
    align-items: end;
    box-sizing: border-box;
    padding: clamp(1rem, 3%, 2rem);
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
  }

  span {
    max-width: 14ch;
    font-size: clamp(1.75rem, 8cqi, 5rem);
    font-weight: 750;
    line-height: 0.98;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .wide span {
    font-size: clamp(2.5rem, 7cqi, 7rem);
  }
</style>
