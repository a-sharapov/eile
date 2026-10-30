<!-- @component
Обложка товара или раздела: картинка из медиатеки, а без неё — плашка в тон сайта с названием крупно.
Тон плашки выбирается по названию: у каждого товара свой и не меняется. Шесть тонов задаёт рамка сайта
переменными `--plate-0…5` и `--plate-ink-0…5`.
-->
<script lang="ts">
import { image } from '$core';

let {
  /** Название: подпись картинки и текст плашки */
  title,
  /** Картинка из медиатеки; пусто — плашка */
  src = null,
  /** Пропорции: 4/5=Портрет, 1/1=Квадрат, 4/3=Пейзаж */
  ratio = '4/5',
  /** Ширина на странице для выбора размера картинки */
  sizes = '(min-width: 64rem) 25vw, 50vw',
  /** Грузить сразу, а не при прокрутке: для первого экрана */
  eager = false,
}: {
  title: string;
  src?: string | null;
  ratio?: '4/5' | '1/1' | '4/3';
  sizes?: string;
  eager?: boolean;
} = $props();

const picture = $derived(typeof src === 'string' && src ? image(src) : null);
const tone = $derived(
  [...title].reduce((sum, _) => sum + (_.codePointAt(0) ?? 0), 0) % 6
);
</script>

{#if picture}
  <img
    class="cover"
    style:aspect-ratio={ratio}
    src={picture.src}
    srcset={picture.srcset || undefined}
    {sizes}
    width={picture.width}
    height={picture.height}
    alt={picture.alt}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
  />
{:else}
  <div
    class="cover plate"
    style:aspect-ratio={ratio}
    style:--bg="var(--plate-{tone}, color-mix(in oklab, var(--t-accent, #888) {12 + tone * 4}%, var(--t-surface, #fff)))"
    style:--ink="var(--plate-ink-{tone}, color-mix(in oklab, var(--t-accent, #444) 75%, #000))"
    role="img"
    aria-label={title}
  >
    <span aria-hidden="true">{title}</span>
  </div>
{/if}

<style>
  .cover {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--cover-radius, var(--t-radius, 0.375rem));
    object-fit: cover;
  }

  /* Название растёт с плашкой: единицы контейнера, а не окна. */
  .plate {
    container-type: inline-size;
    display: flex;
    align-items: flex-end;
    box-sizing: border-box;
    padding: 9%;
    overflow: hidden;
    background: var(--bg);
    color: var(--ink);
  }

  .plate span {
    max-width: 100%;
    font-family: var(--plate-font, inherit);
    font-size: clamp(1.125rem, 12cqi, 3.75rem);
    font-weight: var(--plate-weight, 700);
    line-height: 0.98;
    letter-spacing: -0.03em;
    overflow-wrap: anywhere;
    hyphens: auto;
    text-wrap: balance;
  }
</style>
