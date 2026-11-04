<!-- @component
Скриншот менеджера из медиатеки: `screens/<имя>-light.webp` и `-dark.webp`. Видна картинка под тему сайта
(переключатель в шапке, иначе системная), ширину браузер берёт из уменьшенных копий, на телефоне — кадр `<имя>-m-…`.
С `title` снимок стоит в окне (Window); без него окно рисует тот, кто вставил снимок.
-->
<script lang="ts">
import Window from '$components/Window';
import { image } from '$core';

let {
  /** Имя скриншота: editor, overview */
  name = 'editor',
  /** Описание для читалки экрана */
  alt = '',
  /** Грузить сразу — для первого экрана */
  eager = false,
  /** Ширина снимка на странице для выбора копии: по умолчанию — широкая колонка сайта */
  sizes = '(min-width: 80rem) 76rem, calc(94vw - 1rem)',
  /** Заголовок окна вокруг снимка; пусто — без окна */
  title = '',
}: {
  name?: string;
  alt?: string;
  eager?: boolean;
  sizes?: string;
  title?: string;
} = $props();

const light = image(`screens/${name}-light.webp`);
const dark = image(`screens/${name}-dark.webp`);
const phoneLight = image(`screens/${name}-m-light.webp`);
const phoneDark = image(`screens/${name}-m-dark.webp`);
const _PHONE = '(max-width: 34rem)';
const set = (_: NonNullable<typeof light>): string =>
  [_.srcset, `${_.src} ${_.width}w`].filter(Boolean).join(', ');
</script>

{#snippet pictures()}
  <div class="shot">
    <picture class="light">
      {#if phoneLight}
        <source media={_PHONE} srcset={phoneLight.src} width={phoneLight.width} height={phoneLight.height} />
      {/if}
      <img
        src={light.src}
        srcset={set(light)}
        {sizes}
        width={light.width}
        height={light.height}
        alt={alt || light.alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchpriority={eager ? 'high' : undefined}
        decoding="async"
      />
    </picture>
    {#if dark}
      <picture class="dark">
        {#if phoneDark}
          <source media={_PHONE} srcset={phoneDark.src} width={phoneDark.width} height={phoneDark.height} />
        {/if}
        <img
          src={dark.src}
          srcset={set(dark)}
          {sizes}
          width={dark.width}
          height={dark.height}
          alt={alt || dark.alt}
          loading={eager ? 'eager' : 'lazy'}
          fetchpriority={eager ? 'high' : undefined}
          decoding="async"
        />
      </picture>
    {/if}
  </div>
{/snippet}

{#if light}
  {#if title}
    <Window {title}>{@render pictures()}</Window>
  {:else}
    {@render pictures()}
  {/if}
{/if}

<style>
  .shot,
  picture {
    display: block;
  }

  /* Тема — выбранная на сайте, иначе системная. Тёмного варианта нет — светлый остаётся. */
  .dark {
    display: none;
  }

  :global(:root[data-theme='dark']) .dark {
    display: block;
  }

  :global(:root[data-theme='dark']) .shot:has(.dark) .light {
    display: none;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .dark {
      display: block;
    }

    :global(:root:not([data-theme='light'])) .shot:has(.dark) .light {
      display: none;
    }
  }

  /* Рамку, скругление и тень даёт окно. */
  img {
    display: block;
    width: 100%;
    height: auto;
    background: var(--bg);
  }
</style>
